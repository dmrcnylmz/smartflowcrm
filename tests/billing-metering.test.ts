/**
 * Billing Metering Tests — lib/billing/metering.ts
 *
 * Tests:
 *   - meterCallEnd: provider-specific minute tracking (SIP_TRUNK vs TWILIO_NATIVE)
 *   - estimateCost: provider-aware cost breakdown
 *   - estimatePerCallCost: per-call cost with provider type
 *   - checkUsageLimits: plan limit checks
 *   - getUsage / getUsageHistory
 *   - meterTtsUsage, meterGpuUsage, meterKbQuery
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Mock Setup
// =============================================

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockGet = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(),
    FieldValue: {
        increment: vi.fn((val: number) => ({ _type: 'increment', value: val })),
        serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
    },
}));

vi.mock('@/lib/billing/cost-monitor', () => ({
    checkCostThresholds: vi.fn().mockResolvedValue(undefined),
}));

// =============================================
// Import after mocks
// =============================================

import {
    meterCallEnd,
    meterTtsUsage,
    meterGpuUsage,
    meterKbQuery,
    getUsage,
    getUsageHistory,
    estimateCost,
    estimatePerCallCost,
    checkUsageLimits,
    COST_RATES,
    SUBSCRIPTION_TIERS,
} from '@/lib/billing/metering';

// =============================================
// Helpers
// =============================================

function createMockDb() {
    return {
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        set: mockSet,
                        get: mockGet,
                    }),
                    where: vi.fn().mockReturnValue({
                        orderBy: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                get: mockGetDocs,
                            }),
                        }),
                    }),
                }),
            }),
        }),
    } as unknown as FirebaseFirestore.Firestore;
}

// =============================================
// Tests
// =============================================

describe('Billing Metering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── meterCallEnd ───

    describe('meterCallEnd', () => {
        it('should track twilioMinutes for TWILIO_NATIVE calls', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 180, 0, 'TWILIO_NATIVE');

            // Should have called set twice (current + period)
            expect(mockSet).toHaveBeenCalledTimes(2);

            // Check that twilioMinutes field is incremented
            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.twilioMinutes).toEqual({ _type: 'increment', value: 3 });
            expect(firstCall.totalMinutes).toEqual({ _type: 'increment', value: 3 });
        });

        it('should track sipTrunkMinutes for SIP_TRUNK calls', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 120, 0, 'SIP_TRUNK');

            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.sipTrunkMinutes).toEqual({ _type: 'increment', value: 2 });
            expect(firstCall.totalMinutes).toEqual({ _type: 'increment', value: 2 });
            // Should NOT have twilioMinutes
            expect(firstCall.twilioMinutes).toBeUndefined();
        });

        it('should default to twilioMinutes when providerType not specified', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 60);

            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.twilioMinutes).toEqual({ _type: 'increment', value: 1 });
        });

        it('should ceil duration to next minute', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 61); // 61 seconds → 2 minutes

            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.totalMinutes).toEqual({ _type: 'increment', value: 2 });
        });

        it('should include ttsChars when provided', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 60, 1500, 'TWILIO_NATIVE');

            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.ttsChars).toEqual({ _type: 'increment', value: 1500 });
        });

        it('should not include ttsChars field when zero', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 60, 0);

            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.ttsChars).toBeUndefined();
        });

        it('should write to both current and period docs', async () => {
            const db = createMockDb();

            await meterCallEnd(db, 'tenant-1', 60, 0, 'SIP_TRUNK');

            expect(mockSet).toHaveBeenCalledTimes(2);

            // Second call (period doc) should have period field
            const secondCall = mockSet.mock.calls[1][0];
            expect(secondCall.period).toBeDefined();
            expect(secondCall.sipTrunkMinutes).toEqual({ _type: 'increment', value: 1 });
        });
    });

    // ─── estimateCost ───

    describe('estimateCost', () => {
        it('should calculate separate Twilio and SIP trunk costs', () => {
            const usage = {
                totalMinutes: 100,
                twilioMinutes: 60,
                sipTrunkMinutes: 40,
                totalCalls: 30,
                ttsChars: 10000,
            };

            const cost = estimateCost(usage, 'starter');

            // Twilio: 60 * 0.01 = 0.60
            expect(cost.twilioCost).toBe(0.6);
            // SIP Trunk: 40 * 0.003 = 0.12
            expect(cost.sipTrunkCost).toBe(0.12);
            // Voice: 0.60 + 0.12 = 0.72
            expect(cost.voiceCost).toBe(0.72);
        });

        it('should fallback to Twilio rate for unaccounted minutes (legacy data)', () => {
            const usage = {
                totalMinutes: 50,
                // No twilioMinutes or sipTrunkMinutes (legacy data)
                totalCalls: 10,
            };

            const cost = estimateCost(usage, 'starter');

            // All 50 minutes → Twilio rate: 50 * 0.01 = 0.50
            expect(cost.twilioCost).toBe(0.5);
            expect(cost.sipTrunkCost).toBe(0);
        });

        it('should calculate SIP trunk savings correctly', () => {
            // All SIP trunk = much cheaper
            const sipUsage = {
                totalMinutes: 100,
                twilioMinutes: 0,
                sipTrunkMinutes: 100,
                totalCalls: 30,
            };

            // All Twilio = standard rate
            const twilioUsage = {
                totalMinutes: 100,
                twilioMinutes: 100,
                sipTrunkMinutes: 0,
                totalCalls: 30,
            };

            const sipCost = estimateCost(sipUsage, 'starter');
            const twilioCost = estimateCost(twilioUsage, 'starter');

            // SIP: 100 * 0.003 = 0.30
            // Twilio: 100 * 0.01 = 1.00
            expect(sipCost.voiceCost).toBe(0.3);
            expect(twilioCost.voiceCost).toBe(1);
            expect(sipCost.voiceCost).toBeLessThan(twilioCost.voiceCost);
            // SIP trunk should have better margin
            expect(sipCost.margin).toBeGreaterThan(twilioCost.margin);
        });

        it('should calculate overage correctly', () => {
            const usage = {
                totalMinutes: 150, // Starter includes 100
                twilioMinutes: 150,
                totalCalls: 50,
            };

            const cost = estimateCost(usage, 'starter');

            // Overage: 50 minutes * $0.15/min = $7.50
            expect(cost.overageCost).toBeGreaterThan(0);
            expect(cost.total).toBe(cost.baseCost + cost.overageCost);
        });

        it('should return all required CostBreakdown fields', () => {
            const cost = estimateCost({ totalMinutes: 10, totalCalls: 5 }, 'starter');

            expect(cost).toHaveProperty('baseCost');
            expect(cost).toHaveProperty('twilioCost');
            expect(cost).toHaveProperty('sipTrunkCost');
            expect(cost).toHaveProperty('voiceCost');
            expect(cost).toHaveProperty('ttsCost');
            expect(cost).toHaveProperty('llmCost');
            expect(cost).toHaveProperty('gpuCost');
            expect(cost).toHaveProperty('apiCost');
            expect(cost).toHaveProperty('overageCost');
            expect(cost).toHaveProperty('infraCost');
            expect(cost).toHaveProperty('total');
            expect(cost).toHaveProperty('avgCostPerCall');
            expect(cost).toHaveProperty('margin');
        });

        it('should default to starter tier if unknown tier', () => {
            const cost = estimateCost({ totalMinutes: 10 }, 'nonexistent');
            expect(cost.baseCost).toBe(SUBSCRIPTION_TIERS.starter.monthlyBase);
        });
    });

    // ─── estimatePerCallCost ───

    describe('estimatePerCallCost', () => {
        it('should use Twilio rate by default', () => {
            const cost = estimatePerCallCost(3);
            // 3 min * $0.01 = $0.03
            expect(cost.voice).toBe(0.03);
        });

        it('should use SIP trunk rate when specified', () => {
            const cost = estimatePerCallCost(3, 600, 'SIP_TRUNK');
            // 3 min * $0.003 = $0.009 → rounded $0.01
            expect(cost.voice).toBe(0.01);
        });

        it('should use Twilio rate for TWILIO_NATIVE', () => {
            const cost = estimatePerCallCost(3, 600, 'TWILIO_NATIVE');
            expect(cost.voice).toBe(0.03);
        });

        it('should calculate total as sum of voice + tts + llm', () => {
            const cost = estimatePerCallCost(3, 600);
            // Use toBeCloseTo due to floating-point precision
            expect(cost.total).toBeCloseTo(cost.voice + cost.tts + cost.llm, 2);
        });

        it('should show SIP trunk per-call is cheaper than Twilio', () => {
            const sipCost = estimatePerCallCost(5, 600, 'SIP_TRUNK');
            const twilioCost = estimatePerCallCost(5, 600, 'TWILIO_NATIVE');
            expect(sipCost.total).toBeLessThan(twilioCost.total);
        });
    });

    // ─── checkUsageLimits ───

    describe('checkUsageLimits', () => {
        it('should detect when minutes exceeded', () => {
            const result = checkUsageLimits(
                { totalMinutes: 150, totalCalls: 50 },
                'starter',
            );
            expect(result.minutesExceeded).toBe(true);
            expect(result.callsExceeded).toBe(false);
        });

        it('should detect when calls exceeded', () => {
            const result = checkUsageLimits(
                { totalMinutes: 10, totalCalls: 600 },
                'starter',
            );
            expect(result.callsExceeded).toBe(true);
            expect(result.minutesExceeded).toBe(false);
        });

        it('should calculate usage percentages', () => {
            const result = checkUsageLimits(
                { totalMinutes: 50, totalCalls: 250 },
                'starter',
            );
            expect(result.usagePercent).toBe(50); // 50/100
            expect(result.callPercent).toBe(50);   // 250/500
        });

        it('should respect enterprise tier limits', () => {
            const result = checkUsageLimits(
                { totalMinutes: 1500, totalCalls: 8000 },
                'enterprise',
            );
            expect(result.minutesExceeded).toBe(false); // 1500 < 2000
            expect(result.callsExceeded).toBe(false);   // 8000 < 10000
        });
    });

    // ─── COST_RATES ───

    describe('COST_RATES', () => {
        it('should have SIP trunk rate cheaper than Twilio', () => {
            expect(COST_RATES.sip_trunk.perMinute).toBeLessThan(COST_RATES.twilio.perMinute);
        });

        it('should have correct rate values', () => {
            expect(COST_RATES.twilio.perMinute).toBe(0.01);
            expect(COST_RATES.sip_trunk.perMinute).toBe(0.003);
            expect(COST_RATES.cartesia.per1000Chars).toBe(0.038);
            expect(COST_RATES.murf.per1000Chars).toBe(0.017);
            expect(COST_RATES.kokoro.per1000Chars).toBe(0.001);
            expect(COST_RATES.llm.perCall).toBe(0.002);
        });
    });

    // ─── SUBSCRIPTION_TIERS ───

    describe('SUBSCRIPTION_TIERS', () => {
        it('should have three tiers', () => {
            expect(Object.keys(SUBSCRIPTION_TIERS)).toEqual(['starter', 'professional', 'enterprise']);
        });

        it('should have increasing limits across tiers', () => {
            expect(SUBSCRIPTION_TIERS.starter.includedMinutes).toBeLessThan(SUBSCRIPTION_TIERS.professional.includedMinutes);
            expect(SUBSCRIPTION_TIERS.professional.includedMinutes).toBeLessThan(SUBSCRIPTION_TIERS.enterprise.includedMinutes);
        });

        it('should have decreasing per-minute prices for higher tiers', () => {
            expect(SUBSCRIPTION_TIERS.starter.pricePerMinute).toBeGreaterThan(SUBSCRIPTION_TIERS.professional.pricePerMinute);
            expect(SUBSCRIPTION_TIERS.professional.pricePerMinute).toBeGreaterThan(SUBSCRIPTION_TIERS.enterprise.pricePerMinute);
        });
    });

    // ─── getUsage ───

    describe('getUsage', () => {
        it('should return usage for current period', async () => {
            const db = createMockDb();
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ totalMinutes: 50, totalCalls: 20, twilioMinutes: 30, sipTrunkMinutes: 20 }),
            });

            const usage = await getUsage(db, 'tenant-1');
            expect(usage.tenantId).toBe('tenant-1');
            expect(usage.totalMinutes).toBe(50);
        });

        it('should return empty record when no usage exists', async () => {
            const db = createMockDb();
            mockGet.mockResolvedValueOnce({ exists: false });

            const usage = await getUsage(db, 'tenant-1');
            expect(usage.tenantId).toBe('tenant-1');
            expect(usage.totalMinutes).toBeUndefined();
        });
    });

    // ─── meterTtsUsage ───

    describe('meterTtsUsage', () => {
        it('should increment ttsChars counter', async () => {
            const db = createMockDb();
            await meterTtsUsage(db, 'tenant-1', 2000);

            expect(mockSet).toHaveBeenCalledTimes(2);
            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.ttsChars).toEqual({ _type: 'increment', value: 2000 });
        });
    });

    // ─── meterGpuUsage ───

    describe('meterGpuUsage', () => {
        it('should increment gpu and token counters', async () => {
            const db = createMockDb();
            await meterGpuUsage(db, 'tenant-1', 5.5, 1000);

            expect(mockSet).toHaveBeenCalledTimes(2);
            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.gpuSeconds).toEqual({ _type: 'increment', value: 5.5 });
            expect(firstCall.tokensUsed).toEqual({ _type: 'increment', value: 1000 });
            expect(firstCall.apiCalls).toEqual({ _type: 'increment', value: 1 });
        });
    });

    // ─── meterKbQuery ───

    describe('meterKbQuery', () => {
        it('should increment kb query counter', async () => {
            const db = createMockDb();
            await meterKbQuery(db, 'tenant-1');

            expect(mockSet).toHaveBeenCalledTimes(2);
            const firstCall = mockSet.mock.calls[0][0];
            expect(firstCall.kbQueries).toEqual({ _type: 'increment', value: 1 });
        });
    });
});
