import { NextRequest, NextResponse } from 'next/server';
import { getAllCustomers, createCustomer, getTenantFromRequest } from '@/lib/firebase/admin-db';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const customers = await getAllCustomers(tenantId);
    return NextResponse.json(customers);
  } catch (error: unknown) {
    return handleApiError(error, 'Customers GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const body = await request.json();

    const validation = requireFields(body, ['name', 'phone']);
    if (validation) return errorResponse(validation);

    const customerRef = await createCustomer(tenantId, {
      name: body.name,
      phone: body.phone,
      email: body.email || '',
      notes: body.notes || '',
    });

    return NextResponse.json({ success: true, customerId: customerRef.id }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Customers POST');
  }
}
