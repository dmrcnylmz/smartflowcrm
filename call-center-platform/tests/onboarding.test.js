/**
 * Enterprise Onboarding Test Suite
 * 
 * Tests self-signup, subscription tiers, onboarding checklist,
 * TOTP 2FA, email verification, password reset, and success metrics.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// ─── Bootstrap ──────────────────────────────────────

let db;

beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-onboarding';
    process.env.NODE_ENV = 'test';

    // Initialize database (async for sql.js)
    db = require('../src/config/database');
    await db.initDatabase();

    // Fix pre-existing schema issue: add missing columns if they don't exist
    const database = db.getDatabase();
    try {
        database.run('ALTER TABLE tenant_settings ADD COLUMN monthly_max_tokens INTEGER DEFAULT 0');
    } catch (e) { /* already exists */ }
    try {
        database.run('ALTER TABLE tenant_settings ADD COLUMN monthly_max_minutes INTEGER DEFAULT 0');
    } catch (e) { /* already exists */ }
    try {
        database.run('ALTER TABLE tenant_settings ADD COLUMN data_retention_days INTEGER DEFAULT 365');
    } catch (e) { /* already exists */ }

    // Ensure new onboarding tables exist
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, '../src/models/schema.sql'), 'utf8');
    // Extract only CREATE TABLE and CREATE INDEX statements for new tables
    const statements = schema.split(';').filter(s =>
        s.includes('subscription_plans') || s.includes('tenant_subscriptions') || s.includes('verification_tokens')
    );
    for (const stmt of statements) {
        if (stmt.trim()) {
            try { database.run(stmt + ';'); } catch (e) { /* already exists */ }
        }
    }
});

afterEach(() => {
    // Clean up test data
    const database = db.getDatabase();
    try {
        database.exec('DELETE FROM verification_tokens');
        database.exec('DELETE FROM tenant_subscriptions');
        database.exec('DELETE FROM tenant_pricing');
        database.exec('DELETE FROM tenant_branding');
        database.exec('DELETE FROM tenant_settings');
        database.exec('DELETE FROM usage_metrics');
        database.exec('DELETE FROM calls');
        database.exec('DELETE FROM users');
        database.exec('DELETE FROM tenants');
    } catch (e) { /* ok */ }
});

// ═══════════════════════════════════════════════
// 1. SELF-SERVICE SIGNUP
// ═══════════════════════════════════════════════

describe('Self-Service Signup', () => {
    it('should create tenant, admin user, and defaults in one call', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'TestCorp',
            email: 'admin@testcorp.com',
            password: 'SecurePass123!'
        });

        expect(result.token).toBeDefined();
        expect(result.refresh_token).toBeDefined();
        expect(result.user.email).toBe('admin@testcorp.com');
        expect(result.user.role).toBe('admin');
        expect(result.tenant.name).toBe('TestCorp');
        expect(result.subscription.plan).toBe('free_trial');
    });

    it('should create default AI persona settings', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'PersonaCorp',
            email: 'admin@personacorp.com',
            password: 'SecurePass123!'
        });

        const settings = db.dbPrepareGet(
            'SELECT * FROM tenant_settings WHERE tenant_id = ?',
            [result.tenant.id]
        );
        expect(settings).toBeDefined();
        expect(settings.company_name).toBe('PersonaCorp');
        expect(settings.tone).toBe('friendly');
    });

    it('should create default branding', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'BrandCorp',
            email: 'admin@brandcorp.com',
            password: 'SecurePass123!'
        });

        const branding = db.dbPrepareGet(
            'SELECT * FROM tenant_branding WHERE tenant_id = ?',
            [result.tenant.id]
        );
        expect(branding).toBeDefined();
        expect(branding.primary_color).toBe('#7c5cfc');
        expect(branding.secondary_color).toBe('#00d4aa');
    });

    it('should reject duplicate email', () => {
        const signupService = require('../src/services/signup.service');
        signupService.signup({
            companyName: 'First Corp',
            email: 'dup@test.com',
            password: 'SecurePass123!'
        });

        expect(() => signupService.signup({
            companyName: 'Second Corp',
            email: 'dup@test.com',
            password: 'AnotherPass123!'
        })).toThrow();
    });

    it('should reject short password', () => {
        const signupService = require('../src/services/signup.service');
        expect(() => signupService.signup({
            companyName: 'ShortPass Corp',
            email: 'sp@test.com',
            password: '123'
        })).toThrow('Password must be at least 8 characters');
    });

    it('should reject missing fields', () => {
        const signupService = require('../src/services/signup.service');
        expect(() => signupService.signup({
            email: 'nocompany@test.com',
            password: 'SecurePass123!'
        })).toThrow();
    });

    it('should create trial subscription with 3-day expiry', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'TrialCorp',
            email: 'admin@trialcorp.com',
            password: 'SecurePass123!'
        });

        const sub = db.dbPrepareGet(
            'SELECT * FROM tenant_subscriptions WHERE tenant_id = ?',
            [result.tenant.id]
        );
        expect(sub).toBeDefined();
        expect(sub.status).toBe('trialing');
        expect(sub.trial_ends_at).toBeDefined();

        const trialEnd = new Date(sub.trial_ends_at);
        const daysDiff = Math.round((trialEnd - new Date()) / (1000 * 60 * 60 * 24));
        expect(daysDiff).toBeGreaterThanOrEqual(2);
        expect(daysDiff).toBeLessThanOrEqual(3);
    });
});

