/**
 * Twilio Webhook Routes
 * 
 * POST /api/twilio/inbound  — Inbound call webhook (returns TwiML)
 * POST /api/twilio/status    — Call status callback
 * GET  /api/twilio/config    — Get tenant telephony config (admin)
 * PUT  /api/twilio/config    — Update tenant telephony config (admin)
 */
const express = require('express');
const router = express.Router();
const twilioService = require('../services/twilio.service');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('../services/metrics.service');

const logger = rootLogger.child({ component: 'twilio-routes' });

/**
 * @swagger
 * /api/twilio/inbound:
 *   post:
 *     summary: Twilio inbound call webhook
 *     tags: [Telephony]
 *     description: Returns TwiML to connect call to media stream
 *     responses:
 *       200:
 *         description: TwiML response
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 */
router.post('/inbound', (req, res) => {
    try {
        const calledNumber = req.body?.Called || req.body?.To;
        const callerNumber = req.body?.From || req.body?.Caller;
        const callSid = req.body?.CallSid;

        logger.info('Inbound call received', { calledNumber, callerNumber, callSid });
        metrics.inc('twilio_inbound_calls');

        // Look up tenant by called number
        let tenantConfig = null;
        if (calledNumber) {
            tenantConfig = twilioService.getTenantByPhone(calledNumber);
        }

        const tenantId = tenantConfig?.tenant_id || 'default';

        // Build WebSocket URL for media stream
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const wsProtocol = protocol === 'https' ? 'wss' : 'ws';
        const host = req.headers.host;
        const streamUrl = `${wsProtocol}://${host}/ws/twilio-media`;

        const twiml = twilioService.generateInboundTwiml(streamUrl, tenantId);

        res.set('Content-Type', 'application/xml');
        res.send(twiml);

    } catch (e) {
        logger.error('Inbound webhook error', { error: e.message });
        metrics.inc('errors_total', { component: 'twilio-inbound' });

        // Return a safe TwiML response
        res.set('Content-Type', 'application/xml');
        res.send([
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            '  <Say>We are experiencing technical difficulties. Please try again later.</Say>',
            '</Response>'
        ].join('\n'));
    }
});

/**
 * @swagger
 * /api/twilio/status:
 *   post:
 *     summary: Twilio call status callback
 *     tags: [Telephony]
 *     description: Receives call status updates from Twilio
 *     responses:
 *       200:
 *         description: OK
 */
router.post('/status', (req, res) => {
    const { CallSid, CallStatus, CallDuration, From, To } = req.body || {};

    logger.info('Call status update', { callSid: CallSid, status: CallStatus, duration: CallDuration });
    metrics.inc('twilio_status_updates', { status: CallStatus || 'unknown' });

    // Track minutes when call is completed
    if (CallStatus === 'completed' && CallDuration) {
        const calledNumber = To;
        const tenantConfig = calledNumber
            ? twilioService.getTenantByPhone(calledNumber)
            : null;

        if (tenantConfig) {
            twilioService.trackMinutes(tenantConfig.tenant_id, parseInt(CallDuration));
        }
    }

    res.sendStatus(200);
});

// ─── Admin endpoints (JWT-protected) ──────────────────────

/**
 * @swagger
 * /api/twilio/config:
 *   get:
 *     summary: Get tenant telephony configuration
 *     tags: [Telephony]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Telephony config (auth_token masked)
 */
router.get('/config', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        const { dbPrepareGet } = require('../config/database');
        const config = dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ?',
            [req.tenantId]
        );

        if (!config) {
            return res.json({
                provider: 'twilio',
                account_sid: '',
                phone_number: '',
                enabled: false
            });
        }

        // Mask auth token
        res.json({
            provider: config.provider,
            account_sid: config.account_sid,
            auth_token: config.auth_token_encrypted ? '••••••••' : '',
            phone_number: config.phone_number,
            twiml_app_sid: config.twiml_app_sid,
            enabled: !!config.enabled
        });
    } catch (e) {
        logger.error('Get telephony config error', { error: e.message });
        res.status(500).json({ error: 'Failed to get telephony config' });
    }
});

/**
 * @swagger
 * /api/twilio/config:
 *   put:
 *     summary: Update tenant telephony configuration
 *     tags: [Telephony]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider: { type: string, enum: [twilio, sip] }
 *               account_sid: { type: string }
 *               auth_token: { type: string }
 *               phone_number: { type: string }
 *               enabled: { type: boolean }
 *     responses:
 *       200:
 *         description: Config updated
 */
router.put('/config', authMiddleware, tenantMiddleware, (req, res) => {
    try {
        // Admin only
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { provider, account_sid, auth_token, phone_number, twiml_app_sid, enabled } = req.body;

        twilioService.saveTelephonyConfig(req.tenantId, {
            provider, account_sid, auth_token, phone_number, twiml_app_sid, enabled
        });

        logger.info('Telephony config updated', { tenantId: req.tenantId });
        res.json({ success: true });
    } catch (e) {
        logger.error('Update telephony config error', { error: e.message });
        res.status(500).json({ error: 'Failed to update telephony config' });
    }
});

module.exports = router;
