/**
 * Latency Routes — Phase 13
 * GET /api/metrics/latency — Pipeline latency histogram data
 */
const express = require('express');
const router = express.Router();
const latencyTracker = require('../services/latency-tracker');
const { getAllStatus } = require('../utils/circuit-breaker');

/**
 * @swagger
 * /api/metrics/latency:
 *   get:
 *     summary: Get pipeline latency metrics
 *     tags: [Metrics]
 *     parameters:
 *       - name: window
 *         in: query
 *         description: Time window in seconds (default 60)
 *     responses:
 *       200:
 *         description: Latency statistics
 */
router.get('/', (req, res) => {
    const windowSec = parseInt(req.query.window) || 60;
    const stats = latencyTracker.getStats(windowSec * 1000);
    const samples = latencyTracker.getRecentSamples(parseInt(req.query.limit) || 50);

    res.json({
        stats,
        samples,
        targets: {
            first_byte_ms: 150,
            e2e_ms: 600
        }
    });
});

/**
 * @swagger
 * /api/metrics/latency/health:
 *   get:
 *     summary: Get provider health and circuit breaker status
 *     tags: [Metrics]
 */
router.get('/health', (req, res) => {
    const providerFailover = require('../services/provider-failover');
    const llmRouter = require('../services/llm-router');

    res.json({
        providers: providerFailover.getHealthStatus(),
        circuitBreakers: getAllStatus(),
        llmRouting: llmRouter.getStats()
    });
});

module.exports = router;
