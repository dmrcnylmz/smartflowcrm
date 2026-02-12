/**
 * Auth Middleware — Phase 12 Enterprise Security (v2)
 * 
 * JWT access + refresh tokens, key rotation support.
 * Access token TTL: 1h. Refresh token TTL: 7d.
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'call-center-platform-secret-key-2026';
const JWT_EXPIRES_IN = '1h';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

function generateToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            tenantId: user.tenant_id,
            role: user.role,
            email: user.email
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

function generateRefreshToken(user) {
    const { dbRun } = require('../config/database');
    const { v4: uuid } = require('uuid');

    const token = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString();

    dbRun(
        'INSERT INTO refresh_tokens (id, user_id, tenant_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
        [uuid(), user.id, user.tenant_id, tokenHash, expiresAt]
    );

    return token;
}

function verifyRefreshToken(token) {
    const { dbPrepareGet, dbRun } = require('../config/database');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const stored = dbPrepareGet(
        'SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > ?',
        [tokenHash, new Date().toISOString()]
    );

    if (!stored) return null;

    // Get the user
    const user = dbPrepareGet(
        'SELECT * FROM users WHERE id = ? AND tenant_id = ?',
        [stored.user_id, stored.tenant_id]
    );

    if (!user) return null;

    // Rotate: delete old, issue new
    dbRun('DELETE FROM refresh_tokens WHERE token_hash = ?', [tokenHash]);

    return user;
}

function revokeRefreshTokens(userId) {
    const { dbRun } = require('../config/database');
    dbRun('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
}

function cleanupExpiredTokens() {
    try {
        const { dbRun } = require('../config/database');
        dbRun('DELETE FROM refresh_tokens WHERE expires_at < ?', [new Date().toISOString()]);
    } catch (e) { /* ignore during startup */ }
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        req.tenantId = decoded.tenantId;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = {
    generateToken,
    generateRefreshToken,
    verifyRefreshToken,
    revokeRefreshTokens,
    cleanupExpiredTokens,
    authMiddleware,
    requireRole,
    JWT_SECRET
};
