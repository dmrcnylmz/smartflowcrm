/**
 * Subscription Service — Revenue Activation Layer
 * 
 * PRICING RULE: End customers see ONLY:
 *   - Monthly subscription fee
 *   - Included call minutes
 *   - Overage price per minute
 * 
 * Tokens are INTERNAL-ONLY for margin calculations.
 * Trial period = 3 days.
 */
const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');
const logger = rootLogger.child({ component: 'subscription' });

const TRIAL_DAYS = 3;

// ─── Plan Definitions ────────────────────────────────────
const DEFAULT_PLANS = [
    {
        id: 'plan_free_trial', name: 'free_trial', display_name: 'Free Trial',
        price_monthly: 0, price_yearly: 0,
        max_minutes: 100, overage_per_minute: 0,
        max_ai_tokens: 50000,          // INTERNAL ONLY
        max_agents: 2, max_concurrent_calls: 1, sort_order: 0,
        features: JSON.stringify({ recording: true, analytics: false, api_access: false })
    },
    {
        id: 'plan_starter', name: 'starter', display_name: 'Starter',
        price_monthly: 49, price_yearly: 470,
        max_minutes: 500, overage_per_minute: 0.12,
        max_ai_tokens: 250000,
        max_agents: 5, max_concurrent_calls: 3, sort_order: 1,
        features: JSON.stringify({ recording: true, analytics: true, api_access: false })
    },
    {
        id: 'plan_pro', name: 'pro', display_name: 'Pro',
        price_monthly: 149, price_yearly: 1430,
        max_minutes: 2000, overage_per_minute: 0.08,
        max_ai_tokens: 1000000,
        max_agents: 20, max_concurrent_calls: 10, sort_order: 2,
        features: JSON.stringify({ recording: true, analytics: true, api_access: true, priority_support: true })
    },
    {
        id: 'plan_enterprise', name: 'enterprise', display_name: 'Enterprise',
        price_monthly: 499, price_yearly: 4790,
        max_minutes: 10000, overage_per_minute: 0.05,
        max_ai_tokens: 5000000,
        max_agents: 100, max_concurrent_calls: 50, sort_order: 3,
        features: JSON.stringify({ recording: true, analytics: true, api_access: true, priority_support: true, sla: true, custom_integrations: true })
    }
];

class SubscriptionService {
    constructor() {
        this._seeded = false;
    }

    // ═══════════════════════════════════════════════════
    // PLAN MANAGEMENT
    // ═══════════════════════════════════════════════════

