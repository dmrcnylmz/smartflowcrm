/**
 * Webhook Management API — CRUD for outgoing webhook configurations
 *
 * GET:    List tenant webhooks + recent delivery logs
 * POST:   Create a new webhook subscription
 * PUT:    Update webhook (toggle active, change events/URL)
 * DELETE: Remove a webhook
 *
 * All endpoints require authentication + owner/admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { handleApiError, requireFields, errorResponse, createApiError } from '@/lib/utils/error-handler';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { cacheHeaders } from '@/lib/utils/cache-headers';
import { generateWebhookSecret, getWebhookLogs } from '@/lib/webhook/dispatcher';
import { WEBHOOK_EVENT_LABELS, type WebhookEventType } from '@/lib/webhook/types';

export const dynamic = 'force-dynamic';

const VALID_EVENTS = Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEventType[];
const MAX_WEBHOOKS_PER_TENANT = 10;

function getDb() {
    initAdmin();
    return getFirestore();
}

// ─── GET: List webhooks + logs ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const db = getDb();

        // Get all webhooks for tenant
        const webhooksSnap = await db
            .collection('tenants')
            .doc(auth.tenantId)
            .collection('webhooks')
            .orderBy('createdAt', 'desc')
            .get();

        const webhooks = webhooksSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Mask the secret for display (show last 8 chars)
            secret: maskSecret(doc.data().secret as string),
        }));

        // Get recent delivery logs
        const logs = await getWebhookLogs(db, auth.tenantId, 20);

        return NextResponse.json({
            webhooks,
            logs,
            availableEvents: WEBHOOK_EVENT_LABELS,
            count: webhooks.length,
            maxWebhooks: MAX_WEBHOOKS_PER_TENANT,
        }, {
            headers: cacheHeaders('SHORT'),
        });
    } catch (error) {
        return handleApiError(error, 'Webhook GET');
    }
}

// ─── POST: Create webhook ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Only owner/admin can manage webhooks
        if (!['owner', 'admin'].includes(request.headers.get('x-user-role') || '')) {
            return errorResponse(createApiError('AUTH_ERROR', 'Webhook yönetimi için admin yetkisi gereklidir'));
        }

        const body = await request.json();
        const validation = requireFields(body, ['url', 'events']);
        if (validation) return errorResponse(validation);

        const { url, events, label } = body;

        // Validate URL
        if (typeof url !== 'string' || !isValidWebhookUrl(url)) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Geçerli bir HTTPS URL giriniz'));
        }

        // Validate events
        if (!Array.isArray(events) || events.length === 0) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'En az bir olay türü seçmelisiniz'));
        }
        const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEventType));
        if (invalidEvents.length > 0) {
            return errorResponse(createApiError('VALIDATION_ERROR', `Geçersiz olay türleri: ${invalidEvents.join(', ')}`));
        }

        const db = getDb();

        // Check webhook limit
        const existingSnap = await db
            .collection('tenants')
            .doc(auth.tenantId)
            .collection('webhooks')
            .count()
            .get();

        if (existingSnap.data().count >= MAX_WEBHOOKS_PER_TENANT) {
            return errorResponse(createApiError('VALIDATION_ERROR', `Maksimum ${MAX_WEBHOOKS_PER_TENANT} webhook oluşturabilirsiniz`));
        }

        const secret = generateWebhookSecret();
        const webhookData = {
            url,
            events,
            active: true,
            secret,
            label: label || url,
            createdAt: new Date().toISOString(),
            failureCount: 0,
        };

        const docRef = await db
            .collection('tenants')
            .doc(auth.tenantId)
            .collection('webhooks')
            .add(webhookData);

        return NextResponse.json({
            id: docRef.id,
            ...webhookData,
            message: 'Webhook oluşturuldu',
        }, { status: 201 });
    } catch (error) {
        return handleApiError(error, 'Webhook POST');
    }
}

// ─── PUT: Update webhook ────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        if (!['owner', 'admin'].includes(request.headers.get('x-user-role') || '')) {
            return errorResponse(createApiError('AUTH_ERROR', 'Webhook yönetimi için admin yetkisi gereklidir'));
        }

        const body = await request.json();
        const { webhookId, ...updates } = body;

        if (!webhookId || typeof webhookId !== 'string') {
            return errorResponse(createApiError('VALIDATION_ERROR', 'webhookId gereklidir'));
        }

        // Whitelist updatable fields
        const allowedFields: Record<string, boolean> = {
            url: true,
            events: true,
            active: true,
            label: true,
        };

        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields[key]) {
                sanitized[key] = value;
            }
        }

        // Validate URL if provided
        if (sanitized.url && !isValidWebhookUrl(sanitized.url as string)) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Geçerli bir HTTPS URL giriniz'));
        }

        // Validate events if provided
        if (sanitized.events) {
            const events = sanitized.events as string[];
            const invalidEvents = events.filter(e => !VALID_EVENTS.includes(e as WebhookEventType));
            if (invalidEvents.length > 0) {
                return errorResponse(createApiError('VALIDATION_ERROR', `Geçersiz olay türleri: ${invalidEvents.join(', ')}`));
            }
        }

        // Reset failure count when re-activating
        if (sanitized.active === true) {
            sanitized.failureCount = 0;
        }

        const db = getDb();
        const docRef = db
            .collection('tenants')
            .doc(auth.tenantId)
            .collection('webhooks')
            .doc(webhookId);

        const doc = await docRef.get();
        if (!doc.exists) {
            return errorResponse(createApiError('NOT_FOUND', 'Webhook bulunamadı'));
        }

        await docRef.update(sanitized);

        return NextResponse.json({
            message: 'Webhook güncellendi',
            webhookId,
            updatedFields: Object.keys(sanitized),
        });
    } catch (error) {
        return handleApiError(error, 'Webhook PUT');
    }
}

// ─── DELETE: Remove webhook ─────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        if (!['owner', 'admin'].includes(request.headers.get('x-user-role') || '')) {
            return errorResponse(createApiError('AUTH_ERROR', 'Webhook yönetimi için admin yetkisi gereklidir'));
        }

        const body = await request.json();
        if (!body.webhookId || typeof body.webhookId !== 'string') {
            return errorResponse(createApiError('VALIDATION_ERROR', 'webhookId gereklidir'));
        }

        const db = getDb();
        const docRef = db
            .collection('tenants')
            .doc(auth.tenantId)
            .collection('webhooks')
            .doc(body.webhookId);

        const doc = await docRef.get();
        if (!doc.exists) {
            return errorResponse(createApiError('NOT_FOUND', 'Webhook bulunamadı'));
        }

        await docRef.delete();

        return NextResponse.json({
            message: 'Webhook silindi',
            webhookId: body.webhookId,
        });
    } catch (error) {
        return handleApiError(error, 'Webhook DELETE');
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isValidWebhookUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Allow HTTP only in development
        if (process.env.NODE_ENV === 'production') {
            return parsed.protocol === 'https:';
        }
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function maskSecret(secret: string): string {
    if (!secret || secret.length < 12) return '***';
    return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}
