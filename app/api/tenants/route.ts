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

        const tenantData: Omit<TenantConfig, 'id' | 'createdAt' | 'updatedAt'> = {
            companyName,
            sector: sector || '',
            language: language || 'tr',
            agent: agent || {
                name: 'Asistan',
                role: 'Müşteri Temsilcisi',
                traits: ['profesyonel', 'nazik'],
                greeting: `Merhaba, ${companyName}'ye hoş geldiniz. Size nasıl yardımcı olabilirim?`,
                farewell: 'Aradığınız için teşekkür ederiz. İyi günler.',
            },
            business: business || {
                workingHours: '09:00-18:00',
                workingDays: 'Pazartesi-Cuma',
                services: [],
            },
            voice: voice || {
                voiceId: 'EXAVITQu4vr4xnSDxMaL',
                ttsModel: 'eleven_flash_v2_5',
                sttLanguage: language === 'en' ? 'en' : 'tr',
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
        const userId = request.headers.get('x-user-uid');
        const authErr = requireAuth(userId);
        if (authErr) return errorResponse(authErr);

        const tenantId = request.nextUrl.searchParams.get('tenantId');

        if (tenantId) {
            const tenant = await getTenant(tenantId);
            if (!tenant) {
                return errorResponse(createApiError('NOT_FOUND', 'Tenant bulunamadı'));
            }
            return NextResponse.json(tenant);
        }

        const tenants = await listTenants();
        return NextResponse.json({ tenants, count: tenants.length });

    } catch (error) {
        return handleApiError(error, 'Tenants GET');
    }
}

// =============================================
// PUT: Update tenant config
// =============================================

export async function PUT(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-uid');
        const userTenant = request.headers.get('x-user-tenant');
        const userRole = request.headers.get('x-user-role');

        const authErr = requireAuth(userId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const { tenantId, ...updates } = body;

        const targetTenant = tenantId || userTenant;
        if (!targetTenant) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'tenantId gerekli'));
        }

        // Only owner/admin can update tenant config
        if (userRole !== 'owner' && userRole !== 'admin') {
            return errorResponse(createApiError('AUTH_ERROR', 'Yalnızca owner ve admin tenant ayarlarını güncelleyebilir'));
        }

        await updateTenant(targetTenant, updates);

        return NextResponse.json({
            message: `Tenant "${targetTenant}" updated successfully`,
        });

    } catch (error) {
        return handleApiError(error, 'Tenants PUT');
    }
}