// ═══════════════════════════════════════════════
// 2. EMAIL VERIFICATION
// ═══════════════════════════════════════════════

describe('Email Verification', () => {
    it('should create verification token on signup', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'VerifyCorp',
            email: 'admin@verifycorp.com',
            password: 'SecurePass123!'
        });

        const token = db.dbPrepareGet(
            "SELECT * FROM verification_tokens WHERE user_id = ? AND type = 'email_verify'",
            [result.user.id]
        );
        expect(token).toBeDefined();
        expect(token.used_at).toBeNull();
    });

    it('should verify email with valid token', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'VerifyCorp2',
            email: 'admin@verifycorp2.com',
            password: 'SecurePass123!'
        });

        // Get the raw token (we need to create one we know)
        const crypto = require('crypto');
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const { v4: uuid } = require('uuid');

        db.dbRun(
            `INSERT INTO verification_tokens (id, user_id, tenant_id, type, token_hash, expires_at)
             VALUES (?, ?, ?, 'email_verify', ?, ?)`,
            [uuid(), result.user.id, result.tenant.id, tokenHash,
            new Date(Date.now() + 86400000).toISOString()]
        );

        const verified = signupService.verifyEmail(rawToken);
        expect(verified.verified).toBe(true);
    });

    it('should reject expired verification token', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.signup({
            companyName: 'ExpiredCorp',
            email: 'admin@expiredcorp.com',
            password: 'SecurePass123!'
        });

        const crypto = require('crypto');
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const { v4: uuid } = require('uuid');

        db.dbRun(
            `INSERT INTO verification_tokens (id, user_id, tenant_id, type, token_hash, expires_at)
             VALUES (?, ?, ?, 'email_verify', ?, ?)`,
            [uuid(), result.user.id, result.tenant.id, tokenHash,
            new Date(Date.now() - 86400000).toISOString()]  // expired
        );

        expect(() => signupService.verifyEmail(rawToken)).toThrow('Invalid or expired');
    });
});

// ═══════════════════════════════════════════════
// 3. PASSWORD RESET
// ═══════════════════════════════════════════════

describe('Password Reset', () => {
    it('should initiate password reset without revealing email existence', () => {
        const signupService = require('../src/services/signup.service');
        const result = signupService.forgotPassword('nonexistent@test.com');
        expect(result.message).toContain('If the email exists');
    });

    it('should reset password with valid token', () => {
        const signupService = require('../src/services/signup.service');
        signupService.signup({
            companyName: 'ResetCorp',
            email: 'admin@resetcorp.com',
            password: 'OldPassword123!'
        });

        // Create a known reset token
        const crypto = require('crypto');
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const { v4: uuid } = require('uuid');

        const user = db.dbPrepareGet("SELECT * FROM users WHERE email = 'admin@resetcorp.com'");
        db.dbRun(
            `INSERT INTO verification_tokens (id, user_id, tenant_id, type, token_hash, expires_at)
             VALUES (?, ?, ?, 'password_reset', ?, ?)`,
            [uuid(), user.id, user.tenant_id, tokenHash,
            new Date(Date.now() + 3600000).toISOString()]
        );

        const result = signupService.resetPassword(rawToken, 'NewPassword456!');
        expect(result.success).toBe(true);

        // Verify old password no longer works
        const authService = require('../src/services/auth.service');
        expect(() => authService.login('admin@resetcorp.com', 'OldPassword123!', user.tenant_id)).toThrow();

        // Verify new password works
        const loginResult = authService.login('admin@resetcorp.com', 'NewPassword456!', user.tenant_id);
        expect(loginResult.token).toBeDefined();
    });

    it('should reject short new password', () => {
        const signupService = require('../src/services/signup.service');
        expect(() => signupService.resetPassword('sometoken', 'abc')).toThrow('at least 8');
    });
});

