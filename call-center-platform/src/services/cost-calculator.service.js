/**
 * Call Cost Calculator Service — Per-Call COGS Engine
 * 
 * Accepts call metrics, applies provider pricing,
 * returns itemized cost breakdown with margin analysis.
 * 
 * Provider Pricing (Feb 2026):
 *   Twilio Voice:      $0.0085/min inbound, $0.014/min outbound
 *   Deepgram Nova-2:   $0.0002/sec ($0.012/min)
 *   ElevenLabs Turbo:  $0.00003/char
 *   OpenAI GPT-4o-mini: $0.15/1M input, $0.60/1M output
 */
const { dbPrepareGet, dbPrepareAll, dbRun } = require('../config/database');
const { v4: uuid } = require('uuid');

// ─── Provider Pricing Constants ──────────────────────────

const PROVIDER_RATES = {
    twilio: {
        voice_inbound_per_min: 0.0085,
        voice_outbound_per_min: 0.014,
    },
    deepgram: {
        stt_per_second: 0.0002,    // Nova-2 Pay-as-you-go
    },
    elevenlabs: {
        tts_per_character: 0.00003, // Turbo v2.5
    },
    openai: {
        gpt4o_mini_input_per_token: 0.00000015,  // $0.15/1M
        gpt4o_mini_output_per_token: 0.0000006,   // $0.60/1M
    },
    // Self-hosted fallback (Whisper + VITS on GPU)
    self_hosted: {
        stt_per_second: 0.00005,   // ~$0.003/min on RunPod
        tts_per_character: 0.000005,
        llm_input_per_token: 0.00000005,
        llm_output_per_token: 0.0000002,
    }
};

// Default tenant markup: what we charge per unit
const DEFAULT_TENANT_RATES = {
    per_minute: 0.06,     // $0.06/min to tenant (vs ~$0.023 COGS = 62% margin)
    per_ai_token: 0.00001,  // $10/1M tokens to tenant
};

class CallCostCalculator {

