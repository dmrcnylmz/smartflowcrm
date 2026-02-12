/**
 * Compliance Routes — Phase 18 Compliance & Privacy
 * 
 * GDPR-compliant data management endpoints.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { dbRun, dbPrepareGet, dbPrepareAll } = require('../config/database');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('../services/metrics.service');

const logger = rootLogger.child({ component: 'compliance' });

/**
 * @swagger
 * /api/compliance/delete-data/{tenantId}:
 *   delete:
 *     summary: GDPR right-to-erasure — delete all PII for a tenant
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: tenantId
 *         in: path
 *         required: true
 */
router.delete('/delete-data/:tenantId', authenticateToken, (req, res) => {
    const { tenantId } = req.params;

    // Only admins can delete data
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required for data deletion' });
    }

    // Verify tenant access
    if (req.user.tenantId !== tenantId) {
        return res.status(403).json({ error: 'Cannot delete data for another tenant' });
    }

    const deletionLog = [];

    try {
        // Delete conversation memory
        const memoryCount = dbPrepareGet(
            'SELECT COUNT(*) as c FROM conversation_memory WHERE tenant_id = ?', [tenantId]
        );
        dbRun('DELETE FROM conversation_memory WHERE tenant_id = ?', [tenantId]);
        deletionLog.push({ table: 'conversation_memory', deleted: memoryCount?.c || 0 });

        // Delete conversation embeddings
        try {
            const embeddingCount = dbPrepareGet(
                'SELECT COUNT(*) as c FROM conversation_embeddings WHERE tenant_id = ?', [tenantId]
            );
            dbRun('DELETE FROM conversation_embeddings WHERE tenant_id = ?', [tenantId]);
            deletionLog.push({ table: 'conversation_embeddings', deleted: embeddingCount?.c || 0 });
        } catch (e) { /* table may not exist */ }

        // Redact call transcripts (anonymize, don't delete)
        dbRun(
            `UPDATE calls SET 
                transcript_text = '[REDACTED]',
                caller_number = '[REDACTED]',
                callee_number = '[REDACTED]',
                call_summary = '[REDACTED]',
                ai_summary = '[REDACTED]'
             WHERE tenant_id = ?`,
            [tenantId]
        );
        const callCount = dbPrepareGet(
            'SELECT COUNT(*) as c FROM calls WHERE tenant_id = ?', [tenantId]
        );
        deletionLog.push({ table: 'calls', redacted: callCount?.c || 0 });

        // Delete handoff queue entries
        const handoffCount = dbPrepareGet(
            'SELECT COUNT(*) as c FROM handoff_queue WHERE tenant_id = ?', [tenantId]
        );
        dbRun('DELETE FROM handoff_queue WHERE tenant_id = ?', [tenantId]);
        deletionLog.push({ table: 'handoff_queue', deleted: handoffCount?.c || 0 });

        // Log the deletion
        logger.info('GDPR data deletion executed', { tenantId, deletionLog });
        metrics.inc('gdpr_deletions_total', { tenant: tenantId });

        res.json({
            success: true,
            tenantId,
            deletedAt: new Date().toISOString(),
            details: deletionLog
        });

    } catch (error) {
        logger.error('GDPR deletion failed', { tenantId, error: error.message });
        res.status(500).json({ error: 'Data deletion failed', details: error.message });
    }
});

/**
 * @swagger
 * /api/compliance/retention/{tenantId}:
 *   get:
 *     summary: Get data retention policy for a tenant
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 */
router.get('/retention/:tenantId', authenticateToken, (req, res) => {
    const { tenantId } = req.params;

    if (req.user.tenantId !== tenantId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        const settings = dbPrepareGet(
            'SELECT data_retention_days FROM tenant_settings WHERE tenant_id = ?',
            [tenantId]
        );

        res.json({
            tenantId,
            data_retention_days: settings?.data_retention_days || 365,
            policy: 'Data older than retention period is automatically purged'
        });
    } catch (e) {
        res.json({ tenantId, data_retention_days: 365, policy: 'default' });
    }
});

/**
 * @swagger
 * /api/compliance/budget/{tenantId}:
 *   get:
 *     summary: Get budget status for a tenant
 *     tags: [Compliance]
 *     security:
 *       - bearerAuth: []
 */
router.get('/budget/:tenantId', authenticateToken, (req, res) => {
    const { tenantId } = req.params;

    if (req.user.tenantId !== tenantId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }

    const costControl = require('../services/cost-control');
    res.json(costControl.getBudgetSummary(tenantId));
});

module.exports = router;
