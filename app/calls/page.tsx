'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { MultiSelectFilter, type FilterOption } from '@/components/ui/multi-select-filter';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { exportCalls, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { AlertCircle, Phone, PhoneIncoming, PhoneOutgoing, Search, Clock, User, MessageSquare, FileText, X, Download, Mic, ChevronRight, Filter, Bot } from 'lucide-react';
import { VoiceCallModal } from '@/components/voice/VoiceCallModal';
import { useCalls } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds, getCustomer } from '@/lib/firebase/batch-helpers';
import { updateCallLog } from '@/lib/firebase/db';
import { useToast } from '@/components/ui/toast';
import type { Customer, CallLog } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';

function CallsPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [statusFilters, setStatusFilters] = useState<string[]>(
    searchParams.get('status')?.split(',').filter(Boolean) || []
  );
  const [directionFilter, setDirectionFilter] = useState<string>(searchParams.get('direction') || 'all');
  const [intentFilters, setIntentFilters] = useState<string[]>(
    searchParams.get('intent')?.split(',').filter(Boolean) || []
  );
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '');
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [limit, setLimit] = useState(50);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);

  // Real-time calls with limit
  const { data: calls, loading, error: callsError } = useCalls({ limitCount: limit });

  // Update URL params when filters change
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilters.length > 0) params.set('status', statusFilters.join(','));
      if (directionFilter !== 'all') params.set('direction', directionFilter);
      if (intentFilters.length > 0) params.set('intent', intentFilters.join(','));
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const newUrl = params.toString() ? `?${params.toString()}` : '/calls';
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== newUrl) {
        window.history.replaceState({}, '', newUrl);
      }
    } catch (error) {
      console.warn('URL update error:', error);
    }
  }, [searchTerm, statusFilters, directionFilter, intentFilters, dateFrom, dateTo]);

  // Get unique intents from calls
  const uniqueIntents = Array.from(new Set(calls.map(c => c.intent).filter(Boolean))) as string[];

  const statusOptions: FilterOption[] = [
    { value: 'answered', label: 'Yanıtlanan' },
    { value: 'missed', label: 'Kaçırılan' },
    { value: 'voicemail', label: 'Sesli Mesaj' },
  ];

  const intentOptions: FilterOption[] = uniqueIntents.map(intent => ({
    value: intent,
    label: intent.charAt(0).toUpperCase() + intent.slice(1),
  }));

  function handleClearFilters() {
    setSearchTerm('');
    setStatusFilters([]);
    setDirectionFilter('all');
    setIntentFilters([]);
    setDateFrom('');
    setDateTo('');
  }

  function handleCallClick(call: CallLog) {
    setSelectedCall(call);
    setNotes(call.notes || '');
    setDetailDialogOpen(true);

    if (call.customerId) {
      setLoadingCustomer(true);
      getCustomer(call.customerId)
        .then((customer) => {
          setSelectedCustomer(customer);
        })
        .catch((err) => {
          console.error('Customer load error:', err);
          setSelectedCustomer(null);
        })
        .finally(() => {
          setLoadingCustomer(false);
        });
    } else {
      setSelectedCustomer(null);
    }
  }

  async function handleSaveNotes() {
    if (!selectedCall) return;

    setSavingNotes(true);
    try {
      await updateCallLog(selectedCall.id, { notes });
      toast({
        title: 'Başarılı!',
        description: 'Notlar kaydedildi',
        variant: 'success',
      });
    } catch (error) {
      console.error('Notes save error:', error);
      toast({
        title: 'Hata',
        description: 'Notlar kaydedilirken hata oluştu',
        variant: 'error',
      });
    } finally {
      setSavingNotes(false);
    }
  }

  // Load customers when calls change
  useEffect(() => {
    if (calls.length > 0) {
      const customerIds = extractCustomerIds(calls);
      if (customerIds.length > 0) {
        getCustomersBatch(customerIds)
          .then((customerMap) => {
            setCustomers(customerMap);
          })
          .catch((err: unknown) => {
            console.warn('Customer batch load error:', err);
          });
      }
    }
  }, [calls]);

  const error = callsError ? callsError instanceof Error && 'code' in callsError && callsError.code === 'permission-denied'
    ? 'Firebase izin hatası. Security rules kontrol edin.'
    : callsError instanceof Error ? callsError.message : 'Çağrı verileri yüklenemedi.'
    : null;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string, colorClass: string }> = {
      answered: { variant: 'default' as const, label: 'Yanıtlandı', colorClass: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300' },
      missed: { variant: 'destructive' as const, label: 'Kaçırıldı', colorClass: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-300' },
      voicemail: { variant: 'secondary' as const, label: 'Sesli Mesaj', colorClass: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300' },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status, colorClass: '' };
    return <Badge className={`shadow-none ${config.colorClass}`} variant={config.variant}>{config.label}</Badge>;
  };

  const getIntentBadge = (intent: string) => {
    const colors: Record<string, string> = {
      randevu: 'border-blue-200 text-blue-700 bg-blue-50/50',
      appointment: 'border-blue-200 text-blue-700 bg-blue-50/50',
      fatura: 'border-purple-200 text-purple-700 bg-purple-50/50',
      invoice: 'border-purple-200 text-purple-700 bg-purple-50/50',
      destek: 'border-green-200 text-green-700 bg-green-50/50',
      support: 'border-emerald-200 text-emerald-700 bg-emerald-50/50',
      şikayet: 'border-red-200 text-red-700 bg-red-50/50',
      complaint: 'border-red-200 text-red-700 bg-red-50/50',
      bilgi: 'border-amber-200 text-amber-700 bg-amber-50/50',
      info_request: 'border-amber-200 text-amber-700 bg-amber-50/50',
    };
    const color = colors[intent] || 'border-slate-200 text-slate-700 bg-slate-50/50';
    return <Badge variant="outline" className={`shadow-none capitalize ${color}`}>{intent}</Badge>;
  };

  // Filter calls
  const filteredCalls = calls.filter((call: CallLog) => {
    const customer = call.customerId ? customers[call.customerId] : undefined;
    const customerName = customer?.name || call.customerName || '';
    const customerPhone = customer?.phone || call.customerPhone || '';
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm ||
      customerName.toLowerCase().includes(searchLower) ||
      customerPhone.includes(searchTerm);

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(call.status);
    const matchesDirection = directionFilter === 'all' || call.direction === directionFilter;
    const matchesIntent = intentFilters.length === 0 || (call.intent && intentFilters.includes(call.intent));

    let matchesDate = true;
    if (dateFrom || dateTo) {
      const callDate = toDate(call.timestamp || call.createdAt);
      const callDateOnly = new Date(callDate.getFullYear(), callDate.getMonth(), callDate.getDate());

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (callDateOnly < fromDate) matchesDate = false;
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (callDateOnly > toDate) matchesDate = false;
      }
    }

    return matchesSearch && matchesStatus && matchesDirection && matchesIntent && matchesDate;
  });

  // Stats
  const totalCalls = filteredCalls.length;
  const answeredCalls = filteredCalls.filter(c => c.status === 'answered').length;
  const missedCalls = filteredCalls.filter(c => c.status === 'missed').length;

  // Pagination
  const hasMore = calls.length >= limit;
  const totalAvailable = calls.length;

  function handleLoadMore() {
    setLimit(prev => Math.min(prev + 50, 500));
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const exportData = exportCalls(filteredCalls, customers);
    const filename = `cagrilar-${new Date().toISOString().split('T')[0]}`;

    switch (format) {
      case 'csv':
        exportToCSV(exportData, filename);
        break;
      case 'excel':
        exportToExcel(exportData, filename);
        break;
      case 'pdf':
        exportToPDF(exportData, filename, 'Çağrı Listesi');
        break;
    }

    toast({
      title: 'Başarılı!',
      description: `${format.toUpperCase()} dosyası indirildi`,
      variant: 'success',
    });
  }

  function renderTranscript(transcript: string | undefined | null) {
    if (!transcript) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Deşifre (Transcript) bulunamadı</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Görüşme çok kısa sürmüş veya kayıt devre dışı bırakılmış olabilir.</p>
        </div>
      );
    }

    const aiPatterns = /^(AI|Agent|Asistan|Bot|Assistant|Sistem):\s*/i;
    const customerPatterns = /^(Customer|Müşteri|User|Kullanıcı|Arayan|Caller):\s*/i;

    const lines = transcript.split('\n').filter((line) => line.trim() !== '');

    return lines.map((line, index) => {
      const trimmed = line.trim();

      if (aiPatterns.test(trimmed)) {
        const content = trimmed.replace(aiPatterns, '');
        const speakerMatch = trimmed.match(aiPatterns);
        const speaker = speakerMatch ? speakerMatch[1] : 'AI';
        return (
          <div key={index} className="flex justify-start">
            <div className="max-w-[80%]">
              <div className="flex items-center gap-1.5 mb-1">
                <Bot className="h-3 w-3 text-indigo-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{speaker}</span>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl rounded-tl-md px-4 py-2.5 shadow-sm">
                <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed">{content}</p>
              </div>
            </div>
          </div>
        );
      }

      if (customerPatterns.test(trimmed)) {
        const content = trimmed.replace(customerPatterns, '');
        const speakerMatch = trimmed.match(customerPatterns);
        const speaker = speakerMatch ? speakerMatch[1] : 'Müşteri';
        return (
          <div key={index} className="flex justify-end">
            <div className="max-w-[80%]">
              <div className="flex items-center justify-end gap-1.5 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{speaker}</span>
                <User className="h-3 w-3 text-slate-400" />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tr-md px-4 py-2.5 shadow-sm">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{content}</p>
              </div>
            </div>
          </div>
        );
      }

      // System / neutral message
      return (
        <div key={index} className="flex justify-center">
          <p className="text-xs text-muted-foreground italic px-3 py-1">{trimmed}</p>
        </div>
      );
    });
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Phone className="h-7 w-7 md:h-8 md:w-8 text-primary" />
            Çağrı Geçmişi
          </h1>
          <p className="text-muted-foreground mt-2">
            AI Asistan görüşmeleri, ses kayıtları ve müşteri etkileşim logları.
          </p>
        </div>

        <div className="flex gap-3">
          {filteredCalls.length > 0 && (
            <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
              <SelectTrigger className="w-[140px] bg-background shadow-sm rounded-xl">
                <SelectValue placeholder="Dışa Aktar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV İndir</SelectItem>
                <SelectItem value="excel">Excel İndir</SelectItem>
                <SelectItem value="pdf">PDF İndir</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={() => setVoiceCallOpen(true)}
            className="rounded-xl shadow-lg shadow-emerald-600/20 bg-emerald-600 hover:bg-emerald-700 transition-shadow gap-2 text-white"
          >
            <Mic className="h-4 w-4" />
            Sesli AI Simülasyonu
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none shadow-sm bg-slate-50/80 dark:bg-slate-900/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-800 dark:text-slate-300">Toplam Gelen-Giden</CardTitle>
            <div className="p-2 bg-slate-200/50 dark:bg-slate-800 rounded-lg">
              <Phone className="h-4 w-4 text-slate-700 dark:text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{totalCalls}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-emerald-50/80 dark:bg-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Yanıtlanan (Başarılı)</CardTitle>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
              <PhoneIncoming className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">{answeredCalls}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-red-50/80 dark:bg-red-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-red-800 dark:text-red-300">Kaçırılan (Ulaşılamayan)</CardTitle>
            <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <PhoneOutgoing className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-900 dark:text-red-100">{missedCalls}</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-600 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden border-border/50 shadow-sm">
        <div className="p-5 border-b bg-muted/20 space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <Filter className="h-4 w-4" /> Gelişmiş Filtreleme
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="relative md:col-span-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="İsim, telefon veya not ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-xl bg-background border-border/60"
              />
            </div>
            <div className="md:col-span-2">
              <MultiSelectFilter
                options={statusOptions}
                selectedValues={statusFilters}
                onSelectionChange={setStatusFilters}
                placeholder="Durum Seç"
                label="Durum"
                className="w-full bg-background rounded-xl border-border/60"
              />
            </div>
            <div className="md:col-span-2">
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-full bg-background rounded-xl border-border/60">
                  <SelectValue placeholder="Yön" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Yönler</SelectItem>
                  <SelectItem value="inbound">Gelen Aramalar</SelectItem>
                  <SelectItem value="outbound">Giden Aramalar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4">
              <DateRangePicker
                startDate={dateFrom}
                endDate={dateTo}
                onStartDateChange={setDateFrom}
                onEndDateChange={setDateTo}
                onClear={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
              />
            </div>

            {intentOptions.length > 0 && (
              <div className="md:col-span-12">
                <MultiSelectFilter
                  options={intentOptions}
                  selectedValues={intentFilters}
                  onSelectionChange={setIntentFilters}
                  placeholder="Intent (Niyet) Kategori Seçimi"
                  label="Yapay Zeka Etiketi (Intent)"
                  className="w-full bg-background rounded-xl border-border/60"
                />
              </div>
            )}
          </div>

          {(searchTerm || statusFilters.length > 0 || directionFilter !== 'all' || intentFilters.length > 0 || dateFrom || dateTo) && (
            <div className="flex justify-start">
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground text-xs h-8">
                <X className="h-3 w-3 mr-1" />
                Tüm filtreleri sıfırla
              </Button>
            </div>
          )}
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-12 flex-[2]" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1 hidden md:block" />
                </div>
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
              <Mic className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium text-foreground">Arama Bulunamadı</p>
              <p className="text-sm mt-1 max-w-sm">Filtrelerinize uygun çağrı logu yok. Filtreleri temizleyip tekrar deneyin.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-foreground/80 pl-6 shrink-0 min-w-[200px]">Müşteri Profili</TableHead>
                      <TableHead className="font-semibold text-foreground/80 hidden lg:table-cell cursor-pointer">Durum</TableHead>
                      <TableHead className="font-semibold text-foreground/80 cursor-pointer">Tip</TableHead>
                      <TableHead className="font-semibold text-foreground/80 hidden md:table-cell cursor-pointer">Süre / Etiket</TableHead>
                      <TableHead className="font-semibold text-foreground/80 text-right pr-6">Aksiyon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCalls.map((call, idx) => {
                      const customer = call.customerId ? customers[call.customerId] : undefined;
                      const timestamp = call.timestamp || call.createdAt;
                      const duration = call.durationSec ?? call.duration;
                      const direction = call.direction || 'inbound';

                      return (
                        <TableRow
                          key={call.id}
                          className="cursor-pointer group hover:bg-muted/30 transition-all duration-200 animate-fade-in focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
                          style={{ animationDelay: `${idx * 30}ms` }}
                          tabIndex={0}
                          role="button"
                          onClick={() => handleCallClick(call)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCallClick(call);
                            }
                          }}
                        >
                          <TableCell className="pl-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground">{customer?.name || call.customerName || 'Anonim Arayan'}</span>
                              <span className="text-xs text-muted-foreground mt-0.5">{customer?.phone || call.customerPhone || call.customerId || '-'}</span>
                              <span className="text-[10px] bg-muted w-fit px-1.5 py-0.5 rounded text-muted-foreground mt-1.5">
                                {format(toDate(timestamp), 'dd MMM yyyy, HH:mm', { locale: tr })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {getStatusBadge(call.status)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant={direction === 'inbound' ? 'default' : 'secondary'} className="shadow-none flex items-center gap-1 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                                {direction === 'inbound' ? <PhoneIncoming className="h-3 w-3" /> : <PhoneOutgoing className="h-3 w-3" />}
                                {direction === 'inbound' ? 'Gelen' : 'Giden'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-col gap-1.5 items-start">
                              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3 text-primary/70" /> {duration} saniye
                              </span>
                              {call.intent && getIntentBadge(call.intent)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t bg-muted/10 flex justify-center">
                {!loading && filteredCalls.length > 0 && (
                  <PaginationControls
                    currentLimit={limit}
                    totalItems={totalAvailable}
                    filteredItems={filteredCalls.length}
                    onLimitChange={handleLimitChange}
                    onLoadMore={handleLoadMore}
                    hasMore={hasMore}
                  />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Call Details Drawer-like Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl">
          <DialogHeader className="p-6 pb-0">
            <div className="flex justify-between items-start pb-4 border-b border-border/40">
              <div>
                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                  <span className="bg-primary/10 p-2 rounded-xl text-primary border border-primary/20"><Phone className="h-6 w-6" /></span>
                  Çağrı Dökümü
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {selectedCall && format(toDate(selectedCall.timestamp || selectedCall.createdAt), 'dd MMMM yyyy, HH:mm:ss', { locale: tr })}
                </p>
              </div>
            </div>
          </DialogHeader>

          {selectedCall && (
            <div className="flex flex-col md:flex-row h-full max-h-[75vh] min-h-[500px] overflow-hidden">
              {/* Left Side: Attributes */}
              <div className="w-full md:w-1/3 bg-muted/10 p-6 overflow-y-auto border-r border-border/40 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">Müşteri Bilgisi</p>
                  <div className="bg-background rounded-xl p-4 shadow-sm border border-border/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 font-bold">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-sm truncate">{selectedCustomer?.name || selectedCall.customerName || 'Anonim'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedCustomer?.phone || selectedCall.customerPhone || selectedCall.customerId}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">Durum Metrikleri</p>
                  <div className="flex flex-wrap gap-2">
                    {getStatusBadge(selectedCall.status)}
                    <Badge variant={selectedCall.direction === 'inbound' ? 'default' : 'secondary'} className="shadow-none bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                      {selectedCall.direction === 'inbound' ? 'Gelen Arama' : 'Giden Arama'}
                    </Badge>
                    <Badge variant="outline" className="shadow-none border-blue-200 text-blue-700 bg-blue-50/50">
                      {selectedCall.durationSec ?? selectedCall.duration ?? 0} saniye
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">Yapay Zeka Karnesi</p>
                  {selectedCall.intent ? (
                    getIntentBadge(selectedCall.intent)
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Analiz edilmemiş.</span>
                  )}
                </div>

                <div className="pt-4 border-t border-border/50">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex">Operatör/Genel Notlar</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-sm bg-background border-border/50 shadow-sm mt-2 rounded-xl min-h-[100px]"
                    placeholder="Bu çağrı hakkında alınan notlar..."
                  />
                  <div className="flex justify-end mt-3">
                    <Button onClick={handleSaveNotes} disabled={savingNotes} size="sm" className="rounded-lg shadow-sm">
                      {savingNotes ? 'Kaydediliyor...' : 'Notu Kaydet'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Side: AI Transcription */}
              <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-background bg-grid-slate-100/30 dark:bg-grid-slate-900/30">
                <div className="mb-6 bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 rounded-r-xl p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 mb-1.5 flex items-center">
                    <MessageSquare className="h-4 w-4" /> Yapay Zeka Özeti
                  </h4>
                  <p className="text-sm text-indigo-800 dark:text-indigo-200/80 leading-relaxed">
                    {selectedCall.summary || 'Bu görüşme için AI tarafından üretilmiş özet bulunmuyor.'}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-700 dark:text-slate-300">
                    <FileText className="h-4 w-4" />
                    Görüşme Dökümü (Transcript)
                  </h4>
                  <div className="bg-slate-50/50 dark:bg-slate-900/30 rounded-xl p-4 border shadow-inner min-h-[250px] max-h-[400px] overflow-y-auto space-y-3">
                    {renderTranscript(selectedCall.transcript)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Voice Call Modal */}
      <VoiceCallModal
        open={voiceCallOpen}
        onOpenChange={setVoiceCallOpen}
        onCallEnd={(summary) => {
          toast({
            title: 'Görüşme Tamamlandı',
            description: `${Math.round(summary.duration_seconds)}s sürdü, ${summary.metrics.turn_count} konuşma dönüşü`,
            variant: 'success',
          });
        }}
      />
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<div className="p-8 max-w-7xl mx-auto space-y-8"><Skeleton className="h-[400px] w-full rounded-2xl" /></div>}>
      <CallsPageContent />
    </Suspense>
  );
}
