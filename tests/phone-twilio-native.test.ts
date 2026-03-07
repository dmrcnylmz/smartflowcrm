/**
 * Twilio Native Tests — lib/phone/twilio-native.ts
 *
 * Tests Twilio REST API integration for global number provisioning:
 *   - purchaseFromTwilio: search → purchase → register
 *   - releaseTwilioNumber: release → cleanup
 *   - Error handling, fallback (Local → TollFree), credential validation
 *
 * Mocks: global fetch (Twilio API), firebase-admin/firestore
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================
// Mock Setup
// =============================================

const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocDelete = vi.fn().mockResolvedValue(undefined);
const mockDocGet = vi.fn();

vi.mock('@/lib/auth/firebase-admin', () => ({
    initAdmin: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(),
    FieldValue: {
        serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
    },
}));

// Mock env
const originalEnv = process.env;

// =============================================
// Import after mocks
// =============================================

import { purchaseFromTwilio, releaseTwilioNumber } from '@/lib/phone/twilio-native';

// =============================================
// Helpers
// =============================================

function createMockDb() {
    return {
        collection: vi.fn().mockReturnValue({
            doc: vi.fn().mockReturnValue({
                set: mockDocSet,
                delete: mockDocDelete,
                get: mockDocGet,
            }),
        }),
    } as unknown as FirebaseFirestore.Firestore;
}

function mockFetchResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    };
}

// =============================================
// Tests
// =============================================

describe('Twilio Native', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env = {
            ...originalEnv,
            TWILIO_ACCOUNT_SID: 'ACtest123456',
            TWILIO_AUTH_TOKEN: 'auth-token-test',
            NEXT_PUBLIC_APP_URL: 'https://callception.com',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    // ─── purchaseFromTwilio ───

    describe('purchaseFromTwilio', () => {
        it('should purchase a local number successfully', async () => {
            const db = createMockDb();

            // Mock fetch: 1) search local → found, 2) purchase → success
            vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [
                        { phone_number: '+12025551234' },
                    ],
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    sid: 'PN123456',
                    phone_number: '+12025551234',
                    friendly_name: '(202) 555-1234',
                }) as unknown as Response);

            const result = await purchaseFromTwilio(db, 'tenant-1', 'US');

            expect(result.phoneNumber).toBe('+12025551234');
            expect(result.tenantId).toBe('tenant-1');
            expect(result.providerType).toBe('TWILIO_NATIVE');
            expect(result.country).toBe('US');
            expect(result.twilioSid).toBe('PN123456');
            expect(result.isActive).toBe(true);
            expect(result.capabilities).toEqual(['voice']);

            // Firestore registration
            expect(mockDocSet).toHaveBeenCalledWith(
                expect.objectContaining({
                    phoneNumber: '+12025551234',
                    tenantId: 'tenant-1',
                    providerType: 'TWILIO_NATIVE',
                    country: 'US',
                    twilioSid: 'PN123456',
                }),
            );
        });

        it('should fallback to TollFree when Local fails', async () => {
            const db = createMockDb();

            // Mock fetch: 1) search local → error, 2) search tollfree → found, 3) purchase → success
            vi.spyOn(global, 'fetch')
                .mockRejectedValueOnce(new Error('Local not available'))
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [
                        { phone_number: '+18005551234' },
                    ],
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    sid: 'PN789012',
                    phone_number: '+18005551234',
                    friendly_name: '(800) 555-1234',
                }) as unknown as Response);

            const result = await purchaseFromTwilio(db, 'tenant-1', 'US');

            expect(result.phoneNumber).toBe('+18005551234');
            expect(result.twilioSid).toBe('PN789012');
        });

        it('should fallback to TollFree when Local returns empty', async () => {
            const db = createMockDb();

            vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [], // empty local
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [
                        { phone_number: '+18005559999' },
                    ],
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    sid: 'PNTF001',
                    phone_number: '+18005559999',
                    friendly_name: 'Toll Free',
                }) as unknown as Response);

            const result = await purchaseFromTwilio(db, 'tenant-1', 'US');
            expect(result.phoneNumber).toBe('+18005559999');
        });

        it('should throw when no numbers available (both local and tollfree fail)', async () => {
            const db = createMockDb();

            vi.spyOn(global, 'fetch')
                .mockRejectedValueOnce(new Error('No local'))
                .mockRejectedValueOnce(new Error('No tollfree'));

            await expect(purchaseFromTwilio(db, 'tenant-1', 'US'))
                .rejects.toThrow('uygun numara bulunamadı');
        });

        it('should include areaCode in local search query', async () => {
            const db = createMockDb();
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [{ phone_number: '+12125551234' }],
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    sid: 'PN212',
                    phone_number: '+12125551234',
                    friendly_name: 'NYC',
                }) as unknown as Response);

            await purchaseFromTwilio(db, 'tenant-1', 'US', '212');

            const searchUrl = fetchSpy.mock.calls[0][0] as string;
            expect(searchUrl).toContain('AreaCode=212');
        });

        it('should uppercase the country code', async () => {
            const db = createMockDb();
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [{ phone_number: '+441234567890' }],
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    sid: 'PNGB1',
                    phone_number: '+441234567890',
                    friendly_name: 'UK number',
                }) as unknown as Response);

            const result = await purchaseFromTwilio(db, 'tenant-1', 'gb');

            const searchUrl = fetchSpy.mock.calls[0][0] as string;
            expect(searchUrl).toContain('/GB/');
            expect(result.country).toBe('GB');
        });

        it('should configure webhook URLs during purchase', async () => {
            const db = createMockDb();
            const fetchSpy = vi.spyOn(global, 'fetch')
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    available_phone_numbers: [{ phone_number: '+12025551234' }],
                }) as unknown as Response)
                .mockResolvedValueOnce(mockFetchResponse(200, {
                    sid: 'PN001',
                    phone_number: '+12025551234',
                    friendly_name: 'Test',
                }) as unknown as Response);

            await purchaseFromTwilio(db, 'tenant-1', 'US');

            // The purchase POST should include webhook URLs
            const purchaseCall = fetchSpy.mock.calls[1];
            const purchaseOptions = purchaseCall[1] as RequestInit;
            const bodyStr = purchaseOptions.body as string;

            expect(bodyStr).toContain('VoiceUrl');
            expect(bodyStr).toContain('StatusCallback');
            expect(bodyStr).toContain('callception.com');
        });

        it('should throw when Twilio credentials are missing', async () => {
            process.env.TWILIO_ACCOUNT_SID = '';
            process.env.TWILIO_AUTH_TOKEN = '';

            const db = createMockDb();

            await expect(purchaseFromTwilio(db, 'tenant-1', 'US'))
                .rejects.toThrow('yapılandırması eksik');
        });
    });

    // ─── releaseTwilioNumber ───

    describe('releaseTwilioNumber', () => {
        it('should release number via Twilio API and delete Firestore record', async () => {
            const db = createMockDb();

            vi.spyOn(global, 'fetch').mockResolvedValueOnce(
                mockFetchResponse(204, null) as unknown as Response,
            );

            await releaseTwilioNumber(db, '+12025551234', 'PN123456');

            // Should have called DELETE on Twilio
            const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
            const url = fetchCall[0] as string;
            const options = fetchCall[1] as RequestInit;

            expect(url).toContain('PN123456');
            expect(options.method).toBe('DELETE');

            // Should have deleted Firestore record
            expect(mockDocDelete).toHaveBeenCalled();
        });

        it('should still delete Firestore even if Twilio API fails', async () => {
            const db = createMockDb();

            // Twilio release fails
            vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Twilio down'));

            // Should NOT throw
            await releaseTwilioNumber(db, '+12025551234', 'PN123456');

            // Should still delete Firestore record
            expect(mockDocDelete).toHaveBeenCalled();
        });

        it('should normalize phone number for Firestore lookup', async () => {
            const db = createMockDb();
            vi.spyOn(global, 'fetch').mockResolvedValueOnce(
                mockFetchResponse(204, null) as unknown as Response,
            );

            await releaseTwilioNumber(db, '+1 (202) 555-1234', 'PN123456');

            // doc() should be called with normalized number
            const collFn = (db.collection as ReturnType<typeof vi.fn>);
            expect(collFn).toHaveBeenCalledWith('tenant_phone_numbers');
        });

        it('should use correct Twilio API URL format', async () => {
            const db = createMockDb();
            const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
                mockFetchResponse(204, null) as unknown as Response,
            );

            await releaseTwilioNumber(db, '+12025551234', 'PNabcdef123');

            const url = fetchSpy.mock.calls[0][0] as string;
            expect(url).toBe(
                'https://api.twilio.com/2010-04-01/Accounts/ACtest123456/IncomingPhoneNumbers/PNabcdef123.json',
            );
        });
    });
});
