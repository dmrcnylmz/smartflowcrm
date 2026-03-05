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
    ttsChars: number; // ElevenLabs TTS character count
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
    pricePerTtsChar: number; // ElevenLabs TTS cost per character
    pricePerGpuSecond: number;
    pricePerApiCall: number;
    monthlyBase: number;
}

// =============================================
// Pricing Tiers
// =============================================

// Per-call cost formula: C_call = C_Twilio + C_TTS + C_LLM
// Twilio: ~$0.01/min, ElevenLabs: ~$0.15/1000 chars, Groq/LLM: ~$0.02/call
// Average 3-min call ≈ $0.35-$0.50
export const COST_RATES = {
    twilio: { perMinute: 0.01 },           // Twilio per-minute rate
    elevenlabs: { per1000Chars: 0.15 },     // ElevenLabs TTS per 1000 chars
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
 */
export async function meterCallEnd(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    durationSeconds: number,
    ttsChars: number = 0,
): Promise<void> {
    const minutes = Math.ceil(durationSeconds / 60);
    const currentPeriod = getCurrentPeriod();

    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');

    const baseUpdate = {
        totalMinutes: FieldValue.increment(minutes),
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
    twilioCost: number;
    ttsCost: number;
    llmCost: number;
    gpuCost: number;
    apiCost: number;
    overageCost: number;
    infraCost: number; // twilio + tts + llm (per-call infra)
    total: number;
    avgCostPerCall: number;
    margin: number; // baseCost - infraCost
}

/**
 * Estimate monthly cost based on usage and tier.
 * Returns detailed breakdown: Twilio + TTS + LLM per call.
 */
export function estimateCost(
    usage: Partial<UsageRecord>,
    tierName: string = 'starter',
): CostBreakdown {
    const tier = SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.starter;
    const minutes = usage.totalMinutes || 0;
    const ttsChars = usage.ttsChars || 0;
    const totalCalls = usage.totalCalls || 0;
    const gpuSecs = usage.gpuSeconds || 0;
    const apiCalls = usage.apiCalls || 0;

    // Infrastructure costs (actual cost to us)
    const twilioCost = minutes * COST_RATES.twilio.perMinute;
    const ttsCost = (ttsChars / 1000) * COST_RATES.elevenlabs.per1000Chars;
    const llmCost = totalCalls * COST_RATES.llm.perCall;
    const infraCost = twilioCost + ttsCost + llmCost;

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
        twilioCost: round2(twilioCost),
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
 */
export function estimatePerCallCost(
    durationMinutes: number,
    avgTtsCharsPerMin: number = 600,
): { twilio: number; tts: number; llm: number; total: number } {
    const twilio = durationMinutes * COST_RATES.twilio.perMinute;
    const tts = (durationMinutes * avgTtsCharsPerMin / 1000) * COST_RATES.elevenlabs.per1000Chars;
    const llm = COST_RATES.llm.perCall;
    return {
        twilio: round2(twilio),
        tts: round2(tts),
        llm: round2(llm),
        total: round2(twilio + tts + llm),
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
