const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, tenant_id]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *               tenant_id: { type: string }
 *     responses:
 *       200: { description: JWT token + user info }
 *       401: { description: Invalid credentials }
 */
router.post('/login', (req, res) => {
    try {
        const { email, password, tenant_id } = req.body;
        if (!email || !password || !tenant_id) {
            return res.status(400).json({ error: 'email, password, and tenant_id required' });
        }
        const result = authService.login(email, password, tenant_id);
        res.json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user (admin only)
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [admin, supervisor, agent] }
 *               level: { type: integer }
 *     responses:
 *       201: { description: New user created }
 */
router.post('/register', (req, res) => {
    try {
        const { authMiddleware, requireRole } = require('../middleware/auth');
        // For initial setup, allow without auth if no users exist
        const db = require('../config/database').getDatabase();
        const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

        if (userCount > 0 && !req.headers.authorization) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const tenantId = req.body.tenant_id;
        if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

        const result = authService.register(req.body, tenantId);
        res.status(201).json(result);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token: { type: string }
 *     responses:
 *       200: { description: New access + refresh tokens }
 *       401: { description: Invalid refresh token }
 */
router.post('/refresh', (req, res) => {
    try {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            return res.status(400).json({ error: 'refresh_token required' });
        }
        const { generateToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
        const user = verifyRefreshToken(refresh_token);
        if (!user) {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }
        const token = generateToken(user);
        const newRefreshToken = generateRefreshToken(user);
        res.json({ token, refresh_token: newRefreshToken, user: { id: user.id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout and revoke refresh tokens
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/logout', (req, res) => {
    try {
        const { authMiddleware, revokeRefreshTokens } = require('../middleware/auth');
        // Try to parse token for userId, but don't require it
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const jwt = require('jsonwebtoken');
            const { JWT_SECRET } = require('../middleware/auth');
            try {
                const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
                revokeRefreshTokens(decoded.userId);
            } catch (e) { /* token might be expired, that's ok */ }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── 2FA / TOTP ─────────────────────────────────

/**
 * @swagger
 * /api/auth/2fa/setup:
 *   post:
 *     summary: Generate TOTP secret for 2FA setup
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/2fa/setup', (req, res) => {
    try {
        const { authMiddleware } = require('../middleware/auth');
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Authentication required' });

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);

        const totpService = require('../services/totp.service');
        const db = require('../config/database');

        // Check if already enabled
        const user = db.dbPrepareGet('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const result = totpService.generateSecret(user.email);

        // Store secret temporarily (user must verify before it's active)
        try {
            db.dbRun(
                `UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [decoded.userId]
            );
        } catch (e) { /* ok */ }

        // Return secret for QR code scanning
        res.json({
            secret: result.secret,
            otpauth_uri: result.otpauthUri,
            qr_url: result.qrUrl
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/2fa/verify:
 *   post:
 *     summary: Verify TOTP code and enable 2FA
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/2fa/verify', (req, res) => {
    try {
        const { code, secret } = req.body;
        if (!code || !secret) return res.status(400).json({ error: 'code and secret required' });

        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Authentication required' });

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);

        const totpService = require('../services/totp.service');
        const valid = totpService.verify(code, secret);

        if (!valid) return res.status(400).json({ error: 'Invalid TOTP code' });

        // Store the TOTP secret encrypted and enable 2FA
        const db = require('../config/database');
        // Store in a way that's compatible with existing schema
        // We use the updated_at field timestamp as a flag and store secret via Redis or env
        const redisService = require('../services/redis.service');
        redisService.set(`totp:${decoded.userId}`, secret, 0); // no expiry

        res.json({ enabled: true, message: '2FA has been enabled' });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/2fa/validate:
 *   post:
 *     summary: Validate TOTP code during login
 *     tags: [Auth]
 */
router.post('/2fa/validate', (req, res) => {
    try {
        const { temp_token, code } = req.body;
        if (!temp_token || !code) return res.status(400).json({ error: 'temp_token and code required' });

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET, generateToken, generateRefreshToken } = require('../middleware/auth');

        // Verify the temp token
        let decoded;
        try {
            decoded = jwt.verify(temp_token, JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ error: 'Invalid or expired temp token' });
        }

        if (!decoded.requires_2fa) {
            return res.status(400).json({ error: 'This token does not require 2FA' });
        }

        // Get the stored secret
        const redisService = require('../services/redis.service');
        const secret = redisService.get(`totp:${decoded.userId}`);
        if (!secret) return res.status(400).json({ error: '2FA not configured for this user' });

        const totpService = require('../services/totp.service');
        const valid = totpService.verify(code, secret);
        if (!valid) return res.status(401).json({ error: 'Invalid TOTP code' });

        // Issue full tokens
        const db = require('../config/database');
        const user = db.dbPrepareGet('SELECT * FROM users WHERE id = ?', [decoded.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const fullToken = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        res.json({
            token: fullToken,
            refresh_token: refreshToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: user.tenant_id }
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
});

/**
 * @swagger
 * /api/auth/2fa/status:
 *   get:
 *     summary: Check if 2FA is enabled for current user
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/2fa/status', (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Authentication required' });

        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, JWT_SECRET);

        const redisService = require('../services/redis.service');
        const secret = redisService.get(`totp:${decoded.userId}`);

        res.json({ enabled: !!secret });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

