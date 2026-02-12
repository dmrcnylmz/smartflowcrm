/**
 * Audit Service — Security Hardening
 * 
 * Records admin actions, config changes, and auth events
 * to a persistent audit log for compliance and forensics.
 * 
 * Listens to event bus for automatic capture.
 */
const { dbRun, dbPrepareGet, dbPrepareAll } = require('../config/database');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');
const eventBus = require('./event-bus');

const logger = rootLogger.child({ component: 'audit' });

class AuditService {
    constructor() {
        this._initialized = false;
    }

    /**
     * Initialize audit service and subscribe to events.
     */
    init() {
        this._setupEventListeners();
        this._initialized = true;
        logger.info('Audit service initialized');
        return this;
    }

    /**
     * Record an audit entry.
     * @param {object} entry
     * @param {string} entry.action - Action type (e.g., 'config.update', 'auth.login')
     * @param {string} entry.actor  - Who performed the action (userId or 'system')
     * @param {string} [entry.tenantId] - Tenant context
     * @param {string} [entry.resource] - Resource affected
     * @param {object} [entry.detail] - Additional metadata
     * @param {string} [entry.ip] - Client IP address
     */
    log(entry) {
        try {
            dbRun(
                `INSERT INTO audit_log (id, action, actor, tenant_id, resource, detail, ip, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                [
                    require('uuid').v4(),
                    entry.action,
                    entry.actor || 'system',
                    entry.tenantId || null,
                    entry.resource || null,
                    entry.detail ? JSON.stringify(entry.detail) : null,
                    entry.ip || null
                ]
            );
            metrics.inc('audit_entries', { action: entry.action });
        } catch (err) {
            // Audit logging failures must not crash the application
            logger.error('Failed to write audit log', { error: err.message, entry });
        }
    }

    /**
     * Query audit log.
     * @param {object} filters - { tenantId, action, actor, limit, offset }
     * @returns {Array}
     */
    query(filters = {}) {
        let sql = 'SELECT * FROM audit_log WHERE 1=1';
        const params = [];

        if (filters.tenantId) { sql += ' AND tenant_id = ?'; params.push(filters.tenantId); }
        if (filters.action) { sql += ' AND action = ?'; params.push(filters.action); }
        if (filters.actor) { sql += ' AND actor = ?'; params.push(filters.actor); }
        if (filters.since) { sql += ' AND created_at >= ?'; params.push(filters.since); }

        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(filters.limit || 100, filters.offset || 0);

        try {
            return dbPrepareAll(sql, params);
        } catch (err) {
            logger.error('Audit query failed', { error: err.message });
            return [];
        }
    }

    /**
     * Get audit summary counts by action type.
     * @param {string} [tenantId]
     * @param {number} [days=30]
     */
    getSummary(tenantId, days = 30) {
        try {
            let sql = `SELECT action, COUNT(*) as count 
                       FROM audit_log 
                       WHERE created_at >= datetime('now', '-${days} days')`;
            const params = [];
            if (tenantId) { sql += ' AND tenant_id = ?'; params.push(tenantId); }
            sql += ' GROUP BY action ORDER BY count DESC';
            return dbPrepareAll(sql, params);
        } catch (err) {
            return [];
        }
    }

    /**
     * Subscribe to events for automatic audit capture.
     */
    _setupEventListeners() {
        eventBus.on('config.changed', (data) => {
            this.log({
                action: 'config.update',
                actor: data.actor || 'system',
                tenantId: data.tenantId,
                resource: data.resource,
                detail: data
            });
        });

        eventBus.on('auth.event', (data) => {
            this.log({
                action: `auth.${data.action}`,
                actor: data.userId || 'unknown',
                tenantId: data.tenantId,
                ip: data.ip,
                detail: data
            });
        });

        eventBus.on('ai.handoff', (data) => {
            this.log({
                action: 'call.handoff',
                actor: 'ai',
                tenantId: data.tenantId,
                resource: data.callId,
                detail: { agentId: data.agentId, reason: data.reason }
            });
        });

        eventBus.on('circuit.opened', (data) => {
            this.log({
                action: 'circuit.opened',
                actor: 'system',
                detail: data
            });
        });
    }
}

module.exports = new AuditService();
