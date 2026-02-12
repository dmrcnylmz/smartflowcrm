const { dbPrepareGet, dbRun } = require('../config/database');
const { generateTranscript } = require('../utils/transcript');
const { analyzeSentiment } = require('../utils/sentiment');

class TranscriptionService {
    getTranscription(tenantId, callId) {
        const call = dbPrepareGet(
            'SELECT id, transcript_text, sentiment_score, duration, started_at FROM calls WHERE id = ? AND tenant_id = ?',
            [callId, tenantId]
        );

        if (!call) throw { status: 404, message: 'Transcription not found' };

        return {
            call_id: call.id,
            transcript: call.transcript_text,
            sentiment_score: call.sentiment_score,
            sentiment_label: this._getSentimentLabel(call.sentiment_score),
            duration: call.duration,
            word_count: call.transcript_text ? call.transcript_text.split(/\s+/).length : 0,
            language: 'tr',
            engine: 'mock-whisper-v3',
            started_at: call.started_at
        };
    }

    regenerateTranscript(tenantId, callId) {
        const call = dbPrepareGet(`
      SELECT c.*, u.name as agent_name, q.name as queue_name, t.name as tenant_name
      FROM calls c
      LEFT JOIN users u ON c.agent_id = u.id
      LEFT JOIN queues q ON c.queue_id = q.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = ? AND c.tenant_id = ?
    `, [callId, tenantId]);

        if (!call) throw { status: 404, message: 'Call not found' };

        const newTranscript = generateTranscript(call.call_type, call.queue_name, call.agent_name, call.tenant_name);
        const newSentiment = analyzeSentiment(newTranscript);

        dbRun('UPDATE calls SET transcript_text = ?, sentiment_score = ? WHERE id = ? AND tenant_id = ?',
            [newTranscript, newSentiment, callId, tenantId]);

        return this.getTranscription(tenantId, callId);
    }

    _getSentimentLabel(score) {
        if (score >= 0.3) return 'positive';
        if (score >= -0.3) return 'neutral';
        return 'negative';
    }
}

module.exports = new TranscriptionService();
