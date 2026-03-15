/**
 * Do-Not-Call (DNC) Registry Clients
 *
 * Stub implementations for international DNC registries:
 * - US: FTC National Do-Not-Call Registry
 * - UK: TPS (Telephone Preference Service)
 * - FR: Bloctel
 *
 * When the corresponding API key env var is not set, each client
 * operates in mock mode and returns { isRegistered: false } with a warning log.
 *
 * Env vars:
 *   FTC_DNC_API_KEY     — US FTC DNC Registry API key
 *   TPS_API_KEY         — UK TPS API key
 *   BLOCTEL_API_KEY     — France Bloctel API key
 */

import { detectCountryFromPhone, type CallingCountry } from '@/lib/compliance/calling-hours';

// =============================================
// Types
// =============================================

export type DNCRegistry = 'FTC' | 'TPS' | 'BLOCTEL';

export interface DNCCheckResult {
    phoneNumber: string;
    registry: DNCRegistry;
    isRegistered: boolean;  // true = DO NOT CALL
    checkedAt: string;
    cached: boolean;
}

export interface DNCClient {
    check(phoneNumber: string): Promise<DNCCheckResult>;
    bulkCheck(phoneNumbers: string[]): Promise<DNCCheckResult[]>;
}

// =============================================
// In-memory cache (24h TTL)
// =============================================

interface CacheEntry {
    result: DNCCheckResult;
    expiresAt: number;
}

const DNC_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached(phoneNumber: string, registry: DNCRegistry): DNCCheckResult | null {
    const key = `${registry}:${phoneNumber}`;
    const entry = DNC_CACHE.get(key);
    if (entry && entry.expiresAt > Date.now()) {
        return { ...entry.result, cached: true };
    }
    if (entry) {
        DNC_CACHE.delete(key);
    }
    return null;
}

function setCache(result: DNCCheckResult): void {
    const key = `${result.registry}:${result.phoneNumber}`;
    DNC_CACHE.set(key, {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

// =============================================
// FTC Client (US)
// =============================================

/**
 * Create a US FTC National Do-Not-Call Registry client.
 * When FTC_DNC_API_KEY is not set, returns mock result { isRegistered: false }.
 */
export function createFTCClient(apiKey?: string): DNCClient {
    const resolvedKey = apiKey ?? process.env.FTC_DNC_API_KEY ?? '';
    const isMock = !resolvedKey;

    if (isMock) {
        console.warn('[DNC/FTC] FTC_DNC_API_KEY is not set — running in mock mode. All checks will return isRegistered: false.');
    }

    async function check(phoneNumber: string): Promise<DNCCheckResult> {
        const cached = getCached(phoneNumber, 'FTC');
        if (cached) return cached;

        if (isMock) {
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'FTC',
                isRegistered: false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            setCache(result);
            return result;
        }

        // Real API integration placeholder
        try {
            const res = await fetch(`https://api.ftc.gov/dnc/v1/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedKey}`,
                },
                body: JSON.stringify({ phoneNumber }),
            });

            if (!res.ok) {
                throw new Error(`FTC API error ${res.status}`);
            }

            const data = await res.json() as { registered?: boolean };
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'FTC',
                isRegistered: data.registered ?? false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            setCache(result);
            return result;
        } catch (err) {
            console.error('[DNC/FTC] Check failed:', err);
            // Fail-open: treat as not registered (allow call) but log the error
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'FTC',
                isRegistered: false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            return result;
        }
    }

    async function bulkCheck(phoneNumbers: string[]): Promise<DNCCheckResult[]> {
        const results: DNCCheckResult[] = [];
        for (const phone of phoneNumbers) {
            results.push(await check(phone));
        }
        return results;
    }

    return { check, bulkCheck };
}

// =============================================
// TPS Client (UK)
// =============================================

/**
 * Create a UK Telephone Preference Service (TPS) client.
 * When TPS_API_KEY is not set, returns mock result { isRegistered: false }.
 */
export function createTPSClient(apiKey?: string): DNCClient {
    const resolvedKey = apiKey ?? process.env.TPS_API_KEY ?? '';
    const isMock = !resolvedKey;

    if (isMock) {
        console.warn('[DNC/TPS] TPS_API_KEY is not set — running in mock mode. All checks will return isRegistered: false.');
    }

    async function check(phoneNumber: string): Promise<DNCCheckResult> {
        const cached = getCached(phoneNumber, 'TPS');
        if (cached) return cached;

        if (isMock) {
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'TPS',
                isRegistered: false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            setCache(result);
            return result;
        }

        // Real API integration placeholder
        try {
            const res = await fetch(`https://api.tps.org.uk/v1/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedKey}`,
                },
                body: JSON.stringify({ phoneNumber }),
            });

            if (!res.ok) {
                throw new Error(`TPS API error ${res.status}`);
            }

            const data = await res.json() as { registered?: boolean };
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'TPS',
                isRegistered: data.registered ?? false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            setCache(result);
            return result;
        } catch (err) {
            console.error('[DNC/TPS] Check failed:', err);
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'TPS',
                isRegistered: false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            return result;
        }
    }

    async function bulkCheck(phoneNumbers: string[]): Promise<DNCCheckResult[]> {
        const results: DNCCheckResult[] = [];
        for (const phone of phoneNumbers) {
            results.push(await check(phone));
        }
        return results;
    }

    return { check, bulkCheck };
}