    /**
     * Calculate per-call cost breakdown.
     * 
     * @param {Object} params
     * @param {number} params.callDurationSec    — total call duration in seconds
     * @param {number} params.sttDurationSec     — STT processing seconds
     * @param {number} params.ttsDurationSec     — TTS audio duration in seconds
     * @param {number} params.ttsCharacters      — characters sent to TTS
     * @param {number} params.llmInputTokens     — LLM prompt tokens
     * @param {number} params.llmOutputTokens    — LLM completion tokens
     * @param {string} [params.callDirection]     — 'inbound' or 'outbound'
     * @param {string} [params.sttProvider]       — 'deepgram' or 'self_hosted'
     * @param {string} [params.ttsProvider]       — 'elevenlabs' or 'self_hosted'
     * @param {string} [params.llmProvider]       — 'openai' or 'self_hosted'
     * @param {number} [params.tenantRatePerMin]  — tenant billing rate per minute
     * @returns {Object} cost breakdown
     */
    calculate({
        callDurationSec = 0,
        sttDurationSec = 0,
        ttsDurationSec = 0,
        ttsCharacters = 0,
        llmInputTokens = 0,
        llmOutputTokens = 0,
        callDirection = 'inbound',
        sttProvider = 'deepgram',
        ttsProvider = 'elevenlabs',
        llmProvider = 'openai',
        tenantRatePerMin = DEFAULT_TENANT_RATES.per_minute
    }) {
        const callMinutes = callDurationSec / 60;

        // ─── 1. Twilio (Telephony) ───────────────
        const twilioRate = callDirection === 'outbound'
            ? PROVIDER_RATES.twilio.voice_outbound_per_min
            : PROVIDER_RATES.twilio.voice_inbound_per_min;
        const twilioCost = callMinutes * twilioRate;

        // ─── 2. STT (Speech-to-Text) ────────────
        const sttRate = sttProvider === 'self_hosted'
            ? PROVIDER_RATES.self_hosted.stt_per_second
            : PROVIDER_RATES.deepgram.stt_per_second;
        const sttCost = sttDurationSec * sttRate;

        // ─── 3. TTS (Text-to-Speech) ────────────
        const ttsRate = ttsProvider === 'self_hosted'
            ? PROVIDER_RATES.self_hosted.tts_per_character
            : PROVIDER_RATES.elevenlabs.tts_per_character;
        const ttsCost = ttsCharacters * ttsRate;

        // ─── 4. LLM (AI Inference) ──────────────
        let llmInputRate, llmOutputRate;
        if (llmProvider === 'self_hosted') {
            llmInputRate = PROVIDER_RATES.self_hosted.llm_input_per_token;
            llmOutputRate = PROVIDER_RATES.self_hosted.llm_output_per_token;
        } else {
            llmInputRate = PROVIDER_RATES.openai.gpt4o_mini_input_per_token;
            llmOutputRate = PROVIDER_RATES.openai.gpt4o_mini_output_per_token;
        }
        const llmCost = (llmInputTokens * llmInputRate) + (llmOutputTokens * llmOutputRate);

        // ─── Totals ─────────────────────────────
        const totalCogs = twilioCost + sttCost + ttsCost + llmCost;
        const tenantCharge = callMinutes * tenantRatePerMin;
        const margin = tenantCharge - totalCogs;
        const marginPct = tenantCharge > 0 ? (margin / tenantCharge) * 100 : 0;

        return {
            // Input metrics
            metrics: {
                call_duration_sec: callDurationSec,
                call_duration_min: _round(callMinutes, 2),
                stt_duration_sec: sttDurationSec,
                tts_characters: ttsCharacters,
                llm_input_tokens: llmInputTokens,
                llm_output_tokens: llmOutputTokens,
                direction: callDirection,
            },

            // COGS breakdown
            cogs: {
                twilio: { provider: 'twilio', rate: twilioRate, unit: '/min', cost: _round(twilioCost, 6) },
                stt: { provider: sttProvider, rate: sttRate, unit: '/sec', cost: _round(sttCost, 6) },
                tts: { provider: ttsProvider, rate: ttsRate, unit: '/char', cost: _round(ttsCost, 6) },
                llm: { provider: llmProvider, input_rate: llmInputRate, output_rate: llmOutputRate, cost: _round(llmCost, 6) },
                total: _round(totalCogs, 6),
            },

            // Revenue
            revenue: {
                tenant_rate_per_min: tenantRatePerMin,
                tenant_charge: _round(tenantCharge, 4),
                margin: _round(margin, 4),
                margin_pct: _round(marginPct, 1),
            },

            // Summary
            summary: {
                cogs_per_minute: callMinutes > 0 ? _round(totalCogs / callMinutes, 4) : 0,
                revenue_per_minute: tenantRatePerMin,
                profit_per_minute: callMinutes > 0 ? _round(margin / callMinutes, 4) : 0,
            }
        };
    }

