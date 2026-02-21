import { NextRequest, NextResponse } from 'next/server';
import { addCallLog, addActivityLog, getCustomerByPhone, createCustomer, getCustomer } from '@/lib/firebase/db';
import { Timestamp } from 'firebase/firestore';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = requireFields(body, ['customerPhone']);
    if (validation) return errorResponse(validation);

    const { customerPhone, customerName, duration, status, intent, summary, direction = 'inbound' } = body;

    // Get or create customer
    let customer = await getCustomerByPhone(customerPhone);
    if (!customer) {
      const newCustomerRef = await createCustomer({
        name: customerName || 'Bilinmeyen',
        phone: customerPhone,
        email: '',
      });
      const createdCustomer = await getCustomer(newCustomerRef.id);
      if (!createdCustomer) {
        throw new Error('Failed to retrieve created customer');
      }
      customer = createdCustomer;
    }

    // Add call log
    const callLog = await addCallLog({
      customerPhone,
      customerName: customer.name,
      customerId: customer.id,
      duration: duration || 0,
      status: status || 'answered',
      intent,
      summary,
      direction,
      timestamp: Timestamp.now(),
    });

    // Add activity log
    await addActivityLog({
      type: 'call',
      description: `${direction === 'inbound' ? 'Gelen' : 'Giden'} arama: ${customer.name} (${customerPhone})`,
      relatedId: callLog.id,
    });

    return NextResponse.json({
      success: true,
      callLogId: callLog.id,
      customerId: customer.id,
      message: 'Call logged successfully',
    }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Webhook Call');
  }
}
