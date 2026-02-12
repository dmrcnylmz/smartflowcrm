'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, AlertCircle, Calendar } from 'lucide-react';
import { getCallLogs } from '@/lib/firebase/db';
import { getComplaints } from '@/lib/firebase/db';
import { getAppointments } from '@/lib/firebase/db';
import { useActivityLogs } from '@/lib/firebase/hooks';
import type { CallLog, Complaint, Appointment } from '@/lib/firebase/types';
import { format, subDays } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Timestamp } from 'firebase/firestore';

// Demo mode - activates when Firebase permissions fail
let DEMO_MODE = false;

// Demo data for development
const generateDemoData = () => {
  const now = new Date();
  const demoCalls: CallLog[] = Array.from({ length: 25 }, (_, i) => ({
    id: `demo-call-${i}`,
    customerName: `Demo Müşteri ${i + 1}`,
    customerPhone: `+90532${Math.floor(1000000 + Math.random() * 9000000)}`,
    status: ['answered', 'missed', 'answered', 'answered'][i % 4] as 'answered' | 'missed',
    duration: Math.floor(Math.random() * 600),
    notes: 'Demo çağrı kaydı',
    createdAt: Timestamp.fromDate(subDays(now, Math.floor(i / 4))),
    timestamp: Timestamp.fromDate(subDays(now, Math.floor(i / 4))),
  }));

  const demoComplaints: Complaint[] = [
    { id: 'demo-c1', customerId: 'c1', customerName: 'Ali Yılmaz', category: 'Ürün Kalitesi', status: 'open', description: 'Demo şikayet', createdAt: Timestamp.fromDate(now), priority: 'high' },
    { id: 'demo-c2', customerId: 'c2', customerName: 'Ayşe Demir', category: 'Teslimat', status: 'open', description: 'Demo şikayet', createdAt: Timestamp.fromDate(now), priority: 'medium' },
    { id: 'demo-c3', customerId: 'c3', customerName: 'Mehmet Kaya', category: 'Müşteri Hizmetleri', status: 'resolved', description: 'Demo şikayet', createdAt: Timestamp.fromDate(subDays(now, 1)), priority: 'low' },
    { id: 'demo-c4', customerId: 'c4', customerName: 'Fatma Öz', category: 'Ürün Kalitesi', status: 'open', description: 'Demo şikayet', createdAt: Timestamp.fromDate(subDays(now, 2)), priority: 'high' },
    { id: 'demo-c5', customerId: 'c5', customerName: 'Can Ak', category: 'Fatura', status: 'investigating', description: 'Demo şikayet', createdAt: Timestamp.fromDate(subDays(now, 3)), priority: 'medium' },
  ];

  const demoAppointments: Appointment[] = [
    { id: 'demo-a1', customerId: 'c1', customerName: 'Demo Müşteri 1', dateTime: Timestamp.fromDate(new Date(now.getTime() + 3600000)), status: 'scheduled', notes: 'Demo randevu', createdAt: Timestamp.fromDate(now) },
    { id: 'demo-a2', customerId: 'c2', customerName: 'Demo Müşteri 2', dateTime: Timestamp.fromDate(new Date(now.getTime() + 7200000)), status: 'scheduled', notes: 'Demo randevu', createdAt: Timestamp.fromDate(now) },
    { id: 'demo-a3', customerId: 'c3', customerName: 'Demo Müşteri 3', dateTime: Timestamp.fromDate(subDays(now, 1)), status: 'completed', notes: 'Demo randevu', createdAt: Timestamp.fromDate(subDays(now, 2)) },
    { id: 'demo-a4', customerId: 'c4', customerName: 'Demo Müşteri 4', dateTime: Timestamp.fromDate(subDays(now, 2)), status: 'cancelled', notes: 'Demo randevu', createdAt: Timestamp.fromDate(subDays(now, 3)) },
  ];

  return { demoCalls, demoComplaints, demoAppointments };
};

