/**
 * IYS (Ileti Yonetim Sistemi) API Client
 *
 * Turkey's mandatory consent management system for commercial communications.
 * All outbound calls to Turkish numbers (+90) must be verified against IYS.
 *
 * When IYS_API_KEY is not set, the client operates in mock mode
 * and returns NOT_FOUND for all queries (safe default — blocks calls).
 *
 * Env vars:
 *   IYS_API_KEY    — API key from iys.org.tr
 *   IYS_BRAND_CODE — Brand code registered in IYS
 */

// =============================================
// Types
// =============================================

export interface IYSConfig {
    apiKey: string;        // IYS API anahtari
    brandCode: string;     // IYS marka kodu
    baseUrl?: string;      // default: https://api.iys.org.tr
}

export type IYSConsentType = 'ARAMA' | 'MESAJ' | 'EPOSTA';  // Call, SMS, Email
export type IYSStatus = 'ONAY' | 'RET';  // Approved, Rejected
export type IYSRecipientType = 'BIREYSEL' | 'TACIR';  // Individual, Merchant

export interface IYSConsentRecord {
    recipientType: IYSRecipientType;
    consentType: IYSConsentType;
    recipient: string;         // phone number
    status: IYSStatus;
    consentDate: string;       // ISO date
    source: string;            // consent collection method
    retailerCode?: string;     // bayi kodu
}

export interface IYSCheckResult {
    phoneNumber: string;
    status: IYSStatus | 'NOT_FOUND' | 'ERROR';
    consentDate?: string;
    recipientType?: IYSRecipientType;
    checkedAt: string;
}

export interface IYSAddResult {
    success: boolean;
    referenceId?: string;
    error?: string;
}

export interface IYSRevokeResult {
    success: boolean;
    error?: string;
}

// =============================================
// Client Factory
// =============================================

export interface IYSClient {
    checkConsent(phoneNumber: string, consentType?: IYSConsentType): Promise<IYSCheckResult>;
    addConsent(record: IYSConsentRecord): Promise<IYSAddResult>;
    revokeConsent(phoneNumber: string, consentType?: IYSConsentType): Promise<IYSRevokeResult>;
    bulkCheck(phoneNumbers: string[], consentType?: IYSConsentType): Promise<IYSCheckResult[]>;
}

/**
 * Create an IYS API client.
 *
 * If apiKey is empty/undefined, the client runs in mock mode:
 * all queries return NOT_FOUND and a warning is logged.
 */
export function createIYSClient(config: IYSConfig): IYSClient {
    const baseUrl = config.baseUrl || 'https://api.iys.org.tr';
    const isMock = !config.apiKey;

    if (isMock) {
        console.warn('[IYS] IYS_API_KEY is not set — running in mock mode. All queries will return NOT_FOUND.');
    }

    // ----- helpers -----

    async function iysRequest<T>(
        method: string,
        path: string,
        body?: Record<string, unknown>,
        queryParams?: Record<string, string>,
    ): Promise<T> {
        const url = new URL(`/sps/${config.brandCode}${path}`, baseUrl);
        if (queryParams) {
            for (const [k, v] of Object.entries(queryParams)) {
                url.searchParams.set(k, v);
            }
        }

        const res = await fetch(url.toString(), {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => 'unknown');
            throw new Error(`IYS API error ${res.status}: ${text}`);
        }

        return res.json() as Promise<T>;
    }

    function mockResult(phoneNumber: string): IYSCheckResult {
        return {
            phoneNumber,
            status: 'NOT_FOUND',
            checkedAt: new Date().toISOString(),
        };
    }

    // ----- public methods -----

    async function checkConsent(
        phoneNumber: string,
        consentType: IYSConsentType = 'ARAMA',
    ): Promise<IYSCheckResult> {
        if (isMock) return mockResult(phoneNumber);

        try {
            const data = await iysRequest<{
                status?: IYSStatus;
                consentDate?: string;
                recipientType?: IYSRecipientType;
            }>('GET', '/iys/consent/status', undefined, {
                recipient: phoneNumber,
                consentType,
            });

            return {
                phoneNumber,
                status: data.status || 'NOT_FOUND',
                consentDate: data.consentDate,
                recipientType: data.recipientType,
                checkedAt: new Date().toISOString(),
            };
        } catch (err) {
            console.error('[IYS] checkConsent error:', err);
            return {
                phoneNumber,
                status: 'ERROR',
                checkedAt: new Date().toISOString(),
            };
        }
    }

    async function addConsent(record: IYSConsentRecord): Promise<IYSAddResult> {
        if (isMock) {
            console.warn('[IYS] Mock mode — addConsent is a no-op');
            return { success: false, error: 'IYS API key not configured' };
        }

        try {
            const data = await iysRequest<{ referenceId?: string }>('POST', '/iys/consent', {
                recipientType: record.recipientType,
                consentType: record.consentType,
                recipient: record.recipient,
                status: record.status,
                consentDate: record.consentDate,
                source: record.source,
                ...(record.retailerCode ? { retailerCode: record.retailerCode } : {}),
            });

            return { success: true, referenceId: data.referenceId };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[IYS] addConsent error:', message);
            return { success: false, error: message };
        }
    }

    async function revokeConsentFn(
        phoneNumber: string,
        consentType: IYSConsentType = 'ARAMA',
    ): Promise<IYSRevokeResult> {
        if (isMock) {
            console.warn('[IYS] Mock mode — revokeConsent is a no-op');
            return { success: false, error: 'IYS API key not configured' };
        }

        try {
            await iysRequest('PUT', '/iys/consent/status', {
                recipient: phoneNumber,
                consentType,
                status: 'RET',
            });
            return { success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[IYS] revokeConsent error:', message);
            return { success: false, error: message };
        }
    }

    async function bulkCheck(
        phoneNumbers: string[],
        consentType: IYSConsentType = 'ARAMA',
    ): Promise<IYSCheckResult[]> {
        const results: IYSCheckResult[] = [];

        for (let i = 0; i < phoneNumbers.length; i++) {
            const result = await checkConsent(phoneNumbers[i], consentType);
            results.push(result);

            // Rate-limit: 100ms between requests to avoid hammering IYS API
            if (i < phoneNumbers.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return results;
    }

    return {
        checkConsent,
        addConsent,
        revokeConsent: revokeConsentFn,
        bulkCheck,
    };
}

// =============================================
// Singleton (uses env vars)
// =============================================

let _defaultClient: IYSClient | null = null;

/**
 * Get or create the default IYS client from environment variables.
 */
export function getDefaultIYSClient(): IYSClient {
    if (!_defaultClient) {
        _defaultClient = createIYSClient({
            apiKey: process.env.IYS_API_KEY || '',
            brandCode: process.env.IYS_BRAND_CODE || '',
        });
    }
    return _defaultClient;
}
