/**
 * Go-Live System Health Check
 *
 * GET /api/system/go-live-check
 *
 * Single endpoint that checks ALL critical subsystems for production readiness.
 * Designed for the 24-hour Go-Live Runbook — run this before and during launch.
 *
 * Returns: per-subsystem health status + overall go/no-go decision.
 *
 * Usage:
 *   curl http://localhost:3000/api/system/go-live-check | jq
 *   curl https://your-app.vercel.app/api/system/go-live-check | jq
 */

import { NextResponse } from 'next/server';
import { metricsLogger } from '@/lib/billing/metrics-logger';
import { getAppUrlDiagnostics } from '@/lib/utils/get-app-url';

export const dynamic = 'force-dynamic';

interface SubsystemCheck {
    name: string;
    status: 'ok' | 'warning' | 'error' | 'not_configured';
    detail: string;
    critical: boolean; // If true, blocks go-live
}

export async function GET() {
    const checks: SubsystemCheck[] = [];
    const startTime = performance.now();

    // ─── 1. Environment Variables ───────────────────────────────────────

    // Required
    const requiredEnvs: [string, string][] = [
        ['OPENAI_API_KEY', 'OpenAI LLM + TTS Fallback'],
        ['DEEPGRAM_API_KEY', 'Deepgram STT'],
        ['ELEVENLABS_API_KEY', 'ElevenLabs TTS'],
    ];

    for (const [key, label] of requiredEnvs) {
        checks.push({
            name: `env:${key}`,
            status: process.env[key] ? 'ok' : 'error',
            detail: process.env[key] ? `${label} — configured` : `${label} — MISSING`,
            critical: true,
        });
    }

    // Payment — Lemon Squeezy (critical for billing)
    const paymentEnvs: [string, string][] = [
        ['LEMONSQUEEZY_API_KEY', 'Lemon Squeezy API'],
        ['LEMONSQUEEZY_STORE_ID', 'Lemon Squeezy Store'],
        ['LEMONSQUEEZY_WEBHOOK_SECRET', 'Lemon Squeezy Webhook'],
    ];

    for (const [key, label] of paymentEnvs) {
        checks.push({
            name: `env:${key}`,
            status: process.env[key] ? 'ok' : 'error',
            detail: process.env[key] ? `${label} — configured` : `${label} — MISSING (payments broken!)`,
            critical: true,
        });
    }

    // Variant IDs — all 6 needed for checkout
    const variantKeys = [
        'LEMONSQUEEZY_VARIANT_STARTER',
        'LEMONSQUEEZY_VARIANT_STARTER_YEARLY',
        'LEMONSQUEEZY_VARIANT_PROFESSIONAL',
        'LEMONSQUEEZY_VARIANT_PROFESSIONAL_YEARLY',
        'LEMONSQUEEZY_VARIANT_ENTERPRISE',
        'LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY',
    ];
    const variantsMissing = variantKeys.filter(k => !process.env[k]);
    checks.push({
        name: 'billing:variants',
        status: variantsMissing.length === 0 ? 'ok' : 'error',
        detail: variantsMissing.length === 0
            ? `All 6 plan variants configured (3 monthly + 3 yearly)`
            : `Missing ${variantsMissing.length} variant(s): ${variantsMissing.join(', ')}`,
        critical: true,
    });

    // Optional but recommended
    const optionalEnvs: [string, string][] = [
        ['GROQ_API_KEY', 'Groq LLM (primary, fast)'],
        ['TWILIO_ACCOUNT_SID', 'Twilio telephony'],
        ['TWILIO_AUTH_TOKEN', 'Twilio auth'],
        ['ALERT_SLACK_WEBHOOK_URL', 'Slack alerting'],
        ['ALERT_TELEGRAM_BOT_TOKEN', 'Telegram alerting'],
        ['ALERT_TELEGRAM_CHAT_ID', 'Telegram chat target'],
    ];

    for (const [key, label] of optionalEnvs) {
        checks.push({
            name: `env:${key}`,
            status: process.env[key] ? 'ok' : 'warning',
            detail: process.env[key] ? `${label} — configured` : `${label} — not set (optional)`,
            critical: false,
        });
    }

    // ─── 2. Firebase / Firestore ────────────────────────────────────────

    try {
        const { initAdmin } = await import('@/lib/auth/firebase-admin');
        const { getFirestore } = await import('firebase-admin/firestore');
        initAdmin();
        const db = getFirestore();

        // Quick read test
        const testStart = performance.now();
        await db.collection('_health').doc('ping').set({
            timestamp: new Date(),
            source: 'go-live-check',
        });
        const firestoreLatency = Math.round(performance.now() - testStart);

        checks.push({
            name: 'firestore:connection',
            status: firestoreLatency < 2000 ? 'ok' : 'warning',
            detail: `Write latency: ${firestoreLatency}ms`,
            critical: true,
        });
    } catch (err) {
        checks.push({
            name: 'firestore:connection',
            status: 'error',
            detail: `Firestore failed: ${err instanceof Error ? err.message : 'unknown'}`,
            critical: true,
        });
    }

    // ─── 3. Alerting Channels ───────────────────────────────────────────

    const slackConfigured = !!process.env.ALERT_SLACK_WEBHOOK_URL;
    const telegramConfigured = !!(process.env.ALERT_TELEGRAM_BOT_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID);

    checks.push({
        name: 'alerting:channels',
        status: slackConfigured || telegramConfigured ? 'ok' : 'warning',
        detail: [
            `Slack: ${slackConfigured ? 'ready' : 'not configured'}`,
            `Telegram: ${telegramConfigured ? 'ready' : 'not configured'}`,
            'Console: always active',
        ].join(' | '),
        critical: false,
    });

    // ─── 4. Metrics Logger ──────────────────────────────────────────────

    const mlStats = metricsLogger.getStats();
    checks.push({
        name: 'metrics:logger',
        status: mlStats.bufferSize < 500 ? 'ok' : 'warning',
        detail: `Buffer: ${mlStats.bufferSize} entries, flushing: ${mlStats.isFlushing}`,
        critical: false,
    });

    // ─── 5. Voice Pipeline Providers ────────────────────────────────────

    // Deepgram STT
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (deepgramKey) {
        try {
            const sttStart = performance.now();
            const res = await fetch('https://api.deepgram.com/v1/projects', {
                headers: { Authorization: `Token ${deepgramKey}` },
                signal: AbortSignal.timeout(5000),
            });
            const sttLatency = Math.round(performance.now() - sttStart);
            checks.push({
                name: 'provider:deepgram',
                status: res.ok ? 'ok' : 'warning',
                detail: `API reachable (${sttLatency}ms), status: ${res.status}`,
                critical: false,
            });
        } catch {
            checks.push({
                name: 'provider:deepgram',
                status: 'warning',
                detail: 'API unreachable — check network/key',
                critical: false,
            });
        }
    }

    // Groq LLM
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        try {
            const groqStart = performance.now();
            const res = await fetch('https://api.groq.com/openai/v1/models', {
                headers: { Authorization: `Bearer ${groqKey}` },
                signal: AbortSignal.timeout(5000),
            });
            const groqLatency = Math.round(performance.now() - groqStart);
            checks.push({
                name: 'provider:groq',
                status: res.ok ? 'ok' : 'warning',
                detail: `API reachable (${groqLatency}ms), status: ${res.status}`,
                critical: false,
            });
        } catch {
            checks.push({
                name: 'provider:groq',
                status: 'warning',
                detail: 'API unreachable — OpenAI fallback will be used',
                critical: false,
            });
        }
    }

    // ─── 6. Production URL Check ────────────────────────────────────────

    const { url: appUrl, source: appUrlSource } = getAppUrlDiagnostics();
    const isProduction = appUrlSource === 'NEXT_PUBLIC_APP_URL' && !appUrl.includes('localhost');

    checks.push({
        name: 'config:app_url',
        status: isProduction ? 'ok' : 'warning',
        detail: appUrlSource === 'NEXT_PUBLIC_APP_URL'
            ? (appUrl.includes('localhost') ? `Still localhost: ${appUrl}` : `Production: ${appUrl}`)
            : (appUrlSource === 'VERCEL_URL'
                ? `⚠️ NEXT_PUBLIC_APP_URL not set — falling back to VERCEL_URL: ${appUrl}`
                : 'NEXT_PUBLIC_APP_URL not set'),
        critical: false,
    });

    // ─── 7. Firebase Admin Check ─────────────────────────────────────────

    const hasFirebaseServiceAccount = !!(
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
    checks.push({
        name: 'config:firebase_admin',
        status: hasFirebaseServiceAccount ? 'ok' : 'warning',
        detail: hasFirebaseServiceAccount
            ? `Credential source: ${process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'inline JSON' : process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH ? 'key file' : 'GCP default'}`
            : 'No explicit credential — relying on GCP default (may fail on Vercel)',
        critical: false,
    });

    // ─── Summary ────────────────────────────────────────────────────────

    const criticalErrors = checks.filter(c => c.critical && c.status === 'error');
    const warnings = checks.filter(c => c.status === 'warning');
    const totalLatency = Math.round(performance.now() - startTime);

    const goLiveReady = criticalErrors.length === 0;

    return NextResponse.json({
        verdict: goLiveReady ? 'GO' : 'NO-GO',
        summary: {
            total: checks.length,
            ok: checks.filter(c => c.status === 'ok').length,
            warnings: warnings.length,
            errors: criticalErrors.length,
            checkDurationMs: totalLatency,
        },
        checks,
        ...(criticalErrors.length > 0 && {
            blockers: criticalErrors.map(c => `${c.name}: ${c.detail}`),
        }),
        ...(warnings.length > 0 && {
            advisories: warnings.map(c => `${c.name}: ${c.detail}`),
        }),
        timestamp: new Date().toISOString(),
    }, {
        status: goLiveReady ? 200 : 503,
    });
}
