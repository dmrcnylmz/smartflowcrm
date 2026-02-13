/**
 * Usage Enforcement Middleware — Revenue Activation Layer
 * 
 * Express middleware that enforces subscription limits on every API call.
 * Blocks requests for suspended/expired/canceled accounts.
 * Tracks overage and reports to Stripe metered billing.
 * 
 * CUSTOMER-FACING: All errors mention minutes, never tokens.
 */
const subscriptionService = require('../services/subscription.service');
const { dbPrepareGet, dbRun } = require('../config/database');
const { logger: rootLogger } = require('../utils/logger');
const logger = rootLogger.child({ component: 'usage-enforcement' });

/**
 * Core enforcement middleware — attach to all call-related routes.
 * 
 * Usage:
 *   router.post('/calls/initiate', authMiddleware, enforceUsage(), callHandler);
 *   router.post('/calls/initiate', authMiddleware, enforceUsage({ requireMinutes: 1 }), callHandler);
 */
function enforceUsage(options = {}) {
    const {
        requireMinutes = 0,      // Minimum minutes required to proceed
        allowGracePeriod = true,  // Allow 1-day grace after trial ends
        blockOnPastDue = true,    // Block on payment failure
        trackCall = true,         // Auto-track minute usage after request
    } = options;

    return (req, res, next) => {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const limits = subscriptionService.checkLimits(tenantId);

            // ─── Account Status Gates ────────────────
            if (limits.suspended) {
                logger.warn('Blocked: account suspended', { tenantId });
                return res.status(403).json({
                    error: 'Account suspended',
                    message: 'Your 3-day trial has ended. Add a payment method to continue using the platform.',
                    action: 'upgrade',
                    upgrade_url: '/admin/billing'
                });
            }

            if (limits.expired) {
                if (allowGracePeriod && _isWithinGracePeriod(tenantId)) {
                    // Allow 24h grace period — but warn
                    req.graceMode = true;
                    logger.info('Grace period active', { tenantId });
                } else {
                    return res.status(403).json({
                        error: 'Subscription expired',
                        message: 'Your subscription has expired. Please renew to continue.',
                        action: 'renew',
                        upgrade_url: '/admin/billing'
                    });
                }
            }

            if (blockOnPastDue && limits.reason === 'Payment past due — please update billing') {
                return res.status(402).json({
                    error: 'Payment required',
                    message: 'Your last payment failed. Please update your billing information.',
                    action: 'update_billing',
                    upgrade_url: '/admin/billing'
                });
            }

            // ─── Minute Limit Enforcement ────────────
            if (!limits.allowed && !limits.limits?.minutes?.in_overage) {
                // Hard limit reached (no overage on this plan, e.g., free trial)
                return res.status(429).json({
                    error: 'Minute limit reached',
                    message: `You've used all ${limits.limits?.minutes?.included || 0} included minutes this month.`,
                    used: limits.limits?.minutes?.used || 0,
                    included: limits.limits?.minutes?.included || 0,
                    action: 'upgrade',
                    upgrade_url: '/admin/billing',
                    plans_url: '/api/subscription/plans'
                });
            }

            // ─── Minimum Minute Check ────────────────
            if (requireMinutes > 0 && limits.limits?.minutes) {
                const remaining = limits.limits.minutes.remaining;
                const hasOverage = limits.limits.minutes.overage_rate > 0;

                if (remaining < requireMinutes && !hasOverage) {
                    return res.status(429).json({
                        error: 'Insufficient minutes',
                        message: `Only ${remaining} minutes remaining. This operation requires ${requireMinutes} minutes.`,
                        remaining,
                        required: requireMinutes,
                        action: 'upgrade',
                        upgrade_url: '/admin/billing'
                    });
                }
            }

            // ─── Concurrent Call Limit ───────────────
            const concurrentMax = limits.limits?.concurrent_calls?.max || 1;
            const activeCalls = _getActiveCalls(tenantId);
            if (activeCalls >= concurrentMax) {
                return res.status(429).json({
                    error: 'Concurrent call limit reached',
                    message: `Maximum ${concurrentMax} simultaneous calls allowed on your plan.`,
                    active: activeCalls,
                    max: concurrentMax,
                    action: 'upgrade'
                });
            }

            // Attach limits to request for downstream use
            req.subscriptionLimits = limits;
            req.isOverage = limits.limits?.minutes?.in_overage || false;

            // ─── Post-Call Tracking ──────────────────
            if (trackCall) {
                const originalEnd = res.end;
                const startTime = Date.now();

                res.end = function (...args) {
                    const elapsedMs = Date.now() - startTime;
                    const elapsedMin = elapsedMs / 60000;

                    // Only track if the call was successful (2xx)
                    if (res.statusCode >= 200 && res.statusCode < 300 && elapsedMin > 0.01) {
                        _trackMinuteUsage(tenantId, elapsedMin, limits);
                    }

                    return originalEnd.apply(this, args);
                };
            }

            next();
        } catch (err) {
            logger.error('Usage enforcement error', { error: err.message, tenantId: req.tenantId });
            // Fail open — don't block on internal errors
            next();
        }
    };
}

