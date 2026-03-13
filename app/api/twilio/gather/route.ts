/**
 * Twilio Speech Gather Callback
 *
 * POST /api/twilio/gather
 *
 * Called by Twilio after <Gather input="speech"> completes.
 * Receives transcribed speech, processes with LLM, returns TwiML with AI response.
 *
 * Cost optimizations:
 * - LLM response cache (skip LLM for repeated questions)
 * - Turn limit (max 8 turns per call)
 * - Consecutive silence detection (3 silent gathers → hangup)
 * - Call duration limit (10 minutes hard cap)
 * - TTS text optimization (strip emoji/markdown, truncate)
 * - Tenant config cache (avoid Firestore reads per turn)
 *
 * Flow:
 * 1. Receive speech transcription from Twilio
 * 2. Check turn limit, duration limit, silence count
 * 3. Detect intent (fast path)
 * 4. Check response cache → generate LLM response on miss
 * 5. Optimize text for TTS
 * 6. Return TwiML: <Say> AI response + <Gather> for next turn
 *
 * Query params: tenantId, callSid
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { generateResponseAndGatherTwiML, generateUnavailableTwiML, validateTwilioSignature, getTwilioConfig } from '@/lib/twilio/telephony';
import { detectIntentFast, shouldShortcut, getShortcutResponse } from '@/lib/ai/intent-fast';
import { generateWithFallback } from '@/lib/ai/llm-fallback-chain';
import { sendWebhook } from '@/lib/n8n/client';
import { getResponseCache, buildCacheKey } from '@/lib/ai/response-cache';
import { optimizeForPhoneTTS } from '@/lib/twilio/text-optimizer';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('twilio:gather');

export const dynamic = 'force-dynamic';

// ─── Call Safety Limits ─────────────────────────────────────────────────────
const MAX_GATHER_TURNS = 8;            // Max 8 conversation turns per call
const MAX_CONSECUTIVE_SILENCE = 3;     // 3 silent gathers → auto-hangup
const MAX_CALL_DURATION_SEC = 600;     // 10 minutes hard limit

// ─── Tenant Config Cache (avoids Firestore reads per turn) ──────────────────
const tenantConfigCache = new Map<string, { data: FirebaseFirestore.DocumentData; fetchedAt: number }>();
const agentConfigCache = new Map<string, { data: FirebaseFirestore.DocumentData | null; fetchedAt: number }>();
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedTenantData(tenantId: string): FirebaseFirestore.DocumentData | null {
    const cached = tenantConfigCache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CONFIG_CACHE_TTL) return cached.data;
    return null;
}

function setCachedTenantData(tenantId: string, data: FirebaseFirestore.DocumentData): void {
    tenantConfigCache.set(tenantId, { data, fetchedAt: Date.now() });
    if (tenantConfigCache.size > 200) {
        const firstKey = tenantConfigCache.keys().next().value;
        if (firstKey) tenantConfigCache.delete(firstKey);
    }
}

function getCachedAgentData(key: string): FirebaseFirestore.DocumentData | null | undefined {
    const cached = agentConfigCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CONFIG_CACHE_TTL) return cached.data;
    return undefined; // undefined = cache miss, null = no agent found
}

function setCachedAgentData(key: string, data: FirebaseFirestore.DocumentData | null): void {
    agentConfigCache.set(key, { data, fetchedAt: Date.now() });
    if (agentConfigCache.size > 200) {
        const firstKey = agentConfigCache.keys().next().value;
        if (firstKey) agentConfigCache.delete(firstKey);
    }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkGatherRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

// Cleanup stale entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap) {
        if (val.resetAt < now) rateLimitMap.delete(key);
    }
}, 120_000);

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
    const reqStart = Date.now();

    try {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        if (!checkGatherRateLimit(ip)) {
            const twiml = generateUnavailableTwiML({ message: 'Çok fazla istek. Lütfen bekleyin.' });
            return new NextResponse(twiml, { status: 429, headers: { 'Content-Type': 'text/xml' } });
        }

        const contentType = request.headers.get('content-type') || '';
        let params: Record<string, string> = {};

        // Parse Twilio form-encoded body
        if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            formData.forEach((value, key) => { params[key] = String(value); });
        } else {
            params = await request.json();
        }

        // Validate Twilio signature — mandatory in production
        const config = getTwilioConfig();
        const signature = request.headers.get('x-twilio-signature') || '';
        if (config.authToken) {
            if (!validateTwilioSignature(config.authToken, request.url, params, signature)) {
                console.error('[twilio/gather] Invalid Twilio signature — rejecting');
                const twiml = generateUnavailableTwiML({ message: 'Yetkisiz istek.' });
                return new NextResponse(twiml, { status: 403, headers: { 'Content-Type': 'text/xml' } });
            }
        } else if (process.env.NODE_ENV === 'production') {
            console.error('[twilio/gather] TWILIO_AUTH_TOKEN not configured in production');
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Sistem hatası.' }),
                { headers: { 'Content-Type': 'text/xml' } },
            );
        }

        // Get query params
        const tenantId = request.nextUrl.searchParams.get('tenantId');
        const callSid = request.nextUrl.searchParams.get('callSid');
        const agentIdParam = request.nextUrl.searchParams.get('agentId');

        if (!tenantId || !callSid) {
            return new NextResponse(
                generateUnavailableTwiML({ message: 'Bir hata oluştu. Lütfen tekrar arayın.' }),
                { headers: { 'Content-Type': 'text/xml' } }
            );
        }

        // Extract speech result from Twilio — sanitize input
        const speechResult = (params.SpeechResult || '').trim().slice(0, 500);
        const confidence = parseFloat(params.Confidence || '0');

        const rlog = log.child({ requestId, callSid, tenantId, agentId: agentIdParam || undefined });
        rlog.info('gather:start', { speechLength: speechResult.length, confidence, hasSpeech: !!speechResult });

        // Build gather URL once (used in multiple places)
        const host = request.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const gatherUrl = `${protocol}://${host}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}${agentIdParam ? `&agentId=${agentIdParam}` : ''}`;

        if (!speechResult) {
            // ── Consecutive Silence Detection ────────────────────────────
            // Track silent gathers; after MAX_CONSECUTIVE_SILENCE → auto-hangup
            let silenceCount = 0;
            try {
                const silenceDoc = await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('calls').doc(callSid)
                    .get();
                silenceCount = (silenceDoc.data()?.consecutiveSilence || 0) + 1;

                await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('calls').doc(callSid)
                    .update({ consecutiveSilence: silenceCount });
            } catch { /* ignore — best-effort tracking */ }

            if (silenceCount >= MAX_CONSECUTIVE_SILENCE) {
                rlog.warn('zombie:silence_hangup', { silenceCount, elapsed: Date.now() - reqStart });
                const endMsg = 'Görüşüyor olduğunuzdan emin değiliz. Bizi tekrar arayabilirsiniz. İyi günler!';
                const twiml = generateResponseAndGatherTwiML({
                    gatherUrl,
                    aiResponse: endMsg,
                    shouldHangup: true,
                });
                return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
            }

            rlog.debug('silence', { silenceCount });
            const twiml = generateResponseAndGatherTwiML({
                gatherUrl,
                aiResponse: 'Sizi duyamadım. Lütfen tekrar söyler misiniz?',
            });
            return new NextResponse(twiml, {
                headers: { 'Content-Type': 'text/xml' },
            });
        }

        // Reset silence counter on successful speech (fire-and-forget)
        getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .update({ consecutiveSilence: 0 })
            .catch(() => {});

        // ── Load call document for turn & duration guards ────────────
        const callDoc = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .get();
        const callData = callDoc.data();
        const history = callData?.conversationHistory || [];
        const turnCount = Math.floor(history.length / 2);

        // ── Turn Limit Guard ─────────────────────────────────────────
        if (turnCount >= MAX_GATHER_TURNS) {
            rlog.warn('zombie:turn_limit', { turnCount, maxTurns: MAX_GATHER_TURNS });
            const endMsg = 'Aramanız için teşekkür ederiz. Başka sorularınız için tekrar arayabilirsiniz. İyi günler!';
            const twiml = generateResponseAndGatherTwiML({
                gatherUrl,
                aiResponse: endMsg,
                shouldHangup: true,
            });
            return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
        }

        // ── Duration Limit Guard ─────────────────────────────────────
        const startedAt = callData?.startedAt?.toDate?.() || callData?.startedAt;
        if (startedAt) {
            const elapsedSec = (Date.now() - new Date(startedAt).getTime()) / 1000;
            if (elapsedSec > MAX_CALL_DURATION_SEC) {
                rlog.warn('zombie:duration_limit', { elapsedSec: Math.round(elapsedSec), maxSec: MAX_CALL_DURATION_SEC });
                const endMsg = 'Uzun görüşmemiz için teşekkür ederiz. Başka sorularınız için tekrar arayabilirsiniz. İyi günler!';
                const twiml = generateResponseAndGatherTwiML({
                    gatherUrl,
                    aiResponse: endMsg,
                    shouldHangup: true,
                });
                return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
            }
        }

        // ── Load tenant config (cached) ──────────────────────────────
        let tenantData = getCachedTenantData(tenantId);
        const tenantCacheHit = !!tenantData;
        if (!tenantData) {
            const tenantSnap = await getDb().collection('tenants').doc(tenantId).get();
            tenantData = tenantSnap.data() || {};
            setCachedTenantData(tenantId, tenantData);
        }
        const language = tenantData?.language === 'en' ? 'en' : 'tr';

        // ── Load agent config (cached) ───────────────────────────────
        const agentCacheKey = agentIdParam ? `${tenantId}:${agentIdParam}` : `${tenantId}:_first_active`;
        let activeAgent: FirebaseFirestore.DocumentData | null = null;
        const cachedAgent = getCachedAgentData(agentCacheKey);
        const agentCacheHit = cachedAgent !== undefined;
        if (agentCacheHit) {
            activeAgent = cachedAgent;
        } else {
            try {
                if (agentIdParam) {
                    const agentDoc = await getDb()
                        .collection('tenants').doc(tenantId)
                        .collection('agents').doc(agentIdParam)
                        .get();
                    if (agentDoc.exists) {
                        activeAgent = agentDoc.data() || null;
                    }
                }
                if (!activeAgent) {
                    // Legacy fallback: find first active agent
                    const agentsSnap = await getDb()
                        .collection('tenants').doc(tenantId)
                        .collection('agents')
                        .where('isActive', '==', true)
                        .limit(1)
                        .get();
                    if (!agentsSnap.empty) {
                        activeAgent = agentsSnap.docs[0].data();
                    }
                }
            } catch { /* Fallback to tenant-level config */ }
            setCachedAgentData(agentCacheKey, activeAgent);
        }

        // 1. Fast intent detection
        const intent = detectIntentFast(speechResult);
        rlog.info('intent', { intent: intent.intent, confidence: intent.confidence, keywords: intent.detectedKeywords, lang: intent.language });

        // 2. Check for shortcut (greeting, farewell, thanks → skip LLM)
        let aiResponse: string;
        let shouldEndCall = false;
        let responseSource: 'shortcut' | 'cache' | 'llm' = 'llm';

        if (shouldShortcut(intent)) {
            aiResponse = getShortcutResponse(intent.intent, language);
            shouldEndCall = intent.intent === 'farewell';
            responseSource = 'shortcut';
        } else {
            // 3. Check response cache → call LLM only on miss
            const cache = getResponseCache();
            const cacheKey = buildCacheKey(tenantId, intent.intent, speechResult);
            const cachedResponse = cache.get(cacheKey);

            if (cachedResponse) {
                aiResponse = cachedResponse;
                responseSource = 'cache';
            } else {
                const llmStart = Date.now();
                aiResponse = await generateLLMResponse(speechResult, tenantData, tenantId, callSid, language, activeAgent, history);
                rlog.info('llm', { durationMs: Date.now() - llmStart, responseLength: aiResponse.length });
                // Store in cache for future calls (same tenant, same question)
                cache.set(cacheKey, aiResponse, intent.intent);
            }

            // Check if LLM suggests ending the call
            shouldEndCall = aiResponse.toLowerCase().includes('iyi günler') ||
                            aiResponse.toLowerCase().includes('hoşça kalın') ||
                            aiResponse.toLowerCase().includes('goodbye');
        }

        // 4. Optimize text for phone TTS
        const preOptLen = aiResponse.length;
        aiResponse = optimizeForPhoneTTS(aiResponse);
        const postOptLen = aiResponse.length;

        rlog.info('gather:done', {
            source: responseSource,
            turn: turnCount,
            configCache: { tenant: tenantCacheHit, agent: agentCacheHit },
            ttsOpt: preOptLen !== postOptLen ? { before: preOptLen, after: postOptLen } : 'no-change',
            shouldEnd: shouldEndCall,
            totalMs: Date.now() - reqStart,
        });

        // 5. Save conversation turn to Firestore
        await getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .update({
                conversationHistory: FieldValue.arrayUnion(
                    { role: 'user', content: speechResult, intent: intent.intent, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
                ),
                lastActivityAt: FieldValue.serverTimestamp(),
            });

        // 6. Fire n8n on_new_call webhook (fire-and-forget)
        sendWebhook('on_new_call', {
            tenantId,
            sessionId: callSid,
            arguments: {
                callSid,
                from: params.From || '',
                to: params.To || '',
                speechResult,
                intent: intent.intent,
                confidence,
            },
        }).catch(() => {});

        // 7. Build TwiML response
        const twiml = generateResponseAndGatherTwiML({
            gatherUrl,
            aiResponse,
            language: language === 'en' ? 'en-US' : 'tr-TR',
            shouldHangup: shouldEndCall,
        });

        return new NextResponse(twiml, {
            headers: { 'Content-Type': 'text/xml', 'x-request-id': requestId },
        });

    } catch (err) {
        log.error('gather:error', { requestId, error: err instanceof Error ? err.message : String(err), totalMs: Date.now() - reqStart });
        const fallback = generateUnavailableTwiML({
            message: 'Bir teknik sorun yaşıyoruz. Lütfen daha sonra tekrar arayın.',
        });
        return new NextResponse(fallback, {
            headers: { 'Content-Type': 'text/xml', 'x-request-id': requestId },
        });
    }
}

