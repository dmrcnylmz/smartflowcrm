const { dbPrepareGet, dbPrepareAll } = require('../config/database');

class AnalyticsService {
    getDashboard(tenantId) {
        return {
            overview: this._getOverview(tenantId),
            average_handle_time: this._getAHT(tenantId),
            abandon_rate: this._getAbandonRate(tenantId),
            first_call_resolution: this._getFCR(tenantId),
            agent_utilization: this._getAgentUtilization(tenantId),
            call_volume_by_queue: this._getCallVolumeByQueue(tenantId),
            sentiment_distribution: this._getSentimentDistribution(tenantId),
            hourly_distribution: this._getHourlyDistribution(tenantId),
            resolution_breakdown: this._getResolutionBreakdown(tenantId)
        };
    }

    getAgentMetrics(tenantId, agentId) {
        const agent = dbPrepareGet('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [agentId, tenantId]);
        if (!agent) throw { status: 404, message: 'Agent not found' };

        const calls = dbPrepareAll('SELECT * FROM calls WHERE agent_id = ? AND tenant_id = ?', [agentId, tenantId]);
        const completed = calls.filter(c => c.status === 'completed');
        const totalDuration = completed.reduce((sum, c) => sum + c.duration, 0);

        return {
            agent: { id: agent.id, name: agent.name, role: agent.role, level: agent.level, status: agent.status },
            total_calls: calls.length,
            completed_calls: completed.length,
            average_handle_time: completed.length ? Math.round(totalDuration / completed.length) : 0,
            total_talk_time: totalDuration,
            first_call_resolution_rate: this._computeRate(
                completed.filter(c => c.resolution_status === 'resolved').length,
                completed.length
            ),
            avg_sentiment: completed.length
                ? parseFloat((completed.reduce((sum, c) => sum + (c.sentiment_score || 0), 0) / completed.length).toFixed(2))
                : 0,
            calls_by_type: {
                inbound: calls.filter(c => c.call_type === 'inbound').length,
                outbound: calls.filter(c => c.call_type === 'outbound').length
            }
        };
    }

    getQueueMetrics(tenantId) {
        const queues = dbPrepareAll('SELECT * FROM queues WHERE tenant_id = ?', [tenantId]);

        return queues.map(queue => {
            const calls = dbPrepareAll(
                'SELECT * FROM calls WHERE queue_id = ? AND tenant_id = ?',
                [queue.id, tenantId]
            );

            const completed = calls.filter(c => c.status === 'completed');
            const abandoned = calls.filter(c => c.status === 'abandoned');
            const totalDuration = completed.reduce((sum, c) => sum + c.duration, 0);

            return {
                queue: { id: queue.id, name: queue.name },
                total_calls: calls.length,
                completed: completed.length,
                abandoned: abandoned.length,
                abandon_rate: this._computeRate(abandoned.length, calls.length),
                average_handle_time: completed.length ? Math.round(totalDuration / completed.length) : 0,
                avg_sentiment: completed.length
                    ? parseFloat((completed.reduce((s, c) => s + (c.sentiment_score || 0), 0) / completed.length).toFixed(2))
                    : 0
            };
        });
    }

    _getOverview(tenantId) {
        return dbPrepareGet(`
      SELECT
        COUNT(*) as total_calls,
        SUM(CASE WHEN call_type = 'inbound' THEN 1 ELSE 0 END) as inbound_calls,
        SUM(CASE WHEN call_type = 'outbound' THEN 1 ELSE 0 END) as outbound_calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        COALESCE(SUM(duration), 0) as total_talk_time,
        ROUND(AVG(duration)) as avg_duration,
        ROUND(AVG(sentiment_score), 2) as avg_sentiment
      FROM calls WHERE tenant_id = ?
    `, [tenantId]);
    }

    _getAHT(tenantId) {
        const result = dbPrepareGet(`
      SELECT ROUND(AVG(duration)) as aht_seconds
      FROM calls WHERE tenant_id = ? AND status = 'completed'
    `, [tenantId]);
        const aht = result?.aht_seconds || 0;
        return { seconds: aht, formatted: `${Math.floor(aht / 60)}m ${aht % 60}s` };
    }

    _getAbandonRate(tenantId) {
        const total = dbPrepareGet(
            "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ? AND call_type = 'inbound'", [tenantId]
        ).c;
        const abandoned = dbPrepareGet(
            "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ? AND status = 'abandoned'", [tenantId]
        ).c;
        return { total_inbound: total, abandoned, rate: this._computeRate(abandoned, total) };
    }

    _getFCR(tenantId) {
        const completed = dbPrepareGet(
            "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ? AND status = 'completed'", [tenantId]
        ).c;
        const resolved = dbPrepareGet(
            "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ? AND resolution_status = 'resolved'", [tenantId]
        ).c;
        return { total_completed: completed, resolved_first_call: resolved, rate: this._computeRate(resolved, completed) };
    }

    _getAgentUtilization(tenantId) {
        const agents = dbPrepareAll(
            "SELECT * FROM users WHERE tenant_id = ? AND role IN ('agent', 'supervisor')", [tenantId]
        );
        const businessHoursPerDay = 9 * 3600;

        return agents.map(agent => {
            const totalTalkTime = dbPrepareGet(
                "SELECT COALESCE(SUM(duration), 0) as total FROM calls WHERE agent_id = ? AND tenant_id = ? AND status = 'completed'",
                [agent.id, tenantId]
            ).total;

            const callDays = dbPrepareGet(
                'SELECT COUNT(DISTINCT DATE(started_at)) as days FROM calls WHERE agent_id = ? AND tenant_id = ?',
                [agent.id, tenantId]
            ).days || 1;

            const availableTime = callDays * businessHoursPerDay;
            const utilization = availableTime > 0 ? parseFloat(((totalTalkTime / availableTime) * 100).toFixed(1)) : 0;

            return {
                agent_id: agent.id,
                agent_name: agent.name,
                total_talk_time: totalTalkTime,
                available_time: availableTime,
                utilization_percent: Math.min(utilization, 100),
                call_count: dbPrepareGet(
                    'SELECT COUNT(*) as c FROM calls WHERE agent_id = ? AND tenant_id = ?', [agent.id, tenantId]
                ).c
            };
        });
    }

    _getCallVolumeByQueue(tenantId) {
        return dbPrepareAll(`
      SELECT q.name as queue_name, q.id as queue_id,
        COUNT(c.id) as total_calls,
        SUM(CASE WHEN c.call_type = 'inbound' THEN 1 ELSE 0 END) as inbound,
        SUM(CASE WHEN c.call_type = 'outbound' THEN 1 ELSE 0 END) as outbound
      FROM queues q
      LEFT JOIN calls c ON c.queue_id = q.id AND c.tenant_id = q.tenant_id
      WHERE q.tenant_id = ?
      GROUP BY q.id, q.name
      ORDER BY total_calls DESC
    `, [tenantId]);
    }

    _getSentimentDistribution(tenantId) {
        return dbPrepareGet(`
      SELECT
        SUM(CASE WHEN sentiment_score >= 0.3 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN sentiment_score >= -0.3 AND sentiment_score < 0.3 THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN sentiment_score < -0.3 THEN 1 ELSE 0 END) as negative
      FROM calls WHERE tenant_id = ?
    `, [tenantId]);
    }

    _getHourlyDistribution(tenantId) {
        return dbPrepareAll(`
      SELECT 
        CAST(strftime('%H', started_at) AS INTEGER) as hour,
        COUNT(*) as call_count
      FROM calls WHERE tenant_id = ?
      GROUP BY hour
      ORDER BY hour
    `, [tenantId]);
    }

    _getResolutionBreakdown(tenantId) {
        return dbPrepareAll(`
      SELECT resolution_status, COUNT(*) as count
      FROM calls WHERE tenant_id = ? AND resolution_status IS NOT NULL
      GROUP BY resolution_status
      ORDER BY count DESC
    `, [tenantId]);
    }

    _computeRate(part, total) {
        if (!total) return 0;
        return parseFloat(((part / total) * 100).toFixed(1));
    }
}

module.exports = new AnalyticsService();
