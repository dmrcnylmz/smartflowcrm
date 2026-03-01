import { NextRequest, NextResponse } from 'next/server';
import {
  getCallLogs,
  getComplaints,
  getInfoRequests,
  getAppointments
} from '@/lib/firebase/db';
import { toDate } from '@/lib/utils/date-helpers';
import { demoCallLogs, demoComplaints, demoInfoRequests, demoAppointments } from '@/lib/firebase/demo-data';

export const dynamic = 'force-dynamic';

// Demo mode detection
let useDemoMode = false;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const targetDate = new Date(dateStr);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    let calls, complaints, infoRequests, appointments;

    // Try Firebase first, fallback to demo data on permission error
    if (!useDemoMode) {
      try {
        [calls, complaints, infoRequests, appointments] = await Promise.all([
          getCallLogs({ dateFrom: startOfDay, dateTo: endOfDay }),
          getComplaints(),
          getInfoRequests(),
          getAppointments({ dateFrom: startOfDay, dateTo: endOfDay }),
        ]);
      } catch (error: unknown) {
        const err = error as { message?: string; code?: string };
        if (err?.message?.includes('permission') || err?.code === 'permission-denied') {
          // Switching to demo mode due to permission error
          useDemoMode = true;
        } else {
          throw error;
        }
      }
    }

    // Use demo data if in demo mode or if any data is missing
    if (useDemoMode || !calls || !complaints || !infoRequests || !appointments) {
      calls = calls ?? demoCallLogs;
      complaints = complaints ?? demoComplaints;
      infoRequests = infoRequests ?? demoInfoRequests;
      appointments = appointments ?? demoAppointments;
    }

    const openComplaints = complaints.filter(c => c.status === 'open');
    const missedCalls = calls.filter(c => c.status === 'missed');
    const scheduledAppointments = appointments.filter(a => a.status === 'scheduled');

    // Calculate averages
    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum, c) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
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
        resolvedComplaints: complaints.filter(c => c.status === 'resolved').length,
        openInfoRequests: infoRequests.filter(i => i.status === 'pending').length,
        scheduledAppointments: scheduledAppointments.length,
        completedAppointments: appointments.filter(a => a.status === 'completed').length,
      },
      calls: calls.map(c => ({
        id: c.id,
        timestamp: toDate(c.timestamp ?? c.createdAt)?.toISOString() ?? '',
        intent: c.intent,
        status: c.status,
        duration: c.durationSec ?? c.duration ?? 0,
      })),
      complaints: openComplaints.map(c => ({
        id: c.id,
        category: c.category,
        status: c.status,
        createdAt: toDate(c.createdAt)?.toISOString() ?? '',
      })),
      appointments: scheduledAppointments.map(a => ({
        id: a.id,
        dateTime: toDate(a.dateTime)?.toISOString() ?? '',
        status: a.status,
      })),
    };

    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error('Daily report error:', error);

    // On any error, try returning demo data
    try {
      const dateStr = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
      const demoReport = {
        date: dateStr,
        demoMode: true,
        summary: {
          totalCalls: demoCallLogs.length,
          missedCalls: demoCallLogs.filter(c => c.status === 'missed').length,
          answeredCalls: demoCallLogs.filter(c => c.status === 'answered').length,
          avgCallDuration: 150,
          openComplaints: demoComplaints.filter(c => c.status === 'open').length,
          totalComplaints: demoComplaints.length,
          resolvedComplaints: demoComplaints.filter(c => c.status === 'resolved').length,
          openInfoRequests: demoInfoRequests.filter(i => i.status === 'pending').length,
          scheduledAppointments: demoAppointments.filter(a => a.status === 'scheduled').length,
          completedAppointments: demoAppointments.filter(a => a.status === 'completed').length,
        },
        calls: [],
        complaints: [],
        appointments: [],
      };
      return NextResponse.json(demoReport);
    } catch (fallbackError) {
      const errorMessage = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  }
}
