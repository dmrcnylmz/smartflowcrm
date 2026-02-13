/**
 * Demo Tenant Auto-Provisioning — Instant Sandbox
 * 
 * Creates a fully configured demo tenant with:
 * - Pre-loaded call history, appointments, analytics
 * - AI agent configured with sample business
 * - 60-minute sandbox TTL (auto-teardown)
 * 
 * Use case: marketing site "Try Demo" button, sales demos, investor pitches.
 */
const express = require('express');
const router = express.Router();
const { dbPrepareGet, dbRun, dbPrepareAll } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const jwt = require('jsonwebtoken');
const logger = rootLogger.child({ component: 'demo' });

const DEMO_TTL_MINUTES = 60;
const DEMO_BUSINESS = {
    name: 'Bright Dental Group',
    industry: 'healthcare',
    agent_name: 'Sarah',
    phone: '+1-555-DEMO-001'
};

// ═══════════════════════════════════════════════════
// PRE-LOADED DATA SCHEMA
// ═══════════════════════════════════════════════════

const DEMO_CALLS = [
    {
        caller: '+1-555-0101', direction: 'inbound', type: 'appointment_booking',
        duration_min: 3.2, status: 'completed', resolution: 'booked',
        transcript_summary: "Patient called to book a dental cleaning. AI checked available slots and booked for Thursday at 2pm. Confirmed patient details and sent SMS reminder.",
        sentiment: 'positive', created_offset_hours: -2
    },
    {
        caller: '+1-555-0102', direction: 'inbound', type: 'faq',
        duration_min: 1.5, status: 'completed', resolution: 'answered',
        transcript_summary: "Caller asked about insurance acceptance and office hours. AI provided list of accepted insurers and current hours. Caller thanked and hung up.",
        sentiment: 'neutral', created_offset_hours: -5
    },
    {
        caller: '+1-555-0103', direction: 'inbound', type: 'complaint',
        duration_min: 4.8, status: 'completed', resolution: 'transferred',
        transcript_summary: "Patient frustrated about a billing error. AI acknowledged the issue, logged complaint details, and transferred to billing team. Caller was satisfied with the handoff.",
        sentiment: 'negative_to_neutral', created_offset_hours: -8
    },
    {
        caller: '+1-555-0104', direction: 'inbound', type: 'appointment_booking',
        duration_min: 2.1, status: 'completed', resolution: 'booked',
        transcript_summary: "Existing patient requested to reschedule their Friday appointment. AI found a Monday slot and updated the calendar.",
        sentiment: 'positive', created_offset_hours: -24
    },
    {
        caller: '+1-555-0105', direction: 'inbound', type: 'emergency_triage',
        duration_min: 1.8, status: 'completed', resolution: 'transferred',
        transcript_summary: "Caller reported severe tooth pain. AI identified urgency, asked key questions, and immediately connected to on-call dentist.",
        sentiment: 'urgent', created_offset_hours: -26
    },
    {
        caller: '+1-555-0106', direction: 'inbound', type: 'prescription_refill',
        duration_min: 2.5, status: 'completed', resolution: 'processed',
        transcript_summary: "Patient requested a prescription refill for post-procedure antibiotics. AI verified patient identity, confirmed prescription, and submitted refill request.",
        sentiment: 'positive', created_offset_hours: -30
    },
    {
        caller: '+1-555-0107', direction: 'inbound', type: 'appointment_booking',
        duration_min: 3.0, status: 'completed', resolution: 'booked',
        transcript_summary: "New patient intake. AI collected personal details, insurance info, and booked an initial consultation for next Tuesday at 10am.",
        sentiment: 'positive', created_offset_hours: -48
    },
    {
        caller: '+1-555-0108', direction: 'inbound', type: 'faq',
        duration_min: 0.8, status: 'completed', resolution: 'answered',
        transcript_summary: "Quick call asking for the office address and parking information. AI provided details in 45 seconds.",
        sentiment: 'neutral', created_offset_hours: -50
    }
];

const DEMO_APPOINTMENTS = [
    { patient: 'Emma Thompson', type: 'Dental Cleaning', date_offset_hours: 24, duration_min: 45, status: 'confirmed' },
    { patient: 'James Wilson', type: 'Initial Consultation', date_offset_hours: 48, duration_min: 60, status: 'confirmed' },
    { patient: 'Lisa Chen', type: 'Follow-up', date_offset_hours: 72, duration_min: 30, status: 'pending' },
    { patient: 'Robert Martinez', type: 'Root Canal', date_offset_hours: 96, duration_min: 90, status: 'confirmed' }
];

const DEMO_ANALYTICS = {
    total_calls: 47,
    calls_today: 8,
    avg_duration_min: 2.6,
    resolution_rate: 0.82,
    transfer_rate: 0.18,
    satisfaction_score: 4.7,
    minutes_used: 42,
    minutes_included: 100,
    busiest_hour: 14,
    top_intents: [
        { intent: 'appointment_booking', count: 22, pct: 47 },
        { intent: 'faq', count: 12, pct: 26 },
        { intent: 'complaint', count: 5, pct: 11 },
        { intent: 'prescription_refill', count: 4, pct: 9 },
        { intent: 'emergency_triage', count: 2, pct: 4 },
        { intent: 'other', count: 2, pct: 4 }
    ]
};

// ═══════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════

/**
 * POST /api/demo/provision
 * Create an instant demo sandbox — no signup required.
 * Returns a temporary JWT + pre-loaded tenant.
 */
