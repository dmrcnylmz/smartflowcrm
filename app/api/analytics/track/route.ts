/**
 * User Activity Tracking API
 * POST /api/analytics/track — Track user events (login, page view, feature usage)
 *
 * Events are stored in:
 * - tenants/{tenantId}/user_activity_daily/{YYYY-MM-DD} (aggregated counters)
 * - tenants/{tenantId}/user_sessions/{autoId} (login events only)
 *
 * For super-admin analytics dashboard.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

interface TrackEvent {
    type: 'login' | 'page_view' | 'feature_use' | 'logout';
    page?: string;      // e.g. '/dashboard', '/calls', '/admin'
    feature?: string;   // e.g. 'create_agent', 'upload_doc', 'make_call'
    method?: string;    // for login: 'email' | 'google'
    metadata?: Record<string, string>;
}

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const body: TrackEvent = await request.json();
        const { type, page, feature, method, metadata } = body;

        if (!type || !['login', 'page_view', 'feature_use', 'logout'].includes(type)) {
            return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
        }

        const firestore = getDb();
        const tenantRef = firestore.collection('tenants').doc(auth.tenantId);
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const dailyRef = tenantRef.collection('user_activity_daily').doc(today);
        const userAgent = request.headers.get('user-agent') || '';
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

        // Fire-and-forget: don't await all writes
        const writes: Promise<unknown>[] = [];

        // --- Daily aggregate counters (always) ---
        const incrementData: Record<string, unknown> = {
            updatedAt: FieldValue.serverTimestamp(),
            [`counts.${type}`]: FieldValue.increment(1),
        };

        if (page) {
            // Track page views per route: pages./dashboard = 5
            const safePage = page.replace(/[.#$/\[\]]/g, '_').slice(0, 50);
            incrementData[`pages.${safePage}`] = FieldValue.increment(1);
        }

        if (feature) {
            const safeFeature = feature.replace(/[.#$/\[\]]/g, '_').slice(0, 50);
            incrementData[`features.${safeFeature}`] = FieldValue.increment(1);
        }

        // Track unique users via set
        incrementData[`users.${auth.uid}`] = FieldValue.increment(1);

        writes.push(dailyRef.set(incrementData, { merge: true }));

        // --- Login events: store detailed session record ---
        if (type === 'login') {
            writes.push(tenantRef.collection('user_sessions').add({
                userId: auth.uid,
                email: auth.email || '',
                method: method || 'unknown',
                ip,
                userAgent: userAgent.slice(0, 200),
                createdAt: FieldValue.serverTimestamp(),
            }));

            // Also update global platform-level login counter
            const globalRef = firestore.collection('platform_analytics').doc(today);
            writes.push(globalRef.set({
                logins: FieldValue.increment(1),
                [`loginUsers.${auth.uid}`]: true,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }));
        }

        // --- Page view: also update global daily page counts ---
        if (type === 'page_view' && page) {
            const globalRef = firestore.collection('platform_analytics').doc(today);
            const safePage = page.replace(/[.#$/\[\]]/g, '_').slice(0, 50);
            writes.push(globalRef.set({
                [`pageViews.${safePage}`]: FieldValue.increment(1),
                totalPageViews: FieldValue.increment(1),
                [`activeUsers.${auth.uid}`]: true,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }));
        }

        // Don't block response on writes
        Promise.all(writes).catch(err => {
            console.error('[Analytics Track] Write error:', err);
        });

        return NextResponse.json({ ok: true });
    } catch {
        // Fail silently — tracking should never break the app
        return NextResponse.json({ ok: true });
    }
}
