/**
 * Branding Service — White Label Support
 */
const { dbPrepareGet, dbRun } = require('../config/database');

class BrandingService {
    getBranding(tenantId) {
        const branding = dbPrepareGet('SELECT * FROM tenant_branding WHERE tenant_id = ?', [tenantId]);
        if (branding) return branding;

        // Return defaults
        const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
        return {
            tenant_id: tenantId,
            logo_url: null,
            primary_color: '#7c5cfc',
            secondary_color: '#00d4aa',
            company_name: tenant?.name || tenantId
        };
    }

    updateBranding(tenantId, data) {
        const existing = dbPrepareGet('SELECT * FROM tenant_branding WHERE tenant_id = ?', [tenantId]);

        if (existing) {
            const fields = [];
            const params = [];

            if (data.logo_url !== undefined) { fields.push('logo_url = ?'); params.push(data.logo_url); }
            if (data.primary_color !== undefined) { fields.push('primary_color = ?'); params.push(data.primary_color); }
            if (data.secondary_color !== undefined) { fields.push('secondary_color = ?'); params.push(data.secondary_color); }
            if (data.company_name !== undefined) { fields.push('company_name = ?'); params.push(data.company_name); }
            fields.push('updated_at = CURRENT_TIMESTAMP');

            params.push(tenantId);
            dbRun(`UPDATE tenant_branding SET ${fields.join(', ')} WHERE tenant_id = ?`, params);
        } else {
            const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            dbRun(
                `INSERT INTO tenant_branding (tenant_id, logo_url, primary_color, secondary_color, company_name)
         VALUES (?, ?, ?, ?, ?)`,
                [
                    tenantId,
                    data.logo_url || null,
                    data.primary_color || '#7c5cfc',
                    data.secondary_color || '#00d4aa',
                    data.company_name || tenant?.name || tenantId
                ]
            );
        }

        return this.getBranding(tenantId);
    }
}

module.exports = new BrandingService();
