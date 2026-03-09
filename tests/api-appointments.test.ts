/**
 * API Route Tests — /api/appointments
 *
 * Tests GET (list with filters), POST (create + webhook), and PATCH (update) handlers.
 * Mocks lib/firebase/admin-db functions and n8n webhook client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest } from './helpers/api-test-utils';

// ─── Mock fns ────────────────────────────────────────────────────────────────

const mockGetAppointments = vi.fn();
const mockCreateAppointment = vi.fn();
const mockUpdateAppointment = vi.fn();

vi.mock('@/lib/firebase/admin-db', () => ({
    getAppointments: (...args: unknown[]) => mockGetAppointments(...args),
    createAppointment: (...args: unknown[]) => mockCreateAppointment(...args),
    updateAppointment: (...args: unknown[]) => mockUpdateAppointment(...args),
    Timestamp: {
        fromDate: (d: Date) => ({ _seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
    },
}));

vi.mock('@/lib/utils/require-strict-auth', () => ({
    requireStrictAuth: vi.fn().mockResolvedValue({
        uid: 'test-uid',
        email: 'test@example.com',
        tenantId: 'tenant-123',
    }),
}));

vi.mock('@/lib/n8n/client', () => ({
    sendWebhook: vi.fn().mockResolvedValue(undefined),
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('/api/appointments', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── GET ──────────────────────────────────────────────────────────────────

    describe('GET', () => {
        it('should return appointments list', async () => {
            const mockAppointments = [
                { id: 'a1', customerId: 'c1', status: 'scheduled' },
                { id: 'a2', customerId: 'c2', status: 'completed' },
            ];
            mockGetAppointments.mockResolvedValue(mockAppointments);

            const { GET } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data).toHaveLength(2);
            expect(data[0].id).toBe('a1');
            expect(data[1].id).toBe('a2');
            expect(response.headers.get('Cache-Control')).toContain('private');
            expect(mockGetAppointments).toHaveBeenCalledOnce();
        });

        it('should pass customerId filter', async () => {
            mockGetAppointments.mockResolvedValue([]);

            const { GET } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments?customerId=c1', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            await GET(request);

            expect(mockGetAppointments).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({ customerId: 'c1' })
            );
        });

        it('should pass status filter', async () => {
            mockGetAppointments.mockResolvedValue([]);

            const { GET } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments?status=scheduled', {
                headers: { 'Authorization': 'Bearer test-token' },
            });

            await GET(request);

            expect(mockGetAppointments).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({ status: 'scheduled' })
            );
        });

        it('should pass dateFrom and dateTo filters', async () => {
            mockGetAppointments.mockResolvedValue([]);

            const { GET } = await import('@/app/api/appointments/route');
            const request = createMockRequest(
                '/api/appointments?dateFrom=2025-01-01&dateTo=2025-12-31',
                { headers: { 'Authorization': 'Bearer test-token' } }
            );

            await GET(request);

            expect(mockGetAppointments).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({
                    dateFrom: expect.any(Date),
                    dateTo: expect.any(Date),
                })
            );
        });

        it('should return 401 when auth fails', async () => {
            const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
            vi.mocked(requireStrictAuth).mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            } as never);

            const { GET } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments');

            const response = await GET(request);
            expect(response.status).toBe(401);
        });
    });

    // ── POST ─────────────────────────────────────────────────────────────────

    describe('POST', () => {
        it('should create appointment with valid body', async () => {
            mockCreateAppointment.mockResolvedValue({ id: 'appt-1' });

            const { POST } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: {
                    customerId: 'c1',
                    dateTime: '2025-06-15T10:00:00Z',
                    durationMin: 45,
                    notes: 'Checkup',
                },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(201);
            expect(data.success).toBe(true);
            expect(data.appointmentId).toBe('appt-1');
            expect(mockCreateAppointment).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({
                    customerId: 'c1',
                    durationMin: 45,
                    status: 'scheduled',
                    notes: 'Checkup',
                })
            );
        });

        it('should fire on_new_appointment webhook', async () => {
            mockCreateAppointment.mockResolvedValue({ id: 'appt-2' });

            const { POST } = await import('@/app/api/appointments/route');
            const { sendWebhook } = await import('@/lib/n8n/client');
            const request = createMockRequest('/api/appointments', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { customerId: 'c1', dateTime: '2025-06-15T10:00:00Z' },
            });

            await POST(request);

            expect(sendWebhook).toHaveBeenCalledWith(
                'on_new_appointment',
                expect.objectContaining({
                    tenantId: 'tenant-123',
                    arguments: expect.objectContaining({
                        appointmentId: 'appt-2',
                        customerId: 'c1',
                    }),
                })
            );
        });

        it('should return 400 when customerId is missing', async () => {
            const { POST } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { dateTime: '2025-06-15T10:00:00Z' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should return 400 when dateTime is missing', async () => {
            const { POST } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { customerId: 'c1' },
            });

            const response = await POST(request);
            expect(response.status).toBe(400);
        });

        it('should use default durationMin of 30', async () => {
            mockCreateAppointment.mockResolvedValue({ id: 'appt-3' });

            const { POST } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { customerId: 'c1', dateTime: '2025-06-15T10:00:00Z' },
            });

            await POST(request);

            expect(mockCreateAppointment).toHaveBeenCalledWith(
                'tenant-123',
                expect.objectContaining({ durationMin: 30 })
            );
        });

        it('should return 401 when auth fails', async () => {
            const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
            vi.mocked(requireStrictAuth).mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            } as never);

            const { POST } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'POST',
                body: { customerId: 'c1', dateTime: '2025-06-15T10:00:00Z' },
            });

            const response = await POST(request);
            expect(response.status).toBe(401);
        });
    });

    // ── PATCH ────────────────────────────────────────────────────────────────

    describe('PATCH', () => {
        it('should update appointment successfully', async () => {
            mockUpdateAppointment.mockResolvedValue(undefined);

            const { PATCH } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { id: 'appt-1', status: 'completed', notes: 'Done' },
            });

            const response = await PATCH(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(mockUpdateAppointment).toHaveBeenCalledWith(
                'tenant-123',
                'appt-1',
                expect.objectContaining({ status: 'completed', notes: 'Done' })
            );
        });

        it('should convert dateTime to Timestamp', async () => {
            mockUpdateAppointment.mockResolvedValue(undefined);

            const { PATCH } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { id: 'appt-1', dateTime: '2025-07-20T14:00:00Z' },
            });

            await PATCH(request);

            expect(mockUpdateAppointment).toHaveBeenCalledWith(
                'tenant-123',
                'appt-1',
                expect.objectContaining({
                    dateTime: expect.objectContaining({ _seconds: expect.any(Number), nanoseconds: 0 }),
                })
            );
        });

        it('should return 400 when id is missing', async () => {
            const { PATCH } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer test-token' },
                body: { status: 'cancelled' },
            });

            const response = await PATCH(request);
            expect(response.status).toBe(400);
        });

        it('should return 401 when auth fails', async () => {
            const { requireStrictAuth } = await import('@/lib/utils/require-strict-auth');
            vi.mocked(requireStrictAuth).mockResolvedValueOnce({
                error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
            } as never);

            const { PATCH } = await import('@/app/api/appointments/route');
            const request = createMockRequest('/api/appointments', {
                method: 'PATCH',
                body: { id: 'appt-1', status: 'cancelled' },
            });

            const response = await PATCH(request);
            expect(response.status).toBe(401);
        });
    });
});
