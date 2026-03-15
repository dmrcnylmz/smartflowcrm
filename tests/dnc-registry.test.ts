/**
 * DNC Registry Tests
 *
 * Tests for:
 * - Client creation (FTC, TPS, Bloctel)
 * - Country → client mapping
 * - Mock mode behavior
 * - Auto-detection from phone prefix
 * - Integration with outbound-compliance
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Reset singletons between tests
beforeEach(async () => {
    const { resetDNCClients, clearDNCCache } = await import('@/lib/compliance/dnc-registry');
    resetDNCClients();
    clearDNCCache();
});

// =============================================
// Unit Tests: Client Creation
// =============================================

describe('DNC Registry — Client Creation', () => {
    it('createFTCClient returns a DNCClient with check and bulkCheck', async () => {
        const { createFTCClient } = await import('@/lib/compliance/dnc-registry');
        const client = createFTCClient();

        expect(client).toBeDefined();
        expect(typeof client.check).toBe('function');
        expect(typeof client.bulkCheck).toBe('function');
    });

    it('createTPSClient returns a DNCClient with check and bulkCheck', async () => {
        const { createTPSClient } = await import('@/lib/compliance/dnc-registry');
        const client = createTPSClient();

        expect(client).toBeDefined();
        expect(typeof client.check).toBe('function');
        expect(typeof client.bulkCheck).toBe('function');
    });

    it('createBlocktelClient returns a DNCClient with check and bulkCheck', async () => {
        const { createBlocktelClient } = await import('@/lib/compliance/dnc-registry');
        const client = createBlocktelClient();

        expect(client).toBeDefined();
        expect(typeof client.check).toBe('function');
        expect(typeof client.bulkCheck).toBe('function');
    });
});

// =============================================
// Unit Tests: Country → Client Mapping
// =============================================

describe('DNC Registry — getDNCClientForCountry', () => {
    it('returns FTC client for US', async () => {
        const { getDNCClientForCountry } = await import('@/lib/compliance/dnc-registry');
        const client = getDNCClientForCountry('US');
        expect(client).not.toBeNull();
    });

    it('returns TPS client for UK', async () => {
        const { getDNCClientForCountry } = await import('@/lib/compliance/dnc-registry');
        const client = getDNCClientForCountry('UK');
        expect(client).not.toBeNull();
    });

    it('returns Bloctel client for FR', async () => {
        const { getDNCClientForCountry } = await import('@/lib/compliance/dnc-registry');
        const client = getDNCClientForCountry('FR');
        expect(client).not.toBeNull();
    });

    it('returns null for TR (no DNC registry)', async () => {
        const { getDNCClientForCountry } = await import('@/lib/compliance/dnc-registry');
        const client = getDNCClientForCountry('TR');
        expect(client).toBeNull();
    });

    it('returns null for DE (no DNC registry)', async () => {
        const { getDNCClientForCountry } = await import('@/lib/compliance/dnc-registry');
        const client = getDNCClientForCountry('DE');
        expect(client).toBeNull();
    });

    it('returns null for OTHER (no DNC registry)', async () => {
        const { getDNCClientForCountry } = await import('@/lib/compliance/dnc-registry');
        const client = getDNCClientForCountry('OTHER');
        expect(client).toBeNull();
    });
});

// =============================================
// Unit Tests: Mock Mode
// =============================================

describe('DNC Registry — Mock Mode (no API key)', () => {
    it('FTC mock mode: check returns isRegistered false', async () => {
        const { createFTCClient } = await import('@/lib/compliance/dnc-registry');
        const client = createFTCClient(); // no API key = mock mode

        const result = await client.check('+12025551234');
        expect(result.isRegistered).toBe(false);
        expect(result.registry).toBe('FTC');
        expect(result.phoneNumber).toBe('+12025551234');
        expect(result.checkedAt).toBeTruthy();
    });

    it('TPS mock mode: check returns isRegistered false', async () => {
        const { createTPSClient } = await import('@/lib/compliance/dnc-registry');
        const client = createTPSClient();

        const result = await client.check('+442071234567');
        expect(result.isRegistered).toBe(false);
        expect(result.registry).toBe('TPS');
    });

    it('Bloctel mock mode: check returns isRegistered false', async () => {
        const { createBlocktelClient } = await import('@/lib/compliance/dnc-registry');
        const client = createBlocktelClient();

        const result = await client.check('+33123456789');
        expect(result.isRegistered).toBe(false);
        expect(result.registry).toBe('BLOCTEL');
    });

    it('FTC mock mode: bulkCheck returns all isRegistered false', async () => {
        const { createFTCClient } = await import('@/lib/compliance/dnc-registry');
        const client = createFTCClient();

        const results = await client.bulkCheck(['+12025551234', '+12025555678']);
        expect(results).toHaveLength(2);
        expect(results[0].isRegistered).toBe(false);
        expect(results[1].isRegistered).toBe(false);
    });
});

// =============================================
// Unit Tests: Auto-detect Country (checkDNC)
// =============================================

describe('DNC Registry — checkDNC auto-detection', () => {
    it('auto-detects US number and checks FTC', async () => {
        const { checkDNC } = await import('@/lib/compliance/dnc-registry');
        const result = await checkDNC('+12025551234');
        expect(result).not.toBeNull();
        expect(result!.registry).toBe('FTC');
        expect(result!.isRegistered).toBe(false);
    });

    it('auto-detects UK number and checks TPS', async () => {
        const { checkDNC } = await import('@/lib/compliance/dnc-registry');
        const result = await checkDNC('+442071234567');
        expect(result).not.toBeNull();
        expect(result!.registry).toBe('TPS');
    });

    it('auto-detects FR number and checks Bloctel', async () => {
        const { checkDNC } = await import('@/lib/compliance/dnc-registry');
        const result = await checkDNC('+33123456789');
        expect(result).not.toBeNull();
        expect(result!.registry).toBe('BLOCTEL');
    });

    it('returns null for Turkish number (no DNC registry)', async () => {
        const { checkDNC } = await import('@/lib/compliance/dnc-registry');
        const result = await checkDNC('+905321234567');
        expect(result).toBeNull();
    });

    it('returns null for German number (no DNC registry)', async () => {
        const { checkDNC } = await import('@/lib/compliance/dnc-registry');
        const result = await checkDNC('+491511234567');
        expect(result).toBeNull();
    });

    it('returns null for unknown country prefix', async () => {
        const { checkDNC } = await import('@/lib/compliance/dnc-registry');
        const result = await checkDNC('+81312345678'); // Japan
        expect(result).toBeNull();
    });
});

// =============================================
// Unit Tests: Cache Behavior
// =============================================

describe('DNC Registry — Caching', () => {
    it('second check returns cached result', async () => {
        const { createFTCClient, clearDNCCache } = await import('@/lib/compliance/dnc-registry');
        clearDNCCache();
        const client = createFTCClient();

        const result1 = await client.check('+12025551234');
        expect(result1.cached).toBe(false);

        const result2 = await client.check('+12025551234');
        expect(result2.cached).toBe(true);
        expect(result2.isRegistered).toBe(result1.isRegistered);
    });
});

// =============================================
// Integration: Outbound Compliance + DNC
// =============================================

describe('DNC Registry — Outbound Compliance Integration', () => {
    it('marketing call checks DNC for US number', async () => {
        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        // Marketing call to US number — should check DNC
        const result = await runOutboundComplianceCheck(
            'tenant-123',
            '+12025551234',
            'en',
            undefined, // no DB
            'marketing',
        );

        expect(result.dncChecked).toBe(true);
        // In mock mode, DNC won't block (isRegistered: false)
        // But consent check will block since no DB
        expect(result.callPurpose).toBe('marketing');
    });

    it('transactional call (appointment_reminder) skips DNC check', async () => {
        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const result = await runOutboundComplianceCheck(
            'tenant-123',
            '+12025551234',
            'en',
            undefined,
            'appointment_reminder',
        );

        // dncChecked is true because it's "not required, considered clean"
        expect(result.dncChecked).toBe(true);
        // Transactional calls don't require DNC check
        expect(result.reasons.every((r: string) => !r.includes('DNC'))).toBe(true);
    });

    it('service_followup call skips DNC check', async () => {
        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const result = await runOutboundComplianceCheck(
            'tenant-123',
            '+442071234567',
            'en',
            undefined,
            'service_followup',
        );

        expect(result.dncChecked).toBe(true);
        expect(result.reasons.every((r: string) => !r.includes('DNC'))).toBe(true);
    });

    it('b2b_outreach checks DNC for UK number', async () => {
        const { runOutboundComplianceCheck } = await import('@/lib/compliance/outbound-compliance');

        const result = await runOutboundComplianceCheck(
            'tenant-123',
            '+442071234567',
            'en',
            undefined,
            'b2b_outreach',
        );

        expect(result.dncChecked).toBe(true);
        expect(result.callPurpose).toBe('b2b_outreach');
    });
});

// =============================================
// Types
// =============================================

describe('DNC Registry — Type Exports', () => {
    it('exports DNCRegistry, DNCCheckResult, DNCClient types', async () => {
        const mod = await import('@/lib/compliance/dnc-registry');
        // Verify the module exports the expected functions
        expect(typeof mod.createFTCClient).toBe('function');
        expect(typeof mod.createTPSClient).toBe('function');
        expect(typeof mod.createBlocktelClient).toBe('function');
        expect(typeof mod.getDNCClientForCountry).toBe('function');
        expect(typeof mod.checkDNC).toBe('function');
        expect(typeof mod.clearDNCCache).toBe('function');
        expect(typeof mod.resetDNCClients).toBe('function');
    });
});
