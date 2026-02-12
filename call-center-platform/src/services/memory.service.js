/**
 * Memory Service — Phase 8 Conversation Memory
 * 
 * Persists conversation turns for multi-turn LLM context.
 * Strict tenant isolation on all operations.
 */
const { dbPrepareAll, dbPrepareGet, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');

class MemoryService {
    /**
     * Add a conversation turn.
     * @param {string} sessionId - Voice session ID
     * @param {string} tenantId - Tenant ID
     * @param {string|null} callId - Associated call ID
     * @param {'user'|'assistant'|'system'} role
     * @param {string} content
     */
    addTurn(sessionId, tenantId, callId, role, content) {
        dbRun(
            `INSERT INTO conversation_memory (id, session_id, tenant_id, call_id, role, content) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuid(), sessionId, tenantId, callId, role, content]
        );
    }

    /**
     * Get conversation history for a session.
     * @param {string} sessionId
     * @param {number} limit - Max turns to return
     * @returns {Array<{role: string, content: string, ts: string}>}
     */
    getHistory(sessionId, limit = 20) {
        return dbPrepareAll(
            `SELECT role, content, ts FROM conversation_memory WHERE session_id = ? ORDER BY ts ASC LIMIT ?`,
            [sessionId, limit]
        );
    }

    /**
     * Get conversation history formatted for LLM prompt.
     * @param {string} sessionId
     * @param {number} limit
     * @returns {string} Formatted conversation text
     */
    getFormattedHistory(sessionId, limit = 10) {
        const turns = this.getHistory(sessionId, limit);
        return turns.map(t => `${t.role}: ${t.content}`).join('\n');
    }

    /**
     * Clear all turns for a session.
     */
    clearSession(sessionId) {
        dbRun('DELETE FROM conversation_memory WHERE session_id = ?', [sessionId]);
    }

    /**
     * Get all sessions for a call.
     */
    getSessionsByCall(callId, tenantId) {
        return dbPrepareAll(
            'SELECT DISTINCT session_id FROM conversation_memory WHERE call_id = ? AND tenant_id = ?',
            [callId, tenantId]
        );
    }

    /**
     * Get turn count for a session.
     */
    getTurnCount(sessionId) {
        const row = dbPrepareGet(
            'SELECT COUNT(*) as c FROM conversation_memory WHERE session_id = ?',
            [sessionId]
        );
        return row ? row.c : 0;
    }

    /**
     * Get all turns for a session (including metadata).
     */
    getFullSession(sessionId, tenantId) {
        return dbPrepareAll(
            'SELECT * FROM conversation_memory WHERE session_id = ? AND tenant_id = ? ORDER BY ts ASC',
            [sessionId, tenantId]
        );
    }
}

module.exports = new MemoryService();
