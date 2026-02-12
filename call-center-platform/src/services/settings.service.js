/**
 * Settings Service — Tenant AI Persona Configuration
 */
const { dbPrepareGet, dbRun } = require('../config/database');

class SettingsService {
    getSettings(tenantId) {
        const settings = dbPrepareGet('SELECT * FROM tenant_settings WHERE tenant_id = ?', [tenantId]);
        if (settings) return settings;

        // Return defaults if none configured
        const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        return {
            tenant_id: tenantId,
            company_name: tenant?.name || tenantId,
            tone: 'friendly',
            language: 'en',
            forbidden_topics: '',
            escalation_rules: 'If unsure or customer insists, escalate to supervisor.'
        };
    }

    updateSettings(tenantId, data) {
        const existing = dbPrepareGet('SELECT * FROM tenant_settings WHERE tenant_id = ?', [tenantId]);

        if (existing) {
            const fields = [];
            const params = [];

            if (data.company_name !== undefined) { fields.push('company_name = ?'); params.push(data.company_name); }
            if (data.tone !== undefined) { fields.push('tone = ?'); params.push(data.tone); }
            if (data.language !== undefined) { fields.push('language = ?'); params.push(data.language); }
            if (data.forbidden_topics !== undefined) { fields.push('forbidden_topics = ?'); params.push(data.forbidden_topics); }
            if (data.escalation_rules !== undefined) { fields.push('escalation_rules = ?'); params.push(data.escalation_rules); }
            fields.push('updated_at = CURRENT_TIMESTAMP');

            params.push(tenantId);
            dbRun(`UPDATE tenant_settings SET ${fields.join(', ')} WHERE tenant_id = ?`, params);
        } else {
            const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            dbRun(
                `INSERT INTO tenant_settings (tenant_id, company_name, tone, language, forbidden_topics, escalation_rules)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    tenantId,
                    data.company_name || tenant?.name || tenantId,
                    data.tone || 'friendly',
                    data.language || 'en',
                    data.forbidden_topics || '',
                    data.escalation_rules || 'If unsure or customer insists, escalate to supervisor.'
                ]
            );
        }

        return this.getSettings(tenantId);
    }
}

module.exports = new SettingsService();
