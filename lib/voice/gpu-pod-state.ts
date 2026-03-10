/**
 * GPU Pod State — Firestore helper for tracking RunPod pod activity.
 *
 * Document: system/gpu-pod-state
 *
 * Used by:
 *   - voice/infer route → updateLastGpuActivity() after GPU inference
 *   - cron/gpu-shutdown → getGpuPodState() to check idle time
 *   - gpu-manager → updatePodStatus() on start/stop
 */

import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let _db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!_db) {
        initAdmin();
        _db = getFirestore();
    }
    return _db;
}

const DOC_PATH = 'system/gpu-pod-state';

export interface GpuPodState {
    lastGpuActivity: number;   // epoch ms
    lastStartedBy: string;     // tenantId
    podStatus: string;         // running | stopped | starting
    updatedAt: number;         // epoch ms
}

/** Read the current GPU pod state from Firestore */
export async function getGpuPodState(): Promise<GpuPodState | null> {
    try {
        const snap = await getDb().doc(DOC_PATH).get();
        if (!snap.exists) return null;
        const data = snap.data()!;
        return {
            lastGpuActivity: data.lastGpuActivity ?? 0,
            lastStartedBy: data.lastStartedBy ?? '',
            podStatus: data.podStatus ?? 'unknown',
            updatedAt: data.updatedAt ?? 0,
        };
    } catch {
        return null;
    }
}

/** Update lastGpuActivity timestamp (called after each GPU inference) */
export async function updateLastGpuActivity(tenantId: string): Promise<void> {
    try {
        await getDb().doc(DOC_PATH).set({
            lastGpuActivity: Date.now(),
            lastStartedBy: tenantId,
            updatedAt: Date.now(),
        }, { merge: true });
    } catch {
        // Non-critical — don't block inference on Firestore write failure
    }
}

/** Update pod status (called on start/stop) */
export async function updatePodStatus(status: string): Promise<void> {
    try {
        await getDb().doc(DOC_PATH).set({
            podStatus: status,
            updatedAt: Date.now(),
        }, { merge: true });
    } catch {
        // Non-critical
    }
}
