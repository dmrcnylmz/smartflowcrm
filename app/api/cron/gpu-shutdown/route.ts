/**
 * GPU Auto-Shutdown Cron
 *
 * GET /api/cron/gpu-shutdown
 *
 * Runs every 5 minutes via Vercel Cron.
 * Checks if the RunPod GPU Pod has been idle for longer than
 * GPU_AUTO_SHUTDOWN_MS (default 15 minutes) and stops it.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gpuManager } from '@/lib/voice/gpu-manager';
import { getGpuPodState, updatePodStatus } from '@/lib/voice/gpu-pod-state';

export const dynamic = 'force-dynamic';

const GPU_AUTO_SHUTDOWN_MS = parseInt(process.env.GPU_AUTO_SHUTDOWN_MS || '900000', 10); // 15 min default

export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Skip if pod not configured
    if (!gpuManager.isPodConfigured()) {
        return NextResponse.json({ skipped: true, reason: 'Pod not configured' });
    }

    try {
        // Check pod status first
        const { status } = await gpuManager.getPodStatus();

        if (status !== 'RUNNING') {
            return NextResponse.json({
                action: 'none',
                reason: `Pod already ${status}`,
            });
        }

        // Check last GPU activity from Firestore
        const state = await getGpuPodState();
        const lastActivity = state?.lastGpuActivity || 0;
        const idleMs = Date.now() - lastActivity;

        if (lastActivity === 0) {
            // No activity ever recorded — check pod uptime instead
            const { uptimeSeconds } = await gpuManager.getPodStatus();
            const uptimeMs = uptimeSeconds * 1000;

            if (uptimeMs > GPU_AUTO_SHUTDOWN_MS) {
                const stopped = await gpuManager.stopPod();
                if (stopped) await updatePodStatus('stopped');

                return NextResponse.json({
                    action: 'stopped',
                    reason: `No recorded activity, uptime ${Math.round(uptimeSeconds / 60)}min > threshold`,
                    stopped,
                });
            }

            return NextResponse.json({
                action: 'none',
                reason: `No activity recorded, uptime ${Math.round(uptimeSeconds / 60)}min < threshold`,
            });
        }

        if (idleMs > GPU_AUTO_SHUTDOWN_MS) {
            const stopped = await gpuManager.stopPod();
            if (stopped) await updatePodStatus('stopped');

            return NextResponse.json({
                action: 'stopped',
                reason: `Idle ${Math.round(idleMs / 60000)}min > threshold ${Math.round(GPU_AUTO_SHUTDOWN_MS / 60000)}min`,
                stopped,
                lastActivity: new Date(lastActivity).toISOString(),
            });
        }

        return NextResponse.json({
            action: 'none',
            reason: `Active — idle ${Math.round(idleMs / 60000)}min < threshold ${Math.round(GPU_AUTO_SHUTDOWN_MS / 60000)}min`,
            lastActivity: new Date(lastActivity).toISOString(),
        });

    } catch (error) {
        return NextResponse.json({
            error: 'GPU shutdown check failed',
            message: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
