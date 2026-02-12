const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { generateTranscript, generateCallSummary } = require('../utils/transcript');
const { analyzeSentiment } = require('../utils/sentiment');
const aiService = require('./ai.service');

class CallService {
  createInboundCall(tenantId, data) {
    const id = uuid();
    const startedAt = data.started_at || new Date().toISOString();

    const queueId = data.queue_id;
    const queue = dbPrepareGet('SELECT * FROM queues WHERE id = ? AND tenant_id = ?', [queueId, tenantId]);
    if (!queue) throw { status: 404, message: 'Queue not found' };

    let agentId = data.agent_id;
    if (!agentId) {
      const availableAgent = dbPrepareGet(
        `SELECT id FROM users WHERE tenant_id = ? AND status = 'available' AND role IN ('agent', 'supervisor') ORDER BY RANDOM() LIMIT 1`,
        [tenantId]
      );
      agentId = availableAgent?.id;
    }

    const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    const agent = agentId ? dbPrepareGet('SELECT name FROM users WHERE id = ?', [agentId]) : null;
    const transcript = generateTranscript('inbound', queue.name, agent?.name, tenant?.name);
    const sentiment = analyzeSentiment(transcript);
    const duration = data.duration || Math.floor(Math.random() * 600) + 60;
    const status = data.status || 'completed';
    const resolution = data.resolution_status || (['resolved', 'follow_up', 'escalated'])[Math.floor(Math.random() * 3)];
    const recordingUrl = `https://recordings.callcenter.io/${tenantId}/${id}.wav`;
    const summary = generateCallSummary(queue.name, resolution);
    const endedAt = data.ended_at || new Date(new Date(startedAt).getTime() + duration * 1000).toISOString();

    dbRun(
      `INSERT INTO calls (id, tenant_id, call_type, caller_number, callee_number, agent_id, queue_id,
        duration, status, recording_url, transcript_text, sentiment_score, resolution_status,
        ivr_selection, call_summary, started_at, ended_at)
      VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantId, data.caller_number, data.callee_number || null, agentId, queueId,
        duration, status, recordingUrl, transcript, sentiment, resolution,
        data.ivr_selection || queue.name, summary, startedAt, endedAt]
    );

    this._createCallLog(id, tenantId, 'call_initiated', startedAt);
    this._createCallLog(id, tenantId, 'ivr_completed', startedAt);
    this._createCallLog(id, tenantId, 'queue_entered', startedAt);
    if (agentId) this._createCallLog(id, tenantId, 'agent_connected', startedAt);
    this._createCallLog(id, tenantId, 'recording_started', startedAt);
    this._createCallLog(id, tenantId, 'call_completed', endedAt);

    // AI Enrichment — runs after call creation
    if (status === 'completed' && transcript) {
      aiService.enrichCall(id, tenantId);
    }

    return dbPrepareGet('SELECT * FROM calls WHERE id = ?', [id]);
  }

  createOutboundCall(tenantId, data) {
    const id = uuid();
    const startedAt = data.started_at || new Date().toISOString();

    const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    const agent = dbPrepareGet('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [data.agent_id, tenantId]);
    if (!agent) throw { status: 404, message: 'Agent not found' };

    const transcript = generateTranscript('outbound', null, agent.name, tenant?.name);
    const sentiment = analyzeSentiment(transcript);
    const duration = data.duration || Math.floor(Math.random() * 400) + 60;
    const status = data.status || 'completed';
    const resolution = data.resolution_status || 'resolved';
    const recordingUrl = `https://recordings.callcenter.io/${tenantId}/${id}.wav`;
    const summary = generateCallSummary('sales', resolution);
    const endedAt = data.ended_at || new Date(new Date(startedAt).getTime() + duration * 1000).toISOString();

    dbRun(
      `INSERT INTO calls (id, tenant_id, call_type, caller_number, callee_number, agent_id, queue_id,
        duration, status, recording_url, transcript_text, sentiment_score, resolution_status,
        call_summary, started_at, ended_at)
      VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, tenantId, data.caller_number || agent.name, data.callee_number,
        data.agent_id, data.queue_id || null,
        duration, status, recordingUrl, transcript, sentiment, resolution,
        summary, startedAt, endedAt]
    );

    this._createCallLog(id, tenantId, 'outbound_initiated', startedAt);
    this._createCallLog(id, tenantId, 'recording_started', startedAt);
    this._createCallLog(id, tenantId, 'call_completed', endedAt);

    // AI Enrichment — runs after call creation
    if (status === 'completed' && transcript) {
      aiService.enrichCall(id, tenantId);
    }

    return dbPrepareGet('SELECT * FROM calls WHERE id = ?', [id]);
  }

  getCalls(tenantId, filters = {}) {
    let sql = `SELECT c.*, u.name as agent_name, q.name as queue_name 
               FROM calls c 
               LEFT JOIN users u ON c.agent_id = u.id 
               LEFT JOIN queues q ON c.queue_id = q.id 
               WHERE c.tenant_id = ?`;
    const params = [tenantId];

    if (filters.call_type) { sql += ' AND c.call_type = ?'; params.push(filters.call_type); }
    if (filters.status) { sql += ' AND c.status = ?'; params.push(filters.status); }
    if (filters.agent_id) { sql += ' AND c.agent_id = ?'; params.push(filters.agent_id); }
    if (filters.queue_id) { sql += ' AND c.queue_id = ?'; params.push(filters.queue_id); }
    if (filters.intent) { sql += ' AND c.intent = ?'; params.push(filters.intent); }
    if (filters.from) { sql += ' AND c.started_at >= ?'; params.push(filters.from); }
    if (filters.to) { sql += ' AND c.started_at <= ?'; params.push(filters.to); }

    sql += ' ORDER BY c.started_at DESC';

    if (filters.limit) { sql += ' LIMIT ?'; params.push(parseInt(filters.limit)); }
    if (filters.offset) { sql += ' OFFSET ?'; params.push(parseInt(filters.offset)); }

    return dbPrepareAll(sql, params);
  }

  getCall(tenantId, callId) {
    return dbPrepareGet(
      `SELECT c.*, u.name as agent_name, q.name as queue_name
       FROM calls c
       LEFT JOIN users u ON c.agent_id = u.id
       LEFT JOIN queues q ON c.queue_id = q.id
       WHERE c.id = ? AND c.tenant_id = ?`,
      [callId, tenantId]
    );
  }

  getCallLogs(tenantId, callId) {
    return dbPrepareAll(
      'SELECT * FROM call_logs WHERE call_id = ? AND tenant_id = ? ORDER BY timestamp',
      [callId, tenantId]
    );
  }

  _createCallLog(callId, tenantId, eventType, timestamp) {
    dbRun(
      'INSERT INTO call_logs (id, call_id, tenant_id, event_type, timestamp) VALUES (?, ?, ?, ?, ?)',
      [uuid(), callId, tenantId, eventType, timestamp]
    );
  }
}

module.exports = new CallService();
