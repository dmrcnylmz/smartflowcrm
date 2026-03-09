/**
 * API Route Tests — /api/reports/custom
 *
 * Tests GET handler for the custom date-range reporting route.
 * Mocks lib/firebase/admin-db functions, date-helpers, cache-headers, and error-handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Mock functions ──────────────────────────────────────────────────────────

const mockGetTenantFromRequest = vi.fn();
const mockGetCallLogs = vi.fn();
const mockGetComplaints = vi.fn();
const mockGetInfoRequests = vi.fn();
const mockGetAppointments = vi.fn();

vi.mock('@/lib/firebase/admin-db', () => ({
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
  getCallLogs: (...args: unknown[]) => mockGetCallLogs(...args),
  getComplaints: (...args: unknown[]) => mockGetComplaints(...args),
  getInfoRequests: (...args: unknown[]) => mockGetInfoRequests(...args),
  getAppointments: (...args: unknown[]) => mockGetAppointments(...args),
}));

vi.mock('@/lib/utils/error-handler', () => ({
  handleApiError: vi.fn((err: unknown) => {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
}));

const mockCacheHeaders = vi.fn(() => ({ 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' }));
vi.mock('@/lib/utils/cache-headers', () => ({
  cacheHeaders: (...args: unknown[]) => mockCacheHeaders(...args),
}));

vi.mock('@/lib/utils/date-helpers', () => ({
  toDate: vi.fn((val: unknown) => {
    if (val instanceof Date) return val;
    if (typeof val === 'string' || typeof val === 'number') return new Date(val as string | number);
    if (typeof val === 'object' && val !== null && 'toDate' in val) {
      return (val as { toDate: () => Date }).toDate();
    }
    return null;
  }),
}));

// ── Test data ───────────────────────────────────────────────────────────────

const baseCalls = [
  { id: 'c1', status: 'answered', durationSec: 120, timestamp: '2024-01-15T10:00:00Z' },
  { id: 'c2', status: 'missed', durationSec: 0, timestamp: '2024-01-15T14:00:00Z' },
  { id: 'c3', status: 'answered', durationSec: 180, timestamp: '2024-01-16T09:00:00Z' },
];

const baseComplaints = [
  { id: 'comp1', status: 'open', createdAt: '2024-01-15T10:00:00Z' },
  { id: 'comp2', status: 'resolved', createdAt: '2024-01-16T10:00:00Z' },
  { id: 'comp3', status: 'open', createdAt: '2023-12-01T10:00:00Z' }, // Out of range
];

const baseInfoRequests = [
  { id: 'ir1', status: 'pending', createdAt: '2024-01-15T08:00:00Z' },
  { id: 'ir2', status: 'completed', createdAt: '2024-01-16T12:00:00Z' },
  { id: 'ir3', status: 'pending', createdAt: '2023-11-20T10:00:00Z' }, // Out of range
];

const baseAppointments = [
  { id: 'a1', status: 'scheduled', dateTime: '2024-01-15T14:00:00Z' },
  { id: 'a2', status: 'completed', dateTime: '2024-01-16T16:00:00Z' },
];

// ── Tests ───────────────────────────────────────────────────────────────────

describe('/api/reports/custom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromRequest.mockReturnValue('tenant-123');
    mockGetCallLogs.mockResolvedValue(baseCalls);
    mockGetComplaints.mockResolvedValue(baseComplaints);
    mockGetInfoRequests.mockResolvedValue(baseInfoRequests);
    mockGetAppointments.mockResolvedValue(baseAppointments);
  });

  it('should return report for valid date range', async () => {
    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dateFrom).toBeDefined();
    expect(data.dateTo).toBeDefined();
    expect(data.dateRangeLabel).toBeDefined();
    expect(data.summary).toBeDefined();
    expect(data.breakdownType).toBeDefined();
    expect(data.dailyBreakdown).toBeDefined();
    expect(data.summary.totalCalls).toBe(3);
  });

  it('should return 403 when no tenant', async () => {
    mockGetTenantFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBeDefined();
    expect(mockGetCallLogs).not.toHaveBeenCalled();
  });

  it('should return 400 when dateFrom missing', async () => {
    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('dateFrom');
    expect(mockGetCallLogs).not.toHaveBeenCalled();
  });

  it('should return 400 when dateTo missing', async () => {
    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('dateTo');
    expect(mockGetCallLogs).not.toHaveBeenCalled();
  });

  it('should calculate daily breakdown for <=7 day range', async () => {
    const { GET } = await import('@/app/api/reports/custom/route');
    // 3 day range: Jan 15 -> Jan 17
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.breakdownType).toBe('daily');
    expect(data.dailyBreakdown).toBeDefined();
    expect(Array.isArray(data.dailyBreakdown)).toBe(true);
    expect(data.dailyBreakdown.length).toBe(3); // 15th, 16th, 17th
    for (const entry of data.dailyBreakdown) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('dateObj');
      expect(entry).toHaveProperty('calls');
      expect(entry).toHaveProperty('answered');
      expect(entry).toHaveProperty('missed');
    }
  });

  it('should calculate summary counts', async () => {
    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // 3 calls total: 2 answered, 1 missed
    expect(data.summary.totalCalls).toBe(3);
    expect(data.summary.answeredCalls).toBe(2);
    expect(data.summary.missedCalls).toBe(1);
    // avgCallDuration: (120 + 0 + 180) / 3 = 100
    expect(data.summary.avgCallDuration).toBe(100);
    // In-range complaints: comp1 (open), comp2 (resolved) — comp3 is out of range
    expect(data.summary.totalComplaints).toBe(2);
    expect(data.summary.openComplaints).toBe(1);
    expect(data.summary.resolvedComplaints).toBe(1);
    // In-range info requests: ir1 (pending), ir2 (completed) — ir3 is out of range
    expect(data.summary.openInfoRequests).toBe(1);
    // Appointments: a1 (scheduled), a2 (completed)
    expect(data.summary.scheduledAppointments).toBe(1);
    expect(data.summary.completedAppointments).toBe(1);
  });

  it('should filter complaints by date range', async () => {
    // Complaints with mixed dates: only 2 should be in range
    mockGetComplaints.mockResolvedValue([
      { id: 'comp1', status: 'open', createdAt: '2024-01-15T10:00:00Z' },
      { id: 'comp2', status: 'resolved', createdAt: '2024-01-16T10:00:00Z' },
      { id: 'comp3', status: 'open', createdAt: '2023-12-01T10:00:00Z' },  // Out of range (before)
      { id: 'comp4', status: 'open', createdAt: '2024-02-01T10:00:00Z' },  // Out of range (after)
    ]);

    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Only comp1 and comp2 are within the date range
    expect(data.summary.totalComplaints).toBe(2);
    expect(data.summary.openComplaints).toBe(1);
    expect(data.summary.resolvedComplaints).toBe(1);
  });

  it('should return comparison data when compare params provided', async () => {
    // Current period calls (main fetch)
    mockGetCallLogs
      .mockResolvedValueOnce(baseCalls)          // current: 3 calls
      .mockResolvedValueOnce([baseCalls[0]]);     // previous: 1 call

    // Complaints are fetched fully then filtered; second fetch for comparison
    mockGetComplaints
      .mockResolvedValueOnce(baseComplaints)      // current period complaints
      .mockResolvedValueOnce([                     // comparison period complaints
        { id: 'ccomp1', status: 'open', createdAt: '2024-01-01T10:00:00Z' },
      ]);

    mockGetInfoRequests
      .mockResolvedValueOnce(baseInfoRequests)
      .mockResolvedValueOnce([]);

    mockGetAppointments
      .mockResolvedValueOnce(baseAppointments)    // current: 2 appointments
      .mockResolvedValueOnce([baseAppointments[0]]); // previous: 1 appointment

    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17&compareFrom=2024-01-01&compareTo=2024-01-03',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.comparison).not.toBeNull();
    expect(data.comparison.calls).toBeDefined();
    expect(data.comparison.calls.current).toBe(3);
    expect(data.comparison.calls.previous).toBe(1);
    expect(data.comparison.calls.change).toBe(2);
    expect(data.comparison.calls.changePercent).toBe(200);
    expect(data.comparison.appointments).toBeDefined();
    expect(data.comparison.appointments.current).toBe(2);
    expect(data.comparison.appointments.previous).toBe(1);
    expect(data.comparison.appointments.change).toBe(1);
    expect(data.comparison.appointments.changePercent).toBe(100);
  });

  it('should calculate change percent correctly', async () => {
    // 10 current calls vs 5 previous calls = 100% change
    const tenCalls = Array.from({ length: 10 }, (_, i) => ({
      id: `cc${i}`, status: 'answered', durationSec: 60, timestamp: '2024-01-15T10:00:00Z',
    }));
    const fiveCalls = Array.from({ length: 5 }, (_, i) => ({
      id: `pc${i}`, status: 'answered', durationSec: 60, timestamp: '2024-01-01T10:00:00Z',
    }));

    mockGetCallLogs
      .mockResolvedValueOnce(tenCalls)   // current: 10 calls
      .mockResolvedValueOnce(fiveCalls); // previous: 5 calls
    mockGetComplaints
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockGetInfoRequests
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockGetAppointments
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17&compareFrom=2024-01-01&compareTo=2024-01-03',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // (10 - 5) / 5 * 100 = 100
    expect(data.comparison.calls.current).toBe(10);
    expect(data.comparison.calls.previous).toBe(5);
    expect(data.comparison.calls.change).toBe(5);
    expect(data.comparison.calls.changePercent).toBe(100);
  });

  it('should handle zero previous in comparison', async () => {
    mockGetCallLogs
      .mockResolvedValueOnce(baseCalls)  // current: 3 calls
      .mockResolvedValueOnce([]);        // previous: 0 calls
    mockGetComplaints
      .mockResolvedValueOnce(baseComplaints)
      .mockResolvedValueOnce([]);
    mockGetInfoRequests
      .mockResolvedValueOnce(baseInfoRequests)
      .mockResolvedValueOnce([]);
    mockGetAppointments
      .mockResolvedValueOnce(baseAppointments)
      .mockResolvedValueOnce([]);        // previous: 0 appointments

    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17&compareFrom=2024-01-01&compareTo=2024-01-03',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // 0 previous => changePercent should be 0 (not NaN or Infinity)
    expect(data.comparison.calls.previous).toBe(0);
    expect(data.comparison.calls.changePercent).toBe(0);
    expect(Number.isFinite(data.comparison.calls.changePercent)).toBe(true);
    expect(data.comparison.appointments.previous).toBe(0);
    expect(data.comparison.appointments.changePercent).toBe(0);
    expect(Number.isFinite(data.comparison.appointments.changePercent)).toBe(true);
  });

  it('should use LONG cache headers', async () => {
    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockCacheHeaders).toHaveBeenCalledWith('LONG');
    expect(response.headers.get('Cache-Control')).toBe(
      'private, max-age=60, stale-while-revalidate=120',
    );
  });

  it('should handle empty data gracefully', async () => {
    mockGetCallLogs.mockResolvedValue([]);
    mockGetComplaints.mockResolvedValue([]);
    mockGetInfoRequests.mockResolvedValue([]);
    mockGetAppointments.mockResolvedValue([]);

    const { GET } = await import('@/app/api/reports/custom/route');
    const request = createMockRequest(
      '/api/reports/custom?dateFrom=2024-01-15&dateTo=2024-01-17',
      { headers: { 'x-user-tenant': 'tenant-123' } },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary.totalCalls).toBe(0);
    expect(data.summary.missedCalls).toBe(0);
    expect(data.summary.answeredCalls).toBe(0);
    expect(data.summary.avgCallDuration).toBe(0);
    expect(data.summary.totalComplaints).toBe(0);
    expect(data.summary.openComplaints).toBe(0);
    expect(data.summary.resolvedComplaints).toBe(0);
    expect(data.summary.openInfoRequests).toBe(0);
    expect(data.summary.scheduledAppointments).toBe(0);
    expect(data.summary.completedAppointments).toBe(0);
    expect(data.comparison).toBeNull();
  });
});
