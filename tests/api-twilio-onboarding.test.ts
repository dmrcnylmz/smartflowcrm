/**
 * Twilio Onboarding & Auxiliary Routes Tests
 *
 * Comprehensive tests for:
 * - /api/twilio/status           — call status callback
 * - /api/twilio/verify-number    — phone number verification
 * - /api/twilio/phone-numbers    — deprecated endpoint
 * - /api/tenant/twilio-setup     — deprecated endpoint
 * - /api/onboarding/provision-phone — onboarding phone provision
 * - /api/tenant/voicemails       — voicemail listing & status update
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// ── Chainable Firestore mocks ──
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockGet = vi.fn();
const mockAdd = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockCollectionGroup = vi.fn();

const mockDb = {
    collection: mockCollection,
    collectionGroup: mockCollectionGroup,
};

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TS'),
        increment: vi.fn((n: number) => `INCREMENT_${n}`),
    },
}));

// ── Billing metering mock ──
const mockMeterCallEnd = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/billing/metering', () => ({
    meterCallEnd: (...args: unknown[]) => mockMeterCallEnd(...args),
}));

// ── n8n webhook mock ──
const mockSendWebhook = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/n8n/client', () => ({
    sendWebhook: (...args: unknown[]) => mockSendWebhook(...args),
}));

// ── Strict auth mock ──
const mockRequireStrictAuth = vi.fn();
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

// ── Phone gateway mock ──
const mockProvisionNumber = vi.fn();
vi.mock('@/lib/phone/gateway', () => ({
    provisionNumber: (...args: unknown[]) => mockProvisionNumber(...args),
}));

// ── Error handler mock ──
vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((err: unknown) => {
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }),
}));

// ── App URL mock ──
vi.mock('@/lib/utils/get-app-url', () => ({
    getAppUrl: vi.fn(() => 'https://app.test.com'),
}));

// ── Auth verify mock (used by verify-number indirectly) ──
vi.mock('@/lib/auth/token-verify-strict', () => ({
    verifyTokenStrict: vi.fn().mockResolvedValue({ valid: true, payload: { uid: 'u1', tenantId: 'tenant-123' } }),
}));


// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupCallQuery(opts: {
    empty?: boolean;
    tenantId?: string;
    from?: string;
    providerType?: string;
}) {
    const { empty = false, tenantId = 'tenant-1', from = '+1234567890', providerType = 'twilio' } = opts;

    if (empty) {
        mockCollectionGroup.mockReturnValue({
            where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
                }),
            }),
        });
        return;
    }

    const mockCallDoc = {
        data: () => ({ tenantId, from, providerType }),
        ref: { update: mockUpdate },
    };
    mockCollectionGroup.mockReturnValue({
        where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
                get: vi.fn().mockResolvedValue({ empty: false, docs: [mockCallDoc] }),
            }),
        }),
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Twilio Onboarding & Auxiliary Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();

        mockUpdate.mockResolvedValue(undefined);
        mockSet.mockResolvedValue(undefined);
        mockGet.mockResolvedValue({ exists: true, data: () => ({}) });
        mockAdd.mockResolvedValue({ id: 'auto-id-1' });
        mockMeterCallEnd.mockResolvedValue(undefined);
        mockSendWebhook.mockResolvedValue(undefined);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // /api/twilio/status
    // ═══════════════════════════════════════════════════════════════════════════
    describe('/api/twilio/status POST', () => {

        it('should update call status and meter usage for completed call', async () => {
            setupCallQuery({ tenantId: 'tenant-1', providerType: 'twilio' });

            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    CallSid: 'CA123',
                    CallStatus: 'completed',
                    CallDuration: '120',
                }),
            });

            const res = await POST(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.ok).toBe(true);

            // Should update call doc with status + duration
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed',
                    endedAt: 'SERVER_TS',
                    durationSeconds: 120,
                    updatedAt: 'SERVER_TS',
                }),
            );

            // Should meter the call
            expect(mockMeterCallEnd).toHaveBeenCalledWith(
                mockDb,
                'tenant-1',
                120,
                0,
                'twilio',
            );
        });

        it('should send on_missed_call webhook for missed call', async () => {
            setupCallQuery({ tenantId: 'tenant-1', from: '+905550001111' });

            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    CallSid: 'CA456',
                    CallStatus: 'no-answer',
                    To: '+905552223333',
                }),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);

            expect(mockSendWebhook).toHaveBeenCalledWith(
                'on_missed_call',
                expect.objectContaining({
                    tenantId: 'tenant-1',
                    sessionId: 'CA456',
                    arguments: expect.objectContaining({
                        callSid: 'CA456',
                        status: 'no-answer',
                        to: '+905552223333',
                        from: '+905550001111',
                    }),
                }),
            );

            // Should NOT meter call (not completed)
            expect(mockMeterCallEnd).not.toHaveBeenCalled();
        });

        it('should return 400 when CallSid is missing', async () => {
            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ CallStatus: 'completed' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toContain('CallSid');
        });

        it('should return ok:true when call not found', async () => {
            setupCallQuery({ empty: true });

            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ CallSid: 'CA_NOT_FOUND', CallStatus: 'completed' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.ok).toBe(true);

            // Should NOT update or meter
            expect(mockUpdate).not.toHaveBeenCalled();
            expect(mockMeterCallEnd).not.toHaveBeenCalled();
        });

        it('should parse form-urlencoded body', async () => {
            setupCallQuery({ tenantId: 'tenant-1' });

            const { POST } = await import('@/app/api/twilio/status/route');
            const body = new URLSearchParams({
                CallSid: 'CA_FORM',
                CallStatus: 'completed',
                CallDuration: '60',
            });
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.ok).toBe(true);

            // Verify call was found by the CallSid from form body
            expect(mockCollectionGroup).toHaveBeenCalledWith('calls');
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed',
                    durationSeconds: 60,
                }),
            );
        });

        it('should parse JSON body', async () => {
            setupCallQuery({ tenantId: 'tenant-1' });

            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    CallSid: 'CA_JSON',
                    CallStatus: 'ringing',
                }),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.ok).toBe(true);

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ringing' }),
            );
        });

        it('should return ok:true even on unexpected error', async () => {
            // Make collectionGroup throw
            mockCollectionGroup.mockImplementation(() => {
                throw new Error('Firestore unavailable');
            });

            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ CallSid: 'CA_ERR', CallStatus: 'failed' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.ok).toBe(true);
        });

        it('should parse CallDuration as integer correctly', async () => {
            setupCallQuery({ tenantId: 'tenant-1', providerType: 'sip' });

            const { POST } = await import('@/app/api/twilio/status/route');
            const req = new NextRequest('http://localhost/api/twilio/status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    CallSid: 'CA_DUR',
                    CallStatus: 'completed',
                    CallDuration: '305',
                }),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ durationSeconds: 305 }),
            );
            expect(mockMeterCallEnd).toHaveBeenCalledWith(
                mockDb,
                'tenant-1',
                305,
                0,
                'sip',
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // /api/twilio/verify-number
    // ═══════════════════════════════════════════════════════════════════════════
    describe('/api/twilio/verify-number POST', () => {

        function setupVerifyMocks(opts: {
            phoneExists?: boolean;
            phoneTenantId?: string;
            tenantData?: Record<string, unknown> | null;
            webhookConfigured?: boolean;
            phoneNumberSid?: string | null;
        }) {
            const {
                phoneExists = true,
                phoneTenantId = 'tenant-1',
                tenantData = { agent: { greeting: 'Merhaba' }, language: 'tr', twilio: { subaccountSid: 'AC_SUB', authToken: 'tok' } },
                webhookConfigured = false,
                phoneNumberSid = null,
            } = opts;

            // Build the phone doc and tenant doc mocks
            const phoneDocData = phoneExists
                ? { tenantId: phoneTenantId, webhookConfigured, phoneNumberSid }
                : null;

            const phoneDocMock = {
                exists: phoneExists,
                data: () => phoneDocData,
            };

            const tenantDocMock = {
                exists: tenantData !== null,
                data: () => tenantData,
            };

            // mockDb.collection('tenant_phone_numbers').doc(normalized).get()
            // mockDb.collection('tenants').doc(tenantId).get()
            mockCollection.mockImplementation((collName: string) => {
                if (collName === 'tenant_phone_numbers') {
                    return {
                        doc: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue(phoneDocMock),
                            update: mockUpdate,
                        }),
                    };
                }
                if (collName === 'tenants') {
                    return {
                        doc: vi.fn().mockReturnValue({
                            get: vi.fn().mockResolvedValue(tenantDocMock),
                            collection: mockCollection,
                            set: mockSet,
                        }),
                    };
                }
                return {
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
                        collection: mockCollection,
                        set: mockSet,
                    }),
                };
            });
        }

        it('should return ready:true when all checks pass', async () => {
            setupVerifyMocks({
                phoneExists: true,
                phoneTenantId: 'tenant-1',
                tenantData: {
                    agent: { greeting: 'Merhaba' },
                    language: 'tr',
                    twilio: { subaccountSid: 'AC_SUB', authToken: 'tok' },
                },
                webhookConfigured: true,
            });

            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-user-tenant': 'tenant-1',
                },
                body: JSON.stringify({ phoneNumber: '+905551234567' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.ready).toBe(true);
            expect(data.checks).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'registration', status: 'pass' }),
                ]),
            );
            expect(data.issues).toHaveLength(0);
        });

        it('should return ready:false when number not registered', async () => {
            setupVerifyMocks({ phoneExists: false });

            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-user-tenant': 'tenant-1',
                },
                body: JSON.stringify({ phoneNumber: '+905559999999' }),
            });

            const res = await POST(req);
            const data = await res.json();

            expect(data.ready).toBe(false);
            expect(data.checks).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'registration', status: 'fail' }),
                ]),
            );
            expect(data.issues.length).toBeGreaterThan(0);
        });

        it('should return ready:false when number belongs to different tenant', async () => {
            setupVerifyMocks({
                phoneExists: true,
                phoneTenantId: 'tenant-OTHER',
                tenantData: {
                    agent: { greeting: 'Hi' },
                    language: 'en',
                    twilio: { subaccountSid: 'AC_OTHER', authToken: 'tok' },
                },
                webhookConfigured: true,
            });

            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-user-tenant': 'tenant-1',
                },
                body: JSON.stringify({ phoneNumber: '+905551234567' }),
            });

            const res = await POST(req);
            const data = await res.json();

            expect(data.ready).toBe(false);
            expect(data.checks).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'registration', status: 'fail' }),
                ]),
            );
        });

        it('should return 400 when phoneNumber is missing', async () => {
            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-user-tenant': 'tenant-1',
                },
                body: JSON.stringify({}),
            });

            const res = await POST(req);
            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toContain('phoneNumber');
        });

        it('should return 403 when x-user-tenant header is missing', async () => {
            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ phoneNumber: '+905551234567' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(403);

            const data = await res.json();
            expect(data.error).toBeTruthy();
        });

        it('should return warning when greeting is missing', async () => {
            setupVerifyMocks({
                phoneExists: true,
                phoneTenantId: 'tenant-1',
                tenantData: {
                    agent: {},
                    language: 'tr',
                    twilio: { subaccountSid: 'AC_SUB', authToken: 'tok' },
                },
                webhookConfigured: true,
            });

            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-user-tenant': 'tenant-1',
                },
                body: JSON.stringify({ phoneNumber: '+905551234567' }),
            });

            const res = await POST(req);
            const data = await res.json();

            // Still ready (warning is not a fail)
            expect(data.ready).toBe(true);
            expect(data.checks).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'tenant_greeting', status: 'warning' }),
                ]),
            );
        });

        it('should return warning when Twilio subaccount is missing', async () => {
            setupVerifyMocks({
                phoneExists: true,
                phoneTenantId: 'tenant-1',
                tenantData: {
                    agent: { greeting: 'Hello' },
                    language: 'en',
                    twilio: {},
                },
            });

            const { POST } = await import('@/app/api/twilio/verify-number/route');
            const req = new NextRequest('http://localhost/api/twilio/verify-number', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-user-tenant': 'tenant-1',
                },
                body: JSON.stringify({ phoneNumber: '+905551234567' }),
            });

            const res = await POST(req);
            const data = await res.json();

            // Still ready (warning, not fail)
            expect(data.ready).toBe(true);
            expect(data.checks).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'twilio_subaccount', status: 'warning' }),
                ]),
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // /api/twilio/phone-numbers (deprecated)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('/api/twilio/phone-numbers (deprecated)', () => {

        it('GET returns 301 with deprecation notice', async () => {
            const { GET } = await import('@/app/api/twilio/phone-numbers/route');
            const req = new NextRequest('http://localhost/api/twilio/phone-numbers', {
                method: 'GET',
            });

            const res = await GET(req);
            expect(res.status).toBe(301);

            const data = await res.json();
            expect(data.deprecated).toBe(true);
            expect(data.hint).toContain('/api/phone/numbers');
        });

        it('POST returns 301 with deprecation notice', async () => {
            const { POST } = await import('@/app/api/twilio/phone-numbers/route');
            const req = new NextRequest('http://localhost/api/twilio/phone-numbers', {
                method: 'POST',
            });

            const res = await POST(req);
            expect(res.status).toBe(301);

            const data = await res.json();
            expect(data.deprecated).toBe(true);
            expect(data.hint).toContain('/api/phone/provision');
        });

        it('DELETE returns 301 with deprecation notice', async () => {
            const { DELETE } = await import('@/app/api/twilio/phone-numbers/route');
            const req = new NextRequest('http://localhost/api/twilio/phone-numbers', {
                method: 'DELETE',
            });

            const res = await DELETE(req);
            expect(res.status).toBe(301);

            const data = await res.json();
            expect(data.deprecated).toBe(true);
            expect(data.hint).toContain('/api/phone/numbers');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // /api/tenant/twilio-setup (deprecated)
    // ═══════════════════════════════════════════════════════════════════════════
    describe('/api/tenant/twilio-setup (deprecated)', () => {

        it('POST returns 301 with deprecation notice', async () => {
            const { POST } = await import('@/app/api/tenant/twilio-setup/route');
            const req = new NextRequest('http://localhost/api/tenant/twilio-setup', {
                method: 'POST',
            });

            const res = await POST(req);
            expect(res.status).toBe(301);

            const data = await res.json();
            expect(data.deprecated).toBe(true);
            expect(data.hint).toContain('/api/phone/provision');
        });

        it('GET returns 301 with deprecation notice', async () => {
            const { GET } = await import('@/app/api/tenant/twilio-setup/route');
            const req = new NextRequest('http://localhost/api/tenant/twilio-setup', {
                method: 'GET',
            });

            const res = await GET(req);
            expect(res.status).toBe(301);

            const data = await res.json();
            expect(data.deprecated).toBe(true);
            expect(data.hint).toContain('/api/phone/numbers');
        });

        it('PATCH returns 301 with deprecation notice', async () => {
            const { PATCH } = await import('@/app/api/tenant/twilio-setup/route');
            const req = new NextRequest('http://localhost/api/tenant/twilio-setup', {
                method: 'PATCH',
            });

            const res = await PATCH(req);
            expect(res.status).toBe(301);

            const data = await res.json();
            expect(data.deprecated).toBe(true);
            expect(data.hint).toContain('/api/phone/provision');
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // /api/onboarding/provision-phone
    // ═══════════════════════════════════════════════════════════════════════════
    describe('/api/onboarding/provision-phone POST', () => {

        beforeEach(() => {
            // Default: auth succeeds
            mockRequireStrictAuth.mockResolvedValue({
                uid: 'user-1',
                email: 'user@test.com',
                tenantId: 'tenant-123',
            });

            // Default Firestore collection.doc.set chain for tenant update
            mockCollection.mockReturnValue({
                doc: vi.fn().mockReturnValue({
                    set: mockSet,
                    get: mockGet,
                    collection: mockCollection,
                }),
            });
        });

        it('should return 201 on successful provision', async () => {
            mockProvisionNumber.mockResolvedValue({
                success: true,
                phoneNumber: '+905551234567',
            });

            const { POST } = await import('@/app/api/onboarding/provision-phone/route');
            const req = new NextRequest('http://localhost/api/onboarding/provision-phone', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ country: 'TR', areaCode: '555' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(201);

            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.phoneNumber).toBe('+905551234567');
        });

        it('should return 400 for invalid country code', async () => {
            const { POST } = await import('@/app/api/onboarding/provision-phone/route');
            const req = new NextRequest('http://localhost/api/onboarding/provision-phone', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ country: 'TURKEY' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toBeTruthy();
        });

        it('should return 422 with canSkip when provision fails', async () => {
            mockProvisionNumber.mockResolvedValue({
                success: false,
                error: 'No numbers available',
            });

            const { POST } = await import('@/app/api/onboarding/provision-phone/route');
            const req = new NextRequest('http://localhost/api/onboarding/provision-phone', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ country: 'US' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(422);

            const data = await res.json();
            expect(data.canSkip).toBe(true);
            expect(data.error).toBeTruthy();
        });

        it('should update tenant config after successful provision', async () => {
            mockProvisionNumber.mockResolvedValue({
                success: true,
                phoneNumber: '+14155551234',
            });

            const { POST } = await import('@/app/api/onboarding/provision-phone/route');
            const req = new NextRequest('http://localhost/api/onboarding/provision-phone', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ country: 'US' }),
            });

            await POST(req);

            // Should update tenant doc with phone config
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    phone: expect.objectContaining({
                        defaultCountry: 'US',
                        autoProvision: true,
                    }),
                }),
                { merge: true },
            );
        });

        it('should return error when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValue({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { POST } = await import('@/app/api/onboarding/provision-phone/route');
            const req = new NextRequest('http://localhost/api/onboarding/provision-phone', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ country: 'TR' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(401);
        });

        it('should uppercase country code correctly', async () => {
            mockProvisionNumber.mockResolvedValue({
                success: true,
                phoneNumber: '+441234567890',
            });

            const { POST } = await import('@/app/api/onboarding/provision-phone/route');
            const req = new NextRequest('http://localhost/api/onboarding/provision-phone', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ country: 'gb' }),
            });

            const res = await POST(req);
            expect(res.status).toBe(201);

            // provisionNumber should be called with uppercased country
            expect(mockProvisionNumber).toHaveBeenCalledWith(
                mockDb,
                'tenant-123',
                'GB',
                expect.objectContaining({}),
            );

            // Tenant config should have uppercased country
            expect(mockSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    phone: expect.objectContaining({ defaultCountry: 'GB' }),
                }),
                { merge: true },
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // /api/tenant/voicemails
    // ═══════════════════════════════════════════════════════════════════════════
    describe('/api/tenant/voicemails', () => {

        beforeEach(() => {
            // Default: auth succeeds
            mockRequireStrictAuth.mockResolvedValue({
                uid: 'user-1',
                email: 'user@test.com',
                tenantId: 'tenant-123',
            });
        });

        function setupVoicemailQuery(opts: { docs?: Array<{ id: string; data: Record<string, unknown> }>; useWhere?: boolean }) {
            const { docs = [], useWhere = false } = opts;
            const mockDocs = docs.map(d => ({ id: d.id, data: () => d.data }));
            const snapResult = { docs: mockDocs };

            if (useWhere) {
                // For non-archived: uses .where().orderBy().limit().get()
                mockCollection.mockImplementation(() => ({
                    doc: vi.fn().mockReturnValue({
                        collection: vi.fn().mockReturnValue({
                            where: vi.fn().mockReturnValue({
                                orderBy: vi.fn().mockReturnValue({
                                    limit: vi.fn().mockReturnValue({
                                        get: vi.fn().mockResolvedValue(snapResult),
                                    }),
                                }),
                            }),
                            orderBy: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    get: vi.fn().mockResolvedValue(snapResult),
                                }),
                            }),
                        }),
                        set: mockSet,
                        update: mockUpdate,
                    }),
                }));
            } else {
                // For archived=true: uses .orderBy().limit().get()
                mockCollection.mockImplementation(() => ({
                    doc: vi.fn().mockReturnValue({
                        collection: vi.fn().mockReturnValue({
                            orderBy: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    get: vi.fn().mockResolvedValue(snapResult),
                                }),
                            }),
                            where: vi.fn().mockReturnValue({
                                orderBy: vi.fn().mockReturnValue({
                                    limit: vi.fn().mockReturnValue({
                                        get: vi.fn().mockResolvedValue(snapResult),
                                    }),
                                }),
                            }),
                        }),
                        set: mockSet,
                        update: mockUpdate,
                    }),
                }));
            }
        }

        function setupVoicemailPatch() {
            mockCollection.mockImplementation(() => ({
                doc: vi.fn().mockReturnValue({
                    collection: vi.fn().mockReturnValue({
                        doc: vi.fn().mockReturnValue({
                            update: mockUpdate,
                        }),
                    }),
                    set: mockSet,
                    update: mockUpdate,
                }),
            }));
        }

        // ─── GET tests ───────────────────────────────────────────────────────

        it('GET should return voicemails list', async () => {
            setupVoicemailQuery({
                docs: [
                    { id: 'vm-1', data: { status: 'new', from: '+905551111111', createdAt: '2025-01-01' } },
                    { id: 'vm-2', data: { status: 'listened', from: '+905552222222', createdAt: '2025-01-02' } },
                ],
            });

            const { GET } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails?archived=true', {
                method: 'GET',
            });

            const res = await GET(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.voicemails).toHaveLength(2);
            expect(data.voicemails[0].id).toBe('vm-1');
            expect(data.voicemails[1].id).toBe('vm-2');
        });

        it('GET with archived=true should include archived voicemails', async () => {
            setupVoicemailQuery({
                docs: [
                    { id: 'vm-1', data: { status: 'archived', from: '+905551111111' } },
                    { id: 'vm-2', data: { status: 'new', from: '+905552222222' } },
                ],
            });

            const { GET } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails?archived=true', {
                method: 'GET',
            });

            const res = await GET(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.voicemails).toHaveLength(2);
        });

        it('GET without archived should filter by status', async () => {
            setupVoicemailQuery({
                useWhere: true,
                docs: [
                    { id: 'vm-1', data: { status: 'new', from: '+905551111111' } },
                ],
            });

            const { GET } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails', {
                method: 'GET',
            });

            const res = await GET(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.voicemails).toHaveLength(1);
            expect(data.voicemails[0].status).toBe('new');
        });

        it('GET should return error when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValue({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            });

            const { GET } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails', {
                method: 'GET',
            });

            const res = await GET(req);
            expect(res.status).toBe(401);
        });

        // ─── PATCH tests ────────────────────────────────────────────────────

        it('PATCH should update voicemail status to listened', async () => {
            setupVoicemailPatch();

            const { PATCH } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails', {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ voicemailId: 'vm-1', status: 'listened' }),
            });

            const res = await PATCH(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.success).toBe(true);

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'listened',
                    listenedAt: 'SERVER_TS',
                    listenedBy: 'user-1',
                }),
            );
        });

        it('PATCH should update voicemail status to archived', async () => {
            setupVoicemailPatch();

            const { PATCH } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails', {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ voicemailId: 'vm-1', status: 'archived' }),
            });

            const res = await PATCH(req);
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.success).toBe(true);

            // For archived, listenedAt and listenedBy should NOT be set
            expect(mockUpdate).toHaveBeenCalledWith({ status: 'archived' });
        });

        it('PATCH should return 400 when voicemailId is missing', async () => {
            const { PATCH } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails', {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ status: 'listened' }),
            });

            const res = await PATCH(req);
            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toContain('voicemailId');
        });

        it('PATCH should return 400 for invalid status', async () => {
            const { PATCH } = await import('@/app/api/tenant/voicemails/route');
            const req = new NextRequest('http://localhost/api/tenant/voicemails', {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ voicemailId: 'vm-1', status: 'deleted' }),
            });

            const res = await PATCH(req);
            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toContain('Invalid status');
        });
    });
});
