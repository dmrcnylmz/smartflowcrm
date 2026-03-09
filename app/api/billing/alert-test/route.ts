/**
 * Alert System Test Endpoint
 *
 * POST /api/billing/alert-test
 *
 * Sends a test alert to all configured channels (Slack, Telegram, Console).
 * Use this to verify webhook URLs are working before going live.
 *
 * Body: { type: 'info' | 'warning' | 'critical' | 'emergency' }
 *
 * Admin-only — requires authenticated tenant context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dispatchAlert } from '@/lib/billing/alert-dispatcher';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    // Block in production — test endpoint can trigger real alerts
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        const tenantId = request.headers.get('x-user-tenant')
            || request.headers.get('x-user-uid')
            || 'test-tenant';

        const body = await request.json().catch(() => ({}));
        const level = body.type || 'info';

        if (!['info', 'warning', 'critical', 'emergency'].includes(level)) {
            return NextResponse.json({ error: 'Invalid type. Use: info, warning, critical, emergency' }, { status: 400 });
        }

        // Check channel configuration
        const channels = {
            slack: !!process.env.ALERT_SLACK_WEBHOOK_URL,
            telegram: !!(process.env.ALERT_TELEGRAM_BOT_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID),
            console: true, // always active
        };

        // Dispatch test alert
        dispatchAlert({
            level,
            title: `Test Alert — ${level.toUpperCase()}`,
            message: `Bu bir test bildirimidir. Kanal durumu:\n` +
                `• Slack: ${channels.slack ? 'Yapılandırılmış ✓' : 'Yapılandırılmamış ✗'}\n` +
                `• Telegram: ${channels.telegram ? 'Yapılandırılmış ✓' : 'Yapılandırılmamış ✗'}\n` +
                `• Console: Aktif ✓\n` +
                `\nZaman: ${new Date().toISOString()}`,
            tenantId,
            metadata: { isTest: true },
        });

        return NextResponse.json({
            success: true,
            message: 'Test alert dispatched',
            channels,
            env: {
                ALERT_SLACK_WEBHOOK_URL: process.env.ALERT_SLACK_WEBHOOK_URL ? '***configured***' : 'NOT SET',
                ALERT_TELEGRAM_BOT_TOKEN: process.env.ALERT_TELEGRAM_BOT_TOKEN ? '***configured***' : 'NOT SET',
                ALERT_TELEGRAM_CHAT_ID: process.env.ALERT_TELEGRAM_CHAT_ID ? '***configured***' : 'NOT SET',
            },
        });
    } catch (error) {
        return NextResponse.json({
            error: 'Alert test failed',
            detail: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

/**
 * GET — Check alert channel status without sending.
 */
export async function GET() {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const channels = {
        slack: {
            configured: !!process.env.ALERT_SLACK_WEBHOOK_URL,
            env: 'ALERT_SLACK_WEBHOOK_URL',
        },
        telegram: {
            configured: !!(process.env.ALERT_TELEGRAM_BOT_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID),
            envToken: 'ALERT_TELEGRAM_BOT_TOKEN',
            envChat: 'ALERT_TELEGRAM_CHAT_ID',
        },
        console: {
            configured: true,
        },
    };

    const allConfigured = channels.slack.configured && channels.telegram.configured;

    return NextResponse.json({
        status: allConfigured ? 'all_channels_ready' : 'partial',
        channels,
        instructions: !allConfigured ? [
            !channels.slack.configured && 'Set ALERT_SLACK_WEBHOOK_URL in .env.local (get from Slack → Incoming Webhooks)',
            !channels.telegram.configured && 'Set ALERT_TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID in .env.local',
        ].filter(Boolean) : [],
    });
}
