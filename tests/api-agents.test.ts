/**
 * API Route Tests — /api/agents
 *
 * Tests GET (list), POST (create), DELETE (admin-only) handlers.
 * Mocks firebase-admin used directly by the agents route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Firebase Admin mocks ──

const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockOrderBy = vi.fn();

// Build a chainable Firestore mock
function buildFirestoreMock() {
    const docRef = {
        id: 'auto-id-1',
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
        delete: mockDelete,
    };
    const collRef = {
        doc: mockDoc.mockReturnValue(docRef),
        orderBy: mockOrderBy.mockReturnValue({ get: mockGet }),
    };
    mockCollection.mockReturnValue(collRef);
    // chain: getFirestore().collection('tenants').doc(tenantId).collection('agents')
    mockDoc.mockReturnValue({
        ...docRef,
        collection: mockCollection,
    });
    return { collection: mockCollection, doc: mockDoc };
}

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => buildFirestoreMock()),
    FieldValue: { serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP') },
}));

// Mock requireStrictAuth — simulate authenticated user
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: vi.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@example.com',
        tenantId: 'tenant-123',
    }),
}));

// Mock subscription guard — allow by default
vi.mock('@/lib/billing/subscription-guard', () => ({
    checkSubscriptionActive: vi.fn().mockResolvedValue({ active: true }),
}));

describe('/api/agents', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Re-setup the mock chain after clearing
        buildFirestoreMock();
    });

    describe('GET', () => {
        it('should return agent list when tenant header is present', async () => {
            const mockAgents = [
                { id: 'a1', data: () => ({ name: 'Support Bot', role: 'assistant' }) },
                { id: 'a2', data: () => ({ name: 'Sales Bot', role: 'sales' }) },
            ];
            mockGet.mockResolvedValue({ docs: mockAgents });

            const { GET } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.agents).toBeDefined();
            expect(data.count).toBe(2);
        });

        it('should return 401 when auth is missing', async () => {
            // Simulate auth failure (no Bearer token)
            const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
            vi.mocked(requireStrictAuth).mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            } as never);

            const { GET } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });

        it('should return single agent when id param is provided', async () => {
            const mockAgentDoc = {
                exists: true,
                id: 'agent-1',
                data: () => ({ name: 'Support Bot', role: 'assistant', systemPrompt: 'Help users' }),
            };
            mockGet.mockResolvedValue(mockAgentDoc);

            const { GET } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents?id=agent-1', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.id).toBe('agent-1');
            expect(data.name).toBe('Support Bot');
        });

        it('should return 404 for nonexistent agent id', async () => {
            mockGet.mockResolvedValue({ exists: false });

            const { GET } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents?id=nonexistent', {
                headers: { 'x-user-tenant': 'tenant-123' },
            });

            const response = await GET(request);
            expect(response.status).toBe(404);
        });
    });

    describe('POST', () => {
        it('should create agent with valid body', async () => {
            mockSet.mockResolvedValue(undefined);

            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: 'New Agent', systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.message).toBe('Agent created');
        });

        it('should return 400 when name is missing', async () => {
            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when systemPrompt is missing', async () => {
            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: 'Test Agent' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when name is whitespace only', async () => {
            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: '   ', systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when name is too short (< 2 chars)', async () => {
            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: 'A', systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('2 karakter');
        });

        it('should return 400 when name exceeds 100 chars', async () => {
            const { POST } = await import('@/app/api/agents/route');
            const longName = 'A'.repeat(101);
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: longName, systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('100 karakter');
        });

        it('should return 400 when systemPrompt is too short (< 10 chars)', async () => {
            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: 'Test Agent', systemPrompt: 'Short' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.error).toContain('10 karakter');
        });

        it('should trim name before saving', async () => {
            mockSet.mockResolvedValue(undefined);

            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: '  Trimmed Agent  ', systemPrompt: 'You are a helpful assistant for testing.' },
            });

            const response = await POST(request);
            expect(response.status).toBe(201);

            // Verify set was called with trimmed name
            const setCall = mockSet.mock.calls[0]?.[0];
            if (setCall) {
                expect(setCall.name).toBe('Trimmed Agent');
            }
        });

        it('should return 403 when subscription is inactive', async () => {
            const { checkSubscriptionActive } = await import('@/lib/billing/subscription-guard');
            vi.mocked(checkSubscriptionActive).mockResolvedValueOnce({
                active: false,
                reason: 'Subscription expired',
            } as never);

            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { name: 'Test Agent', systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            expect(response.status).toBe(403);
        });

        it('should update agent when id is provided', async () => {
            mockUpdate.mockResolvedValue(undefined);

            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { id: 'existing-agent', name: 'Updated Agent', systemPrompt: 'You are an updated assistant.' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.message).toBe('Agent updated');
            expect(data.id).toBe('existing-agent');
        });

        it('should apply personality preset when specified', async () => {
            mockSet.mockResolvedValue(undefined);

            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: {
                    name: 'Preset Agent',
                    systemPrompt: 'You are a helpful customer support assistant.',
                    personalityPreset: 'formal',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.message).toBe('Agent created');

            // Verify set was called with preset data
            const setCall = mockSet.mock.calls[0]?.[0];
            if (setCall) {
                expect(setCall.systemPrompt).toContain('PERSONALITY_PRESET');
                expect(setCall.personalityPreset).toBe('formal');
            }
        });
    });

    describe('DELETE', () => {
        it('should succeed with admin role', async () => {
            mockDelete.mockResolvedValue(undefined);

            const { DELETE } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'DELETE',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: { id: 'agent-to-delete' },
            });

            const response = await DELETE(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.message).toContain('deleted');
        });

        it('should return 403 without admin role', async () => {
            const { DELETE } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'DELETE',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'Authorization': 'Bearer test-token',
                },
                body: { id: 'agent-to-delete' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(403);
        });

        it('should return 400 when id is missing', async () => {
            const { DELETE } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'DELETE',
                headers: {
                    'x-user-tenant': 'tenant-123',
                    'x-user-role': 'admin',
                    'Authorization': 'Bearer test-token',
                },
                body: {},
            });

            const response = await DELETE(request);
            expect(response.status).toBe(400);
        });
    });
});
