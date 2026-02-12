/**
 * AI Service — Voice AI Core
 * 
 * Production-grade local NLP engine for call analysis.
 * Provides intent detection, sentiment analysis, contextual summaries,
 * and next-action recommendations — all config-driven per tenant.
 */
const { dbPrepareGet, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');

// ──────────────── Intent Detection ────────────────

const INTENT_PATTERNS = {
    appointment: {
        keywords: ['randevu', 'appointment', 'tarih', 'saat', 'zaman', 'müsait', 'planla', 'schedule', 'book', 'meet', 'görüşme', 'toplantı'],
        weight: 1.0
    },
    complaint: {
        keywords: ['şikayet', 'sorun', 'problem', 'hata', 'arıza', 'memnun değil', 'complaint', 'issue', 'broken', 'defective', 'kırık', 'bozuk', 'gecikme', 'geç'],
        weight: 1.0
    },
    pricing: {
        keywords: ['fiyat', 'ücret', 'maliyet', 'teklif', 'indirim', 'price', 'cost', 'quote', 'discount', 'kampanya', 'paket', 'plan', 'tarife', 'ödeme'],
        weight: 1.0
    },
    human: {
        keywords: ['yönetici', 'müdür', 'supervisor', 'manager', 'insan', 'gerçek kişi', 'human', 'transfer', 'bağla', 'yetkili'],
        weight: 1.2
    },
    tracking: {
        keywords: ['kargo', 'takip', 'nerede', 'teslimat', 'shipment', 'tracking', 'delivery', 'gönderi', 'paket'],
        weight: 1.0
    },
    refund: {
        keywords: ['iade', 'geri ödeme', 'refund', 'return', 'iptal', 'cancel', 'para iade'],
        weight: 1.0
    },
    technical: {
        keywords: ['teknik', 'technical', 'çalışmıyor', 'bağlanamıyor', 'error', 'bug', 'sistem', 'güncelleme', 'kurulum', 'install'],
        weight: 0.9
    }
};

const INTENT_CATEGORIES = ['appointment', 'complaint', 'pricing', 'human', 'other'];

function detectIntent(transcript) {
    if (!transcript) return 'other';

    const text = transcript.toLowerCase();
    const scores = {};

    for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
        let score = 0;
        for (const kw of config.keywords) {
            const regex = new RegExp(kw, 'gi');
            const matches = text.match(regex);
            if (matches) score += matches.length * config.weight;
        }
        scores[intent] = score;
    }

    // Map sub-intents to main categories
    const categoryMap = {
        appointment: 'appointment',
        complaint: 'complaint',
        pricing: 'pricing',
        human: 'human',
        tracking: 'complaint',   // shipping issues map to complaint
        refund: 'complaint',
        technical: 'complaint'
    };

    let best = 'other';
    let bestScore = 0;
    for (const [intent, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            best = categoryMap[intent] || intent;
        }
    }

    return bestScore > 0 ? best : 'other';
}

// ──────────────── Sentiment Analysis ────────────────

const POSITIVE_WORDS = ['teşekkür', 'memnun', 'harika', 'mükemmel', 'güzel', 'iyi', 'süper', 'excellent', 'great', 'happy', 'satisfied', 'wonderful', 'perfect', 'thank', 'love', 'pleased', 'helpful',
    'çözüm', 'başarılı', 'beğen', 'tavsiye', 'öneri'];
const NEGATIVE_WORDS = ['kötü', 'berbat', 'rezalet', 'skandal', 'saçma', 'yetersiz', 'bad', 'terrible', 'awful', 'horrible', 'angry', 'frustrated', 'disappointed', 'worst', 'hate', 'useless',
    'şikayet', 'sorun', 'problem', 'hata', 'gecikme', 'memnun değil', 'kabul edilemez'];

