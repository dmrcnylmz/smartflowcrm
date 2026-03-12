/**
 * Tenant Settings API — Read & update tenant settings
 *
 * GET  /api/tenant/settings  → Fetch current tenant settings
 * PUT  /api/tenant/settings  → Update tenant settings (partial)
 *
 * Authentication: via middleware (x-user-tenant, x-user-uid, x-user-role headers)
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError, createApiError, errorResponse } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { getSubscription, isSubscriptionActive } from '@/lib/billing/lemonsqueezy';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// =============================================
// GET: Fetch tenant settings
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const firestore = getDb();

        // Fetch tenant document
        const tenantDoc = await firestore.collection('tenants').doc(auth.tenantId).get();

        if (!tenantDoc.exists) {
            // Return default settings if tenant doc doesn't exist yet
            return NextResponse.json({
                settings: getDefaultSettings(),
                tenantId: auth.tenantId,
                exists: false,
            }, {
                headers: cacheHeaders('MEDIUM'),
            });
        }

        const data = tenantDoc.data()!;

        // Map Firestore fields to settings shape
        const settings = {
            // Company
            companyName: data.companyName || '',
            companyEmail: data.companyEmail || data.email || '',
            companyPhone: data.companyPhone || data.phone || '',
            companyWebsite: data.companyWebsite || data.website || '',
            language: data.language || 'tr',
            timezone: data.timezone || 'Europe/Istanbul',
            // AI Assistant
            agentName: data.agent?.name || data.agentName || 'Callception Asistan',
            agentGreeting: data.agent?.greeting || data.agentGreeting || 'Merhaba, size nasıl yardımcı olabilirim?',
            agentPersonality: data.agent?.personality || data.agentPersonality || 'Profesyonel, yardımsever ve nazik bir asistan.',
            agentFallbackMessage: data.agent?.fallbackMessage || data.agentFallbackMessage || 'Anlayamadım, tekrar eder misiniz?',
            // Features
            assistantEnabled: data.settings?.assistantEnabled ?? false,
            callRecording: data.settings?.callRecording ?? data.callRecording ?? false,
            emailNotifications: data.settings?.emailNotifications ?? data.emailNotifications ?? true,
            autoAppointments: data.settings?.autoAppointments ?? data.autoAppointments ?? true,
            // Business info (for smart variable resolution in Agent Wizard)
            business: {
                workingHours: data.business?.workingHours || '',
                workingDays: data.business?.workingDays || '',
                services: data.business?.services || [],
                phone: data.business?.phone || data.companyPhone || '',
                email: data.business?.email || data.companyEmail || '',
                address: data.business?.address || '',
                website: data.business?.website || data.companyWebsite || '',
            },
            // Theme preference
            themeId: data.themeId || data.settings?.themeId || null,
            // System (read-only) — fetch real subscription from billing/subscription
            twilioConfigured: !!data.twilio?.accountSid || !!process.env.TWILIO_ACCOUNT_SID,
            openaiConfigured: !!process.env.OPENAI_API_KEY,
            ...(await getSubscriptionInfo(firestore, auth.tenantId)),
        };

        return NextResponse.json({
            settings,
            tenantId: auth.tenantId,
            exists: true,
        }, {
            headers: cacheHeaders('MEDIUM'),
        });

    } catch (error) {
        return handleApiError(error, 'Tenant Settings GET');
    }
}

// =============================================
// PUT: Update tenant settings
// =============================================

export async function PUT(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Role check from Firestore (not spoofable headers)
        const memberDoc = await getDb().collection('tenants').doc(auth.tenantId)
            .collection('members').doc(auth.uid).get();
        const userRole = memberDoc.exists ? memberDoc.data()?.role : null;
        if (userRole && userRole !== 'owner' && userRole !== 'admin') {
            return errorResponse(createApiError(
                'AUTH_ERROR',
                'Yalnızca yöneticiler ayarları güncelleyebilir',
            ));
        }

        const body = await request.json();
        const firestore = getDb();
        const tenantRef = firestore.collection('tenants').doc(auth.tenantId);

        // Build the Firestore update object (flattened for merge)
        const updateData: Record<string, unknown> = {
            updatedAt: FieldValue.serverTimestamp(),
        };

        // Company fields
        if (body.companyName !== undefined) updateData.companyName = body.companyName;
        if (body.companyEmail !== undefined) updateData.companyEmail = body.companyEmail;
        if (body.companyPhone !== undefined) updateData.companyPhone = body.companyPhone;
        if (body.companyWebsite !== undefined) updateData.companyWebsite = body.companyWebsite;
        if (body.language !== undefined) updateData.language = body.language;
        if (body.timezone !== undefined) updateData.timezone = body.timezone;

        // AI Assistant fields (nested under agent)
        if (body.agentName !== undefined) updateData['agent.name'] = body.agentName;
        if (body.agentGreeting !== undefined) updateData['agent.greeting'] = body.agentGreeting;
        if (body.agentPersonality !== undefined) updateData['agent.personality'] = body.agentPersonality;
        if (body.agentFallbackMessage !== undefined) updateData['agent.fallbackMessage'] = body.agentFallbackMessage;

        // Feature toggles (nested under settings)
        if (body.assistantEnabled !== undefined) updateData['settings.assistantEnabled'] = body.assistantEnabled;
        if (body.callRecording !== undefined) updateData['settings.callRecording'] = body.callRecording;
        if (body.emailNotifications !== undefined) updateData['settings.emailNotifications'] = body.emailNotifications;
        if (body.autoAppointments !== undefined) updateData['settings.autoAppointments'] = body.autoAppointments;

        // Theme preference
        if (body.themeId !== undefined) updateData.themeId = body.themeId;

        // Use set with merge to create doc if it doesn't exist
        await tenantRef.set(updateData, { merge: true });

        // Log settings change
        await tenantRef.collection('activity_logs').add({
            type: 'settings_update',
            description: 'Tenant ayarları güncellendi',
            changes: Object.keys(body),
            updatedBy: auth.uid || 'unknown',
            createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            message: 'Ayarlar başarıyla güncellendi',
            updatedFields: Object.keys(body),
        });

    } catch (error) {
        return handleApiError(error, 'Tenant Settings PUT');
    }
}

// =============================================
// Default Settings
// =============================================

function getDefaultSettings() {
    return {
        companyName: '',
        companyEmail: '',
        companyPhone: '',
        companyWebsite: '',
        language: 'tr',
        timezone: 'Europe/Istanbul',
        agentName: 'Callception Asistan',
        agentGreeting: 'Merhaba, size nasıl yardımcı olabilirim?',
        agentPersonality: 'Profesyonel, yardımsever ve nazik bir asistan. Türkçe konuşur.',
        agentFallbackMessage: 'Anlayamadım, tekrar eder misiniz?',
        assistantEnabled: false,
        callRecording: false,
        emailNotifications: true,
        autoAppointments: true,
        twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID,
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        subscriptionPlan: 'free_trial',
        subscriptionStatus: 'active',
        subscriptionActive: true,
    };
}

/**
 * Fetch real subscription info from billing/subscription Firestore doc.
 * Falls back to free_trial defaults if no subscription exists.
 */
async function getSubscriptionInfo(
    firestore: FirebaseFirestore.Firestore,
    tenantId: string,
): Promise<{
    subscriptionPlan: string;
    subscriptionStatus: string;
    subscriptionActive: boolean;
    billingInterval?: string;
    currentPeriodEnd?: number;
}> {
    try {
        const sub = await getSubscription(firestore, tenantId);
        if (!sub) {
            return {
                subscriptionPlan: 'free_trial',
                subscriptionStatus: 'active',
                subscriptionActive: true,
            };
        }
        return {
            subscriptionPlan: sub.planId,
            subscriptionStatus: sub.status,
            subscriptionActive: isSubscriptionActive(sub),
            billingInterval: sub.billingInterval,
            currentPeriodEnd: sub.currentPeriodEnd,
        };
    } catch {
        // Fail-open: return defaults if billing read fails
        return {
            subscriptionPlan: 'free_trial',
            subscriptionStatus: 'active',
            subscriptionActive: true,
        };
    }
}
