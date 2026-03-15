/**
 * Tenant Admin API — CRUD operations for tenant management
 *
 * POST: Create a new tenant
 * GET:  List all tenants (super-admin only)
 * PUT:  Update a tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    createTenant,
    listTenants,
    getTenant,
    updateTenant,
    assignUserToTenant,
} from '@/lib/tenant/admin';
import type { TenantConfig } from '@/lib/tenant/types';
import { handleApiError, requireFields, requireAuth, createApiError, errorResponse } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { cacheHeaders } from '@/lib/utils/cache-headers';

// =============================================
// POST: Create new tenant + assign creator
// =============================================

export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-uid');
        const authErr = requireAuth(userId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const validation = requireFields(body, ['companyName']);
        if (validation) return errorResponse(validation);

        const { companyName, sector, language, agent, business, voice } = body;

        // Validate language
        const VALID_LANGUAGES = ['tr', 'en', 'de', 'fr', 'tr-en'];
        const resolvedLanguage = VALID_LANGUAGES.includes(language) ? language : 'tr';

        const tenantData: Omit<TenantConfig, 'id' | 'createdAt' | 'updatedAt'> = {
            companyName,
            sector: sector || '',
            language: resolvedLanguage,
            agent: agent || getDefaultAgent(resolvedLanguage, companyName),
            business: business || {
                workingHours: '09:00-18:00',
                workingDays: resolvedLanguage === 'de' ? 'Montag-Freitag'
                    : resolvedLanguage === 'fr' ? 'Lundi-Vendredi'
                    : resolvedLanguage === 'en' ? 'Monday-Friday'
                    : 'Pazartesi-Cuma',
                services: [],
            },
            voice: voice || {
                voiceId: 'EXAVITQu4vr4xnSDxMaL',
                ttsModel: 'eleven_flash_v2_5',
                sttLanguage: (['en', 'de', 'fr'].includes(language) ? language : 'tr') as string,
                stability: 0.5,
                similarityBoost: 0.75,
            },
            guardrails: {
                forbiddenTopics: [],
                competitorNames: [],
                allowPriceQuotes: false,
                allowContractTerms: false,
                maxResponseLength: 500,
                escalationRules: [],
            },
            quotas: {
                dailyMinutes: 60,
                monthlyCalls: 500,
                maxConcurrentSessions: 3,
            },
            active: true,
        };

        const tenantId = await createTenant(tenantData);
        await assignUserToTenant(userId!, tenantId, 'owner');

        return NextResponse.json({
            tenantId,
            message: `Tenant "${companyName}" created successfully`,
            note: 'You have been assigned as owner. Please re-login to get updated JWT claims.',
        }, { status: 201 });

    } catch (error) {
        return handleApiError(error, 'Tenants POST');
    }
}

// =============================================
// GET: List tenants or get a specific tenant
// =============================================

export async function GET(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const tenantId = request.nextUrl.searchParams.get('tenantId');

        // Tenant isolation: users can only access their own tenant
        if (tenantId && tenantId !== auth.tenantId) {
            return errorResponse(createApiError('AUTH_ERROR', 'Başka tenant verilerine erişim engellendi'));
        }

        const targetTenant = tenantId || auth.tenantId;
        const tenant = await getTenant(targetTenant);
        if (!tenant) {
            return errorResponse(createApiError('NOT_FOUND', 'Tenant bulunamadı'));
        }
        return NextResponse.json(tenant, {
            headers: cacheHeaders('MEDIUM'),
        });

    } catch (error) {
        return handleApiError(error, 'Tenants GET');
    }
}

// =============================================
// PUT: Update tenant config
// =============================================

export async function PUT(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const userRole = request.headers.get('x-user-role');

        const body = await request.json();
        const { tenantId, ...updates } = body;

        const targetTenant = tenantId || auth.tenantId;

        // Tenant isolation: users can only update their own tenant
        if (tenantId && tenantId !== auth.tenantId) {
            return errorResponse(createApiError('AUTH_ERROR', 'Başka tenant verilerine erişim engellendi'));
        }

        // Only owner/admin can update tenant config
        if (userRole !== 'owner' && userRole !== 'admin') {
            return errorResponse(createApiError('AUTH_ERROR', 'Yalnızca owner ve admin tenant ayarlarını güncelleyebilir'));
        }

        // Allowlist: only permit known fields to be updated
        const ALLOWED_UPDATE_FIELDS = [
            'companyName', 'sector', 'phone', 'email', 'website',
            'agent', 'business', 'voice', 'language',
        ];

        const filtered: Record<string, unknown> = {};
        for (const key of Object.keys(updates)) {
            if (ALLOWED_UPDATE_FIELDS.includes(key)) filtered[key] = updates[key];
        }
        if (Object.keys(filtered).length === 0) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Güncellenecek geçerli alan bulunamadı'));
        }

        await updateTenant(targetTenant, filtered);

        return NextResponse.json({
            message: `Tenant "${targetTenant}" updated successfully`,
        });

    } catch (error) {
        return handleApiError(error, 'Tenants PUT');
    }
}

// =============================================
// Language-aware defaults
// =============================================

function getDefaultAgent(language: string, companyName: string) {
    switch (language) {
        case 'en':
            return {
                name: 'Assistant',
                role: 'Customer Representative',
                traits: ['professional', 'kind'],
                greeting: `Hello, welcome to ${companyName}. How can I help you?`,
                farewell: 'Thank you for calling. Have a great day.',
            };
        case 'de':
            return {
                name: 'Assistent',
                role: 'Kundenberater',
                traits: ['professionell', 'freundlich'],
                greeting: `Hallo, willkommen bei ${companyName}. Wie kann ich Ihnen helfen?`,
                farewell: 'Vielen Dank für Ihren Anruf. Schönen Tag noch.',
            };
        case 'fr':
            return {
                name: 'Assistant',
                role: 'Conseiller clientèle',
                traits: ['professionnel', 'aimable'],
                greeting: `Bonjour, bienvenue chez ${companyName}. Comment puis-je vous aider ?`,
                farewell: 'Merci de votre appel. Bonne journée.',
            };
        default:
            return {
                name: 'Asistan',
                role: 'Müşteri Temsilcisi',
                traits: ['profesyonel', 'nazik'],
                greeting: `Merhaba, ${companyName}'ye hoş geldiniz. Size nasıl yardımcı olabilirim?`,
                farewell: 'Aradığınız için teşekkür ederiz. İyi günler.',
            };
    }
}
