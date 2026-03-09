/**
 * Emergency Mode API — Toggle TTS Cost Saving Mode
 *
 * GET  /api/billing/emergency — Get current emergency mode status
 * POST /api/billing/emergency — Toggle emergency mode
 *   { action: 'activate' | 'deactivate' | 'auto' }
 *
 * Emergency mode switches body TTS from ElevenLabs to cheaper OpenAI.
 * Greeting TTS always stays on ElevenLabs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getTenantFromRequest } from '@/lib/firebase/admin-db';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import {
    getEmergencyModeStatus,
    activateEmergencyMode,
    deactivateEmergencyMode,
    updateCostMonitoringConfig,
    type CostMonitoringConfig,
} from '@/lib/billing/cost-monitor';

let _db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!_db) { initAdmin(); _db = getFirestore(); }
    return _db;
}

/**
 * GET: Get emergency mode status + cost usage breakdown.
 */
export async function GET(request: NextRequest) {
    try {
        const tenantId = getTenantFromRequest(request);
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const status = await getEmergencyModeStatus(getDb(), tenantId);
        return NextResponse.json(status);
    } catch (error) {
        console.error('[Emergency API] GET Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch emergency status' },
            { status: 500 },
        );
    }
}

/**
 * POST: Toggle emergency mode.
 * Body: { action: 'activate' | 'deactivate' | 'auto', config?: Partial<CostMonitoringConfig> }
 */
export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body = await request.json();
        const { action, config } = body;
        const db = getDb();

        switch (action) {
            case 'activate':
                await activateEmergencyMode(db, auth.tenantId, 'manual');
                break;

            case 'deactivate':
                await deactivateEmergencyMode(db, auth.tenantId);
                break;

            case 'auto':
                // Re-enable automatic threshold-based activation
                await updateCostMonitoringConfig(db, auth.tenantId, {
                    emergencyModeManualOverride: false,
                    emergencyModeEnabled: true,
                });
                break;

            case 'update_config':
                // Update thresholds and budget
                if (config) {
                    const allowedFields = [
                        'ttsMonthlyCharBudget',
                        'ttsWarningThresholdPercent',
                        'ttsCriticalThresholdPercent',
                        'emergencyModeEnabled',
                    ];
                    const filtered: Record<string, unknown> = {};
                    for (const key of allowedFields) {
                        if (key in config) {
                            filtered[key] = config[key];
                        }
                    }
                    await updateCostMonitoringConfig(db, auth.tenantId, filtered as Partial<CostMonitoringConfig>);
                }
                break;

            default:
                return NextResponse.json(
                    { error: 'Invalid action. Must be: activate, deactivate, auto, or update_config' },
                    { status: 400 },
                );
        }

        // Return updated status
        const status = await getEmergencyModeStatus(db, auth.tenantId);
        return NextResponse.json({
            success: true,
            action,
            ...status,
        });
    } catch (error) {
        console.error('[Emergency API] POST Error:', error);
        return NextResponse.json(
            { error: 'Failed to update emergency mode' },
            { status: 500 },
        );
    }
}
