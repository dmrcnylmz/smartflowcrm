import { NextRequest, NextResponse } from 'next/server';
import { 
  getCallLogs, 
  getComplaints, 
  getInfoRequests, 
  getAppointments 
} from '@/lib/firebase/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateStr = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const targetDate = new Date(dateStr);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Fetch data for the day
    const [calls, complaints, infoRequests, appointments] = await Promise.all([
      getCallLogs({ dateFrom: startOfDay, dateTo: endOfDay }),
      getComplaints(),
      getInfoRequests(),
      getAppointments({ dateFrom: startOfDay, dateTo: endOfDay }),
    ]);

    const openComplaints = complaints.filter(c => c.status === 'open');
    const missedCalls = calls.filter(c => c.status === 'missed');
    const scheduledAppointments = appointments.filter(a => a.status === 'scheduled');

    // Calculate averages
    const avgCallDuration = calls.length > 0
      ? calls.reduce((sum, c) => sum + (c.durationSec ?? c.duration ?? 0), 0) / calls.length
      : 0;

    const report = {
      date: dateStr,
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
        timestamp: (c.timestamp ?? c.createdAt).toDate().toISOString(),
        intent: c.intent,
        status: c.status,
        duration: c.durationSec ?? c.duration ?? 0,
      })),
      complaints: openComplaints.map(c => ({
        id: c.id,
        category: c.category,
        status: c.status,
        createdAt: c.createdAt.toDate().toISOString(),
      })),
      appointments: scheduledAppointments.map(a => ({
        id: a.id,
        dateTime: a.dateTime.toDate().toISOString(),
        status: a.status,
      })),
    };

    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error('Daily report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

