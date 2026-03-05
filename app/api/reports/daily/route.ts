import { NextRequest, NextResponse } from 'next/server';
import {
  getCallLogs,
  getComplaints,
  getInfoRequests,
  getAppointments,
  getTenantFromRequest,
} from '@/lib/firebase/admin-db';
import { toDate } from '@/lib/utils/date-helpers';
import { demoCallLogs, demoComplaints, demoInfoRequests, demoAppointments } from '@/lib/firebase/demo-data';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const targetDate = new Date(dateStr);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    let calls, complaints, infoRequests, appointments;
    let useDemoMode = false;

    if (tenantId) {
      try {
        [calls, complaints, infoRequests, appointments] = await Promise.all([
          getCallLogs(tenantId, { dateFrom: startOfDay, dateTo: endOfDay }),
          getComplaints(tenantId),
          getInfoRequests(tenantId),
          getAppointments(tenantId, { dateFrom: startOfDay, dateTo: endOfDay }),
        ]);
      } catch (error: unknown) {
        const err = error as { message?: string; code?: string };
        if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
          useDemoMode = true;
        } else {
          throw error;
        }
      }
    } else {
      useDemoMode = true;
    }

    // Use demo data if in demo mode or if any data is missing
    if (useDemoMode || !calls || !complaints || !infoRequests || !appointments) {
      calls = calls ?? demoCallLogs;
      complaints = complaints ?? demoComplaints;
      infoRequests = infoRequests ?? demoInfoRequests;
      appointments = appointments ?? demoAppointments;
    }

    const openComplaints = complaints.filter((c: any) => c.status === 'open');
    const missedCalls = calls.filter((c: any) => c.status === 'missed');
    const scheduledAppointments = appointments.filter((a: any) => a.status === 'scheduled');

    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum: number, c: any) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
      : 0;

    const report = {
      date: dateStr,
      demoMode: useDemoMode,
      summary: {
        totalCalls: calls.length,
        missedCalls: missedCalls.length,
        answeredCalls: calls.length - missedCalls.length,
        avgCallDuration: Math.round(avgCallDuration),
        openComplaints: openComplaints.length,
        totalComplaints: complaints.length,
        resolvedComplaints: complaints.filter((c: any) => c.status === 'resolved').length,
        openInfoRequests: infoRequests.filter((i: any) => i.status === 'pending').length,
        scheduledAppointments: scheduledAppointments.length,
        completedAppointments: appointments.filter((a: any) => a.status === 'completed').length,
      },
      calls: calls.map((c: any) => ({
        id: c.id,
        timestamp: toDate(c.timestamp ?? c.createdAt)?.toISOString() ?? '',
        intent: c.intent,
        status: c.status,
        duration: c.durationSec ?? c.duration ?? 0,
      })),
      complaints: openComplaints.map((c: any) => ({
        id: c.id,
        category: c.category,
        status: c.status,
        createdAt: toDate(c.createdAt)?.toISOString() ?? '',
      })),
      appointments: scheduledAppointments.map((a: any) => ({
        id: a.id,
        dateTime: toDate(a.dateTime)?.toISOString() ?? '',
        status: a.status,
      })),
    };

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Reports Daily');
  }
}
