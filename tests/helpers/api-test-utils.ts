import { NextRequest } from 'next/server';
import { vi } from 'vitest';

// ─── Core mock request builder ──────────────────────────────────────────────

export function createMockRequest(
  url: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  }
): NextRequest {
  const { method = 'GET', body, headers = {} } = options || {};
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

// ─── Authenticated request shortcut ─────────────────────────────────────────

/**
 * Creates a mock request pre-configured with auth headers.
 * Assumes `requireStrictAuth` mock returns success for tenant-123.
 */
export function createAuthenticatedRequest(
  url: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    role?: string;
    tenantId?: string;
  }
): NextRequest {
  const { method = 'GET', body, role, tenantId = 'tenant-123' } = options || {};
  const headers: Record<string, string> = {
    'Authorization': 'Bearer test-token',
    'x-user-tenant': tenantId,
  };
  if (role) {
    headers['x-user-role'] = role;
  }
  return createMockRequest(url, { method, body, headers });
}

// ─── Twilio webhook request builder ─────────────────────────────────────────

/**
 * Creates a mock Twilio webhook POST request with form-encoded body
 * and an x-twilio-signature header.
 */
export function createTwilioWebhookRequest(
  url: string,
  params: Record<string, string>,
  options?: { signature?: string }
): NextRequest {
  const signature = options?.signature || 'mock-twilio-signature';
  const formBody = new URLSearchParams(params).toString();

  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
    },
    body: formBody,
  });
}

// ─── Webhook request with API key ───────────────────────────────────────────

/**
 * Creates a mock webhook request with an x-webhook-key header.
 */
export function createWebhookRequest(
  url: string,
  body: Record<string, unknown>,
  apiKey?: string
): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['x-webhook-key'] = apiKey;
  }
  return createMockRequest(url, { method: 'POST', body, headers });
}

// ─── Shared Firestore mock builder ──────────────────────────────────────────

export interface MockFirestoreRefs {
  mockDoc: ReturnType<typeof vi.fn>;
  mockCollection: ReturnType<typeof vi.fn>;
  mockGet: ReturnType<typeof vi.fn>;
  mockSet: ReturnType<typeof vi.fn>;
  mockUpdate: ReturnType<typeof vi.fn>;
  mockDelete: ReturnType<typeof vi.fn>;
  mockOrderBy: ReturnType<typeof vi.fn>;
  mockWhere: ReturnType<typeof vi.fn>;
  /** Re-initialize the chain (call in beforeEach after vi.clearAllMocks) */
  rebuild: () => void;
}

/**
 * Builds a chainable Firestore mock suitable for most API route tests.
 *
 * Returns mock functions for doc, collection, get, set, update, delete, orderBy, where.
 * The `rebuild` function should be called in `beforeEach` after `vi.clearAllMocks()`.
 *
 * Usage:
 * ```ts
 * const fs = buildMockFirestore();
 * vi.mock('firebase-admin/firestore', () => ({
 *     getFirestore: vi.fn(() => ({ collection: fs.mockCollection, doc: fs.mockDoc })),
 *     FieldValue: { serverTimestamp: vi.fn(() => 'TS') },
 * }));
 * beforeEach(() => { vi.clearAllMocks(); fs.rebuild(); });
 * ```
 */
export function buildMockFirestore(): MockFirestoreRefs {
  const mockDoc = vi.fn();
  const mockCollection = vi.fn();
  const mockGet = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn();

  function rebuild() {
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
      where: mockWhere.mockReturnValue({
        get: mockGet,
        where: mockWhere,
        orderBy: mockOrderBy.mockReturnValue({ get: mockGet }),
      }),
    };
    mockCollection.mockReturnValue(collRef);
    mockDoc.mockReturnValue({
      ...docRef,
      collection: mockCollection,
    });
  }

  rebuild();

  return {
    mockDoc,
    mockCollection,
    mockGet,
    mockSet,
    mockUpdate,
    mockDelete,
    mockOrderBy,
    mockWhere,
    rebuild,
  };
}

// ─── Auth mock helpers ──────────────────────────────────────────────────────

/**
 * Default successful auth result matching the common mock pattern.
 */
export const DEFAULT_AUTH_RESULT = {
  uid: 'test-uid',
  email: 'test@example.com',
  tenantId: 'tenant-123',
} as const;

/**
 * Creates a 401 auth error response for use with mockResolvedValueOnce.
 * Usage: `vi.mocked(requireStrictAuth).mockResolvedValueOnce(createAuthError())`
 */
export function createAuthError(): { error: Response } {
  return {
    error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  } as never;
}
