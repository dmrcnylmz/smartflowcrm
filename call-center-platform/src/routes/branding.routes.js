/**
 * Branding Routes — White Label Support
 */
const express = require('express');
const router = express.Router();
const brandingService = require('../services/branding.service');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * @swagger
 * /api/branding:
 *   get:
 *     summary: Get tenant branding
 *     tags: [Branding]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', (req, res) => {
    try {
        const branding = brandingService.getBranding(req.tenantId);
        res.json(branding);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/branding:
 *   put:
 *     summary: Update tenant branding (admin only)
 *     tags: [Branding]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               logo_url: { type: string }
 *               primary_color: { type: string }
 *               secondary_color: { type: string }
 *               company_name: { type: string }
 */
router.put('/', requireRole('admin'), (req, res) => {
    try {
        const branding = brandingService.updateBranding(req.tenantId, req.body);
        res.json(branding);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
