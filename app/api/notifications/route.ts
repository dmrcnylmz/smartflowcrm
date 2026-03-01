/**
 * Notifications API
 *
 * GET    /api/notifications         — List notifications for current user/tenant
 * POST   /api/notifications         — Create a notification
 * PUT    /api/notifications         — Mark notifications as read
 * DELETE /api/notifications         — Delete a notification
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError, requireAuth, errorResponse, createApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// GET: List notifications
export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userId = request.headers.get('x-user-uid');
        const authErr = requireAuth(tenantId || userId);
        if (authErr) return errorResponse(authErr);

        const resolvedId = tenantId || userId!;
        const unreadOnly = request.nextUrl.searchParams.get('unread') === 'true';
        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '30');

        let query = getDb()
            .collection('tenants').doc(resolvedId)
            .collection('notifications')
            .orderBy('createdAt', 'desc')
            .limit(limit);

        if (unreadOnly) {
            query = query.where('read', '==', false);
        }

        const snap = await query.get();
        const notifications = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
        }));

        // Count unread
        const unreadSnap = await getDb()
            .collection('tenants').doc(resolvedId)
            .collection('notifications')
            .where('read', '==', false)
            .count()
            .get();

        return NextResponse.json({
            notifications,
            unreadCount: unreadSnap.data().count,
            total: notifications.length,
        });
    } catch (error) {
        return handleApiError(error, 'Notifications GET');
    }
}

// POST: Create notification
export async function POST(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userId = request.headers.get('x-user-uid');
        const authErr = requireAuth(tenantId || userId);
        if (authErr) return errorResponse(authErr);

        const resolvedId = tenantId || userId!;
        const body = await request.json();

        if (!body.title || !body.message) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'title ve message gerekli'));
        }

        const notification = {
            title: body.title,
            message: body.message,
            type: body.type || 'info', // info, success, warning, error, call, appointment
            icon: body.icon || null,
            link: body.link || null,
            read: false,
            source: body.source || 'system',
            metadata: body.metadata || {},
            createdAt: FieldValue.serverTimestamp(),
        };

        const ref = await getDb()
            .collection('tenants').doc(resolvedId)
            .collection('notifications')
            .add(notification);

        return NextResponse.json({
            id: ref.id,
            message: 'Bildirim oluşturuldu',
        }, { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Notifications POST');
    }
}

// PUT: Mark as read
export async function PUT(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userId = request.headers.get('x-user-uid');
        const authErr = requireAuth(tenantId || userId);
        if (authErr) return errorResponse(authErr);

        const resolvedId = tenantId || userId!;
        const body = await request.json();
        const firestore = getDb();
        const notifCollection = firestore.collection('tenants').doc(resolvedId).collection('notifications');

        if (body.markAll) {
            // Mark all as read
            const unreadSnap = await notifCollection.where('read', '==', false).get();
            const batch = firestore.batch();
            unreadSnap.docs.forEach(doc => {
                batch.update(doc.ref, { read: true, readAt: FieldValue.serverTimestamp() });
            });
            await batch.commit();
            return NextResponse.json({ message: `${unreadSnap.size} bildirim okundu olarak işaretlendi` });
        }

        if (body.notificationId) {
            await notifCollection.doc(body.notificationId).update({
                read: true,
                readAt: FieldValue.serverTimestamp(),
            });
            return NextResponse.json({ message: 'Bildirim okundu' });
        }

        return errorResponse(createApiError('VALIDATION_ERROR', 'notificationId veya markAll gerekli'));
    } catch (error) {
        return handleApiError(error, 'Notifications PUT');
    }
}

// DELETE: Delete notification
export async function DELETE(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        const userId = request.headers.get('x-user-uid');
        const authErr = requireAuth(tenantId || userId);
        if (authErr) return errorResponse(authErr);

        const resolvedId = tenantId || userId!;
        const body = await request.json();

        if (!body.notificationId) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'notificationId gerekli'));
        }

        await getDb()
            .collection('tenants').doc(resolvedId)
            .collection('notifications')
            .doc(body.notificationId)
            .delete();

        return NextResponse.json({ message: 'Bildirim silindi' });
    } catch (error) {
        return handleApiError(error, 'Notifications DELETE');
    }
}
