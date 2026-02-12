/**
 * Subscription Routes — Plans, Checkout & Webhooks
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const subscriptionService = require('../services/subscription.service');

/**
 * @swagger
 * /api/subscription/plans:
 *   get:
 *     summary: List available subscription plans
 *     tags: [Subscription]
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
 * @swagger
 * /api/subscription/current:
 *   get:
 *     summary: Get current tenant subscription
 *     tags: [Subscription]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/current', authMiddleware, (req, res) => {
    try {
        const sub = subscriptionService.getCurrentSubscription(req.tenantId);
        if (!sub) return res.json({ subscription: null, message: 'No active subscription' });
        const limits = subscriptionService.checkLimits(req.tenantId);
        res.json({ subscription: sub, limits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/subscription/limits:
 *   get:
 *     summary: Check current plan limits and usage
 *     tags: [Subscription]
 *     security: [{ bearerAuth: [] }]
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
 * @swagger
 * /api/subscription/checkout:
 *   post:
 *     summary: Create Stripe Checkout session for plan upgrade
 *     tags: [Subscription]
 *     security: [{ bearerAuth: [] }]
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
 * @swagger
 * /api/subscription/webhook:
 *   post:
 *     summary: Stripe webhook handler
 *     tags: [Subscription]
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

/**
 * @swagger
 * /api/subscription/invoices:
 *   get:
 *     summary: Get invoice history
 *     tags: [Subscription]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/invoices', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const result = await subscriptionService.getInvoices(req.tenantId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
