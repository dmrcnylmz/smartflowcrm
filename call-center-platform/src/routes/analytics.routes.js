const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics.service');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * @swagger
 * /api/analytics/dashboard:
 *   get:
 *     summary: Get full dashboard metrics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Dashboard with AHT, abandon rate, FCR, utilization, volume
 */
router.get('/dashboard', (req, res) => {
    try {
        const metrics = analyticsService.getDashboard(req.tenantId);
        res.json(metrics);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/analytics/agents/{agentId}:
 *   get:
 *     summary: Get per-agent performance metrics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/agents/:agentId', (req, res) => {
    try {
        const metrics = analyticsService.getAgentMetrics(req.tenantId, req.params.agentId);
        res.json(metrics);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/analytics/queues:
 *   get:
 *     summary: Get per-queue metrics
 *     tags: [Analytics]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/queues', (req, res) => {
    try {
        const metrics = analyticsService.getQueueMetrics(req.tenantId);
        res.json({ queues: metrics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
