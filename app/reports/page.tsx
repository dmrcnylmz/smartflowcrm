'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Calendar, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

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
        await response.text(); // Consume response body
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
    link.download = `günlük-rapor-${selectedDate}.csv`;
    link.click();
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Raporlar</h1>
        <p className="text-muted-foreground">Günlük ve haftalık raporlar</p>
      </div>

      {/* Date Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Tarih Seçimi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="date">Rapor Tarihi</Label>
              <Input
                id="date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button onClick={loadReport} disabled={loading}>
              <Calendar className="mr-2 h-4 w-4" />
              Raporu Yükle
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily Report */}
      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center text-destructive">
              <AlertCircle className="mr-2 h-5 w-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      ) : report ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                Günlük Rapor - {format(new Date(report.date), 'PPP', { locale: tr })}
              </CardTitle>
              <Button onClick={downloadCSV}>
                <Download className="mr-2 h-4 w-4" />
                CSV İndir
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Toplam Çağrı</p>
                  <p className="text-2xl font-bold">{report.summary.totalCalls}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Yanıtlanan</p>
                  <p className="text-2xl font-bold text-green-600">{report.summary.answeredCalls}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Kaçırılan</p>
                  <p className="text-2xl font-bold text-red-600">{report.summary.missedCalls}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Ortalama Süre</p>
                  <p className="text-2xl font-bold">{report.summary.avgCallDuration}s</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Açık Şikayet</p>
                  <p className="text-2xl font-bold text-orange-600">{report.summary.openComplaints}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Toplam Şikayet</p>
                  <p className="text-2xl font-bold">{report.summary.totalComplaints}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Çözülen Şikayet</p>
                  <p className="text-2xl font-bold text-green-600">{report.summary.resolvedComplaints}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Açık Bilgi Talebi</p>
                  <p className="text-2xl font-bold">{report.summary.openInfoRequests}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Planlanan Randevu</p>
                  <p className="text-2xl font-bold">{report.summary.scheduledAppointments}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">Tamamlanan Randevu</p>
                  <p className="text-2xl font-bold text-green-600">{report.summary.completedAppointments}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Rapor bulunamadı
          </CardContent>
        </Card>
      )}
    </div>
  );
}

