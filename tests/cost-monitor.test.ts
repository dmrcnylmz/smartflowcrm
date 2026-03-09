/**
 * Cost Monitor Tests — TTS Budget Tracking & Emergency Mode
 *
 * Tests for lib/billing/cost-monitor.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Firebase Admin mock ──
vi.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
}));

// ── Alert dispatcher mock ──
const mockAlertEmergencyModeActivated = vi.fn();
const mockAlertEmergencyModeDeactivated = vi.fn();
const mockAlertCostThresholdWarning = vi.fn();

vi.mock('@/lib/billing/alert-dispatcher', () => ({
    alertEmergencyModeActivated: (...args: unknown[]) => mockAlertEmergencyModeActivated(...args),
    alertEmergencyModeDeactivated: (...args: unknown[]) => mockAlertEmergencyModeDeactivated(...args),
    alertCostThresholdWarning: (...args: unknown[]) => mockAlertCostThresholdWarning(...args),
}));

// ── Firestore mock helpers ──
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockAdd = vi.fn();
const mockWhereGet = vi.fn();
const mockOrderByGet = vi.fn();

function createMockDb() {
    const db = {
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                    }),
                    add: mockAdd,
                    get: vi.fn().mockResolvedValue({ docs: [] }),
                    where: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            limit: vi.fn().mockReturnValue({
                                get: mockWhereGet,
                            }),
                        }),
                        limit: vi.fn().mockReturnValue({
                            get: mockWhereGet,
                        }),
                    }),
                    orderBy: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                            get: mockOrderByGet,
                        }),
                    }),
                }),
            }),
        }),
    };
    return db as unknown as FirebaseFirestore.Firestore;
}

// ── Import module under test ──
import {
    shouldUseEmergencyTts,
    getCostMonitoringConfig,
    checkCostThresholds,
    activateEmergencyMode,
    deactivateEmergencyMode,
    getEmergencyModeStatus,
    invalidateConfigCache,
} from '@/lib/billing/cost-monitor';

describe('Cost Monitor', () => {
    let db: FirebaseFirestore.Firestore;

    beforeEach(() => {
        // Reset all mock fn state AND implementations (clears mockResolvedValueOnce queue)
        mockGet.mockReset();
        mockSet.mockReset();
        mockAdd.mockReset();
        mockWhereGet.mockReset();
        mockOrderByGet.mockReset();
        mockAlertEmergencyModeActivated.mockReset();
        mockAlertEmergencyModeDeactivated.mockReset();
        mockAlertCostThresholdWarning.mockReset();

        db = createMockDb();

        // Default: config doc does not exist
        mockGet.mockResolvedValue({ exists: false, data: () => null });
        mockWhereGet.mockResolvedValue({ empty: true, docs: [] });
        mockOrderByGet.mockResolvedValue({ docs: [] });
        mockSet.mockResolvedValue(undefined);
        mockAdd.mockResolvedValue({ id: 'alert-1' });

        // Invalidate cache between tests to ensure clean state
        invalidateConfigCache('tenant-123');
        invalidateConfigCache('tenant-456');
    });

    afterEach(() => {
        // Clean up any remaining cache
        invalidateConfigCache('tenant-123');
        invalidateConfigCache('tenant-456');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // shouldUseEmergencyTts
    // ─────────────────────────────────────────────────────────────────────────

    describe('shouldUseEmergencyTts', () => {
        it('1. returns false by default when no config doc exists', async () => {
            mockGet.mockResolvedValue({ exists: false, data: () => null });

            const result = await shouldUseEmergencyTts(db, 'tenant-123');

            expect(result).toBe(false);
        });

        it('2. returns true when emergency mode is active', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ emergencyModeActive: true }),
            });

            const result = await shouldUseEmergencyTts(db, 'tenant-456');

            expect(result).toBe(true);
        });

        it('3. returns false on Firestore error (fail-safe)', async () => {
            mockGet.mockRejectedValue(new Error('Firestore unavailable'));

            const result = await shouldUseEmergencyTts(db, 'tenant-123');

            expect(result).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // getCostMonitoringConfig
    // ─────────────────────────────────────────────────────────────────────────

    describe('getCostMonitoringConfig', () => {
        it('4. returns default config when no doc exists', async () => {
            mockGet.mockResolvedValue({ exists: false, data: () => null });

            const config = await getCostMonitoringConfig(db, 'tenant-123');

            expect(config).toEqual({
                ttsMonthlyCharBudget: 500_000,
                ttsWarningThresholdPercent: 80,
                ttsCriticalThresholdPercent: 95,
                emergencyModeEnabled: true,
                emergencyModeActive: false,
                emergencyModeManualOverride: false,
            });
        });

        it('5. uses cached config within 60s TTL', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 1_000_000 }),
            });

            // First call: fetches from Firestore
            const config1 = await getCostMonitoringConfig(db, 'tenant-123');
            expect(config1.ttsMonthlyCharBudget).toBe(1_000_000);

            // Change Firestore response — should NOT be read on second call
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 2_000_000 }),
            });

            // Second call: should use cache
            const config2 = await getCostMonitoringConfig(db, 'tenant-123');
            expect(config2.ttsMonthlyCharBudget).toBe(1_000_000);
        });

        it('6. refreshes config after TTL expires', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 1_000_000 }),
            });

            // First call: fetches from Firestore
            await getCostMonitoringConfig(db, 'tenant-123');

            // Simulate TTL expiry by advancing Date.now
            const originalNow = Date.now;
            Date.now = () => originalNow() + 61_000; // 61 seconds later

            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 2_000_000 }),
            });

            const config = await getCostMonitoringConfig(db, 'tenant-123');
            expect(config.ttsMonthlyCharBudget).toBe(2_000_000);

            // Restore Date.now
            Date.now = originalNow;
        });

        it('7. merges Firestore data with defaults', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    ttsMonthlyCharBudget: 750_000,
                    emergencyModeActive: true,
                }),
            });

            const config = await getCostMonitoringConfig(db, 'tenant-123');

            expect(config.ttsMonthlyCharBudget).toBe(750_000);
            expect(config.emergencyModeActive).toBe(true);
            // Defaults should fill in the rest
            expect(config.ttsWarningThresholdPercent).toBe(80);
            expect(config.ttsCriticalThresholdPercent).toBe(95);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // checkCostThresholds
    // ─────────────────────────────────────────────────────────────────────────

    describe('checkCostThresholds', () => {
        it('8. below 80% threshold — no alerts fired', async () => {
            // Config doc
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    ttsMonthlyCharBudget: 500_000,
                    ttsWarningThresholdPercent: 80,
                    ttsCriticalThresholdPercent: 95,
                    emergencyModeEnabled: true,
                    emergencyModeActive: false,
                    emergencyModeManualOverride: false,
                }),
            });
            // Usage doc — 50% usage
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 250_000 }),
            });

            await checkCostThresholds(db, 'tenant-123');

            expect(mockAlertCostThresholdWarning).not.toHaveBeenCalled();
            expect(mockAlertEmergencyModeActivated).not.toHaveBeenCalled();
        });

        it('9. at 80% threshold — fires warning alert', async () => {
            // Config doc
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    ttsMonthlyCharBudget: 500_000,
                    ttsWarningThresholdPercent: 80,
                    ttsCriticalThresholdPercent: 95,
                    emergencyModeEnabled: true,
                    emergencyModeActive: false,
                    emergencyModeManualOverride: false,
                }),
            });
            // Usage doc — exactly 80%
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 400_000 }),
            });
            // writeAlertIfNew check — no existing alert today
            mockWhereGet.mockResolvedValueOnce({ empty: true, docs: [] });

            await checkCostThresholds(db, 'tenant-123');

            expect(mockAlertCostThresholdWarning).toHaveBeenCalledWith(
                'tenant-123',
                'warning',
                80,
                expect.any(Number),
            );
        });

        it('10. at 95% threshold — fires critical alert and activates emergency mode', async () => {
            // Config doc (first read in checkCostThresholds)
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    ttsMonthlyCharBudget: 500_000,
                    ttsWarningThresholdPercent: 80,
                    ttsCriticalThresholdPercent: 95,
                    emergencyModeEnabled: true,
                    emergencyModeActive: false,
                    emergencyModeManualOverride: false,
                }),
            });
            // Usage doc (in checkCostThresholds)
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 475_000 }),
            });
            // writeAlertIfNew — critical alert check
            mockWhereGet.mockResolvedValue({ empty: true, docs: [] });
            // activateEmergencyMode — set config
            mockSet.mockResolvedValue(undefined);
            // activateEmergencyMode — usage doc read + getCostMonitoringConfig
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ ttsChars: 475_000, ttsMonthlyCharBudget: 500_000 }),
            });

            await checkCostThresholds(db, 'tenant-123');

            expect(mockAlertCostThresholdWarning).toHaveBeenCalledWith(
                'tenant-123',
                'critical',
                95,
                expect.any(Number),
            );
            expect(mockAlertEmergencyModeActivated).toHaveBeenCalledWith(
                'tenant-123',
                'auto_threshold',
                expect.any(Number),
                expect.any(Number),
            );
        });

        it('11. never throws — swallows errors silently', async () => {
            // Force config read to throw
            mockGet.mockRejectedValue(new Error('Firestore down'));

            // Should NOT throw
            await expect(checkCostThresholds(db, 'tenant-123')).resolves.toBeUndefined();
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // activateEmergencyMode
    // ─────────────────────────────────────────────────────────────────────────

    describe('activateEmergencyMode', () => {
        it('12. writes emergency mode to Firestore and dispatches alert', async () => {
            mockSet.mockResolvedValue(undefined);
            mockAdd.mockResolvedValue({ id: 'alert-1' });
            // Usage doc read
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 480_000 }),
            });
            // getCostMonitoringConfig read (after cache invalidation)
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    ttsMonthlyCharBudget: 500_000,
                    emergencyModeActive: true,
                }),
            });

            await activateEmergencyMode(db, 'tenant-123', 'auto_threshold');

            // Should write config with emergencyModeActive: true
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    emergencyModeActive: true,
                    lastUpdated: 'MOCK_TS',
                }),
                { merge: true },
            );

            // Should write alert document
            expect(mockAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'emergency_activated',
                    reason: 'auto_threshold',
                }),
            );

            // Should dispatch notification
            expect(mockAlertEmergencyModeActivated).toHaveBeenCalledWith(
                'tenant-123',
                'auto_threshold',
                expect.any(Number),
                expect.any(Number),
            );
        });

        it('13. sets manualOverride to true when reason is manual', async () => {
            mockSet.mockResolvedValue(undefined);
            mockAdd.mockResolvedValue({ id: 'alert-1' });
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 100_000 }),
            });
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 500_000 }),
            });

            await activateEmergencyMode(db, 'tenant-123', 'manual');

            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    emergencyModeActive: true,
                    emergencyModeManualOverride: true,
                }),
                { merge: true },
            );
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // deactivateEmergencyMode
    // ─────────────────────────────────────────────────────────────────────────

    describe('deactivateEmergencyMode', () => {
        it('14. clears Firestore flag and dispatches deactivation alert', async () => {
            mockSet.mockResolvedValue(undefined);
            mockAdd.mockResolvedValue({ id: 'alert-2' });

            await deactivateEmergencyMode(db, 'tenant-123');

            // Should write config with emergencyModeActive: false
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    emergencyModeActive: false,
                    emergencyModeManualOverride: false,
                    lastUpdated: 'MOCK_TS',
                }),
                { merge: true },
            );

            // Should write deactivation alert document
            expect(mockAdd).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'emergency_deactivated',
                    reason: 'manual_deactivation',
                }),
            );

            // Should dispatch notification
            expect(mockAlertEmergencyModeDeactivated).toHaveBeenCalledWith('tenant-123');
        });

        it('15. invalidates config cache after deactivation', async () => {
            // First, populate the cache
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ emergencyModeActive: true }),
            });
            const configBefore = await getCostMonitoringConfig(db, 'tenant-123');
            expect(configBefore.emergencyModeActive).toBe(true);

            // Deactivate
            mockSet.mockResolvedValue(undefined);
            mockAdd.mockResolvedValue({ id: 'alert-2' });
            await deactivateEmergencyMode(db, 'tenant-123');

            // Next getCostMonitoringConfig should re-read from Firestore (cache was invalidated)
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ emergencyModeActive: false }),
            });
            const configAfter = await getCostMonitoringConfig(db, 'tenant-123');
            expect(configAfter.emergencyModeActive).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // invalidateConfigCache
    // ─────────────────────────────────────────────────────────────────────────

    describe('invalidateConfigCache', () => {
        it('16. clears cache so next read hits Firestore', async () => {
            // Populate cache
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 1_000_000 }),
            });
            await getCostMonitoringConfig(db, 'tenant-123');

            // Invalidate
            invalidateConfigCache('tenant-123');

            // Next read should hit Firestore with new data
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 2_000_000 }),
            });
            const config = await getCostMonitoringConfig(db, 'tenant-123');
            expect(config.ttsMonthlyCharBudget).toBe(2_000_000);
        });

        it('17. does not affect other tenants cache', async () => {
            // Populate cache for both tenants
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 1_000_000 }),
            });
            await getCostMonitoringConfig(db, 'tenant-123');

            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 750_000 }),
            });
            await getCostMonitoringConfig(db, 'tenant-456');

            // Invalidate only tenant-123
            invalidateConfigCache('tenant-123');

            // tenant-456 should still use cache
            const config456 = await getCostMonitoringConfig(db, 'tenant-456');
            expect(config456.ttsMonthlyCharBudget).toBe(750_000); // cached value
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // getEmergencyModeStatus
    // ─────────────────────────────────────────────────────────────────────────

    describe('getEmergencyModeStatus', () => {
        it('18. returns full emergency status with usage and alerts', async () => {
            // Config doc
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({
                    ttsMonthlyCharBudget: 500_000,
                    emergencyModeActive: true,
                    emergencyModeManualOverride: false,
                }),
            });
            // Usage doc
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 450_000 }),
            });
            // Recent alerts
            mockOrderByGet.mockResolvedValueOnce({
                docs: [
                    {
                        data: () => ({
                            type: 'critical',
                            ttsCharsUsed: 450_000,
                            ttsCharsBudget: 500_000,
                            percentUsed: 90,
                            estimatedCostUsd: 67.5,
                            timestamp: { toDate: () => new Date('2026-03-09T10:00:00Z') },
                            reason: 'auto_threshold',
                        }),
                    },
                ],
            });

            const status = await getEmergencyModeStatus(db, 'tenant-123');

            expect(status.active).toBe(true);
            expect(status.manualOverride).toBe(false);
            expect(status.ttsCharsUsed).toBe(450_000);
            expect(status.ttsCharsBudget).toBe(500_000);
            expect(status.percentUsed).toBe(90);
            expect(status.estimatedCostUsd).toBeGreaterThan(0);
            expect(status.recentAlerts).toHaveLength(1);
            expect(status.recentAlerts[0].type).toBe('critical');
        });

        it('19. returns defaults when nothing is configured', async () => {
            // No config doc
            mockGet.mockResolvedValueOnce({ exists: false, data: () => null });
            // No usage doc
            mockGet.mockResolvedValueOnce({ exists: false, data: () => undefined });
            // No alerts
            mockOrderByGet.mockResolvedValueOnce({ docs: [] });

            const status = await getEmergencyModeStatus(db, 'tenant-123');

            expect(status.active).toBe(false);
            expect(status.manualOverride).toBe(false);
            expect(status.ttsCharsUsed).toBe(0);
            expect(status.ttsCharsBudget).toBe(500_000);
            expect(status.percentUsed).toBe(0);
            expect(status.estimatedCostUsd).toBe(0);
            expect(status.recentAlerts).toEqual([]);
        });

        it('20. handles alert timestamps without toDate gracefully', async () => {
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsMonthlyCharBudget: 500_000 }),
            });
            mockGet.mockResolvedValueOnce({
                exists: true,
                data: () => ({ ttsChars: 100_000 }),
            });
            // Alert with no toDate method on timestamp
            mockOrderByGet.mockResolvedValueOnce({
                docs: [
                    {
                        data: () => ({
                            type: 'warning',
                            ttsCharsUsed: 100_000,
                            ttsCharsBudget: 500_000,
                            percentUsed: 20,
                            estimatedCostUsd: 15,
                            timestamp: null,
                        }),
                    },
                ],
            });

            const status = await getEmergencyModeStatus(db, 'tenant-123');

            expect(status.recentAlerts).toHaveLength(1);
            expect(status.recentAlerts[0].timestamp).toBeInstanceOf(Date);
        });
    });
});
