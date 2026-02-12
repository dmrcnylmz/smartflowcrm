/**
 * Subscription Service — Plans, Limits & Stripe Integration
 * 
 * Manages subscription tiers, enforces limits, and handles
 * Stripe Checkout/Webhook flows.
 */
const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');
const logger = rootLogger.child({ component: 'subscription' });

// Default plan definitions (seeded on first access)
const DEFAULT_PLANS = [
    {
        id: 'plan_free_trial', name: 'free_trial', display_name: 'Free Trial',
        price_monthly: 0, max_minutes: 100, max_ai_tokens: 50000,
        max_agents: 2, max_concurrent_calls: 1, sort_order: 0,
        features: JSON.stringify({ recording: true, analytics: false, api_access: false })
    },
    {
        id: 'plan_starter', name: 'starter', display_name: 'Starter',
        price_monthly: 49, price_yearly: 470, max_minutes: 500, max_ai_tokens: 250000,
        max_agents: 5, max_concurrent_calls: 3, sort_order: 1,
        features: JSON.stringify({ recording: true, analytics: true, api_access: false })
    },
    {
        id: 'plan_pro', name: 'pro', display_name: 'Pro',
        price_monthly: 149, price_yearly: 1430, max_minutes: 2000, max_ai_tokens: 1000000,
        max_agents: 20, max_concurrent_calls: 10, sort_order: 2,
        features: JSON.stringify({ recording: true, analytics: true, api_access: true, priority_support: true })
    },
    {
        id: 'plan_enterprise', name: 'enterprise', display_name: 'Enterprise',
        price_monthly: 499, price_yearly: 4790, max_minutes: 10000, max_ai_tokens: 5000000,
        max_agents: 100, max_concurrent_calls: 50, sort_order: 3,
        features: JSON.stringify({ recording: true, analytics: true, api_access: true, priority_support: true, sla: true, custom_integrations: true })
    }
];

class SubscriptionService {
    constructor() {
        this._seeded = false;
    }

