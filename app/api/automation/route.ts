/**
 * Automation / n8n Webhook API
 *
 * POST /api/automation
 *
 * Handles automation triggers from n8n workflows:
 * - Incoming events (new_call, new_complaint, appointment_reminder, etc.)
 * - Outbound actions (send_email, create_ticket, update_crm, etc.)
 *
 * GET /api/automation
 * - Lists available automation hooks for the tenant
 *
 * Authentication: Bearer token or API key via x-api-key header
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// Available automation hooks
// =============================================

const AUTOMATION_HOOKS = [
    {
        id: 'on_new_call',
        name: 'Yeni Çağrı',
        description: 'Gelen çağrı tamamlandığında tetiklenir',
        direction: 'outbound',
        payloadSchema: {
            callSid: 'string',
            from: 'string',
            to: 'string',
            duration: 'number',
            status: 'string',
            tenantId: 'string',
        },
    },
    {
        id: 'on_missed_call',
        name: 'Cevapsız Çağrı',
        description: 'Cevaplanmayan çağrıda tetiklenir',
        direction: 'outbound',
        payloadSchema: {
            callSid: 'string',
            from: 'string',
            to: 'string',
            tenantId: 'string',
        },
    },
    {
        id: 'on_new_complaint',
        name: 'Yeni Şikayet',
        description: 'Yeni müşteri şikayeti oluşturulduğunda tetiklenir',
        direction: 'outbound',
        payloadSchema: {
            complaintId: 'string',
            customerName: 'string',
            category: 'string',
            priority: 'string',
            description: 'string',
        },
    },
    {
        id: 'on_new_appointment',
        name: 'Yeni Randevu',
        description: 'Yeni randevu oluşturulduğunda tetiklenir',
        direction: 'outbound',
        payloadSchema: {
            appointmentId: 'string',
            customerName: 'string',
            dateTime: 'string',
            notes: 'string',
        },
    },
    {
        id: 'send_notification',
        name: 'Bildirim Gönder',
        description: 'E-posta veya SMS bildirimi gönderir',
        direction: 'inbound',
        payloadSchema: {
            type: '"email" | "sms"',
            to: 'string',
            subject: 'string?',
            body: 'string',
        },
    },
    {
        id: 'create_customer',
        name: 'Müşteri Oluştur',
        description: 'CRM\'e yeni müşteri ekler',
        direction: 'inbound',
        payloadSchema: {
            name: 'string',
            phone: 'string',
            email: 'string?',
            notes: 'string?',
        },
    },
    {
        id: 'update_ticket',
        name: 'Bilet Güncelle',
        description: 'Mevcut bir destek biletini günceller',
        direction: 'inbound',
        payloadSchema: {
            ticketId: 'string',
            status: 'string?',
            note: 'string?',
            assignee: 'string?',
        },
    },
];

// =============================================
// POST: Handle incoming automation event
// =============================================

export async function POST(request: NextRequest) {
    try {
        // Authenticate via API key or tenant header
        const apiKey = request.headers.get('x-api-key');
        const tenantId = request.headers.get('x-user-tenant');
        let resolvedTenantId = tenantId;

        if (apiKey && !tenantId) {
            // Look up tenant by API key
            const keyDoc = await getDb().collection('api_keys').doc(apiKey).get();
            if (!keyDoc.exists) {
                return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
            }
            resolvedTenantId = keyDoc.data()?.tenantId;
        }

        if (!resolvedTenantId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        const body = await request.json();
        const { action, payload } = body;

        if (!action) {
            return NextResponse.json({ error: 'action field is required' }, { status: 400 });
        }

        const firestore = getDb();
        const tenantRef = firestore.collection('tenants').doc(resolvedTenantId);

        // ─── Process Actions ───
        let result: Record<string, unknown> = {};

        switch (action) {
            case 'send_notification': {
                // Queue a notification
                const notifRef = await tenantRef.collection('notifications').add({
                    type: payload.type || 'email',
                    to: payload.to,
                    subject: payload.subject,
                    body: payload.body,
                    status: 'queued',
                    source: 'automation',
                    createdAt: FieldValue.serverTimestamp(),
                });
                result = { notificationId: notifRef.id, status: 'queued' };
                break;
            }

            case 'create_customer': {
                // Create a customer record
                const custRef = await tenantRef.collection('customers').add({
                    name: payload.name,
                    phone: payload.phone,
                    email: payload.email || null,
                    notes: payload.notes || null,
                    source: 'automation',
                    createdAt: FieldValue.serverTimestamp(),
                });
                result = { customerId: custRef.id, status: 'created' };
                break;
            }

            case 'create_appointment': {
                // Create an appointment
                const aptRef = await tenantRef.collection('appointments').add({
                    customerName: payload.customerName,
                    customerPhone: payload.customerPhone,
                    customerEmail: payload.customerEmail || null,
                    dateTime: payload.dateTime ? new Date(payload.dateTime) : null,
                    notes: payload.notes || null,
                    status: 'scheduled',
                    source: 'automation',
                    createdAt: FieldValue.serverTimestamp(),
                });
                result = { appointmentId: aptRef.id, status: 'created' };
                break;
            }

            case 'update_ticket': {
                // Update a ticket/complaint
                const ticketId = payload.ticketId;
                if (!ticketId) {
                    return NextResponse.json({ error: 'ticketId required' }, { status: 400 });
                }

                const updateData: Record<string, unknown> = {
                    updatedAt: FieldValue.serverTimestamp(),
                    updatedBy: 'automation',
                };
                if (payload.status) updateData.status = payload.status;
                if (payload.note) updateData.lastNote = payload.note;
                if (payload.assignee) updateData.assignee = payload.assignee;

                await tenantRef.collection('complaints').doc(ticketId).update(updateData);

                // Add note to history
                if (payload.note) {
                    await tenantRef.collection('complaints').doc(ticketId)
                        .collection('notes').add({
                            content: payload.note,
                            author: 'automation',
                            createdAt: FieldValue.serverTimestamp(),
                        });
                }

                result = { ticketId, status: 'updated' };
                break;
            }

            case 'log_activity': {
                // Log a custom activity
                const logRef = await tenantRef.collection('activity_logs').add({
                    type: payload.type || 'automation',
                    description: payload.description || 'Otomasyon aktivitesi',
                    metadata: payload.metadata || {},
                    source: 'n8n',
                    createdAt: FieldValue.serverTimestamp(),
                });
                result = { logId: logRef.id, status: 'logged' };
                break;
            }

            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}`, availableActions: AUTOMATION_HOOKS.filter(h => h.direction === 'inbound').map(h => h.id) },
                    { status: 400 }
                );
        }

        // Log the automation event
        await tenantRef.collection('automation_logs').add({
            action,
            payload,
            result,
            source: apiKey ? 'api_key' : 'internal',
            createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            action,
            ...result,
        });

    } catch (error) {
        return handleApiError(error, 'Automation');
    }
}

// =============================================
// GET: List available automation hooks
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant');
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
        }

        // Check for configured webhooks
        const webhooksSnap = await getDb()
            .collection('tenants').doc(tenantId)
            .collection('automation_webhooks')
            .get();

        const configuredWebhooks = webhooksSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({
            hooks: AUTOMATION_HOOKS,
            configured: configuredWebhooks,
            n8nWebhookUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'}/api/automation`,
            documentation: {
                auth: 'Set x-api-key header or x-user-tenant header',
                format: 'POST JSON with { action: "action_name", payload: { ... } }',
            },
        });

    } catch (error) {
        return handleApiError(error, 'Automation GET');
    }
}
