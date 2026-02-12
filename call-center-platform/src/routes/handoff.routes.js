/**
 * Handoff Routes — Phase 9 Human Handoff
 * 
 * @swagger
 * tags:
 *   - name: Handoff
 *     description: Human handoff queue management
 */
const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const handoffService = require('../services/handoff.service');

router.use(authMiddleware);

/**
 * @swagger
 * /api/handoffs:
 *   get:
 *     summary: List handoff requests
 *     tags: [Handoff]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, all] }
 *     responses:
 *       200:
 *         description: List of handoff requests
 */
router.get('/', (req, res) => {
    try {
        const status = req.query.status || 'pending';
        let handoffs;

        if (status === 'all') {
            handoffs = handoffService.getAllHandoffs(req.tenantId);
        } else {
            handoffs = handoffService.getPendingHandoffs(req.tenantId);
        }

        const stats = handoffService.getStats(req.tenantId);

        res.json({ handoffs, stats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/handoffs/{id}/assign:
 *   post:
 *     summary: Assign agent to handoff
 *     tags: [Handoff]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/assign', (req, res) => {
    try {
        const agentId = req.body.agentId || req.user.userId;
        const result = handoffService.assignAgent(req.params.id, agentId, req.tenantId);

        if (!result) {
            return res.status(404).json({ error: 'Handoff not found' });
        }

        res.json({ success: true, handoff: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * @swagger
 * /api/handoffs/{id}/resolve:
 *   post:
 *     summary: Resolve a handoff
 *     tags: [Handoff]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/resolve', (req, res) => {
    try {
        const handoff = handoffService.getHandoff(req.params.id, req.tenantId);
        if (!handoff) {
            return res.status(404).json({ error: 'Handoff not found' });
        }

        handoffService.resolveHandoff(req.params.id, req.tenantId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