function analyzeSentiment(transcript) {
    if (!transcript) return 0;

    const text = transcript.toLowerCase();
    let positive = 0, negative = 0;

    for (const w of POSITIVE_WORDS) {
        const matches = text.match(new RegExp(w, 'gi'));
        if (matches) positive += matches.length;
    }
    for (const w of NEGATIVE_WORDS) {
        const matches = text.match(new RegExp(w, 'gi'));
        if (matches) negative += matches.length;
    }

    const total = positive + negative;
    if (total === 0) return 0;

    // Scale to [-1, 1] range
    const raw = (positive - negative) / total;
    return parseFloat(Math.max(-1, Math.min(1, raw)).toFixed(2));
}

// ──────────────── Summary Generation ────────────────

const SUMMARY_TEMPLATES = {
    appointment: [
        'Customer requested appointment scheduling. {{resolution}}',
        'Call regarding meeting/appointment arrangement. {{resolution}}',
        'Inbound request for booking a consultation. {{resolution}}'
    ],
    complaint: [
        'Customer raised a concern about service quality. {{resolution}}',
        'Issue reported by customer requiring attention. {{resolution}}',
        'Customer expressed dissatisfaction and requested resolution. {{resolution}}'
    ],
    pricing: [
        'Customer inquired about pricing and plan options. {{resolution}}',
        'Pricing discussion with potential upsell opportunity. {{resolution}}',
        'Cost-related inquiry; customer comparing options. {{resolution}}'
    ],
    human: [
        'Customer requested transfer to supervisor/manager. {{resolution}}',
        'Call escalated due to customer request for human agent. {{resolution}}'
    ],
    other: [
        'General inquiry handled by agent. {{resolution}}',
        'Customer contacted for information. {{resolution}}',
        'Routine call processed by agent. {{resolution}}'
    ]
};

function generateSummary(intent, sentiment, queueName) {
    const templates = SUMMARY_TEMPLATES[intent] || SUMMARY_TEMPLATES.other;
    const template = templates[Math.floor(Math.random() * templates.length)];

    let resolution;
    if (sentiment >= 0.3) resolution = 'Customer appeared satisfied with the outcome.';
    else if (sentiment <= -0.3) resolution = 'Customer remained unsatisfied; follow-up recommended.';
    else resolution = 'Call resolved with neutral outcome.';

    if (queueName) {
        resolution += ` Handled via ${queueName} queue.`;
    }

    return template.replace('{{resolution}}', resolution);
}

// ──────────────── Next Action Recommendation ────────────────

function generateNextAction(intent, sentiment, resolutionStatus, tenantSettings) {
    const escalationRules = tenantSettings?.escalation_rules || 'Escalate to supervisor if unresolved.';

    // Intent-driven actions
    const intentActions = {
        appointment: 'Send appointment confirmation via email/SMS. Add calendar reminder.',
        complaint: sentiment <= -0.3
            ? `Urgent: ${escalationRules} Document complaint details for quality review.`
            : 'Log complaint in CRM. Schedule follow-up within 24 hours.',
        pricing: 'Send pricing sheet link. Schedule follow-up in 48 hours if no conversion.',
        human: `${escalationRules} Flag for supervisor review.`,
        other: 'No specific follow-up required. Standard call closure.'
    };

    let action = intentActions[intent] || intentActions.other;

    // Override based on resolution
    if (resolutionStatus === 'escalated') {
        action = `ESCALATED: ${escalationRules} Assign to senior agent immediately.`;
    } else if (resolutionStatus === 'follow_up') {
        action = `FOLLOW-UP: Schedule callback within 24 hours. ${action}`;
    } else if (resolutionStatus === 'unresolved') {
        action = `UNRESOLVED: Create ticket in helpdesk. ${action}`;
    }

    return action;
}

// ──────────────── System Prompt Builder ────────────────

