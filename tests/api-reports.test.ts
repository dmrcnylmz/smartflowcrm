/**
 * API Route Tests — /api/reports/daily, /api/reports/weekly, /api/reports/monthly
 *
 * Tests GET handlers for daily, weekly, and monthly reporting routes.
 * Mocks lib/firebase/admin-db functions, date-helpers, demo-data, and error-handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ── Mock data ──────────────────────────────────────────────────────────────

const mockCallLogs = [
  { id: 'c1', timestamp: new Date('2024-03-06T10:00:00'), intent: 'appointment', status: 'answered', durationSec: 120 },
  { id: 'c2', timestamp: new Date('2024-03-06T11:00:00'), intent: 'complaint', status: 'missed', durationSec: 0 },
  { id: 'c3', timestamp: new Date('2024-03-06T14:00:00'), intent: 'info', status: 'answered', durationSec: 180 },
];

const mockComplaints = [
  { id: 'comp1', category: 'service', status: 'open', createdAt: new Date('2024-03-06T10:30:00') },
  { id: 'comp2', category: 'billing', status: 'resolved', createdAt: new Date('2024-03-06T12:00:00') },
];

const mockInfoRequests = [
  { id: 'ir1', status: 'pending', createdAt: new Date('2024-03-06T09:00:00') },
  { id: 'ir2', status: 'completed', createdAt: new Date('2024-03-06T15:00:00') },
];

const mockAppointments = [
  { id: 'a1', dateTime: new Date('2024-03-06T14:00:00'), status: 'scheduled' },
  { id: 'a2', dateTime: new Date('2024-03-06T16:00:00'), status: 'completed' },
];

// ── Mock admin-db ──────────────────────────────────────────────────────────

const mockGetCallLogs = vi.fn().mockResolvedValue(mockCallLogs);
const mockGetComplaints = vi.fn().mockResolvedValue(mockComplaints);
const mockGetInfoRequests = vi.fn().mockResolvedValue(mockInfoRequests);
const mockGetAppointments = vi.fn().mockResolvedValue(mockAppointments);
const mockGetTenantFromRequest = vi.fn().mockReturnValue('tenant-123');

vi.mock('@/lib/firebase/admin-db', () => ({
  getCallLogs: (...args: unknown[]) => mockGetCallLogs(...args),
  getComplaints: (...args: unknown[]) => mockGetComplaints(...args),
  getInfoRequests: (...args: unknown[]) => mockGetInfoRequests(...args),
  getAppointments: (...args: unknown[]) => mockGetAppointments(...args),
  getTenantFromRequest: (...args: unknown[]) => mockGetTenantFromRequest(...args),
}));

// Mock date-helpers — pass-through conversion
vi.mock('@/lib/utils/date-helpers', () => ({
  toDate: vi.fn((val: unknown) => {
    if (val instanceof Date) return val;
    if (typeof val === 'string') return new Date(val);
    if (typeof val === 'object' && val !== null && 'toDate' in val) {
      return (val as { toDate: () => Date }).toDate();
    }
    return null;
  }),
}));

// Mock demo data
vi.mock('@/lib/firebase/demo-data', () => ({
  demoCallLogs: [
    { id: 'demo-c1', status: 'answered', durationSec: 60, timestamp: new Date('2024-03-06T10:00:00') },
    { id: 'demo-c2', status: 'missed', durationSec: 0, timestamp: new Date('2024-03-06T11:00:00') },
  ],
  demoComplaints: [
    { id: 'demo-comp1', status: 'open', category: 'service', createdAt: new Date('2024-03-06T10:00:00') },
  ],
  demoInfoRequests: [
    { id: 'demo-ir1', status: 'pending', createdAt: new Date('2024-03-06T09:00:00') },
  ],
  demoAppointments: [
    { id: 'demo-a1', status: 'scheduled', dateTime: new Date('2024-03-06T14:00:00') },
  ],
}));

// Mock error handler
vi.mock('@/lib/utils/error-handler', () => ({
  handleApiError: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 }),
  ),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe('/api/reports/daily', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromRequest.mockReturnValue('tenant-123');
    mockGetCallLogs.mockResolvedValue(mockCallLogs);
    mockGetComplaints.mockResolvedValue(mockComplaints);
    mockGetInfoRequests.mockResolvedValue(mockInfoRequests);
    mockGetAppointments.mockResolvedValue(mockAppointments);
  });

  it('should return daily summary with correct call counts', async () => {
    const { GET } = await import('@/app/api/reports/daily/route');
    const request = createMockRequest('/api/reports/daily?date=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.date).toBe('2024-03-06');
    expect(data.demoMode).toBe(false);
    expect(data.summary.totalCalls).toBe(3);
    expect(data.summary.missedCalls).toBe(1);
    expect(data.summary.answeredCalls).toBe(2);
    expect(mockGetCallLogs).toHaveBeenCalledWith('tenant-123', expect.objectContaining({
      dateFrom: expect.any(Date),
      dateTo: expect.any(Date),
    }));
  });

  it('should use demo data when no tenant', async () => {
    mockGetTenantFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/reports/daily/route');
    const request = createMockRequest('/api/reports/daily?date=2024-03-06');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.demoMode).toBe(true);
    // Demo data has 2 calls (demo-c1 answered, demo-c2 missed)
    expect(data.summary.totalCalls).toBe(2);
    expect(data.summary.missedCalls).toBe(1);
    expect(data.summary.answeredCalls).toBe(1);
    // Should NOT have called the real data fetchers
    expect(mockGetCallLogs).not.toHaveBeenCalled();
  });

  it('should accept custom date parameter', async () => {
    const { GET } = await import('@/app/api/reports/daily/route');
    const request = createMockRequest('/api/reports/daily?date=2024-06-15', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.date).toBe('2024-06-15');
    // Verify the date range was passed to getCallLogs
    const callArgs = mockGetCallLogs.mock.calls[0];
    expect(callArgs[0]).toBe('tenant-123');
    const dateFrom = callArgs[1].dateFrom as Date;
    const dateTo = callArgs[1].dateTo as Date;
    expect(dateFrom.getFullYear()).toBe(2024);
    expect(dateFrom.getMonth()).toBe(5); // June = 5
    expect(dateFrom.getDate()).toBe(15);
    expect(dateTo.getDate()).toBe(15);
  });

  it('should calculate avgCallDuration correctly', async () => {
    const { GET } = await import('@/app/api/reports/daily/route');
    const request = createMockRequest('/api/reports/daily?date=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    // (120 + 0 + 180) / 3 = 100
    expect(data.summary.avgCallDuration).toBe(100);
  });

  it('should count open complaints and scheduled appointments', async () => {
    const { GET } = await import('@/app/api/reports/daily/route');
    const request = createMockRequest('/api/reports/daily?date=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(data.summary.openComplaints).toBe(1);
    expect(data.summary.totalComplaints).toBe(2);
    expect(data.summary.resolvedComplaints).toBe(1);
    expect(data.summary.openInfoRequests).toBe(1);
    expect(data.summary.scheduledAppointments).toBe(1);
    expect(data.summary.completedAppointments).toBe(1);
  });
});

// ── Weekly Report ──────────────────────────────────────────────────────────

describe('/api/reports/weekly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromRequest.mockReturnValue('tenant-123');
    mockGetCallLogs.mockResolvedValue(mockCallLogs);
    mockGetComplaints.mockResolvedValue(mockComplaints);
    mockGetInfoRequests.mockResolvedValue(mockInfoRequests);
    mockGetAppointments.mockResolvedValue(mockAppointments);
  });

  it('should return weekly summary with comparison', async () => {
    // Current week calls
    mockGetCallLogs
      .mockResolvedValueOnce(mockCallLogs)    // current week
      .mockResolvedValueOnce([mockCallLogs[0]]); // previous week (1 call)
    mockGetComplaints.mockResolvedValue(mockComplaints);
    mockGetInfoRequests.mockResolvedValue(mockInfoRequests);
    mockGetAppointments
      .mockResolvedValueOnce(mockAppointments)   // current week
      .mockResolvedValueOnce([mockAppointments[0]]); // previous week

    const { GET } = await import('@/app/api/reports/weekly/route');
    const request = createMockRequest('/api/reports/weekly?week=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.summary).toBeDefined();
    expect(data.comparison).toBeDefined();
    expect(data.comparison.calls).toBeDefined();
    expect(data.comparison.calls.current).toBe(3);
    expect(data.comparison.calls.previous).toBe(1);
    expect(data.comparison.calls.change).toBe(2);
    expect(data.comparison.calls.changePercent).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('private');
  });

  it('should return 403 when no tenant', async () => {
    mockGetTenantFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/reports/weekly/route');
    const request = createMockRequest('/api/reports/weekly?week=2024-03-06');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBeDefined();
    expect(mockGetCallLogs).not.toHaveBeenCalled();
  });

  it('should include daily breakdown with 7 entries', async () => {
    const { GET } = await import('@/app/api/reports/weekly/route');
    const request = createMockRequest('/api/reports/weekly?week=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dailyBreakdown).toBeDefined();
    expect(data.dailyBreakdown).toHaveLength(7);
    // Each entry should have date, calls, answered, missed
    for (const day of data.dailyBreakdown) {
      expect(day).toHaveProperty('date');
      expect(day).toHaveProperty('dateObj');
      expect(day).toHaveProperty('calls');
      expect(day).toHaveProperty('answered');
      expect(day).toHaveProperty('missed');
    }
  });

  it('should calculate week comparison with previous week', async () => {
    const prevWeekCalls = [
      { id: 'pc1', timestamp: new Date('2024-02-28T10:00:00'), status: 'answered', durationSec: 90 },
      { id: 'pc2', timestamp: new Date('2024-02-28T11:00:00'), status: 'answered', durationSec: 60 },
    ];
    const prevWeekAppointments = [
      { id: 'pa1', dateTime: new Date('2024-02-28T14:00:00'), status: 'scheduled' },
      { id: 'pa2', dateTime: new Date('2024-02-28T15:00:00'), status: 'completed' },
      { id: 'pa3', dateTime: new Date('2024-02-28T16:00:00'), status: 'completed' },
    ];

    mockGetCallLogs
      .mockResolvedValueOnce(mockCallLogs)       // current week: 3 calls
      .mockResolvedValueOnce(prevWeekCalls);      // previous week: 2 calls
    mockGetAppointments
      .mockResolvedValueOnce(mockAppointments)       // current week: 2 appointments
      .mockResolvedValueOnce(prevWeekAppointments);  // previous week: 3 appointments

    const { GET } = await import('@/app/api/reports/weekly/route');
    const request = createMockRequest('/api/reports/weekly?week=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Calls: 3 current, 2 previous => change=1, changePercent=50
    expect(data.comparison.calls.current).toBe(3);
    expect(data.comparison.calls.previous).toBe(2);
    expect(data.comparison.calls.change).toBe(1);
    expect(data.comparison.calls.changePercent).toBe(50);
    // Appointments: 2 current, 3 previous => change=-1, changePercent=-33
    expect(data.comparison.appointments.current).toBe(2);
    expect(data.comparison.appointments.previous).toBe(3);
    expect(data.comparison.appointments.change).toBe(-1);
    expect(data.comparison.appointments.changePercent).toBe(-33);
  });

  it('should include weekLabel in response', async () => {
    const { GET } = await import('@/app/api/reports/weekly/route');
    const request = createMockRequest('/api/reports/weekly?week=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.weekLabel).toBeDefined();
    expect(typeof data.weekLabel).toBe('string');
    expect(data.weekLabel.length).toBeGreaterThan(0);
    // weekLabel is formatted with Turkish locale, e.g. "4 Mar - 10 Mar 2024"
    expect(data.week).toBeDefined();
  });
});

// ── Monthly Report ─────────────────────────────────────────────────────────

describe('/api/reports/monthly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFromRequest.mockReturnValue('tenant-123');
    mockGetCallLogs.mockResolvedValue(mockCallLogs);
    mockGetComplaints.mockResolvedValue(mockComplaints);
    mockGetInfoRequests.mockResolvedValue(mockInfoRequests);
    mockGetAppointments.mockResolvedValue(mockAppointments);
  });

  it('should return monthly summary', async () => {
    const { GET } = await import('@/app/api/reports/monthly/route');
    const request = createMockRequest('/api/reports/monthly?month=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.month).toBeDefined();
    expect(data.summary).toBeDefined();
    expect(data.summary.totalCalls).toBe(3);
    expect(data.summary.missedCalls).toBe(1);
    expect(data.summary.answeredCalls).toBe(2);
    expect(data.summary.avgCallDuration).toBe(100); // (120+0+180)/3 = 100
    expect(response.headers.get('Cache-Control')).toContain('private');
  });

  it('should return 403 when no tenant', async () => {
    mockGetTenantFromRequest.mockReturnValue(null);

    const { GET } = await import('@/app/api/reports/monthly/route');
    const request = createMockRequest('/api/reports/monthly?month=2024-03-06');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBeDefined();
    expect(mockGetCallLogs).not.toHaveBeenCalled();
  });

  it('should include weekly breakdown', async () => {
    const { GET } = await import('@/app/api/reports/monthly/route');
    const request = createMockRequest('/api/reports/monthly?month=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.weeklyBreakdown).toBeDefined();
    expect(Array.isArray(data.weeklyBreakdown)).toBe(true);
    // March 2024 has at least 4 weeks
    expect(data.weeklyBreakdown.length).toBeGreaterThanOrEqual(4);
    // Each entry should have week, weekStart, calls, answered, missed
    for (const week of data.weeklyBreakdown) {
      expect(week).toHaveProperty('week');
      expect(week).toHaveProperty('weekStart');
      expect(week).toHaveProperty('calls');
      expect(week).toHaveProperty('answered');
      expect(week).toHaveProperty('missed');
    }
  });

  it('should calculate month comparison with previous month', async () => {
    const prevMonthCalls = [
      { id: 'pm1', timestamp: new Date('2024-02-10T10:00:00'), status: 'answered', durationSec: 90 },
    ];
    const prevMonthAppointments = [
      { id: 'pma1', dateTime: new Date('2024-02-10T14:00:00'), status: 'scheduled' },
      { id: 'pma2', dateTime: new Date('2024-02-10T16:00:00'), status: 'completed' },
      { id: 'pma3', dateTime: new Date('2024-02-11T10:00:00'), status: 'completed' },
      { id: 'pma4', dateTime: new Date('2024-02-11T12:00:00'), status: 'completed' },
    ];

    mockGetCallLogs
      .mockResolvedValueOnce(mockCallLogs)       // current month: 3 calls
      .mockResolvedValueOnce(prevMonthCalls);     // previous month: 1 call
    mockGetAppointments
      .mockResolvedValueOnce(mockAppointments)        // current month: 2 appointments
      .mockResolvedValueOnce(prevMonthAppointments);  // previous month: 4 appointments

    const { GET } = await import('@/app/api/reports/monthly/route');
    const request = createMockRequest('/api/reports/monthly?month=2024-03-15', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.comparison).toBeDefined();
    // Calls: 3 current, 1 previous => change=2, changePercent=200
    expect(data.comparison.calls.current).toBe(3);
    expect(data.comparison.calls.previous).toBe(1);
    expect(data.comparison.calls.change).toBe(2);
    expect(data.comparison.calls.changePercent).toBe(200);
    // Appointments: 2 current, 4 previous => change=-2, changePercent=-50
    expect(data.comparison.appointments.current).toBe(2);
    expect(data.comparison.appointments.previous).toBe(4);
    expect(data.comparison.appointments.change).toBe(-2);
    expect(data.comparison.appointments.changePercent).toBe(-50);
  });

  it('should include monthLabel in response', async () => {
    const { GET } = await import('@/app/api/reports/monthly/route');
    const request = createMockRequest('/api/reports/monthly?month=2024-03-06', {
      headers: { 'x-user-tenant': 'tenant-123' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.monthLabel).toBeDefined();
    expect(typeof data.monthLabel).toBe('string');
    expect(data.monthLabel.length).toBeGreaterThan(0);
    // monthLabel is formatted with Turkish locale, e.g. "Mart 2024"
    expect(data.month).toBe('2024-03');
  });
});