    seedPlans() {
        if (this._seeded) return;
        try {
            const db = require('../config/database').getDatabase();
            // Schema migrations — safe to run multiple times
            const migrations = [
                'ALTER TABLE subscription_plans ADD COLUMN overage_per_minute REAL DEFAULT 0',
                'ALTER TABLE tenant_subscriptions ADD COLUMN suspended_at DATETIME',
                'ALTER TABLE tenant_subscriptions ADD COLUMN suspension_reason TEXT',
                'ALTER TABLE tenant_subscriptions ADD COLUMN canceled_at DATETIME',
                'ALTER TABLE tenant_subscriptions ADD COLUMN current_period_start DATETIME',
                'ALTER TABLE tenant_subscriptions ADD COLUMN current_period_end DATETIME',
            ];
            for (const sql of migrations) {
                try { db.run(sql); } catch (e) { /* column already exists */ }
            }

            for (const plan of DEFAULT_PLANS) {
                const existing = dbPrepareGet('SELECT id FROM subscription_plans WHERE name = ?', [plan.name]);
                if (!existing) {
                    dbRun(
                        `INSERT INTO subscription_plans (id, name, display_name, price_monthly, price_yearly, 
                         max_minutes, max_ai_tokens, max_agents, max_concurrent_calls, features, sort_order, overage_per_minute)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [plan.id, plan.name, plan.display_name, plan.price_monthly, plan.price_yearly || 0,
                        plan.max_minutes, plan.max_ai_tokens, plan.max_agents, plan.max_concurrent_calls,
                        plan.features, plan.sort_order, plan.overage_per_minute || 0]
                    );
                } else {
                    dbRun('UPDATE subscription_plans SET overage_per_minute = ? WHERE name = ?',
                        [plan.overage_per_minute || 0, plan.name]);
                }
            }
            this._seeded = true;
        } catch (e) {
            logger.warn('Could not seed plans', { error: e.message });
        }
    }

    /** List plans — CUSTOMER-FACING (no tokens). */
    listPlans() {
        this.seedPlans();
        const plans = dbPrepareAll('SELECT * FROM subscription_plans WHERE active = 1 ORDER BY sort_order ASC');
        return plans.map(p => this._sanitizePlan(p));
    }

    /** Internal plan lookup (includes token fields). */
    getPlan(idOrName) {
        return dbPrepareGet('SELECT * FROM subscription_plans WHERE id = ? OR name = ?', [idOrName, idOrName]);
    }

    /** Customer-facing plan lookup (no tokens). */
    getPlanPublic(idOrName) {
        const plan = this.getPlan(idOrName);
        return plan ? this._sanitizePlan(plan) : null;
    }

    // ═══════════════════════════════════════════════════
    // SUBSCRIPTION LIFECYCLE
    // ═══════════════════════════════════════════════════

    /** Get current subscription — internal (includes tokens for enforcement). */
    getCurrentSubscription(tenantId) {
        const sub = dbPrepareGet(
            `SELECT ts.*, sp.name as plan_name, sp.display_name, sp.max_minutes, sp.max_ai_tokens,
                    sp.max_agents, sp.max_concurrent_calls, sp.features, sp.price_monthly,
                    sp.overage_per_minute
             FROM tenant_subscriptions ts
             JOIN subscription_plans sp ON ts.plan_id = sp.id
             WHERE ts.tenant_id = ? 
             ORDER BY ts.created_at DESC LIMIT 1`,
            [tenantId]
        );
        if (!sub) return null;

        // Auto-expire trials
        if (sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) {
            this._handleTrialExpiration(sub);
            sub.status = sub.stripe_customer_id ? 'expired' : 'suspended';
        }

        return sub;
    }

    /** Customer-facing subscription (no tokens). */
    getCurrentSubscriptionPublic(tenantId) {
        const sub = this.getCurrentSubscription(tenantId);
        if (!sub) return null;
        const { max_ai_tokens, ...publicSub } = sub;
        return publicSub;
    }

    /**
     * Handle trial expiration.
     * - If payment method on file → mark expired, allow re-activation
     * - If NO payment method → SUSPEND immediately (no calls)
     */
    _handleTrialExpiration(sub) {
        const hasPayment = !!sub.stripe_customer_id;
        const newStatus = hasPayment ? 'expired' : 'suspended';

        dbRun(
            `UPDATE tenant_subscriptions 
             SET status = ?, suspended_at = CASE WHEN ? = 'suspended' THEN CURRENT_TIMESTAMP ELSE suspended_at END,
                 suspension_reason = CASE WHEN ? = 'suspended' THEN 'trial_ended_no_payment' ELSE suspension_reason END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [newStatus, newStatus, newStatus, sub.id]
        );

        logger.info('Trial expired', {
            tenantId: sub.tenant_id,
            hadPayment: hasPayment,
            newStatus
        });

        metrics.inc('trials_expired');
        if (newStatus === 'suspended') metrics.inc('accounts_suspended');
    }

    /**
     * Check if tenant is within plan limits.
     * Returns CUSTOMER-FACING response (minutes + agents only).
     */
    checkLimits(tenantId) {
        const sub = this.getCurrentSubscription(tenantId);
        if (!sub) return { allowed: false, reason: 'No active subscription' };
        if (sub.status === 'suspended') return { allowed: false, reason: 'Account suspended — add payment method to continue', suspended: true };
        if (sub.status === 'expired') return { allowed: false, reason: 'Subscription expired — please renew', expired: true };
        if (sub.status === 'canceled') return { allowed: false, reason: 'Subscription canceled' };
        if (sub.status === 'past_due') return { allowed: false, reason: 'Payment past due — please update billing' };

        const month = new Date().toISOString().slice(0, 7);
        const usage = dbPrepareGet(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            [tenantId, month]
        ) || { call_minutes: 0, ai_tokens: 0 };

        const agents = dbPrepareGet('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?', [tenantId]);

        const violations = [];
        const minutesExceeded = usage.call_minutes >= sub.max_minutes;
        const tokensExceeded = usage.ai_tokens >= (sub.max_ai_tokens || Infinity);
        const hasOverage = (sub.overage_per_minute || 0) > 0;

        if (minutesExceeded && !hasOverage) violations.push('Monthly minute limit reached');
        if (tokensExceeded) violations.push('Monthly minute limit reached');
        if (agents.count > sub.max_agents) violations.push('Agent limit exceeded');

        const overageMin = minutesExceeded ? Math.max(0, usage.call_minutes - sub.max_minutes) : 0;
        const limits = {
            minutes: {
                used: usage.call_minutes,
                included: sub.max_minutes,
                remaining: Math.max(0, sub.max_minutes - usage.call_minutes),
                overage_rate: sub.overage_per_minute || 0,
                in_overage: minutesExceeded && hasOverage,
                overage_minutes: overageMin,
                overage_charges: minutesExceeded && hasOverage
                    ? Math.round(overageMin * sub.overage_per_minute * 100) / 100 : 0
            },
            agents: { used: agents.count, max: sub.max_agents },
            concurrent_calls: { max: sub.max_concurrent_calls }
        };

        return {
            allowed: violations.length === 0,
            reason: violations.length > 0 ? violations[0] : null,
            plan: sub.plan_name,
            display_name: sub.display_name,
            status: sub.status,
            price_monthly: sub.price_monthly,
            limits,
            trial_ends_at: sub.trial_ends_at
        };
    }

    // ═══════════════════════════════════════════════════
    // STRIPE CHECKOUT FLOW
    // ═══════════════════════════════════════════════════

    /**
     * Create Stripe Checkout session for new subscription or upgrade.
     * Includes metered overage price in the subscription.
     */
    async createCheckoutSession(tenantId, planId, billingCycle = 'monthly') {
        const stripe = this._getStripe();
        if (!stripe) throw { status: 503, message: 'Stripe not configured' };

        const plan = this.getPlan(planId);
        if (!plan) throw { status: 404, message: 'Plan not found' };
        if (plan.name === 'free_trial') throw { status: 400, message: 'Cannot purchase free trial' };

        const sub = this.getCurrentSubscription(tenantId);
        let customerId = sub?.stripe_customer_id;

        // Create Stripe customer if needed
        if (!customerId) {
            const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const admin = dbPrepareGet("SELECT * FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1", [tenantId]);
            const customer = await stripe.customers.create({
                name: tenant?.name || tenantId,
                email: admin?.email,
                metadata: { tenant_id: tenantId }
            });
            customerId = customer.id;
            if (sub) {
                dbRun('UPDATE tenant_subscriptions SET stripe_customer_id = ? WHERE id = ?', [customerId, sub.id]);
            }
        }

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
        const interval = billingCycle === 'yearly' ? 'year' : 'month';

        // Line items: subscription + metered overage
        const lineItems = [
            {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: plan.display_name,
                        description: `${plan.max_minutes} included minutes/month`
                    },
                    unit_amount: Math.round(amount * 100),
                    recurring: { interval }
                },
                quantity: 1
            }
        ];

        // Add metered overage price if plan supports it
        if (plan.overage_per_minute > 0) {
            lineItems.push({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: 'Additional Minutes (Overage)',
                        description: `$${plan.overage_per_minute}/min beyond ${plan.max_minutes} included`
                    },
                    unit_amount: Math.round(plan.overage_per_minute * 100),
                    recurring: {
                        interval: 'month',
                        usage_type: 'metered',
                        aggregate_usage: 'sum'
                    }
                }
            });
        }

