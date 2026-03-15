/**
 * Tests for /api/ai/rag-search — RAG search & answer generation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock Firebase Admin (required by requireStrictAuth)
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// Mock requireStrictAuth
const mockRequireStrictAuth = vi.fn().mockResolvedValue({
    uid: 'test-uid',
    email: 'test@example.com',
    tenantId: 'tenant-1',
});
vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: (...args: unknown[]) => mockRequireStrictAuth(...args),
}));

vi.mock('@/lib/ai/rag', () => ({
    searchFAQ: vi.fn(),
    generateAnswerWithRAG: vi.fn(),
}));

import { searchFAQ, generateAnswerWithRAG } from '@/lib/ai/rag';

const mockSearchFAQ = searchFAQ as ReturnType<typeof vi.fn>;
const mockGenerateAnswer = generateAnswerWithRAG as ReturnType<typeof vi.fn>;

// ── Helper ─────────────────────────────────────────────────────────
function makeRequest(body: Record<string, unknown>, tenant = 'tenant-1') {
    return new Request('http://localhost/api/ai/rag-search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(tenant ? { 'x-user-tenant': tenant } : {}),
        },
        body: JSON.stringify(body),
    }) as unknown as import('next/server').NextRequest;
}

function makeRequestNoTenant(body: Record<string, unknown>) {
    return new Request('http://localhost/api/ai/rag-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as unknown as import('next/server').NextRequest;
}

async function getHandler() {
    vi.resetModules();
    const mod = await import('@/app/api/ai/rag-search/route');
    return mod.POST;
}

// ── Tests ──────────────────────────────────────────────────────────
describe('/api/ai/rag-search', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset requireStrictAuth to default success
        mockRequireStrictAuth.mockResolvedValue({
            uid: 'test-uid',
            email: 'test@example.com',
            tenantId: 'tenant-1',
        });
        mockSearchFAQ.mockResolvedValue([
            { question: 'Nasıl iade yapabilirim?', answer: 'İade politikamız...', score: 0.92 },
            { question: 'Kargo süresi ne kadar?', answer: 'Kargo 2-3 gün...', score: 0.85 },
        ]);
        mockGenerateAnswer.mockResolvedValue('İade işlemi için müşteri hizmetlerini arayabilirsiniz.');
    });

    it('returns 401 when auth fails (no valid JWT)', async () => {
        const { NextResponse } = await import('next/server');
        mockRequireStrictAuth.mockResolvedValueOnce({
            error: NextResponse.json(
                { error: 'Unauthorized', message: 'Bu endpoint için kimlik doğrulaması gereklidir.' },
                { status: 401 }
            ),
        });
        const POST = await getHandler();
        const res = await POST(makeRequestNoTenant({ query: 'test' }));
        expect(res.status).toBe(401);
    });

    it('returns 400 when query is missing', async () => {
        const POST = await getHandler();
        const res = await POST(makeRequest({}));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('query');
    });

    it('returns 400 when query is not a string', async () => {
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 123 }));
        expect(res.status).toBe(400);
    });

    it('returns search results without answer by default', async () => {
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 'iade' }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.results).toHaveLength(2);
        expect(data.answer).toBeUndefined();
        expect(mockSearchFAQ).toHaveBeenCalledWith('iade', undefined);
    });

    it('passes category to searchFAQ when provided', async () => {
        const POST = await getHandler();
        await POST(makeRequest({ query: 'iade', category: 'returns' }));
        expect(mockSearchFAQ).toHaveBeenCalledWith('iade', 'returns');
    });

    it('generates answer when generateAnswer=true and results exist', async () => {
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 'iade', generateAnswer: true }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.results).toHaveLength(2);
        expect(data.answer).toBe('İade işlemi için müşteri hizmetlerini arayabilirsiniz.');
        expect(mockGenerateAnswer).toHaveBeenCalledWith('iade', 'local');
    });

    it('passes custom provider to generateAnswerWithRAG', async () => {
        const POST = await getHandler();
        await POST(makeRequest({ query: 'iade', generateAnswer: true, provider: 'openai' }));
        expect(mockGenerateAnswer).toHaveBeenCalledWith('iade', 'openai');
    });

    it('skips answer generation when results are empty', async () => {
        mockSearchFAQ.mockResolvedValue([]);
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 'bilinmeyen', generateAnswer: true }));
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.results).toHaveLength(0);
        expect(data.answer).toBeUndefined();
        expect(mockGenerateAnswer).not.toHaveBeenCalled();
    });

    it('truncates query to 500 chars to prevent abuse', async () => {
        const longQuery = 'a'.repeat(600);
        const POST = await getHandler();
        await POST(makeRequest({ query: longQuery }));
        expect(mockSearchFAQ).toHaveBeenCalledWith('a'.repeat(500), undefined);
    });

    it('returns 500 on searchFAQ error', async () => {
        mockSearchFAQ.mockRejectedValue(new Error('Firestore down'));
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 'iade' }));
        expect(res.status).toBe(500);
    });

    it('returns error on generateAnswerWithRAG error', async () => {
        mockGenerateAnswer.mockRejectedValue(new Error('LLM timeout'));
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 'iade', generateAnswer: true }));
        // handleApiError returns 502 for external service errors
        expect([500, 502]).toContain(res.status);
    });

    it('returns 500 on non-Error throws', async () => {
        mockSearchFAQ.mockRejectedValue('string error');
        const POST = await getHandler();
        const res = await POST(makeRequest({ query: 'iade' }));
        expect(res.status).toBe(500);
    });
});
