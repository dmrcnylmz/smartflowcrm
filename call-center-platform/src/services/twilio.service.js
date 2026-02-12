/**
 * Twilio Service — Telephony Integration
 * 
 * Handles Twilio REST API interactions, TwiML generation,
 * webhook signature validation, and auth token encryption.
 * Uses native https — no Twilio SDK dependency.
 */
const https = require('https');
const crypto = require('crypto');
const { dbPrepareGet, dbRun } = require('../config/database');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'twilio' });

// Encryption for auth_token at rest
const ENCRYPTION_KEY = process.env.TWILIO_ENCRYPTION_KEY || process.env.TRANSCRIPT_ENCRYPTION_KEY || 'default-twilio-enc-key-32chars!!';
const ALGORITHM = 'aes-256-cbc';

class TwilioService {
    /**
     * Encrypt a string for storage (auth_token)
     */
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt a stored auth_token
     */
    decrypt(encrypted) {
        const [ivHex, data] = encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Get telephony config for a tenant
     */
    getTenantTelephony(tenantId) {
        return dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ? AND enabled = 1',
            [tenantId]
        );
    }

    /**
     * Look up tenant by phone number (for inbound routing)
     */
    getTenantByPhone(phoneNumber) {
        // Normalize: strip spaces, dashes
        const normalized = phoneNumber.replace(/[\s\-()]/g, '');
        return dbPrepareGet(
            `SELECT tt.*, ts.company_name, ts.tone, ts.language 
             FROM tenant_telephony tt
             LEFT JOIN tenant_settings ts ON tt.tenant_id = ts.tenant_id
             WHERE tt.phone_number = ? AND tt.enabled = 1`,
            [normalized]
        );
    }

