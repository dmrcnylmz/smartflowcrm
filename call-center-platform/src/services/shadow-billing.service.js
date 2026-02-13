/**
 * Shadow Billing Logger — Real-Time Cost Event Tracker
 * 
 * Captures every provider interaction as a billing event.
 * Enables reconciliation against real provider invoices.
 * 
 * PRICING RULE: Customer-facing fields are MINUTES only.
 * Token/character fields exist only in internal shadow events.
 * 
 * Event Flow:
 *   Call Starts → Twilio event
 *   STT processes → Deepgram event (per utterance or per call)
 *   LLM responds  → OpenAI event (per completion)
 *   TTS speaks    → ElevenLabs event (per synthesis)
 *   Call Ends     → Summary computed → Customer charge calculated
 */
const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const { PROVIDER_RATES, DEFAULT_TENANT_RATES } = require('./cost-calculator.service');

const logger = rootLogger.child({ component: 'shadow-billing' });

class ShadowBillingLogger {

    // ─── Event Logging ───────────────────────────────

    /**
     * Log a Twilio telephony event.
     */
    logTwilio(callId, tenantId, { durationSec, direction = 'inbound', correlationId, providerRequestId }) {
        const minutes = durationSec / 60;
        const rate = direction === 'outbound'
            ? PROVIDER_RATES.twilio.voice_outbound_per_min
            : PROVIDER_RATES.twilio.voice_inbound_per_min;
        const cost = minutes * rate;

        return this._logEvent({
            callId, tenantId, correlationId,
            provider: 'twilio',
            service: `voice_${direction}`,
            providerRequestId,
            usageQuantity: minutes,
            usageUnit: 'minute',
            calculatedCost: cost,
            rateApplied: rate
        });
    }

    /**
     * Log a Deepgram STT event.
     */
    logSTT(callId, tenantId, { durationSec, correlationId, providerRequestId, selfHosted = false }) {
        const rate = selfHosted
            ? PROVIDER_RATES.self_hosted.stt_per_second
            : PROVIDER_RATES.deepgram.stt_per_second;
        const cost = durationSec * rate;

        return this._logEvent({
            callId, tenantId, correlationId,
            provider: selfHosted ? 'self_hosted' : 'deepgram',
            service: 'stt',
            providerRequestId,
            usageQuantity: durationSec,
            usageUnit: 'second',
            calculatedCost: cost,
            rateApplied: rate
        });
    }

    /**
     * Log an ElevenLabs TTS event.
     */
    logTTS(callId, tenantId, { characters, correlationId, providerRequestId, selfHosted = false }) {
        const rate = selfHosted
            ? PROVIDER_RATES.self_hosted.tts_per_character
            : PROVIDER_RATES.elevenlabs.tts_per_character;
        const cost = characters * rate;

        return this._logEvent({
            callId, tenantId, correlationId,
            provider: selfHosted ? 'self_hosted' : 'elevenlabs',
            service: 'tts',
            providerRequestId,
            usageQuantity: characters,
            usageUnit: 'character',
            calculatedCost: cost,
            rateApplied: rate
        });
    }

    /**
     * Log an OpenAI LLM event.
     */
    logLLM(callId, tenantId, { inputTokens, outputTokens, correlationId, providerRequestId, selfHosted = false }) {
        let cost;
        if (selfHosted) {
            cost = (inputTokens * PROVIDER_RATES.self_hosted.llm_input_per_token)
                + (outputTokens * PROVIDER_RATES.self_hosted.llm_output_per_token);
        } else {
            cost = (inputTokens * PROVIDER_RATES.openai.gpt4o_mini_input_per_token)
                + (outputTokens * PROVIDER_RATES.openai.gpt4o_mini_output_per_token);
        }

        // Log as total tokens but track input/output in the quantity
        const totalTokens = inputTokens + outputTokens;

        return this._logEvent({
            callId, tenantId, correlationId,
            provider: selfHosted ? 'self_hosted' : 'openai',
            service: 'llm_completion',
            providerRequestId,
            usageQuantity: totalTokens,
            usageUnit: 'token',
            calculatedCost: cost,
            rateApplied: 0 // blended rate, see provider_snapshot
        });
    }

    // ─── Call Summary ────────────────────────────────

