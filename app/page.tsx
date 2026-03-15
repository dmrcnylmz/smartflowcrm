'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, AlertCircle, Calendar, PhoneIncoming, MessageSquareWarning, ArrowUpRight, TrendingUp, RefreshCw, Wifi, WifiOff, Zap, Activity } from 'lucide-react';
import { VoiceAIStatus } from '@/components/voice/VoiceAIStatus';
import { useActivityLogs } from '@/lib/firebase/hooks';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { CallLog, Complaint, Appointment } from '@/lib/firebase/types';
import { format, subDays } from 'date-fns';
import { toDate } from '@/lib/utils/date-helpers';
import { getDateLocale } from '@/lib/utils/date-locale';
import { useLocale, useTranslations } from 'next-intl';
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
  { label: '—', value: 0 },
  { label: '30s', value: 30000 },
  { label: '1m', value: 60000 },
  { label: '5m', value: 300000 },
];

export default function DashboardPage() {
  const authFetch = useAuthFetch();
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');
  const tCharts = useTranslations('charts');
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
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
        date: format(date, 'dd MMM', { locale: dateLocale }),
        dateObj: date,
        calls: 0,
        answered: 0,
        missed: 0,
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
        days[dayIndex].calls++;
        if (call.status === 'answered') {
          days[dayIndex].answered++;
        } else if (call.status === 'missed') {
          days[dayIndex].missed++;
        }
      }
    });

    return days;
  }, [chartData.calls, dateLocale]);

  const complaintCategoryData: ComplaintCategoryPoint[] = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    chartData.complaints.forEach(complaint => {
      const category = complaint.category || tc('noData');
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
      [tCharts('scheduled')]: 0,
      [tCharts('completed')]: 0,
      [tCharts('cancelled')]: 0,
    };

    chartData.appointments.forEach(apt => {
      if (apt.status === 'scheduled') statusMap[tCharts('scheduled')]++;
      else if (apt.status === 'completed') statusMap[tCharts('completed')]++;
      else if (apt.status === 'cancelled') statusMap[tCharts('cancelled')]++;
    });

    return Object.entries(statusMap).map(([name, value]) => ({
      name,
      value,
    }));
  }, [chartData.appointments, tCharts]);

  // Load all dashboard data from the server API
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

      // Build chart data from server response
      // Convert server callTrend to CallLog-like objects for the chart memo
      if (data.callTrend && Array.isArray(data.callTrend)) {
        const syntheticCalls: CallLog[] = [];
        for (const day of data.callTrend) {
          const dayDate = new Date(day.date);
          for (let i = 0; i < (day.answered || 0); i++) {
            syntheticCalls.push({
              id: `srv-call-${day.date}-a-${i}`,
              status: 'answered',
              timestamp: Timestamp.fromDate(dayDate),
              createdAt: Timestamp.fromDate(dayDate),
            } as CallLog);
          }
          for (let i = 0; i < (day.missed || 0); i++) {
            syntheticCalls.push({
              id: `srv-call-${day.date}-m-${i}`,
              status: 'missed',
              timestamp: Timestamp.fromDate(dayDate),
              createdAt: Timestamp.fromDate(dayDate),
            } as CallLog);
          }
        }
        setChartData(prev => ({ ...prev, calls: syntheticCalls }));
      }

      // Convert server complaintCategories to Complaint-like objects for the chart memo
      if (data.complaintCategories && Array.isArray(data.complaintCategories)) {
        const syntheticComplaints: Complaint[] = [];
        for (const cat of data.complaintCategories) {
          for (let i = 0; i < cat.value; i++) {
            syntheticComplaints.push({
              id: `srv-comp-${cat.name}-${i}`,
              category: cat.name,
              status: 'open',
              createdAt: Timestamp.fromDate(new Date()),
            } as Complaint);
          }
        }
        setChartData(prev => ({ ...prev, complaints: syntheticComplaints }));
      }

      setLastUpdated(new Date());
      setIsLive(true);
      setIsDemoMode(!!data.error);
      return true;
    } catch (err) {
      console.warn('[Dashboard] Failed to load server data:', err instanceof Error ? err.message : err);
      return false;
    }
  }, [authFetch]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const serverOk = await loadFromServerAPI();
    if (!serverOk && !isDemoMode) {
      // Server API failed — switch to demo mode
      setIsDemoMode(true);
      const { demoCalls, demoComplaints, demoAppointments } = generateDemoData();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCalls = demoCalls.filter(c => (toDate(c.timestamp || c.createdAt) ?? new Date(0)) >= today);
      setStats({
        todayCalls: todayCalls.length,
        missedCalls: demoCalls.filter(c => c.status === 'missed').length,
        openComplaints: demoComplaints.filter(c => c.status === 'open').length,
        upcomingAppointments: demoAppointments.filter(a => a.status === 'scheduled').length,
      });
      setChartData({ calls: demoCalls, complaints: demoComplaints, appointments: demoAppointments });
    }
    setRefreshing(false);
  }, [loadFromServerAPI, isDemoMode]);

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
    async function initDashboard() {
      setLoading(true);
      setError(null);
      const serverOk = await loadFromServerAPI();
      if (!serverOk) {
        // Server API failed — switch to demo mode
        setIsDemoMode(true);
        const { demoCalls, demoComplaints, demoAppointments } = generateDemoData();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCalls = demoCalls.filter(c => (toDate(c.timestamp || c.createdAt) ?? new Date(0)) >= today);
        setStats({
          todayCalls: todayCalls.length,
          missedCalls: demoCalls.filter(c => c.status === 'missed').length,
          openComplaints: demoComplaints.filter(c => c.status === 'open').length,
          upcomingAppointments: demoAppointments.filter(a => a.status === 'scheduled').length,
        });
        setChartData({ calls: demoCalls, complaints: demoComplaints, appointments: demoAppointments });
      }
      setLoading(false);
    }
    initDashboard();
  }, [loadFromServerAPI]);

  // Compute trend percentage (today vs yesterday). Returns null when no baseline.
  const computeTrend = (today: number, yesterday: number | undefined): number | null => {
    if (yesterday === undefined || yesterday === 0) return today > 0 ? 100 : null;
    return Math.round(((today - yesterday) / yesterday) * 100);
  };

  const callsTrend = yesterdayStats ? computeTrend(stats.todayCalls, yesterdayStats.todayCalls) : null;
  const missedTrend = yesterdayStats ? computeTrend(stats.missedCalls, yesterdayStats.missedCalls) : null;

  const kpiCards = [
    {
      title: t('todayCalls'),
      value: stats.todayCalls,
      icon: PhoneIncoming,
      borderColor: 'border-blue-500/15',
      iconColor: 'text-blue-400 bg-blue-500/10',
      trend: isDemoMode ? null : callsTrend,
      trendUp: (callsTrend ?? 0) >= 0,
    },
    {
      title: t('missedCalls'),
      value: stats.missedCalls,
      icon: Phone,
      borderColor: 'border-rose-500/15',
      iconColor: 'text-rose-400 bg-rose-500/10',
      trend: isDemoMode ? null : missedTrend,
      trendUp: (missedTrend ?? 0) <= 0, // fewer missed = good
    },
    {
      title: t('openComplaints'),
      value: stats.openComplaints,
      icon: MessageSquareWarning,
      borderColor: 'border-amber-500/15',
      iconColor: 'text-amber-400 bg-amber-500/10',
      trend: null, // complaints don't have daily trend comparison
      trendUp: false,
    },
    {
      title: t('upcomingAppointments'),
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
        title: t('avgResponseTime'),
        value: voicePipeline.avgPipelineMs ? parseFloat((voicePipeline.avgPipelineMs / 1000).toFixed(1)) : 0,
        icon: Zap,
        borderColor: 'border-purple-500/15',
        iconColor: 'text-purple-400 bg-purple-500/10',
        trend: null,
        trendUp: true,
        suffix: 's',
      },
      {
        title: t('monthlyCallCount'),
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
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-sm text-amber-300 animate-fade-in-down">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{t('demoMode')}</strong> — {t('demoModeDesc')}
          </span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
            <div className="h-9 w-9 rounded-xl bg-inception-red/10 border border-inception-red/25 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-inception-red" />
            </div>
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('subtitle')}
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
                {format(lastUpdated, 'HH:mm:ss', { locale: dateLocale })}
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
                  {opt.value === 0 ? t('off') : `\u27F3 ${opt.label}`}
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
            {tc('refresh')}
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
            {tc('retry')}
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className={`grid grid-cols-2 md:grid-cols-2 ${kpiCards.length > 4 ? 'xl:grid-cols-6' : 'xl:grid-cols-4'} gap-3 sm:gap-6`}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))
        ) : (
          kpiCards.map((card: { title: string; value: number | string; icon: React.ComponentType<{ className?: string }>; borderColor: string; iconColor: string; trend?: number | null; trendUp?: boolean; suffix?: string }, idx: number) => {
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
            <CardTitle className="text-base font-semibold text-white">{t('recentActivity')}</CardTitle>
            <CardDescription className="text-white/40">{t('recentActivityDesc')}</CardDescription>
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
                {t('activityLoadError')}
              </div>
            ) : activity.length === 0 ? (
              <div className="flex justify-center items-center h-full min-h-[200px] text-muted-foreground">
                {t('noActivity')}
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
                        {format(toDate(log.createdAt) ?? new Date(), 'dd MMM HH:mm', { locale: dateLocale })}
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
