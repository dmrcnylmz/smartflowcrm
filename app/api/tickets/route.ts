import { NextRequest, NextResponse } from 'next/server';
import {
  createComplaint,
  getComplaints,
  updateComplaint,
  createInfoRequest,
  getInfoRequests,
  updateInfoRequest,
  getTenantFromRequest,
} from '@/lib/firebase/admin-db';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

// GET /api/tickets?type=complaint|info&customerId=&status=
export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'complaint';
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');

    if (type === 'complaint') {
      const complaints = await getComplaints(tenantId, {
        customerId: customerId || undefined,
        status: status || undefined,
      });
      return NextResponse.json(complaints);
    } else {
      const infoRequests = await getInfoRequests(tenantId, {
        customerId: customerId || undefined,
        status: status || undefined,
      });
      return NextResponse.json(infoRequests);
    }
  } catch (error: unknown) {
    return handleApiError(error, 'Tickets GET');
  }
}

// POST /api/tickets - Create complaint or info request
export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const body = await request.json();
    const { type = 'complaint', customerId, ...data } = body;

    const custValidation = requireFields({ customerId }, ['customerId']);
    if (custValidation) return errorResponse(custValidation);

    let ticketId: string;

    if (type === 'complaint') {
      const fieldValidation = requireFields(data, ['category', 'description']);
      if (fieldValidation) return errorResponse(fieldValidation);

      const complaintRef = await createComplaint(tenantId, {
        customerId,
        category: data.category,
        description: data.description,
        status: 'open',
        assignedTo: data.assignedTo || null,
      });
      ticketId = complaintRef.id;
    } else {
      const fieldValidation = requireFields(data, ['topic', 'details']);
      if (fieldValidation) return errorResponse(fieldValidation);

      const infoRequestRef = await createInfoRequest(tenantId, {
        customerId,
        topic: data.topic,
        details: data.details,
        status: 'pending',
        assignedTo: data.assignedTo || null,
      });
      ticketId = infoRequestRef.id;
    }

    return NextResponse.json({ success: true, ticketId, type }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Tickets POST');
  }
}

// PATCH /api/tickets - Update ticket
export async function PATCH(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const body = await request.json();
    const { id, type = 'complaint', ...updateData } = body;

    const validation = requireFields({ id }, ['id']);
    if (validation) return errorResponse(validation);

    if (type === 'complaint') {
      await updateComplaint(tenantId, id, updateData);
    } else {
      await updateInfoRequest(tenantId, id, updateData);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Tickets PATCH');
  }
}
