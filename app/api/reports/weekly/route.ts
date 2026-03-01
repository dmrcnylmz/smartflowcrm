import { NextRequest, NextResponse } from 'next/server';
import { 
  getCallLogs, 
  getComplaints, 
  getInfoRequests, 
  getAppointments 
} from '@/lib/firebase/db';
import { toDate } from '@/lib/utils/date-helpers';
import { startOfWeek, endOfWeek, subWeeks, format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const weekStr = searchParams.get('week') || new Date().toISOString().split('T')[0];
    const targetDate = new Date(weekStr);
    
    // Get start and end of the week (Monday to Sunday)
    const weekStart = startOfWeek(targetDate, { weekStartsOn: 1, locale: tr });
    const weekEnd = endOfWeek(targetDate, { weekStartsOn: 1, locale: tr });
    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(23, 59, 59, 999);

    // Get previous week for comparison
    const prevWeekStart = subWeeks(weekStart, 1);
    const prevWeekEnd = subWeeks(weekEnd, 1);

    // Fetch data for current week
    const [calls, complaints, infoRequests, appointments] = await Promise.all([
      getCallLogs({ dateFrom: weekStart, dateTo: weekEnd }),
      getComplaints(),
      getInfoRequests(),
      getAppointments({ dateFrom: weekStart, dateTo: weekEnd }),
    ]);

    // Fetch previous week data for comparison
    const [prevCalls, prevComplaints, prevInfoRequests, prevAppointments] = await Promise.all([
      getCallLogs({ dateFrom: prevWeekStart, dateTo: prevWeekEnd }),
      getComplaints(),
      getInfoRequests(),
      getAppointments({ dateFrom: prevWeekStart, dateTo: prevWeekEnd }),
    ]);

    // Filter complaints and info requests by week
    const weekComplaints = complaints.filter(c => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= weekStart && createdAt <= weekEnd;
    });
    const weekInfoRequests = infoRequests.filter(i => {
      const createdAt = toDate(i.createdAt);
      return createdAt != null && createdAt >= weekStart && createdAt <= weekEnd;
    });

    const prevWeekComplaints = complaints.filter(c => {
      const createdAt = toDate(c.createdAt);
      return createdAt != null && createdAt >= prevWeekStart && createdAt <= prevWeekEnd;
    });
    const prevWeekInfoRequests = infoRequests.filter(i => {
      const createdAt = toDate(i.createdAt);
      return createdAt != null && createdAt >= prevWeekStart && createdAt <= prevWeekEnd;
    });

    // Calculate daily breakdown
    const dailyBreakdown = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const dayCalls = calls.filter(c => {
        const callDate = toDate(c.timestamp || c.createdAt);
        return callDate != null && callDate >= dayStart && callDate <= dayEnd;
      });

      return {
        date: format(day, 'dd MMM EEEE', { locale: tr }),
        dateObj: day.toISOString(),
        calls: dayCalls.length,
        answered: dayCalls.filter(c => c.status === 'answered').length,
        missed: dayCalls.filter(c => c.status === 'missed').length,
      };
    });

    // Calculate averages
    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum, c) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
      : 0;

    const report = {
      week: format(weekStart, 'yyyy-MM-dd'),
      weekLabel: `${format(weekStart, 'd MMM', { locale: tr })} - ${format(weekEnd, 'd MMM yyyy', { locale: tr })}`,
      summary: {
        totalCalls: calls.length,
        missedCalls: calls.filter(c => c.status === 'missed').length,
        answeredCalls: calls.filter(c => c.status === 'answered').length,
        avgCallDuration: Math.round(avgCallDuration),
        openComplaints: weekComplaints.filter(c => c.status === 'open').length,
        totalComplaints: weekComplaints.length,
        resolvedComplaints: weekComplaints.filter(c => c.status === 'resolved').length,
        openInfoRequests: weekInfoRequests.filter(i => i.status === 'pending').length,
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
          current: weekComplaints.length,
          previous: prevWeekComplaints.length,
          change: weekComplaints.length - prevWeekComplaints.length,
          changePercent: prevWeekComplaints.length > 0
            ? Math.round(((weekComplaints.length - prevWeekComplaints.length) / prevWeekComplaints.length) * 100)
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
      dailyBreakdown,
    };

    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error('Weekly report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

