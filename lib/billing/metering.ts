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
    pricePerMinute: number;
    pricePerGpuSecond: number;
    pricePerApiCall: number;
    monthlyBase: number;
}

// =============================================
// Pricing Tiers
// =============================================

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
    starter: {
        name: 'Başlangıç',
        includedMinutes: 100,
        pricePerMinute: 0.15,
        pricePerGpuSecond: 0.002,
        pricePerApiCall: 0.001,
        monthlyBase: 29,
    },
    professional: {
        name: 'Profesyonel',
        includedMinutes: 500,
        pricePerMinute: 0.10,
        pricePerGpuSecond: 0.0015,
        pricePerApiCall: 0.0005,
        monthlyBase: 99,
    },
    enterprise: {
        name: 'Kurumsal',
        includedMinutes: 2000,
        pricePerMinute: 0.07,
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
 */
export async function meterCallEnd(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    durationSeconds: number,
): Promise<void> {
    const minutes = Math.ceil(durationSeconds / 60);
    const currentPeriod = getCurrentPeriod();

    const usageRef = db.collection('tenants').doc(tenantId).collection('usage');

    // Update current and monthly counters in parallel
    await Promise.all([
        usageRef.doc('current').set({
            totalMinutes: FieldValue.increment(minutes),
            completedCalls: FieldValue.increment(1),
            lastCallEndAt: FieldValue.serverTimestamp(),
        }, { merge: true }),

        usageRef.doc(currentPeriod).set({
            period: currentPeriod,
            totalMinutes: FieldValue.increment(minutes),
            completedCalls: FieldValue.increment(1),
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
 * Estimate monthly cost based on usage and tier.
 */
export function estimateCost(
    usage: Partial<UsageRecord>,
    tierName: string = 'starter',
): { baseCost: number; overageCost: number; total: number } {
    const tier = SUBSCRIPTION_TIERS[tierName] || SUBSCRIPTION_TIERS.starter;
    const minutes = usage.totalMinutes || 0;
    const gpuSecs = usage.gpuSeconds || 0;
    const apiCalls = usage.apiCalls || 0;

    const overageMinutes = Math.max(0, minutes - tier.includedMinutes);
    const minuteOverage = overageMinutes * tier.pricePerMinute;
    const gpuCost = gpuSecs * tier.pricePerGpuSecond;
    const apiCost = apiCalls * tier.pricePerApiCall;

    const overageCost = minuteOverage + gpuCost + apiCost;

    return {
        baseCost: tier.monthlyBase,
        overageCost: Math.round(overageCost * 100) / 100,
        total: Math.round((tier.monthlyBase + overageCost) * 100) / 100,
    };
}

// =============================================
// Helpers
// =============================================

function getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
