import { NextRequest, NextResponse } from 'next/server';
import { 
  createComplaint, 
  getComplaints, 
  updateComplaint,
  createInfoRequest,
  getInfoRequests,
  updateInfoRequest,
} from '@/lib/firebase/db';

// GET /api/tickets?type=complaint|info&customerId=&status=
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'complaint';
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');

    if (type === 'complaint') {
      const complaints = await getComplaints({
        customerId: customerId || undefined,
        status: status || undefined,
      });
      return NextResponse.json(complaints);
    } else {
      const infoRequests = await getInfoRequests({
        customerId: customerId || undefined,
        status: status || undefined,
      });
      return NextResponse.json(infoRequests);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// POST /api/tickets - Create complaint or info request
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type = 'complaint', customerId, ...data } = body;

    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customerId' },
        { status: 400 }
      );
    }

    let ticketId: string;

    if (type === 'complaint') {
      if (!data.category || !data.description) {
        return NextResponse.json(
          { error: 'Missing required fields: category, description' },
          { status: 400 }
        );
      }
      const complaintRef = await createComplaint({
        customerId,
        category: data.category,
        description: data.description,
        status: 'open',
        assignedTo: data.assignedTo || null,
      });
      ticketId = complaintRef.id;
    } else {
      if (!data.topic || !data.details) {
        return NextResponse.json(
          { error: 'Missing required fields: topic, details' },
          { status: 400 }
        );
      }
      const infoRequestRef = await createInfoRequest({
        customerId,
        topic: data.topic,
        details: data.details,
        status: 'pending',
        assignedTo: data.assignedTo || null,
      });
      ticketId = infoRequestRef.id;
    }

    return NextResponse.json({ success: true, ticketId, type });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// PATCH /api/tickets - Update ticket
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, type = 'complaint', ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing ticket id' },
        { status: 400 }
      );
    }

    if (type === 'complaint') {
      await updateComplaint(id, updateData);
    } else {
      await updateInfoRequest(id, updateData);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