/**
 * Generate LLM response using shared fallback chain (OpenAI → Groq → Gemini).
 *
 * Accepts pre-loaded conversation history to avoid duplicate Firestore reads
 * (history is already loaded in POST handler for turn counting).
 */
async function generateLLMResponse(
    userMessage: string,
    tenantData: FirebaseFirestore.DocumentData | undefined,
    tenantId: string,
    callSid: string,
    language: string,
    activeAgent?: FirebaseFirestore.DocumentData | null,
    existingHistory?: Array<{ role: string; content: string }>,
): Promise<string> {
    try {
        let systemPrompt: string;

        if (activeAgent?.systemPrompt) {
            // Use agent's custom system prompt (from agents collection)
            // Resolve variables: replace {key} with defaultValue
            systemPrompt = activeAgent.systemPrompt;
            const variables = activeAgent.variables || [];
            for (const v of variables) {
                if (v.key && v.defaultValue) {
                    systemPrompt = systemPrompt.replace(
                        new RegExp(`\\{${v.key}\\}`, 'g'),
                        v.defaultValue,
                    );
                }
            }
            // Append phone-call rules if not already present
            if (!systemPrompt.includes('telefon görüşmesi')) {
                systemPrompt += `\n\nTelefon Görüşmesi Kuralları:
- Telefon için MAKSIMUM 2 cümle, toplamda 150 karakter
- ${language === 'tr' ? 'Türkçe konuş (müşteri İngilizce konuşursa İngilizce yanıt ver)' : 'Speak English unless the customer speaks Turkish'}
- Doğal ve samimi bir üslup kullan`;
            }
        } else {
            // Fallback: Build system prompt from tenant-level config
            const agentName = tenantData?.agent?.name || 'Asistan';
            const companyName = tenantData?.companyName || 'Şirket';
            const agentRole = tenantData?.agent?.role || 'Müşteri Temsilcisi';
            const traits = tenantData?.agent?.traits?.join(', ') || 'profesyonel, nazik';
            const services = tenantData?.business?.services?.join(', ') || '';
            const workingHours = tenantData?.business?.workingHours || '09:00-18:00';
            const workingDays = tenantData?.business?.workingDays || 'Pazartesi-Cuma';

            systemPrompt = `Sen ${companyName} şirketinin ${agentRole}'sin. İsmin ${agentName}.
Karakter özelliklerin: ${traits}.
${services ? `Sunduğun hizmetler: ${services}.` : ''}
Çalışma saatleri: ${workingDays}, ${workingHours}.

Kurallar:
- Telefon için MAKSIMUM 2 cümle, toplamda 150 karakter
- Türkçe konuş (müşteri İngilizce konuşursa İngilizce yanıt ver)
- Randevu, şikayet, bilgi talebi gibi işlemleri yönet
- Fiyat, kontrat detayı verme (sadece bilgi al, kaydet)
- Çözemediğin konularda müşteriye yetkili birine yönlendir
- Doğal ve samimi bir üslup kullan
- Müşterinin adını sor ve kullan`;
        }

        // Use pre-loaded history (avoids duplicate Firestore read)
        const chatHistory = (existingHistory || [])
            .slice(-6) // Last 3 turns
            .map((turn: { role: string; content: string }) => ({
                role: turn.role as 'user' | 'assistant',
                content: turn.content,
            }));

        // Use shared fallback chain (Groq → OpenAI → Gemini → graceful)
        const result = await generateWithFallback(
            [
                { role: 'system', content: systemPrompt },
                ...chatHistory,
                { role: 'user', content: userMessage },
            ],
            { maxTokens: 120, temperature: 0.3, language },
        );

        return result.text || 'Yanıt oluşturulamadı.';

    } catch {
        return language === 'tr'
            ? 'Bir aksaklık yaşıyoruz. Sizi yetkili bir temsilcimize aktarabilir miyim?'
            : 'We are experiencing an issue. May I transfer you to a representative?';
    }
}
