/**
 * Agent Prompt Builder API — CRUD for voice agent configurations
 *
 * POST: Create or update an agent
 * GET:  List agents or get a specific agent
 * DELETE: Remove an agent
 *
 * Agents are stored in tenants/{tenantId}/agents/
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { handleApiError, requireFields, requireAuth, createApiError, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

/** Resolve tenant: prefer x-user-tenant, fallback to x-user-uid */
function getTenantId(request: NextRequest): string | null {
    return request.headers.get('x-user-tenant')
        || request.headers.get('x-user-uid')
        || null;
}

// =============================================
// Firestore helpers
// =============================================

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) {
        initAdmin();
        db = getFirestore();
    }
    return db;
}

function tenantAgents(tenantId: string) {
    return getDb().collection('tenants').doc(tenantId).collection('agents');
}

// =============================================
// POST: Create or update an agent
// =============================================

export async function POST(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const body = await request.json();
        const validation = requireFields(body, ['name', 'systemPrompt']);
        if (validation) return errorResponse(validation);

        const { id, name, role, systemPrompt, variables, voiceConfig, fallbackRules, isActive } = body;

        const agentData = {
            name,
            role: role || 'assistant',
            systemPrompt,
            variables: variables || [],
            voiceConfig: voiceConfig || {},
            fallbackRules: fallbackRules || [],
            isActive: isActive ?? true,
            updatedAt: FieldValue.serverTimestamp(),
        };

        let agentId = id;

        if (id) {
            await tenantAgents(tenantId!).doc(id).update(agentData);
        } else {
            const ref = tenantAgents(tenantId!).doc();
            agentId = ref.id;
            await ref.set({
                ...agentData,
                tenantId,
                createdAt: FieldValue.serverTimestamp(),
            });
        }

        return NextResponse.json({
            id: agentId,
            message: id ? 'Agent updated' : 'Agent created',
        }, { status: id ? 200 : 201 });

    } catch (error) {
        return handleApiError(error, 'Agents POST');
    }
}

// =============================================
// GET: List agents or get specific agent
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        const agentId = request.nextUrl.searchParams.get('id');

        if (agentId) {
            const doc = await tenantAgents(tenantId!).doc(agentId).get();
            if (!doc.exists) {
                return errorResponse(createApiError('NOT_FOUND', 'Agent bulunamadı'));
            }
            return NextResponse.json({ id: doc.id, ...doc.data() });
        }

        const snap = await tenantAgents(tenantId!).orderBy('createdAt', 'desc').get();
        const agents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        return NextResponse.json({ agents, count: agents.length });

    } catch (error) {
        return handleApiError(error, 'Agents GET');
    }
}

// =============================================
// DELETE: Remove an agent
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        const authErr = requireAuth(tenantId);
        if (authErr) return errorResponse(authErr);

        // Role check: only admins and owners can delete agents
        const callerRole = request.headers.get('x-user-role');
        if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
            return NextResponse.json(
                { error: 'Only owners and admins can delete agents' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['id']);
        if (validation) return errorResponse(validation);

        await tenantAgents(tenantId!).doc(body.id).delete();

        return NextResponse.json({ message: `Agent ${body.id} deleted` });

    } catch (error) {
        return handleApiError(error, 'Agents DELETE');
    }
}
