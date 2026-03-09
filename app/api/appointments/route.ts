import { NextRequest, NextResponse } from 'next/server';
import {
  createAppointment,
  getAppointments,
  updateAppointment,
  Timestamp,
} from '@/lib/firebase/admin-db';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { sendWebhook } from '@/lib/n8n/client';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const appointments = await getAppointments(auth.tenantId, {
      customerId: customerId || undefined,
      status: status || undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
    });

    return NextResponse.json(appointments, {
      headers: cacheHeaders('SHORT'),
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Appointments GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;
    const { tenantId } = auth;

    const body = await request.json();

    const validation = requireFields(body, ['customerId', 'dateTime']);
    if (validation) return errorResponse(validation);

    const appointmentRef = await createAppointment(tenantId, {
      customerId: body.customerId,
      dateTime: Timestamp.fromDate(new Date(body.dateTime)),
      durationMin: body.durationMin || 30,
      status: 'scheduled',
      notes: body.notes,
      googleCalendarEventId: body.googleCalendarEventId,
    });

    // Fire on_new_appointment webhook (fire-and-forget)
    sendWebhook('on_new_appointment', {
      tenantId,
      arguments: {
        appointmentId: appointmentRef.id,
        customerId: body.customerId,
        dateTime: body.dateTime,
        durationMin: body.durationMin || 30,
        notes: body.notes || null,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, appointmentId: appointmentRef.id }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Appointments POST');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;
    const { tenantId } = auth;

    const body = await request.json();

    const validation = requireFields(body, ['id']);
    if (validation) return errorResponse(validation);

    const { id, ...updateData } = body;

    // Convert dateTime string to Timestamp if provided
    if (updateData.dateTime) {
      updateData.dateTime = Timestamp.fromDate(new Date(updateData.dateTime));
    }

    await updateAppointment(tenantId, id, updateData);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return handleApiError(error, 'Appointments PATCH');
  }
}
