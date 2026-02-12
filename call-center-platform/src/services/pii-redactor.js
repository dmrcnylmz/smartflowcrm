/**
 * PII Redactor — Phase 18 Compliance & Privacy
 * 
 * Detects and redacts Personally Identifiable Information before storage.
 * 
 * Supported PII types:
 *   - Email addresses
 *   - Phone numbers (US, TR, international)
 *   - Social Security Numbers
 *   - Credit card numbers
 *   - IP addresses
 *   - Turkish TC Kimlik numbers
 * 
 * Configurable redaction levels per tenant.
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'pii-redactor' });

// ─── PII Patterns ────────────────────────────────────────

const PII_PATTERNS = [
    {
        name: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[EMAIL_REDACTED]'
    },
    {
        name: 'credit_card',
        pattern: /\b(?:[0-9]{4}[-\.\s]?){3}[0-9]{4}\b/g,
        replacement: '[CARD_REDACTED]'
    },
    {
        name: 'ssn',
        pattern: /\b[0-9]{3}[-\.\s]?[0-9]{2}[-\.\s]?[0-9]{4}\b/g,
        replacement: '[SSN_REDACTED]'
    },
    {
        name: 'phone_tr',
        pattern: /\b(?:\+?90[-\.\s]?)?(?:0)?(?:5[0-9]{2}|[2-4][0-9]{2})[-\.\s]?[0-9]{3}[-\.\s]?[0-9]{2}[-\.\s]?[0-9]{2}\b/g,
        replacement: '[PHONE_REDACTED]'
    },
    {
        name: 'phone_us',
        pattern: /\b(?:\+?1[-\.\s]?)?(?:\(?[0-9]{3}\)?[-\.\s]?)?[0-9]{3}[-\.\s]?[0-9]{4}\b/g,
        replacement: '[PHONE_REDACTED]'
    },
    {
        name: 'tc_kimlik',
        pattern: /\b[1-9][0-9]{10}\b/g,
        replacement: '[TCKIMLIK_REDACTED]'
    },
    {
        name: 'ip_address',
        pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
        replacement: '[IP_REDACTED]'
    }
];

class PiiRedactor {
    constructor() {
        this._enabledPatterns = PII_PATTERNS;
    }

    /**
     * Redact all PII from text.
     * @param {string} text - Input text
     * @param {object} [options]
     * @param {string[]} [options.exclude] - PII types to skip (e.g., ['ip_address'])
     * @returns {{ redacted: string, findings: Array<{type, count}>, totalRedactions: number }}
     */
    redact(text, options = {}) {
        if (!text || typeof text !== 'string') {
            return { redacted: text || '', findings: [], totalRedactions: 0 };
        }

        const exclude = new Set(options.exclude || []);
        let redacted = text;
        const findings = [];
        let totalRedactions = 0;

        for (const pii of this._enabledPatterns) {
            if (exclude.has(pii.name)) continue;

            const matches = redacted.match(pii.pattern);
            if (matches && matches.length > 0) {
                redacted = redacted.replace(pii.pattern, pii.replacement);
                findings.push({ type: pii.name, count: matches.length });
                totalRedactions += matches.length;
            }
        }

        if (totalRedactions > 0) {
            metrics.inc('pii_redactions_total', {}, totalRedactions);
            for (const f of findings) {
                metrics.inc('pii_redactions_by_type', { type: f.type }, f.count);
            }
        }

        return { redacted, findings, totalRedactions };
    }

    /**
     * Check if text contains PII without redacting.
     * @param {string} text
     * @returns {{ hasPii: boolean, types: string[] }}
     */
    detect(text) {
        if (!text) return { hasPii: false, types: [] };

        const types = [];
        for (const pii of this._enabledPatterns) {
            if (pii.pattern.test(text)) {
                types.push(pii.name);
            }
            // Reset regex lastIndex
            pii.pattern.lastIndex = 0;
        }

        return { hasPii: types.length > 0, types };
    }

    /**
     * Redact PII from a conversation memory entry.
     * @param {string} content
     * @returns {string} Redacted content
     */
    redactForStorage(content) {
        const result = this.redact(content);
        if (result.totalRedactions > 0) {
            logger.info('PII redacted before storage', {
                findings: result.findings,
                total: result.totalRedactions
            });
        }
        return result.redacted;
    }
}

module.exports = new PiiRedactor();
