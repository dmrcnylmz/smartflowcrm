/**
 * Number Pool Manager Tests — lib/phone/number-pool.ts
 *
 * Tests pool lifecycle: add → assign → return → remove
 * Plus stats aggregation, filtering, and edge cases.
 *
 * Mocks: firebase-admin/firestore (Firestore transactions, queries, batch)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Mock Setup — firebase-admin/firestore
// =============================================

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockAdd = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockRunTransaction = vi.fn();

// Chainable Firestore mock
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();

function createDocRef(id: string, data: Record<string, unknown> | null = null) {
    return {
        id,
        ref: { id },
        exists: data !== null,
        data: () => data,
        get: mockGet,
        set: mockSet,
        update: mockUpdate,
        delete: mockDelete,
    };
}

function createQuerySnap(docs: ReturnType<typeof createDocRef>[]) {
    return {
        empty: docs.length === 0,
        docs,
        size: docs.length,
    };
}

// Build the chainable mock
function buildMockDb() {
    const collRef = {
        doc: vi.fn().mockImplementation((id?: string) => {
            const docId = id || 'auto-id-' + Math.random().toString(36).slice(2, 8);
            return createDocRef(docId);
        }),
        where: mockWhere,
        get: mockGet,
        add: mockAdd,
        orderBy: mockOrderBy,
    };

    mockWhere.mockReturnValue({
        where: mockWhere,
        limit: mockLimit,
        get: mockGet,
        orderBy: mockOrderBy,
    });

    mockLimit.mockReturnValue({ get: mockGet });
    mockOrderBy.mockReturnValue({ get: mockGet });

    const db = {
        collection: vi.fn().mockReturnValue(collRef),
        batch: vi.fn().mockReturnValue({
            set: mockBatchSet,
            commit: mockBatchCommit.mockResolvedValue(undefined),
        }),
        runTransaction: mockRunTransaction,
    };

    return db;
}

let mockDb: ReturnType<typeof buildMockDb>;

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => mockDb),
    FieldValue: {
        serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
        delete: vi.fn(() => ({ _type: 'deleteField' })),
    },
}));

// =============================================
// Import after mocks
// =============================================

import {
    assignFromPool,
    returnToPool,
    addToPool,
    removeFromPool,
    getPoolStats,
    listPoolNumbers,
} from '@/lib/phone/number-pool';

// =============================================
// Tests
// =============================================

describe('Number Pool Manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = buildMockDb();
    });

    // ─── assignFromPool ───

    describe('assignFromPool', () => {
        it('should assign an available number to a tenant', async () => {
            const poolDoc = createDocRef('pool-1', {
                phoneNumber: '+905321234567',
                sipCarrier: 'netgsm',
                country: 'TR',
                status: 'available',
                monthlyRate: 1.00,
            });

            // Mock transaction
            mockRunTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
                const transaction = {
                    get: vi.fn().mockResolvedValue(createQuerySnap([poolDoc])),
                    update: vi.fn(),
                    set: vi.fn(),
                };
                return fn(transaction);
            });

            const result = await assignFromPool(mockDb as unknown as FirebaseFirestore.Firestore, 'tenant-1');

            expect(result.phoneNumber).toBe('+905321234567');
            expect(result.tenantId).toBe('tenant-1');
            expect(result.providerType).toBe('SIP_TRUNK');
            expect(result.sipCarrier).toBe('netgsm');
            expect(result.country).toBe('TR');
            expect(result.isActive).toBe(true);
            expect(result.poolEntryId).toBe('pool-1');
        });

        it('should filter by carrier when specified', async () => {
            const poolDoc = createDocRef('pool-2', {
                phoneNumber: '+905327654321',
                sipCarrier: 'bulutfon',
                country: 'TR',
                status: 'available',
                monthlyRate: 1.50,
            });

            let capturedQuery: unknown;
            mockRunTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
                const transaction = {
                    get: vi.fn().mockImplementation((q: unknown) => {
                        capturedQuery = q;
                        return createQuerySnap([poolDoc]);
                    }),
                    update: vi.fn(),
                    set: vi.fn(),
                };
                return fn(transaction);
            });

            const result = await assignFromPool(
                mockDb as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'bulutfon',
            );

            expect(result.sipCarrier).toBe('bulutfon');
            expect(result.monthlyRate).toBe(1.50);
        });

        it('should throw when pool is empty', async () => {
            mockRunTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
                const transaction = {
                    get: vi.fn().mockResolvedValue(createQuerySnap([])),
                    update: vi.fn(),
                    set: vi.fn(),
                };
                return fn(transaction);
            });

            await expect(
                assignFromPool(mockDb as unknown as FirebaseFirestore.Firestore, 'tenant-1'),
            ).rejects.toThrow('müsait numara yok');
        });

        it('should throw with carrier-specific message when filtered pool is empty', async () => {
            mockRunTransaction.mockImplementation(async (fn: (t: unknown) => unknown) => {
                const transaction = {
                    get: vi.fn().mockResolvedValue(createQuerySnap([])),
                    update: vi.fn(),
                    set: vi.fn(),
                };
                return fn(transaction);
            });

            await expect(
                assignFromPool(mockDb as unknown as FirebaseFirestore.Firestore, 'tenant-1', 'bulutfon'),
            ).rejects.toThrow('bulutfon');
        });
    });

    // ─── returnToPool ───

    describe('returnToPool', () => {
        it('should return number to pool and delete tenant record', async () => {
            const docUpdate = vi.fn().mockResolvedValue(undefined);
            const docDelete = vi.fn().mockResolvedValue(undefined);

            // tenant_phone_numbers doc
            const tenantDocRef = {
                exists: true,
                data: () => ({
                    phoneNumber: '+905321234567',
                    tenantId: 'tenant-1',
                    poolEntryId: 'pool-1',
                }),
            };

            // pool entry doc ref
            const poolDocRef = { update: docUpdate };

            const collectionFn = vi.fn().mockImplementation((name: string) => ({
                doc: vi.fn().mockImplementation((id: string) => {
                    if (name === 'tenant_phone_numbers') {
                        return { get: vi.fn().mockResolvedValue(tenantDocRef), delete: docDelete };
                    }
                    if (name === 'phone_number_pool') {
                        return poolDocRef;
                    }
                    return createDocRef(id);
                }),
            }));

            const db = { collection: collectionFn } as unknown as FirebaseFirestore.Firestore;

            await returnToPool(db, '+905321234567');

            // Pool entry should be updated to available
            expect(docUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'available' }),
            );
            // Tenant record should be deleted
            expect(docDelete).toHaveBeenCalled();
        });

        it('should throw when phone number not found', async () => {
            const db = {
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ exists: false }),
                    }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            await expect(returnToPool(db, '+905001111111')).rejects.toThrow('bulunamadı');
        });

        it('should handle numbers without poolEntryId (just delete tenant record)', async () => {
            const docDelete = vi.fn().mockResolvedValue(undefined);

            const db = {
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({ phoneNumber: '+905321234567', tenantId: 'tenant-1' }),
                        }),
                        delete: docDelete,
                    }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            await returnToPool(db, '+905321234567');
            expect(docDelete).toHaveBeenCalled();
        });
    });

    // ─── addToPool ───

    describe('addToPool', () => {
        it('should add new numbers to the pool', async () => {
            // No existing numbers
            mockGet.mockResolvedValue(createQuerySnap([]));

            const result = await addToPool(
                mockDb as unknown as FirebaseFirestore.Firestore,
                [
                    { phone: '+905321111111', carrier: 'netgsm', rate: 1.00 },
                    { phone: '+905322222222', carrier: 'bulutfon', rate: 1.50 },
                ],
            );

            expect(result.added).toBe(2);
            expect(result.skipped).toBe(0);
            expect(mockBatchSet).toHaveBeenCalledTimes(2);
            expect(mockBatchCommit).toHaveBeenCalledTimes(1);
        });

        it('should skip duplicate numbers', async () => {
            // First number exists, second doesn't
            mockGet
                .mockResolvedValueOnce(createQuerySnap([createDocRef('existing', { phoneNumber: '+905321111111' })]))
                .mockResolvedValueOnce(createQuerySnap([]));

            const result = await addToPool(
                mockDb as unknown as FirebaseFirestore.Firestore,
                [
                    { phone: '+905321111111', carrier: 'netgsm', rate: 1.00 },
                    { phone: '+905322222222', carrier: 'netgsm', rate: 1.00 },
                ],
            );

            expect(result.added).toBe(1);
            expect(result.skipped).toBe(1);
        });

        it('should not commit batch when all numbers are skipped', async () => {
            mockGet.mockResolvedValue(createQuerySnap([createDocRef('existing', { phoneNumber: '+905321111111' })]));

            const result = await addToPool(
                mockDb as unknown as FirebaseFirestore.Firestore,
                [{ phone: '+905321111111', carrier: 'netgsm', rate: 1.00 }],
            );

            expect(result.added).toBe(0);
            expect(result.skipped).toBe(1);
            expect(mockBatchCommit).not.toHaveBeenCalled();
        });

        it('should normalize phone numbers before adding', async () => {
            mockGet.mockResolvedValue(createQuerySnap([]));

            await addToPool(
                mockDb as unknown as FirebaseFirestore.Firestore,
                [{ phone: '+90 532 111 11 11', carrier: 'netgsm', rate: 1.00 }],
            );

            expect(mockBatchSet).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    phoneNumber: '+905321111111',
                    sipCarrier: 'netgsm',
                    country: 'TR',
                    status: 'available',
                    monthlyRate: 1.00,
                }),
            );
        });
    });

    // ─── removeFromPool ───

    describe('removeFromPool', () => {
        it('should remove an available pool entry', async () => {
            const deleteDoc = vi.fn().mockResolvedValue(undefined);

            const db = {
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({ status: 'available', phoneNumber: '+905321111111' }),
                        }),
                        delete: deleteDoc,
                    }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            await removeFromPool(db, 'pool-entry-1');
            expect(deleteDoc).toHaveBeenCalled();
        });

        it('should throw when pool entry not found', async () => {
            const db = {
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({ exists: false }),
                    }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            await expect(removeFromPool(db, 'nonexistent')).rejects.toThrow('bulunamadı');
        });

        it('should throw when trying to remove assigned number', async () => {
            const db = {
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({ status: 'assigned', phoneNumber: '+905321111111' }),
                        }),
                    }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            await expect(removeFromPool(db, 'pool-1')).rejects.toThrow('Atanmış numara');
        });

        it('should allow removing reserved (not assigned) entries', async () => {
            const deleteDoc = vi.fn().mockResolvedValue(undefined);

            const db = {
                collection: vi.fn().mockReturnValue({
                    doc: vi.fn().mockReturnValue({
                        get: vi.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({ status: 'reserved', phoneNumber: '+905321111111' }),
                        }),
                        delete: deleteDoc,
                    }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            await removeFromPool(db, 'pool-2');
            expect(deleteDoc).toHaveBeenCalled();
        });
    });

    // ─── getPoolStats ───

    describe('getPoolStats', () => {
        it('should aggregate stats correctly', async () => {
            const docs = [
                createDocRef('p1', { sipCarrier: 'netgsm', status: 'available' }),
                createDocRef('p2', { sipCarrier: 'netgsm', status: 'available' }),
                createDocRef('p3', { sipCarrier: 'netgsm', status: 'assigned' }),
                createDocRef('p4', { sipCarrier: 'bulutfon', status: 'available' }),
                createDocRef('p5', { sipCarrier: 'bulutfon', status: 'assigned' }),
            ];

            const db = {
                collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ docs }),
                    doc: vi.fn().mockReturnValue({ update: vi.fn() }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            const stats = await getPoolStats(db);

            expect(stats.total).toBe(5);
            expect(stats.available).toBe(3);
            expect(stats.assigned).toBe(2);
            expect(stats.reserved).toBe(0);
            expect(stats.byCarrier.netgsm.total).toBe(3);
            expect(stats.byCarrier.netgsm.available).toBe(2);
            expect(stats.byCarrier.bulutfon.total).toBe(2);
            expect(stats.byCarrier.bulutfon.available).toBe(1);
        });

        it('should return zeroes when pool is empty', async () => {
            const db = {
                collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ docs: [] }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            const stats = await getPoolStats(db);

            expect(stats.total).toBe(0);
            expect(stats.available).toBe(0);
            expect(stats.assigned).toBe(0);
            expect(stats.reserved).toBe(0);
            expect(stats.byCarrier).toEqual({});
        });

        it('should auto-release expired reservations', async () => {
            const docUpdate = vi.fn().mockResolvedValue(undefined);
            const expiredTimestamp = {
                toMillis: () => Date.now() - 15 * 60 * 1000, // 15 min ago (> 10 min TTL)
            };

            const docs = [
                createDocRef('p1', {
                    sipCarrier: 'netgsm',
                    status: 'reserved',
                    reservedAt: expiredTimestamp,
                }),
            ];

            const db = {
                collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ docs }),
                    doc: vi.fn().mockReturnValue({ update: docUpdate }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            const stats = await getPoolStats(db);

            // Expired reservation should count as available
            expect(stats.available).toBe(1);
            expect(stats.reserved).toBe(0);
        });

        it('should keep non-expired reservations as reserved', async () => {
            const validTimestamp = {
                toMillis: () => Date.now() - 3 * 60 * 1000, // 3 min ago (< 10 min TTL)
            };

            const docs = [
                createDocRef('p1', {
                    sipCarrier: 'netgsm',
                    status: 'reserved',
                    reservedAt: validTimestamp,
                }),
            ];

            const db = {
                collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ docs }),
                    doc: vi.fn().mockReturnValue({ update: vi.fn() }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            const stats = await getPoolStats(db);

            expect(stats.reserved).toBe(1);
            expect(stats.available).toBe(0);
        });

        it('should default carrier to "other" when sipCarrier is missing', async () => {
            const docs = [
                createDocRef('p1', { status: 'available' }), // no sipCarrier
            ];

            const db = {
                collection: vi.fn().mockReturnValue({
                    get: vi.fn().mockResolvedValue({ docs }),
                }),
            } as unknown as FirebaseFirestore.Firestore;

            const stats = await getPoolStats(db);

            expect(stats.byCarrier.other).toEqual({ total: 1, available: 1 });
        });
    });

    // ─── listPoolNumbers ───

    describe('listPoolNumbers', () => {
        it('should list all pool numbers without filter', async () => {
            const docs = [
                createDocRef('p1', { phoneNumber: '+905321111111', status: 'available', sipCarrier: 'netgsm' }),
                createDocRef('p2', { phoneNumber: '+905322222222', status: 'assigned', sipCarrier: 'bulutfon' }),
            ];

            mockGet.mockResolvedValue(createQuerySnap(docs));

            const result = await listPoolNumbers(mockDb as unknown as FirebaseFirestore.Firestore);

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('p1');
            expect(result[1].id).toBe('p2');
        });

        it('should filter by status', async () => {
            const docs = [
                createDocRef('p1', { phoneNumber: '+905321111111', status: 'available', sipCarrier: 'netgsm' }),
            ];

            mockGet.mockResolvedValue(createQuerySnap(docs));

            const result = await listPoolNumbers(
                mockDb as unknown as FirebaseFirestore.Firestore,
                { status: 'available' },
            );

            expect(mockWhere).toHaveBeenCalledWith('status', '==', 'available');
            expect(result).toHaveLength(1);
        });

        it('should filter by carrier', async () => {
            const docs = [
                createDocRef('p1', { phoneNumber: '+905321111111', status: 'available', sipCarrier: 'bulutfon' }),
            ];

            mockGet.mockResolvedValue(createQuerySnap(docs));

            const result = await listPoolNumbers(
                mockDb as unknown as FirebaseFirestore.Firestore,
                { carrier: 'bulutfon' },
            );

            expect(mockWhere).toHaveBeenCalledWith('sipCarrier', '==', 'bulutfon');
            expect(result).toHaveLength(1);
        });

        it('should return empty array when no numbers match', async () => {
            mockGet.mockResolvedValue(createQuerySnap([]));

            const result = await listPoolNumbers(mockDb as unknown as FirebaseFirestore.Firestore);
            expect(result).toHaveLength(0);
        });
    });
});
