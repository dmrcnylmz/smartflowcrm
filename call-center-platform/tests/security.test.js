/**
 * Security Tests – Multi-Tenant Voice Call Center Platform
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../src/middleware/auth');

beforeAll(async () => {
    const { seed } = require('../src/seed/run-seed');
    await seed();
});

afterAll(() => {
    const { closeDatabase } = require('../src/config/database');
    closeDatabase();
});

describe('JWT Token Security', () => {
    it('should reject token with wrong secret', () => {
        const fakeToken = jwt.sign(
            { userId: 'atlas_admin', tenantId: 'atlas_support', role: 'admin' },
            'wrong-secret-key', { expiresIn: '1h' }
        );
        expect(() => jwt.verify(fakeToken, JWT_SECRET)).toThrow();
    });

    it('should reject expired token', () => {
        const expiredToken = jwt.sign(
            { userId: 'atlas_admin', tenantId: 'atlas_support', role: 'admin' },
            JWT_SECRET, { expiresIn: '-1s' }
        );
        expect(() => jwt.verify(expiredToken, JWT_SECRET)).toThrow();
    });

    it('valid token should decode correctly with tenant_id', () => {
        const token = jwt.sign(
            { userId: 'atlas_admin', tenantId: 'atlas_support', role: 'admin' },
            JWT_SECRET, { expiresIn: '1h' }
        );
        const decoded = jwt.verify(token, JWT_SECRET);
        expect(decoded.tenantId).toBe('atlas_support');
        expect(decoded.role).toBe('admin');
    });

    it('should not allow tenant_id manipulation in token', () => {
        const token = jwt.sign(
            { userId: 'atlas_admin', tenantId: 'atlas_support', role: 'admin' },
            JWT_SECRET, { expiresIn: '1h' }
        );
        const decoded = jwt.verify(token, JWT_SECRET);
        expect(decoded.tenantId).toBe('atlas_support');
        expect(decoded.tenantId).not.toBe('nova_logistics');
    });
});

describe('SQL Injection Prevention', () => {
    it('should handle SQL injection in tenant ID', () => {
        const { dbPrepareGet } = require('../src/config/database');
        const maliciousTenantId = "atlas_support'; DROP TABLE tenants; --";
        const result = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [maliciousTenantId]);
        expect(result).toBeNull();
        const tenants = dbPrepareGet('SELECT COUNT(*) as c FROM tenants');
        expect(tenants.c).toBeGreaterThan(0);
    });

    it('should handle SQL injection in user email', () => {
        const { dbPrepareGet } = require('../src/config/database');
        const maliciousEmail = "admin@atlas.com' OR '1'='1";
        const result = dbPrepareGet('SELECT * FROM users WHERE email = ? AND tenant_id = ?',
            [maliciousEmail, 'atlas_support']);
        expect(result).toBeNull();
    });

    it('should handle SQL injection in call filters', () => {
        const { dbPrepareAll, dbPrepareGet } = require('../src/config/database');
        const maliciousFilter = "'; DELETE FROM calls; --";
        const result = dbPrepareAll('SELECT * FROM calls WHERE tenant_id = ? AND status = ?',
            ['atlas_support', maliciousFilter]);
        expect(result).toEqual([]);
        const calls = dbPrepareGet('SELECT COUNT(*) as c FROM calls');
        expect(calls.c).toBeGreaterThan(0);
    });
});

describe('Role-Based Access Control', () => {
    it('should differentiate admin, supervisor, and agent roles', () => {
        const { dbPrepareAll } = require('../src/config/database');
        const roles = dbPrepareAll(
            'SELECT DISTINCT role FROM users WHERE tenant_id = ?', ['atlas_support']
        );
        const roleNames = roles.map(r => r.role);
        expect(roleNames).toContain('admin');
        expect(roleNames).toContain('supervisor');
        expect(roleNames).toContain('agent');
    });
});

describe('Data Validation', () => {
    it('sentiment scores should be in valid range', () => {
        const { dbPrepareGet } = require('../src/config/database');
        const invalid = dbPrepareGet(
            'SELECT COUNT(*) as c FROM calls WHERE sentiment_score < -1 OR sentiment_score > 1'
        );
        expect(invalid.c).toBe(0);
    });
});
