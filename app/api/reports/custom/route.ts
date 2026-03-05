import { NextRequest, NextResponse } from 'next/server';
import {
  getCallLogs,
  getComplaints,
  getInfoRequests,
  getAppointments,
  getTenantFromRequest,
} from '@/lib/firebase/admin-db';
import { toDate } from '@/lib/utils/date-helpers';
import { format, differenceInDays, eachDayOfInterval } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { handleApiError } from '@/lib/utils/error-handler';
import type { CallLog, Complaint, InfoRequest, Appointment } from '@/lib/firebase/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantFromRequest(request);
    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context required' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const dateFromStr = searchParams.get('dateFrom');
    const dateToStr = searchParams.get('dateTo');
    const compareFromStr = searchParams.get('compareFrom');
    const compareToStr = searchParams.get('compareTo');

    if (!dateFromStr || !dateToStr) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo parameters are required' },
        { status: 400 },
      );
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);
    dateFrom.setHours(0, 0, 0, 0);
    dateTo.setHours(23, 59, 59, 999);

    const [calls, complaints, infoRequests, appointments] = await Promise.all([
      getCallLogs(tenantId, { dateFrom, dateTo }) as Promise<CallLog[]>,
      getComplaints(tenantId) as Promise<Complaint[]>,
      getInfoRequests(tenantId) as Promise<InfoRequest[]>,
      getAppointments(tenantId, { dateFrom, dateTo }) as Promise<Appointment[]>,
    ]);

    const rangeComplaints = complaints.filter((c) => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= dateFrom && createdAt <= dateTo;
    });
    const rangeInfoRequests = infoRequests.filter((i) => {
      const createdAt = toDate(i.createdAt);
      return createdAt != null && createdAt >= dateFrom && createdAt <= dateTo;
    });

    let comparison = null;
    if (compareFromStr && compareToStr) {
      const compareFrom = new Date(compareFromStr);
      const compareTo = new Date(compareToStr);
      compareFrom.setHours(0, 0, 0, 0);
      compareTo.setHours(23, 59, 59, 999);

      const [compareCalls, compareComplaints, , compareAppointments] = await Promise.all([
        getCallLogs(tenantId, { dateFrom: compareFrom, dateTo: compareTo }) as Promise<CallLog[]>,
        getComplaints(tenantId) as Promise<Complaint[]>,
        getInfoRequests(tenantId) as Promise<InfoRequest[]>,
        getAppointments(tenantId, { dateFrom: compareFrom, dateTo: compareTo }) as Promise<Appointment[]>,
      ]);

      const compareRangeComplaints = compareComplaints.filter((c) => {
        const createdAt = toDate(c.createdAt);
        return createdAt != null && createdAt >= compareFrom && createdAt <= compareTo;
      });

      comparison = {
        calls: {
          current: calls.length,
          previous: compareCalls.length,
          change: calls.length - compareCalls.length,
          changePercent: compareCalls.length > 0
            ? Math.round(((calls.length - compareCalls.length) / compareCalls.length) * 100)
            : 0,
        },
        complaints: {
          current: rangeComplaints.length,
          previous: compareRangeComplaints.length,
          change: rangeComplaints.length - compareRangeComplaints.length,
          changePercent: compareRangeComplaints.length > 0
            ? Math.round(((rangeComplaints.length - compareRangeComplaints.length) / compareRangeComplaints.length) * 100)
            : 0,
        },
        appointments: {
          current: appointments.length,
          previous: compareAppointments.length,
          change: appointments.length - compareAppointments.length,
          changePercent: compareAppointments.length > 0
            ? Math.round(((appointments.length - compareAppointments.length) / compareAppointments.length) * 100)
            : 0,
        },
      };
    }

    const days = differenceInDays(dateTo, dateFrom);
    const breakdownType = days <= 7 ? 'daily' : days <= 31 ? 'weekly' : 'monthly';

    let dailyBreakdown: Array<{ date: string; dateObj: string; calls: number; answered: number; missed: number }> = [];
    if (breakdownType === 'daily') {
      const dayList = eachDayOfInterval({ start: dateFrom, end: dateTo });
      dailyBreakdown = dayList.map((day) => {
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);

        const dayCalls = calls.filter((c) => {
          const callDate = toDate(c.timestamp || c.createdAt);
          return callDate != null && callDate >= dayStart && callDate <= dayEnd;
        });

        return {
          date: format(day, 'dd MMM', { locale: tr }),
          dateObj: day.toISOString(),
          calls: dayCalls.length,
          answered: dayCalls.filter((c) => c.status === 'answered').length,
          missed: dayCalls.filter((c) => c.status === 'missed').length,
        };
      });
    }

    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum, c) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
      : 0;

    const report = {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      dateRangeLabel: `${format(dateFrom, 'd MMM', { locale: tr })} - ${format(dateTo, 'd MMM yyyy', { locale: tr })}`,
      summary: {
        totalCalls: calls.length,
        missedCalls: calls.filter((c) => c.status === 'missed').length,
        answeredCalls: calls.filter((c) => c.status === 'answered').length,
        avgCallDuration: Math.round(avgCallDuration),
        openComplaints: rangeComplaints.filter((c) => c.status === 'open').length,
        totalComplaints: rangeComplaints.length,
        resolvedComplaints: rangeComplaints.filter((c) => c.status === 'resolved').length,
        openInfoRequests: rangeInfoRequests.filter((i) => i.status === 'pending').length,
        scheduledAppointments: appointments.filter((a) => a.status === 'scheduled').length,
        completedAppointments: appointments.filter((a) => a.status === 'completed').length,
      },
      comparison,
      breakdownType,
      dailyBreakdown,
    };

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Reports Custom');
  }
}
