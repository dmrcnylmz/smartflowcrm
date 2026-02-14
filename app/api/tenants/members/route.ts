/**
 * Tenant Member Management API
 *
 * POST: Assign a user to a tenant
 * GET:  List tenant members
 * DELETE: Remove user from tenant
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    assignUserToTenant,
    removeUserFromTenant,
    getTenantMembers,
} from '@/lib/tenant/admin';

// =============================================
// POST: Assign user to tenant
// =============================================

export async function POST(request: NextRequest) {
    try {
        const callerRole = request.headers.get('x-user-role');
        const callerTenant = request.headers.get('x-user-tenant');

        if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
            return NextResponse.json(
                { error: 'Only owners and admins can manage members' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const { uid, tenantId, role } = body;

        if (!uid || !tenantId) {
            return NextResponse.json(
                { error: 'uid and tenantId are required' },
                { status: 400 },
            );
        }

        // Non-owners can't assign owner role
        if (role === 'owner' && callerRole !== 'owner') {
            return NextResponse.json(
                { error: 'Only owners can assign the owner role' },
                { status: 403 },
            );
        }

        // Can only manage own tenant unless super-admin
        if (callerTenant && callerTenant !== tenantId) {
            return NextResponse.json(
                { error: 'Cannot manage members of another tenant' },
                { status: 403 },
            );
        }

        await assignUserToTenant(uid, tenantId, role || 'viewer');

        return NextResponse.json({
            message: `User ${uid} assigned to tenant ${tenantId} as ${role || 'viewer'}`,
        });

    } catch (error) {
        console.error('[Members API] Assign error:', error);
        return NextResponse.json(
            { error: 'Failed to assign user', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// GET: List members of a tenant
// =============================================

export async function GET(request: NextRequest) {
    try {
        const tenantId = request.headers.get('x-user-tenant')
            || request.nextUrl.searchParams.get('tenantId');

        if (!tenantId) {
            return NextResponse.json(
                { error: 'tenantId is required' },
                { status: 400 },
            );
        }

        const members = await getTenantMembers(tenantId);

        return NextResponse.json({
            tenantId,
            members,
            count: members.length,
        });

    } catch (error) {
        console.error('[Members API] List error:', error);
        return NextResponse.json(
            { error: 'Failed to list members', details: String(error) },
            { status: 500 },
        );
    }
}

// =============================================
// DELETE: Remove user from tenant
// =============================================

export async function DELETE(request: NextRequest) {
    try {
        const callerRole = request.headers.get('x-user-role');

        if (!callerRole || !['owner', 'admin'].includes(callerRole)) {
            return NextResponse.json(
                { error: 'Only owners and admins can remove members' },
                { status: 403 },
            );
        }

        const { uid, tenantId } = await request.json();

        if (!uid || !tenantId) {
            return NextResponse.json(
                { error: 'uid and tenantId are required' },
                { status: 400 },
            );
        }

        await removeUserFromTenant(uid, tenantId);

        return NextResponse.json({
            message: `User ${uid} removed from tenant ${tenantId}`,
        });

    } catch (error) {
        console.error('[Members API] Remove error:', error);
        return NextResponse.json(
            { error: 'Failed to remove user', details: String(error) },
            { status: 500 },
        );
    }
}
