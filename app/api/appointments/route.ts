import { NextRequest, NextResponse } from 'next/server';
import { 
  createAppointment, 
  getAppointments, 
  updateAppointment 
} from '@/lib/firebase/db';
import { Timestamp } from 'firebase/firestore';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const appointments = await getAppointments({
      customerId: customerId || undefined,
      status: status || undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    return NextResponse.json(appointments);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, dateTime, durationMin = 30, notes, googleCalendarEventId } = body;

    if (!customerId || !dateTime) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, dateTime' },
        { status: 400 }
      );
    }

    const appointmentId = await createAppointment({
      customerId,
      dateTime: Timestamp.fromDate(new Date(dateTime)),
      durationMin,
      status: 'scheduled',
      notes,
      googleCalendarEventId,
    });

    return NextResponse.json({ success: true, appointmentId });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing appointment id' },
        { status: 400 }
      );
    }

    // Convert dateTime string to Timestamp if provided
    if (updateData.dateTime) {
      updateData.dateTime = Timestamp.fromDate(new Date(updateData.dateTime));
    }

    await updateAppointment(id, updateData);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

