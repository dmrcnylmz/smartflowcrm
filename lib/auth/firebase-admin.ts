/**
 * Firebase Admin SDK Initialization
 *
 * Server-side only — NOT for Edge Runtime (middleware).
 * Used by API routes for full token signature verification.
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let adminApp: App | null = null;
let adminAuth: Auth | null = null;

function getServiceAccountCredential() {
    // Option 1: Inline JSON from env var (for cloud deployments like Cloud Run)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountJson) {
        try {
            return cert(JSON.parse(serviceAccountJson));
        } catch {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON');
        }
    }

    // Option 2: File path (for local development)
    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
        try {
            const absolutePath = resolve(process.cwd(), keyPath);
            const keyFile = JSON.parse(readFileSync(absolutePath, 'utf-8'));
            return cert(keyFile);
        } catch (err) {
            console.error('Failed to read service account key file:', err);
        }
    }

    // Option 3: Application Default Credentials (GCP environments)
    return undefined;
}

/**
 * Initialize Firebase Admin SDK (singleton).
 * Safe to call multiple times — only initializes once.
 */
export function initAdmin(): App {
    if (adminApp) return adminApp;

    const existingApps = getApps();
    if (existingApps.length > 0) {
        adminApp = existingApps[0];
        adminAuth = getAuth(adminApp);
        return adminApp;
    }

    const credential = getServiceAccountCredential();

    adminApp = initializeApp({
        credential,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'smartflowcrm',
    });

    adminAuth = getAuth(adminApp);
    console.log('✅ Firebase Admin SDK initialized');
    return adminApp;
}

/**
 * Get Firebase Admin Auth instance.
 * Initializes Admin SDK if not already done.
 */
export function getAdminAuth(): Auth {
    if (!adminAuth) {
        initAdmin();
    }
    return adminAuth!;
}
