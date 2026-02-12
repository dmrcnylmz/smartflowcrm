const { dbPrepareGet, dbPrepareAll } = require('../config/database');

class RecordingService {
    getRecording(tenantId, callId) {
        const call = dbPrepareGet(
            'SELECT id, recording_url, duration, started_at, ended_at FROM calls WHERE id = ? AND tenant_id = ?',
            [callId, tenantId]
        );

        if (!call) throw { status: 404, message: 'Recording not found' };

        return {
            call_id: call.id,
            recording_url: call.recording_url,
            duration: call.duration,
            format: 'wav',
            sample_rate: 44100,
            channels: 2,
            file_size: call.duration * 88200,
            started_at: call.started_at,
            ended_at: call.ended_at,
            storage_provider: 'mock-s3',
            bucket: `recordings-${tenantId}`
        };
    }

    listRecordings(tenantId, filters = {}) {
        let sql = `SELECT id as call_id, recording_url, duration, started_at, ended_at
               FROM calls WHERE tenant_id = ? AND recording_url IS NOT NULL`;
        const params = [tenantId];

        if (filters.from) { sql += ' AND started_at >= ?'; params.push(filters.from); }
        if (filters.to) { sql += ' AND started_at <= ?'; params.push(filters.to); }

        sql += ' ORDER BY started_at DESC';
        if (filters.limit) { sql += ' LIMIT ?'; params.push(parseInt(filters.limit)); }

        return dbPrepareAll(sql, params);
    }

    getStorageStats(tenantId) {
        const stats = dbPrepareGet(`
      SELECT 
        COUNT(*) as total_recordings,
        COALESCE(SUM(duration), 0) as total_duration_seconds,
        COALESCE(AVG(duration), 0) as avg_duration_seconds,
        COALESCE(SUM(duration * 88200), 0) as total_storage_bytes
      FROM calls
      WHERE tenant_id = ? AND recording_url IS NOT NULL
    `, [tenantId]);

        return {
            ...stats,
            total_storage_human: formatBytes(stats.total_storage_bytes || 0),
            avg_duration_human: formatDuration(stats.avg_duration_seconds || 0)
        };
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
}

module.exports = new RecordingService();
