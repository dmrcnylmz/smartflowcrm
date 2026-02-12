/**
 * Correlation ID Middleware — Distributed Tracing
 * 
 * Generates or propagates a unique correlation ID per request.
 * Injected into structured logger and response headers.
 * 
 * Usage:
 *   - HTTP: X-Correlation-Id header
 *   - WebSocket: Passed via session context
 *   - Logs: Automatically attached via logger.child()
 */
const crypto = require('crypto');
const { logger: rootLogger } = require('../utils/logger');

/**
 * Generate a short correlation ID.
 * Format: timestamp-random (compact, sortable)
 */
function generateCorrelationId() {
    const ts = Date.now().toString(36);
    const rand = crypto.randomBytes(4).toString('hex');
    return `${ts}-${rand}`;
}

/**
 * Express middleware to inject correlation ID.
 */
function correlationMiddleware(req, res, next) {
    const correlationId = req.headers['x-correlation-id'] || generateCorrelationId();

    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);

    // Create a child logger with correlation context
    req.log = rootLogger.child({
        correlationId,
        method: req.method,
        path: req.path
    });

    next();
}

/**
 * Generate correlation ID for WebSocket sessions.
 * @param {string} [callId] - Optional call-specific ID
 * @returns {string}
 */
function wsCorrelationId(callId) {
    const base = generateCorrelationId();
    return callId ? `${base}:${callId}` : base;
}

module.exports = {
    correlationMiddleware,
    generateCorrelationId,
    wsCorrelationId
};