export default function DashboardPage() {
  const [stats, setStats] = useState({
    todayCalls: 0,
    missedCalls: 0,
    openComplaints: 0,
    upcomingAppointments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<{
    calls: CallLog[];
    complaints: Complaint[];
    appointments: Appointment[];
  }>({
    calls: [],
    complaints: [],
    appointments: [],
  });

  // Real-time activity logs
  const { data: activity, loading: activityLoading, error: activityError } = useActivityLogs(10);

  // Prepare chart data with useMemo
  const callTrendData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), 6 - i);
      date.setHours(0, 0, 0, 0);
      return {
        date: format(date, 'dd MMM', { locale: tr }),
        dateObj: date,
        çağrılar: 0,
        yanıtlanan: 0,
        kaçırılan: 0,
      };
    });

    chartData.calls.forEach(call => {
      const callDate = toDate(call.timestamp || call.createdAt);
      const dayIndex = days.findIndex(d => {
        const dDate = new Date(d.dateObj);
        dDate.setHours(0, 0, 0, 0);
        const cDate = new Date(callDate);
        cDate.setHours(0, 0, 0, 0);
        return dDate.getTime() === cDate.getTime();
      });

      if (dayIndex >= 0) {
        days[dayIndex].çağrılar++;
        if (call.status === 'answered') {
          days[dayIndex].yanıtlanan++;
        } else if (call.status === 'missed') {
          days[dayIndex].kaçırılan++;
        }
      }
    });

    return days;
  }, [chartData.calls]);

  const complaintCategoryData = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    chartData.complaints.forEach(complaint => {
      const category = complaint.category || 'Kategori Yok';
      categoryMap[category] = (categoryMap[category] || 0) + 1;
    });

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    return Object.entries(categoryMap).map(([name, value], index) => ({
      name,
      value,
      color: COLORS[index % COLORS.length],
    }));
  }, [chartData.complaints]);

  const complaintCategoryColors = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    chartData.complaints.forEach(complaint => {
      const category = complaint.category || 'Kategori Yok';
      categoryMap[category] = (categoryMap[category] || 0) + 1;
    });
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    return Object.entries(categoryMap).map((_, index) => (
      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
    ));
  }, [chartData.complaints]);

  const appointmentStatusData = useMemo(() => {
    const statusMap: Record<string, number> = {
      'Planlandı': 0,
      'Tamamlandı': 0,
      'İptal': 0,
    };

    chartData.appointments.forEach(apt => {
      if (apt.status === 'scheduled') statusMap['Planlandı']++;
      else if (apt.status === 'completed') statusMap['Tamamlandı']++;
      else if (apt.status === 'cancelled') statusMap['İptal']++;
    });

    return Object.entries(statusMap).map(([name, value]) => ({
      name,
      value,
    }));
  }, [chartData.appointments]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setError(null);
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = subDays(today, 7);

      const errors: string[] = [];
      let permissionErrors = 0;

      // Load calls for last 7 days (for charts)
      let allCalls: CallLog[] = [];
      try {
        allCalls = await getCallLogs({
          dateFrom: sevenDaysAgo,
          limitCount: 500
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Çağrı verileri yüklenemedi';
        errors.push(errorMsg);
        if (errorMsg.includes('permission') || errorMsg.includes('Permission')) permissionErrors++;
        console.warn('Calls load error:', err);
      }

      // Load all complaints (for pie chart)
      let allComplaints: Complaint[] = [];
      try {
        allComplaints = await getComplaints();
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Şikayet verileri yüklenemedi';
        errors.push(errorMsg);
        if (errorMsg.includes('permission') || errorMsg.includes('Permission')) permissionErrors++;
        console.warn('Complaints load error:', err);
      }

      // Load all appointments (for bar chart)
      let allAppointments: Appointment[] = [];
      try {
        allAppointments = await getAppointments({
          dateFrom: sevenDaysAgo,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Randevu verileri yüklenemedi';
        errors.push(errorMsg);
        if (errorMsg.includes('permission') || errorMsg.includes('Permission')) permissionErrors++;
        console.warn('Appointments load error:', err);
      }

      // If all queries failed with permission errors, switch to demo mode
      if (permissionErrors >= 3 && !DEMO_MODE) {
        console.log('🎭 Demo Mode activated - Firebase permissions unavailable');
        DEMO_MODE = true;
        const { demoCalls, demoComplaints, demoAppointments } = generateDemoData();
        allCalls = demoCalls;
        allComplaints = demoComplaints;
        allAppointments = demoAppointments;
      }

      // Today's calls for stats
      const todayCalls = allCalls.filter(c => {
        const callDate = toDate(c.timestamp || c.createdAt);
        return callDate >= today;
      });
      const missedCalls = allCalls.filter(c => c.status === 'missed');
      const openComplaints = allComplaints.filter(c => c.status === 'open');
      const upcoming = allAppointments.filter(apt =>
        apt.dateTime && toDate(apt.dateTime) >= today && apt.status === 'scheduled'
      );

      setStats({
        todayCalls: todayCalls.length,
        missedCalls: missedCalls.length,
        openComplaints: openComplaints.length,
        upcomingAppointments: upcoming.length,
      });

      // Store data for charts
      setChartData({
        calls: allCalls,
        complaints: allComplaints,
        appointments: allAppointments,
      });

      // Show demo mode notice instead of error
      if (DEMO_MODE) {
        setError('🎭 Demo Modu - Firebase bağlantısı yok, demo veriler gösteriliyor');
      } else if (errors.length > 0 && errors.length < 3) {
        // Partial failure - log but don't block UI
        console.warn('Some data failed to load:', errors);
      }
    } catch (error: unknown) {
      console.error('Dashboard load error:', error);
      // Fallback to demo mode on any critical error
      if (!DEMO_MODE) {
        DEMO_MODE = true;
        const { demoCalls, demoComplaints, demoAppointments } = generateDemoData();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayCalls = demoCalls.filter(c => toDate(c.timestamp || c.createdAt) >= today);
        const missedCalls = demoCalls.filter(c => c.status === 'missed');
        const openComplaints = demoComplaints.filter(c => c.status === 'open');
        const upcoming = demoAppointments.filter(apt =>
          apt.dateTime && toDate(apt.dateTime) >= today && apt.status === 'scheduled'
        );

        setStats({
          todayCalls: todayCalls.length,
          missedCalls: missedCalls.length,
          openComplaints: openComplaints.length,
          upcomingAppointments: upcoming.length,
        });

        setChartData({
          calls: demoCalls,
          complaints: demoComplaints,
          appointments: demoAppointments,
        });

        setError('🎭 Demo Modu - Firebase bağlantısı yok, demo veriler gösteriliyor');
      }
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Son 7 Gün Çağrı Trendi */}
        <Card>
          <CardHeader>
            <CardTitle>Son 7 Gün Çağrı Trendi</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={callTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="çağrılar" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="yanıtlanan" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="kaçırılan" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Şikayet Kategorileri */}
        <Card>
          <CardHeader>
            <CardTitle>Şikayet Kategorileri</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={complaintCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {complaintCategoryColors}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Randevu Durumu */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Randevu Durumu</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={appointmentStatusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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
                      {format(toDate(log.createdAt), 'PPpp', { locale: tr })}
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