// ═══════════════════════════════════════════════
// 4. SUBSCRIPTION TIERS
// ═══════════════════════════════════════════════

describe('Subscription Tiers', () => {
    it('should seed default plans', () => {
        const subscriptionService = require('../src/services/subscription.service');
        subscriptionService.seedPlans();
        const plans = subscriptionService.listPlans();

        expect(plans.length).toBeGreaterThanOrEqual(4);
        const names = plans.map(p => p.name);
        expect(names).toContain('free_trial');
        expect(names).toContain('starter');
        expect(names).toContain('pro');
        expect(names).toContain('enterprise');
    });

    it('should return plan details with correct limits', () => {
        const subscriptionService = require('../src/services/subscription.service');
        subscriptionService.seedPlans();

        const starter = subscriptionService.getPlan('starter');
        expect(starter).toBeDefined();
        expect(starter.max_minutes).toBe(500);
        expect(starter.max_agents).toBe(5);
        expect(starter.price_monthly).toBe(49);
    });

    it('should get current subscription for a tenant', () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        subscriptionService.seedPlans();

        const result = signupService.signup({
            companyName: 'SubCorp',
            email: 'admin@subcorp.com',
            password: 'SecurePass123!'
        });

        const sub = subscriptionService.getCurrentSubscription(result.tenant.id);
        expect(sub).toBeDefined();
        expect(sub.plan_name).toBe('free_trial');
        expect(sub.status).toBe('trialing');
    });

    it('should enforce minute limits', () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        const billingService = require('../src/services/billing.service');
        subscriptionService.seedPlans();

        const result = signupService.signup({
            companyName: 'LimitCorp',
            email: 'admin@limitcorp.com',
            password: 'SecurePass123!'
        });

        // Use up all minutes (free trial = 100)
        billingService.trackCallMinutes(result.tenant.id, 100);

        const limits = subscriptionService.checkLimits(result.tenant.id);
        expect(limits.allowed).toBe(false);
        expect(limits.reason).toContain('minute limit');
    });

    it('should allow usage within limits', () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        const billingService = require('../src/services/billing.service');
        subscriptionService.seedPlans();

        const result = signupService.signup({
            companyName: 'AllowedCorp',
            email: 'admin@allowedcorp.com',
            password: 'SecurePass123!'
        });

        billingService.trackCallMinutes(result.tenant.id, 50);
        const limits = subscriptionService.checkLimits(result.tenant.id);
        expect(limits.allowed).toBe(true);
        expect(limits.limits.minutes.remaining).toBe(50);
    });

    it('should handle Stripe not configured gracefully', async () => {
        const subscriptionService = require('../src/services/subscription.service');
        delete process.env.STRIPE_SECRET_KEY;

        const signupService = require('../src/services/signup.service');
        subscriptionService.seedPlans();
        const result = signupService.signup({
            companyName: 'NoStripeCorp',
            email: 'admin@nostripecorp.com',
            password: 'SecurePass123!'
        });

        try {
            await subscriptionService.createCheckoutSession(result.tenant.id, 'plan_starter');
        } catch (err) {
            expect(err.status).toBe(503);
            expect(err.message).toContain('Stripe not configured');
        }
    });
});

// ═══════════════════════════════════════════════
// 5. ONBOARDING CHECKLIST
// ═══════════════════════════════════════════════

