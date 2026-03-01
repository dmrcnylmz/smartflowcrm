'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, AlertCircle, Calendar, PhoneIncoming, MessageSquareWarning, ArrowUpRight, TrendingUp, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { VoiceAIStatus } from '@/components/voice/VoiceAIStatus';
import { getCallLogs, getComplaints, getAppointments } from '@/lib/firebase/db';
import { useActivityLogs } from '@/lib/firebase/hooks';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { CallLog, Complaint, Appointment } from '@/lib/firebase/types';
import { format, subDays } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Timestamp } from 'firebase/firestore';

// Demo mode flag is tracked per-component instance via useRef
// to avoid shared mutable state across hot reloads and SSR.

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

// Auto-refresh intervals
const REFRESH_INTERVALS = [
  { label: 'Kapalı', value: 0 },
  { label: '30 sn', value: 30000 },
  { label: '1 dk', value: 60000 },
  { label: '5 dk', value: 300000 },
];

export default function DashboardPage() {
  const authFetch = useAuthFetch();
  const [stats, setStats] = useState({
    todayCalls: 0,
    missedCalls: 0,
    openComplaints: 0,
    upcomingAppointments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(60000); // 1 minute default
  const [isLive, setIsLive] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoModeRef = useRef(false);
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

  // Try server-side dashboard API first, fallback to client-side
  const loadFromServerAPI = useCallback(async (): Promise<boolean> => {
    try {
      const res = await authFetch('/api/dashboard');
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.kpis) return false;

      setStats({
        todayCalls: data.kpis.todayCalls || 0,
        missedCalls: data.kpis.missedCalls || 0,
        openComplaints: data.kpis.openComplaints || 0,
        upcomingAppointments: data.kpis.upcomingAppointments || 0,
      });

      // Convert server data to chart format if available
      if (data.callTrend && Array.isArray(data.callTrend)) {
        // Server trend data is already summarized
      }

      setLastUpdated(new Date());
      setIsLive(true);
      return true;
    } catch {
      return false;
    }
  }, [authFetch]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const serverOk = await loadFromServerAPI();
    if (!serverOk) {
      await loadDashboardData();
    }
    setRefreshing(false);
  }, [loadFromServerAPI]);

  // Auto-refresh timer
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (refreshInterval > 0) {
      refreshTimerRef.current = setInterval(() => {
        handleRefresh();
      }, refreshInterval);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [refreshInterval, handleRefresh]);

  useEffect(() => {
    loadDashboardData();
    // Also try server API for stats
    loadFromServerAPI();
  }, [loadFromServerAPI]);

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
      if (permissionErrors >= 3 && !demoModeRef.current) {
        console.log('🎭 Demo Mode activated - Firebase permissions unavailable');
        demoModeRef.current = true;
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

      setChartData({
        calls: allCalls,
        complaints: allComplaints,
        appointments: allAppointments,
      });

      // Show demo mode notice instead of error
      if (demoModeRef.current) {
        setError('🎭 Demo Modu - Firebase bağlantısı yok, demo veriler gösteriliyor');
      } else if (errors.length > 0 && errors.length < 3) {
        // Partial failure - log but don't block UI
        console.warn('Some data failed to load:', errors);
      }
    } catch (error: unknown) {
      console.error('Dashboard load error:', error);
      // Fallback to demo mode on any critical error
      if (!demoModeRef.current) {
        demoModeRef.current = true;
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
      setLastUpdated(new Date());
    }
  }

  const kpiCards = [
    {
      title: 'Bugünkü Çağrılar',
      value: stats.todayCalls,
      icon: PhoneIncoming,
      gradient: 'from-blue-500/20 to-blue-600/5',
      iconColor: 'text-blue-500 bg-blue-500/10',
      trend: demoModeRef.current ? null : null, // No fake trends -- compute from real data when available
      trendUp: true,
    },
    {
      title: 'Kaçırılan Çağrılar',
      value: stats.missedCalls,
      icon: Phone,
      gradient: 'from-rose-500/20 to-rose-600/5',
      iconColor: 'text-rose-500 bg-rose-500/10',
      trend: demoModeRef.current ? null : null,
      trendUp: true,
    },
    {
      title: 'Açık Şikayetler',
      value: stats.openComplaints,
      icon: MessageSquareWarning,
      gradient: 'from-amber-500/20 to-amber-600/5',
      iconColor: 'text-amber-500 bg-amber-500/10',
      trend: demoModeRef.current ? null : null,
      trendUp: false,
    },
    {
      title: 'Yaklaşan Randevular',
      value: stats.upcomingAppointments,
      icon: Calendar,
      gradient: 'from-emerald-500/20 to-emerald-600/5',
      iconColor: 'text-emerald-500 bg-emerald-500/10',
      trend: demoModeRef.current ? null : null,
      trendUp: true,
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <TrendingUp className="h-7 w-7 md:h-8 md:w-8 text-primary" />
            Genel Bakış
          </h1>
          <p className="text-muted-foreground mt-2 text-base md:text-lg">
            Sistemin anlık durumu ve özet istatistikler.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isLive ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            )}
            {lastUpdated && (
              <span>
                {format(lastUpdated, 'HH:mm:ss', { locale: tr })}
              </span>
            )}
          </div>

          {/* Auto-refresh selector */}
          <Select
            value={String(refreshInterval)}
            onValueChange={(value) => setRefreshInterval(Number(value))}
          >
            <SelectTrigger className="text-xs h-8 w-[120px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFRESH_INTERVALS.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.value === 0 ? 'Manuel' : `\u27F3 ${opt.label}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Manual refresh button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-background hover:bg-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>

          <VoiceAIStatus />
        </div>
      </div>

      {/* Error / Demo Mode Notification */}
      {error && (
        demoModeRef.current ? (
          /* Subtle bottom-right toast for demo mode */
          <div className="fixed bottom-6 right-6 z-50 animate-slide-up-panel">
            <div className="bg-background/95 text-muted-foreground border border-border/60 px-4 py-2.5 rounded-xl flex items-center gap-2.5 shadow-lg backdrop-blur-xl text-sm max-w-xs">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs font-medium">Demo Modu -- Ornek veriler gosteriliyor</p>
              <button
                onClick={() => setError(null)}
                className="ml-1 text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
                aria-label="Kapat"
              >
                <span className="text-xs font-bold">&times;</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard inline error for real errors */
          <div className="bg-orange-500/10 text-orange-600 border border-orange-500/20 p-4 rounded-2xl flex items-center justify-center gap-3 shadow-sm backdrop-blur-md">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">{error}</p>
            <button
              onClick={handleRefresh}
              className="ml-2 px-3 py-1 text-xs font-medium rounded-lg bg-orange-500/20 hover:bg-orange-500/30 transition-colors"
            >
              Tekrar Dene
            </button>
          </div>
        )
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[160px] rounded-3xl" />
          ))
        ) : (
          kpiCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${card.gradient} p-6 shadow-sm backdrop-blur-xl hover-lift animate-fade-in-up opacity-0`}
                style={{ animationDelay: `${idx * 120}ms`, animationFillMode: 'forwards' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-2xl ${card.iconColor}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  {card.trend ? (
                    <div className={`flex items-center gap-1 text-sm font-medium px-2.5 py-1 rounded-full ${card.trendUp ? 'text-emerald-600 bg-emerald-500/10' : 'text-rose-600 bg-rose-500/10'}`}>
                      {card.trendUp ? <TrendingUp className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      {card.trend}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/50 px-2.5 py-1">&mdash;</span>
                  )}
                </div>
                <div>
                  <h3 className="text-muted-foreground font-medium mb-1">{card.title}</h3>
                  <div className="text-4xl font-bold tracking-tight text-foreground">
                    {card.value}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Chart - Call Trends */}
        <div className="xl:col-span-2 animate-fade-in-up opacity-0" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
          <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl overflow-hidden h-full hover-lift">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Son 7 Gün Çağrı Trendi</CardTitle>
              <CardDescription>Gelen, yanıtlanan ve kaçırılan çağrıların günlük değişimi.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-[350px] w-full rounded-xl" />
              ) : (
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={callTrendData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#888' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888' }} dx={-10} />
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      <Line type="monotone" dataKey="çağrılar" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="yanıtlanan" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="kaçırılan" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Complaints Pie Chart */}
        <div className="xl:col-span-1 animate-fade-in-up opacity-0" style={{ animationDelay: '620ms', animationFillMode: 'forwards' }}>
          <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl h-full flex flex-col hover-lift">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Şikayet Kategorileri</CardTitle>
              <CardDescription>Aktif ve geçmiş şikayetlerin dağılımı</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center pt-0">
              {loading ? (
                <Skeleton className="h-[250px] w-full rounded-full" />
              ) : (
                <div className="h-[300px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={complaintCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {complaintCategoryColors}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Appointment Bar Chart */}
        <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl hover-lift animate-fade-in-up opacity-0" style={{ animationDelay: '740ms', animationFillMode: 'forwards' }}>
          <CardHeader>
            <CardTitle className="text-xl">Randevu Durumları</CardTitle>
            <CardDescription>Son 7 gündeki randevuların işlem durumu</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-xl" />
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={appointmentStatusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={40}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#888' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888' }} dx={-10} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Logs */}
        <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl overflow-hidden flex flex-col hover-lift animate-fade-in-up opacity-0" style={{ animationDelay: '860ms', animationFillMode: 'forwards' }}>
          <CardHeader className="bg-primary/5 border-b border-border/50">
            <CardTitle className="text-xl">Son Aktiviteler</CardTitle>
            <CardDescription>Sistemdeki en son 10 işlem anlık olarak gösteriliyor.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-auto max-h-[400px]">
            {(loading || activityLoading) ? (
              <div className="p-6 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-4 p-3 border-b border-white/5 last:border-0">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activityError ? (
              <div className="flex justify-center items-center h-full min-h-[200px] text-destructive">
                <AlertCircle className="w-5 h-5 mr-2" />
                Aktivite logları yüklenemedi
              </div>
            ) : activity.length === 0 ? (
              <div className="flex justify-center items-center h-full min-h-[200px] text-muted-foreground">
                Henüz aktivite bulunmuyor
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {activity.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                      {log.type.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{log.desc}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(toDate(log.createdAt), 'dd MMM HH:mm', { locale: tr })}
                      </p>
                    </div>
                    <div className="shrink-0 bg-secondary px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wider uppercase">
                      {log.type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
