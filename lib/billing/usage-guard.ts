/**
 * Usage Guard — Enforces tenant usage limits before allowing calls.
 *
 * Check quota before processing voice requests.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */

import { getUsage, checkUsageLimits } from './metering';

export interface UsageCheckResult {
    allowed: boolean;
    reason?: string;
    usagePercent?: number;
    callPercent?: number;
}

/**
 * Check if a tenant can make a new call based on their plan limits.
 */
export async function checkCallAllowed(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    tierName: string = 'starter',
): Promise<UsageCheckResult> {
    try {
        const usage = await getUsage(db, tenantId);
        const limits = checkUsageLimits(usage, tierName);

        // Hard limit: 120% of included minutes
        if (limits.usagePercent >= 120) {
            return {
                allowed: false,
                reason: 'Aylık konuşma dakika limitiniz aşıldı. Lütfen planınızı yükseltin.',
                usagePercent: limits.usagePercent,
                callPercent: limits.callPercent,
            };
        }

        // Hard limit: 120% of included calls
        if (limits.callPercent >= 120) {
            return {
                allowed: false,
                reason: 'Aylık çağrı limitiniz aşıldı. Lütfen planınızı yükseltin.',
                usagePercent: limits.usagePercent,
                callPercent: limits.callPercent,
            };
        }

        return {
            allowed: true,
            usagePercent: limits.usagePercent,
            callPercent: limits.callPercent,
        };
    } catch {
        // If we can't check usage, allow the call (fail-open for availability)
        return { allowed: true };
    }
}
