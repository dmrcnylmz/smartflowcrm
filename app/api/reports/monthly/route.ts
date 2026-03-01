import { NextRequest, NextResponse } from 'next/server';
import { 
  getCallLogs, 
  getComplaints, 
  getInfoRequests, 
  getAppointments 
} from '@/lib/firebase/db';
import { toDate } from '@/lib/utils/date-helpers';
import { startOfMonth, endOfMonth, subMonths, format, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const monthStr = searchParams.get('month') || new Date().toISOString().split('T')[0];
    const targetDate = new Date(monthStr);
    
    // Get start and end of the month
    const monthStart = startOfMonth(targetDate);
    const monthEnd = endOfMonth(targetDate);
    monthStart.setHours(0, 0, 0, 0);
    monthEnd.setHours(23, 59, 59, 999);

    // Get previous month for comparison
    const prevMonthStart = subMonths(monthStart, 1);
    const prevMonthEnd = subMonths(monthEnd, 1);

    // Fetch data for current month
    const [calls, complaints, infoRequests, appointments] = await Promise.all([
      getCallLogs({ dateFrom: monthStart, dateTo: monthEnd }),
      getComplaints(),
      getInfoRequests(),
      getAppointments({ dateFrom: monthStart, dateTo: monthEnd }),
    ]);

    // Fetch previous month data for comparison
    const [prevCalls, prevComplaints, prevInfoRequests, prevAppointments] = await Promise.all([
      getCallLogs({ dateFrom: prevMonthStart, dateTo: prevMonthEnd }),
      getComplaints(),
      getInfoRequests(),
      getAppointments({ dateFrom: prevMonthStart, dateTo: prevMonthEnd }),
    ]);

    // Filter complaints and info requests by month
    const monthComplaints = complaints.filter(c => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= monthStart && createdAt <= monthEnd;
    });
    const monthInfoRequests = infoRequests.filter(i => {
      const createdAt = toDate(i.createdAt);
      return createdAt != null && createdAt >= monthStart && createdAt <= monthEnd;
    });

    const prevMonthComplaints = complaints.filter(c => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= prevMonthStart && createdAt <= prevMonthEnd;
    });
    const prevMonthInfoRequests = infoRequests.filter(i => {
      const createdAt = toDate(i.createdAt);
      return createdAt != null && createdAt >= prevMonthStart && createdAt <= prevMonthEnd;
    });

    // Calculate weekly breakdown
    const weeks = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 1, locale: tr }
    );

    const weeklyBreakdown = weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1, locale: tr });
      const weekEndDate = weekEnd > monthEnd ? monthEnd : weekEnd;

      const weekCalls = calls.filter(c => {
        const callDate = toDate(c.timestamp || c.createdAt);
        return callDate != null && callDate >= weekStart && callDate <= weekEndDate;
      });

      return {
        week: format(weekStart, 'd MMM', { locale: tr }),
        weekStart: weekStart.toISOString(),
        calls: weekCalls.length,
        answered: weekCalls.filter(c => c.status === 'answered').length,
        missed: weekCalls.filter(c => c.status === 'missed').length,
      };
    });

    // Calculate averages
    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum, c) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
      : 0;

    const report = {
      month: format(monthStart, 'yyyy-MM'),
      monthLabel: format(monthStart, 'MMMM yyyy', { locale: tr }),
      summary: {
        totalCalls: calls.length,
        missedCalls: calls.filter(c => c.status === 'missed').length,
        answeredCalls: calls.filter(c => c.status === 'answered').length,
        avgCallDuration: Math.round(avgCallDuration),
        openComplaints: monthComplaints.filter(c => c.status === 'open').length,
        totalComplaints: monthComplaints.length,
        resolvedComplaints: monthComplaints.filter(c => c.status === 'resolved').length,
        openInfoRequests: monthInfoRequests.filter(i => i.status === 'pending').length,
        scheduledAppointments: appointments.filter(a => a.status === 'scheduled').length,
        completedAppointments: appointments.filter(a => a.status === 'completed').length,
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
    console.error('Monthly report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

