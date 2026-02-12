const { tenantQuery, dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');

class TenantService {
    getTenant(tenantId) {
        return dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    }

    listTenants() {
        return dbPrepareAll('SELECT * FROM tenants ORDER BY created_at DESC');
    }

    createTenant(data) {
        const id = data.id || uuid();
        dbRun(
            'INSERT INTO tenants (id, name, industry, timezone, language, business_hours_start, business_hours_end, business_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, data.name, data.industry, data.timezone || 'UTC', data.language || 'en',
                data.business_hours_start || '09:00', data.business_hours_end || '18:00',
                data.business_days || 'Mon,Tue,Wed,Thu,Fri']
        );
        return this.getTenant(id);
    }

    getAgents(tenantId) {
        return tenantQuery('users', tenantId, {}, { orderBy: 'name' });
    }

    getAgent(tenantId, agentId) {
        return dbPrepareGet('SELECT * FROM users WHERE id = ? AND tenant_id = ?', [agentId, tenantId]);
    }

    getQueues(tenantId) {
        return tenantQuery('queues', tenantId, {}, { orderBy: 'priority DESC' });
    }

    getQueue(tenantId, queueId) {
        return dbPrepareGet('SELECT * FROM queues WHERE id = ? AND tenant_id = ?', [queueId, tenantId]);
    }

    getPhoneNumbers(tenantId) {
        return dbPrepareAll(
            `SELECT pn.*, q.name as queue_name 
       FROM phone_numbers pn 
       LEFT JOIN queues q ON pn.queue_id = q.id
       WHERE pn.tenant_id = ?
       ORDER BY pn.number`,
            [tenantId]
        );
    }

    updateAgentStatus(tenantId, agentId, status) {
        dbRun('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
            [status, agentId, tenantId]);
        return this.getAgent(tenantId, agentId);
    }
}

module.exports = new TenantService();
