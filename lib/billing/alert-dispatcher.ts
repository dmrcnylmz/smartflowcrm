/**
 * Alert Dispatcher — Multi-Channel Notification System
 *
 * Sends critical system alerts to configured channels:
 * - Slack webhook
 * - Telegram bot
 * - Console (always, for structured logging)
 *
 * All dispatches are fire-and-forget — never blocks the pipeline.
 * Env vars:
 *   ALERT_SLACK_WEBHOOK_URL   — Slack incoming webhook URL
 *   ALERT_TELEGRAM_BOT_TOKEN  — Telegram bot API token
 *   ALERT_TELEGRAM_CHAT_ID    — Telegram chat/group ID
 */

import { billingLogger } from '@/lib/utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AlertPayload {
    level: 'info' | 'warning' | 'critical' | 'emergency';
    title: string;
    message: string;
    tenantId: string;
    metadata?: Record<string, unknown>;
    timestamp?: Date;
}

// ─── Configuration ───────────────────────────────────────────────────────────
// Read env vars lazily via getters to avoid Vercel serverless runtime issues
// (module-level process.env reads may resolve before env vars are injected)

function getSlackWebhookUrl(): string {
    return process.env.ALERT_SLACK_WEBHOOK_URL || '';
}
function getTelegramBotToken(): string {
    return process.env.ALERT_TELEGRAM_BOT_TOKEN || '';
}
function getTelegramChatId(): string {
    return process.env.ALERT_TELEGRAM_CHAT_ID || '';
}

// Rate limiting: max 1 alert per type per 5 minutes
const recentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Dispatch an alert to all configured channels.
 * Fire-and-forget — never throws, never blocks.
 */
export function dispatchAlert(payload: AlertPayload): void {
    const alert = { ...payload, timestamp: payload.timestamp || new Date() };

    // Rate limit check
    const rateKey = `${alert.tenantId}:${alert.level}:${alert.title}`;
    const lastSent = recentAlerts.get(rateKey);
    if (lastSent && Date.now() - lastSent < ALERT_COOLDOWN_MS) {
        return; // Throttled
    }
    recentAlerts.set(rateKey, Date.now());

    // Clean old rate limit entries periodically
    if (recentAlerts.size > 100) {
        const now = Date.now();
        for (const [key, time] of recentAlerts) {
            if (now - time > ALERT_COOLDOWN_MS) recentAlerts.delete(key);
        }
    }

    // Console (always)
    logToConsole(alert);

    // Slack (if configured)
    if (getSlackWebhookUrl()) {
        sendSlackAlert(alert).catch(() => {});
    }

    // Telegram (if configured)
    if (getTelegramBotToken() && getTelegramChatId()) {
        sendTelegramAlert(alert).catch(() => {});
    }
}

// ─── Convenience Functions ───────────────────────────────────────────────────

/**
 * Emergency mode activated alert.
 */
export function alertEmergencyModeActivated(
    tenantId: string,
    reason: string,
    percentUsed: number,
    estimatedCostUsd: number,
): void {
    dispatchAlert({
        level: 'emergency',
        title: 'Acil Durum Modu Aktif',
        message: `TTS maliyet esigi asildi. Body TTS OpenAI'a gecti.\n` +
            `Sebep: ${reason}\n` +
            `Kullanim: %${percentUsed}\n` +
            `Tahmini maliyet: $${estimatedCostUsd.toFixed(2)}`,
        tenantId,
        metadata: { reason, percentUsed, estimatedCostUsd },
    });
}

/**
 * Emergency mode deactivated alert.
 */
export function alertEmergencyModeDeactivated(tenantId: string): void {
    dispatchAlert({
        level: 'info',
        title: 'Acil Durum Modu Kapandi',
        message: 'TTS normal moda dondu. Tum TTS trafigi ElevenLabs uzerinden.',
        tenantId,
    });
}

/**
 * Cost threshold warning alert.
 */
export function alertCostThresholdWarning(
    tenantId: string,
    thresholdType: 'warning' | 'critical',
    percentUsed: number,
    estimatedCostUsd: number,
): void {
    dispatchAlert({
        level: thresholdType === 'critical' ? 'critical' : 'warning',
        title: thresholdType === 'critical'
            ? 'TTS Maliyet Kritik Esik'
            : 'TTS Maliyet Uyari Esigi',
        message: `TTS karakter kullanimi %${percentUsed} seviyesine ulasti.\n` +
            `Tahmini maliyet: $${estimatedCostUsd.toFixed(2)}`,
        tenantId,
        metadata: { thresholdType, percentUsed, estimatedCostUsd },
    });
}

/**
 * Pipeline latency spike alert (for future use).
 */
export function alertLatencySpike(
    tenantId: string,
    avgLatencyMs: number,
    thresholdMs: number,
): void {
    dispatchAlert({
        level: 'warning',
        title: 'Pipeline Latency Yuksek',
        message: `Ortalama yanit suresi ${avgLatencyMs}ms (esik: ${thresholdMs}ms)`,
        tenantId,
        metadata: { avgLatencyMs, thresholdMs },
    });
}

// ─── Channel Implementations ─────────────────────────────────────────────────

function logToConsole(alert: AlertPayload & { timestamp: Date }): void {
    const alertData = {
        alert: true,
        alertLevel: alert.level,
        title: alert.title,
        tenantId: alert.tenantId,
        metadata: alert.metadata,
    };

    const logFn = alert.level === 'emergency' || alert.level === 'critical'
        ? billingLogger.error.bind(billingLogger)
        : alert.level === 'warning'
            ? billingLogger.warn.bind(billingLogger)
            : billingLogger.info.bind(billingLogger);

    logFn(alert.message, alertData);
}

async function sendSlackAlert(alert: AlertPayload & { timestamp: Date }): Promise<void> {
    const colorMap = {
        info: '#36a64f',
        warning: '#daa520',
        critical: '#ff4444',
        emergency: '#cc0000',
    };

    const emojiMap = {
        info: ':information_source:',
        warning: ':warning:',
        critical: ':red_circle:',
        emergency: ':rotating_light:',
    };

    try {
        await fetch(getSlackWebhookUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `${emojiMap[alert.level]} *${alert.title}*`,
                attachments: [{
                    color: colorMap[alert.level],
                    text: alert.message,
                    fields: [
                        { title: 'Tenant', value: alert.tenantId, short: true },
                        { title: 'Seviye', value: alert.level.toUpperCase(), short: true },
                    ],
                    ts: Math.floor(alert.timestamp.getTime() / 1000),
                }],
            }),
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Silent — alerting failure must not break anything
    }
}

async function sendTelegramAlert(alert: AlertPayload & { timestamp: Date }): Promise<void> {
    const emojiMap = {
        info: 'ℹ️',
        warning: '⚠️',
        critical: '🔴',
        emergency: '🚨',
    };

    const text = [
        `${emojiMap[alert.level]} *${escapeMarkdown(alert.title)}*`,
        '',
        escapeMarkdown(alert.message),
        '',
        `🏢 Tenant: \`${alert.tenantId}\``,
        `⏱ ${alert.timestamp.toISOString()}`,
    ].join('\n');

    try {
        await fetch(`https://api.telegram.org/bot${getTelegramBotToken()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: getTelegramChatId(),
                text,
                parse_mode: 'MarkdownV2',
                disable_notification: alert.level === 'info',
            }),
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        // Silent
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