    /**
     * Generate TwiML for inbound call — connects to media stream
     */
    generateInboundTwiml(streamUrl, tenantId) {
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            '  <Connect>',
            `    <Stream url="${streamUrl}">`,
            `      <Parameter name="tenantId" value="${tenantId}"/>`,
            '    </Stream>',
            '  </Connect>',
            '</Response>'
        ].join('\n');
    }

    /**
     * Generate TwiML to bridge call to an agent
     */
    generateBridgeTwiml(agentPhone) {
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            `  <Dial>${agentPhone}</Dial>`,
            '</Response>'
        ].join('\n');
    }

    /**
     * Make an outbound call via Twilio REST API
     */
    async makeOutboundCall(tenantId, to, twimlUrl) {
        const config = this.getTenantTelephony(tenantId);
        if (!config) {
            throw new Error(`No telephony config found for tenant ${tenantId}`);
        }

        const authToken = this.decrypt(config.auth_token_encrypted);
        const from = config.phone_number;

        logger.info('Initiating outbound call', { tenantId, to, from });
        metrics.inc('twilio_outbound_calls', { tenant: tenantId });

        return new Promise((resolve, reject) => {
            const postData = new URLSearchParams({
                To: to,
                From: from,
                Url: twimlUrl,
                StatusCallback: twimlUrl.replace(/\/inbound$/, '/status'),
                StatusCallbackEvent: 'initiated ringing answered completed'
            }).toString();

            const options = {
                hostname: 'api.twilio.com',
                port: 443,
                path: `/2010-04-01/Accounts/${config.account_sid}/Calls.json`,
                method: 'POST',
                auth: `${config.account_sid}:${authToken}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            logger.info('Outbound call created', { callSid: data.sid, tenantId });
                            resolve({
                                callSid: data.sid,
                                status: data.status,
                                from: data.from,
                                to: data.to
                            });
                        } else {
                            logger.error('Twilio API error', { status: res.statusCode, body: data });
                            reject(new Error(data.message || `Twilio error: ${res.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Invalid Twilio response'));
                    }
                });
            });

            req.on('error', (e) => {
                logger.error('Twilio request failed', { error: e.message });
                metrics.inc('twilio_errors', { tenant: tenantId });
                reject(e);
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * Validate Twilio webhook signature
     * @see https://www.twilio.com/docs/usage/security#validating-requests
     */
    validateSignature(url, params, signature, authToken) {
        // Build the data string: URL + sorted POST params
        let data = url;
        const sortedKeys = Object.keys(params || {}).sort();
        for (const key of sortedKeys) {
            data += key + params[key];
        }

        const computed = crypto
            .createHmac('sha1', authToken)
            .update(data)
            .digest('base64');

        return computed === signature;
    }

    /**
     * Express middleware for Twilio signature validation
     */
    signatureMiddleware() {
        return (req, res, next) => {
            // Skip in test/dev
            if (process.env.NODE_ENV === 'test' || process.env.SKIP_TWILIO_VALIDATION === 'true') {
                return next();
            }

            const signature = req.headers['x-twilio-signature'];
            if (!signature) {
                logger.warn('Missing Twilio signature');
                return res.status(403).send('Forbidden');
            }

            // Determine tenant from Called number
            const calledNumber = req.body?.Called || req.body?.To;
            if (!calledNumber) {
                return res.status(400).send('Missing phone number');
            }

            const config = this.getTenantByPhone(calledNumber);
            if (!config) {
                return res.status(404).send('Unknown number');
            }

            const authToken = this.decrypt(config.auth_token_encrypted);
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const fullUrl = `${protocol}://${req.headers.host}${req.originalUrl}`;

            if (!this.validateSignature(fullUrl, req.body, signature, authToken)) {
                logger.warn('Invalid Twilio signature', { url: fullUrl });
                return res.status(403).send('Invalid signature');
            }

            req.twilioConfig = config;
            next();
        };
    }

    /**
     * Track telephony minutes
     */
    trackMinutes(tenantId, durationSeconds) {
        const minutes = Math.ceil(durationSeconds / 60);
        const month = new Date().toISOString().slice(0, 7);

        try {
            const existing = dbPrepareGet(
                'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
                [tenantId, month]
            );

            if (existing) {
                dbRun(
                    'UPDATE usage_metrics SET telephony_minutes = telephony_minutes + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [minutes, existing.id]
                );
            } else {
                const { v4: uuid } = require('uuid');
                dbRun(
                    'INSERT INTO usage_metrics (id, tenant_id, month, telephony_minutes) VALUES (?, ?, ?, ?)',
                    [uuid(), tenantId, month, minutes]
                );
            }

            metrics.inc('telephony_minutes_total', { tenant: tenantId });
            logger.info('Telephony minutes tracked', { tenantId, minutes, month });
        } catch (e) {
            logger.error('Failed to track telephony minutes', { error: e.message });
        }
    }

    /**
     * Save or update tenant telephony config
     */
    saveTelephonyConfig(tenantId, config) {
        const existing = dbPrepareGet(
            'SELECT * FROM tenant_telephony WHERE tenant_id = ?',
            [tenantId]
        );

        const encryptedToken = config.auth_token
            ? this.encrypt(config.auth_token)
            : existing?.auth_token_encrypted;

        if (existing) {
            dbRun(
                `UPDATE tenant_telephony 
                 SET provider = ?, account_sid = ?, auth_token_encrypted = ?, 
                     phone_number = ?, twiml_app_sid = ?, enabled = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE tenant_id = ?`,
                [
                    config.provider || existing.provider,
                    config.account_sid || existing.account_sid,
                    encryptedToken,
                    config.phone_number || existing.phone_number,
                    config.twiml_app_sid || existing.twiml_app_sid || null,
                    config.enabled !== undefined ? (config.enabled ? 1 : 0) : existing.enabled,
                    tenantId
                ]
            );
        } else {
            const { v4: uuid } = require('uuid');
            dbRun(
                `INSERT INTO tenant_telephony (id, tenant_id, provider, account_sid, auth_token_encrypted, phone_number, twiml_app_sid, enabled)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    uuid(), tenantId,
                    config.provider || 'twilio',
                    config.account_sid || '',
                    encryptedToken || '',
                    config.phone_number || '',
                    config.twiml_app_sid || null,
                    config.enabled ? 1 : 0
                ]
            );
        }

        logger.info('Telephony config saved', { tenantId, provider: config.provider });
    }
}

module.exports = new TwilioService();
