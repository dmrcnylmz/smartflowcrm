/**
 * Billing Guard & Analytics Tests
 *
 * Tests for:
 *   - usage-guard.ts: checkCallAllowed (quota enforcement)
 *   - cost-monitor.ts: shouldUseEmergencyTts, getCostMonitoringConfig, checkCostThresholds
 *   - metering.ts: meterTtsUsage
 *
 * Tests usage guard quota logic with various scenarios.
 * Tests cost monitoring with config caching and threshold detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Firebase mocks ────────────────────────────────────────────────────────

vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: (...args: unknown[]) => mockCollection(...args),
    })),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
}));

// Mock alert dispatcher (for cost-monitor)
vi.mock('@/lib/billing/alert-dispatcher', () => ({
    alertEmergencyModeActivated: vi.fn().mockResolvedValue(undefined),
    alertEmergencyModeDeactivated: vi.fn().mockResolvedValue(undefined),
    alertCostThresholdWarning: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock metering module for usage-guard ──────────────────────────────────

const mockGetUsage = vi.fn();
const mockCheckUsageLimits = vi.fn();
const mockMeterTtsUsage = vi.fn();

vi.mock('@/lib/billing/metering', () => ({
    getUsage: (...args: unknown[]) => mockGetUsage(...args),
    checkUsageLimits: (...args: unknown[]) => mockCheckUsageLimits(...args),
    meterTtsUsage: (...args: unknown[]) => mockMeterTtsUsage(...args),
}));

// ── Mock logger ──────────────────────────────────────────────────────────

vi.mock('@/lib/utils/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ═════════════════════════════════════════════════════════════════════════════
// Usage Guard — checkCallAllowed
// ═════════════════════════════════════════════════════════════════════════════

describe('usage-guard — checkCallAllowed', () => {
    const mockDb = {} as FirebaseFirestore.Firestore;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        mockGetUsage.mockResolvedValue({ totalMinutes: 50, totalCalls: 20 });
        mockCheckUsageLimits.mockReturnValue({ usagePercent: 50, callPercent: 20 });
    });

    it('should allow call when within limits', async () => {
        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123', 'starter');

        expect(result.allowed).toBe(true);
        expect(result.usagePercent).toBe(50);
        expect(result.callPercent).toBe(20);
    });

    it('should deny when minute usage >= 120%', async () => {
        mockCheckUsageLimits.mockReturnValue({ usagePercent: 125, callPercent: 80 });

        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123', 'starter');

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('dakika');
    });

    it('should deny when call count >= 120%', async () => {
        mockCheckUsageLimits.mockReturnValue({ usagePercent: 80, callPercent: 130 });

        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123', 'professional');

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('çağrı');
    });

    it('should allow at 119% (below hard limit)', async () => {
        mockCheckUsageLimits.mockReturnValue({ usagePercent: 119, callPercent: 119 });

        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123');

        expect(result.allowed).toBe(true);
    });

    it('should deny at exactly 120% (at hard limit)', async () => {
        mockCheckUsageLimits.mockReturnValue({ usagePercent: 120, callPercent: 50 });

        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123');

        expect(result.allowed).toBe(false);
    });

    it('should fail-open on error', async () => {
        mockGetUsage.mockRejectedValue(new Error('DB error'));

        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123');

        expect(result.allowed).toBe(true);
    });

    it('should default to starter tier', async () => {
        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        await checkCallAllowed(mockDb, 'tenant-123');

        expect(mockCheckUsageLimits).toHaveBeenCalledWith(expect.anything(), 'starter');
    });

    it('should pass custom tier name', async () => {
        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        await checkCallAllowed(mockDb, 'tenant-123', 'enterprise');

        expect(mockCheckUsageLimits).toHaveBeenCalledWith(expect.anything(), 'enterprise');
    });

    it('should prioritize minute limit over call limit', async () => {
        mockCheckUsageLimits.mockReturnValue({ usagePercent: 125, callPercent: 130 });

        const { checkCallAllowed } = await import('@/lib/billing/usage-guard');
        const result = await checkCallAllowed(mockDb, 'tenant-123');

        expect(result.allowed).toBe(false);
        // First check is minutes (usagePercent), so reason should mention minutes
        expect(result.reason).toContain('dakika');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cost Monitor — shouldUseEmergencyTts
// ═════════════════════════════════════════════════════════════════════════════

describe('cost-monitor — shouldUseEmergencyTts', () => {
    function buildMockDb(config?: Partial<{
        emergencyModeActive: boolean;
        ttsMonthlyCharBudget: number;
    }>) {
        const mockData = config ? {
            emergencyModeActive: config.emergencyModeActive ?? false,
            ttsMonthlyCharBudget: config.ttsMonthlyCharBudget ?? 500000,
            ttsWarningThresholdPercent: 80,
            ttsCriticalThresholdPercent: 95,
            emergencyModeEnabled: true,
            emergencyModeManualOverride: false,
        } : null;

        const db = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockReturnValue({
                        doc: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue({
                                exists: !!mockData,
                                data: () => mockData,
                            }),
                            set: vi.fn().mockResolvedValue(undefined),
                            update: vi.fn().mockResolvedValue(undefined),
                        }),
                    }),
                    get: vi.fn().mockResolvedValue({
                        exists: !!mockData,
                        data: () => mockData,
                    }),
                }),
            }),
        };

        return db as unknown as FirebaseFirestore.Firestore;
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('should return false when emergency mode is not active', async () => {
        const db = buildMockDb({ emergencyModeActive: false });

        const { shouldUseEmergencyTts } = await import('@/lib/billing/cost-monitor');
        const result = await shouldUseEmergencyTts(db, 'tenant-123');

        expect(result).toBe(false);
    });

    it('should return true when emergency mode is active', async () => {
        const db = buildMockDb({ emergencyModeActive: true });

        const { shouldUseEmergencyTts } = await import('@/lib/billing/cost-monitor');
        const result = await shouldUseEmergencyTts(db, 'tenant-123');

        expect(result).toBe(true);
    });

    it('should return false when config does not exist (defaults)', async () => {
        const db = buildMockDb(); // no config = null data

        const { shouldUseEmergencyTts } = await import('@/lib/billing/cost-monitor');
        const result = await shouldUseEmergencyTts(db, 'tenant-no-config');

        expect(result).toBe(false);
    });

    it('should return false on error (fail-safe)', async () => {
        const db = {
            collection: vi.fn().mockImplementation(() => {
                throw new Error('Firestore unavailable');
            }),
        } as unknown as FirebaseFirestore.Firestore;

        const { shouldUseEmergencyTts } = await import('@/lib/billing/cost-monitor');
        const result = await shouldUseEmergencyTts(db, 'tenant-error');

        expect(result).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cost Monitor — getEmergencyModeStatus
// ═════════════════════════════════════════════════════════════════════════════

describe('cost-monitor — getEmergencyModeStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    it('should return full status with usage data', async () => {
        const mockConfigData = {
            ttsMonthlyCharBudget: 500000,
            ttsWarningThresholdPercent: 80,
            ttsCriticalThresholdPercent: 95,
            emergencyModeEnabled: true,
            emergencyModeActive: false,
            emergencyModeManualOverride: false,
        };

        const mockUsageData = {
            ttsChars: 200000,
        };

        const mockAlertDocs: Array<{ data: () => Record<string, unknown> }> = [];

        const db = {
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockImplementation((collName: string) => {
                        if (collName === 'config') {
                            return {
                                doc: vi.fn().mockReturnValue({
                                    get: vi.fn().mockResolvedValue({
                                        exists: true,
                                        data: () => mockConfigData,
                                    }),
                                }),
                            };
                        }
                        if (collName === 'usage') {
                            return {
                                doc: vi.fn().mockReturnValue({
                                    get: vi.fn().mockResolvedValue({
                                        exists: true,
                                        data: () => mockUsageData,
                                    }),
                                }),
                            };
                        }
                        if (collName === 'cost_alerts') {
                            return {
                                orderBy: vi.fn().mockReturnValue({
                                    limit: vi.fn().mockReturnValue({
                                        get: vi.fn().mockResolvedValue({
                                            docs: mockAlertDocs,
                                        }),
                                    }),
                                }),
                            };
                        }
                        return {};
                    }),
                }),
            }),
        } as unknown as FirebaseFirestore.Firestore;

        const { getEmergencyModeStatus } = await import('@/lib/billing/cost-monitor');
        const status = await getEmergencyModeStatus(db, 'tenant-123');

        expect(status.active).toBe(false);
        expect(status.ttsCharsUsed).toBe(200000);
        expect(status.ttsCharsBudget).toBe(500000);
        expect(status.percentUsed).toBe(40);
    });
});
