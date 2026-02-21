import { NextRequest, NextResponse } from 'next/server';
import { getAllCustomers, createCustomer } from '@/lib/firebase/db';
import { handleApiError, requireFields, createApiError, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const customers = await getAllCustomers();
    return NextResponse.json(customers);
  } catch (error: unknown) {
    return handleApiError(error, 'Customers GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = requireFields(body, ['name', 'phone']);
    if (validation) return errorResponse(validation);

    const customerId = await createCustomer({
      name: body.name,
      phone: body.phone,
      email: body.email || '',
      notes: body.notes || '',
    });

    return NextResponse.json({ success: true, customerId }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Customers POST');
  }
}
