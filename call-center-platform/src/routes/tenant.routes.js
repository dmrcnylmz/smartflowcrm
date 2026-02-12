const express = require('express');
const router = express.Router();
const tenantService = require('../services/tenant.service');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

/**
 * @swagger
 * /api/tenants/me:
 *   get:
 *     summary: Get current tenant details
 *     tags: [Tenants]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Tenant details }
 */
router.get('/me', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const tenant = tenantService.getTenant(req.tenantId);
        if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
        res.json(tenant);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/tenants/me/agents:
 *   get:
 *     summary: List tenant agents
 *     tags: [Tenants]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me/agents', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const agents = tenantService.getAgents(req.tenantId);
        res.json({ agents, count: agents.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/tenants/me/agents/{agentId}:
 *   get:
 *     summary: Get agent details
 *     tags: [Tenants]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me/agents/:agentId', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const agent = tenantService.getAgent(req.tenantId, req.params.agentId);
        if (!agent) return res.status(404).json({ error: 'Agent not found' });
        res.json(agent);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/tenants/me/agents/{agentId}/status:
 *   patch:
 *     summary: Update agent status
 *     tags: [Tenants]
 *     security: [{ bearerAuth: [] }]
 */
router.patch('/me/agents/:agentId/status', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status required' });
        const agent = tenantService.updateAgentStatus(req.tenantId, req.params.agentId, status);
        res.json(agent);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/tenants/me/queues:
 *   get:
 *     summary: List tenant queues
 *     tags: [Tenants]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me/queues', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const queues = tenantService.getQueues(req.tenantId);
        res.json({ queues, count: queues.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/tenants/me/numbers:
 *   get:
 *     summary: List tenant phone numbers
 *     tags: [Tenants]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me/numbers', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const numbers = tenantService.getPhoneNumbers(req.tenantId);
        res.json({ numbers, count: numbers.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Platform admin: list all tenants (super admin only)
router.get('/', (req, res) => {
    try {
        const tenants = tenantService.listTenants();
        res.json({ tenants, count: tenants.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
