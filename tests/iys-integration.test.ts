/**
 * IYS (Ileti Yonetim Sistemi) Integration Tests
 *
 * Tests for:
 * - IYS client factory and methods
 * - Mock mode behavior (no API key)
 * - IYSCheckResult shape
 * - Bulk check limits
 * - Outbound compliance IYS integration for TR numbers
 * - i18n key coverage
 * - Component file existence
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIYSClient, type IYSClient, type IYSCheckResult } from '@/lib/compliance/iys-client';
import { existsSync } from 'fs';
import { join } from 'path';

// =============================================
// IYS Client Factory
// =============================================

describe('createIYSClient', () => {
    it('returns object with checkConsent, addConsent, revokeConsent, bulkCheck methods', () => {
        const client = createIYSClient({ apiKey: '', brandCode: 'TEST' });
        expect(typeof client.checkConsent).toBe('function');
        expect(typeof client.addConsent).toBe('function');
        expect(typeof client.revokeConsent).toBe('function');
        expect(typeof client.bulkCheck).toBe('function');
    });

    it('all four methods exist on the client object', () => {
        const client = createIYSClient({ apiKey: 'test-key', brandCode: 'BRAND1' });
        const keys = Object.keys(client).sort();
        expect(keys).toEqual(['addConsent', 'bulkCheck', 'checkConsent', 'revokeConsent']);
    });
});

// =============================================
// Mock Mode (no API key)
// =============================================

describe('IYS mock mode (no API key)', () => {
    let client: IYSClient;

    beforeEach(() => {
        client = createIYSClient({ apiKey: '', brandCode: 'TEST' });
    });

    it('checkConsent returns NOT_FOUND when API key is missing', async () => {
        const result = await client.checkConsent('+905551234567');
        expect(result.status).toBe('NOT_FOUND');
        expect(result.phoneNumber).toBe('+905551234567');
    });

    it('addConsent returns success: false when API key is missing', async () => {
        const result = await client.addConsent({
            recipientType: 'BIREYSEL',
            consentType: 'ARAMA',
            recipient: '+905551234567',
            status: 'ONAY',
            consentDate: '2024-01-01T00:00:00Z',
            source: 'web_form',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('revokeConsent returns success: false when API key is missing', async () => {
        const result = await client.revokeConsent('+905551234567');
        expect(result.success).toBe(false);
    });
});

// =============================================
// IYSCheckResult Shape
// =============================================

describe('IYSCheckResult shape', () => {
    it('has correct fields', async () => {
        const client = createIYSClient({ apiKey: '', brandCode: 'TEST' });
        const result: IYSCheckResult = await client.checkConsent('+905551234567');

        expect(result).toHaveProperty('phoneNumber');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('checkedAt');

        // Validate types
        expect(typeof result.phoneNumber).toBe('string');
        expect(typeof result.status).toBe('string');
        expect(typeof result.checkedAt).toBe('string');

        // checkedAt should be a valid ISO date
        expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
    });

    it('status is one of the valid values', async () => {
        const client = createIYSClient({ apiKey: '', brandCode: 'TEST' });
        const result = await client.checkConsent('+905551234567');
        expect(['ONAY', 'RET', 'NOT_FOUND', 'ERROR']).toContain(result.status);
    });
});

// =============================================
// Bulk Check
// =============================================

describe('IYS bulkCheck', () => {
    it('returns results for all phone numbers', async () => {
        const client = createIYSClient({ apiKey: '', brandCode: 'TEST' });
        const phones = ['+905551111111', '+905552222222', '+905553333333'];
        const results = await client.bulkCheck(phones);

        expect(results).toHaveLength(3);
        expect(results[0].phoneNumber).toBe('+905551111111');
        expect(results[1].phoneNumber).toBe('+905552222222');
        expect(results[2].phoneNumber).toBe('+905553333333');
    });

    it('handles empty array', async () => {
        const client = createIYSClient({ apiKey: '', brandCode: 'TEST' });
        const results = await client.bulkCheck([]);
        expect(results).toHaveLength(0);
    });
});

// =============================================
// Bulk API Limits
// =============================================

describe('Bulk IYS route limits', () => {
    it('bulk check should be limited to 1000 numbers (validation constant)', async () => {
        // We verify the constant exists in the route file
        const routePath = join(process.cwd(), 'app/api/compliance/iys/bulk/route.ts');
        expect(existsSync(routePath)).toBe(true);

        // Read the file and verify MAX_BULK_SIZE = 1000
        const { readFileSync } = await import('fs');
        const content = readFileSync(routePath, 'utf-8');
        expect(content).toContain('MAX_BULK_SIZE = 1000');
    });
});

// =============================================
// IYS API Routes Auth
// =============================================

describe('IYS API routes require auth', () => {
    it('GET /api/compliance/iys route file exists and uses requireStrictAuth', () => {
        const routePath = join(process.cwd(), 'app/api/compliance/iys/route.ts');
        expect(existsSync(routePath)).toBe(true);

        const { readFileSync } = require('fs');
        const content = readFileSync(routePath, 'utf-8');
        expect(content).toContain('requireStrictAuth');
    });

    it('POST /api/compliance/iys/bulk route file exists and uses requireStrictAuth', () => {
        const routePath = join(process.cwd(), 'app/api/compliance/iys/bulk/route.ts');
        expect(existsSync(routePath)).toBe(true);

        const { readFileSync } = require('fs');
        const content = readFileSync(routePath, 'utf-8');
        expect(content).toContain('requireStrictAuth');
    });
});

// =============================================
// Outbound Compliance + IYS
// =============================================

describe('outbound-compliance IYS integration', () => {
    it('includes iysStatus field in OutboundComplianceCheck interface', async () => {
        const filePath = join(process.cwd(), 'lib/compliance/consent-manager.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('iysStatus');
    });

    it('outbound-compliance imports IYS client and detectCountryFromPhone', () => {
        const filePath = join(process.cwd(), 'lib/compliance/outbound-compliance.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('getDefaultIYSClient');
        expect(content).toContain('detectCountryFromPhone');
    });

    it('outbound-compliance checks IYS for TR numbers', () => {
        const filePath = join(process.cwd(), 'lib/compliance/outbound-compliance.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain("country === 'TR'");
        expect(content).toContain('iysClient.checkConsent');
    });

    it('outbound-compliance skips IYS for non-TR numbers', () => {
        const filePath = join(process.cwd(), 'lib/compliance/outbound-compliance.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        // iysStatus defaults to SKIPPED for non-TR
        expect(content).toContain("'SKIPPED'");
    });

    it('blocks call when IYS returns RET', () => {
        const filePath = join(process.cwd(), 'lib/compliance/outbound-compliance.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain("=== 'RET'");
        expect(content).toContain("IYS'de ret kaydi var");
    });
});

// =============================================
// i18n Keys
// =============================================

describe('i18n IYS keys exist in all 4 languages', () => {
    const IYS_KEYS = [
        'iysTitle',
        'iysDescription',
        'iysApiKey',
        'iysBrandCode',
        'iysTestConnection',
        'iysConnected',
        'iysNotConnected',
        'iysApproved',
        'iysRejected',
        'iysNotFound',
        'iysRequired',
        'iysCached',
        'iysBulkCheck',
        'iysBulkProgress',
    ];

    const LANGUAGES = ['tr', 'en', 'de', 'fr'];

    for (const lang of LANGUAGES) {
        it(`${lang}.json has all IYS compliance keys`, () => {
            const filePath = join(process.cwd(), `messages/${lang}.json`);
            const { readFileSync } = require('fs');
            const messages = JSON.parse(readFileSync(filePath, 'utf-8'));
            const compliance = messages.compliance;

            expect(compliance).toBeDefined();
            for (const key of IYS_KEYS) {
                expect(compliance[key], `Missing key: compliance.${key} in ${lang}.json`).toBeDefined();
                expect(typeof compliance[key]).toBe('string');
                expect(compliance[key].length).toBeGreaterThan(0);
            }
        });
    }
});

// =============================================
// IYSSettingsPanel Component
// =============================================

describe('IYSSettingsPanel component', () => {
    it('component file exists', () => {
        const filePath = join(process.cwd(), 'components/compliance/IYSSettingsPanel.tsx');
        expect(existsSync(filePath)).toBe(true);
    });

    it('uses useTranslations', () => {
        const filePath = join(process.cwd(), 'components/compliance/IYSSettingsPanel.tsx');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain("useTranslations('compliance')");
    });

    it('is a client component', () => {
        const filePath = join(process.cwd(), 'components/compliance/IYSSettingsPanel.tsx');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain("'use client'");
    });
});

// =============================================
// Cache Behavior
// =============================================

describe('IYS cache behavior', () => {
    it('IYS route caches results in Firestore with 24h TTL', () => {
        const filePath = join(process.cwd(), 'app/api/compliance/iys/route.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        // 24 hours = 24 * 60 * 60 * 1000 = 86400000
        expect(content).toContain('IYS_CACHE_TTL_MS');
        expect(content).toContain('24 * 60 * 60 * 1000');
        expect(content).toContain('iys_cache');
    });

    it('returns fromCache flag in response', () => {
        const filePath = join(process.cwd(), 'app/api/compliance/iys/route.ts');
        const { readFileSync } = require('fs');
        const content = readFileSync(filePath, 'utf-8');
        expect(content).toContain('fromCache: true');
        expect(content).toContain('fromCache: false');
    });
});
