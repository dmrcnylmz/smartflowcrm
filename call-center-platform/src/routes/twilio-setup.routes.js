/**
 * Twilio Setup Wizard Routes — BYO Account Flow
 * 
 * Step 1: Paste Account SID
 * Step 2: Paste API Key + Secret
 * Step 3: Verify credentials
 * Step 4: List/purchase/select phone number
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const { authMiddleware, requireRole } = require('../middleware/auth');
const twilioService = require('../services/twilio.service');

router.use(authMiddleware, requireRole('admin'));

/**
 * @swagger
 * /api/twilio-setup/verify:
 *   post:
 *     summary: Verify Twilio credentials
 *     tags: [Twilio Setup]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/verify', async (req, res) => {
    try {
        const { account_sid, api_key, api_secret } = req.body;
        if (!account_sid || !api_key || !api_secret) {
            return res.status(400).json({ error: 'account_sid, api_key, and api_secret required' });
        }

        // Verify by calling Twilio API to get account info
        const result = await _twilioApiRequest(
            account_sid, api_key, api_secret,
            `/2010-04-01/Accounts/${account_sid}.json`, 'GET'
        );

        if (result.error) {
            return res.status(401).json({
                valid: false,
                error: 'Invalid Twilio credentials',
                detail: result.error
            });
        }

        res.json({
            valid: true,
            account: {
                sid: result.sid,
                friendly_name: result.friendly_name,
                status: result.status,
                type: result.type
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/twilio-setup/numbers:
 *   get:
 *     summary: List phone numbers on Twilio account
 *     tags: [Twilio Setup]
 */
router.get('/numbers', async (req, res) => {
    try {
        const { account_sid, api_key, api_secret } = req.query;
        if (!account_sid || !api_key || !api_secret) {
            return res.status(400).json({ error: 'account_sid, api_key, and api_secret required as query params' });
        }

        const result = await _twilioApiRequest(
            account_sid, api_key, api_secret,
            `/2010-04-01/Accounts/${account_sid}/IncomingPhoneNumbers.json`, 'GET'
        );

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const numbers = (result.incoming_phone_numbers || []).map(n => ({
            sid: n.sid,
            phone_number: n.phone_number,
            friendly_name: n.friendly_name,
            capabilities: n.capabilities,
            status: n.status
        }));

        res.json({ numbers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/twilio-setup/available:
 *   get:
 *     summary: Search available phone numbers for purchase
 *     tags: [Twilio Setup]
 */
router.get('/available', async (req, res) => {
    try {
        const { account_sid, api_key, api_secret, country, area_code } = req.query;
        if (!account_sid || !api_key || !api_secret) {
            return res.status(400).json({ error: 'Credentials required' });
        }

        const cc = country || 'US';
        let path = `/2010-04-01/Accounts/${account_sid}/AvailablePhoneNumbers/${cc}/Local.json?VoiceEnabled=true&SmsEnabled=true`;
        if (area_code) path += `&AreaCode=${area_code}`;

        const result = await _twilioApiRequest(account_sid, api_key, api_secret, path, 'GET');

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const numbers = (result.available_phone_numbers || []).slice(0, 10).map(n => ({
            phone_number: n.phone_number,
            friendly_name: n.friendly_name,
            locality: n.locality,
            region: n.region,
            capabilities: n.capabilities
        }));

        res.json({ numbers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/twilio-setup/purchase:
 *   post:
 *     summary: Purchase a phone number and save config
 *     tags: [Twilio Setup]
 */
router.post('/purchase', async (req, res) => {
    try {
        const { account_sid, api_key, api_secret, phone_number } = req.body;
        if (!account_sid || !api_key || !api_secret || !phone_number) {
            return res.status(400).json({ error: 'account_sid, api_key, api_secret, and phone_number required' });
        }

        // Purchase the number
        const body = `PhoneNumber=${encodeURIComponent(phone_number)}`;
        const result = await _twilioApiRequest(
            account_sid, api_key, api_secret,
            `/2010-04-01/Accounts/${account_sid}/IncomingPhoneNumbers.json`, 'POST', body
        );

        if (result.error) {
            return res.status(400).json({ error: 'Failed to purchase number', detail: result.error });
        }

        // Save to tenant_telephony
        twilioService.saveTelephonyConfig(req.tenantId, {
            account_sid,
            auth_token: api_secret,
            phone_number: result.phone_number,
            enabled: true
        });

        res.json({
            success: true,
            phone_number: result.phone_number,
            sid: result.sid
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/twilio-setup/select:
 *   post:
 *     summary: Select an existing phone number
 *     tags: [Twilio Setup]
 */
router.post('/select', (req, res) => {
    try {
        const { account_sid, api_key, api_secret, phone_number } = req.body;
        if (!account_sid || !phone_number) {
            return res.status(400).json({ error: 'account_sid and phone_number required' });
        }

        twilioService.saveTelephonyConfig(req.tenantId, {
            account_sid,
            auth_token: api_secret || api_key,
            phone_number,
            enabled: true
        });

        res.json({ success: true, phone_number });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Helper: Twilio REST API ─────────────────────

function _twilioApiRequest(accountSid, apiKey, apiSecret, path, method, body) {
    return new Promise((resolve) => {
        const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        const options = {
            hostname: 'api.twilio.com',
            path,
            method,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        resolve({ error: parsed.message || `HTTP ${res.statusCode}` });
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    resolve({ error: `Parse error: ${data.slice(0, 200)}` });
                }
            });
        });

        req.on('error', (e) => resolve({ error: e.message }));
        if (body) req.write(body);
        req.end();
    });
}

module.exports = router;