router.post('/provision', (req, res) => {
    try {
        const tenantId = `demo_${uuid().slice(0, 8)}`;
        const userId = uuid();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + DEMO_TTL_MINUTES * 60000);

        // Create demo tenant
        dbRun(
            `INSERT INTO tenants (id, name, domain, industry, status, created_at)
             VALUES (?, ?, ?, ?, 'demo', CURRENT_TIMESTAMP)`,
            [tenantId, DEMO_BUSINESS.name, 'demo.smartflow.ai', DEMO_BUSINESS.industry]
        );

        // Create demo user
        dbRun(
            `INSERT INTO users (id, tenant_id, email, name, role, status, created_at)
             VALUES (?, ?, 'demo@smartflow.ai', 'Demo User', 'admin', 'active', CURRENT_TIMESTAMP)`,
            [userId, tenantId]
        );

        // Create demo subscription
        dbRun(
            `INSERT INTO tenant_subscriptions 
             (id, tenant_id, plan_id, status, trial_ends_at, created_at)
             VALUES (?, ?, 'plan_free_trial', 'trialing', ?, CURRENT_TIMESTAMP)`,
            [uuid(), tenantId, expiresAt.toISOString()]
        );

        // Load demo data
        _loadDemoCalls(tenantId, now);
        _loadDemoAppointments(tenantId, now);
        _loadDemoUsage(tenantId);

        // Generate temporary JWT
        const token = jwt.sign(
            { userId, tenantId, role: 'admin', demo: true, exp: Math.floor(expiresAt.getTime() / 1000) },
            process.env.JWT_SECRET || 'demo-secret'
        );

        // Schedule teardown
        _scheduleTeardown(tenantId, DEMO_TTL_MINUTES);

        logger.info('Demo tenant provisioned', { tenantId, expiresAt: expiresAt.toISOString() });

        res.status(201).json({
            success: true,
            demo: {
                tenant_id: tenantId,
                token,
                business: DEMO_BUSINESS,
                expires_at: expiresAt.toISOString(),
                ttl_minutes: DEMO_TTL_MINUTES,
                dashboard_url: `/admin?demo=true&token=${token}`
            },
            preloaded: {
                calls: DEMO_CALLS.length,
                appointments: DEMO_APPOINTMENTS.length,
                analytics: DEMO_ANALYTICS
            }
        });
    } catch (err) {
        logger.error('Demo provisioning failed', { error: err.message });
        res.status(500).json({ error: 'Demo setup failed — try again' });
    }
});

/**
 * GET /api/demo/analytics
 * Pre-computed analytics for the demo dashboard.
 */
router.get('/analytics', (req, res) => {
    res.json({
        analytics: DEMO_ANALYTICS,
        period: 'Last 7 days',
        note: 'This is demo data. Sign up for real analytics on your calls.'
    });
});

/**
 * DELETE /api/demo/:tenantId
 * Manual teardown (also runs automatically after TTL).
 */
router.delete('/:tenantId', (req, res) => {
    try {
        const { tenantId } = req.params;
        if (!tenantId.startsWith('demo_')) return res.status(400).json({ error: 'Not a demo tenant' });
        _teardownDemo(tenantId);
        res.json({ success: true, message: 'Demo data cleaned up' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

function _loadDemoCalls(tenantId, now) {
    for (const call of DEMO_CALLS) {
        const createdAt = new Date(now.getTime() + call.created_offset_hours * 3600000);
        try {
            dbRun(
                `INSERT INTO calls (id, tenant_id, caller_number, direction, call_type, 
                 duration_seconds, status, resolution, sentiment, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuid(), tenantId, call.caller, call.direction, call.type,
                Math.round(call.duration_min * 60), call.status, call.resolution,
                call.sentiment, createdAt.toISOString()]
            );
        } catch (e) { /* table may not exist */ }
    }
}

function _loadDemoAppointments(tenantId, now) {
    for (const apt of DEMO_APPOINTMENTS) {
        const dateTime = new Date(now.getTime() + apt.date_offset_hours * 3600000);
        try {
            dbRun(
                `INSERT INTO appointments (id, tenant_id, customer_name, appointment_type,
                 scheduled_at, duration_minutes, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [uuid(), tenantId, apt.patient, apt.type, dateTime.toISOString(),
                apt.duration_min, apt.status]
            );
        } catch (e) { /* table may not exist */ }
    }
}

function _loadDemoUsage(tenantId) {
    try {
        const month = new Date().toISOString().slice(0, 7);
        dbRun(
            `INSERT OR IGNORE INTO usage_metrics (id, tenant_id, month, call_minutes, ai_tokens)
             VALUES (?, ?, ?, 42, 8500)`,
            [uuid(), tenantId, month]
        );
    } catch (e) { /* non-blocking */ }
}

function _scheduleTeardown(tenantId, ttlMinutes) {
    setTimeout(() => {
        _teardownDemo(tenantId);
    }, ttlMinutes * 60000);
}

function _teardownDemo(tenantId) {
    try {
        const tables = ['calls', 'appointments', 'usage_metrics', 'tenant_subscriptions',
            'onboarding_checklist', 'users', 'tenants'];
        for (const table of tables) {
            try {
                dbRun(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
            } catch (e) { /* table may not exist */ }
        }
        logger.info('Demo tenant torn down', { tenantId });
    } catch (e) {
        logger.warn('Demo teardown partial', { tenantId, error: e.message });
    }
}

module.exports = router;
