/**
 * Cost Control Engine — Phase 16
 * 
 * Enforces per-tenant budget limits:
 *   - monthly_max_tokens — hard cap on AI token usage
 *   - monthly_max_minutes — hard cap on call minutes
 * 
 * Returns budget status for each request:
 *   { allowed: true, degraded: false, usage, limits, percentUsed }
 * 
 * When usage exceeds 80% → degrade to local model
 * When usage exceeds 100% → hard stop with friendly message
 */
const { dbPrepareGet } = require('../config/database');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'cost-control' });

const DEGRADE_THRESHOLD = 0.8;  // 80%
const HARD_STOP_THRESHOLD = 1.0; // 100%

class CostControlEngine {
    /**
     * Check if a tenant has budget remaining.
     * @param {string} tenantId
     * @param {'tokens'|'minutes'} resourceType
     * @returns {{ allowed: boolean, degraded: boolean, exceeded: boolean, reason: string, usage: object }}
     */
    checkBudget(tenantId, resourceType = 'tokens') {
        const limits = this._getLimits(tenantId);
        const usage = this._getCurrentUsage(tenantId);

        if (!limits) {
            return { allowed: true, degraded: false, exceeded: false, reason: 'no_limits', usage };
        }

        const month = new Date().toISOString().slice(0, 7);

        if (resourceType === 'tokens') {
            const max = limits.monthly_max_tokens;
            if (!max || max <= 0) {
                return { allowed: true, degraded: false, exceeded: false, reason: 'unlimited_tokens', usage };
            }

            const used = usage.ai_tokens || 0;
            const percentUsed = used / max;

            metrics.setGauge('budget_usage_percent', Math.round(percentUsed * 100), {
                tenant: tenantId, resource: 'tokens'
            });

            if (percentUsed >= HARD_STOP_THRESHOLD) {
                logger.warn('Token budget exceeded', { tenantId, used, max, month });
                metrics.inc('budget_exceeded', { tenant: tenantId, resource: 'tokens' });
                return {
                    allowed: false, degraded: true, exceeded: true,
                    reason: `Token budget exceeded: ${used}/${max}`,
                    usage: { used, max, percentUsed: Math.round(percentUsed * 100) }
                };
            }

            if (percentUsed >= DEGRADE_THRESHOLD) {
                logger.info('Token budget nearing limit, degrading', { tenantId, used, max });
                metrics.inc('budget_degraded', { tenant: tenantId, resource: 'tokens' });
                return {
                    allowed: true, degraded: true, exceeded: false,
                    reason: `Token budget at ${Math.round(percentUsed * 100)}%: ${used}/${max}`,
                    usage: { used, max, percentUsed: Math.round(percentUsed * 100) }
                };
            }

            return {
                allowed: true, degraded: false, exceeded: false,
                reason: 'within_budget',
                usage: { used, max, percentUsed: Math.round(percentUsed * 100) }
            };
        }

        if (resourceType === 'minutes') {
            const max = limits.monthly_max_minutes;
            if (!max || max <= 0) {
                return { allowed: true, degraded: false, exceeded: false, reason: 'unlimited_minutes', usage };
            }

            const used = usage.call_minutes || 0;
            const percentUsed = used / max;

            metrics.setGauge('budget_usage_percent', Math.round(percentUsed * 100), {
                tenant: tenantId, resource: 'minutes'
            });

            if (percentUsed >= HARD_STOP_THRESHOLD) {
                logger.warn('Minute budget exceeded', { tenantId, used, max, month });
                metrics.inc('budget_exceeded', { tenant: tenantId, resource: 'minutes' });
                return {
                    allowed: false, degraded: true, exceeded: true,
                    reason: `Minute budget exceeded: ${used}/${max}`,
                    usage: { used, max, percentUsed: Math.round(percentUsed * 100) }
                };
            }

            if (percentUsed >= DEGRADE_THRESHOLD) {
                return {
                    allowed: true, degraded: true, exceeded: false,
                    reason: `Minute budget at ${Math.round(percentUsed * 100)}%`,
                    usage: { used, max, percentUsed: Math.round(percentUsed * 100) }
                };
            }

            return {
                allowed: true, degraded: false, exceeded: false,
                reason: 'within_budget',
                usage: { used, max, percentUsed: Math.round(percentUsed * 100) }
            };
        }

        return { allowed: true, degraded: false, exceeded: false, reason: 'unknown_resource', usage };
    }

    /**
     * Get budget summary for a tenant.
     */
    getBudgetSummary(tenantId) {
        const limits = this._getLimits(tenantId);
        const usage = this._getCurrentUsage(tenantId);

        return {
            tenantId,
            limits: limits || { monthly_max_tokens: 0, monthly_max_minutes: 0 },
            usage,
            tokens: this.checkBudget(tenantId, 'tokens'),
            minutes: this.checkBudget(tenantId, 'minutes')
        };
    }

    /**
     * Get message for budget exceeded state.
     * @param {string} language - 'en' or 'tr'
     * @returns {string}
     */
    getBudgetExceededMessage(language = 'en') {
        if (language === 'tr') {
            return 'Aylık kullanım limitinize ulaşıldı. Lütfen yöneticinizle iletişime geçin veya planınızı yükseltin.';
        }
        return 'Your monthly usage limit has been reached. Please contact your administrator or upgrade your plan.';
    }

    // ─── Internal ────────────────────────────────────

    _getLimits(tenantId) {
        try {
            return dbPrepareGet(
                'SELECT monthly_max_tokens, monthly_max_minutes FROM tenant_settings WHERE tenant_id = ?',
                [tenantId]
            );
        } catch (e) {
            return null;
        }
    }

    _getCurrentUsage(tenantId) {
        const month = new Date().toISOString().slice(0, 7);
        try {
            const usage = dbPrepareGet(
                'SELECT call_minutes, ai_tokens FROM usage_metrics WHERE tenant_id = ? AND month = ?',
                [tenantId, month]
            );
            return usage || { call_minutes: 0, ai_tokens: 0 };
        } catch (e) {
            return { call_minutes: 0, ai_tokens: 0 };
        }
    }
}

module.exports = new CostControlEngine();
