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
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';

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
      return NextResponse.json(complaints, {
        headers: { 'Cache-Control': 'private, max-age=0, s-maxage=10, stale-while-revalidate=30' },
      });
    } else {
      const infoRequests = await getInfoRequests(tenantId, {
        customerId: customerId || undefined,
        status: status || undefined,
      });
      return NextResponse.json(infoRequests, {
        headers: { 'Cache-Control': 'private, max-age=0, s-maxage=10, stale-while-revalidate=30' },
      });
    }
  } catch (error: unknown) {
    return handleApiError(error, 'Tickets GET');
  }
}

// POST /api/tickets - Create complaint or info request
// Accepts either:
//   - customerId (reference to existing customer)
//   - customerName (inline, from the support ticket form)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { type = 'complaint', customerId, customerName, customerEmail, customerPhone, ...data } = body;

    // Require at least a customer identifier (id or name)
    if (!customerId && !customerName) {
      return NextResponse.json({ error: 'customerId veya customerName gerekli' }, { status: 400 });
    }

    const titleValidation = requireFields(data, ['title']);
    if (titleValidation) return errorResponse(titleValidation);

    let ticketId: string;

    // Support ticket model: store inline customer info + title/description/priority
    const ticketData: Record<string, unknown> = {
      customerId: customerId || null,
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      customerPhone: customerPhone || null,
      title: data.title,
      description: data.description || '',
      category: data.category || 'general',
      priority: data.priority || 'medium',
      status: 'open',
      assignedTo: data.assignedTo || null,
    };

    if (type === 'info') {
      const infoRequestRef = await createInfoRequest(auth.tenantId, {
        ...ticketData,
        topic: data.title,
        details: data.description || '',
        status: 'pending',
      });
      ticketId = infoRequestRef.id;
    } else {
      const complaintRef = await createComplaint(auth.tenantId, ticketData);
      ticketId = complaintRef.id;
    }

    return NextResponse.json({ success: true, ticketId, type }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Tickets POST');
  }
}

// PATCH /api/tickets - Update ticket
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { id, type = 'complaint', ...updateData } = body;

    const validation = requireFields({ id }, ['id']);
    if (validation) return errorResponse(validation);

    if (type === 'complaint') {
      await updateComplaint(auth.tenantId, id, updateData);
    } else {
      await updateInfoRequest(auth.tenantId, id, updateData);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Tickets PATCH');
  }
}
