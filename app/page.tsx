'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, AlertCircle, Calendar, PhoneIncoming, MessageSquareWarning, ArrowUpRight, TrendingUp, RefreshCw, Wifi, WifiOff, Zap, Activity } from 'lucide-react';
import { VoiceAIStatus } from '@/components/voice/VoiceAIStatus';
import { getCallLogs, getComplaints, getAppointments } from '@/lib/firebase/db';
import { useActivityLogs } from '@/lib/firebase/hooks';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { CallLog, Complaint, Appointment } from '@/lib/firebase/types';
import { format, subDays } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import nextDynamic from 'next/dynamic';
import type { CallTrendPoint, ComplaintCategoryPoint, AppointmentStatusPoint } from '@/components/dashboard/DashboardCharts';

// Lazy-load VoicemailList — only downloaded when dashboard is visited
const VoicemailList = nextDynamic(() => import('@/components/dashboard/voicemail-list'), {
  ssr: false,
  loading: () => <div className="h-[300px] animate-pulse rounded-3xl bg-muted" />,
});

// Lazy-load recharts (~100KB) — only downloaded when dashboard is visited
const DashboardCharts = nextDynamic(() => import('@/components/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 h-[400px] animate-pulse rounded-3xl bg-muted" />
      <div className="h-[400px] animate-pulse rounded-3xl bg-muted" />
    </div>
  ),
});
import { Timestamp } from 'firebase/firestore';