describe('Onboarding Checklist', () => {
    it('should compute checklist from existing data', () => {
        const signupService = require('../src/services/signup.service');
        const onboardingService = require('../src/services/onboarding.service');

        const result = signupService.signup({
            companyName: 'ChecklistCorp',
            email: 'admin@checklistcorp.com',
            password: 'SecurePass123!'
        });

        const checklist = onboardingService.getChecklist(result.tenant.id);
        expect(checklist.totalCount).toBe(6);
        expect(checklist.steps).toHaveLength(6);

        // Should have subscription step completed (trial)
        const subStep = checklist.steps.find(s => s.id === 'subscription_active');
        expect(subStep.completed).toBe(true);

        // AI persona should be completed (created by signup)
        const personaStep = checklist.steps.find(s => s.id === 'ai_persona');
        expect(personaStep.completed).toBe(true);
    });

    it('should show phone number as incomplete initially', () => {
        const signupService = require('../src/services/signup.service');
        const onboardingService = require('../src/services/onboarding.service');

        const result = signupService.signup({
            companyName: 'NoPhoneCorp',
            email: 'admin@nophonecorp.com',
            password: 'SecurePass123!'
        });

        const checklist = onboardingService.getChecklist(result.tenant.id);
        const phoneStep = checklist.steps.find(s => s.id === 'phone_number');
        expect(phoneStep.completed).toBe(false);
    });

    it('should show test call as incomplete initially', () => {
        const signupService = require('../src/services/signup.service');
        const onboardingService = require('../src/services/onboarding.service');

        const result = signupService.signup({
            companyName: 'NoCallCorp',
            email: 'admin@nocallcorp.com',
            password: 'SecurePass123!'
        });

        const checklist = onboardingService.getChecklist(result.tenant.id);
        const callStep = checklist.steps.find(s => s.id === 'test_call');
        expect(callStep.completed).toBe(false);
    });

    it('should compute completion percentage', () => {
        const signupService = require('../src/services/signup.service');
        const onboardingService = require('../src/services/onboarding.service');

        const result = signupService.signup({
            companyName: 'PercentCorp',
            email: 'admin@percentcorp.com',
            password: 'SecurePass123!'
        });

        const checklist = onboardingService.getChecklist(result.tenant.id);
        expect(checklist.percentComplete).toBeGreaterThan(0);
        expect(checklist.percentComplete).toBeLessThan(100);
    });
});

// ═══════════════════════════════════════════════
// 6. CUSTOMER SUCCESS METRICS
// ═══════════════════════════════════════════════

describe('Customer Success Metrics', () => {
    it('should return tenant-level success metrics', () => {
        const signupService = require('../src/services/signup.service');
        const onboardingService = require('../src/services/onboarding.service');

        const result = signupService.signup({
            companyName: 'MetricsCorp',
            email: 'admin@metricscorp.com',
            password: 'SecurePass123!'
        });

        const metrics = onboardingService.getSuccessMetrics(result.tenant.id);
        expect(metrics).toBeDefined();
        expect(metrics.tenant_id).toBe(result.tenant.id);
        expect(metrics.total_calls).toBe(0);
        expect(metrics.ai_containment_rate).toBe(0);
        expect(metrics.cost_per_call).toBe(0);
    });

    it('should calculate containment rate', () => {
        const signupService = require('../src/services/signup.service');
        const onboardingService = require('../src/services/onboarding.service');
        const { v4: uuid } = require('uuid');

        const result = signupService.signup({
            companyName: 'ContainCorp',
            email: 'admin@containcorp.com',
            password: 'SecurePass123!'
        });

        // Insert some calls
        for (let i = 0; i < 10; i++) {
            db.dbRun(
                `INSERT INTO calls (id, tenant_id, call_type, caller_number, started_at, status, resolution_status, agent_id)
                 VALUES (?, ?, 'inbound', '+1111', CURRENT_TIMESTAMP, 'completed', ?, ?)`,
                [uuid(), result.tenant.id,
                i < 7 ? 'resolved' : 'escalated',
                i < 7 ? null : result.user.id]
            );
        }

        const metrics = onboardingService.getSuccessMetrics(result.tenant.id);
        expect(metrics.total_calls).toBe(10);
        expect(metrics.ai_containment_rate).toBe(70);
    });

    it('should return null for non-existent tenant', () => {
        const onboardingService = require('../src/services/onboarding.service');
        const metrics = onboardingService.getSuccessMetrics('fake-tenant');
        expect(metrics).toBeNull();
    });
});

