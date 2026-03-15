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

import { NextRequest, NextResponse, after } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { generateResponseAndGatherTwiML, generateUnavailableTwiML, validateTwilioSignature, getTwilioConfig } from '@/lib/twilio/telephony';
import { detectIntentFast, shouldShortcut, getShortcutResponse } from '@/lib/ai/intent-fast';
import { generateWithFallback } from '@/lib/ai/llm-fallback-chain';
import { sendWebhook } from '@/lib/n8n/client';
import { getResponseCache, buildCacheKey } from '@/lib/ai/response-cache';
import { optimizeForPhoneTTS } from '@/lib/twilio/text-optimizer';
import { isCartesiaConfigured, synthesizeCartesiaTTS } from '@/lib/voice/tts-cartesia';
import { cachePhoneAudio } from '@/lib/voice/phone-audio-cache';
import { streamLLMWithChunkedTTS } from '@/lib/voice/streaming-tts-pipeline';
import { localeBCP47 } from '@/lib/i18n/config';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('twilio:gather');

// ─── Multi-language helpers ─────────────────────────────────────────────────
type VoiceLang = 'tr' | 'en' | 'de' | 'fr';

/** Resolve tenant language to a valid voice pipeline language */
function resolveVoiceLang(tenantLang?: string): VoiceLang {
    if (tenantLang === 'en' || tenantLang === 'de' || tenantLang === 'fr') return tenantLang;
    return 'tr';
}

/** Language-aware voice messages for silence, turn limits, etc. */
const VOICE_MESSAGES: Record<VoiceLang, {
    silence: string;
    silenceHangup: string;
    turnLimit: string;
    durationLimit: string;
    error: string;
}> = {
    tr: {
        silence: 'Sizi duyamadım. Lütfen tekrar söyler misiniz?',
        silenceHangup: 'Görüşüyor olduğunuzdan emin değiliz. Bizi tekrar arayabilirsiniz. İyi günler!',
        turnLimit: 'Aramanız için teşekkür ederiz. Başka sorularınız için tekrar arayabilirsiniz. İyi günler!',
        durationLimit: 'Uzun görüşmemiz için teşekkür ederiz. Başka sorularınız için tekrar arayabilirsiniz. İyi günler!',
        error: 'Bir teknik sorun yaşıyoruz. Lütfen daha sonra tekrar arayın.',
    },
    en: {
        silence: 'I couldn\'t hear you. Could you please repeat?',
        silenceHangup: 'It seems we\'ve lost the connection. Please feel free to call us back. Have a great day!',
        turnLimit: 'Thank you for your call. Please call us again if you have more questions. Have a great day!',
        durationLimit: 'Thank you for the extended conversation. Please call again if you need more help. Have a great day!',
        error: 'We are experiencing a technical issue. Please try again later.',
    },
    de: {
        silence: 'Ich konnte Sie nicht hören. Könnten Sie das bitte wiederholen?',
        silenceHangup: 'Es scheint, als hätten wir die Verbindung verloren. Bitte rufen Sie uns gerne wieder an. Schönen Tag!',
        turnLimit: 'Vielen Dank für Ihren Anruf. Rufen Sie uns gerne wieder an. Auf Wiederhören!',
        durationLimit: 'Vielen Dank für das ausführliche Gespräch. Bitte rufen Sie bei weiteren Fragen erneut an. Auf Wiederhören!',
        error: 'Wir haben gerade ein technisches Problem. Bitte versuchen Sie es später erneut.',
    },
    fr: {
        silence: 'Je n\'ai pas pu vous entendre. Pourriez-vous répéter s\'il vous plaît ?',
        silenceHangup: 'Il semble que nous ayons perdu la connexion. N\'hésitez pas à nous rappeler. Bonne journée !',
        turnLimit: 'Merci de votre appel. N\'hésitez pas à nous rappeler. Bonne journée !',
        durationLimit: 'Merci pour cette longue conversation. N\'hésitez pas à rappeler si nécessaire. Bonne journée !',
        error: 'Nous rencontrons un problème technique. Veuillez réessayer plus tard.',
    },
};

