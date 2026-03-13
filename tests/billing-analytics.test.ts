/**
 * Billing Analytics — Unit Tests
 *
 * Tests analytics query functions with mocked Firestore.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

import {
    getLatencyStats,
    getProviderBreakdown,
    getCostTrend,
    getDailyMetrics,
    getPipelineSummary,
} from '@/lib/billing/analytics';

// ─── Mock Firestore Helpers ────────────────────────────────────────────────

interface MockDoc {
    id: string;
    data: () => Record<string, unknown>;
}

function mockFirestore(metricsDocs: MockDoc[], usageDocs?: MockDoc[], configData?: Record<string, unknown>) {
    const metricsSnap = { docs: metricsDocs };
    const usageSnap = { docs: usageDocs || [] };

    const configDoc = {
        data: () => configData || {},
    };

    const metricsCollection = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue(metricsSnap),
    };

    const usageCollection = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue(usageSnap),
    };

    const configCollection = {
        doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(configDoc),
        }),
    };

    const tenantDoc = {
        collection: vi.fn((name: string) => {
            if (name === 'metrics_daily') return metricsCollection;
            if (name === 'usage') return usageCollection;
            if (name === 'config') return configCollection;
            return metricsCollection;
        }),
    };

    return {
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue(tenantDoc),
        }),
    } as unknown as FirebaseFirestore.Firestore;
}

function makeMetricDoc(id: string, data: Record<string, unknown>): MockDoc {
    return { id, data: () => ({ date: id, ...data }) };
}

function makeUsageDoc(id: string, data: Record<string, unknown>): MockDoc {
    return { id, data: () => ({ period: id, ...data }) };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Billing Analytics', () => {
    const tenantId = 'test-tenant';

    // ─── getLatencyStats ────────────────────────────────────────────
    describe('getLatencyStats()', () => {
        it('returns zero stats for no data', async () => {
            const db = mockFirestore([]);
            const stats = await getLatencyStats(db, tenantId, 7);

            expect(stats.totalCalls).toBe(0);
            expect(stats.avgSttMs).toBe(0);
            expect(stats.avgLlmMs).toBe(0);
            expect(stats.avgTtsMs).toBe(0);
            expect(stats.avgPipelineMs).toBe(0);
            expect(stats.period).toBe('7d');
            expect(stats.dailyBreakdown).toHaveLength(0);
        });

        it('calculates averages correctly', async () => {
            const docs = [
                makeMetricDoc('2025-01-01', {
                    callCount: 10,
                    totalSttMs: 1000,
                    totalLlmMs: 2000,
                    totalTtsMs: 500,
                    totalPipelineMs: 3500,
                }),
                makeMetricDoc('2025-01-02', {
                    callCount: 20,
                    totalSttMs: 3000,
                    totalLlmMs: 4000,
                    totalTtsMs: 1000,
                    totalPipelineMs: 8000,
                }),
            ];
            const db = mockFirestore(docs);
            const stats = await getLatencyStats(db, tenantId, 7);

            expect(stats.totalCalls).toBe(30);
            // avgSttMs = (1000 + 3000) / 30 = 133.33 → 133
            expect(stats.avgSttMs).toBe(133);
            // avgLlmMs = (2000 + 4000) / 30 = 200
            expect(stats.avgLlmMs).toBe(200);
            // avgTtsMs = (500 + 1000) / 30 = 50
            expect(stats.avgTtsMs).toBe(50);
        });

        it('sorts daily breakdown ascending', async () => {
            const docs = [
                makeMetricDoc('2025-01-03', { callCount: 5, totalSttMs: 100 }),
                makeMetricDoc('2025-01-01', { callCount: 3, totalSttMs: 50 }),
                makeMetricDoc('2025-01-02', { callCount: 4, totalSttMs: 80 }),
            ];
            const db = mockFirestore(docs);
            const stats = await getLatencyStats(db, tenantId, 7);

            expect(stats.dailyBreakdown[0].date).toBe('2025-01-01');
            expect(stats.dailyBreakdown[1].date).toBe('2025-01-02');
            expect(stats.dailyBreakdown[2].date).toBe('2025-01-03');
        });
    });

    // ─── getProviderBreakdown ───────────────────────────────────────
    describe('getProviderBreakdown()', () => {
        it('returns empty objects for no data', async () => {
            const db = mockFirestore([]);
            const breakdown = await getProviderBreakdown(db, tenantId, 30);

            expect(breakdown.stt).toEqual({});
            expect(breakdown.llm).toEqual({});
            expect(breakdown.tts).toEqual({});
        });

        it('aggregates provider counts across days', async () => {
            const docs = [
                makeMetricDoc('2025-01-01', {
                    callCount: 10,
                    sttProvider_deepgram: 8,
                    sttProvider_whisper: 2,
                    llmProvider_groq: 10,
                    ttsProvider_cartesia: 9,
                    ttsProvider_openai: 1,
                }),
                makeMetricDoc('2025-01-02', {
                    callCount: 5,
                    sttProvider_deepgram: 5,
                    llmProvider_groq: 3,
                    llmProvider_openai: 2,
                    ttsProvider_cartesia: 5,
                }),
            ];
            const db = mockFirestore(docs);
            const breakdown = await getProviderBreakdown(db, tenantId, 30);

            expect(breakdown.stt.deepgram).toBe(13);
            expect(breakdown.stt.whisper).toBe(2);
            expect(breakdown.llm.groq).toBe(13);
            expect(breakdown.llm.openai).toBe(2);
            expect(breakdown.tts.cartesia).toBe(14);
            expect(breakdown.tts.openai).toBe(1);
        });

        it('ignores non-provider fields', async () => {
            const docs = [
                makeMetricDoc('2025-01-01', {
                    callCount: 5,
                    totalSttMs: 500,  // not a provider field
                    sttProvider_deepgram: 5,
                }),
            ];
            const db = mockFirestore(docs);
            const breakdown = await getProviderBreakdown(db, tenantId, 30);

            expect(breakdown.stt).toEqual({ deepgram: 5 });
            expect(Object.keys(breakdown.stt)).toHaveLength(1);
        });
    });

    // ─── getCostTrend ───────────────────────────────────────────────
    describe('getCostTrend()', () => {
        it('returns empty months for no data', async () => {
            const db = mockFirestore([], []);
            const trend = await getCostTrend(db, tenantId, 6);

            expect(trend.months).toHaveLength(0);
        });

        it('calculates costs correctly', async () => {
            const usageDocs = [
                makeUsageDoc('2025-01', {
                    period: '2025-01',
                    ttsChars: 10000,
                    totalCalls: 100,
                }),
            ];
            const db = mockFirestore([], usageDocs);
            const trend = await getCostTrend(db, tenantId, 6);

            expect(trend.months).toHaveLength(1);
            const month = trend.months[0];

            // TTS cost: (10000 / 1000) * 0.15 = 1.50
            expect(month.ttsCostUsd).toBe(1.5);
            // LLM cost: 100 * 0.02 = 2.00
            expect(month.llmCostUsd).toBe(2);
            // Total: 3.50
            expect(month.totalCostUsd).toBe(3.5);
        });

        it('sorts months ascending', async () => {
            const usageDocs = [
                makeUsageDoc('2025-03', { period: '2025-03', ttsChars: 100, totalCalls: 1 }),
                makeUsageDoc('2025-01', { period: '2025-01', ttsChars: 100, totalCalls: 1 }),
                makeUsageDoc('2025-02', { period: '2025-02', ttsChars: 100, totalCalls: 1 }),
            ];
            const db = mockFirestore([], usageDocs);
            const trend = await getCostTrend(db, tenantId, 6);

            expect(trend.months[0].period).toBe('2025-01');
            expect(trend.months[1].period).toBe('2025-02');
            expect(trend.months[2].period).toBe('2025-03');
        });
    });

    // ─── getDailyMetrics ────────────────────────────────────────────
    describe('getDailyMetrics()', () => {
        it('returns empty array for no data', async () => {
            const db = mockFirestore([]);
            const metrics = await getDailyMetrics(db, tenantId, 7);
            expect(metrics).toHaveLength(0);
        });

        it('builds provider breakdown per day', async () => {
            const docs = [
                makeMetricDoc('2025-01-01', {
                    callCount: 10,
                    totalTtsChars: 5000,
                    totalSttMs: 500,
                    totalLlmMs: 1000,
                    totalTtsMs: 300,
                    totalPipelineMs: 1800,
                    sttProvider_deepgram: 10,
                    llmProvider_groq: 8,
                    llmProvider_openai: 2,
                    ttsProvider_cartesia: 10,
                }),
            ];
            const db = mockFirestore(docs);
            const metrics = await getDailyMetrics(db, tenantId, 7);

            expect(metrics).toHaveLength(1);
            const day = metrics[0];
            expect(day.providerBreakdown.stt.deepgram).toBe(10);
            expect(day.providerBreakdown.llm.groq).toBe(8);
            expect(day.providerBreakdown.tts.cartesia).toBe(10);
            expect(day.estimatedCostUsd).toBeGreaterThan(0);
        });

        it('sorts results by date ascending', async () => {
            const docs = [
                makeMetricDoc('2025-01-03', { callCount: 1 }),
                makeMetricDoc('2025-01-01', { callCount: 2 }),
            ];
            const db = mockFirestore(docs);
            const metrics = await getDailyMetrics(db, tenantId, 7);

            expect(metrics[0].date).toBe('2025-01-01');
            expect(metrics[1].date).toBe('2025-01-03');
        });
    });

    // ─── getPipelineSummary ─────────────────────────────────────────
    describe('getPipelineSummary()', () => {
        it('returns zero summary for no data', async () => {
            const db = mockFirestore([]);
            const summary = await getPipelineSummary(db, tenantId, 30);

            expect(summary.totalCalls).toBe(0);
            expect(summary.avgPipelineMs).toBe(0);
            expect(summary.totalTtsChars).toBe(0);
            expect(summary.estimatedCostUsd).toBe(0);
            expect(summary.callsTrend).toBe(0);
        });

        it('aggregates totals correctly', async () => {
            const docs = [
                makeMetricDoc('2025-01-01', { callCount: 10, totalPipelineMs: 5000, totalTtsChars: 3000 }),
                makeMetricDoc('2025-01-02', { callCount: 15, totalPipelineMs: 7500, totalTtsChars: 4500 }),
            ];
            const db = mockFirestore(docs);
            const summary = await getPipelineSummary(db, tenantId, 30);

            expect(summary.totalCalls).toBe(25);
            expect(summary.avgPipelineMs).toBe(500); // 12500 / 25
            expect(summary.totalTtsChars).toBe(7500);
        });

        it('reads emergency mode from config', async () => {
            const db = mockFirestore([], [], { emergencyModeActive: true });
            const summary = await getPipelineSummary(db, tenantId, 30);
            expect(summary.emergencyModeActive).toBe(true);
        });

        it('defaults emergency mode to false', async () => {
            const db = mockFirestore([], [], {});
            const summary = await getPipelineSummary(db, tenantId, 30);
            expect(summary.emergencyModeActive).toBe(false);
        });
    });
});
