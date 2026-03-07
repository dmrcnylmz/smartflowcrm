/**
 * LLM Circuit Breaker Alert Integration
 *
 * Wires circuit breaker state changes to the alert dispatcher
 * for Slack/Telegram/Console notifications.
 *
 * When a provider goes OPEN (down): warning/critical alert
 * When a provider recovers (CLOSED): info alert
 *
 * Uses the existing event system: CircuitBreaker.on('stateChange', handler)
 * Uses the existing alert dispatcher: dispatchAlert() with rate limiting
 *
 * Initialization is idempotent — safe to call multiple times.
 */

import {
    groqCircuitBreaker,
    geminiCircuitBreaker,
    openaiCircuitBreaker,
    type CircuitBreakerStats,
    type CircuitState,
} from '@/lib/voice/circuit-breaker';
import { dispatchAlert, type AlertPayload } from '@/lib/billing/alert-dispatcher';

// ─── Provider Metadata ──────────────────────────────────────────────────────

interface ProviderAlertConfig {
    name: string;
    /** Alert level when circuit opens (openai is critical — last resort) */
    openLevel: AlertPayload['level'];
    /** Human-readable label for alerts */
    label: string;
}

const PROVIDER_CONFIG: Record<string, ProviderAlertConfig> = {
    groq: {
        name: 'groq',
        openLevel: 'warning',
        label: 'Groq (llama-3.3-70b)',
    },
    gemini: {
        name: 'gemini',
        openLevel: 'warning',
        label: 'Google Gemini Flash',
    },
    openai: {
        name: 'openai',
        openLevel: 'critical',  // Last resort provider — critical if down
        label: 'OpenAI GPT-4o-mini',
    },
};

// ─── Alert Helpers ───────────────────────────────────────────────────────────

function buildAlertForStateChange(
    config: ProviderAlertConfig,
    newState: CircuitState,
    previousState: CircuitState,
    stats: CircuitBreakerStats,
    error?: Error,
): AlertPayload | null {
    // Only alert on meaningful transitions
    if (newState === 'open') {
        return {
            level: config.openLevel,
            title: `LLM Provider Down: ${config.label}`,
            message:
                `Circuit breaker AÇILDI → ${config.label} devre dışı.\n` +
                `Sebep: ${error?.message || 'Bilinmiyor'}\n` +
                `Toplam hata: ${stats.totalFailures} | Açılma sayısı: ${stats.openCount}\n` +
                `Fallback zinciri devrede — diğer provider'lar kullanılıyor.`,
            tenantId: 'system', // System-wide alert, not tenant-specific
            metadata: {
                provider: config.name,
                previousState,
                newState,
                totalFailures: stats.totalFailures,
                totalRequests: stats.totalRequests,
                openCount: stats.openCount,
                errorMessage: error?.message,
            },
        };
    }

    if (newState === 'closed' && previousState === 'open') {
        return {
            level: 'info',
            title: `LLM Provider Recovered: ${config.label}`,
            message:
                `Circuit breaker KAPANDI → ${config.label} tekrar aktif.\n` +
                `Toplam istek: ${stats.totalRequests} | Başarılı: ${stats.totalSuccesses}`,
            tenantId: 'system',
            metadata: {
                provider: config.name,
                previousState,
                newState,
                totalRequests: stats.totalRequests,
                totalSuccesses: stats.totalSuccesses,
            },
        };
    }

    // half_open transitions don't need alerts
    return null;
}

// ─── Initialization ──────────────────────────────────────────────────────────

let initialized = false;

/**
 * Wire all LLM circuit breakers to the alert dispatcher.
 * Idempotent — safe to call multiple times.
 */
export function initLLMCircuitAlerts(): void {
    if (initialized) return;
    initialized = true;

    const breakers = [
        { breaker: groqCircuitBreaker, config: PROVIDER_CONFIG.groq },
        { breaker: geminiCircuitBreaker, config: PROVIDER_CONFIG.gemini },
        { breaker: openaiCircuitBreaker, config: PROVIDER_CONFIG.openai },
    ];

    for (const { breaker, config } of breakers) {
        breaker.on('stateChange', ({ state, previousState, error, stats }) => {
            const alert = buildAlertForStateChange(config, state, previousState, stats, error);
            if (alert) {
                // Fire-and-forget — never blocks the circuit breaker
                dispatchAlert(alert);
            }
        });
    }
}
