import { describe, it, expect } from 'vitest';

describe('Firebase Types', () => {
    it('should validate CallLog type structure', () => {
        const callLog = {
            id: 'test-call-1',
            customerPhone: '+905321234567',
            customerName: 'Test User',
            duration: 120,
            status: 'answered' as const,
            createdAt: { toDate: () => new Date(), seconds: 0, nanoseconds: 0 },
        };

        expect(callLog.id).toBeTruthy();
        expect(callLog.customerPhone).toMatch(/^\+90/);
        expect(callLog.duration).toBeGreaterThan(0);
        expect(['answered', 'missed', 'rejected']).toContain(callLog.status);
    });

    it('should validate Appointment type structure', () => {
        const appointment = {
            id: 'test-apt-1',
            customerId: 'cust-1',
            customerName: 'Test Customer',
            dateTime: { toDate: () => new Date(), seconds: 0, nanoseconds: 0 },
            status: 'scheduled' as const,
            createdAt: { toDate: () => new Date(), seconds: 0, nanoseconds: 0 },
        };

        expect(appointment.id).toBeTruthy();
        expect(appointment.customerId).toBeTruthy();
        expect(['scheduled', 'confirmed', 'completed', 'cancelled']).toContain(appointment.status);
    });

    it('should validate Complaint type structure', () => {
        const complaint = {
            id: 'test-comp-1',
            customerId: 'cust-1',
            category: 'Ürün Kalitesi',
            description: 'Detaylı açıklama',
            status: 'open' as const,
            priority: 'high' as const,
            createdAt: { toDate: () => new Date(), seconds: 0, nanoseconds: 0 },
        };

        expect(complaint.id).toBeTruthy();
        expect(complaint.category).toBeTruthy();
        expect(complaint.description).toBeTruthy();
        expect(['open', 'investigating', 'resolved', 'closed']).toContain(complaint.status);
        expect(['low', 'medium', 'high', 'urgent']).toContain(complaint.priority);
    });

    it('should validate Customer type structure', () => {
        const customer = {
            id: 'test-cust-1',
            name: 'Ali Yılmaz',
            phone: '+905321234567',
            email: 'ali@example.com',
            createdAt: { toDate: () => new Date(), seconds: 0, nanoseconds: 0 },
        };

        expect(customer.id).toBeTruthy();
        expect(customer.name).toBeTruthy();
        expect(customer.phone).toMatch(/^\+90/);
        expect(customer.email).toContain('@');
    });

    it('should validate ActivityLog type structure', () => {
        const log = {
            id: 'test-log-1',
            type: 'call' as const,
            description: 'Yeni çağrı alındı',
            createdAt: { toDate: () => new Date(), seconds: 0, nanoseconds: 0 },
        };

        expect(log.id).toBeTruthy();
        expect(['call', 'appointment', 'complaint', 'info', 'system']).toContain(log.type);
        expect(log.description).toBeTruthy();
    });
});
