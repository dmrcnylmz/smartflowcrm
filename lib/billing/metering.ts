/**
 * Usage Metering — Event-Driven Billing Counters
 *
 * Tracks per-tenant usage:
 * - Call minutes (inbound + outbound)
 * - GPU inference seconds
 * - API call counts
 * - KB queries
 * - Token usage
 *
 * Storage: tenants/{tenantId}/usage/{period}
 * Periods: "current" (rolling), "2026-02" (monthly archive)
 */

import { FieldValue } from 'firebase-admin/firestore';
import { checkCostThresholds } from '@/lib/billing/cost-monitor';

// =============================================
// Types
// =============================================

export interface UsageRecord {
    tenantId: string;
    period: string; // "current" or "YYYY-MM"
    totalCalls: number;
    inboundCalls: number;
    outboundCalls: number;
    totalMinutes: number;
    twilioMinutes: number;       // Twilio Native dakika
    sipTrunkMinutes: number;     // SIP Trunk (Netgsm/Bulutfon) dakika
    ttsChars: number; // TTS character count (all providers)
    gpuSeconds: number;
    apiCalls: number;
    kbQueries: number;
    tokensUsed: number;
    estimatedCostUsd: number;
    lastUpdated: FirebaseFirestore.Timestamp;
}

export interface SubscriptionTier {
    name: string;
    includedMinutes: number;
    includedCalls: number;
    pricePerMinute: number;
    pricePerTtsChar: number; // TTS cost per character (varies by plan/provider)
    pricePerGpuSecond: number;
    pricePerApiCall: number;
    monthlyBase: number;
}

// =============================================
// Pricing Tiers
// =============================================

// Per-call cost formula: C_call = C_Telephony + C_TTS + C_LLM
// Twilio Native: ~$0.01/min, SIP Trunk: ~$0.003/min
// ElevenLabs: ~$0.15/1000 chars (turbo_v2_5 @ 0.5 credits/char)
// Cartesia Sonic-3: ~$0.038/1000 chars (default for all plans)
// Murf Falcon: ~$0.01/1000 chars (budget fallback, TR+EN)
// Kokoro: ~$0.001/1000 chars (near-free, EN only)
// Groq/LLM: ~$0.02/call
// Average 3-min call:
//   Enterprise (ElevenLabs): ~$0.35-$0.50
//   Starter/Pro (Cartesia):  ~$0.10-$0.15
//   EN (Kokoro):             ~$0.05-$0.08
export const COST_RATES = {
    twilio: { perMinute: 0.01 },           // Twilio Native per-minute rate
    sip_trunk: { perMinute: 0.003 },       // SIP Trunk (Netgsm/Bulutfon) per-minute rate
    elevenlabs: { per1000Chars: 0.15 },     // ElevenLabs TTS per 1000 chars (Enterprise only)
    cartesia: { per1000Chars: 0.038 },      // Cartesia Sonic-3 per 1000 chars (default all plans)
    murf: { per1000Chars: 0.01 },           // Murf Falcon per 1000 chars (budget TR+EN fallback)
    kokoro: { per1000Chars: 0.001 },        // Kokoro TTS per 1000 chars (EN only, near-free)
    llm: { perCall: 0.02 },                 // Groq/Gemini average per call
};

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
    starter: {
        name: 'Başlangıç',
        includedMinutes: 100,
        includedCalls: 500,
        pricePerMinute: 0.15,
        pricePerTtsChar: 0.00015, // $0.15 / 1000 chars
        pricePerGpuSecond: 0.002,
        pricePerApiCall: 0.001,
        monthlyBase: 29,
    },
    professional: {
        name: 'Profesyonel',
        includedMinutes: 500,
        includedCalls: 2000,
        pricePerMinute: 0.10,
        pricePerTtsChar: 0.00012,
        pricePerGpuSecond: 0.0015,
        pricePerApiCall: 0.0005,
        monthlyBase: 99,
    },
    enterprise: {
        name: 'Kurumsal',
        includedMinutes: 2000,
        includedCalls: 10000,
        pricePerMinute: 0.07,
        pricePerTtsChar: 0.0001,
        pricePerGpuSecond: 0.001,
        pricePerApiCall: 0.0002,
        monthlyBase: 299,
    },
};

// =============================================
// Metering Functions
// =============================================

/**
 * Meter a completed call — updates usage counters.
 * Includes TTS character count for cost tracking.
 * Tracks provider-specific minutes for accurate billing (SIP trunk vs Twilio).
 *
 * @param providerType 'SIP_TRUNK' uses lower per-minute rate ($0.003 vs $0.01).
 *                     Defaults to 'TWILIO_NATIVE' (standard Twilio rate).
 */