/**
 * Lightweight check middleware — for non-call routes that still need account status.
 * Only checks account status, doesn't track usage.
 */
function requireActiveAccount() {
    return (req, res, next) => {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(401).json({ error: 'Authentication required' });

            const sub = subscriptionService.getCurrentSubscription(tenantId);
            if (!sub) return res.status(403).json({ error: 'No subscription found' });

            if (sub.status === 'suspended') {
                return res.status(403).json({
                    error: 'Account suspended',
                    message: 'Add a payment method to re-activate your account.',
                    action: 'upgrade'
                });
            }

            if (sub.status === 'canceled') {
                return res.status(403).json({ error: 'Account canceled' });
            }

            req.subscriptionStatus = sub.status;
            req.planName = sub.plan_name;
            next();
        } catch (err) {
            next(); // Fail open
        }
    };
}

/**
 * Agent limit middleware — blocks new agent creation beyond plan limit.
 */
function enforceAgentLimit() {
    return (req, res, next) => {
        try {
            const limits = subscriptionService.checkLimits(req.tenantId);
            const agentLimits = limits.limits?.agents;

            if (agentLimits && agentLimits.used >= agentLimits.max) {
                return res.status(429).json({
                    error: 'Agent limit reached',
                    message: `Your plan allows ${agentLimits.max} agents. Upgrade to add more.`,
                    used: agentLimits.used,
                    max: agentLimits.max,
                    action: 'upgrade'
                });
            }

            next();
        } catch (err) {
            next();
        }
    };
}

// ─── Internal Helpers ────────────────────────────────

function _isWithinGracePeriod(tenantId) {
    const sub = dbPrepareGet(
        `SELECT trial_ends_at FROM tenant_subscriptions 
         WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`,
        [tenantId]
    );
    if (!sub?.trial_ends_at) return false;

    const trialEnd = new Date(sub.trial_ends_at);
    const graceEnd = new Date(trialEnd.getTime() + 24 * 60 * 60 * 1000); // +24h
    return new Date() < graceEnd;
}

function _getActiveCalls(tenantId) {
    const result = dbPrepareGet(
        `SELECT COUNT(*) as count FROM calls 
         WHERE tenant_id = ? AND status = 'active'`,
        [tenantId]
    );
    return result?.count || 0;
}

function _trackMinuteUsage(tenantId, minutes, limits) {
    try {
        const month = new Date().toISOString().slice(0, 7);
        const roundedMin = Math.round(minutes * 100) / 100;

        dbRun(
            `INSERT INTO usage_metrics (id, tenant_id, month, call_minutes)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(tenant_id, month) 
             DO UPDATE SET call_minutes = call_minutes + ?, updated_at = CURRENT_TIMESTAMP`,
            [require('uuid').v4(), tenantId, month, roundedMin, roundedMin]
        );

        // Report to Stripe if in overage
        if (limits.limits?.minutes?.in_overage) {
            subscriptionService.reportOverageUsage(tenantId, roundedMin).catch(e => {
                logger.debug('Overage report deferred', { error: e.message });
            });
        }
    } catch (e) {
        logger.debug('Minute tracking deferred', { error: e.message });
    }
}

module.exports = { enforceUsage, requireActiveAccount, enforceAgentLimit };