        // Handle proration for existing paid subscriptions
        const sessionParams = {
            customer: customerId,
            mode: 'subscription',
            line_items: lineItems,
            success_url: `${baseUrl}/admin?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/admin?checkout=canceled`,
            metadata: {
                tenant_id: tenantId,
                plan_id: planId,
                billing_cycle: billingCycle,
                previous_plan: sub?.plan_name || 'none',
                is_upgrade: sub?.plan_name && sub.plan_name !== 'free_trial' ? 'true' : 'false'
            },
            subscription_data: {
                metadata: { tenant_id: tenantId, plan_id: planId },
                proration_behavior: 'create_prorations'
            },
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
            tax_id_collection: { enabled: true }
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        // Log checkout attempt
        this._logEvent(tenantId, 'checkout_started', {
            plan: plan.name, billingCycle, sessionId: session.id,
            previousPlan: sub?.plan_name
        });

        logger.info('Checkout session created', { tenantId, planId, sessionId: session.id });
        return { sessionId: session.id, url: session.url };
    }

    /**
     * Create a Stripe Customer Portal session for self-service management.
     */
    async createPortalSession(tenantId) {
        const stripe = this._getStripe();
        if (!stripe) throw { status: 503, message: 'Stripe not configured' };

        const sub = this.getCurrentSubscription(tenantId);
        if (!sub?.stripe_customer_id) throw { status: 400, message: 'No billing account found' };

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripe_customer_id,
            return_url: `${baseUrl}/admin/billing`
        });

        return { url: session.url };
    }

    // ═══════════════════════════════════════════════════
    // METERED OVERAGE REPORTING
    // ═══════════════════════════════════════════════════

    /**
     * Report overage minutes to Stripe metered billing.
     * Called when a call ends and tenant is in overage territory.
     */
    async reportOverageUsage(tenantId, overageMinutes) {
        const stripe = this._getStripe();
        if (!stripe || overageMinutes <= 0) return null;

        const sub = this.getCurrentSubscription(tenantId);
        if (!sub?.stripe_subscription_id) return null;

        try {
            // Get the metered subscription item
            const subscription = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
            const meteredItem = subscription.items.data.find(
                item => item.price?.recurring?.usage_type === 'metered'
            );

            if (!meteredItem) {
                logger.warn('No metered price found on subscription', { tenantId });
                return null;
            }

            // Round up to nearest minute (billing convention)
            const minutesToReport = Math.ceil(overageMinutes);

            const usageRecord = await stripe.subscriptionItems.createUsageRecord(
                meteredItem.id,
                {
                    quantity: minutesToReport,
                    timestamp: Math.floor(Date.now() / 1000),
                    action: 'increment'
                }
            );

            this._logEvent(tenantId, 'overage_reported', {
                minutes: minutesToReport,
                subscriptionItemId: meteredItem.id
            });

            logger.info('Overage usage reported', { tenantId, minutes: minutesToReport });
            return { reported: true, minutes: minutesToReport };
        } catch (e) {
            logger.error('Failed to report overage', { tenantId, error: e.message });
            return null;
        }
    }

    // ═══════════════════════════════════════════════════
    // WEBHOOK HANDLER
    // ═══════════════════════════════════════════════════

    async handleWebhook(event) {
        logger.info('Webhook received', { type: event.type });

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const tenantId = session.metadata?.tenant_id;
                const planId = session.metadata?.plan_id;
                const isUpgrade = session.metadata?.is_upgrade === 'true';

                if (tenantId && planId) {
                    this._activateSubscription(tenantId, planId, session.customer, session.subscription);
                    this._logEvent(tenantId, isUpgrade ? 'plan_upgraded' : 'subscription_activated', {
                        plan: planId,
                        previousPlan: session.metadata?.previous_plan
                    });
                }
                break;
            }

            case 'invoice.paid': {
                const invoice = event.data.object;
                const tenantId = invoice.subscription_details?.metadata?.tenant_id;

                // Record payment for revenue tracking
                if (tenantId) {
                    this._recordPayment(tenantId, {
                        invoiceId: invoice.id,
                        amount: invoice.amount_paid / 100,
                        currency: invoice.currency,
                        subscriptionAmount: 0,
                        overageAmount: 0
                    });

                    // Parse line items for subscription vs overage
                    if (invoice.lines?.data) {
                        let subAmount = 0, overageAmount = 0;
                        for (const line of invoice.lines.data) {
                            if (line.price?.recurring?.usage_type === 'metered') {
                                overageAmount += line.amount / 100;
                            } else {
                                subAmount += line.amount / 100;
                            }
                        }
                        this._recordPayment(tenantId, {
                            invoiceId: invoice.id,
                            amount: invoice.amount_paid / 100,
                            currency: invoice.currency,
                            subscriptionAmount: subAmount,
                            overageAmount
                        });
                    }
                }

                logger.info('Invoice paid', { customer: invoice.customer, amount: invoice.amount_paid / 100 });
                metrics.inc('stripe_invoices_paid');
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const tenantId = invoice.subscription_details?.metadata?.tenant_id;
                if (tenantId) {
                    // Mark as past_due — usage enforcement will soft-block
                    const sub = dbPrepareGet(
                        'SELECT id FROM tenant_subscriptions WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1',
                        [invoice.customer]
                    );
                    if (sub) {
                        dbRun("UPDATE tenant_subscriptions SET status = 'past_due', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [sub.id]);
                    }
                    this._logEvent(tenantId, 'payment_failed', { invoiceId: invoice.id });
                }
                logger.warn('Payment failed', { customer: invoice.customer });
                metrics.inc('payment_failures');
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                this._updateSubscriptionStatus(subscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const sub = dbPrepareGet(
                    'SELECT * FROM tenant_subscriptions WHERE stripe_subscription_id = ?',
                    [subscription.id]
                );
                if (sub) {
                    dbRun("UPDATE tenant_subscriptions SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP WHERE id = ?", [sub.id]);
                    this._logEvent(sub.tenant_id, 'subscription_canceled', {});
                    logger.info('Subscription canceled', { tenantId: sub.tenant_id });
                }
                break;
            }

            case 'customer.subscription.trial_will_end': {
                const subscription = event.data.object;
                const sub = dbPrepareGet(
                    'SELECT * FROM tenant_subscriptions WHERE stripe_subscription_id = ?',
                    [subscription.id]
                );
                if (sub) {
                    this._logEvent(sub.tenant_id, 'trial_ending_soon', {
                        endsAt: new Date(subscription.trial_end * 1000).toISOString()
                    });
                    // TODO: Send trial ending email
                }
                break;
            }
        }
    }

    /**
     * Get invoice history for a tenant via Stripe.
     */
    async getInvoices(tenantId) {
        const stripe = this._getStripe();
        const sub = this.getCurrentSubscription(tenantId);
        if (!stripe || !sub?.stripe_customer_id) {
            return { invoices: [], message: 'No billing history' };
        }

        const invoices = await stripe.invoices.list({
            customer: sub.stripe_customer_id,
            limit: 20
        });

        return {
            invoices: invoices.data.map(inv => ({
                id: inv.id,
                number: inv.number,
                amount: inv.amount_due / 100,
                currency: inv.currency,
                status: inv.status,
                created: inv.created,
                pdf_url: inv.invoice_pdf,
                hosted_url: inv.hosted_invoice_url
            }))
        };
    }

    // ═══════════════════════════════════════════════════
    // INTERNAL METHODS
    // ═══════════════════════════════════════════════════

    _sanitizePlan(plan) {
        return {
            id: plan.id,
            name: plan.name,
            display_name: plan.display_name,
            price_monthly: plan.price_monthly,
            price_yearly: plan.price_yearly,
            included_minutes: plan.max_minutes,
            overage_per_minute: plan.overage_per_minute || 0,
            max_agents: plan.max_agents,
            max_concurrent_calls: plan.max_concurrent_calls,
            features: typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features,
        };
    }

    _activateSubscription(tenantId, planId, customerId, subscriptionId) {
        const existing = dbPrepareGet(
            'SELECT id FROM tenant_subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1',
            [tenantId]
        );

        if (existing) {
            dbRun(
                `UPDATE tenant_subscriptions SET plan_id = ?, status = 'active', 
                 stripe_customer_id = ?, stripe_subscription_id = ?,
                 current_period_start = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [planId, customerId, subscriptionId, existing.id]
            );
        } else {
            dbRun(
                `INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status, stripe_customer_id, stripe_subscription_id)
                 VALUES (?, ?, ?, 'active', ?, ?)`,
                [uuid(), tenantId, planId, customerId, subscriptionId]
            );
        }

        // Un-suspend if was suspended
        dbRun(`UPDATE tenant_subscriptions SET suspended_at = NULL, suspension_reason = NULL 
               WHERE tenant_id = ? AND status = 'active'`, [tenantId]);

        logger.info('Subscription activated', { tenantId, planId });
        metrics.inc('subscriptions_activated');
    }

    _updateSubscriptionStatus(subscription) {
        const sub = dbPrepareGet(
            'SELECT * FROM tenant_subscriptions WHERE stripe_subscription_id = ?',
            [subscription.id]
        );
        if (!sub) return;

        const statusMap = {
            'active': 'active', 'past_due': 'past_due',
            'canceled': 'canceled', 'trialing': 'trialing',
            'unpaid': 'suspended', 'incomplete_expired': 'suspended'
        };
        const newStatus = statusMap[subscription.status] || subscription.status;

        dbRun('UPDATE tenant_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, sub.id]);

        if (newStatus === 'suspended') {
            dbRun(`UPDATE tenant_subscriptions SET suspended_at = CURRENT_TIMESTAMP, 
                   suspension_reason = 'payment_failed' WHERE id = ?`, [sub.id]);
        }
    }

    _recordPayment(tenantId, { invoiceId, amount, currency, subscriptionAmount, overageAmount }) {
        try {
            dbRun(
                `INSERT OR IGNORE INTO revenue_events (id, tenant_id, event_type, invoice_id, 
                 amount, currency, subscription_amount, overage_amount, created_at)
                 VALUES (?, ?, 'payment', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [uuid(), tenantId, invoiceId, amount, currency, subscriptionAmount, overageAmount]
            );
        } catch (e) {
            // Table may not exist yet — non-blocking
            logger.debug('Could not record payment event', { error: e.message });
        }
    }

    _logEvent(tenantId, eventType, data) {
        try {
            dbRun(
                `INSERT INTO subscription_events (id, tenant_id, event_type, event_data, created_at)
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [uuid(), tenantId, eventType, JSON.stringify(data)]
            );
        } catch (e) {
            // Table may not exist yet — non-blocking
            logger.debug('Could not log subscription event', { error: e.message });
        }
    }

    _getStripe() {
        if (!process.env.STRIPE_SECRET_KEY) return null;
        try {
            return require('stripe')(process.env.STRIPE_SECRET_KEY);
        } catch (e) {
            logger.warn('Stripe module not available', { error: e.message });
            return null;
        }
    }
}

module.exports = new SubscriptionService();