// =============================================
// Bloctel Client (France)
// =============================================

/**
 * Create a France Bloctel client.
 * When BLOCTEL_API_KEY is not set, returns mock result { isRegistered: false }.
 */
export function createBlocktelClient(apiKey?: string): DNCClient {
    const resolvedKey = apiKey ?? process.env.BLOCTEL_API_KEY ?? '';
    const isMock = !resolvedKey;

    if (isMock) {
        console.warn('[DNC/BLOCTEL] BLOCTEL_API_KEY is not set — running in mock mode. All checks will return isRegistered: false.');
    }

    async function check(phoneNumber: string): Promise<DNCCheckResult> {
        const cached = getCached(phoneNumber, 'BLOCTEL');
        if (cached) return cached;

        if (isMock) {
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'BLOCTEL',
                isRegistered: false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            setCache(result);
            return result;
        }

        // Real API integration placeholder
        try {
            const res = await fetch(`https://api.bloctel.gouv.fr/v1/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedKey}`,
                },
                body: JSON.stringify({ phoneNumber }),
            });

            if (!res.ok) {
                throw new Error(`Bloctel API error ${res.status}`);
            }

            const data = await res.json() as { registered?: boolean };
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'BLOCTEL',
                isRegistered: data.registered ?? false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            setCache(result);
            return result;
        } catch (err) {
            console.error('[DNC/BLOCTEL] Check failed:', err);
            const result: DNCCheckResult = {
                phoneNumber,
                registry: 'BLOCTEL',
                isRegistered: false,
                checkedAt: new Date().toISOString(),
                cached: false,
            };
            return result;
        }
    }

    async function bulkCheck(phoneNumbers: string[]): Promise<DNCCheckResult[]> {
        const results: DNCCheckResult[] = [];
        for (const phone of phoneNumbers) {
            results.push(await check(phone));
        }
        return results;
    }

    return { check, bulkCheck };
}

// =============================================
// Country → DNC Client Mapping
// =============================================

let _ftcClient: DNCClient | null = null;
let _tpsClient: DNCClient | null = null;
let _bloctelClient: DNCClient | null = null;

/**
 * Get the appropriate DNC client for a given country.
 * Returns null for countries without a DNC registry integration.
 */
export function getDNCClientForCountry(country: CallingCountry): DNCClient | null {
    switch (country) {
        case 'US':
            if (!_ftcClient) _ftcClient = createFTCClient();
            return _ftcClient;
        case 'UK':
            if (!_tpsClient) _tpsClient = createTPSClient();
            return _tpsClient;
        case 'FR':
            if (!_bloctelClient) _bloctelClient = createBlocktelClient();
            return _bloctelClient;
        default:
            return null;
    }
}

// =============================================
// Auto-detect & Check
// =============================================

/**
 * Auto-detect country from phone number and check against the appropriate DNC registry.
 * Returns null for countries without DNC registry integration (e.g. TR, DE).
 * Results are cached in memory for 24 hours.
 */
export async function checkDNC(phoneNumber: string): Promise<DNCCheckResult | null> {
    const country = detectCountryFromPhone(phoneNumber);
    const client = getDNCClientForCountry(country);

    if (!client) {
        return null;
    }

    return client.check(phoneNumber);
}

// =============================================
// Cache management (for testing)
// =============================================

/** Clear the DNC cache. Exported for testing purposes. */
export function clearDNCCache(): void {
    DNC_CACHE.clear();
}

/** Reset singleton clients. Exported for testing purposes. */
export function resetDNCClients(): void {
    _ftcClient = null;
    _tpsClient = null;
    _bloctelClient = null;
}