    /**
     * Compute and store per-call summary from shadow events.
     * Called when a call ends.
     * 
     * @param {string} callId
     * @param {string} tenantId
     * @param {Object} planInfo — { name, included_remaining, overage_rate }
     */
    summarizeCall(callId, tenantId, planInfo = {}) {
        const events = this.getCallEvents(callId);
        if (!events.length) return null;

        // Aggregate COGS by provider
        const cogs = { twilio: 0, stt: 0, tts: 0, llm: 0 };
        let callDurationMin = 0;

        for (const e of events) {
            switch (e.provider) {
                case 'twilio':
                    cogs.twilio += e.calculated_cost;
                    callDurationMin += e.usage_quantity; // already in minutes
                    break;
                case 'deepgram':
                case 'self_hosted':
                    if (e.service === 'stt') cogs.stt += e.calculated_cost;
                    else if (e.service === 'tts') cogs.tts += e.calculated_cost;
                    else if (e.service === 'llm_completion') cogs.llm += e.calculated_cost;
                    break;
                case 'elevenlabs':
                    cogs.tts += e.calculated_cost;
                    break;
                case 'openai':
                    cogs.llm += e.calculated_cost;
                    break;
            }
        }

        const cogsTotal = cogs.twilio + cogs.stt + cogs.tts + cogs.llm;
        const cogsPerMin = callDurationMin > 0 ? cogsTotal / callDurationMin : 0;

        // Customer charge calculation (MINUTES only)
        const includedRemaining = planInfo.included_remaining || 0;
        const overageRate = planInfo.overage_rate || 0;
        const isOverage = callDurationMin > includedRemaining && includedRemaining >= 0;
        const overageMinutes = isOverage ? Math.max(0, callDurationMin - Math.max(0, includedRemaining)) : 0;

        let customerCharge = 0;
        if (isOverage && overageRate > 0) {
            // Only charge for overage minutes
            customerCharge = overageMinutes * overageRate;
        }
        // Included minutes are covered by subscription fee — $0 per-call charge

        const margin = customerCharge - cogsTotal;
        const marginPct = customerCharge > 0 ? (margin / customerCharge) * 100 : 0;

        const id = uuid();
        try {
            dbRun(
                `INSERT OR REPLACE INTO shadow_billing_call_summary (
                    id, call_id, tenant_id,
                    call_duration_min, plan_name, included_remaining, is_overage,
                    overage_minutes, overage_rate, customer_charge,
                    cogs_twilio, cogs_stt, cogs_tts, cogs_llm, cogs_total, cogs_per_minute,
                    margin, margin_pct
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, callId, tenantId,
                    _round(callDurationMin, 4), planInfo.name || 'unknown',
                    _round(includedRemaining, 2), isOverage ? 1 : 0,
                    _round(overageMinutes, 4), overageRate, _round(customerCharge, 4),
                    _round(cogs.twilio, 6), _round(cogs.stt, 6),
                    _round(cogs.tts, 6), _round(cogs.llm, 6),
                    _round(cogsTotal, 6), _round(cogsPerMin, 6),
                    _round(margin, 4), _round(marginPct, 1)
                ]
            );
        } catch (e) {
            logger.error('Failed to store call summary', { callId, error: e.message });
        }

        return {
            call_id: callId,
            duration_min: _round(callDurationMin, 2),
            is_overage: isOverage,
            overage_minutes: _round(overageMinutes, 2),
            customer_charge: _round(customerCharge, 4),
            cogs_total: _round(cogsTotal, 4),
            margin_pct: _round(marginPct, 1)
        };
    }

    // ─── Reconciliation ──────────────────────────────

    /**
     * Import a provider invoice for reconciliation.
     */
    importInvoice(provider, { invoiceId, periodStart, periodEnd, totalAmount, lineItems }) {
        // Calculate our total for the same period
        const ourTotal = dbPrepareGet(
            `SELECT COALESCE(SUM(calculated_cost), 0) as total
             FROM shadow_billing_events 
             WHERE provider = ? AND event_timestamp >= ? AND event_timestamp < ?`,
            [provider, periodStart, periodEnd]
        );

        const deviation = totalAmount - (ourTotal?.total || 0);
        const deviationPct = ourTotal?.total > 0
            ? Math.abs(deviation) / ourTotal.total * 100 : 100;

        const id = uuid();
        dbRun(
            `INSERT INTO provider_invoice_imports (
                id, provider, invoice_id, period_start, period_end,
                total_amount, line_items, our_calculated_total,
                deviation, deviation_pct, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, provider, invoiceId, periodStart, periodEnd,
                totalAmount, JSON.stringify(lineItems || []),
                ourTotal?.total || 0, _round(deviation, 4), _round(deviationPct, 2),
                deviationPct <= 5 ? 'matched' : 'deviation'
            ]
        );

        // Auto-reconcile individual events if within threshold
        if (deviationPct <= 5) {
            dbRun(
                `UPDATE shadow_billing_events SET reconciled = 1, reconciled_at = datetime('now'),
                 reconciled_by = 'auto' WHERE provider = ? AND event_timestamp >= ? AND event_timestamp < ?`,
                [provider, periodStart, periodEnd]
            );
        }

        return {
            id, provider,
            our_total: _round(ourTotal?.total || 0, 4),
            invoice_total: totalAmount,
            deviation: _round(deviation, 4),
            deviation_pct: _round(deviationPct, 2),
            status: deviationPct <= 5 ? 'matched' : 'deviation'
        };
    }

    /**
     * Get reconciliation status across all providers.
     */
    getReconciliationStatus(periodStart, periodEnd) {
        const providers = ['twilio', 'deepgram', 'elevenlabs', 'openai'];
        const results = {};

        for (const provider of providers) {
            const events = dbPrepareGet(
                `SELECT COUNT(*) as total_events, 
                        SUM(CASE WHEN reconciled = 1 THEN 1 ELSE 0 END) as reconciled_events,
                        COALESCE(SUM(calculated_cost), 0) as our_total
                 FROM shadow_billing_events
                 WHERE provider = ? AND event_timestamp >= ? AND event_timestamp < ?`,
                [provider, periodStart, periodEnd]
            );

            const invoice = dbPrepareGet(
                `SELECT * FROM provider_invoice_imports
                 WHERE provider = ? AND period_start >= ? AND period_end <= ?
                 ORDER BY imported_at DESC LIMIT 1`,
                [provider, periodStart, periodEnd]
            );

            results[provider] = {
                total_events: events?.total_events || 0,
                reconciled_events: events?.reconciled_events || 0,
                our_calculated: _round(events?.our_total || 0, 4),
                invoice_total: invoice?.total_amount || null,
                deviation_pct: invoice?.deviation_pct || null,
                status: invoice?.status || 'no_invoice'
            };
        }

        return results;
    }

    // ─── Queries ─────────────────────────────────────

    getCallEvents(callId) {
        return dbPrepareAll(
            'SELECT * FROM shadow_billing_events WHERE call_id = ? ORDER BY event_timestamp',
            [callId]
        ) || [];
    }

    getTenantEvents(tenantId, limit = 100) {
        return dbPrepareAll(
            'SELECT * FROM shadow_billing_events WHERE tenant_id = ? ORDER BY event_timestamp DESC LIMIT ?',
            [tenantId, limit]
        ) || [];
    }

    getUnreconciledEvents(provider, limit = 500) {
        return dbPrepareAll(
            'SELECT * FROM shadow_billing_events WHERE provider = ? AND reconciled = 0 ORDER BY event_timestamp LIMIT ?',
            [provider, limit]
        ) || [];
    }

    /**
     * Get aggregate stats for a period (internal dashboard).
     */
    getPeriodStats(tenantId, periodStart, periodEnd) {
        return dbPrepareGet(
            `SELECT 
                COUNT(*) as total_events,
                COUNT(DISTINCT call_id) as total_calls,
                COALESCE(SUM(CASE WHEN provider = 'twilio' THEN calculated_cost ELSE 0 END), 0) as twilio_total,
                COALESCE(SUM(CASE WHEN service = 'stt' THEN calculated_cost ELSE 0 END), 0) as stt_total,
                COALESCE(SUM(CASE WHEN service = 'tts' THEN calculated_cost ELSE 0 END), 0) as tts_total,
                COALESCE(SUM(CASE WHEN service = 'llm_completion' THEN calculated_cost ELSE 0 END), 0) as llm_total,
                COALESCE(SUM(calculated_cost), 0) as cogs_total
             FROM shadow_billing_events
             WHERE tenant_id = ? AND event_timestamp >= ? AND event_timestamp < ?`,
            [tenantId, periodStart, periodEnd]
        );
    }

    // ─── Internal ────────────────────────────────────

    _logEvent({ callId, tenantId, correlationId, provider, service, providerRequestId,
        usageQuantity, usageUnit, calculatedCost, rateApplied }) {
        const id = uuid();
        try {
            dbRun(
                `INSERT INTO shadow_billing_events (
                    id, call_id, tenant_id, correlation_id,
                    provider, service, provider_request_id,
                    usage_quantity, usage_unit, calculated_cost, rate_applied
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, callId, tenantId, correlationId,
                    provider, service, providerRequestId,
                    _round(usageQuantity, 6), usageUnit,
                    _round(calculatedCost, 8), rateApplied
                ]
            );
            logger.debug('Shadow billing event logged', { id, callId, provider, service, cost: calculatedCost });
        } catch (e) {
            logger.error('Shadow billing event failed', { callId, provider, error: e.message });
        }
        return { id, provider, service, cost: _round(calculatedCost, 6) };
    }
}

function _round(n, d) {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
}

module.exports = new ShadowBillingLogger();
