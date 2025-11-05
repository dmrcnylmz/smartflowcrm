'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, AlertCircle, Calendar } from 'lucide-react';
import { getCallLogs } from '@/lib/firebase/db';
import { getComplaints } from '@/lib/firebase/db';
import { getAppointments } from '@/lib/firebase/db';
import { useActivityLogs } from '@/lib/firebase/hooks';
import type { CallLog, Complaint, Appointment } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    todayCalls: 0,
    missedCalls: 0,
    openComplaints: 0,
    upcomingAppointments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time activity logs
  const { data: activity, loading: activityLoading, error: activityError } = useActivityLogs(10);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setError(null);
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const errors: string[] = [];
      
      // Load calls with error handling
      let calls: CallLog[] = [];
      try {
        calls = await getCallLogs({ 
          dateFrom: today,
          limitCount: 100 
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Çağrı verileri yüklenemedi';
        errors.push(errorMsg);
        console.warn('Calls load error:', err);
      }
      const missedCalls = calls.filter(c => c.status === 'missed');
      
      // Load complaints with error handling
      let complaints: Complaint[] = [];
      try {
        complaints = await getComplaints({ status: 'open' });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Şikayet verileri yüklenemedi';
        errors.push(errorMsg);
        console.warn('Complaints load error:', err);
      }
      
      // Load appointments with error handling
      let appointments: Appointment[] = [];
      try {
        appointments = await getAppointments({ 
          status: 'scheduled',
          dateFrom: today,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Randevu verileri yüklenemedi';
        errors.push(errorMsg);
        console.warn('Appointments load error:', err);
      }
      const upcoming = appointments.filter(apt => 
        apt.dateTime && apt.dateTime.toDate() >= today
      );
      
      setStats({
        todayCalls: calls.length,
        missedCalls: missedCalls.length,
        openComplaints: complaints.length,
        upcomingAppointments: upcoming.length,
      });
      
      // Show error if all queries failed, or show warning if some failed
      if (errors.length > 0) {
        if (errors.length === 3) {
          // All queries failed (activity logs now real-time)
          setError('Tüm veriler yüklenemedi. Firebase bağlantınızı kontrol edin.');
        } else {
          // Partial failure - log but don't block UI
          console.warn('Some data failed to load:', errors);
        }
      }
    } catch (error: unknown) {
      console.error('Dashboard load error:', error);
      let errorMessage = 'Veri yüklenirken bir hata oluştu. Firebase bağlantınızı kontrol edin.';
      if (error instanceof Error) {
        if ('code' in error && error.code === 'permission-denied') {
          errorMessage = 'Firebase izin hatası. Security rules kontrol edin.';
        } else {
          errorMessage = error.message || errorMessage;
        }
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  const kpiCards = [
    {
      title: 'Bugünkü Çağrılar',
      value: stats.todayCalls,
      icon: Phone,
      color: 'text-blue-600',
    },
    {
      title: 'Kaçırılan Çağrılar',
      value: stats.missedCalls,
      icon: AlertCircle,
      color: 'text-red-600',
    },
    {
      title: 'Açık Şikayetler',
      value: stats.openComplaints,
      icon: AlertCircle,
      color: 'text-orange-600',
    },
    {
      title: 'Yaklaşan Randevular',
      value: stats.upcomingAppointments,
      icon: Calendar,
      color: 'text-green-600',
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Genel bakış ve istatistikler</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {loading ? (
          // Skeleton loading for KPI cards
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Error Message */}
      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <AlertCircle className="h-5 w-5 inline-block mr-2" />
              <p>{error}</p>
              <p className="text-sm mt-2 text-muted-foreground">
                Firebase bağlantınızı kontrol edin (.env.local dosyası)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Son Aktiviteler</CardTitle>
        </CardHeader>
        <CardContent>
          {(loading || activityLoading) ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded" />
                </div>
              ))}
            </div>
          ) : activityError ? (
            <div className="text-center py-4 text-destructive text-sm">
              Aktivite logları yüklenemedi
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              Henüz aktivite yok
            </div>
          ) : (
            <div className="space-y-4">
              {activity.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">{log.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(log.createdAt.toDate(), 'PPpp', { locale: tr })}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-muted rounded">
                    {log.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

