/**
 * One-Click Onboarding — UX Flow + API Endpoints
 * 
 * Goal: Signup → first AI call in <60 seconds.
 * Self-serve first. No sales call required.
 * Trial: 3 days, 100 minutes, no credit card.
 */
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const signupService = require('../services/signup.service');
const subscriptionService = require('../services/subscription.service');
const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const logger = rootLogger.child({ component: 'onboarding' });

// ═══════════════════════════════════════════════════
// ONBOARDING CHECKLIST DEFINITIONS
// ═══════════════════════════════════════════════════

const ONBOARDING_STEPS = [
    {
        id: 'account_created',
        title: 'Create your account',
        description: 'Sign up with your email and company name',
        auto_complete: true,
        order: 1,
        time_estimate: '30 sec'
    },
    {
        id: 'email_verified',
        title: 'Verify your email',
        description: 'Click the link in your inbox',
        auto_complete: true,
        order: 2,
        time_estimate: '15 sec'
    },
    {
        id: 'agent_configured',
        title: 'Configure your AI agent',
        description: 'Set your business name, greeting, and call handling rules',
        auto_complete: false,
        order: 3,
        time_estimate: '3 min',
        action_url: '/admin/agent/configure',
        wizard_step: 'agent_setup'
    },
    {
        id: 'phone_connected',
        title: 'Connect your phone number',
        description: 'Get a new number or forward your existing one',
        auto_complete: false,
        order: 4,
        time_estimate: '1 min',
        action_url: '/admin/phone/setup',
        wizard_step: 'phone_setup'
    },
    {
        id: 'first_test_call',
        title: 'Make your first test call',
        description: 'Call your AI agent to hear it in action',
        auto_complete: false,
        order: 5,
        time_estimate: '1 min',
        action_url: '/admin/test-call',
        wizard_step: 'test_call'
    },
    {
        id: 'calendar_connected',
        title: 'Connect your calendar (optional)',
        description: 'Let AI book appointments directly',
        auto_complete: false,
        order: 6,
        time_estimate: '2 min',
        action_url: '/admin/integrations/calendar',
        optional: true
    }
];

// ═══════════════════════════════════════════════════
// INDUSTRY TEMPLATES
// ═══════════════════════════════════════════════════

const INDUSTRY_TEMPLATES = {
    healthcare: {
        greeting: "Thank you for calling {business_name}. This is {agent_name}, your virtual assistant. How can I help you today?",
        capabilities: ["appointment_booking", "prescription_refill", "insurance_verification", "urgent_triage"],
        persona: "Professional, warm, HIPAA-aware. Speaks clearly and confirms details carefully.",
        transfer_triggers: ["medical emergency", "clinical question", "upset patient requiring doctor"]
    },
    real_estate: {
        greeting: "Hi, thank you for calling {business_name}! I'm {agent_name}. Are you looking to buy, sell, or rent?",
        capabilities: ["showing_scheduling", "property_info", "market_questions", "agent_transfer"],
        persona: "Friendly, enthusiastic, knowledgeable about the local market.",
        transfer_triggers: ["offer negotiation", "legal question", "complex financing"]
    },
    automotive: {
        greeting: "Thanks for calling {business_name}! I'm {agent_name}. How can I help you today?",
        capabilities: ["service_appointment", "parts_inquiry", "test_drive_booking", "pricing_questions"],
        persona: "Helpful, straightforward, no-pressure. Knows vehicle basics.",
        transfer_triggers: ["financing discussion", "trade-in valuation", "warranty dispute"]
    },
    professional_services: {
        greeting: "Thank you for calling {business_name}. I'm {agent_name}. How may I assist you?",
        capabilities: ["consultation_booking", "service_inquiry", "document_request", "billing_questions"],
        persona: "Professional, courteous, efficient. Respects caller's time.",
        transfer_triggers: ["active case discussion", "legal advice", "confidential matter"]
    },
    general: {
        greeting: "Hi, thanks for calling {business_name}! I'm {agent_name}. How can I help?",
        capabilities: ["appointment_booking", "faq", "complaint_handling", "transfer"],
        persona: "Friendly, helpful, professional.",
        transfer_triggers: ["complex issue", "upset caller", "explicit request for human"]
    }
};

// ═══════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════

/**
 * POST /api/onboarding/quick-signup
 * One-field signup — just email + password. Company name auto-derived.
 */