// ═══════════════════════════════════════════════
// 7. TOTP 2FA
// ═══════════════════════════════════════════════

describe('TOTP Two-Factor Authentication', () => {
    it('should generate a valid TOTP secret', () => {
        const totpService = require('../src/services/totp.service');
        const result = totpService.generateSecret('test@example.com');

        expect(result.secret).toBeDefined();
        expect(result.secret.length).toBeGreaterThan(10);
        expect(result.otpauthUri).toContain('otpauth://totp/');
        expect(result.otpauthUri).toContain('test%40example.com');
        expect(result.qrUrl).toContain('chart.googleapis.com');
    });

    it('should verify a valid TOTP code', () => {
        const totpService = require('../src/services/totp.service');
        const result = totpService.generateSecret('test@example.com');

        // Generate the current code
        const timeStep = Math.floor(Date.now() / 1000 / 30);
        const code = totpService._generateCode(result.secret, timeStep);

        expect(totpService.verify(code, result.secret)).toBe(true);
    });

    it('should reject invalid TOTP code', () => {
        const totpService = require('../src/services/totp.service');
        const result = totpService.generateSecret('test@example.com');

        expect(totpService.verify('000000', result.secret)).toBe(false);
    });

    it('should accept code within ±1 time window', () => {
        const totpService = require('../src/services/totp.service');
        const result = totpService.generateSecret('test@example.com');

        // Generate code for previous time step
        const prevTimeStep = Math.floor(Date.now() / 1000 / 30) - 1;
        const prevCode = totpService._generateCode(result.secret, prevTimeStep);

        expect(totpService.verify(prevCode, result.secret)).toBe(true);
    });

    it('should handle empty inputs gracefully', () => {
        const totpService = require('../src/services/totp.service');
        expect(totpService.verify('', 'secret')).toBe(false);
        expect(totpService.verify('123456', '')).toBe(false);
        expect(totpService.verify(null, null)).toBe(false);
    });
});

// ═══════════════════════════════════════════════
// 8. EMAIL SERVICE
// ═══════════════════════════════════════════════

describe('Email Service', () => {
    it('should send email in dev mode (console)', async () => {
        delete process.env.SENDGRID_API_KEY;
        delete process.env.SMTP_HOST;

        const emailService = require('../src/services/email.service');
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

        const result = await emailService.send({
            to: 'test@example.com',
            subject: 'Test Email',
            html: '<p>Hello</p>'
        });

        expect(result.success).toBe(true);
        expect(result.backend).toBe('console');
        consoleSpy.mockRestore();
    });

    it('should send verification email template', async () => {
        delete process.env.SENDGRID_API_KEY;
        delete process.env.SMTP_HOST;

        const emailService = require('../src/services/email.service');
        const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue({ success: true });

        await emailService.sendVerification('test@test.com', 'abc123', 'TestCorp');
        expect(sendSpy).toHaveBeenCalled();
        const call = sendSpy.mock.calls[0][0];
        expect(call.to).toBe('test@test.com');
        expect(call.subject).toContain('Verify');

        sendSpy.mockRestore();
    });

    it('should send password reset email template', async () => {
        delete process.env.SENDGRID_API_KEY;
        delete process.env.SMTP_HOST;

        const emailService = require('../src/services/email.service');
        const sendSpy = vi.spyOn(emailService, 'send').mockResolvedValue({ success: true });

        await emailService.sendPasswordReset('test@test.com', 'abc123', 'TestCorp');
        expect(sendSpy).toHaveBeenCalled();
        const call = sendSpy.mock.calls[0][0];
        expect(call.subject).toContain('Password Reset');

        sendSpy.mockRestore();
    });
});

// ═══════════════════════════════════════════════
// 9. STRIPE WEBHOOK HANDLING
// ═══════════════════════════════════════════════