function buildSystemPrompt(tenantSettings) {
    if (!tenantSettings) {
        return 'You are a professional call center agent. Be helpful, concise, and empathetic.';
    }

    let prompt = `You are a call center agent for ${tenantSettings.company_name}.\n`;
    prompt += `Tone: ${tenantSettings.tone}.\n`;

    if (tenantSettings.forbidden_topics) {
        const topics = tenantSettings.forbidden_topics.split(',').map(t => t.trim()).filter(Boolean);
        if (topics.length > 0) {
            prompt += `Never discuss: ${topics.join(', ')}.\n`;
        }
    }

    prompt += tenantSettings.escalation_rules || 'If unsure, escalate to a supervisor.';
    return prompt;
}

// ──────────────── Main Analysis Function ────────────────

/**
 * Analyze a call transcript using AI.
 * @param {string} transcript - The call transcript text
 * @param {object} tenantSettings - Tenant persona settings (from tenant_settings table)
 * @returns {{ intent: string, sentiment: number, summary: string, next_action: string }}
 */
function analyzeTranscript(transcript, tenantSettings = null) {
    const systemPrompt = buildSystemPrompt(tenantSettings);
    const intent = detectIntent(transcript);
    const sentiment = analyzeSentiment(transcript);

    // Filter forbidden topics from summary if configured
    let summary = generateSummary(intent, sentiment, null);
    if (tenantSettings?.forbidden_topics) {
        const forbidden = tenantSettings.forbidden_topics.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        for (const topic of forbidden) {
            summary = summary.replace(new RegExp(topic, 'gi'), '[REDACTED]');
        }
    }

    const next_action = generateNextAction(intent, sentiment, null, tenantSettings);

    // Estimate token usage (approx 1 token per 4 chars)
    const tokenEstimate = Math.ceil(
        (transcript?.length || 0) / 4 +
        systemPrompt.length / 4 +
        summary.length / 4 +
        next_action.length / 4
    );

    return {
        intent,
        sentiment,
        summary,
        next_action,
        token_estimate: tokenEstimate
    };
}

/**
 * Enrich a completed call with AI analysis and persist to DB.
 * Also tracks billing metrics.
 */
function enrichCall(callId, tenantId) {
    const call = dbPrepareGet('SELECT * FROM calls WHERE id = ? AND tenant_id = ?', [callId, tenantId]);
    if (!call || !call.transcript_text) return null;

    // Load tenant settings
    const settings = dbPrepareGet('SELECT * FROM tenant_settings WHERE tenant_id = ?', [tenantId]);

    const analysis = analyzeTranscript(call.transcript_text, settings);

    // Persist AI enrichment
    dbRun(
        `UPDATE calls SET intent = ?, ai_summary = ?, ai_next_action = ?, sentiment_score = ?
     WHERE id = ? AND tenant_id = ?`,
        [analysis.intent, analysis.summary, analysis.next_action, analysis.sentiment, callId, tenantId]
    );

    // Track billing — call minutes
    const minutes = Math.ceil((call.duration || 0) / 60);
    _trackUsage(tenantId, minutes, analysis.token_estimate);

    return analysis;
}

/**
 * Track usage metrics for billing.
 */
function _trackUsage(tenantId, callMinutes, aiTokens) {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM

    const existing = dbPrepareGet(
        'SELECT * FROM usage_metrics WHERE tenant_id = ? AND month = ?',
        [tenantId, month]
    );

    if (existing) {
        dbRun(
            `UPDATE usage_metrics SET call_minutes = call_minutes + ?, ai_tokens = ai_tokens + ?, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = ? AND month = ?`,
            [callMinutes, aiTokens, tenantId, month]
        );
    } else {
        const { v4: uuid } = require('uuid');
        dbRun(
            `INSERT INTO usage_metrics (id, tenant_id, month, call_minutes, ai_tokens)
       VALUES (?, ?, ?, ?, ?)`,
            [uuid(), tenantId, month, callMinutes, aiTokens]
        );
    }
}

module.exports = {
    analyzeTranscript,
    enrichCall,
    buildSystemPrompt,
    detectIntent,
    analyzeSentiment,
    INTENT_CATEGORIES,
    _trackUsage
};