router.post('/quick-signup', async (req, res) => {
    try {
        const { email, password, company_name } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const derivedName = company_name || email.split('@')[1]?.split('.')[0] || 'My Business';
        const capitalizedName = derivedName.charAt(0).toUpperCase() + derivedName.slice(1);

        const result = signupService.signup({ companyName: capitalizedName, email, password });

        _initChecklist(result.tenant.id);
        _completeStep(result.tenant.id, 'account_created');

        res.status(201).json({
            success: true,
            token: result.token,
            tenant: { id: result.tenant.id, name: result.tenant.name },
            trial: { days: 3, minutes: 100, ends_at: result.subscription.trial_ends_at },
            onboarding: {
                checklist: _getChecklist(result.tenant.id),
                next_step: 'email_verified',
                wizard_url: '/admin/setup'
            }
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Signup failed' });
    }
});

/**
 * GET /api/onboarding/checklist — Get onboarding progress.
 */
router.get('/checklist', authMiddleware, (req, res) => {
    try {
        const checklist = _getChecklist(req.tenantId);
        const completed = checklist.filter(s => s.completed).length;
        const required = checklist.filter(s => !s.optional).length;
        const requiredCompleted = checklist.filter(s => !s.optional && s.completed).length;

        res.json({
            steps: checklist,
            progress: {
                completed, total: checklist.length,
                required_completed: requiredCompleted, required_total: required,
                percentage: Math.round((requiredCompleted / required) * 100),
                all_required_done: requiredCompleted >= required
            },
            next_step: checklist.find(s => !s.completed && !s.optional) || null,
            trial: _getTrialStatus(req.tenantId)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/onboarding/complete-step — Mark step complete.
 */
router.post('/complete-step', authMiddleware, (req, res) => {
    try {
        const { step_id } = req.body;
        if (!step_id) return res.status(400).json({ error: 'step_id required' });
        if (!ONBOARDING_STEPS.find(s => s.id === step_id)) return res.status(400).json({ error: 'Invalid step_id' });

        _completeStep(req.tenantId, step_id);
        const checklist = _getChecklist(req.tenantId);
        res.json({ step: step_id, completed: true, checklist, next_step: checklist.find(s => !s.completed && !s.optional) || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/onboarding/templates — Industry agent templates.
 */
router.get('/templates', (req, res) => {
    const { industry } = req.query;
    if (industry && INDUSTRY_TEMPLATES[industry]) {
        return res.json({ template: INDUSTRY_TEMPLATES[industry], industry });
    }
    res.json({
        industries: Object.keys(INDUSTRY_TEMPLATES).map(key => ({
            id: key,
            name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            capabilities: INDUSTRY_TEMPLATES[key].capabilities.length
        }))
    });
});

/**
 * POST /api/onboarding/configure-agent — Apply template + customizations.
 */
router.post('/configure-agent', authMiddleware, (req, res) => {
    try {
        const { industry, business_name, agent_name, custom_greeting } = req.body;
        const template = INDUSTRY_TEMPLATES[industry] || INDUSTRY_TEMPLATES.general;

        const config = {
            greeting: (custom_greeting || template.greeting)
                .replace('{business_name}', business_name || 'our office')
                .replace('{agent_name}', agent_name || 'Alex'),
            persona: template.persona,
            capabilities: template.capabilities,
            transfer_triggers: template.transfer_triggers,
            business_name, agent_name: agent_name || 'Alex'
        };

        dbRun(
            `INSERT OR REPLACE INTO tenant_settings (id, tenant_id, key, value, updated_at)
             VALUES (?, ?, 'agent_config', ?, CURRENT_TIMESTAMP)`,
            [uuid(), req.tenantId, JSON.stringify(config)]
        );

        _completeStep(req.tenantId, 'agent_configured');
        res.json({ success: true, config, next_step: 'phone_connected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

function _initChecklist(tenantId) {
    try {
        const db = require('../config/database').getDatabase();
        db.run(`CREATE TABLE IF NOT EXISTS onboarding_checklist (
            id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, step_id TEXT NOT NULL,
            completed INTEGER DEFAULT 0, completed_at TEXT,
            created_at TEXT DEFAULT (datetime('now')), UNIQUE(tenant_id, step_id)
        )`);
        for (const step of ONBOARDING_STEPS) {
            dbRun(`INSERT OR IGNORE INTO onboarding_checklist (id, tenant_id, step_id) VALUES (?, ?, ?)`,
                [uuid(), tenantId, step.id]);
        }
    } catch (e) { logger.debug('Checklist init deferred', { error: e.message }); }
}

function _completeStep(tenantId, stepId) {
    try {
        dbRun(`UPDATE onboarding_checklist SET completed = 1, completed_at = datetime('now')
               WHERE tenant_id = ? AND step_id = ?`, [tenantId, stepId]);
    } catch (e) { logger.debug('Step completion deferred', { error: e.message }); }
}

function _getChecklist(tenantId) {
    try {
        const rows = dbPrepareAll('SELECT step_id, completed, completed_at FROM onboarding_checklist WHERE tenant_id = ?', [tenantId]);
        const m = {};
        for (const r of rows) m[r.step_id] = { completed: !!r.completed, completed_at: r.completed_at };
        return ONBOARDING_STEPS.map(s => ({ ...s, completed: m[s.id]?.completed || false, completed_at: m[s.id]?.completed_at || null }));
    } catch (e) {
        return ONBOARDING_STEPS.map(s => ({ ...s, completed: false, completed_at: null }));
    }
}

function _getTrialStatus(tenantId) {
    const sub = subscriptionService.getCurrentSubscriptionPublic(tenantId);
    if (!sub) return { active: false };
    const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const hoursRemaining = trialEnd ? Math.max(0, (trialEnd - new Date()) / 3600000) : 0;
    return {
        active: sub.status === 'trialing', plan: 'free_trial', minutes_total: 100,
        days_total: 3, hours_remaining: Math.round(hoursRemaining * 10) / 10,
        ends_at: sub.trial_ends_at, status: sub.status
    };
}

module.exports = router;
