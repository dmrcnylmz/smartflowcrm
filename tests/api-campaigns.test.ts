/**
 * API Campaign Tests — CRUD + Execute
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createAuthError } from './helpers/api-test-utils';

// ── Firebase Admin mock ──
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockDocRef = {
    id: 'campaign-1',
    get: mockGet,
    set: mockSet,
    update: mockUpdate,
    delete: mockDelete,
};

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                get: mockGet,
                set: mockSet,
                update: mockUpdate,
                delete: mockDelete,
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue(mockDocRef),
                    orderBy: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ docs: [] }),
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
vi.mock('@/lib/compliance/outbound-compliance', () => ({
    runOutboundComplianceCheck: vi.fn().mockResolvedValue({
        overallAllowed: true,
        consentValid: true,
        callingHoursValid: true,
        reasons: [],
    }),
}));

vi.mock('@/lib/compliance/call-types', () => ({
    classifyCallPurpose: vi.fn().mockReturnValue({
        category: 'custom',
        consentRequired: false,
        callingHoursRestricted: false,
    }),
}));

vi.mock('@/lib/compliance/compliance-score', () => ({
    calculateComplianceScore: vi.fn().mockReturnValue({
        level: 'green',
        score: 100,
        callingHoursSchedulable: false,
    }),
    calculateCampaignSummary: vi.fn().mockReturnValue({
        green: 1,
        yellow: 0,
        red: 0,
        total: 1,
    }),
}));

vi.mock('@/lib/twilio/outbound', () => ({
    createOutboundCall: vi.fn().mockResolvedValue({ sid: 'CA-mock-sid' }),
}));

vi.mock('@/lib/twilio/telephony', () => ({
    getTwilioConfig: vi.fn().mockReturnValue({
        accountSid: 'AC-mock',
        authToken: 'mock-token',
        defaultPhoneNumber: '+15005550006',
    }),
}));

vi.mock('@/lib/utils/error-handler', () => ({
    handleApiError: vi.fn((_err: unknown, context: string) =>
        new Response(JSON.stringify({ error: `${context} failed` }), { status: 500 }),
    ),
}));

describe('API Campaign Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-123',
        });
    });

    // ── Campaign List GET ──
    describe('/api/campaigns GET', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns');
            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return campaign list when authenticated', async () => {
            const { GET } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request);
            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.campaigns).toBeDefined();
            expect(typeof data.count).toBe('number');
        });
    });

    // ── Campaign Create POST ──
    describe('/api/campaigns POST', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { POST } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                method: 'POST',
                body: { name: 'Test', agentId: 'agent-1', contacts: [{ phoneNumber: '+905551234567' }] },
            });
            const response = await POST(request);
            expect(response.status).toBe(401);
        });

        it('should return 400 when name is missing', async () => {
            const { POST } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { agentId: 'agent-1', contacts: [{ phoneNumber: '+905551234567' }] },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('name');
        });

        it('should return 400 when agentId is missing', async () => {
            const { POST } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { name: 'Test Campaign', contacts: [{ phoneNumber: '+905551234567' }] },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('Agent');
        });

        it('should return 400 when contacts array is empty', async () => {
            const { POST } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { name: 'Test Campaign', agentId: 'agent-1', contacts: [] },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('contact');
        });

        it('should return 400 when contacts is not an array', async () => {
            const { POST } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { name: 'Test Campaign', agentId: 'agent-1' },
            });
            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('contact');
        });

        it('should create campaign with valid data', async () => {
            mockSet.mockResolvedValueOnce(undefined);

            const { POST } = await import('@/app/api/campaigns/route');
            const request = createMockRequest('/api/campaigns', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    name: 'Test Campaign',
                    agentId: 'agent-1',
                    contacts: [{ phoneNumber: '+905551234567', name: 'Ali' }],
                },
            });
            const response = await POST(request);
            expect(response.status).toBe(201);
            const data = await response.json();
            expect(data.id).toBeDefined();
            expect(data.name).toBe('Test Campaign');
        });
    });

    // ── Campaign Detail GET ──
    describe('/api/campaigns/[id] GET', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { GET } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1');
            const response = await GET(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(401);
        });

        it('should return 404 when campaign not found', async () => {
            mockGet.mockResolvedValueOnce({ exists: false });

            const { GET } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1', {
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await GET(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(404);
        });
    });

    // ── Campaign PATCH ──
    describe('/api/campaigns/[id] PATCH', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { PATCH } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1', {
                method: 'PATCH',
                body: { status: 'paused' },
            });
            const response = await PATCH(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(401);
        });

        it('should return 400 for invalid status', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'draft' }) });

            const { PATCH } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { status: 'invalid-status' },
            });
            const response = await PATCH(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(400);
        });
    });

    // ── Campaign DELETE ──
    describe('/api/campaigns/[id] DELETE', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { DELETE } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1', {
                method: 'DELETE',
            });
            const response = await DELETE(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(401);
        });

        it('should return 404 when campaign not found', async () => {
            // The route calls doc(id).get() — need mockGet to return not-found
            mockGet.mockReset();
            mockGet.mockResolvedValue({ exists: false });

            const { DELETE } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await DELETE(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(404);
        });

        it('should return 400 when trying to delete a running campaign', async () => {
            mockGet.mockReset();
            mockGet.mockResolvedValue({ exists: true, data: () => ({ status: 'running' }) });

            const { DELETE } = await import('@/app/api/campaigns/[id]/route');
            const request = createMockRequest('/api/campaigns/campaign-1', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await DELETE(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('running');
        });
    });

    // ── Campaign Execute POST ──
    describe('/api/campaigns/[id]/execute POST', () => {
        it('should return 401 when auth fails', async () => {
            mockRequireStrictAuth.mockResolvedValueOnce(createAuthError());

            const { POST } = await import('@/app/api/campaigns/[id]/execute/route');
            const request = createMockRequest('/api/campaigns/campaign-1/execute', {
                method: 'POST',
            });
            const response = await POST(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(401);
        });

        it('should return 404 when campaign not found', async () => {
            mockGet.mockReset();
            mockGet.mockResolvedValue({ exists: false });

            const { POST } = await import('@/app/api/campaigns/[id]/execute/route');
            const request = createMockRequest('/api/campaigns/campaign-1/execute', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await POST(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(404);
        });

        it('should return 400 when campaign is already running', async () => {
            mockGet.mockReset();
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ status: 'running', contacts: [] }),
            });

            const { POST } = await import('@/app/api/campaigns/[id]/execute/route');
            const request = createMockRequest('/api/campaigns/campaign-1/execute', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await POST(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('already running');
        });

        it('should return 400 when campaign is already completed', async () => {
            mockGet.mockReset();
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ status: 'completed', contacts: [] }),
            });

            const { POST } = await import('@/app/api/campaigns/[id]/execute/route');
            const request = createMockRequest('/api/campaigns/campaign-1/execute', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
            });
            const response = await POST(request, { params: Promise.resolve({ id: 'campaign-1' }) });
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('already completed');
        });
    });

    // ── Export checks ──
    describe('Route exports', () => {
        it('campaigns route exports GET, POST', async () => {
            const route = await import('@/app/api/campaigns/route');
            expect(typeof route.GET).toBe('function');
            expect(typeof route.POST).toBe('function');
        });

        it('campaigns/[id] route exports GET, PATCH, DELETE', async () => {
            const route = await import('@/app/api/campaigns/[id]/route');
            expect(typeof route.GET).toBe('function');
            expect(typeof route.PATCH).toBe('function');
            expect(typeof route.DELETE).toBe('function');
        });

        it('campaigns/[id]/execute route exports POST', async () => {
            const route = await import('@/app/api/campaigns/[id]/execute/route');
            expect(typeof route.POST).toBe('function');
        });
    });
});
