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

        it('should return 401 when tenant header is missing', async () => {
            const { GET } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });

    describe('POST', () => {
        it('should create agent with valid body', async () => {
            mockSet.mockResolvedValue(undefined);

            const { POST } = await import('@/app/api/agents/route');
            const request = createMockRequest('/api/agents', {
                method: 'POST',
                headers: { 'x-user-tenant': 'tenant-123' },
                body: { name: 'New Agent', systemPrompt: 'You are a helpful assistant.' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.message).toBe('Agent created');
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
                headers: { 'x-user-tenant': 'tenant-123' },
                body: { id: 'agent-to-delete' },
            });

            const response = await DELETE(request);
            expect(response.status).toBe(403);
        });
    });
});
