import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase Firestore
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_, name: string) => ({ path: name })),
    addDoc: vi.fn().mockResolvedValue({ id: 'new-doc-id' }),
    getDocs: vi.fn().mockResolvedValue({
        docs: [
            {
                id: 'doc-1',
                data: () => ({
                    customerName: 'Test Customer',
                    phone: '555-0100',
                    status: 'completed',
                    createdAt: { seconds: 1700000000, nanoseconds: 0 },
                }),
            },
            {
                id: 'doc-2',
                data: () => ({
                    customerName: 'Other Customer',
                    phone: '555-0200',
                    status: 'pending',
                    createdAt: { seconds: 1700100000, nanoseconds: 0 },
                }),
            },
        ],
        empty: false,
    }),
    getDoc: vi.fn().mockResolvedValue({
        exists: () => true,
        id: 'doc-1',
        data: () => ({
            customerName: 'Test Customer',
            phone: '555-0100',
            createdAt: { seconds: 1700000000, nanoseconds: 0 },
        }),
    }),
    doc: vi.fn((_, collection: string, id: string) => ({
        path: `${collection}/${id}`,
    })),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn((...args: unknown[]) => args),
    where: vi.fn((...args: unknown[]) => ({ type: 'where', args })),
    orderBy: vi.fn((...args: unknown[]) => ({ type: 'orderBy', args })),
    limit: vi.fn((n: number) => ({ type: 'limit', n })),
    Timestamp: {
        now: () => ({ seconds: Date.now() / 1000, nanoseconds: 0 }),
        fromDate: (d: Date) => ({ seconds: d.getTime() / 1000, nanoseconds: 0 }),
    },
    QueryConstraint: class { },
}));

vi.mock('@/lib/firebase/config', () => ({
    db: {},
}));

import {
    getCallLogs,
    addCallLog,
    updateCallLog,
    getAppointments,
    addAppointment,
    deleteAppointment,
    getComplaints,
    addComplaint,
    getCustomers,
    addCustomer,
    getCustomer,
    addActivityLog,
    getActivityLogs,
} from '@/lib/firebase/db';
import { addDoc, getDocs, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

describe('Firebase DB Operations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // --- Call Logs ---
    describe('Call Logs', () => {
        it('should fetch call logs', async () => {
            const logs = await getCallLogs();
            expect(getDocs).toHaveBeenCalled();
            expect(logs).toHaveLength(2);
            expect(logs[0].id).toBe('doc-1');
            expect(logs[0].customerName).toBe('Test Customer');
        });

        it('should add a call log with timestamp', async () => {
            const data = {
                customerPhone: '555-1234',
                customerName: 'New Call',
                status: 'answered' as const,
                duration: 120,
                direction: 'inbound' as const,
                intent: 'bilgi',
                notes: 'Test notes',
            };
            const result = await addCallLog(data);
            expect(addDoc).toHaveBeenCalled();
            expect(result).toEqual({ id: 'new-doc-id' });
        });

        it('should update a call log', async () => {
            await updateCallLog('doc-1', { status: 'answered' });
            expect(updateDoc).toHaveBeenCalled();
        });
    });

    // --- Appointments ---
    describe('Appointments', () => {
        it('should fetch appointments', async () => {
            const appointments = await getAppointments();
            expect(getDocs).toHaveBeenCalled();
            expect(appointments).toHaveLength(2);
        });

        it('should add an appointment with timestamp', async () => {
            const data = {
                customerName: 'Test Apt',
                customerId: 'cust-1',
                phone: '555-0001',
                dateTime: { seconds: 1700000000, nanoseconds: 0 } as unknown as import('firebase/firestore').Timestamp,
                service: 'Consultation',
                status: 'scheduled' as const,
                notes: '',
            };
            await addAppointment(data);
            expect(addDoc).toHaveBeenCalled();
        });

        it('should delete an appointment', async () => {
            await deleteAppointment('doc-1');
            expect(deleteDoc).toHaveBeenCalled();
        });
    });

    // --- Complaints ---
    describe('Complaints', () => {
        it('should fetch complaints', async () => {
            const complaints = await getComplaints();
            expect(getDocs).toHaveBeenCalled();
            expect(complaints).toHaveLength(2);
        });

        it('should add a complaint', async () => {
            const data = {
                customerId: 'cust-1',
                customerName: 'Unhappy Customer',
                customerPhone: '555-9999',
                category: 'service',
                description: 'Very bad service',
                status: 'open' as const,
                priority: 'high' as const,
            };
            await addComplaint(data);
            expect(addDoc).toHaveBeenCalled();
        });
    });

    // --- Customers ---
    describe('Customers', () => {
        it('should fetch all customers', async () => {
            const customers = await getCustomers();
            expect(getDocs).toHaveBeenCalled();
            expect(customers).toHaveLength(2);
        });

        it('should get a single customer by id', async () => {
            const customer = await getCustomer('doc-1');
            expect(getDoc).toHaveBeenCalled();
            expect(customer).not.toBeNull();
            expect(customer?.id).toBe('doc-1');
        });

        it('should add a customer', async () => {
            const data = {
                name: 'New Customer',
                phone: '555-0000',
                email: 'test@test.com',
            };
            await addCustomer(data);
            expect(addDoc).toHaveBeenCalled();
        });
    });

    // --- Activity Logs ---
    describe('Activity Logs', () => {
        it('should fetch activity logs', async () => {
            const logs = await getActivityLogs(10);
            expect(getDocs).toHaveBeenCalled();
            expect(logs).toHaveLength(2);
        });

        it('should add an activity log', async () => {
            const data = {
                type: 'call' as const,
                description: 'Test activity',
                userId: 'user-1',
            };
            await addActivityLog(data);
            expect(addDoc).toHaveBeenCalled();
        });
    });
});
