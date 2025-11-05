import { NextRequest, NextResponse } from 'next/server';
import { addCallLog, addActivityLog, getCustomerByPhone, createCustomer, getCustomer } from '@/lib/firebase/db';
import { Timestamp } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerPhone, customerName, duration, status, intent, summary, direction = 'inbound' } = body;

    if (!customerPhone) {
      return NextResponse.json({ error: 'customerPhone is required' }, { status: 400 });
    }

    // Get or create customer
    let customer = await getCustomerByPhone(customerPhone);
    if (!customer) {
      const newCustomerRef = await createCustomer({
        name: customerName || 'Bilinmeyen',
        phone: customerPhone,
        email: '',
      });
      // Fetch the created customer to get all fields including createdAt
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
    });
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
