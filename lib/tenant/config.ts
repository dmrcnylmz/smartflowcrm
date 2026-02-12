/**
 * Tenant Config Manager
 *
 * Loads and caches tenant configurations.
 * Firestore-backed with 5-minute in-memory TTL.
 */

import type { TenantConfig } from './types';
import { DEFAULT_TENANT } from './types';

// --- Cache ---

interface CacheEntry {
    config: TenantConfig;
    loadedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const tenantCache = new Map<string, CacheEntry>();

// --- Public API ---

/**
 * Get tenant configuration by ID.
 * Returns cached version if fresh, otherwise loads from Firestore.
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
    // Check cache
    const cached = tenantCache.get(tenantId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
        return cached.config;
    }

    // Try to load from Firestore
    try {
        const config = await loadFromFirestore(tenantId);
        if (config) {
            tenantCache.set(tenantId, { config, loadedAt: Date.now() });
            return config;
        }
    } catch (err) {
        console.error(`[TenantConfig] Failed to load tenant ${tenantId}:`, err);
    }

    // Fallback to default for development
    if (tenantId === 'default') {
        tenantCache.set('default', { config: DEFAULT_TENANT, loadedAt: Date.now() });
        return DEFAULT_TENANT;
    }

    throw new Error(`Tenant ${tenantId} not found`);
}

/**
 * Invalidate cached tenant configuration.
 */
export function invalidateTenantCache(tenantId?: string): void {
    if (tenantId) {
        tenantCache.delete(tenantId);
    } else {
        tenantCache.clear();
    }
}

/**
 * List all cached tenants (for monitoring).
 */
export function getCachedTenants(): string[] {
    return Array.from(tenantCache.keys());
}

// --- Firestore Loader ---

async function loadFromFirestore(tenantId: string): Promise<TenantConfig | null> {
    try {
        // Dynamic import to avoid issues with Edge runtime
        const { db } = await import('../firebase/config');
        const { doc, getDoc } = await import('firebase/firestore');

        const docRef = doc(db, 'tenants', tenantId);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) return null;

        const data = snapshot.data();
        return {
            id: tenantId,
            companyName: data.companyName || 'Unknown',
            sector: data.sector || '',
            language: data.language || 'tr',
            agent: {
                name: data.agent?.name || 'Asistan',
                role: data.agent?.role || 'Müşteri Temsilcisi',
                traits: data.agent?.traits || ['profesyonel'],
                greeting: data.agent?.greeting || 'Merhaba, size nasıl yardımcı olabilirim?',
                farewell: data.agent?.farewell || 'İyi günler.',
            },
            business: {
                workingHours: data.business?.workingHours || '09:00-18:00',
                workingDays: data.business?.workingDays || 'Pazartesi-Cuma',
                services: data.business?.services || [],
                phone: data.business?.phone,
                email: data.business?.email,
                website: data.business?.website,
                address: data.business?.address,
            },
            voice: {
                voiceId: data.voice?.voiceId || 'EXAVITQu4vr4xnSDxMaL',
                ttsModel: data.voice?.ttsModel || 'eleven_flash_v2_5',
                sttLanguage: data.voice?.sttLanguage || 'tr',
                stability: data.voice?.stability ?? 0.5,
                similarityBoost: data.voice?.similarityBoost ?? 0.75,
            },
            guardrails: {
                forbiddenTopics: data.guardrails?.forbiddenTopics || [],
                competitorNames: data.guardrails?.competitorNames || [],
                allowPriceQuotes: data.guardrails?.allowPriceQuotes ?? false,
                allowContractTerms: data.guardrails?.allowContractTerms ?? false,
                maxResponseLength: data.guardrails?.maxResponseLength || 500,
                escalationRules: data.guardrails?.escalationRules || [],
            },
            quotas: {
                dailyMinutes: data.quotas?.dailyMinutes || 60,
                monthlyCalls: data.quotas?.monthlyCalls || 500,
                maxConcurrentSessions: data.quotas?.maxConcurrentSessions || 3,
            },
            active: data.active ?? true,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
        };
    } catch {
        // Firestore might not be available in all environments
        return null;
    }
}
