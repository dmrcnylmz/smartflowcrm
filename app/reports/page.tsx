'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getDateLocale } from '@/lib/utils/date-locale';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Download, Calendar, AlertCircle, PhoneIncoming, Target, CheckCircle2, PhoneOutgoing, Clock, Info, ShieldAlert, BarChart3, Activity, AlertTriangle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Progress } from '@/components/ui/progress';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import nextDynamic from 'next/dynamic';

// Lazy-load recharts (~100KB) -- only downloaded when report data is shown
const ReportCharts = nextDynamic(() => import('@/components/reports/ReportCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Skeleton className="h-[300px] w-full rounded-2xl" />
      <Skeleton className="h-[300px] w-full rounded-2xl" />
    </div>
  ),
});

interface DailyReport {
  date: string;
  summary: {
    totalCalls: number;
    missedCalls: number;
    answeredCalls: number;
    avgCallDuration: number;
    openComplaints: number;
    totalComplaints: number;
    resolvedComplaints: number;
    openInfoRequests: number;
    scheduledAppointments: number;
    completedAppointments: number;
  };
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export default function ReportsPage() {
  const authFetch = useAuthFetch();
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState<ReportPeriod>('daily');

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, period]);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/reports/${period}?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
        setError(null);
      } else {
        await response.text().catch(() => '');
        // User-friendly messages — never expose raw HTTP status codes
        if (response.status === 401 || response.status === 403) {
          setError(t('sessionExpired'));
        } else if (response.status >= 500) {
          setError(t('serverError'));
        } else {
          setError(t('reportLoadError'));
        }
        setReport(null);
      }
    } catch (err: unknown) {
      setError(t('connectionError'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!report) return;

    const csvRows = [
      [t('csvDate'), t('csvMetric'), t('csvValue')],
      [report.date, t('csvTotalCalls'), report.summary.totalCalls],
      [report.date, t('csvAnsweredCalls'), report.summary.answeredCalls],
      [report.date, t('csvMissedCalls'), report.summary.missedCalls],
      [report.date, t('csvAvgDuration'), report.summary.avgCallDuration],
      [report.date, t('csvOpenComplaints'), report.summary.openComplaints],
      [report.date, t('csvTotalComplaints'), report.summary.totalComplaints],
      [report.date, t('csvResolvedComplaints'), report.summary.resolvedComplaints],
      [report.date, t('csvOpenInfoRequests'), report.summary.openInfoRequests],
      [report.date, t('csvScheduledAppointments'), report.summary.scheduledAppointments],
      [report.date, t('csvCompletedAppointments'), report.summary.completedAppointments],
    ];

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `callception-report-${selectedDate}.csv`;
    link.click();
  }

  // Calculate percentages purely for UI display logic (preventing NaN for 0 inputs)
  const calculatePercent = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="animate-fade-in-down flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-indigo-400" />
            </div>
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Tabs */}
          <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  period === p
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(p === 'daily' ? 'periodDaily' : p === 'weekly' ? 'periodWeekly' : 'periodMonthly')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="date"
                type={period === 'monthly' ? 'month' : 'date'}
                value={period === 'monthly' ? selectedDate.slice(0, 7) : selectedDate}
                onChange={(e) => setSelectedDate(period === 'monthly' ? `${e.target.value}-01` : e.target.value)}
                className="pl-10 border-none bg-transparent shadow-none"
              />
            </div>
            <div className="h-8 w-px bg-border/50"></div>
            <Button onClick={loadReport} disabled={loading} variant="ghost" className="font-medium text-primary">
              {t('analyze')}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-white/40 animate-spin mb-4" />
          <p className="text-sm text-white/40">{t('loadingData')}</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-red-400/60" />
          </div>
          <h3 className="text-lg font-semibold text-white/80 mb-2">{t('errorOccurred')}</h3>
          <p className="text-sm text-white/40 mb-6 max-w-sm">{error}</p>
          <Button variant="outline" onClick={() => { setError(null); loadReport(); }}>{tc('retry')}</Button>
        </div>
      ) : report ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between animate-fade-in-down">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-500" />
              {t('dateSummary', { date: format(new Date(report.date), 'dd MMMM yyyy, EEEE', { locale: dateLocale }) })}
            </h2>
            <Button onClick={downloadCSV} variant="outline" className="gap-2">
              <Download className="h-4 w-4 text-emerald-600" />
              {t('exportCSV')}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">

            {/* Call Performance */}
            <Card className="rounded-2xl border border-indigo-500/15 bg-white/[0.02] backdrop-blur-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: '0ms' }}>
              <CardHeader className="border-b border-white/[0.06] pb-4">
                <CardDescription className="flex items-center gap-2 font-medium text-indigo-400">
                  <PhoneIncoming className="h-4 w-4" />
                  {t('callPerformance')}
                </CardDescription>
                <CardTitle className="text-4xl font-bold text-white mt-2">
                  {report.summary.totalCalls} <span className="text-base text-white/40 font-medium">{t('calls')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">{t('answeredSuccess')}</span>
                      <span className="font-semibold text-emerald-600">
                        %{calculatePercent(report.summary.answeredCalls, report.summary.totalCalls)}
                      </span>
                    </div>
                    <Progress value={calculatePercent(report.summary.answeredCalls, report.summary.totalCalls)} className="h-2 bg-emerald-500/10" indicatorClassName="bg-emerald-500" />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
                    <div className="flex flex-col">
                      <span className="text-xs text-white/40">{t('missedCalls')}</span>
                      <span className="font-medium text-red-400 flex items-center gap-1">
                        <PhoneOutgoing className="h-3 w-3" />
                        {report.summary.missedCalls}
                      </span>
                    </div>
                    <div className="h-8 w-px bg-white/[0.06]"></div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-white/40">{t('avgDuration')}</span>
                      <span className="font-medium text-white flex items-center gap-1">
                        <Clock className="h-3 w-3 text-indigo-400" />
                        {report.summary.avgCallDuration} {t('sec')}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Appointments & Planning */}
            <Card className="rounded-2xl border border-blue-500/15 bg-white/[0.02] backdrop-blur-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: '80ms' }}>
              <CardHeader className="border-b border-white/[0.06] pb-4">
                <CardDescription className="flex items-center gap-2 font-medium text-blue-400">
                  <Target className="h-4 w-4" />
                  {t('appointmentPlanning')}
                </CardDescription>
                <CardTitle className="text-4xl font-bold text-white mt-2">
                  {report.summary.scheduledAppointments} <span className="text-base text-white/40 font-medium">{t('appointments')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="bg-blue-500/5 rounded-xl p-4 flex items-center justify-between border border-blue-500/15">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/10 rounded-lg">
                        <CheckCircle2 className="h-5 w-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t('requests')}</p>
                        <p className="text-xs text-muted-foreground">{t('dailyAppointments')}</p>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-blue-700 dark:text-blue-400">
                      {report.summary.scheduledAppointments}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <Info className="h-4 w-4 text-blue-400" />
                    <span>{t('completedAppointments')}:</span>
                    <span className="font-semibold text-white">{report.summary.completedAppointments} {t('count')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Complaints & Info Requests */}
            <Card className="rounded-2xl border border-amber-500/15 bg-white/[0.02] backdrop-blur-sm overflow-hidden relative animate-fade-in-up" style={{ animationDelay: '160ms' }}>
              <div className="absolute top-0 right-0 p-6 opacity-[0.03]">
                <ShieldAlert className="h-32 w-32 text-white" />
              </div>
              <CardHeader className="border-b border-white/[0.06] pb-4 relative z-10">
                <CardDescription className="flex items-center gap-2 font-medium text-amber-400">
                  <ShieldAlert className="h-4 w-4" />
                  {t('complaintsTitle')}
                </CardDescription>
                <CardTitle className="text-4xl font-bold text-white mt-2">
                  {report.summary.totalComplaints} <span className="text-base text-white/40 font-medium">{t('newComplaints')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 relative z-10">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-amber-500/5 border border-amber-500/15 p-4 rounded-xl">
                    <p className="text-xs text-amber-400/80 mb-1 font-medium">{t('openPending')}</p>
                    <p className="text-2xl font-bold text-amber-400">{report.summary.openComplaints}</p>
                  </div>
                  <div className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-xl">
                    <p className="text-xs text-emerald-400/80 mb-1 font-medium">{t('resolved')}</p>
                    <p className="text-2xl font-bold text-emerald-400">{report.summary.resolvedComplaints}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-between items-center text-sm border-t border-white/[0.06] pt-4">
                  <span className="text-white/40 font-medium">{t('generalInfoCaller')}:</span>
                  <Badge variant="outline" className="font-bold">{report.summary.openInfoRequests}</Badge>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Charts Section -- lazy-loaded to avoid bundling recharts synchronously */}
          <ReportCharts summary={report.summary} />

        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
            <BarChart3 className="h-8 w-8 text-white/20" />
          </div>
          <h3 className="text-lg font-semibold text-white/80 mb-2">{t('noDataTitle')}</h3>
          <p className="text-sm text-white/40 mb-6 max-w-sm">
            {t('noDataDesc', { date: format(new Date(selectedDate), 'dd MMMM yyyy', { locale: dateLocale }) })}
          </p>
          <Button variant="outline" onClick={loadReport}>{tc('retry')}</Button>
        </div>
      )}
    </div>
  );
}
