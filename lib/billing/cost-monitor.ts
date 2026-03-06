/**
 * Cost Monitor Engine — TTS Budget Tracking & Emergency Mode
 *
 * Monitors ElevenLabs TTS character usage against a monthly budget.
 * When usage exceeds configurable thresholds:
 * - 80%: Warning alert
 * - 95%: Critical alert + auto Emergency Mode
 * - Emergency Mode: Body TTS switches to OpenAI (cheaper)
 *                   Greeting TTS stays on ElevenLabs (quality matters)
 *
 * Performance:
 * - Config cached in-memory for 60 seconds (avoids Firestore reads per TTS call)
 * - Threshold checks are fire-and-forget (don't block pipeline)
 * - Alert documents written only on state changes
 */

import { FieldValue } from 'firebase-admin/firestore';
import {
    alertEmergencyModeActivated,
    alertEmergencyModeDeactivated,
    alertCostThresholdWarning,
} from '@/lib/billing/alert-dispatcher';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CostMonitoringConfig {
    ttsMonthlyCharBudget: number;       // e.g., 500,000 chars
    ttsWarningThresholdPercent: number;  // e.g., 80
    ttsCriticalThresholdPercent: number; // e.g., 95
    emergencyModeEnabled: boolean;       // Auto-activation allowed?
    emergencyModeActive: boolean;        // Currently in emergency mode?
    emergencyModeManualOverride: boolean; // Admin manually toggled?
    lastUpdated?: FirebaseFirestore.Timestamp;
}

export interface CostAlert {
    type: 'warning' | 'critical' | 'emergency_activated' | 'emergency_deactivated';
    ttsCharsUsed: number;
    ttsCharsBudget: number;
    percentUsed: number;
    estimatedCostUsd: number;
    timestamp: Date;
    reason?: string;
}

