/**
 * Handoff Service — Phase 9 Human Handoff
 * 
 * Evaluates when AI should transfer to a human agent.
 * Manages the handoff queue with assignment and resolution.
 */
const { dbPrepareAll, dbPrepareGet, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'handoff' });

class HandoffService {
    /**
     * Evaluate if a handoff should be triggered.
     * @param {string} transcript - Current user message
     * @param {string} intent - Detected intent
     * @param {number} confidence - Confidence score (0-1)
     * @param {object} tenantSettings - Tenant settings with thresholds
     * @returns {{ shouldHandoff: boolean, reason: string|null }}
     */
    evaluateHandoff(transcript, intent, confidence, tenantSettings = {}) {
        const threshold = tenantSettings.handoff_threshold || 0.3;
        const forbidden = (tenantSettings.forbidden_topics || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const lowerTranscript = transcript.toLowerCase();

        // Check explicit human request
        if (intent === 'human') {
            return { shouldHandoff: true, reason: 'Customer explicitly requested human agent' };
        }

        // Check forbidden topics
        for (const topic of forbidden) {
            if (topic && lowerTranscript.includes(topic)) {
                return { shouldHandoff: true, reason: `Forbidden topic detected: ${topic}` };
            }
        }

        // Check confidence threshold
        if (confidence < threshold) {
            return { shouldHandoff: true, reason: `Low confidence (${confidence.toFixed(2)} < ${threshold})` };
        }

        // Check anger/frustration keywords
        const angerKeywords = ['manager', 'supervisor', 'lawyer', 'legal', 'sue', 'report you', 'unacceptable', 'ridiculous'];
        for (const keyword of angerKeywords) {
            if (lowerTranscript.includes(keyword)) {
                return { shouldHandoff: true, reason: `Escalation keyword detected: "${keyword}"` };
            }
        }

        return { shouldHandoff: false, reason: null };
    }

    /**
     * Create a handoff request.
     */
    createHandoff(callId, tenantId, sessionId, reason, priority = 0) {
        const id = uuid();
        dbRun(
            `INSERT INTO handoff_queue (id, call_id, tenant_id, session_id, reason, priority, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [id, callId, tenantId, sessionId, reason, priority]
        );

        metrics.inc('handoffs_total', { tenant_id: tenantId });
        logger.info('Handoff created', { handoffId: id, callId, tenantId, reason });
        return id;
    }

    /**
     * Assign an agent to a handoff.
     */
    assignAgent(handoffId, agentId, tenantId) {
        const handoff = dbPrepareGet(
            'SELECT * FROM handoff_queue WHERE id = ? AND tenant_id = ?',
            [handoffId, tenantId]
        );
        if (!handoff) return null;

        dbRun(
            `UPDATE handoff_queue SET assigned_agent_id = ?, status = 'assigned' WHERE id = ? AND tenant_id = ?`,
            [agentId, handoffId, tenantId]
        );

        logger.info('Handoff assigned', { handoffId, agentId, tenantId });
        return { ...handoff, assigned_agent_id: agentId, status: 'assigned' };
    }

    /**
     * Mark a handoff as resolved.
     */
    resolveHandoff(handoffId, tenantId) {
        dbRun(
            `UPDATE handoff_queue SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`,
            [handoffId, tenantId]
        );
        logger.info('Handoff resolved', { handoffId, tenantId });
    }

    /**
     * Get pending handoffs for a tenant.
     */
    getPendingHandoffs(tenantId) {
        return dbPrepareAll(
            `SELECT h.*, u.name as agent_name 
             FROM handoff_queue h 
             LEFT JOIN users u ON h.assigned_agent_id = u.id 
             WHERE h.tenant_id = ? AND h.status IN ('pending', 'assigned', 'active')
             ORDER BY h.priority DESC, h.created_at ASC`,
            [tenantId]
        );
    }

    /**
     * Get all handoffs for a tenant (including resolved).
     */
    getAllHandoffs(tenantId, limit = 50) {
        return dbPrepareAll(
            `SELECT h.*, u.name as agent_name 
             FROM handoff_queue h 
             LEFT JOIN users u ON h.assigned_agent_id = u.id 
             WHERE h.tenant_id = ?
             ORDER BY h.created_at DESC
             LIMIT ?`,
            [tenantId, limit]
        );
    }

    /**
     * Get handoff by ID with tenant check.
     */
    getHandoff(handoffId, tenantId) {
        return dbPrepareGet(
            'SELECT * FROM handoff_queue WHERE id = ? AND tenant_id = ?',
            [handoffId, tenantId]
        );
    }

    /**
     * Get handoff stats for a tenant.
     */
    getStats(tenantId) {
        const pending = dbPrepareGet(
            `SELECT COUNT(*) as c FROM handoff_queue WHERE tenant_id = ? AND status = 'pending'`,
            [tenantId]
        )?.c || 0;

        const active = dbPrepareGet(
            `SELECT COUNT(*) as c FROM handoff_queue WHERE tenant_id = ? AND status IN ('assigned', 'active')`,
            [tenantId]
        )?.c || 0;

        const resolved = dbPrepareGet(
            `SELECT COUNT(*) as c FROM handoff_queue WHERE tenant_id = ? AND status = 'resolved'`,
            [tenantId]
        )?.c || 0;

        return { pending, active, resolved, total: pending + active + resolved };
    }
}

module.exports = new HandoffService();
