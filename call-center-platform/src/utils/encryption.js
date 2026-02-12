/**
 * Encryption Utility — Phase 12 Enterprise Security
 * 
 * AES-256-GCM encryption for transcripts at rest.
 * Key from TRANSCRIPT_ENCRYPTION_KEY env var or derived fallback.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function _getKey() {
    const envKey = process.env.TRANSCRIPT_ENCRYPTION_KEY;
    if (envKey) {
        // Ensure 32 bytes
        return crypto.createHash('sha256').update(envKey).digest();
    }
    // Derived fallback (deterministic per installation)
    return crypto.createHash('sha256').update('call-center-platform-default-key-2026').digest();
}

/**
 * Encrypt plaintext.
 * @param {string} plaintext
 * @returns {string} Base64-encoded ciphertext (iv:tag:encrypted)
 */
function encrypt(plaintext) {
    if (!plaintext) return plaintext;
    const key = _getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    // Format: base64(iv):base64(tag):base64(encrypted)
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt ciphertext.
 * @param {string} ciphertext - Base64-encoded (iv:tag:encrypted)
 * @returns {string} Decrypted plaintext
 */
function decrypt(ciphertext) {
    if (!ciphertext || !ciphertext.includes(':')) return ciphertext;

    try {
        const key = _getKey();
        const [ivB64, tagB64, encrypted] = ciphertext.split(':');
        const iv = Buffer.from(ivB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        // If decryption fails, return as-is (might be plaintext)
        return ciphertext;
    }
}

/**
 * Check if a string is encrypted (has our format).
 */
function isEncrypted(text) {
    if (!text) return false;
    const parts = text.split(':');
    return parts.length === 3 && parts.every(p => {
        try { Buffer.from(p, 'base64'); return true; }
        catch { return false; }
    });
}

module.exports = { encrypt, decrypt, isEncrypted };