export async function meterCallEnd(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    durationSeconds: number,
    ttsChars: number = 0,
    providerType?: string,
): Promise<void> {
    const minutes = Math.ceil(durationSeconds / 60);
    const currentPeriod = getCurrentPeriod();
    const isSipTrunk = providerType === 'SIP_TRUNK';

    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');

    // Provider-specific minute tracking for accurate cost calculation
    const providerMinuteField = isSipTrunk ? 'sipTrunkMinutes' : 'twilioMinutes';

    const baseUpdate = {
        totalMinutes: FieldValue.increment(minutes),
        [providerMinuteField]: FieldValue.increment(minutes),
        totalCalls: FieldValue.increment(1),
        lastCallEndAt: FieldValue.serverTimestamp(),
        ...(ttsChars > 0 ? { ttsChars: FieldValue.increment(ttsChars) } : {}),
    };

    await Promise.all([
        usageRef.doc('current').set(baseUpdate, { merge: true }),
        usageRef.doc(currentPeriod).set({
            period: currentPeriod,
            ...baseUpdate,
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true }),
    ]);

    // Fire-and-forget: Check cost thresholds after call ends
    checkCostThresholds(db, tenantId).catch(() => {});
}

/**
 * Meter TTS usage separately (e.g., mid-call streaming).
 */
export async function meterTtsUsage(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    charCount: number,
): Promise<void> {
    const currentPeriod = getCurrentPeriod();
    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');

    await Promise.all([
        usageRef.doc('current').set({
            ttsChars: FieldValue.increment(charCount),
            lastTtsAt: FieldValue.serverTimestamp(),
        }, { merge: true }),

        usageRef.doc(currentPeriod).set({
            period: currentPeriod,
            ttsChars: FieldValue.increment(charCount),
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true }),
    ]);

    // Fire-and-forget: Check cost thresholds after TTS usage update
    checkCostThresholds(db, tenantId).catch(() => {});
}

/**
 * Meter a GPU inference call.
 */
export async function meterGpuUsage(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    gpuSeconds: number,
    tokensUsed: number,
): Promise<void> {
    const currentPeriod = getCurrentPeriod();
    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');

    await Promise.all([
        usageRef.doc('current').set({
            gpuSeconds: FieldValue.increment(gpuSeconds),
            tokensUsed: FieldValue.increment(tokensUsed),
            apiCalls: FieldValue.increment(1),
            lastApiCallAt: FieldValue.serverTimestamp(),
        }, { merge: true }),

        usageRef.doc(currentPeriod).set({
            period: currentPeriod,
            gpuSeconds: FieldValue.increment(gpuSeconds),
            tokensUsed: FieldValue.increment(tokensUsed),
            apiCalls: FieldValue.increment(1),
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true }),
    ]);
}

/**
 * Meter a Knowledge Base query.
 */
