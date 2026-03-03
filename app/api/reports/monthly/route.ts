import { NextRequest, NextResponse } from 'next/server';
import {
  getCallLogs,
  getComplaints,
  getInfoRequests,
  getAppointments,
  getTenantFromRequest,
} from '@/lib/firebase/admin-db';
import { toDate } from '@/lib/utils/date-helpers';
import { startOfMonth, endOfMonth, subMonths, format, eachWeekOfInterval, endOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { handleApiError } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const monthStr = searchParams.get('month') || new Date().toISOString().split('T')[0];
    const targetDate = new Date(monthStr);

    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);
    monthStart.setHours(0, 0, 0, 0);
    monthEnd.setHours(23, 59, 59, 999);

    const prevMonthStart = subMonths(monthStart, 1);
    const prevMonthEnd = subMonths(monthEnd, 1);

    const [calls, complaints, infoRequests, appointments] = await Promise.all([
      getCallLogs(tenantId, { dateFrom: monthStart, dateTo: monthEnd }),
      getComplaints(tenantId),
      getInfoRequests(tenantId),
      getAppointments(tenantId, { dateFrom: monthStart, dateTo: monthEnd }),
    ]);

    const [prevCalls, , , prevAppointments] = await Promise.all([
      getCallLogs(tenantId, { dateFrom: prevMonthStart, dateTo: prevMonthEnd }),
      getComplaints(tenantId),
      getInfoRequests(tenantId),
      getAppointments(tenantId, { dateFrom: prevMonthStart, dateTo: prevMonthEnd }),
    ]);

    const monthComplaints = complaints.filter((c: any) => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= monthStart && createdAt <= monthEnd;
    });
    const monthInfoRequests = infoRequests.filter((i: any) => {
      const createdAt = toDate(i.createdAt);
      return createdAt != null && createdAt >= monthStart && createdAt <= monthEnd;
    });

    const prevMonthComplaints = complaints.filter((c: any) => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= prevMonthStart && createdAt <= prevMonthEnd;
    });

    const weeks = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1, locale: tr },
    );

    const weeklyBreakdown = weeks.map((wStart) => {
      const wEnd = endOfWeek(wStart, { weekStartsOn: 1, locale: tr });
      const weekEndDate = wEnd > monthEnd ? monthEnd : wEnd;

      const weekCalls = calls.filter((c: any) => {
        const callDate = toDate(c.timestamp || c.createdAt);
        return callDate != null && callDate >= wStart && callDate <= weekEndDate;
      });

      return {
        week: format(wStart, 'd MMM', { locale: tr }),
        weekStart: wStart.toISOString(),
        calls: weekCalls.length,
        answered: weekCalls.filter((c: any) => c.status === 'answered').length,
        missed: weekCalls.filter((c: any) => c.status === 'missed').length,
      };
    });

    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum: number, c: any) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
      : 0;

    const report = {
      month: format(monthStart, 'yyyy-MM'),
      monthLabel: format(monthStart, 'MMMM yyyy', { locale: tr }),
      summary: {
        totalCalls: calls.length,
        missedCalls: calls.filter((c: any) => c.status === 'missed').length,
        answeredCalls: calls.filter((c: any) => c.status === 'answered').length,
        avgCallDuration: Math.round(avgCallDuration),
        openComplaints: monthComplaints.filter((c: any) => c.status === 'open').length,
        totalComplaints: monthComplaints.length,
        resolvedComplaints: monthComplaints.filter((c: any) => c.status === 'resolved').length,
        openInfoRequests: monthInfoRequests.filter((i: any) => i.status === 'pending').length,
        scheduledAppointments: appointments.filter((a: any) => a.status === 'scheduled').length,
        completedAppointments: appointments.filter((a: any) => a.status === 'completed').length,
      },
      comparison: {
        calls: {
          current: calls.length,
          previous: prevCalls.length,
          change: calls.length - prevCalls.length,
          changePercent: prevCalls.length > 0
            ? Math.round(((calls.length - prevCalls.length) / prevCalls.length) * 100)
            : 0,
        },
        complaints: {
          current: monthComplaints.length,
          previous: prevMonthComplaints.length,
          change: monthComplaints.length - prevMonthComplaints.length,
          changePercent: prevMonthComplaints.length > 0
            ? Math.round(((monthComplaints.length - prevMonthComplaints.length) / prevMonthComplaints.length) * 100)
            : 0,
        },
        appointments: {
          current: appointments.length,
          previous: prevAppointments.length,
          change: appointments.length - prevAppointments.length,
          changePercent: prevAppointments.length > 0
            ? Math.round(((appointments.length - prevAppointments.length) / prevAppointments.length) * 100)
            : 0,
        },
      },
      weeklyBreakdown,
    };

    return NextResponse.json(report);
  } catch (error: unknown) {
    return handleApiError(error, 'Reports Monthly');
  }
}
