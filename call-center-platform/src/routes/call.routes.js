const express = require('express');
const router = express.Router();
const callService = require('../services/call.service');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * @swagger
 * /api/calls:
 *   get:
 *     summary: List calls (tenant-scoped with filters)
 *     tags: [Calls]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: call_type
 *         schema: { type: string, enum: [inbound, outbound] }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: agent_id
 *         schema: { type: string }
 *       - in: query
 *         name: queue_id
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 */
router.get('/', (req, res) => {
    try {
        const calls = callService.getCalls(req.tenantId, req.query);
        res.json({ calls, count: calls.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/calls/{id}:
 *   get:
 *     summary: Get call detail
 *     tags: [Calls]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', (req, res) => {
    try {
        const call = callService.getCall(req.tenantId, req.params.id);
        if (!call) return res.status(404).json({ error: 'Call not found' });
        res.json(call);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/calls/{id}/logs:
 *   get:
 *     summary: Get call event logs
 *     tags: [Calls]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id/logs', (req, res) => {
    try {
        const logs = callService.getCallLogs(req.tenantId, req.params.id);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/calls/inbound:
 *   post:
 *     summary: Create inbound call
 *     tags: [Calls]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [caller_number, queue_id]
 *             properties:
 *               caller_number: { type: string }
 *               queue_id: { type: string }
 *               agent_id: { type: string }
 *               ivr_selection: { type: string }
 */
router.post('/inbound', (req, res) => {
    try {
        const call = callService.createInboundCall(req.tenantId, req.body);
        res.status(201).json(call);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/calls/outbound:
 *   post:
 *     summary: Create outbound call
 *     tags: [Calls]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agent_id, callee_number]
 *             properties:
 *               agent_id: { type: string }
 *               callee_number: { type: string }
 *               queue_id: { type: string }
 */
router.post('/outbound', (req, res) => {
    try {
        const call = callService.createOutboundCall(req.tenantId, req.body);
        res.status(201).json(call);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

module.exports = router;