    /**
     * Calculate and persist cost for a completed call.
     */
    calculateAndStore(callId, tenantId, params) {
        const result = this.calculate(params);

        const id = uuid();
        try {
            dbRun(
                `INSERT INTO call_costs (
                    id, call_id, tenant_id,
                    call_duration_s, stt_duration_s, tts_duration_s, tts_characters,
                    llm_input_tokens, llm_output_tokens,
                    twilio_cost, stt_cost, tts_cost, llm_cost, total_cogs,
                    tenant_charge, margin, margin_pct,
                    provider_snapshot
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, callId, tenantId,
                    params.callDurationSec || 0,
                    params.sttDurationSec || 0,
                    params.ttsDurationSec || 0,
                    params.ttsCharacters || 0,
                    params.llmInputTokens || 0,
                    params.llmOutputTokens || 0,
                    result.cogs.twilio.cost,
                    result.cogs.stt.cost,
                    result.cogs.tts.cost,
                    result.cogs.llm.cost,
                    result.cogs.total,
                    result.revenue.tenant_charge,
                    result.revenue.margin,
                    result.revenue.margin_pct,
                    JSON.stringify(PROVIDER_RATES)
                ]
            );
        } catch (e) {
            // Table may not exist yet
        }

        return { id, ...result };
    }

    /**
     * Get cost breakdown for a specific call.
     */
    getCallCost(callId) {
        return dbPrepareGet('SELECT * FROM call_costs WHERE call_id = ?', [callId]);
    }

    /**
     * Get monthly cost summary for a tenant.
     */
    getMonthlySummary(tenantId, month) {
        const m = month || new Date().toISOString().slice(0, 7);
        return dbPrepareGet(
            'SELECT * FROM monthly_cost_summary WHERE tenant_id = ? AND month = ?',
            [tenantId, m]
        );
    }

    /**
     * Aggregate and store monthly cost summary.
     */
    aggregateMonth(tenantId, month) {
        const m = month || new Date().toISOString().slice(0, 7);

        const agg = dbPrepareGet(
            `SELECT 
                COUNT(*) as total_calls,
                COALESCE(SUM(call_duration_s), 0) / 60.0 as total_minutes,
                COALESCE(SUM(stt_duration_s), 0) / 60.0 as total_stt_min,
                COALESCE(SUM(tts_characters), 0) as total_tts_chars,
                COALESCE(SUM(llm_input_tokens), 0) as total_llm_in,
                COALESCE(SUM(llm_output_tokens), 0) as total_llm_out,
                COALESCE(SUM(twilio_cost), 0) as total_twilio,
                COALESCE(SUM(stt_cost), 0) as total_stt,
                COALESCE(SUM(tts_cost), 0) as total_tts,
                COALESCE(SUM(llm_cost), 0) as total_llm,
                COALESCE(SUM(total_cogs), 0) as total_cogs,
                COALESCE(SUM(tenant_charge), 0) as total_revenue,
                COALESCE(SUM(margin), 0) as total_margin,
                COALESCE(AVG(margin_pct), 0) as avg_margin_pct,
                CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_cogs), 0) / COUNT(*) ELSE 0 END as avg_cost_per_call
             FROM call_costs 
             WHERE tenant_id = ? AND created_at LIKE ?`,
            [tenantId, m + '%']
        );

        if (!agg || agg.total_calls === 0) return null;

        const id = uuid();
        try {
            dbRun(
                `INSERT OR REPLACE INTO monthly_cost_summary (
                    id, tenant_id, month,
                    total_calls, total_minutes, total_stt_min, total_tts_chars,
                    total_llm_in, total_llm_out,
                    total_twilio, total_stt, total_tts, total_llm, total_cogs,
                    total_revenue, total_margin, avg_margin_pct, avg_cost_per_call,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    id, tenantId, m,
                    agg.total_calls, agg.total_minutes, agg.total_stt_min, agg.total_tts_chars,
                    agg.total_llm_in, agg.total_llm_out,
                    agg.total_twilio, agg.total_stt, agg.total_tts, agg.total_llm, agg.total_cogs,
                    agg.total_revenue, agg.total_margin, agg.avg_margin_pct, agg.avg_cost_per_call
                ]
            );
        } catch (e) { /* table may not exist */ }

        return agg;
    }

    /**
     * Batch calculate for multiple scenarios (pricing simulator).
     */
    simulate(scenarios) {
        return scenarios.map(s => ({
            scenario: s.label || 'unnamed',
            ...this.calculate(s)
        }));
    }

    /**
     * Get provider rates (for transparency/display).
     */
    getProviderRates() {
        return PROVIDER_RATES;
    }
}

function _round(n, decimals) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
}

module.exports = new CallCostCalculator();
module.exports.PROVIDER_RATES = PROVIDER_RATES;
module.exports.DEFAULT_TENANT_RATES = DEFAULT_TENANT_RATES;
