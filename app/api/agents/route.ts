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
        if (!tenantId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 403 });
        }

        const body = await request.json();
        const { id, name, role, systemPrompt, variables, voiceConfig, fallbackRules, isActive } = body;

        if (!name || !systemPrompt) {
            return NextResponse.json(
                { error: 'name and systemPrompt are required' },
                { status: 400 },
            );
        }

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
            // Update existing
            await tenantAgents(tenantId).doc(id).update(agentData);
        } else {
            // Create new
            const ref = tenantAgents(tenantId).doc();
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
        console.error('[Agents API] Error:', error);
        return NextResponse.json(
            { error: 'Agent operation failed', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// GET: List agents or get specific agent
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        if (!tenantId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 403 });
        }

        const agentId = request.nextUrl.searchParams.get('id');

        if (agentId) {
            const doc = await tenantAgents(tenantId).doc(agentId).get();
            if (!doc.exists) {
                return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
            }
            return NextResponse.json({ id: doc.id, ...doc.data() });
        }

        // List all agents
        const snap = await tenantAgents(tenantId).orderBy('createdAt', 'desc').get();
        const agents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        return NextResponse.json({ agents, count: agents.length });

    } catch (error) {
        console.error('[Agents API] Error:', error);
        return NextResponse.json(
            { error: 'Agent fetch failed', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// DELETE: Remove an agent
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const tenantId = getTenantId(request);
        if (!tenantId) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 403 });
        }

        const { id } = await request.json();
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        await tenantAgents(tenantId).doc(id).delete();

        return NextResponse.json({ message: `Agent ${id} deleted` });

    } catch (error) {
        console.error('[Agents API] Error:', error);
        return NextResponse.json(
            { error: 'Agent delete failed', details: String(error) },
            { status: 500 },
        );
    }
}