/** Farewell phrases per language for call-end detection */
const FAREWELL_PATTERNS: Record<VoiceLang, string[]> = {
    tr: ['iyi günler', 'hoşça kalın', 'görüşürüz'],
    en: ['goodbye', 'have a great day', 'bye bye'],
    de: ['auf wiedersehen', 'tschüss', 'auf wiederhören', 'schönen tag'],
    fr: ['au revoir', 'bonne journée', 'à bientôt', 'adieu'],
};

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
            const twiml = generateUnavailableTwiML({ message: 'Too many requests. Please wait.' });
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
                const twiml = generateUnavailableTwiML({ message: 'Unauthorized request.' });
                return new NextResponse(twiml, { status: 403, headers: { 'Content-Type': 'text/xml' } });
            }
        } else if (process.env.NODE_ENV === 'production') {
            console.error('[twilio/gather] TWILIO_AUTH_TOKEN not configured in production');
            return new NextResponse(
                generateUnavailableTwiML({ message: 'System error.' }),
                { headers: { 'Content-Type': 'text/xml' } },
            );
        }

        // Get query params
        const tenantId = request.nextUrl.searchParams.get('tenantId');
        const callSid = request.nextUrl.searchParams.get('callSid');
        const agentIdParam = request.nextUrl.searchParams.get('agentId');

        if (!tenantId || !callSid) {
            return new NextResponse(
                generateUnavailableTwiML({ message: 'An error occurred. Please call again.' }),
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
        const baseUrl = `${protocol}://${host}`;
        const gatherUrl = `${baseUrl}/api/twilio/gather?tenantId=${tenantId}&callSid=${callSid}${agentIdParam ? `&agentId=${agentIdParam}` : ''}`;

        if (!speechResult) {
            // Resolve language early from cache for silence messages
            const earlyTenantData = getCachedTenantData(tenantId);
            const earlyLang = resolveVoiceLang(earlyTenantData?.language);
            const msgs = VOICE_MESSAGES[earlyLang];

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
                const twiml = generateResponseAndGatherTwiML({
                    gatherUrl,
                    aiResponse: msgs.silenceHangup,
                    shouldHangup: true,
                });
                return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
            }

            rlog.debug('silence', { silenceCount });
            const twiml = generateResponseAndGatherTwiML({
                gatherUrl,
                aiResponse: msgs.silence,
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

        // ── Paralel Firestore okumaları: callDoc + tenant + agent (cache'e bakarak) ──
        // Üçünü aynı anda okuyarak ~150-250ms tasarruf vs sıralı okumalar.
        const agentCacheKey = agentIdParam ? `${tenantId}:${agentIdParam}` : `${tenantId}:_first_active`;
        const tenantCacheHit = !!getCachedTenantData(tenantId);
        const cachedAgentBefore = getCachedAgentData(agentCacheKey);
        const agentCacheHit = cachedAgentBefore !== undefined;

        const fsReadStart = Date.now();
        const [callDoc, tenantSnapMaybe, agentDocMaybe] = await Promise.all([
            // Her zaman: call doc (history, tur sayısı, süre)
            getDb().collection('tenants').doc(tenantId).collection('calls').doc(callSid).get(),
            // Yalnızca cache miss ise tenant oku
            !tenantCacheHit
                ? getDb().collection('tenants').doc(tenantId).get()
                : Promise.resolve(null),
            // Yalnızca cache miss + doğrudan agentId varsa agent oku
            !agentCacheHit && agentIdParam
                ? getDb().collection('tenants').doc(tenantId).collection('agents').doc(agentIdParam).get()
                : Promise.resolve(null),
        ]);
        const firestoreMs = Date.now() - fsReadStart;

        const callData = callDoc.data();
        const history = callData?.conversationHistory || [];
        const turnCount = Math.floor(history.length / 2);

        // ── Tenant config işle (paralel prefetch veya cache'ten) ────────
        let tenantData = getCachedTenantData(tenantId);
        if (!tenantData) {
            tenantData = tenantSnapMaybe?.data() || {};
            setCachedTenantData(tenantId, tenantData);
        }
        const language = resolveVoiceLang(tenantData?.language);
        const langMessages = VOICE_MESSAGES[language];

        // ── Turn Limit Guard ─────────────────────────────────────────
        if (turnCount >= MAX_GATHER_TURNS) {
            rlog.warn('zombie:turn_limit', { turnCount, maxTurns: MAX_GATHER_TURNS });
            const twiml = generateResponseAndGatherTwiML({
                gatherUrl,
                aiResponse: langMessages.turnLimit,
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
                const twiml = generateResponseAndGatherTwiML({
                    gatherUrl,
                    aiResponse: langMessages.durationLimit,
                    shouldHangup: true,
                });
                return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
            }
        }

        // ── Agent config işle (paralel prefetch veya cache'ten) ──────────
        let activeAgent: FirebaseFirestore.DocumentData | null = null;
        if (agentCacheHit) {
            // Cache'ten al
            activeAgent = cachedAgentBefore ?? null;
        } else if (agentIdParam && agentDocMaybe?.exists) {
            // Yukarıda paralel prefetch edildi
            activeAgent = agentDocMaybe.data() || null;
            setCachedAgentData(agentCacheKey, activeAgent);
        } else if (!agentCacheHit) {
            // Legacy fallback: agentId olmadan ilk aktif agent sorgusu
            try {
                const agentsSnap = await getDb()
                    .collection('tenants').doc(tenantId)
                    .collection('agents')
                    .where('isActive', '==', true)
                    .limit(1)
                    .get();
                if (!agentsSnap.empty) {
                    activeAgent = agentsSnap.docs[0].data();
                }
            } catch { /* Fallback to tenant-level config */ }
            setCachedAgentData(agentCacheKey, activeAgent);
        }

        // 1. Fast intent detection
        const intent = detectIntentFast(speechResult);
        rlog.info('intent', { intent: intent.intent, confidence: intent.confidence, keywords: intent.detectedKeywords, lang: intent.language });

        // 2. Check for shortcut (greeting, farewell, thanks → skip LLM entirely)
        let aiResponse: string;
        let shouldEndCall = false;
        let responseSource: 'shortcut' | 'cache' | 'llm' = 'llm';
        let responseAudioUrls: string[] = [];

        const cartesiaLang = language; // Already resolved to 'tr'|'en'|'de'|'fr'
        const voiceId = activeAgent?.voiceConfig?.voiceId as string | undefined;
        const cartesiaStart = Date.now();

        if (shouldShortcut(intent)) {
            aiResponse = getShortcutResponse(intent.intent, language);
            shouldEndCall = intent.intent === 'farewell';
            responseSource = 'shortcut';
        } else {
            // 3. Check response cache → LLM'i yalnızca cache miss'te çağır
            const cache = getResponseCache();
            const cacheKey = buildCacheKey(tenantId, intent.intent, speechResult);
            const cachedResponse = cache.get(cacheKey);

            if (cachedResponse) {
                aiResponse = cachedResponse;
                responseSource = 'cache';
            } else {
                // ── Streaming Pipeline: LLM akışı + cümle-bazlı TTS parçalama ────────
                // İlk cümle hazır olur olmaz Cartesia başlar → kullanıcı ~700ms'de sesi duyar
                // (önceki mimari: LLM tamamlandıktan sonra TTS → ~1400ms)
                const llmStart = Date.now();
                const phoneMessages = buildPhoneMessages(speechResult, tenantData, language, activeAgent, history);

                const pipelineResult = await streamLLMWithChunkedTTS(phoneMessages, {
                    lang: cartesiaLang,
                    voiceId,
                    maxTokens: 150,  // Kısa yanıta zorlamıyoruz — LLM doğal uzunluğunu seçer
                    temperature: 0.3,
                    baseUrl,
                }).catch(() => null);

                if (pipelineResult) {
                    // ── Streaming başarılı: chunk1 hazır, chunk2 arka planda ──
                    aiResponse = optimizeForPhoneTTS(pipelineResult.fullText);
                    responseAudioUrls = [pipelineResult.chunk1Url, pipelineResult.chunk2Url]
                        .filter((u): u is string => !!u);

                    // Chunk2 TTS oluşturmasını response gönderildikten sonra tamamla
                    try { after(pipelineResult.chunk2Gen); } catch { void pipelineResult.chunk2Gen; }

                    rlog.info('llm', {
                        source: 'groq-stream',
                        durationMs: Date.now() - llmStart,
                        responseLength: aiResponse.length,
                        chunks: responseAudioUrls.length,
                        ...pipelineResult.timing,
                    });
                } else {
                    // ── Fallback: streaming başarısız → klasik LLM + tek TTS ──
                    aiResponse = await generateLLMResponse(speechResult, tenantData, tenantId, callSid, language, activeAgent, history);
                    rlog.info('llm', { source: 'fallback', durationMs: Date.now() - llmStart, responseLength: aiResponse.length });
                }

                cache.set(cacheKey, aiResponse, intent.intent);
            }

            // Aramanın bitmesi gerekip gerekmediğini kontrol et (tüm diller)
            const responseLower = aiResponse.toLowerCase();
            shouldEndCall = FAREWELL_PATTERNS[language].some(p => responseLower.includes(p));
        }

        // 4. Metin optimizasyonu (emoji/markdown temizleme)
        //    Streaming path'de fullText zaten optimize edildi; shortcut/cache için burada yap
        const preOptLen = aiResponse.length;
        if (responseAudioUrls.length === 0) {
            // Streaming yapmadıysak metni optimize et (shortcut, cache hit, fallback)
            aiResponse = optimizeForPhoneTTS(aiResponse);
        }
        const postOptLen = aiResponse.length;

        // 5. Streaming kullanılmadıysa tek-chunk TTS üret (shortcut, cache hit, fallback)
        if (responseAudioUrls.length === 0 && isCartesiaConfigured() && !shouldEndCall) {
            const cartesiaResult = await synthesizeCartesiaTTS(aiResponse, cartesiaLang, voiceId)
                .catch(() => null);
            if (cartesiaResult) {
                const audioId = crypto.randomUUID();
                const audioBuf = Buffer.from(await cartesiaResult.arrayBuffer());
                cachePhoneAudio(audioId, audioBuf);
                responseAudioUrls = [`${baseUrl}/api/voice/tts/phone?id=${audioId}`];
                rlog.info('tts:pre-gen', { audioId, audioBytes: audioBuf.byteLength, cartesiaMs: Date.now() - cartesiaStart });
            }
        }

        // 6. Firestore konuşma geçmişini güncelle (fire-and-forget)
        getDb()
            .collection('tenants').doc(tenantId)
            .collection('calls').doc(callSid)
            .update({
                conversationHistory: FieldValue.arrayUnion(
                    { role: 'user', content: speechResult, intent: intent.intent, timestamp: new Date().toISOString() },
                    { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
                ),
                lastActivityAt: FieldValue.serverTimestamp(),
            }).catch(() => {});

        rlog.info('gather:done', {
            source: responseSource,
            turn: turnCount,
            configCache: { tenant: tenantCacheHit, agent: agentCacheHit },
            ttsOpt: preOptLen !== postOptLen ? { before: preOptLen, after: postOptLen } : 'no-change',
            shouldEnd: shouldEndCall,
            chunks: responseAudioUrls.length,
            firestoreMs,
            cartesiaMs: Date.now() - cartesiaStart,
            totalMs: Date.now() - reqStart,
        });

        // 7. n8n webhook (fire-and-forget)
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

        // 8. TwiML yanıtı oluştur
        const twiml = generateResponseAndGatherTwiML({
            gatherUrl,
            aiResponse,
            language: localeBCP47[language],
            shouldHangup: shouldEndCall,
            audioUrls: responseAudioUrls.length > 0 ? responseAudioUrls : undefined,
        });

        return new NextResponse(twiml, {
            headers: { 'Content-Type': 'text/xml', 'x-request-id': requestId },
        });

    } catch (err) {
        log.error('gather:error', { requestId, error: err instanceof Error ? err.message : String(err), totalMs: Date.now() - reqStart });
        const fallback = generateUnavailableTwiML({
            message: VOICE_MESSAGES.en.error,
        });
        return new NextResponse(fallback, {
            headers: { 'Content-Type': 'text/xml', 'x-request-id': requestId },
        });
    }
}

/**
 * Telefon görüşmesi için mesaj dizisini oluşturur.
 * Hem streaming pipeline hem de klasik fallback tarafından kullanılır.
 */
function buildPhoneMessages(
    userMessage: string,
    tenantData: FirebaseFirestore.DocumentData | undefined,
    language: string,
    activeAgent?: FirebaseFirestore.DocumentData | null,
    existingHistory?: Array<{ role: string; content: string }>,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    let systemPrompt: string;

    // Language-specific phone call rules
    const phoneRules: Record<string, string> = {
        tr: `Telefon Görüşmesi Kuralları:
- Doğal ve akıcı konuş, gereksiz uzatmaktan kaçın
- Türkçe konuş (müşteri farklı dilde konuşursa bilgilendir)
- Samimi ve yardımsever bir üslup kullan`,
        en: `Phone Call Rules:
- Speak naturally and concisely
- Speak English unless the customer speaks a different language
- Be friendly and helpful`,
        de: `Telefongesprächsregeln:
- Sprechen Sie natürlich und prägnant
- Sprechen Sie Deutsch, es sei denn der Kunde spricht eine andere Sprache
- Seien Sie freundlich und hilfsbereit`,
        fr: `Règles d'appel téléphonique:
- Parlez naturellement et de manière concise
- Parlez français sauf si le client parle une autre langue
- Soyez aimable et serviable`,
    };

    if (activeAgent?.systemPrompt) {
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
        if (!systemPrompt.includes('telefon') && !systemPrompt.includes('phone') && !systemPrompt.includes('Telefon') && !systemPrompt.includes('appel')) {
            systemPrompt += `\n\n${phoneRules[language] || phoneRules.en}`;
        }
    } else {
        const agentName = tenantData?.agent?.name || (language === 'de' ? 'Assistent' : language === 'fr' ? 'Assistant' : language === 'en' ? 'Assistant' : 'Asistan');
        const companyName = tenantData?.companyName || (language === 'de' ? 'Unternehmen' : language === 'fr' ? 'Entreprise' : language === 'en' ? 'Company' : 'Şirket');
        const agentRole = tenantData?.agent?.role || (language === 'de' ? 'Kundenberater' : language === 'fr' ? 'Conseiller clientèle' : language === 'en' ? 'Customer Representative' : 'Müşteri Temsilcisi');
        const traits = tenantData?.agent?.traits?.join(', ') || (language === 'de' ? 'professionell, freundlich' : language === 'fr' ? 'professionnel, aimable' : language === 'en' ? 'professional, kind' : 'profesyonel, nazik');
        const services = tenantData?.business?.services?.join(', ') || '';
        const workingHours = tenantData?.business?.workingHours || '09:00-18:00';
        const workingDays = tenantData?.business?.workingDays || (language === 'de' ? 'Montag-Freitag' : language === 'fr' ? 'Lundi-Vendredi' : language === 'en' ? 'Monday-Friday' : 'Pazartesi-Cuma');

        const systemTemplates: Record<string, string> = {
            tr: `Sen ${companyName} şirketinin ${agentRole}'sin. İsmin ${agentName}.
Karakter özelliklerin: ${traits}.
${services ? `Sunduğun hizmetler: ${services}.` : ''}
Çalışma saatleri: ${workingDays}, ${workingHours}.

Kurallar:
- Doğal ve akıcı konuş, gereksiz uzatmaktan kaçın
- Türkçe konuş (müşteri farklı dilde konuşursa bilgilendir)
- Randevu, şikayet, bilgi talebi gibi işlemleri yönet
- Fiyat, kontrat detayı verme (sadece bilgi al, kaydet)
- Çözemediğin konularda müşteriye yetkili birine yönlendir
- Doğal ve samimi bir üslup kullan
- Müşterinin adını sor ve kullan`,
            en: `You are a ${agentRole} at ${companyName}. Your name is ${agentName}.
Your personality traits: ${traits}.
${services ? `Services you offer: ${services}.` : ''}
Working hours: ${workingDays}, ${workingHours}.

Rules:
- Speak naturally and concisely
- Speak English
- Handle appointments, complaints, and information requests
- Do not disclose prices or contract details (only collect information)
- Escalate to a human when you cannot resolve an issue
- Be friendly and professional
- Ask for the customer's name and use it`,
            de: `Sie sind ${agentRole} bei ${companyName}. Ihr Name ist ${agentName}.
Ihre Eigenschaften: ${traits}.
${services ? `Angebotene Dienstleistungen: ${services}.` : ''}
Arbeitszeiten: ${workingDays}, ${workingHours}.

Regeln:
- Sprechen Sie natürlich und prägnant
- Sprechen Sie Deutsch
- Bearbeiten Sie Termine, Beschwerden und Informationsanfragen
- Geben Sie keine Preise oder Vertragsdetails preis (nur Informationen sammeln)
- Leiten Sie bei unlösbaren Problemen an einen Mitarbeiter weiter
- Seien Sie freundlich und professionell
- Fragen Sie nach dem Namen des Kunden und verwenden Sie ihn`,
            fr: `Vous êtes ${agentRole} chez ${companyName}. Votre nom est ${agentName}.
Vos traits de caractère : ${traits}.
${services ? `Services proposés : ${services}.` : ''}
Heures de travail : ${workingDays}, ${workingHours}.

Règles :
- Parlez naturellement et de manière concise
- Parlez français
- Gérez les rendez-vous, réclamations et demandes d'informations
- Ne divulguez pas les prix ou les détails contractuels (collectez uniquement les informations)
- Transférez à un responsable en cas de problème insoluble
- Soyez aimable et professionnel
- Demandez le nom du client et utilisez-le`,
        };

        systemPrompt = systemTemplates[language] || systemTemplates.en;
    }

    const chatHistory = (existingHistory || [])
        .slice(-6) // Son 3 tur
        .map((turn: { role: string; content: string }) => ({
            role: turn.role as 'user' | 'assistant',
            content: turn.content,
        }));

    return [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
        { role: 'user', content: userMessage },
    ];
}

/**
 * Generate LLM response using shared fallback chain (Groq → Gemini → OpenAI).
 * Klasik non-streaming fallback — streaming pipeline başarısız olduğunda kullanılır.
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
    void tenantId; void callSid; // Gelecekte kullanılabilir (linting)
    try {
        // buildPhoneMessages ile mesaj dizisini oluştur (streaming pipeline ile aynı prompt)
        const messages = buildPhoneMessages(userMessage, tenantData, language, activeAgent, existingHistory);

        // Fallback zinciri: Groq → Gemini → OpenAI → graceful
        // maxTokens: 150 — kısa yanıta ZORLAMIYORUZ, LLM doğal uzunluğu seçer
        const result = await generateWithFallback(messages, { maxTokens: 150, temperature: 0.3, language: language as 'tr' | 'en' | 'de' | 'fr' });

        const noResponseMessages: Record<string, string> = {
            tr: 'Yanıt oluşturulamadı.',
            en: 'Could not generate a response.',
            de: 'Antwort konnte nicht generiert werden.',
            fr: 'Impossible de générer une réponse.',
        };
        return result.text || noResponseMessages[language] || noResponseMessages.en;

    } catch {
        const errorMessages: Record<string, string> = {
            tr: 'Bir aksaklık yaşıyoruz. Sizi yetkili bir temsilcimize aktarabilir miyim?',
            en: 'We are experiencing an issue. May I transfer you to a representative?',
            de: 'Wir haben gerade ein technisches Problem. Darf ich Sie an einen Mitarbeiter weiterleiten?',
            fr: 'Nous rencontrons un problème. Puis-je vous transférer à un responsable ?',
        };
        return errorMessages[language] || errorMessages.en;
    }
}
