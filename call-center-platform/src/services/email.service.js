/**
 * Email Service — Enterprise Onboarding
 * 
 * Pluggable email sender:
 *   - Dev: logs to console
 *   - Prod: SMTP or SendGrid
 * 
 * Set SMTP_HOST + SMTP_USER + SMTP_PASS for SMTP,
 * or SENDGRID_API_KEY for SendGrid.
 */
const { logger: rootLogger } = require('../utils/logger');
const logger = rootLogger.child({ component: 'email' });

class EmailService {
    constructor() {
        this._transport = null;
        this._from = process.env.EMAIL_FROM || 'noreply@callcenter.ai';
    }

    /**
     * Send an email.
     * @param {{ to: string, subject: string, html: string, text?: string }} opts
     */
    async send({ to, subject, html, text }) {
        const backend = this._getBackend();

        if (backend === 'sendgrid') {
            return this._sendViaSendGrid({ to, subject, html, text });
        } else if (backend === 'smtp') {
            return this._sendViaSMTP({ to, subject, html, text });
        }

        // Dev fallback: log to console
        logger.info('Email sent (dev mode)', { to, subject });
        console.log(`\n📧 EMAIL → ${to}\n   Subject: ${subject}\n   ${text || html.replace(/<[^>]*>/g, '').slice(0, 200)}\n`);
        return { success: true, backend: 'console' };
    }

    // ─── Templates ──────────────────────────────────

    async sendVerification(email, token, tenantName) {
        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const link = `${baseUrl}/api/verify-email?token=${token}`;
        return this.send({
            to: email,
            subject: `Verify your email — ${tenantName}`,
            html: `
                <h2>Welcome to ${tenantName}!</h2>
                <p>Click the link below to verify your email address:</p>
                <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c5cfc;color:#fff;text-decoration:none;border-radius:8px;">Verify Email</a></p>
                <p>Or copy this link: ${link}</p>
                <p>This link expires in 24 hours.</p>
            `,
            text: `Verify your email: ${link}`
        });
    }

    async sendPasswordReset(email, token, tenantName) {
        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const link = `${baseUrl}/reset-password?token=${token}`;
        return this.send({
            to: email,
            subject: `Password Reset — ${tenantName}`,
            html: `
                <h2>Password Reset</h2>
                <p>Click below to reset your password:</p>
                <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#7c5cfc;color:#fff;text-decoration:none;border-radius:8px;">Reset Password</a></p>
                <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
            `,
            text: `Reset your password: ${link}`
        });
    }

    async sendWelcome(email, tenantName) {
        return this.send({
            to: email,
            subject: `Welcome to ${tenantName} — Your AI Call Center is Ready`,
            html: `
                <h2>🎧 Welcome to ${tenantName}!</h2>
                <p>Your AI-powered call center is ready. Here's how to get started:</p>
                <ol>
                    <li>Verify your email</li>
                    <li>Add your Twilio phone number</li>
                    <li>Configure your AI persona</li>
                    <li>Add agents</li>
                    <li>Make a test call</li>
                </ol>
                <p>You can complete the setup in the admin panel.</p>
            `,
            text: `Welcome to ${tenantName}! Visit your admin panel to complete setup.`
        });
    }

    // ─── Backends ───────────────────────────────────

    _getBackend() {
        if (process.env.SENDGRID_API_KEY) return 'sendgrid';
        if (process.env.SMTP_HOST) return 'smtp';
        return 'console';
    }

    async _sendViaSendGrid({ to, subject, html, text }) {
        const https = require('https');
        const data = JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: this._from },
            subject,
            content: [
                { type: 'text/html', value: html },
                ...(text ? [{ type: 'text/plain', value: text }] : [])
            ]
        });

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'api.sendgrid.com',
                path: '/v3/mail/send',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                    'Content-Length': Buffer.byteLength(data)
                }
            }, (res) => {
                const status = res.statusCode;
                if (status >= 200 && status < 300) {
                    resolve({ success: true, backend: 'sendgrid' });
                } else {
                    let body = '';
                    res.on('data', c => body += c);
                    res.on('end', () => {
                        logger.error('SendGrid error', { status, body });
                        reject(new Error(`SendGrid ${status}: ${body}`));
                    });
                }
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    async _sendViaSMTP({ to, subject, html, text }) {
        // Uses nodemailer if available, otherwise falls back
        try {
            const nodemailer = require('nodemailer');
            if (!this._transport) {
                this._transport = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT || '587'),
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                });
            }
            await this._transport.sendMail({ from: this._from, to, subject, html, text });
            return { success: true, backend: 'smtp' };
        } catch (err) {
            logger.error('SMTP send failed', { error: err.message });
            throw err;
        }
    }
}

module.exports = new EmailService();
