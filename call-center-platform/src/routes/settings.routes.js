/**
 * Settings Routes — Tenant AI Persona Configuration
 */
const express = require('express');
const router = express.Router();
const settingsService = require('../services/settings.service');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get tenant AI settings
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', (req, res) => {
    try {
        const settings = settingsService.getSettings(req.tenantId);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/settings:
 *   put:
 *     summary: Update tenant AI settings (admin only)
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company_name: { type: string }
 *               tone: { type: string, enum: [formal, friendly] }
 *               forbidden_topics: { type: string }
 *               escalation_rules: { type: string }
 */
router.put('/', requireRole('admin'), (req, res) => {
    try {
        const settings = settingsService.updateSettings(req.tenantId, req.body);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
