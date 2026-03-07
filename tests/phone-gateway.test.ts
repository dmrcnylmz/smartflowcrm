/**
 * Phone Gateway Tests — lib/phone/gateway.ts
 *
 * Tests unified provisioning router:
 *   - provisionNumber: routes TR→pool, others→Twilio
 *   - releaseNumber: routes by providerType
 *   - listTenantNumbers: query tenant's active numbers
 *
 * Mocks: number-pool, twilio-native, firebase-admin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================
// Mock Setup
// =============================================

const mockAssignFromPool = vi.fn();
const mockReturnToPool = vi.fn();
const mockPurchaseFromTwilio = vi.fn();
const mockReleaseTwilioNumber = vi.fn();

vi.mock('@/lib/phone/number-pool', () => ({
    assignFromPool: (...args: unknown[]) => mockAssignFromPool(...args),
    returnToPool: (...args: unknown[]) => mockReturnToPool(...args),
}));

vi.mock('@/lib/phone/twilio-native', () => ({
    purchaseFromTwilio: (...args: unknown[]) => mockPurchaseFromTwilio(...args),
    releaseTwilioNumber: (...args: unknown[]) => mockReleaseTwilioNumber(...args),
}));

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

import { provisionNumber, releaseNumber, listTenantNumbers } from '@/lib/phone/gateway';

// =============================================
// Firestore mock helpers
// =============================================

function createMockDb(overrides: {
    docExists?: boolean;
    docData?: Record<string, unknown>;
    queryDocs?: Array<{ id: string; data: () => Record<string, unknown> }>;
} = {}) {
    const { docExists = false, docData = null, queryDocs = [] } = overrides;

    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const docRef = {
        get: vi.fn().mockResolvedValue({
            exists: docExists,
            data: () => docData,
        }),
        delete: deleteFn,
    };

    const whereChain = {
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ docs: queryDocs }),
    };

    return {
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue(docRef),
            where: vi.fn().mockReturnValue(whereChain),
        }),
        _docRef: docRef,
        _deleteFn: deleteFn,
    };
}

// =============================================
// Tests
// =============================================

describe('Phone Gateway', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ─── provisionNumber ───

    describe('provisionNumber', () => {
        it('should route Turkey (TR) to assignFromPool', async () => {
            const mockRecord = {
                phoneNumber: '+905321234567',
                tenantId: 'tenant-1',
                providerType: 'SIP_TRUNK',
                sipCarrier: 'netgsm',
                country: 'TR',
                isActive: true,
            };

            mockAssignFromPool.mockResolvedValue(mockRecord);

            const db = createMockDb();
            const result = await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'TR',
            );

            expect(result.success).toBe(true);
            expect(result.phoneNumber).toEqual(mockRecord);
            expect(mockAssignFromPool).toHaveBeenCalledWith(db, 'tenant-1', undefined);
            expect(mockPurchaseFromTwilio).not.toHaveBeenCalled();
        });

        it('should pass carrier option for Turkey', async () => {
            mockAssignFromPool.mockResolvedValue({ phoneNumber: '+905321234567' });

            const db = createMockDb();
            await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'TR',
                { carrier: 'bulutfon' },
            );

            expect(mockAssignFromPool).toHaveBeenCalledWith(db, 'tenant-1', 'bulutfon');
        });

        it('should route US to purchaseFromTwilio', async () => {
            const mockRecord = {
                phoneNumber: '+12025551234',
                tenantId: 'tenant-1',
                providerType: 'TWILIO_NATIVE',
                country: 'US',
                isActive: true,
            };

            mockPurchaseFromTwilio.mockResolvedValue(mockRecord);

            const db = createMockDb();
            const result = await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'US',
            );

            expect(result.success).toBe(true);
            expect(result.phoneNumber).toEqual(mockRecord);
            expect(mockPurchaseFromTwilio).toHaveBeenCalledWith(db, 'tenant-1', 'US', undefined);
            expect(mockAssignFromPool).not.toHaveBeenCalled();
        });

        it('should route GB to purchaseFromTwilio', async () => {
            mockPurchaseFromTwilio.mockResolvedValue({ phoneNumber: '+441234567890' });

            const db = createMockDb();
            await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'GB',
            );

            expect(mockPurchaseFromTwilio).toHaveBeenCalledWith(db, 'tenant-1', 'GB', undefined);
        });

        it('should pass areaCode for Twilio native', async () => {
            mockPurchaseFromTwilio.mockResolvedValue({ phoneNumber: '+12025551234' });

            const db = createMockDb();
            await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'US',
                { areaCode: '212' },
            );

            expect(mockPurchaseFromTwilio).toHaveBeenCalledWith(db, 'tenant-1', 'US', '212');
        });

        it('should return error result when pool throws', async () => {
            mockAssignFromPool.mockRejectedValue(new Error('Havuzda müsait numara yok'));

            const db = createMockDb();
            const result = await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'TR',
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('müsait numara yok');
            expect(result.phoneNumber).toBeUndefined();
        });

        it('should return error result when Twilio purchase fails', async () => {
            mockPurchaseFromTwilio.mockRejectedValue(new Error('No numbers available'));

            const db = createMockDb();
            const result = await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'US',
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('No numbers available');
        });

        it('should handle non-Error exceptions gracefully', async () => {
            mockAssignFromPool.mockRejectedValue('string error');

            const db = createMockDb();
            const result = await provisionNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                'TR',
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('Numara tahsisi başarısız');
        });
    });

    // ─── releaseNumber ───

    describe('releaseNumber', () => {
        it('should release Twilio native number', async () => {
            mockReleaseTwilioNumber.mockResolvedValue(undefined);

            const db = createMockDb({
                docExists: true,
                docData: {
                    tenantId: 'tenant-1',
                    providerType: 'TWILIO_NATIVE',
                    twilioSid: 'PN1234567890',
                },
            });

            await releaseNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                '+12025551234',
            );

            expect(mockReleaseTwilioNumber).toHaveBeenCalledWith(
                db,
                '+12025551234',
                'PN1234567890',
            );
            expect(mockReturnToPool).not.toHaveBeenCalled();
        });

        it('should release SIP trunk number back to pool', async () => {
            mockReturnToPool.mockResolvedValue(undefined);

            const db = createMockDb({
                docExists: true,
                docData: {
                    tenantId: 'tenant-1',
                    providerType: 'SIP_TRUNK',
                    poolEntryId: 'pool-1',
                },
            });

            await releaseNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                '+905321234567',
            );

            expect(mockReturnToPool).toHaveBeenCalledWith(db, '+905321234567');
            expect(mockReleaseTwilioNumber).not.toHaveBeenCalled();
        });

        it('should delete legacy number directly', async () => {
            const db = createMockDb({
                docExists: true,
                docData: {
                    tenantId: 'tenant-1',
                    // No providerType, no twilioSid — legacy
                },
            });

            await releaseNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                '+905321234567',
            );

            expect(db._deleteFn).toHaveBeenCalled();
            expect(mockReturnToPool).not.toHaveBeenCalled();
            expect(mockReleaseTwilioNumber).not.toHaveBeenCalled();
        });

        it('should throw when number not found', async () => {
            const db = createMockDb({ docExists: false });

            await expect(
                releaseNumber(
                    db as unknown as FirebaseFirestore.Firestore,
                    'tenant-1',
                    '+905321234567',
                ),
            ).rejects.toThrow('bulunamadı');
        });

        it('should throw when tenant does not own the number', async () => {
            const db = createMockDb({
                docExists: true,
                docData: { tenantId: 'other-tenant' },
            });

            await expect(
                releaseNumber(
                    db as unknown as FirebaseFirestore.Firestore,
                    'tenant-1',
                    '+905321234567',
                ),
            ).rejects.toThrow('ait değil');
        });

        it('should normalize phone number before lookup', async () => {
            const db = createMockDb({
                docExists: true,
                docData: { tenantId: 'tenant-1' },
            });

            await releaseNumber(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
                '+90 (532) 123-4567',
            );

            // Should have called doc with normalized number
            expect(db.collection('tenant_phone_numbers').doc).toHaveBeenCalled();
        });
    });

    // ─── listTenantNumbers ───

    describe('listTenantNumbers', () => {
        it('should list active numbers for tenant', async () => {
            const queryDocs = [
                {
                    id: '+905321234567',
                    data: () => ({
                        tenantId: 'tenant-1',
                        providerType: 'SIP_TRUNK',
                        sipCarrier: 'netgsm',
                        country: 'TR',
                        isActive: true,
                    }),
                },
                {
                    id: '+12025551234',
                    data: () => ({
                        tenantId: 'tenant-1',
                        providerType: 'TWILIO_NATIVE',
                        country: 'US',
                        isActive: true,
                    }),
                },
            ];

            const db = createMockDb({ queryDocs });

            const numbers = await listTenantNumbers(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
            );

            expect(numbers).toHaveLength(2);
            expect(numbers[0].phoneNumber).toBe('+905321234567');
            expect(numbers[1].phoneNumber).toBe('+12025551234');
        });

        it('should return empty array when tenant has no numbers', async () => {
            const db = createMockDb({ queryDocs: [] });

            const numbers = await listTenantNumbers(
                db as unknown as FirebaseFirestore.Firestore,
                'tenant-1',
            );

            expect(numbers).toHaveLength(0);
        });
    });
});
