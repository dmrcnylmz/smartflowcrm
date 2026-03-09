import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock Upstash modules before any imports that reference them ---
vi.mock('@upstash/ratelimit', () => ({ Ratelimit: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: vi.fn() }));

import {
  createApiError,
  errorResponse,
  handleApiError,
  rateLimitResponse,
  requireFields,
  requireAuth,
} from '@/lib/utils/error-handler';

import { monitor } from '@/lib/utils/monitoring';

import {
  checkRateLimit,
  checkGeneralLimit,
  checkSensitiveLimit,
  checkTenantLimit,
  checkInferenceLimit,
} from '@/lib/utils/rate-limiter';

// ============================================================
// 1. Error Handler
// ============================================================

describe('Error Handler', () => {
  // ---- createApiError ----

  describe('createApiError', () => {
    it('maps VALIDATION_ERROR to 400', () => {
      const err = createApiError('VALIDATION_ERROR', 'bad input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toBe('bad input');
    });

    it('maps AUTH_ERROR to 401', () => {
      const err = createApiError('AUTH_ERROR', 'unauthorized');
      expect(err.statusCode).toBe(401);
    });

    it('maps NOT_FOUND to 404', () => {
      const err = createApiError('NOT_FOUND', 'missing');
      expect(err.statusCode).toBe(404);
    });

    it('maps RATE_LIMITED to 429', () => {
      const err = createApiError('RATE_LIMITED', 'slow down');
      expect(err.statusCode).toBe(429);
    });

    it('maps FIREBASE_ERROR to 503', () => {
      const err = createApiError('FIREBASE_ERROR', 'db issue');
      expect(err.statusCode).toBe(503);
    });

    it('maps EXTERNAL_SERVICE to 502', () => {
      const err = createApiError('EXTERNAL_SERVICE', 'upstream');
      expect(err.statusCode).toBe(502);
    });

    it('maps INTERNAL_ERROR to 500', () => {
      const err = createApiError('INTERNAL_ERROR', 'oops');
      expect(err.statusCode).toBe(500);
    });

    it('includes optional details when provided', () => {
      const err = createApiError('VALIDATION_ERROR', 'bad', 'field X missing');
      expect(err.details).toBe('field X missing');
    });

    it('leaves details undefined when not provided', () => {
      const err = createApiError('VALIDATION_ERROR', 'bad');
      expect(err.details).toBeUndefined();
    });
  });

  // ---- errorResponse ----

  describe('errorResponse', () => {
    it('returns a NextResponse with correct status code', async () => {
      const apiErr = createApiError('NOT_FOUND', 'not here');
      const res = errorResponse(apiErr);
      expect(res.status).toBe(404);
    });

    it('returns JSON body with error, code, and timestamp', async () => {
      const apiErr = createApiError('AUTH_ERROR', 'denied');
      const res = errorResponse(apiErr);
      const body = await res.json();
      expect(body.error).toBe('denied');
      expect(body.code).toBe('AUTH_ERROR');
      expect(body.timestamp).toBeDefined();
      // timestamp should be a valid ISO string
      expect(() => new Date(body.timestamp)).not.toThrow();
    });

    it('includes details in non-production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';
      const apiErr = createApiError('INTERNAL_ERROR', 'fail', 'stack trace here');
      const res = errorResponse(apiErr);
      const body = await res.json();
      expect(body.details).toBe('stack trace here');
      process.env.NODE_ENV = originalEnv;
    });

    it('hides details in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const apiErr = createApiError('INTERNAL_ERROR', 'fail', 'secret details');
      const res = errorResponse(apiErr);
      const body = await res.json();
      expect(body.details).toBeUndefined();
      process.env.NODE_ENV = originalEnv;
    });
  });

  // ---- handleApiError ----

  describe('handleApiError', () => {
    it('returns FIREBASE_ERROR (503) for permission errors', async () => {
      const err = new Error('permission denied by Firestore');
      const res = handleApiError(err);
      const body = await res.json();
      expect(res.status).toBe(503);
      expect(body.code).toBe('FIREBASE_ERROR');
    });

    it('returns FIREBASE_ERROR for Permission (capitalized) errors', async () => {
      const err = new Error('Permission denied');
      const res = handleApiError(err);
      expect(res.status).toBe(503);
    });

    it('returns EXTERNAL_SERVICE (502) for fetch errors', async () => {
      const err = new Error('fetch failed');
      const res = handleApiError(err);
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.code).toBe('EXTERNAL_SERVICE');
    });

    it('returns EXTERNAL_SERVICE for ECONNREFUSED errors', async () => {
      const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const res = handleApiError(err);
      expect(res.status).toBe(502);
    });

    it('returns EXTERNAL_SERVICE for timeout errors', async () => {
      const err = new Error('Request timeout');
      const res = handleApiError(err);
      expect(res.status).toBe(502);
    });

    it('returns VALIDATION_ERROR (400) for Invalid messages', async () => {
      const err = new Error('Invalid email format');
      const res = handleApiError(err);
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('returns INTERNAL_ERROR (500) for generic errors', async () => {
      const err = new Error('something broke');
      const res = handleApiError(err);
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('handles non-Error objects as INTERNAL_ERROR', async () => {
      const res = handleApiError('a string error');
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('includes context prefix in logged messages', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const err = new Error('permission error');
      handleApiError(err, 'CustomerAPI');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CustomerAPI]'),
        expect.any(String),
      );
      warnSpy.mockRestore();
    });
  });

  // ---- rateLimitResponse ----

  describe('rateLimitResponse', () => {
    it('returns status 429', () => {
      const res = rateLimitResponse();
      expect(res.status).toBe(429);
    });

    it('sets Retry-After header in seconds (default 60s)', () => {
      const res = rateLimitResponse();
      expect(res.headers.get('Retry-After')).toBe('60');
    });

    it('sets custom Retry-After based on provided ms', () => {
      const res = rateLimitResponse(30000);
      expect(res.headers.get('Retry-After')).toBe('30');
    });

    it('includes RATE_LIMITED code in JSON body', async () => {
      const res = rateLimitResponse();
      const body = await res.json();
      expect(body.code).toBe('RATE_LIMITED');
      expect(body.retryAfterMs).toBe(60000);
      expect(body.timestamp).toBeDefined();
    });
  });

  // ---- requireFields ----

  describe('requireFields', () => {
    it('returns null when all fields are present', () => {
      const result = requireFields({ name: 'Alice', age: 30 }, ['name', 'age']);
      expect(result).toBeNull();
    });

    it('returns ApiError when a field is missing (undefined)', () => {
      const result = requireFields({ name: 'Alice' } as any, ['name', 'email']);
      expect(result).not.toBeNull();
      expect(result!.code).toBe('VALIDATION_ERROR');
      expect(result!.statusCode).toBe(400);
    });

    it('returns ApiError when a field is null', () => {
      const result = requireFields({ name: 'Alice', email: null }, ['name', 'email']);
      expect(result).not.toBeNull();
      expect(result!.code).toBe('VALIDATION_ERROR');
    });

    it('returns ApiError when a field is empty string', () => {
      const result = requireFields({ name: '', email: 'a@b.com' }, ['name', 'email']);
      expect(result).not.toBeNull();
      expect(result!.code).toBe('VALIDATION_ERROR');
    });

    it('lists missing field names in the error message', () => {
      const result = requireFields({ a: '' } as any, ['a', 'b']);
      expect(result).not.toBeNull();
      expect(result!.message).toContain('a');
      expect(result!.message).toContain('b');
    });
  });

  // ---- requireAuth ----

  describe('requireAuth', () => {
    it('returns ApiError when tenantId is null', () => {
      const result = requireAuth(null);
      expect(result).not.toBeNull();
      expect(result!.code).toBe('AUTH_ERROR');
      expect(result!.statusCode).toBe(401);
    });

    it('returns null when tenantId is a valid string', () => {
      const result = requireAuth('tenant-123');
      expect(result).toBeNull();
    });
  });
});

// ============================================================
// 2. Monitoring
// ============================================================

describe('Monitoring', () => {
  // The monitor singleton accumulates state across tests.
  // We capture baseline counts before each test to assert relative changes.

  describe('captureError', () => {
    it('increments error counts for a given route', () => {
      const route = `/test-route-${Date.now()}`;
      const before = monitor.getErrorCounts()[route] || 0;
      monitor.captureError(new Error('test'), { route });
      const after = monitor.getErrorCounts()[route];
      expect(after).toBe(before + 1);
    });

    it('increments error counts cumulatively', () => {
      const route = `/cumulative-${Date.now()}`;
      monitor.captureError(new Error('a'), { route });
      monitor.captureError(new Error('b'), { route });
      monitor.captureError(new Error('c'), { route });
      expect(monitor.getErrorCounts()[route]).toBe(3);
    });

    it('uses context field as key when route is absent', () => {
      const ctx = `ctx-${Date.now()}`;
      monitor.captureError(new Error('x'), { context: ctx });
      expect(monitor.getErrorCounts()[ctx]).toBeGreaterThanOrEqual(1);
    });

    it('uses "unknown" key when no context or route is given', () => {
      const before = monitor.getErrorCounts()['unknown'] || 0;
      monitor.captureError(new Error('no context'));
      expect(monitor.getErrorCounts()['unknown']).toBe(before + 1);
    });
  });

  describe('startTimer', () => {
    it('returns a function that yields the elapsed duration', () => {
      const end = monitor.startTimer('test.timer');
      // The timer should return a number (duration in ms)
      const duration = end();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('records the metric in the buffer', () => {
      const metricName = `timer-${Date.now()}`;
      const end = monitor.startTimer(metricName);
      end();
      const metrics = monitor.getMetrics();
      const found = metrics.find((m) => m.name === metricName);
      expect(found).toBeDefined();
      expect(found!.durationMs).toBeGreaterThanOrEqual(0);
      expect(found!.timestamp).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    it('returns an array of PerformanceMetric objects', () => {
      const metrics = monitor.getMetrics();
      expect(Array.isArray(metrics)).toBe(true);
    });

    it('returns a copy (not the same reference as internal buffer)', () => {
      const a = monitor.getMetrics();
      const b = monitor.getMetrics();
      expect(a).not.toBe(b);
    });
  });

  describe('getHealthSummary', () => {
    it('returns the correct shape', () => {
      const summary = monitor.getHealthSummary();
      expect(summary).toHaveProperty('totalErrors');
      expect(summary).toHaveProperty('errorsByRoute');
      expect(summary).toHaveProperty('metricsCount');
      expect(summary).toHaveProperty('avgLatencyMs');
      expect(summary).toHaveProperty('uptime');
      expect(typeof summary.totalErrors).toBe('number');
      expect(typeof summary.metricsCount).toBe('number');
      expect(typeof summary.avgLatencyMs).toBe('number');
      expect(typeof summary.uptime).toBe('number');
    });

    it('totalErrors equals the sum of all errorCounts values', () => {
      const summary = monitor.getHealthSummary();
      const counts = monitor.getErrorCounts();
      const expectedTotal = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(summary.totalErrors).toBe(expectedTotal);
    });
  });

  describe('trackEvent', () => {
    it('does not throw when called with name only', () => {
      expect(() => monitor.trackEvent('user.signup')).not.toThrow();
    });

    it('does not throw when called with name and data', () => {
      expect(() => monitor.trackEvent('page.view', { path: '/home' })).not.toThrow();
    });
  });
});

// ============================================================
// 3. Rate Limiter (in-memory fallback)
// ============================================================

describe('Rate Limiter', () => {
  // Upstash env vars are not set, so all calls use in-memory fallback.

  describe('checkRateLimit', () => {
    it('allows the first request within limit', async () => {
      const id = `user-${Date.now()}-first`;
      const result = await checkRateLimit(id, { limit: 5, windowSeconds: 60 });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('decrements remaining count on subsequent requests', async () => {
      const id = `user-${Date.now()}-dec`;
      await checkRateLimit(id, { limit: 5, windowSeconds: 60 });
      const second = await checkRateLimit(id, { limit: 5, windowSeconds: 60 });
      expect(second.success).toBe(true);
      expect(second.remaining).toBe(3);
    });

    it('blocks when limit is exceeded', async () => {
      const id = `user-${Date.now()}-block`;
      const opts = { limit: 3, windowSeconds: 60 };
      await checkRateLimit(id, opts); // 1
      await checkRateLimit(id, opts); // 2
      await checkRateLimit(id, opts); // 3
      const blocked = await checkRateLimit(id, opts); // 4 -> over limit
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('returns distributed: false when using in-memory fallback', async () => {
      const id = `user-${Date.now()}-dist`;
      const result = await checkRateLimit(id, { limit: 10, windowSeconds: 60 });
      expect(result.distributed).toBe(false);
    });

    it('includes a reset timestamp in the result', async () => {
      const id = `user-${Date.now()}-reset`;
      const result = await checkRateLimit(id, { limit: 10, windowSeconds: 60 });
      expect(typeof result.reset).toBe('number');
      expect(result.reset).toBeGreaterThan(Date.now() - 1000);
    });

    it('respects the tier option for namespacing', async () => {
      const id = `user-${Date.now()}-tier`;
      const opts1 = { limit: 2, windowSeconds: 60, tier: 'api' };
      const opts2 = { limit: 2, windowSeconds: 60, tier: 'sensitive' };
      // Exhaust limit in tier "api"
      await checkRateLimit(id, opts1);
      await checkRateLimit(id, opts1);
      const blockedApi = await checkRateLimit(id, opts1);
      // tier "sensitive" should still work for same id
      const allowedSensitive = await checkRateLimit(id, opts2);
      expect(blockedApi.success).toBe(false);
      expect(allowedSensitive.success).toBe(true);
    });
  });

  // ---- Pre-configured tier helpers ----

  describe('checkGeneralLimit', () => {
    it('allows requests and returns distributed: false', async () => {
      const result = await checkGeneralLimit(`ip-general-${Date.now()}`);
      expect(result.success).toBe(true);
      expect(result.distributed).toBe(false);
      expect(result.remaining).toBe(99); // limit 100, first request
    });
  });

  describe('checkSensitiveLimit', () => {
    it('has a limit of 10 per minute', async () => {
      const ip = `ip-sensitive-${Date.now()}`;
      let result;
      for (let i = 0; i < 10; i++) {
        result = await checkSensitiveLimit(ip);
      }
      // 10th request should still succeed (count == limit)
      expect(result!.success).toBe(true);
      expect(result!.remaining).toBe(0);
      // 11th should be blocked
      const blocked = await checkSensitiveLimit(ip);
      expect(blocked.success).toBe(false);
    });
  });

  describe('checkTenantLimit', () => {
    it('allows requests with limit of 500', async () => {
      const result = await checkTenantLimit(`tenant-${Date.now()}`);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(499);
    });
  });

  describe('checkInferenceLimit', () => {
    it('allows requests with limit of 30', async () => {
      const result = await checkInferenceLimit(`ip-inference-${Date.now()}`);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(29);
    });
  });
});
