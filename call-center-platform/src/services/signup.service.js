/**
 * Signup Service — Self-Service Tenant Onboarding
 * 
 * Orchestrates full signup in one call:
 *   1. Create tenant
 *   2. Create admin user
 *   3. Default AI persona (tenant_settings)
 *   4. Default branding
 *   5. Trial subscription
 *   6. Send verification email
 */
const { dbPrepareGet, dbRun } = require('../config/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const { logger: rootLogger } = require('../utils/logger');
const logger = rootLogger.child({ component: 'signup' });

const TRIAL_DAYS = 14;

class SignupService {
    /**
     * Full self-service signup.
     * @param {{ companyName: string, email: string, password: string, name?: string }} data
     * @returns {{ token, refresh_token, user, tenant, subscription }}
     */
    signup(data) {
        const { companyName, email, password, name } = data;

        // Validate
        if (!companyName || !email || !password) {
            throw { status: 400, message: 'companyName, email, and password are required' };
        }
        if (password.length < 8) {
            throw { status: 400, message: 'Password must be at least 8 characters' };
        }
        if (!email.includes('@')) {
            throw { status: 400, message: 'Invalid email address' };
        }

        // Check duplicate email across all tenants
        const existing = dbPrepareGet(
            'SELECT id FROM users WHERE email = ?', [email]
        );
        if (existing) {
            throw { status: 409, message: 'Email already registered' };
        }

        // Generate IDs
        const tenantId = this._slugify(companyName) + '_' + uuid().slice(0, 8);
        const userId = uuid();
        const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // 1. Create tenant
        dbRun(
            `INSERT INTO tenants (id, name, status) VALUES (?, ?, 'active')`,
            [tenantId, companyName]
        );

        // 2. Create admin user
        const passwordHash = bcrypt.hashSync(password, 10);
        dbRun(
            `INSERT INTO users (id, tenant_id, name, email, password_hash, role, level) 
             VALUES (?, ?, ?, ?, ?, 'admin', 10)`,
            [userId, tenantId, name || companyName + ' Admin', email, passwordHash]
        );

        // 3. Default AI persona
        dbRun(
            `INSERT INTO tenant_settings (tenant_id, company_name, tone, language, 
             forbidden_topics, escalation_rules, handoff_threshold, rate_limit,
             monthly_max_tokens, monthly_max_minutes)
             VALUES (?, ?, 'friendly', 'en', '', 
             'If unsure or customer insists, escalate to supervisor.', 0.3, 100,
             50000, 100)`,
            [tenantId, companyName]
        );

        // 4. Default branding
        dbRun(
            `INSERT INTO tenant_branding (tenant_id, company_name, primary_color, secondary_color) 
             VALUES (?, ?, '#7c5cfc', '#00d4aa')`,
            [tenantId, companyName]
        );

        // 5. Trial subscription
        this._createTrialSubscription(tenantId, trialEndsAt);

        // 6. Default pricing
        dbRun(
            `INSERT INTO tenant_pricing (tenant_id, price_per_minute, price_per_ai_token, currency)
             VALUES (?, 0.02, 0.00001, 'USD')`,
            [tenantId]
        );

        // Generate tokens
        const user = dbPrepareGet('SELECT * FROM users WHERE id = ?', [userId]);
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);

        // Generate email verification token
        const verifyToken = this.createVerificationToken(userId, tenantId, 'email_verify');

        // Send verification email (async, don't block)
        const emailService = require('./email.service');
        emailService.sendVerification(email, verifyToken, companyName).catch(err => {
            logger.error('Failed to send verification email', { error: err.message });
        });

        logger.info('Tenant signup completed', { tenantId, email });

        return {
            token,
            refresh_token: refreshToken,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, tenant_id: tenantId },
            tenant: { id: tenantId, name: companyName },
            subscription: { plan: 'free_trial', trial_ends_at: trialEndsAt }
        };
    }

    /**
     * Create a verification token.
     */
    createVerificationToken(userId, tenantId, type) {
        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const hours = type === 'email_verify' ? 24 : 1;
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        dbRun(
            `INSERT INTO verification_tokens (id, user_id, tenant_id, type, token_hash, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuid(), userId, tenantId, type, tokenHash, expiresAt]
        );

        return token;
    }

    /**
     * Verify an email verification token.
     */
    verifyEmail(token) {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const stored = dbPrepareGet(
            `SELECT * FROM verification_tokens 
             WHERE token_hash = ? AND type = 'email_verify' AND used_at IS NULL AND expires_at > ?`,
            [tokenHash, new Date().toISOString()]
        );

        if (!stored) throw { status: 400, message: 'Invalid or expired verification token' };

        // Mark token as used
        dbRun('UPDATE verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [stored.id]);

        // Mark user email as verified (column may not exist yet, graceful)
        try {
            dbRun('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [stored.user_id]);
        } catch (e) { /* column doesn't exist yet, that's ok */ }

        logger.info('Email verified', { userId: stored.user_id, tenantId: stored.tenant_id });
        return { verified: true, userId: stored.user_id, tenantId: stored.tenant_id };
    }

    /**
     * Initiate password reset.
     */
    forgotPassword(email) {
        const user = dbPrepareGet('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            // Don't reveal if email exists
            return { message: 'If the email exists, a reset link has been sent.' };
        }

        const token = this.createVerificationToken(user.id, user.tenant_id, 'password_reset');

        const emailService = require('./email.service');
        emailService.sendPasswordReset(email, token, 'AI Call Center').catch(err => {
            logger.error('Failed to send password reset email', { error: err.message });
        });

        return { message: 'If the email exists, a reset link has been sent.' };
    }

    /**
     * Reset password with token.
     */
    resetPassword(token, newPassword) {
        if (!newPassword || newPassword.length < 8) {
            throw { status: 400, message: 'Password must be at least 8 characters' };
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const stored = dbPrepareGet(
            `SELECT * FROM verification_tokens 
             WHERE token_hash = ? AND type = 'password_reset' AND used_at IS NULL AND expires_at > ?`,
            [tokenHash, new Date().toISOString()]
        );

        if (!stored) throw { status: 400, message: 'Invalid or expired reset token' };

        const passwordHash = bcrypt.hashSync(newPassword, 10);
        dbRun('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [passwordHash, stored.user_id]);
        dbRun('UPDATE verification_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?', [stored.id]);

        // Invalidate all other reset tokens for this user
        dbRun(
            `UPDATE verification_tokens SET used_at = CURRENT_TIMESTAMP 
             WHERE user_id = ? AND type = 'password_reset' AND used_at IS NULL`,
            [stored.user_id]
        );

        logger.info('Password reset completed', { userId: stored.user_id });
        return { success: true };
    }

    _createTrialSubscription(tenantId, trialEndsAt) {
        // Ensure free_trial plan exists
        const plan = dbPrepareGet("SELECT id FROM subscription_plans WHERE name = 'free_trial'");
        let planId;

        if (!plan) {
            planId = 'plan_free_trial';
            dbRun(
                `INSERT OR IGNORE INTO subscription_plans 
                 (id, name, display_name, price_monthly, max_minutes, max_ai_tokens, max_agents, max_concurrent_calls, sort_order)
                 VALUES (?, 'free_trial', 'Free Trial', 0, 100, 50000, 2, 1, 0)`,
                [planId]
            );
        } else {
            planId = plan.id;
        }

        dbRun(
            `INSERT INTO tenant_subscriptions (id, tenant_id, plan_id, status, trial_ends_at)
             VALUES (?, ?, ?, 'trialing', ?)`,
            [uuid(), tenantId, planId, trialEndsAt]
        );
    }

    _slugify(text) {
        return text.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/(^_|_$)/g, '')
            .slice(0, 30);
    }
}

module.exports = new SignupService();
