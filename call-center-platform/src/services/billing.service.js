/**
 * Billing Service — Usage Metrics & Invoice Preview (v2)
 * 
 * Tracks call minutes and AI tokens per tenant per month.
 * Computes invoice previews based on tenant pricing.
 */
const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');

class BillingService {
    /**
     * Track call minutes for the current month.
     */
    trackCallMinutes(tenantId, minutes) {
        this._upsertUsage(tenantId, { call_minutes: minutes });
    }

    /**
     * Track AI token usage for the current month.
     */
    trackAiTokens(tenantId, tokens) {
        this._upsertUsage(tenantId, { ai_tokens: tokens });
    }

    /**
     * Get current month usage for a tenant.
     */
    getCurrentUsage(tenantId) {
        const month = new Date().toISOString().slice(0, 7);
        const usage = dbPrepareGet(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            [tenantId, month]
        );
        return usage || { tenant_id: tenantId, month, call_minutes: 0, ai_tokens: 0 };
    }

    /**
     * Get all historical usage for a tenant.
     */
    getUsageHistory(tenantId) {
        return dbPrepareAll(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? ORDER BY month DESC',
            [tenantId]
        );
    }

    /**
     * Get usage summary (current month + totals).
     */
    getUsageSummary(tenantId) {
        const current = this.getCurrentUsage(tenantId);
        const history = this.getUsageHistory(tenantId);

        const totals = history.reduce((acc, m) => ({
            total_call_minutes: acc.total_call_minutes + m.call_minutes,
            total_ai_tokens: acc.total_ai_tokens + m.ai_tokens
        }), { total_call_minutes: 0, total_ai_tokens: 0 });

        return {
            current_month: current,
            totals,
            history
        };
    }

    // ─── Phase 10: Pricing & Invoice ─────────────────

    /**
     * Get tenant pricing configuration.
     */
    getTenantPricing(tenantId) {
        const pricing = dbPrepareGet(
            'SELECT * FROM tenant_pricing WHERE tenant_id = ?',
            [tenantId]
        );
        return pricing || {
            tenant_id: tenantId,
            price_per_minute: 0.02,
            price_per_ai_token: 0.00001,
            currency: 'USD'
        };
    }

    /**
     * Update tenant pricing.
     */
    updatePricing(tenantId, pricing) {
        const existing = dbPrepareGet(
            'SELECT * FROM tenant_pricing WHERE tenant_id = ?',
            [tenantId]
        );

        if (existing) {
            dbRun(
                `UPDATE tenant_pricing SET 
                    price_per_minute = ?, price_per_ai_token = ?, currency = ?,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE tenant_id = ?`,
                [
                    pricing.price_per_minute ?? existing.price_per_minute,
                    pricing.price_per_ai_token ?? existing.price_per_ai_token,
                    pricing.currency ?? existing.currency,
                    tenantId
                ]
            );
        } else {
            dbRun(
                `INSERT INTO tenant_pricing (tenant_id, price_per_minute, price_per_ai_token, currency) VALUES (?, ?, ?, ?)`,
                [
                    tenantId,
                    pricing.price_per_minute || 0.02,
                    pricing.price_per_ai_token || 0.00001,
                    pricing.currency || 'USD'
                ]
            );
        }

        return this.getTenantPricing(tenantId);
    }

    /**
     * Compute invoice preview for a tenant.
     * Returns itemized breakdown + total for current month.
     */
    getInvoicePreview(tenantId) {
        const usage = this.getCurrentUsage(tenantId);
        const pricing = this.getTenantPricing(tenantId);
        const month = new Date().toISOString().slice(0, 7);

        const minutesCost = usage.call_minutes * pricing.price_per_minute;
        const tokensCost = usage.ai_tokens * pricing.price_per_ai_token;
        const total = minutesCost + tokensCost;

        return {
            month,
            tenant_id: tenantId,
            currency: pricing.currency,
            line_items: [
                {
                    description: 'Voice Call Minutes',
                    quantity: usage.call_minutes,
                    unit_price: pricing.price_per_minute,
                    amount: Math.round(minutesCost * 100) / 100
                },
                {
                    description: 'AI Processing Tokens',
                    quantity: usage.ai_tokens,
                    unit_price: pricing.price_per_ai_token,
                    amount: Math.round(tokensCost * 100) / 100
                }
            ],
            subtotal: Math.round(total * 100) / 100,
            total: Math.round(total * 100) / 100,
            pricing
        };
    }

    _upsertUsage(tenantId, increments) {
        const month = new Date().toISOString().slice(0, 7);
        const existing = dbPrepareGet(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            [tenantId, month]
        );

        if (existing) {
            const updates = [];
            const params = [];

            if (increments.call_minutes) {
                updates.push('call_minutes = call_minutes + ?');
                params.push(increments.call_minutes);
            }
            if (increments.ai_tokens) {
                updates.push('ai_tokens = ai_tokens + ?');
                params.push(increments.ai_tokens);
            }
            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(tenantId, month);

            dbRun(`UPDATE usage_metrics SET ${updates.join(', ')} WHERE tenant_id = ? AND month = ?`, params);
        } else {
            dbRun(
                'INSERT INTO usage_metrics (id, tenant_id, month, call_minutes, ai_tokens) VALUES (?, ?, ?, ?, ?)',
                [uuid(), tenantId, month, increments.call_minutes || 0, increments.ai_tokens || 0]
            );
        }
    }
}

module.exports = new BillingService();
