/**
 * Subscription Guard — Lightweight check for active subscription.
 *
 * Used in API routes to reject requests from expired/cancelled tenants.
 * Includes a short in-memory cache (60s) to avoid hitting Firestore on every request.
 *
 * Usage:
 *   const guard = await checkSubscriptionActive(db, tenantId);
 *   if (!guard.active) return NextResponse.json({ error: guard.reason }, { status: 403 });
 */

import { getSubscription, isSubscriptionActive } from '@/lib/billing/lemonsqueezy';

// ── In-memory cache (60 seconds) ─────────────────────────────
interface CachedStatus {
    active: boolean;
    planId: string;
    status: string;
    cachedAt: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute
const subscriptionCache = new Map<string, CachedStatus>();

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of subscriptionCache.entries()) {
            if (now - entry.cachedAt > CACHE_TTL_MS * 5) {
                subscriptionCache.delete(key);
            }
        }
    }, 300_000);
}

export interface SubscriptionGuardResult {
    active: boolean;
    planId: string;
    status: string;
    reason?: string;
}

/**
 * Check if tenant has an active subscription.
 * Returns cached result within 60 seconds.
 * Fail-open: returns active=true on errors (availability first).
 */
export async function checkSubscriptionActive(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<SubscriptionGuardResult> {
    // Check cache first
    const cached = subscriptionCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return {
            active: cached.active,
            planId: cached.planId,
            status: cached.status,
            ...(!cached.active && {
                reason: 'Hesabınızın aboneliği sona ermiştir. Lütfen planınızı yenileyiniz.',
            }),
        };
    }

    try {
        const sub = await getSubscription(db, tenantId);

        // No subscription = free trial (allowed)
        if (!sub) {
            const result: CachedStatus = {
                active: true,
                planId: 'free_trial',
                status: 'active',
                cachedAt: Date.now(),
            };
            subscriptionCache.set(tenantId, result);
            return { active: true, planId: 'free_trial', status: 'active' };
        }

        const active = isSubscriptionActive(sub);
        const result: CachedStatus = {
            active,
            planId: sub.planId,
            status: sub.status,
            cachedAt: Date.now(),
        };
        subscriptionCache.set(tenantId, result);

        return {
            active,
            planId: sub.planId,
            status: sub.status,
            ...(!active && {
                reason: sub.status === 'cancelled'
                    ? 'Aboneliğiniz iptal edilmiştir. Yeniden abone olmak için faturalandırma sayfasını ziyaret edin.'
                    : sub.status === 'expired'
                        ? 'Abonelik süreniz dolmuştur. Lütfen planınızı yenileyiniz.'
                        : 'Hesabınız askıya alınmıştır. Lütfen ödeme bilgilerinizi güncelleyiniz.',
            }),
        };
    } catch {
        // Fail-open: allow access if we can't check subscription
        return { active: true, planId: 'unknown', status: 'unknown' };
    }
}

/**
 * Invalidate cache for a tenant (call after webhook updates subscription).
 */
export function invalidateSubscriptionCache(tenantId: string): void {
    subscriptionCache.delete(tenantId);
}
