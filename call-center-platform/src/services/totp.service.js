/**
 * TOTP Service — Two-Factor Authentication (RFC 6238)
 * 
 * Pure crypto implementation — no external dependencies.
 * Compatible with Google Authenticator, Authy, etc.
 */
const crypto = require('crypto');
const { logger: rootLogger } = require('../utils/logger');
const logger = rootLogger.child({ component: 'totp' });

const DIGITS = 6;
const PERIOD = 30;  // seconds
const ALGORITHM = 'sha1';
const ISSUER = process.env.TOTP_ISSUER || 'AICallCenter';

class TOTPService {
    /**
     * Generate a new TOTP secret for a user.
     * @param {string} email - User's email for QR label
     * @returns {{ secret: string, otpauthUri: string, qrUrl: string }}
     */
    generateSecret(email) {
        // 20-byte random secret, base32 encoded
        const buffer = crypto.randomBytes(20);
        const secret = this._base32Encode(buffer);

        const otpauthUri = `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}&algorithm=${ALGORITHM.toUpperCase()}&digits=${DIGITS}&period=${PERIOD}`;

        // QR code via Google Charts API (no dependency)
        const qrUrl = `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(otpauthUri)}`;

        logger.info('TOTP secret generated', { email });
        return { secret, otpauthUri, qrUrl };
    }

    /**
     * Verify a TOTP code against a secret.
     * Allows ±1 time step for clock drift.
     * @param {string} code - 6-digit code from authenticator
     * @param {string} secret - Base32-encoded secret
     * @returns {boolean}
     */
    verify(code, secret) {
        if (!code || !secret) return false;
        const normalizedCode = code.replace(/\s/g, '');
        if (normalizedCode.length !== DIGITS) return false;

        const now = Math.floor(Date.now() / 1000);

        // Check current and ±1 time windows
        for (let offset = -1; offset <= 1; offset++) {
            const timeStep = Math.floor((now + offset * PERIOD) / PERIOD);
            const expected = this._generateCode(secret, timeStep);
            if (crypto.timingSafeEqual(Buffer.from(normalizedCode), Buffer.from(expected))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Generate a TOTP code for a given time step.
     */
    _generateCode(secret, timeStep) {
        const key = this._base32Decode(secret);
        const time = Buffer.alloc(8);
        time.writeBigUInt64BE(BigInt(timeStep));

        const hmac = crypto.createHmac(ALGORITHM, key).update(time).digest();
        const offset = hmac[hmac.length - 1] & 0x0f;
        const binary = ((hmac[offset] & 0x7f) << 24) |
            ((hmac[offset + 1] & 0xff) << 16) |
            ((hmac[offset + 2] & 0xff) << 8) |
            (hmac[offset + 3] & 0xff);

        const otp = binary % Math.pow(10, DIGITS);
        return otp.toString().padStart(DIGITS, '0');
    }

    /**
     * Base32 encode a buffer.
     */
    _base32Encode(buffer) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (const byte of buffer) {
            bits += byte.toString(2).padStart(8, '0');
        }
        let encoded = '';
        for (let i = 0; i < bits.length; i += 5) {
            const chunk = bits.slice(i, i + 5).padEnd(5, '0');
            encoded += alphabet[parseInt(chunk, 2)];
        }
        return encoded;
    }

    /**
     * Base32 decode a string to buffer.
     */
    _base32Decode(encoded) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (const char of encoded.toUpperCase()) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) continue;
            bits += idx.toString(2).padStart(5, '0');
        }
        const bytes = [];
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            bytes.push(parseInt(bits.slice(i, i + 8), 2));
        }
        return Buffer.from(bytes);
    }
}

module.exports = new TOTPService();
