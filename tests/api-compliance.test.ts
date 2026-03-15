/**
 * API Compliance Tests — Consent, Outbound-Check, ToS Acceptance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createAuthError } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: mockGet,
                        set: mockSet,
                    }),
                }),
            }),
        }),
    })),
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TS') },
}));

// ── requireStrictAuth mock ──
const mockRequireStrictAuth = vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    tenantId: 'tenant-123',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Compliance mocks ──
vi.mock('@/lib/compliance/consent-manager', () => ({
    checkOutboundConsent: vi.fn().mockResolvedValue({ status: 'granted', consentDate: '2024-01-01' }),
    recordOutboundConsent: vi.fn().mockResolvedValue(undefined),
    revokeConsent: vi.fn().mockResolvedValue(undefined),
    isConsentValid: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/compliance/outbound-compliance', () => ({
    runOutboundComplianceCheck: vi.fn().mockResolvedValue({
        overallAllowed: true,
        consentValid: true,
        callingHoursValid: true,
        reasons: [],
    }),
}));

vi.mock('@/lib/compliance/audit', () => ({
    logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((_err: unknown, context: string) =>
        new Response(JSON.stringify({ error: `${context} failed` }), { status: 500 }),
    ),
}));

describe('API Compliance Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    // ── Consent GET ──
    describe('/api/compliance/consent GET', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent?phone=%2B905551234567');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 when phone is missing', async () => {
            const { GET } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('phone');
        });

        it('should return consent status for valid phone', async () => {
            const { GET } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent?phone=%2B905551234567', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.phoneNumber).toBeDefined();
            expect(data.isValid).toBeDefined();
        });
    });

    // ── Consent POST ──
    describe('/api/compliance/consent POST', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { POST } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                method: 'POST',
                body: { phoneNumber: '+905551234567', consentStatus: 'granted', consentSource: 'manual' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 when phoneNumber is missing', async () => {
            const { POST } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { consentStatus: 'granted', consentSource: 'manual' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('phoneNumber');
        });

        it('should return 400 when consentStatus is invalid', async () => {
            const { POST } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { phoneNumber: '+905551234567', consentStatus: 'invalid', consentSource: 'manual' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('consentStatus');
        });

        it('should return 400 when consentSource is invalid', async () => {
            const { POST } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { phoneNumber: '+905551234567', consentStatus: 'granted', consentSource: 'invalid_source' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('consentSource');
        });

        it('should create consent with valid data', async () => {
            const { POST } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { phoneNumber: '+905551234567', consentStatus: 'granted', consentSource: 'manual' },
            });
            const response = await POST(request);
            expect(response.status).toBe(201);
            const data = await response.json();
            expect(data.message).toContain('Consent recorded');
        });
    });

    // ── Consent DELETE ──
    describe('/api/compliance/consent DELETE', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { DELETE } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent?phone=%2B905551234567', {
                method: 'DELETE',
            });
            const response = await DELETE(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 when phone is missing', async () => {
            const { DELETE } = await import('@/app/api/compliance/consent/route');
            const request = createMockRequest('/api/compliance/consent', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await DELETE(request);
            expect(response.status).toBe(400);
        });
    });

    // ── Outbound Check POST ──
    describe('/api/compliance/outbound-check POST', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { POST } = await import('@/app/api/compliance/outbound-check/route');
            const request = createMockRequest('/api/compliance/outbound-check', {
                method: 'POST',
                body: { phoneNumber: '+905551234567' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 when phoneNumber is missing', async () => {
            const { POST } = await import('@/app/api/compliance/outbound-check/route');
            const request = createMockRequest('/api/compliance/outbound-check', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {},
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('phoneNumber');
        });

        it('should return compliance check result for valid phone', async () => {
            const { POST } = await import('@/app/api/compliance/outbound-check/route');
            const request = createMockRequest('/api/compliance/outbound-check', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { phoneNumber: '+905551234567' },
            });
            const response = await POST(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.overallAllowed).toBeDefined();
        });
    });

    // ── ToS GET ──
    describe('/api/compliance/tos-acceptance GET', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/compliance/tos-acceptance/route');
            const request = createMockRequest('/api/compliance/tos-acceptance');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return accepted: false when no ToS doc exists', async () => {
            mockGet.mockResolvedValueOnce({ exists: false });

            const { GET } = await import('@/app/api/compliance/tos-acceptance/route');
            const request = createMockRequest('/api/compliance/tos-acceptance', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.accepted).toBe(false);
        });
    });

    // ── ToS POST ──
    describe('/api/compliance/tos-acceptance POST', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { POST } = await import('@/app/api/compliance/tos-acceptance/route');
            const request = createMockRequest('/api/compliance/tos-acceptance', {
                method: 'POST',
                body: { accepted: true, version: '1.0' },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 when accepted is not true', async () => {
            const { POST } = await import('@/app/api/compliance/tos-acceptance/route');
            const request = createMockRequest('/api/compliance/tos-acceptance', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { accepted: false, version: '1.0' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('accepted');
        });

        it('should return 400 when version is missing', async () => {
            const { POST } = await import('@/app/api/compliance/tos-acceptance/route');
            const request = createMockRequest('/api/compliance/tos-acceptance', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { accepted: true },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('version');
        });

        it('should record ToS acceptance with valid data', async () => {
            mockSet.mockResolvedValueOnce(undefined);

            const { POST } = await import('@/app/api/compliance/tos-acceptance/route');
            const request = createMockRequest('/api/compliance/tos-acceptance', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { accepted: true, version: '1.0' },
            });
            const response = await POST(request);
            expect(response.status).toBe(201);
            const data = await response.json();
            expect(data.message).toContain('ToS accepted');
            expect(data.version).toBe('1.0');
        });
    });

    // ── Export checks ──
    describe('Route exports', () => {
        it('consent route exports GET, POST, DELETE', async () => {
            const route = await import('@/app/api/compliance/consent/route');
            expect(typeof route.GET).toBe('function');
            expect(typeof route.POST).toBe('function');
            expect(typeof route.DELETE).toBe('function');
        });

        it('outbound-check route exports POST', async () => {
            const route = await import('@/app/api/compliance/outbound-check/route');
            expect(typeof route.POST).toBe('function');
        });

        it('tos-acceptance route exports GET, POST', async () => {
            const route = await import('@/app/api/compliance/tos-acceptance/route');
            expect(typeof route.GET).toBe('function');
            expect(typeof route.POST).toBe('function');
        });
    });
});
