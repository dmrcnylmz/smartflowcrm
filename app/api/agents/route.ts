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
import { handleApiError, requireFields, createApiError, errorResponse } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { checkSubscriptionActive } from '@/lib/billing/subscription-guard';
import { applyPersonalityPreset, getActivePreset, type PersonalityPresetKey } from '@/lib/agents/personality-presets';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

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
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        // Subscription guard — block agent creation for expired/cancelled accounts
        const subGuard = await checkSubscriptionActive(getDb(), auth.tenantId);
        if (!subGuard.active) {
            return NextResponse.json(
                { error: 'Subscription inactive', message: subGuard.reason },
                { status: 403 },
            );
        }

        const body = await request.json();
        const validation = requireFields(body, ['name', 'systemPrompt']);
        if (validation) return errorResponse(validation);

        const { id, role, variables, voiceConfig, fallbackRules, isActive, templateId, templateColor, personalityPreset } = body;

        // Sanitize and validate name
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Asistan adı boş olamaz'));
        }
        if (name.length < 2) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Asistan adı en az 2 karakter olmalıdır'));
        }
        if (name.length > 100) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Asistan adı en fazla 100 karakter olabilir'));
        }

        // Sanitize systemPrompt
        const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
        if (!systemPrompt) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Sistem prompt\'u boş olamaz'));
        }
        if (systemPrompt.length < 10) {
            return errorResponse(createApiError('VALIDATION_ERROR', 'Sistem prompt\'u en az 10 karakter olmalıdır'));
        }

        let finalSystemPrompt = systemPrompt;
        let finalVoiceConfig = voiceConfig || {};
        let activePreset: PersonalityPresetKey | null = null;

        // Apply personality preset if specified
        if (personalityPreset && typeof personalityPreset === 'string') {
            try {
                const presetResult = applyPersonalityPreset(
                    { systemPrompt, voiceConfig: voiceConfig || { style: 'professional', temperature: 0.7, maxTokens: 512, language: 'tr' } },
                    personalityPreset as PersonalityPresetKey,
                );
                finalSystemPrompt = presetResult.systemPrompt;
                finalVoiceConfig = presetResult.voiceConfig;
                activePreset = presetResult.personalityPreset;
            } catch {
                // Invalid preset key — ignore, use raw systemPrompt
            }
        } else {
            // Detect active preset from existing systemPrompt for metadata
            activePreset = getActivePreset(systemPrompt);
        }

        const agentData: Record<string, unknown> = {
            name,
            role: role || 'assistant',
            systemPrompt: finalSystemPrompt,
            variables: variables || [],
            voiceConfig: finalVoiceConfig,
            fallbackRules: fallbackRules || [],
            isActive: isActive ?? true,
            updatedAt: FieldValue.serverTimestamp(),
        };

        // Store active personality preset for UI reference
        if (activePreset) agentData.personalityPreset = activePreset;

        // Optional template metadata
        if (templateId !== undefined) agentData.templateId = templateId;
        if (templateColor !== undefined) agentData.templateColor = templateColor;

        let agentId = id;

        if (id) {
            await tenantAgents(auth.tenantId).doc(id).update(agentData);
        } else {
            const ref = tenantAgents(auth.tenantId).doc();
            agentId = ref.id;
            await ref.set({
                ...agentData,
                tenantId: auth.tenantId,
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
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

        const agentId = request.nextUrl.searchParams.get('id');

        if (agentId) {
            const doc = await tenantAgents(auth.tenantId).doc(agentId).get();
            if (!doc.exists) {
                return errorResponse(createApiError('NOT_FOUND', 'Agent bulunamadı'));
            }
            return NextResponse.json({ id: doc.id, ...doc.data() }, {
                headers: cacheHeaders('MEDIUM'),
            });
        }

        const snap = await tenantAgents(auth.tenantId).orderBy('createdAt', 'desc').get();
        const agents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        return NextResponse.json({ agents, count: agents.length }, {
            headers: cacheHeaders('MEDIUM'),
        });

    } catch (error) {
        return handleApiError(error, 'Agents GET');
    }
}

// =============================================
// DELETE: Remove an agent
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireStrictAuth(request);
        if (auth.error) return auth.error;

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

        await tenantAgents(auth.tenantId).doc(body.id).delete();

        return NextResponse.json({ message: `Agent ${body.id} deleted` });

    } catch (error) {
        return handleApiError(error, 'Agents DELETE');
    }
}
