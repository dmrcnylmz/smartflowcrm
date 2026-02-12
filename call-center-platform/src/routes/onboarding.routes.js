/**
 * Onboarding Routes — Checklist & Success Metrics
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const onboardingService = require('../services/onboarding.service');

router.use(authMiddleware);

/**
 * @swagger
 * /api/onboarding/checklist:
 *   get:
 *     summary: Get onboarding checklist with completion percentage
 *     tags: [Onboarding]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/checklist', (req, res) => {
    try {
        const checklist = onboardingService.getChecklist(req.tenantId);
        res.json(checklist);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/onboarding/metrics:
 *   get:
 *     summary: Get customer success metrics
 *     tags: [Onboarding]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/metrics', (req, res) => {
    try {
        const metrics = onboardingService.getSuccessMetrics(req.tenantId);
        if (!metrics) return res.status(404).json({ error: 'Tenant not found' });
        res.json(metrics);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