describe('Stripe Webhook Handling', () => {
    it('should handle checkout.session.completed event', async () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        subscriptionService.seedPlans();

        const result = signupService.signup({
            companyName: 'WebhookCorp',
            email: 'admin@webhookcorp.com',
            password: 'SecurePass123!'
        });

        await subscriptionService.handleWebhook({
            type: 'checkout.session.completed',
            data: {
                object: {
                    metadata: { tenant_id: result.tenant.id, plan_id: 'plan_starter' },
                    customer: 'cus_test123',
                    subscription: 'sub_test123'
                }
            }
        });

        const sub = subscriptionService.getCurrentSubscription(result.tenant.id);
        expect(sub.plan_name).toBe('starter');
        expect(sub.status).toBe('active');
    });

    it('should handle customer.subscription.deleted event', async () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        subscriptionService.seedPlans();

        const result = signupService.signup({
            companyName: 'DeleteCorp',
            email: 'admin@deletecorp.com',
            password: 'SecurePass123!'
        });

        // First activate
        await subscriptionService.handleWebhook({
            type: 'checkout.session.completed',
            data: {
                object: {
                    metadata: { tenant_id: result.tenant.id, plan_id: 'plan_pro' },
                    customer: 'cus_test456',
                    subscription: 'sub_test456'
                }
            }
        });

        // Then cancel
        await subscriptionService.handleWebhook({
            type: 'customer.subscription.deleted',
            data: { object: { id: 'sub_test456' } }
        });

        const sub = subscriptionService.getCurrentSubscription(result.tenant.id);
        expect(sub.status).toBe('canceled');
    });
});

// ═══════════════════════════════════════════════
// 10. FULL ONBOARDING FLOW (Integration)
// ═══════════════════════════════════════════════

describe('Full Onboarding Flow (Integration)', () => {
    it('should complete full signup → checklist → metrics flow', () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        const onboardingService = require('../src/services/onboarding.service');
        subscriptionService.seedPlans();

        // 1. Signup
        const signup = signupService.signup({
            companyName: 'IntegrationCorp',
            email: 'admin@integrationcorp.com',
            password: 'SecurePass123!',
            name: 'John Admin'
        });

        expect(signup.token).toBeDefined();
        expect(signup.user.name).toBe('John Admin');

        // 2. Check onboarding
        const checklist = onboardingService.getChecklist(signup.tenant.id);
        expect(checklist.percentComplete).toBeGreaterThan(0);
        expect(checklist.steps.find(s => s.id === 'ai_persona').completed).toBe(true);
        expect(checklist.steps.find(s => s.id === 'subscription_active').completed).toBe(true);

        // 3. Check metrics
        const metrics = onboardingService.getSuccessMetrics(signup.tenant.id);
        expect(metrics.tenant_id).toBe(signup.tenant.id);
        expect(metrics.total_calls).toBe(0);

        // 4. Check subscription limits
        const limits = subscriptionService.checkLimits(signup.tenant.id);
        expect(limits.allowed).toBe(true);
        expect(limits.plan).toBe('free_trial');
    });

    it('should handle complete lifecycle: signup → use → limit → upgrade', async () => {
        const signupService = require('../src/services/signup.service');
        const subscriptionService = require('../src/services/subscription.service');
        const billingService = require('../src/services/billing.service');
        subscriptionService.seedPlans();

        // Signup
        const signup = signupService.signup({
            companyName: 'LifecycleCorp',
            email: 'admin@lifecyclecorp.com',
            password: 'SecurePass123!'
        });

        // Use some quota
        billingService.trackCallMinutes(signup.tenant.id, 50);
        let limits = subscriptionService.checkLimits(signup.tenant.id);
        expect(limits.allowed).toBe(true);
        expect(limits.limits.minutes.remaining).toBe(50);

        // Hit limit
        billingService.trackCallMinutes(signup.tenant.id, 50);
        limits = subscriptionService.checkLimits(signup.tenant.id);
        expect(limits.allowed).toBe(false);

        // Simulate upgrade via webhook
        await subscriptionService.handleWebhook({
            type: 'checkout.session.completed',
            data: {
                object: {
                    metadata: { tenant_id: signup.tenant.id, plan_id: 'plan_starter' },
                    customer: 'cus_lifecycle',
                    subscription: 'sub_lifecycle'
                }
            }
        });

        // Should now be allowed (starter has 500 min)
        limits = subscriptionService.checkLimits(signup.tenant.id);
        expect(limits.allowed).toBe(true);
        expect(limits.plan).toBe('starter');
        expect(limits.limits.minutes.included).toBe(500);
    });
});