export interface EmergencyModeStatus {
    active: boolean;
    manualOverride: boolean;
    ttsCharsUsed: number;
    ttsCharsBudget: number;
    percentUsed: number;
    estimatedCostUsd: number;
    recentAlerts: CostAlert[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIG_CACHE_TTL_MS = 60_000; // 60 seconds
const ELEVENLABS_COST_PER_1000_CHARS = 0.15;

const DEFAULT_CONFIG: CostMonitoringConfig = {
    ttsMonthlyCharBudget: 500_000,
    ttsWarningThresholdPercent: 80,
    ttsCriticalThresholdPercent: 95,
    emergencyModeEnabled: true,
    emergencyModeActive: false,
    emergencyModeManualOverride: false,
};

// ─── In-Memory Config Cache ──────────────────────────────────────────────────

interface CachedConfig {
    config: CostMonitoringConfig;
    fetchedAt: number;
}

const configCache: Map<string, CachedConfig> = new Map();

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Check if emergency TTS mode should be used for a given tenant.
 * Uses 60-second in-memory cache to avoid Firestore reads on every TTS call.
 *
 * Returns: true if body TTS should use OpenAI instead of ElevenLabs.
 */
export async function shouldUseEmergencyTts(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<boolean> {
    try {
        const config = await getCostMonitoringConfig(db, tenantId);
        return config.emergencyModeActive;
    } catch {
        // On error, don't activate emergency mode — keep ElevenLabs
        return false;
    }
}

/**
 * Get cost monitoring config with caching.
 * Reads from Firestore max once per 60 seconds per tenant.
 */
export async function getCostMonitoringConfig(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<CostMonitoringConfig> {
    // Check cache
    const cached = configCache.get(tenantId);
    if (cached && Date.now() - cached.fetchedAt < CONFIG_CACHE_TTL_MS) {
        return cached.config;
    }

    // Fetch from Firestore
    try {
        const doc = await db
            .collection('tenants')
            .doc(tenantId)
            .collection('config')
            .doc('cost_monitoring')
            .get();

        const config: CostMonitoringConfig = doc.exists
            ? { ...DEFAULT_CONFIG, ...doc.data() as Partial<CostMonitoringConfig> }
            : { ...DEFAULT_CONFIG };

        // Update cache
        configCache.set(tenantId, { config, fetchedAt: Date.now() });
        return config;
    } catch {
        // On Firestore error, return default (safe)
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Check cost thresholds and activate emergency mode if needed.
 * Called fire-and-forget after each meterTtsUsage().
 *
 * This is the main "engine" that triggers alerts and mode switches.
 */
export async function checkCostThresholds(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<void> {
    try {
        const config = await getCostMonitoringConfig(db, tenantId);

        // Get current month's TTS usage
        const currentPeriod = getCurrentPeriod();
        const usageDoc = await db
            .collection('tenants')
            .doc(tenantId)
            .collection('usage')
            .doc(currentPeriod)
            .get();

        const ttsCharsUsed = (usageDoc.data()?.ttsChars as number) || 0;
        const percentUsed = (ttsCharsUsed / config.ttsMonthlyCharBudget) * 100;

        const roundedPercent = Math.round(percentUsed);
        const estimatedCost = round2((ttsCharsUsed / 1000) * ELEVENLABS_COST_PER_1000_CHARS);

        // Warning threshold (e.g., 80%)
        if (percentUsed >= config.ttsWarningThresholdPercent && percentUsed < config.ttsCriticalThresholdPercent) {
            await writeAlertIfNew(db, tenantId, {
                type: 'warning',
                ttsCharsUsed,
                ttsCharsBudget: config.ttsMonthlyCharBudget,
                percentUsed: roundedPercent,
                estimatedCostUsd: estimatedCost,
                timestamp: new Date(),
            });

            // 🔔 Slack/Telegram notification — warning threshold
            alertCostThresholdWarning(tenantId, 'warning', roundedPercent, estimatedCost);
        }

        // Critical threshold (e.g., 95%) — auto-activate emergency mode
        if (percentUsed >= config.ttsCriticalThresholdPercent) {
            // Write critical alert
            await writeAlertIfNew(db, tenantId, {
                type: 'critical',
                ttsCharsUsed,
                ttsCharsBudget: config.ttsMonthlyCharBudget,
                percentUsed: roundedPercent,
                estimatedCostUsd: estimatedCost,
                timestamp: new Date(),
            });

            // 🔔 Slack/Telegram notification — critical threshold
            alertCostThresholdWarning(tenantId, 'critical', roundedPercent, estimatedCost);

            // Auto-activate emergency mode (if not manually overridden)
            if (config.emergencyModeEnabled && !config.emergencyModeActive && !config.emergencyModeManualOverride) {
                await activateEmergencyMode(db, tenantId, 'auto_threshold');
            }
        }
    } catch (error) {
        // NEVER throw — cost monitoring must not break the pipeline
        // Always log in production — cost threshold failures are critical operational issues
        console.error('[CostMonitor] checkCostThresholds failed:',
            error instanceof Error ? error.message : error);
    }
}

/**
 * Activate emergency mode — body TTS switches to OpenAI.
 */
export async function activateEmergencyMode(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    reason: string = 'manual',
): Promise<void> {
    const configRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('config')
        .doc('cost_monitoring');

    await configRef.set({
        emergencyModeActive: true,
        emergencyModeManualOverride: reason === 'manual',
        lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Invalidate cache
    configCache.delete(tenantId);

    // Write activation alert
    const currentPeriod = getCurrentPeriod();
    const usageDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage')
        .doc(currentPeriod)
        .get();

    const ttsCharsUsed = (usageDoc.data()?.ttsChars as number) || 0;
    const config = await getCostMonitoringConfig(db, tenantId);

    await db
        .collection('tenants')
        .doc(tenantId)
        .collection('cost_alerts')
        .add({
            type: 'emergency_activated',
            ttsCharsUsed,
            ttsCharsBudget: config.ttsMonthlyCharBudget,
            percentUsed: Math.round((ttsCharsUsed / config.ttsMonthlyCharBudget) * 100),
            estimatedCostUsd: round2((ttsCharsUsed / 1000) * ELEVENLABS_COST_PER_1000_CHARS),
            reason,
            timestamp: FieldValue.serverTimestamp(),
        });

    // 🔔 Slack/Telegram notification — emergency mode activated
    const percentUsed = config.ttsMonthlyCharBudget > 0
        ? Math.round((ttsCharsUsed / config.ttsMonthlyCharBudget) * 100)
        : 0;
    const estimatedCostUsd = round2((ttsCharsUsed / 1000) * ELEVENLABS_COST_PER_1000_CHARS);
    alertEmergencyModeActivated(tenantId, reason, percentUsed, estimatedCostUsd);

    if (process.env.NODE_ENV === 'development') {
        console.info(`[CostMonitor] Emergency mode ACTIVATED for tenant ${tenantId} (reason: ${reason})`);
    }
}

/**
 * Deactivate emergency mode — resume ElevenLabs for all TTS.
 */
export async function deactivateEmergencyMode(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<void> {
    const configRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('config')
        .doc('cost_monitoring');

    await configRef.set({
        emergencyModeActive: false,
        emergencyModeManualOverride: false,
        lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Invalidate cache
    configCache.delete(tenantId);

    // Write deactivation alert
    await db
        .collection('tenants')
        .doc(tenantId)
        .collection('cost_alerts')
        .add({
            type: 'emergency_deactivated',
            ttsCharsUsed: 0,
            ttsCharsBudget: 0,
            percentUsed: 0,
            estimatedCostUsd: 0,
            reason: 'manual_deactivation',
            timestamp: FieldValue.serverTimestamp(),
        });

    // 🔔 Slack/Telegram notification — emergency mode deactivated
    alertEmergencyModeDeactivated(tenantId);

    if (process.env.NODE_ENV === 'development') {
        console.info(`[CostMonitor] Emergency mode DEACTIVATED for tenant ${tenantId}`);
    }
}

/**
 * Get full emergency mode status for dashboard display.
 */
export async function getEmergencyModeStatus(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<EmergencyModeStatus> {
    const config = await getCostMonitoringConfig(db, tenantId);

    // Get current usage
    const currentPeriod = getCurrentPeriod();
    const usageDoc = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('usage')
        .doc(currentPeriod)
        .get();

    const ttsCharsUsed = (usageDoc.data()?.ttsChars as number) || 0;
    const percentUsed = config.ttsMonthlyCharBudget > 0
        ? Math.round((ttsCharsUsed / config.ttsMonthlyCharBudget) * 100)
        : 0;

    // Get recent alerts (last 5)
    const alertsSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('cost_alerts')
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();

    const recentAlerts: CostAlert[] = alertsSnap.docs.map(doc => {
        const data = doc.data();
        return {
            type: data.type,
            ttsCharsUsed: data.ttsCharsUsed || 0,
            ttsCharsBudget: data.ttsCharsBudget || 0,
            percentUsed: data.percentUsed || 0,
            estimatedCostUsd: data.estimatedCostUsd || 0,
            timestamp: data.timestamp?.toDate?.() || new Date(),
            reason: data.reason,
        };
    });

    return {
        active: config.emergencyModeActive,
        manualOverride: config.emergencyModeManualOverride,
        ttsCharsUsed,
        ttsCharsBudget: config.ttsMonthlyCharBudget,
        percentUsed,
        estimatedCostUsd: round2((ttsCharsUsed / 1000) * ELEVENLABS_COST_PER_1000_CHARS),
        recentAlerts,
    };
}

/**
 * Update cost monitoring configuration (admin action).
 */
export async function updateCostMonitoringConfig(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    updates: Partial<CostMonitoringConfig>,
): Promise<void> {
    const configRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('config')
        .doc('cost_monitoring');

    await configRef.set({
        ...updates,
        lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Invalidate cache
    configCache.delete(tenantId);
}

/**
 * Invalidate the config cache for a tenant (e.g., after manual update).
 */
export function invalidateConfigCache(tenantId: string): void {
    configCache.delete(tenantId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Write an alert only if the same type hasn't been written today.
 * Prevents spamming alerts on every TTS call once threshold is reached.
 */
async function writeAlertIfNew(
    db: FirebaseFirestore.Firestore,
    tenantId: string,
    alert: CostAlert,
): Promise<void> {
    const today = getToday();
    const alertsRef = db
        .collection('tenants')
        .doc(tenantId)
        .collection('cost_alerts');

    // Check if same type alert was already written today
    const existing = await alertsRef
        .where('type', '==', alert.type)
        .where('dateKey', '==', today)
        .limit(1)
        .get();

    if (!existing.empty) return; // Already alerted today

    await alertsRef.add({
        ...alert,
        dateKey: today,
        timestamp: FieldValue.serverTimestamp(),
    });

    if (process.env.NODE_ENV === 'development') {
        console.info(`[CostMonitor] Alert: ${alert.type} — ${alert.percentUsed}% TTS budget used`);
    }
}

function getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getToday(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
