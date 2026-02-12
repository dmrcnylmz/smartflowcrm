/**
 * Tenant isolation middleware
 * Ensures all database queries are scoped to the authenticated tenant
 */
function tenantMiddleware(req, res, next) {
    // Tenant ID comes from JWT token (set by auth middleware)
    if (!req.tenantId) {
        return res.status(400).json({ error: 'Tenant context required' });
    }

    // Prevent tenant ID override via request params/body
    if (req.params.tenantId && req.params.tenantId !== req.tenantId) {
        return res.status(403).json({ error: 'Cross-tenant access denied' });
    }

    if (req.body && req.body.tenant_id && req.body.tenant_id !== req.tenantId) {
        return res.status(403).json({ error: 'Cross-tenant access denied' });
    }

    // Enforce tenant_id in body for write operations
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        req.body.tenant_id = req.tenantId;
    }

    next();
}

module.exports = { tenantMiddleware };