export async function meterKbQuery(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<void> {
    const currentPeriod = getCurrentPeriod();
    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');

    await Promise.all([
        usageRef.doc('current').set({
            kbQueries: FieldValue.increment(1),
            lastKbQueryAt: FieldValue.serverTimestamp(),
        }, { merge: true }),

        usageRef.doc(currentPeriod).set({
            period: currentPeriod,
            kbQueries: FieldValue.increment(1),
            lastUpdated: FieldValue.serverTimestamp(),
        }, { merge: true }),
    ]);
}

/**
 * Get current usage for a tenant.
 */
export async function getUsage(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    period?: string,
): Promise<Partial<UsageRecord>> {
    const docId = period || 'current';
    const doc = await db.collection('tenants').doc(tenantId).collection('usage').doc(docId).get();

    if (!doc.exists) {
        return { tenantId, period: docId };
    }

    return { tenantId, period: docId, ...doc.data() };
}

/**
 * Get usage history (last N months).
 */
export async function getUsageHistory(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    months: number = 6,
): Promise<Partial<UsageRecord>[]> {
    const snap = await db
        .collection('tenants').doc(tenantId)
        .collection('usage')
        .where('period', '!=', 'current')
        .orderBy('period', 'desc')
        .limit(months)
        .get();

    return snap.docs.map(d => ({ tenantId, ...d.data() }));
}

/**
 * Detailed cost breakdown per service.
 */
export interface CostBreakdown {
    baseCost: number;
    twilioCost: number;         // Twilio Native voice cost
    sipTrunkCost: number;       // SIP Trunk voice cost
    voiceCost: number;          // twilioCost + sipTrunkCost
    ttsCost: number;
    llmCost: number;
    gpuCost: number;
    apiCost: number;
    overageCost: number;
    infraCost: number; // voice + tts + llm (per-call infra)
    total: number;
    avgCostPerCall: number;
    margin: number; // baseCost - infraCost
}

/**
 * Estimate monthly cost based on usage and tier.
 * Returns detailed breakdown with provider-specific voice costs.
 * Uses separate Twilio ($0.01/min) and SIP Trunk ($0.003/min) rates.
 */
export function estimateCost(
    usage: Partial<UsageRecord>,
    tierName: string = 'starter',
): CostBreakdown {
    const tier = SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.starter;
    const minutes = usage.totalMinutes || 0;
    const twilioMinutes = usage.twilioMinutes || 0;
    const sipTrunkMinutes = usage.sipTrunkMinutes || 0;
    const ttsChars = usage.ttsChars || 0;
    const totalCalls = usage.totalCalls || 0;
    const gpuSecs = usage.gpuSeconds || 0;
    const apiCalls = usage.apiCalls || 0;

    // Infrastructure costs (actual cost to us)
    // Provider-specific voice costs — SIP trunk is ~70% cheaper than Twilio
    const twilioCost = twilioMinutes * COST_RATES.twilio.perMinute;
    const sipTrunkCost = sipTrunkMinutes * COST_RATES.sip_trunk.perMinute;

    // Legacy fallback: if no per-provider breakdown, assume all Twilio
    const unaccountedMinutes = minutes - twilioMinutes - sipTrunkMinutes;
    const legacyCost = unaccountedMinutes > 0 ? unaccountedMinutes * COST_RATES.twilio.perMinute : 0;

    const voiceCost = twilioCost + sipTrunkCost + legacyCost;
    // TTS cost varies by tier: Enterprise uses ElevenLabs, others use Cartesia
    const ttsRate = tierName === 'enterprise'
        ? COST_RATES.elevenlabs.per1000Chars
        : COST_RATES.cartesia.per1000Chars;
    const ttsCost = (ttsChars / 1000) * ttsRate;
    const llmCost = totalCalls * COST_RATES.llm.perCall;
    const infraCost = voiceCost + ttsCost + llmCost;

    // Overage costs (charged to customer)
    const overageMinutes = Math.max(0, minutes - tier.includedMinutes);
    const minuteOverage = overageMinutes * tier.pricePerMinute;
    const gpuCost = gpuSecs * tier.pricePerGpuSecond;
    const apiCost = apiCalls * tier.pricePerApiCall;
    const ttsOverage = ttsChars * tier.pricePerTtsChar;
    const overageCost = minuteOverage + gpuCost + apiCost + ttsOverage;

    const total = tier.monthlyBase + overageCost;
    const avgCostPerCall = totalCalls > 0 ? infraCost / totalCalls : 0;

    return {
        baseCost: tier.monthlyBase,
        twilioCost: round2(twilioCost + legacyCost),
        sipTrunkCost: round2(sipTrunkCost),
        voiceCost: round2(voiceCost),
        ttsCost: round2(ttsCost),
        llmCost: round2(llmCost),
        gpuCost: round2(gpuCost),
        apiCost: round2(apiCost),
        overageCost: round2(overageCost),
        infraCost: round2(infraCost),
        total: round2(total),
        avgCostPerCall: round2(avgCostPerCall),
        margin: round2(tier.monthlyBase - infraCost),
    };
}

/**
 * Estimate per-call cost for a given duration.
 * Uses provider-specific voice and TTS rates.
 *
 * @param providerType 'SIP_TRUNK' for cheaper voice rate
 * @param ttsProvider 'elevenlabs' (Enterprise), 'gemini' (Starter/Pro), 'kokoro' (EN only)
 */
export function estimatePerCallCost(
    durationMinutes: number,
    avgTtsCharsPerMin: number = 600,
    providerType?: string,
    ttsProvider?: string,
): { voice: number; tts: number; llm: number; total: number } {
    const voiceRate = providerType === 'SIP_TRUNK'
        ? COST_RATES.sip_trunk.perMinute
        : COST_RATES.twilio.perMinute;
    const voice = durationMinutes * voiceRate;

    // TTS cost based on provider
    let ttsRate = COST_RATES.cartesia.per1000Chars; // default: Cartesia
    if (ttsProvider === 'elevenlabs') ttsRate = COST_RATES.elevenlabs.per1000Chars;
    else if (ttsProvider === 'murf') ttsRate = COST_RATES.murf.per1000Chars;
    else if (ttsProvider === 'kokoro') ttsRate = COST_RATES.kokoro.per1000Chars;

    const tts = (durationMinutes * avgTtsCharsPerMin / 1000) * ttsRate;
    const llm = COST_RATES.llm.perCall;
    return {
        voice: round2(voice),
        tts: round2(tts),
        llm: round2(llm),
        total: round2(voice + tts + llm),
    };
}

/**
 * Check if tenant has exceeded their plan limits.
 */
export function checkUsageLimits(
    usage: Partial<UsageRecord>,
    tierName: string = 'starter',
): { minutesExceeded: boolean; callsExceeded: boolean; usagePercent: number; callPercent: number } {
    const tier = SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.starter;
    const minutes = usage.totalMinutes || 0;
    const calls = usage.totalCalls || 0;

    return {
        minutesExceeded: minutes >= tier.includedMinutes,
        callsExceeded: calls >= tier.includedCalls,
        usagePercent: Math.round((minutes / tier.includedMinutes) * 100),
        callPercent: Math.round((calls / tier.includedCalls) * 100),
    };
}

// =============================================
// Helpers
// =============================================

function getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
