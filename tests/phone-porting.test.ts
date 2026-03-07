/**
 * Porting Manager Tests — lib/phone/porting.ts
 *
 * Tests BYON (Bring Your Own Number) workflow:
 *   - createPortingRequest: validation, duplicate prevention
 *   - updatePortingStatus: admin status transitions
 *   - completePorting: atomic completion + number registration
 *   - listPortingRequests: filtering by tenant/status
 *   - getPortingRequest: single lookup
 *
 * Mocks: firebase-admin/firestore
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Mock Setup
// =============================================

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn();
const mockRunTransaction = vi.fn();

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(),
    FieldValue: {
        serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
        delete: vi.fn(() => ({ _type: 'deleteField' })),
    },
}));

// =============================================
// Import after mocks
// =============================================

import {
    createPortingRequest,
    updatePortingStatus,
    completePorting,
    listPortingRequests,
    getPortingRequest,
} from '@/lib/phone/porting';

// =============================================
// Helpers
// =============================================

function createMockDb() {
    const docRef = {
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
    };

    const mockWhere = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockReturnThis();
    const mockLimit = vi.fn().mockReturnValue({ get: mockGet });

    const collRef = {
        doc: vi.fn().mockReturnValue(docRef),
        where: mockWhere,
        orderBy: mockOrderBy,
        limit: mockLimit,
        get: mockGet,
        add: mockAdd,
    };

    // Allow chaining: collection('x').where(...).where(...).limit(...).get()
    mockWhere.mockReturnValue({
        where: mockWhere,
        limit: mockLimit,
        orderBy: mockOrderBy,
        get: mockGet,
    });

    mockOrderBy.mockReturnValue({
        get: mockGet,
    });

    const db = {
        collection: vi.fn().mockReturnValue(collRef),
        runTransaction: mockRunTransaction,
    };

    return db;
}

// =============================================
// Tests
// =============================================

describe('Porting Manager', () => {
    let mockDb: ReturnType<typeof createMockDb>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = createMockDb();
    });

    // ─── createPortingRequest ───

    describe('createPortingRequest', () => {
        it('should create a new porting request', async () => {
            // No existing active porting request
            mockGet.mockResolvedValueOnce({ empty: true });
            // Number not already registered
            mockGet.mockResolvedValueOnce({ exists: false });
            // Add returns doc ref
            mockAdd.mockResolvedValue({ id: 'porting-1' });

            const result = await createPortingRequest(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                {
                    phoneNumber: '+905321234567',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'netgsm',
                    notes: 'Hızlı taşıma istiyorum',
                },
            );

            expect(result.id).toBe('porting-1');
            expect(result.tenantId).toBe('tenant-1');
            expect(result.phoneNumber).toBe('+905321234567');
            expect(result.currentCarrier).toBe('Turkcell');
            expect(result.targetCarrier).toBe('netgsm');
            expect(result.status).toBe('pending');
            expect(result.notes).toBe('Hızlı taşıma istiyorum');
        });

        it('should throw when active porting request already exists', async () => {
            // Existing active porting request found
            mockGet.mockResolvedValueOnce({
                empty: false,
                docs: [{ id: 'existing', data: () => ({ status: 'pending' }) }],
            });

            await expect(
                createPortingRequest(
                    mockDb as unknown as FirebaseFirestore.Firestore,
                    'tenant-1',
                    {
                        phoneNumber: '+905321234567',
                        currentCarrier: 'Turkcell',
                        targetCarrier: 'netgsm',
                    },
                ),
            ).rejects.toThrow('aktif bir taşıma talebi');
        });

        it('should throw when number already registered', async () => {
            // No existing porting request
            mockGet.mockResolvedValueOnce({ empty: true });
            // Number already registered
            mockGet.mockResolvedValueOnce({ exists: true });

            await expect(
                createPortingRequest(
                    mockDb as unknown as FirebaseFirestore.Firestore,
                    'tenant-1',
                    {
                        phoneNumber: '+905321234567',
                        currentCarrier: 'Turkcell',
                        targetCarrier: 'netgsm',
                    },
                ),
            ).rejects.toThrow('zaten sistemde kayıtlı');
        });

        it('should normalize phone number', async () => {
            mockGet.mockResolvedValueOnce({ empty: true });
            mockGet.mockResolvedValueOnce({ exists: false });
            mockAdd.mockResolvedValue({ id: 'porting-2' });

            const result = await createPortingRequest(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                {
                    phoneNumber: '+90 (532) 123-4567',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'netgsm',
                },
            );

            expect(result.phoneNumber).toBe('+905321234567');
        });

        it('should set default values for optional fields', async () => {
            mockGet.mockResolvedValueOnce({ empty: true });
            mockGet.mockResolvedValueOnce({ exists: false });
            mockAdd.mockResolvedValue({ id: 'porting-3' });

            const result = await createPortingRequest(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                {
                    phoneNumber: '+905321234567',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'netgsm',
                    // no notes, no documents
                },
            );

            expect(result.notes).toBe('');
            expect(result.documents).toEqual([]);
        });
    });

    // ─── updatePortingStatus ───

    describe('updatePortingStatus', () => {
        it('should update status of existing request', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'pending' }) });

            await updatePortingStatus(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'porting-1',
                'submitted',
            );

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'submitted' }),
            );
        });

        it('should include adminNotes when provided', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'submitted' }) });

            await updatePortingStatus(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'porting-1',
                'in_progress',
                'Operatöre iletildi',
            );

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'in_progress',
                    adminNotes: 'Operatöre iletildi',
                }),
            );
        });

        it('should include estimatedCompletionDate when provided', async () => {
            mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ status: 'in_progress' }) });

            await updatePortingStatus(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'porting-1',
                'in_progress',
                undefined,
                '2026-04-01',
            );

            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    estimatedCompletionDate: '2026-04-01',
                }),
            );
        });

        it('should throw when request not found', async () => {
            mockGet.mockResolvedValueOnce({ exists: false });

            await expect(
                updatePortingStatus(
                    mockDb as unknown as FirebaseFirestore.Firestore,
                    'nonexistent',
                    'submitted',
                ),
            ).rejects.toThrow('bulunamadı');
        });
    });

    // ─── completePorting ───

    describe('completePorting', () => {
        it('should complete porting and register number to tenant', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    tenantId: 'tenant-1',
                    phoneNumber: '+905321234567',
                    targetCarrier: 'netgsm',
                    status: 'in_progress',
                }),
            });

            mockRunTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
                const transaction = {
                    update: vi.fn(),
                    set: vi.fn(),
                };
                return fn(transaction);
            });

            const result = await completePorting(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'porting-1',
            );

            expect(result.phoneNumber).toBe('+905321234567');
            expect(result.tenantId).toBe('tenant-1');
            expect(result.providerType).toBe('SIP_TRUNK');
            expect(result.sipCarrier).toBe('netgsm');
            expect(result.country).toBe('TR');
            expect(result.isActive).toBe(true);
            expect(result.monthlyRate).toBe(0);
        });

        it('should throw when request already completed', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    status: 'completed',
                    tenantId: 'tenant-1',
                    phoneNumber: '+905321234567',
                }),
            });

            await expect(
                completePorting(mockDb as unknown as FirebaseFirestore.Firestore, 'porting-1'),
            ).rejects.toThrow('zaten tamamlanmış');
        });

        it('should throw when request was rejected', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({
                    status: 'rejected',
                    tenantId: 'tenant-1',
                    phoneNumber: '+905321234567',
                }),
            });

            await expect(
                completePorting(mockDb as unknown as FirebaseFirestore.Firestore, 'porting-1'),
            ).rejects.toThrow('Reddedilmiş');
        });

        it('should throw when request not found', async () => {
            mockGet.mockResolvedValue({ exists: false });

            await expect(
                completePorting(mockDb as unknown as FirebaseFirestore.Firestore, 'nonexistent'),
            ).rejects.toThrow('bulunamadı');
        });
    });

    // ─── listPortingRequests ───

    describe('listPortingRequests', () => {
        it('should list all requests when no filters', async () => {
            const docs = [
                { id: 'pr1', data: () => ({ tenantId: 'tenant-1', status: 'pending', phoneNumber: '+905321111111' }) },
                { id: 'pr2', data: () => ({ tenantId: 'tenant-2', status: 'in_progress', phoneNumber: '+905322222222' }) },
            ];
            mockGet.mockResolvedValue({ docs });

            const result = await listPortingRequests(
                mockDb as unknown as FirebaseFirestore.Firestore,
            );

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('pr1');
            expect(result[1].id).toBe('pr2');
        });

        it('should filter by tenantId', async () => {
            const docs = [
                { id: 'pr1', data: () => ({ tenantId: 'tenant-1', status: 'pending', phoneNumber: '+905321111111' }) },
            ];
            mockGet.mockResolvedValue({ docs });

            await listPortingRequests(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
            );

            // Should have called where with tenantId
            const collFn = mockDb.collection;
            expect(collFn).toHaveBeenCalledWith('porting_requests');
        });

        it('should filter by status', async () => {
            const docs = [
                { id: 'pr1', data: () => ({ tenantId: 'tenant-1', status: 'pending', phoneNumber: '+905321111111' }) },
            ];
            mockGet.mockResolvedValue({ docs });

            await listPortingRequests(
                mockDb as unknown as FirebaseFirestore.Firestore,
                undefined,
                'pending',
            );

            expect(mockGet).toHaveBeenCalled();
        });

        it('should return empty array when no requests', async () => {
            mockGet.mockResolvedValue({ docs: [] });

            const result = await listPortingRequests(
                mockDb as unknown as FirebaseFirestore.Firestore,
            );

            expect(result).toHaveLength(0);
        });
    });

    // ─── getPortingRequest ───

    describe('getPortingRequest', () => {
        it('should return request when found', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                id: 'porting-1',
                data: () => ({
                    tenantId: 'tenant-1',
                    phoneNumber: '+905321234567',
                    status: 'pending',
                    currentCarrier: 'Turkcell',
                    targetCarrier: 'netgsm',
                }),
            });

            const result = await getPortingRequest(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'porting-1',
            );

            expect(result).not.toBeNull();
            expect(result!.id).toBe('porting-1');
            expect(result!.tenantId).toBe('tenant-1');
        });

        it('should return null when not found', async () => {
            mockGet.mockResolvedValue({ exists: false });

            const result = await getPortingRequest(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'nonexistent',
            );

            expect(result).toBeNull();
        });
    });
});
