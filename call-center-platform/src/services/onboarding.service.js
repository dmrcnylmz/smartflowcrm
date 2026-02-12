/**
 * Onboarding Service — Checklist & Customer Success Metrics
 * 
 * Computes onboarding progress from existing data (no extra table).
 * Exposes customer success KPIs.
 */
const { dbPrepareGet, dbPrepareAll } = require('../config/database');
const { logger: rootLogger } = require('../utils/logger');
const logger = rootLogger.child({ component: 'onboarding' });

class OnboardingService {
    /**
     * Get onboarding checklist for a tenant.
     * Each step is computed from existing data.
     * @param {string} tenantId
     * @returns {{ steps: Array, completedCount: number, totalCount: number, percentComplete: number }}
     */
    getChecklist(tenantId) {
        const steps = [
            this._checkEmailVerified(tenantId),
            this._checkPhoneNumber(tenantId),
            this._checkAiPersona(tenantId),
            this._checkAgentAdded(tenantId),
            this._checkTestCall(tenantId),
            this._checkSubscription(tenantId)
        ];

        const completedCount = steps.filter(s => s.completed).length;

        return {
            steps,
            completedCount,
            totalCount: steps.length,
            percentComplete: Math.round((completedCount / steps.length) * 100)
        };
    }

    /**
     * Customer success metrics for a tenant.
     */
    getSuccessMetrics(tenantId) {
        const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        if (!tenant) return null;

        // Time to first call
        const firstCall = dbPrepareGet(
            'SELECT MIN(started_at) as first_call_at FROM calls WHERE tenant_id = ?',
            [tenantId]
        );
        const tenantCreatedAt = new Date(tenant.created_at).getTime();
        const firstCallAt = firstCall?.first_call_at ? new Date(firstCall.first_call_at).getTime() : null;
        const timeToFirstCall = firstCallAt ? Math.round((firstCallAt - tenantCreatedAt) / 1000 / 60) : null; // minutes

        // Call stats
        const totalCalls = dbPrepareGet(
            'SELECT COUNT(*) as count FROM calls WHERE tenant_id = ?', [tenantId]
        )?.count || 0;

        const aiResolvedCalls = dbPrepareGet(
            "SELECT COUNT(*) as count FROM calls WHERE tenant_id = ? AND resolution_status = 'resolved' AND agent_id IS NULL",
            [tenantId]
        )?.count || 0;

        const handoffCalls = dbPrepareGet(
            'SELECT COUNT(*) as count FROM handoff_queue WHERE tenant_id = ?',
            [tenantId]
        )?.count || 0;

        // Containment = AI resolved / total
        const containmentRate = totalCalls > 0 ? Math.round((aiResolvedCalls / totalCalls) * 100) : 0;
        // Handoff rate = handoffs / total
        const handoffRate = totalCalls > 0 ? Math.round((handoffCalls / totalCalls) * 100) : 0;

        // Cost per call
        const month = new Date().toISOString().slice(0, 7);
        const usage = dbPrepareGet(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            [tenantId, month]
        );
        const pricing = dbPrepareGet(
            'SELECT * FROM tenant_pricing WHERE tenant_id = ?', [tenantId]
        );

        let costPerCall = 0;
        if (totalCalls > 0 && usage && pricing) {
            const totalCost = (usage.call_minutes || 0) * (pricing.price_per_minute || 0.02) +
                (usage.ai_tokens || 0) * (pricing.price_per_ai_token || 0.00001);
            costPerCall = Math.round((totalCost / totalCalls) * 100) / 100;
        }

        // Avg call duration
        const avgDuration = dbPrepareGet(
            'SELECT AVG(duration) as avg_duration FROM calls WHERE tenant_id = ? AND duration > 0',
            [tenantId]
        )?.avg_duration || 0;

        // Satisfaction trend (sentiment)
        const avgSentiment = dbPrepareGet(
            'SELECT AVG(sentiment_score) as avg_sentiment FROM calls WHERE tenant_id = ? AND sentiment_score IS NOT NULL',
            [tenantId]
        )?.avg_sentiment || null;

        return {
            tenant_id: tenantId,
            created_at: tenant.created_at,
            time_to_first_call_minutes: timeToFirstCall,
            total_calls: totalCalls,
            ai_containment_rate: containmentRate,
            handoff_rate: handoffRate,
            cost_per_call: costPerCall,
            avg_call_duration_seconds: Math.round(avgDuration),
            avg_sentiment_score: avgSentiment ? Math.round(avgSentiment * 100) / 100 : null,
            month_usage: usage || { call_minutes: 0, ai_tokens: 0 }
        };
    }

    // ─── Checklist Step Evaluators ────────────────

    _checkEmailVerified(tenantId) {
        const admin = dbPrepareGet(
            "SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1",
            [tenantId]
        );
        // Check if verification token was used
        const verified = admin ? dbPrepareGet(
            "SELECT id FROM verification_tokens WHERE user_id = ? AND type = 'email_verify' AND used_at IS NOT NULL",
            [admin.id]
        ) : null;

        return {
            id: 'email_verified',
            title: 'Verify your email',
            description: 'Confirm your email address to secure your account',
            completed: !!verified,
            order: 1
        };
    }

    _checkPhoneNumber(tenantId) {
        const telephony = dbPrepareGet(
            "SELECT id FROM tenant_telephony WHERE tenant_id = ? AND phone_number != '' AND enabled = 1",
            [tenantId]
        );
        return {
            id: 'phone_number',
            title: 'Add a phone number',
            description: 'Connect your Twilio account and add a phone number',
            completed: !!telephony,
            order: 2
        };
    }

    _checkAiPersona(tenantId) {
        const settings = dbPrepareGet(
            'SELECT company_name FROM tenant_settings WHERE tenant_id = ?',
            [tenantId]
        );
        return {
            id: 'ai_persona',
            title: 'Configure AI persona',
            description: 'Set your company name, tone, and escalation rules',
            completed: !!settings,
            order: 3
        };
    }

    _checkAgentAdded(tenantId) {
        const agentCount = dbPrepareGet(
            "SELECT COUNT(*) as c FROM users WHERE tenant_id = ? AND role != 'admin'",
            [tenantId]
        );
        return {
            id: 'agent_added',
            title: 'Add an agent',
            description: 'Add at least one agent who can handle escalated calls',
            completed: (agentCount?.c || 0) > 0,
            order: 4
        };
    }

    _checkTestCall(tenantId) {
        const calls = dbPrepareGet(
            'SELECT COUNT(*) as c FROM calls WHERE tenant_id = ?',
            [tenantId]
        );
        return {
            id: 'test_call',
            title: 'Make a test call',
            description: 'Make your first call to verify everything works',
            completed: (calls?.c || 0) > 0,
            order: 5
        };
    }

    _checkSubscription(tenantId) {
        const sub = dbPrepareGet(
            "SELECT status FROM tenant_subscriptions WHERE tenant_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
            [tenantId]
        );
        return {
            id: 'subscription_active',
            title: 'Activate subscription',
            description: 'Choose a plan or continue your free trial',
            completed: !!sub,
            order: 6
        };
    }
}

module.exports = new OnboardingService();
