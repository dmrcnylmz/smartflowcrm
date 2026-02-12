/**
 * Outbound Call Routes
 * 
 * POST /api/call/outbound — Initiate an outbound phone call
 */
const express = require('express');
const router = express.Router();
const twilioService = require('../services/twilio.service');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('../services/metrics.service');

const logger = rootLogger.child({ component: 'outbound' });

/**
 * @swagger
 * /api/call/outbound:
 *   post:
 *     summary: Initiate an outbound phone call
 *     tags: [Telephony]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [to]
 *             properties:
 *               tenantId: { type: string, description: "Override tenant (admin only)" }
 *               to: { type: string, description: "Phone number to call (E.164)" }
 *               script: { type: string, description: "Optional script/context for AI" }
 *     responses:
 *       200:
 *         description: Call initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 callSid: { type: string }
 *                 status: { type: string }
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Call failed
 */
router.post('/outbound', authMiddleware, tenantMiddleware, async (req, res) => {
    try {
        // Admin only
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { to, script } = req.body;
        const tenantId = req.body.tenantId || req.tenantId;

        if (!to) {
            return res.status(400).json({ error: 'Missing required field: to' });
        }

        // Validate E.164 format (loose)
        if (!/^\+?[1-9]\d{1,14}$/.test(to.replace(/[\s\-()]/g, ''))) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Check tenant has telephony enabled
        const config = twilioService.getTenantTelephony(tenantId);
        if (!config) {
            return res.status(400).json({ error: 'Telephony not configured for this tenant' });
        }

        // Build TwiML URL — points back to our inbound handler
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers.host;
        const twimlUrl = `${protocol}://${host}/api/twilio/inbound`;

        logger.info('Outbound call requested', { tenantId, to });

        // Store script in memory service if provided
        if (script) {
            const memoryService = require('../services/memory.service');
            const { v4: uuid } = require('uuid');
            const sessionId = uuid();
            memoryService.addTurn(sessionId, tenantId, null, 'system',
                `Outbound call context: ${script}. Greet the customer and follow this script naturally.`
            );
        }

        const result = await twilioService.makeOutboundCall(tenantId, to, twimlUrl);

        res.json({
            callSid: result.callSid,
            status: result.status,
            from: result.from,
            to: result.to
        });

    } catch (e) {
        logger.error('Outbound call failed', { error: e.message });
        metrics.inc('errors_total', { component: 'outbound' });
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
