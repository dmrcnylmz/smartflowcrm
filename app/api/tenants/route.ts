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

// =============================================
// POST: Create new tenant + assign creator
// =============================================

export async function POST(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-uid');
        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { companyName, sector, language, agent, business, voice } = body;

        if (!companyName) {
            return NextResponse.json(
                { error: 'companyName is required' },
                { status: 400 },
            );
        }

        // Create tenant with defaults
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

        // Assign the creating user as owner
        await assignUserToTenant(userId, tenantId, 'owner');

        return NextResponse.json({
            tenantId,
            message: `Tenant "${companyName}" created successfully`,
            note: 'You have been assigned as owner. Please re-login to get updated JWT claims.',
        }, { status: 201 });

    } catch (error) {
        console.error('[Tenant API] Create error:', error);
        return NextResponse.json(
            { error: 'Failed to create tenant', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// GET: List tenants or get a specific tenant
// =============================================

export async function GET(request: NextRequest) {
    try {
        const userId = request.headers.get('x-user-uid');
        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 },
            );
        }

        const tenantId = request.nextUrl.searchParams.get('tenantId');

        if (tenantId) {
            // Get specific tenant
            const tenant = await getTenant(tenantId);
            if (!tenant) {
                return NextResponse.json(
                    { error: 'Tenant not found' },
                    { status: 404 },
                );
            }
            return NextResponse.json(tenant);
        }

        // List all tenants (admin function)
        const tenants = await listTenants();
        return NextResponse.json({ tenants, count: tenants.length });

    } catch (error) {
        console.error('[Tenant API] Get error:', error);
        return NextResponse.json(
            { error: 'Failed to get tenants', details: String(error) },
            { status: 500 },
        );
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

        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required' },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { tenantId, ...updates } = body;

        const targetTenant = tenantId || userTenant;
        if (!targetTenant) {
            return NextResponse.json(
                { error: 'tenantId is required' },
                { status: 400 },
            );
        }

        // Only owner/admin can update tenant config
        if (userRole !== 'owner' && userRole !== 'admin') {
            return NextResponse.json(
                { error: 'Only owners and admins can update tenant configuration' },
                { status: 403 },
            );
        }

        await updateTenant(targetTenant, updates);

        return NextResponse.json({
            message: `Tenant "${targetTenant}" updated successfully`,
        });

    } catch (error) {
        console.error('[Tenant API] Update error:', error);
        return NextResponse.json(
            { error: 'Failed to update tenant', details: String(error) },
            { status: 500 },
        );
    }
}