    /**
     * Ensure default plans exist in the database.
     */
    seedPlans() {
        if (this._seeded) return;
        try {
            for (const plan of DEFAULT_PLANS) {
                const existing = dbPrepareGet('SELECT id FROM subscription_plans WHERE name = ?', [plan.name]);
                if (!existing) {
                    dbRun(
                        `INSERT INTO subscription_plans (id, name, display_name, price_monthly, price_yearly, 
                         max_minutes, max_ai_tokens, max_agents, max_concurrent_calls, features, sort_order)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [plan.id, plan.name, plan.display_name, plan.price_monthly, plan.price_yearly || 0,
                        plan.max_minutes, plan.max_ai_tokens, plan.max_agents, plan.max_concurrent_calls,
                        plan.features, plan.sort_order]
                    );
                }
            }
            this._seeded = true;
        } catch (e) {
            // Table might not exist yet during init
            logger.warn('Could not seed plans', { error: e.message });
        }
    }

    /**
     * List all available plans.
     */
    listPlans() {
        this.seedPlans();
        return dbPrepareAll('SELECT * FROM subscription_plans WHERE active = 1 ORDER BY sort_order ASC');
    }

    /**
     * Get a plan by ID or name.
     */
    getPlan(idOrName) {
        return dbPrepareGet(
            'SELECT * FROM subscription_plans WHERE id = ? OR name = ?',
            [idOrName, idOrName]
        );
    }

    /**
     * Get current subscription for a tenant.
     */
    getCurrentSubscription(tenantId) {
        const sub = dbPrepareGet(
            `SELECT ts.*, sp.name as plan_name, sp.display_name, sp.max_minutes, sp.max_ai_tokens,
                    sp.max_agents, sp.max_concurrent_calls, sp.features, sp.price_monthly
             FROM tenant_subscriptions ts
             JOIN subscription_plans sp ON ts.plan_id = sp.id
             WHERE ts.tenant_id = ? 
             ORDER BY ts.created_at DESC LIMIT 1`,
            [tenantId]
        );

        if (!sub) return null;

        // Check if trial expired
        if (sub.status === 'trialing' && sub.trial_ends_at && new Date(sub.trial_ends_at) < new Date()) {
            dbRun("UPDATE tenant_subscriptions SET status = 'expired' WHERE id = ?", [sub.id]);
            sub.status = 'expired';
        }

        return sub;
    }

    /**
     * Check if tenant is within plan limits.
     * Returns { allowed, reason?, limits, usage }
     */
    checkLimits(tenantId) {
        const sub = this.getCurrentSubscription(tenantId);
        if (!sub) return { allowed: false, reason: 'No active subscription' };
        if (sub.status === 'expired') return { allowed: false, reason: 'Subscription expired' };
        if (sub.status === 'canceled') return { allowed: false, reason: 'Subscription canceled' };

        // Get current usage
        const month = new Date().toISOString().slice(0, 7);
        const usage = dbPrepareGet(
            'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
            [tenantId, month]
        ) || { call_minutes: 0, ai_tokens: 0 };

        // Get agent count
        const agents = dbPrepareGet(
            'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?',
            [tenantId]
        );

        const limits = {
            minutes: { used: usage.call_minutes, max: sub.max_minutes, remaining: Math.max(0, sub.max_minutes - usage.call_minutes) },
            tokens: { used: usage.ai_tokens, max: sub.max_ai_tokens, remaining: Math.max(0, sub.max_ai_tokens - usage.ai_tokens) },
            agents: { used: agents.count, max: sub.max_agents },
            concurrent_calls: { max: sub.max_concurrent_calls }
        };

        const violations = [];
        if (usage.call_minutes >= sub.max_minutes) violations.push('Monthly minute limit reached');
        if (usage.ai_tokens >= sub.max_ai_tokens) violations.push('Monthly token limit reached');
        if (agents.count > sub.max_agents) violations.push('Agent limit exceeded');

        return {
            allowed: violations.length === 0,
            reason: violations.join('; ') || null,
            plan: sub.plan_name,
            status: sub.status,
            limits,
            trial_ends_at: sub.trial_ends_at
        };
    }

    /**
     * Create a Stripe Checkout session for plan upgrade.
     */
    async createCheckoutSession(tenantId, planId, billingCycle = 'monthly') {
        const stripe = this._getStripe();
        if (!stripe) throw { status: 503, message: 'Stripe not configured' };

        const plan = this.getPlan(planId);
        if (!plan) throw { status: 404, message: 'Plan not found' };

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

            // Store customer ID
            if (sub) {
                dbRun('UPDATE tenant_subscriptions SET stripe_customer_id = ? WHERE id = ?',
                    [customerId, sub.id]);
            }
        }

        const priceId = billingCycle === 'yearly' ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
        const baseUrl = process.env.APP_URL || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            line_items: [{
                price: priceId || undefined,
                quantity: 1,
                ...(priceId ? {} : {
                    price_data: {
                        currency: plan.currency || 'usd',
                        product_data: { name: plan.display_name },
                        unit_amount: Math.round((billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly) * 100),
                        recurring: { interval: billingCycle === 'yearly' ? 'year' : 'month' }
                    }
                })
            }],
            success_url: `${baseUrl}/admin?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/admin?checkout=canceled`,
            metadata: { tenant_id: tenantId, plan_id: planId }
        });

        logger.info('Checkout session created', { tenantId, planId, sessionId: session.id });
        return { sessionId: session.id, url: session.url };
    }

    /**
     * Handle Stripe webhook events.
     */
    async handleWebhook(event) {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const tenantId = session.metadata?.tenant_id;
                const planId = session.metadata?.plan_id;
                if (tenantId && planId) {
                    this._activateSubscription(tenantId, planId, session.customer, session.subscription);
                }
                break;
            }
            case 'invoice.paid': {
                const invoice = event.data.object;
                logger.info('Invoice paid', { customer: invoice.customer, amount: invoice.amount_paid });
                metrics.inc('stripe_invoices_paid');
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
                    dbRun("UPDATE tenant_subscriptions SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [sub.id]);
                    logger.info('Subscription canceled', { tenantId: sub.tenant_id });
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

    // ─── Internal ───────────────────────────────────

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
            'active': 'active',
            'past_due': 'past_due',
            'canceled': 'canceled',
            'trialing': 'trialing'
        };
        const newStatus = statusMap[subscription.status] || subscription.status;

        dbRun('UPDATE tenant_subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, sub.id]);
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
