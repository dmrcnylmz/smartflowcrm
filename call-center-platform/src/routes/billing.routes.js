/**
 * Billing Routes — Usage, Pricing & Invoice (v2)
 * 
 * @swagger
 * tags:
 *   - name: Billing
 *     description: Usage tracking, pricing, and invoice management
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const billingService = require('../services/billing.service');

router.use(authMiddleware);

/**
 * @swagger
 * /api/billing/usage:
 *   get:
 *     summary: Get current month usage
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/usage', (req, res) => {
    try {
        const usage = billingService.getCurrentUsage(req.tenantId);
        res.json(usage);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/billing/summary:
 *   get:
 *     summary: Get usage summary with history
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/summary', (req, res) => {
    try {
        const summary = billingService.getUsageSummary(req.tenantId);
        res.json(summary);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/billing/pricing:
 *   get:
 *     summary: Get tenant pricing
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/pricing', (req, res) => {
    try {
        const pricing = billingService.getTenantPricing(req.tenantId);
        res.json(pricing);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/billing/pricing:
 *   put:
 *     summary: Update tenant pricing (admin only)
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 */
router.put('/pricing', requireRole('admin'), (req, res) => {
    try {
        const pricing = billingService.updatePricing(req.tenantId, req.body);
        res.json(pricing);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/billing/invoice:
 *   get:
 *     summary: Get invoice preview for current month
 *     tags: [Billing]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/invoice', (req, res) => {
    try {
        const invoice = billingService.getInvoicePreview(req.tenantId);
        res.json(invoice);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