// Demo mode activates when Firebase returns 3+ permission errors.
// Shows a visible banner and uses demo data instead.

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
  const [yesterdayStats, setYesterdayStats] = useState<{
    todayCalls: number;
    missedCalls: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(60000); // 1 minute default
  const [isLive, setIsLive] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [voicePipeline, setVoicePipeline] = useState<{
    totalCalls?: number;
    avgPipelineMs?: number;
    avgSttMs?: number;
    avgLlmMs?: number;
    avgTtsMs?: number;
    totalTtsChars?: number;
    estimatedCostUsd?: number;
    emergencyModeActive?: boolean;
    callsTrend?: number;
  } | null>(null);
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
  const { data: activity, loading: activityLoading, error: activityError } = useActivityLogs();

  // Prepare chart data with useMemo — types from DashboardCharts
  const callTrendData: CallTrendPoint[] = useMemo(() => {
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
      const callDate = toDate(call.timestamp || call.createdAt) ?? new Date();
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

  const complaintCategoryData: ComplaintCategoryPoint[] = useMemo(() => {
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

  const appointmentStatusData: AppointmentStatusPoint[] = useMemo(() => {
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

      // Voice pipeline summary from server
      if (data.voicePipeline) {
        setVoicePipeline(data.voicePipeline);
      }

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
      }

      // Load all complaints (for pie chart)
      let allComplaints: Complaint[] = [];
      try {
        allComplaints = await getComplaints();
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Şikayet verileri yüklenemedi';
        errors.push(errorMsg);
        if (errorMsg.includes('permission') || errorMsg.includes('Permission')) permissionErrors++;
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
      }

      // If all queries failed with permission errors, switch to demo mode
      if (permissionErrors >= 3 && !isDemoMode) {
        // Demo mode activated silently when Firebase permissions unavailable
        setIsDemoMode(true);
        const { demoCalls, demoComplaints, demoAppointments } = generateDemoData();
        allCalls = demoCalls;
        allComplaints = demoComplaints;
        allAppointments = demoAppointments;
      }

      // Today's calls for stats
      const todayCalls = allCalls.filter(c => {
        const callDate = toDate(c.timestamp || c.createdAt) ?? new Date(0);
        return callDate >= today;
      });
      const missedCalls = allCalls.filter(c => c.status === 'missed');
      const openComplaints = allComplaints.filter(c => c.status === 'open');
      const upcoming = allAppointments.filter(apt =>
        apt.dateTime && (toDate(apt.dateTime) ?? new Date(0)) >= today && apt.status === 'scheduled'
      );

      // Yesterday's stats for trend comparison
      const yesterday = subDays(today, 1);
      const yesterdayCalls = allCalls.filter(c => {
        const callDate = toDate(c.timestamp || c.createdAt) ?? new Date(0);
        return callDate >= yesterday && callDate < today;
      });
      const yesterdayMissed = yesterdayCalls.filter(c => c.status === 'missed');
      setYesterdayStats({
        todayCalls: yesterdayCalls.length,
        missedCalls: yesterdayMissed.length,
      });

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

      // Partial failure — log but don't block UI (demo mode handles full failure)
      if (!isDemoMode && errors.length > 0 && errors.length < 3) {
        // Partial failure - log but don't block UI
      }
    } catch (error: unknown) {
      // Fallback to demo mode on any critical error
      if (!isDemoMode) {
        setIsDemoMode(true);
        const { demoCalls, demoComplaints, demoAppointments } = generateDemoData();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayCalls = demoCalls.filter(c => (toDate(c.timestamp || c.createdAt) ?? new Date(0)) >= today);
        const missedCalls = demoCalls.filter(c => c.status === 'missed');
        const openComplaints = demoComplaints.filter(c => c.status === 'open');
        const upcoming = demoAppointments.filter(apt =>
          apt.dateTime && (toDate(apt.dateTime) ?? new Date(0)) >= today && apt.status === 'scheduled'
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
      }
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  }

  // Compute trend percentage (today vs yesterday). Returns null when no baseline.
  const computeTrend = (today: number, yesterday: number | undefined): number | null => {
    if (yesterday === undefined || yesterday === 0) return today > 0 ? 100 : null;
    return Math.round(((today - yesterday) / yesterday) * 100);
  };

  const callsTrend = yesterdayStats ? computeTrend(stats.todayCalls, yesterdayStats.todayCalls) : null;
  const missedTrend = yesterdayStats ? computeTrend(stats.missedCalls, yesterdayStats.missedCalls) : null;

  const kpiCards = [
    {
      title: 'Bugünkü Çağrılar',
      value: stats.todayCalls,
      icon: PhoneIncoming,
      borderColor: 'border-blue-500/15',
      iconColor: 'text-blue-400 bg-blue-500/10',
      trend: isDemoMode ? null : callsTrend,
      trendUp: (callsTrend ?? 0) >= 0,
    },
    {
      title: 'Kaçırılan Çağrılar',
      value: stats.missedCalls,
      icon: Phone,
      borderColor: 'border-rose-500/15',
      iconColor: 'text-rose-400 bg-rose-500/10',
      trend: isDemoMode ? null : missedTrend,
      trendUp: (missedTrend ?? 0) <= 0, // fewer missed = good
    },
    {
      title: 'Açık Şikayetler',
      value: stats.openComplaints,
      icon: MessageSquareWarning,
      borderColor: 'border-amber-500/15',
      iconColor: 'text-amber-400 bg-amber-500/10',
      trend: null, // complaints don't have daily trend comparison
      trendUp: false,
    },
    {
      title: 'Yaklaşan Randevular',
      value: stats.upcomingAppointments,
      icon: Calendar,
      borderColor: 'border-emerald-500/15',
      iconColor: 'text-emerald-400 bg-emerald-500/10',
      trend: null, // appointments are forward-looking, no yesterday comparison
      trendUp: true,
    },
    // Voice Pipeline KPIs (only show when data available)
    ...(voicePipeline ? [
      {
        title: 'Ort. Yanit Suresi',
        value: voicePipeline.avgPipelineMs ? parseFloat((voicePipeline.avgPipelineMs / 1000).toFixed(1)) : 0,
        icon: Zap,
        borderColor: 'border-purple-500/15',
        iconColor: 'text-purple-400 bg-purple-500/10',
        trend: null,
        trendUp: true,
        suffix: 's',
      },
      {
        title: 'Bu Ay Cagri',
        value: voicePipeline.totalCalls || 0,
        icon: Activity,
        borderColor: voicePipeline.emergencyModeActive
          ? 'border-red-500/15'
          : 'border-teal-500/15',
        iconColor: voicePipeline.emergencyModeActive
          ? 'text-red-400 bg-red-500/10'
          : 'text-teal-400 bg-teal-500/10',
        trend: voicePipeline.callsTrend || null,
        trendUp: (voicePipeline.callsTrend ?? 0) >= 0,
      },
    ] : []),
  ];

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-sm text-amber-300 animate-fade-in-down">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>Demo Modu</strong> — Firebase bağlantısı kurulamadı. Gösterilen veriler demo amaçlıdır.
          </span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
            <div className="h-9 w-9 rounded-xl bg-inception-red/10 border border-inception-red/25 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-inception-red" />
            </div>
            Genel Bakış
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
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
            <SelectTrigger className="text-xs h-8 w-[120px] rounded-xl bg-white/[0.04] border-white/[0.08]">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </Button>

          <VoiceAIStatus />
        </div>
      </div>

      {/* Error notification (demo mode has its own banner above) */}
      {error && !isDemoMode && (
        <div className="bg-orange-500/10 text-orange-400 border border-orange-500/20 p-4 rounded-xl flex items-center justify-center gap-3 backdrop-blur-sm">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="ml-2"
          >
            Tekrar Dene
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${kpiCards.length > 4 ? 'xl:grid-cols-6' : 'xl:grid-cols-4'} gap-6`}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))
        ) : (
          kpiCards.map((card: any, idx: number) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`rounded-2xl border ${card.borderColor} bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up`}
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40 font-medium">{card.title}</span>
                  <div className={`h-8 w-8 rounded-lg ${card.iconColor} flex items-center justify-center`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">
                  {card.value}{card.suffix && <span className="text-sm font-normal text-white/40 ml-0.5">{card.suffix}</span>}
                </p>
                {card.trend !== null && card.trend !== undefined && (
                  <p className={`text-xs mt-1 flex items-center gap-1 ${card.trendUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {card.trendUp ? <TrendingUp className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                    %{card.trend}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Charts Section — lazy-loaded to keep recharts out of initial bundle */}
      <DashboardCharts
        callTrendData={callTrendData}
        complaintCategoryData={complaintCategoryData}
        appointmentStatusData={appointmentStatusData}
        loading={loading}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Activity Logs */}
        <Card className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden flex flex-col animate-fade-in-up" style={{ animationDelay: '860ms' }}>
          <CardHeader className="border-b border-white/[0.06]">
            <CardTitle className="text-base font-semibold text-white">Son Aktiviteler</CardTitle>
            <CardDescription className="text-white/40">Sistemdeki en son 10 işlem anlık olarak gösteriliyor.</CardDescription>
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
              <div className="flex justify-center items-center h-full min-h-[200px] text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-5 h-5 mr-2" />
                Aktivite verileri şu anda görüntülenemiyor
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
                      {(log.type ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{log.desc || log.description || ''}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(toDate(log.createdAt) ?? new Date(), 'dd MMM HH:mm', { locale: tr })}
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

        {/* Voicemails — lazy-loaded */}
        <div className="animate-fade-in-up" style={{ animationDelay: '980ms' }}>
          <VoicemailList />
        </div>
      </div>
    </div>
  );
}
