/**
 * Subscription Routes — Revenue Activation Layer
 * 
 * Endpoints for plan listing, checkout, billing portal,
 * usage limits, invoices, and Stripe webhooks.
 * 
 * PRICING RULE: All responses show minutes only. No tokens.
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const subscriptionService = require('../services/subscription.service');

/**
 * GET /api/subscription/plans
 * List available plans — public, no auth required.
 * Returns: included_minutes, overage_per_minute, price. No tokens.
 */
router.get('/plans', (req, res) => {
    try {
        const plans = subscriptionService.listPlans();
        res.json({ plans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/subscription/current
 * Get current subscription — sanitized (no tokens).
 */
router.get('/current', authMiddleware, (req, res) => {
    try {
        const sub = subscriptionService.getCurrentSubscriptionPublic(req.tenantId);
        if (!sub) return res.json({ subscription: null, message: 'No active subscription' });
        const limits = subscriptionService.checkLimits(req.tenantId);
        res.json({ subscription: sub, limits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/subscription/limits
 * Check current plan limits and usage — minutes only.
 */
router.get('/limits', authMiddleware, (req, res) => {
    try {
        const limits = subscriptionService.checkLimits(req.tenantId);
        res.json(limits);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/subscription/checkout
 * Create Stripe Checkout session for subscription/upgrade.
 * Includes metered overage price + proration on upgrades.
 */
router.post('/checkout', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { plan_id, billing_cycle } = req.body;
        if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
        const result = await subscriptionService.createCheckoutSession(req.tenantId, plan_id, billing_cycle);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * POST /api/subscription/portal
 * Create Stripe Customer Portal session for self-service billing management.
 * Tenants can: update payment method, change plan, view invoices, cancel.
 */
router.post('/portal', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const result = await subscriptionService.createPortalSession(req.tenantId);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * GET /api/subscription/invoices
 * Get invoice history from Stripe.
 */
router.get('/invoices', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const result = await subscriptionService.getInvoices(req.tenantId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/subscription/webhook
 * Stripe webhook handler — handles all subscription lifecycle events.
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const sig = req.headers['stripe-signature'];
        let event;

        if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } else {
            // Dev mode: trust the payload
            event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        }

        await subscriptionService.handleWebhook(event);
        res.json({ received: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
