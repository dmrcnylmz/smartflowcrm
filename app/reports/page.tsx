'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Calendar, AlertCircle, PhoneIncoming, Target, CheckCircle2, PhoneOutgoing, Clock, Info, ShieldAlert, BarChart3, CloudLightning, Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { Progress } from '@/components/ui/progress';

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

export default function ReportsPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/daily?date=${selectedDate}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data);
        setError(null);
      } else {
        await response.text();
        setError(`Rapor yüklenemedi: ${response.status}`);
        setReport(null);
      }
    } catch (err: unknown) {
      console.error('Rapor hatası:', err);
      const errorMessage = err instanceof Error ? err.message : 'Rapor yüklenirken hata oluştu';
      setError(errorMessage);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!report) return;

    const csvRows = [
      ['Tarih', 'Metrik', 'Değer'],
      [report.date, 'Toplam Çağrı', report.summary.totalCalls],
      [report.date, 'Yanıtlanan Çağrı', report.summary.answeredCalls],
      [report.date, 'Kaçırılan Çağrı', report.summary.missedCalls],
      [report.date, 'Ortalama Çağrı Süresi (sn)', report.summary.avgCallDuration],
      [report.date, 'Açık Şikayet', report.summary.openComplaints],
      [report.date, 'Toplam Şikayet', report.summary.totalComplaints],
      [report.date, 'Çözülen Şikayet', report.summary.resolvedComplaints],
      [report.date, 'Açık Bilgi Talebi', report.summary.openInfoRequests],
      [report.date, 'Planlanan Randevu', report.summary.scheduledAppointments],
      [report.date, 'Tamamlanan Randevu', report.summary.completedAppointments],
    ];

    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `smartflow-rapor-${selectedDate}.csv`;
    link.click();
  }

  // Calculate percentages purely for UI display logic (preventing NaN for 0 inputs)
  const calculatePercent = (value: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header section with glassmorphism */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            Performans Raporları
          </h1>
          <p className="text-muted-foreground mt-2">
            Günlük operasyon metrikleri ve müşteri hizmetleri anlık analizleri.
          </p>
        </div>

        <div className="flex items-center gap-3 bg-card p-2 rounded-2xl border shadow-sm">
          <div className="relative">
            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-10 border-none bg-transparent shadow-none"
            />
          </div>
          <div className="h-8 w-px bg-border/50"></div>
          <Button onClick={loadReport} disabled={loading} variant="ghost" className="rounded-xl font-medium text-primary">
            Analiz Et
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[200px] rounded-2xl" />
          <Skeleton className="h-[200px] rounded-2xl" />
          <Skeleton className="h-[200px] rounded-2xl" />
          <Skeleton className="h-[200px] rounded-2xl md:col-span-2 lg:col-span-3" />
        </div>
      ) : error ? (
        <div className="bg-orange-500/10 text-orange-600 border border-orange-500/20 p-6 rounded-2xl flex items-center justify-center gap-3">
          <AlertCircle className="h-6 w-6" />
          <p className="font-medium text-lg">{error}</p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-500" />
              {format(new Date(report.date), 'dd MMMM yyyy, EEEE', { locale: tr })} Özeti
            </h2>
            <Button onClick={downloadCSV} variant="outline" className="rounded-xl shadow-sm gap-2">
              <Download className="h-4 w-4 text-emerald-600" />
              Excel / CSV Aktar
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Çağrı Karnesi */}
            <Card className="rounded-2xl border-none shadow-md overflow-hidden">
              <CardHeader className="bg-indigo-50/50 dark:bg-indigo-950/20 pb-4">
                <CardDescription className="flex items-center gap-2 font-medium text-indigo-800 dark:text-indigo-300">
                  <PhoneIncoming className="h-4 w-4" />
                  Çağrı Performansı
                </CardDescription>
                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                  {report.summary.totalCalls} <span className="text-base text-muted-foreground font-medium">çağrı</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground">Yanıtlanan (Başarılı)</span>
                      <span className="font-semibold text-emerald-600">
                        %{calculatePercent(report.summary.answeredCalls, report.summary.totalCalls)}
                      </span>
                    </div>
                    <Progress value={calculatePercent(report.summary.answeredCalls, report.summary.totalCalls)} className="h-2 bg-emerald-100 dark:bg-emerald-950" indicatorClassName="bg-emerald-500" />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Kaçırılan Çağrılar</span>
                      <span className="font-medium text-red-500 flex items-center gap-1">
                        <PhoneOutgoing className="h-3 w-3" />
                        {report.summary.missedCalls}
                      </span>
                    </div>
                    <div className="h-8 w-px bg-border"></div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-muted-foreground">Ort. Görüşme Süresi</span>
                      <span className="font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3 text-indigo-500" />
                        {report.summary.avgCallDuration} sn
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Randevu Dönüşümü */}
            <Card className="rounded-2xl border-none shadow-md overflow-hidden">
              <CardHeader className="bg-blue-50/50 dark:bg-blue-950/20 pb-4">
                <CardDescription className="flex items-center gap-2 font-medium text-blue-800 dark:text-blue-300">
                  <Target className="h-4 w-4" />
                  Randevu & Planlama
                </CardDescription>
                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                  {report.summary.scheduledAppointments} <span className="text-base text-muted-foreground font-medium">randevu</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 flex items-center justify-between border border-blue-100 dark:border-blue-900/40">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-background rounded-lg shadow-sm">
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Talepler</p>
                        <p className="text-xs text-muted-foreground">Gün içi randevu girişleri</p>
                      </div>
                    </div>
                    <div className="text-xl font-bold text-blue-700 dark:text-blue-400">
                      {report.summary.scheduledAppointments}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 text-blue-500" />
                    <span>Tamamlanan Randevular:</span>
                    <span className="font-semibold text-foreground">{report.summary.completedAppointments} adet</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Şikayet ve Talep Yönetimi */}
            <Card className="rounded-2xl border-none shadow-md overflow-hidden relative">
              <div className="absolute top-0 right-0 p-6 opacity-5">
                <ShieldAlert className="h-32 w-32" />
              </div>
              <CardHeader className="bg-orange-50/50 dark:bg-orange-950/20 pb-4 relative z-10">
                <CardDescription className="flex items-center gap-2 font-medium text-orange-800 dark:text-orange-300">
                  <ShieldAlert className="h-4 w-4" />
                  Şikayetler & Bilgi Talebi
                </CardDescription>
                <CardTitle className="text-4xl font-bold text-foreground mt-2">
                  {report.summary.totalComplaints} <span className="text-base text-muted-foreground font-medium">yeni şikayet</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 relative z-10">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-orange-50/50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/40 p-4 rounded-xl">
                    <p className="text-xs text-orange-800/70 dark:text-orange-300/80 mb-1 font-medium">Açık/Bekleyen</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{report.summary.openComplaints}</p>
                  </div>
                  <div className="bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 p-4 rounded-xl">
                    <p className="text-xs text-emerald-800/70 dark:text-emerald-300/80 mb-1 font-medium">Çözüme Ulaşan</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{report.summary.resolvedComplaints}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-between items-center text-sm border-t pt-4">
                  <span className="text-muted-foreground font-medium">Genel Bilgi İçin Arayan:</span>
                  <Badge variant="outline" className="font-bold">{report.summary.openInfoRequests}</Badge>
                </div>
              </CardContent>
            </Card>

          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4 text-primary">
            <CloudLightning className="h-8 w-8 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-sm">Gelişmiş AI Analizi Hazırlanıyor</p>
              <p className="text-xs opacity-80 mt-1">SmartFlow 2.0 sürümünde, bu raporların analizlerini ve duygu durum saptamalarını saniyeler içerisinde Yapay Zeka botuna aktarabileceğiz.</p>
            </div>
          </div>

        </div>
      ) : (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="py-20 flex flex-col items-center justify-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mb-4 opacity-20" />
            <p className="font-medium">Seçili tarihe ait veri bulunmamaktadır.</p>
            <p className="text-sm mt-1">İşlem verisi oluştukça bu sayfa otomatik dolacaktır.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
