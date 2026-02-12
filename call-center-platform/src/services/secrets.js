/**
 * Secrets Vault — Security Hardening
 * 
 * Abstraction for secret management with pluggable backends:
 *   - Environment variables (default)
 *   - AWS Secrets Manager (future)
 *   - GCP Secret Manager (future)
 * 
 * Features:
 *   - Per-tenant encryption key derivation
 *   - Token rotation with re-encryption
 *   - Secure secret access logging
 */
const crypto = require('crypto');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'secrets' });

const MASTER_KEY = process.env.ENCRYPTION_KEY || process.env.SECRET_KEY || 'default-dev-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

class SecretsVault {
    constructor() {
        this._cache = new Map();       // In-memory cache for derived keys
        this._cacheTTL = 300000;       // 5 min cache
        this._backend = process.env.SECRETS_BACKEND || 'env';
    }

    /**
     * Get a secret value by name.
     * @param {string} name - Secret name (e.g., 'TWILIO_AUTH_TOKEN')
     * @param {object} [opts] - { tenantId, cached }
     */
    async get(name, opts = {}) {
        const cacheKey = opts.tenantId ? `${opts.tenantId}:${name}` : name;

        // Check cache
        if (opts.cached !== false) {
            const cached = this._cache.get(cacheKey);
            if (cached && Date.now() < cached.expiresAt) {
                metrics.inc('secrets_cache_hits');
                return cached.value;
            }
        }

        let value;
        switch (this._backend) {
            case 'env':
                value = process.env[name] || null;
                break;
            // Future backends:
            // case 'aws': value = await this._getFromAWS(name); break;
            // case 'gcp': value = await this._getFromGCP(name); break;
            default:
                value = process.env[name] || null;
        }

        // Cache the result
        if (value) {
            this._cache.set(cacheKey, { value, expiresAt: Date.now() + this._cacheTTL });
        }

        metrics.inc('secrets_access', { name: name.replace(/[A-Z0-9]{8,}/g, '***') });
        return value;
    }

    /**
     * Set a secret (env backend: sets process.env).
     * @param {string} name
     * @param {string} value
     */
    async set(name, value) {
        switch (this._backend) {
            case 'env':
                process.env[name] = value;
                break;
        }
        this._cache.delete(name);
        logger.info('Secret updated', { name: name.replace(/[A-Z0-9]{8,}/g, '***') });
    }

    /**
     * Derive a per-tenant encryption key from the master key.
     * Uses HKDF-like derivation: scrypt(masterKey, tenantId, 32)
     * @param {string} tenantId
     * @returns {Buffer} 32-byte key
     */
    deriveTenantKey(tenantId) {
        const cacheKey = `_dk:${tenantId}`;
        const cached = this._cache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) return cached.value;

        const key = crypto.scryptSync(MASTER_KEY, `tenant:${tenantId}`, 32);
        this._cache.set(cacheKey, { value: key, expiresAt: Date.now() + this._cacheTTL });
        return key;
    }

    /**
     * Encrypt a value with a tenant-specific key.
     * @param {string} plaintext
     * @param {string} tenantId
     * @returns {string} iv:ciphertext
     */
    encryptForTenant(plaintext, tenantId) {
        const key = this.deriveTenantKey(tenantId);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt a value with a tenant-specific key.
     * @param {string} ciphertext - iv:encrypted format
     * @param {string} tenantId
     * @returns {string} plaintext
     */
    decryptForTenant(ciphertext, tenantId) {
        const key = this.deriveTenantKey(tenantId);
        const [ivHex, data] = ciphertext.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    /**
     * Rotate a secret: re-encrypt all tenant data with new key.
     * @param {string} tenantId
     * @param {string} oldMasterKey - Previous master key
     * @param {Array<{ciphertext: string}>} records - Records to re-encrypt
     * @returns {Array<string>} Re-encrypted values
     */
    rotateKey(tenantId, oldMasterKey, records) {
        const oldKey = crypto.scryptSync(oldMasterKey, `tenant:${tenantId}`, 32);
        const newKey = this.deriveTenantKey(tenantId);

        const results = [];
        for (const record of records) {
            // Decrypt with old key
            const [ivHex, data] = record.ciphertext.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
            let plaintext = decipher.update(data, 'hex', 'utf8');
            plaintext += decipher.final('utf8');

            // Re-encrypt with new key
            const newIv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv(ALGORITHM, newKey, newIv);
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            results.push(newIv.toString('hex') + ':' + encrypted);
        }

        // Clear cache for this tenant
        this._cache.delete(`_dk:${tenantId}`);
        logger.info('Key rotated', { tenantId, recordsRotated: records.length });
        metrics.inc('secrets_rotations', { tenant: tenantId });
        return results;
    }

    /**
     * Clear secret cache.
     */
    clearCache() {
        this._cache.clear();
    }
}

module.exports = new SecretsVault();
