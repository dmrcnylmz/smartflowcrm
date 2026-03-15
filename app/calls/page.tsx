'use client';

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getDateLocale } from '@/lib/utils/date-locale';
import { Card, CardContent } from '@/components/ui/card';
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
import { exportCalls, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { AlertCircle, Phone, PhoneIncoming, PhoneOutgoing, Search, Clock, User, MessageSquare, FileText, X, Download, Mic, ChevronRight, Filter, Bot, AlertTriangle, Loader2, Play, Pause, Volume2 } from 'lucide-react';
import { VoiceCallModal } from '@/components/voice/VoiceCallModal';
import OutboundCallModal from '@/components/calls/OutboundCallModal';
import { useCalls } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds, getCustomer } from '@/lib/firebase/batch-helpers';
import { updateCallLog } from '@/lib/firebase/db';
import { useToast } from '@/components/ui/toast';
import type { Customer, CallLog } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils/date-helpers';
import { useDebounce } from '@/lib/hooks/useDebounce';

function CallsPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const t = useTranslations('calls');
  const tc = useTranslations('common');
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchInput, 300);
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
  const [showOutboundModal, setShowOutboundModal] = useState(false);

  // Real-time calls with limit
  const { data: calls, loading, error: callsError, refetch: refetchCalls } = useCalls();

  // Update URL params when filters change
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
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
  }, [debouncedSearch, statusFilters, directionFilter, intentFilters, dateFrom, dateTo]);

  // Get unique intents from calls (memoized to avoid recomputing on every render)
  const uniqueIntents = useMemo(
    () => Array.from(new Set(calls.map(c => c.intent).filter(Boolean))) as string[],
    [calls]
  );

  const statusOptions: FilterOption[] = [
    { value: 'answered', label: t('statusAnswered') },
    { value: 'missed', label: t('statusMissed') },
    { value: 'voicemail', label: t('statusVoicemail') },
  ];

  const intentOptions: FilterOption[] = useMemo(
    () => uniqueIntents.map(intent => ({
      value: intent,
      label: intent.charAt(0).toUpperCase() + intent.slice(1),
    })),
    [uniqueIntents]
  );

  function handleClearFilters() {
    setSearchInput('');
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
        title: tc('success'),
        description: t('notesSaved'),
        variant: 'success',
      });
    } catch (error) {
      console.error('Notes save error:', error);
      toast({
        title: tc('error'),
        description: t('notesSaveError'),
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
            setCustomers(Object.fromEntries(customerMap));
          })
          .catch((err: unknown) => {
            console.warn('Customer batch load error:', err);
          });
      }
    }
  }, [calls]);

  const error = callsError
    ? t('callLoadError')
    : null;

  const getStatusBadge = useCallback((status: string) => {
    const variants: Record<string, { variant: 'default' | 'destructive' | 'secondary' | 'outline'; label: string, colorClass: string }> = {
      answered: { variant: 'default' as const, label: t('badgeAnswered'), colorClass: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300' },
      missed: { variant: 'destructive' as const, label: t('badgeMissed'), colorClass: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/50 dark:text-red-300' },
      voicemail: { variant: 'secondary' as const, label: t('badgeVoicemail'), colorClass: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300' },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status, colorClass: '' };
    return <Badge className={`shadow-none ${config.colorClass}`} variant={config.variant}>{config.label}</Badge>;
  }, [t]);

  const getIntentBadge = useCallback((intent: string) => {
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
  }, []);

  // Filter calls (memoized -- uses debouncedSearch to avoid re-filtering on every keystroke)
  const filteredCalls = useMemo(() => calls.filter((call: CallLog) => {
    const customer = call.customerId ? customers[call.customerId] : undefined;
    const customerName = customer?.name || call.customerName || '';
    const customerPhone = customer?.phone || call.customerPhone || '';
    const searchLower = debouncedSearch.toLowerCase();

    const matchesSearch = !debouncedSearch ||
      customerName.toLowerCase().includes(searchLower) ||
      customerPhone.includes(debouncedSearch);

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(call.status);
    const matchesDirection = directionFilter === 'all' || call.direction === directionFilter;
    const matchesIntent = intentFilters.length === 0 || (call.intent && intentFilters.includes(call.intent));

    let matchesDate = true;
    if (dateFrom || dateTo) {
      const callDate = toDate(call.timestamp || call.createdAt);
      if (!callDate) {
        matchesDate = false;
      } else {
        const callDateOnly = new Date(callDate.getFullYear(), callDate.getMonth(), callDate.getDate());

        if (dateFrom) {
          const fromDateVal = new Date(dateFrom);
          fromDateVal.setHours(0, 0, 0, 0);
          if (callDateOnly < fromDateVal) matchesDate = false;
        }

        if (dateTo) {
          const toDateVal = new Date(dateTo);
          toDateVal.setHours(23, 59, 59, 999);
          if (callDateOnly > toDateVal) matchesDate = false;
        }
      }
    }

    return matchesSearch && matchesStatus && matchesDirection && matchesIntent && matchesDate;
  }), [calls, customers, debouncedSearch, statusFilters, directionFilter, intentFilters, dateFrom, dateTo]);

  // Stats (memoized -- only recompute when filteredCalls changes)
  const { totalCalls, answeredCalls, missedCalls } = useMemo(() => ({
    totalCalls: filteredCalls.length,
    answeredCalls: filteredCalls.filter(c => c.status === 'answered').length,
    missedCalls: filteredCalls.filter(c => c.status === 'missed').length,
  }), [filteredCalls]);

  // Pagination
  const hasMore = calls.length >= limit;
  const totalAvailable = calls.length;

  function handleLoadMore() {
    setLimit(prev => Math.min(prev + 50, 500));
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
  }

  async function handleExport(format: 'csv' | 'excel' | 'pdf') {
    try {
      const exportData = exportCalls(filteredCalls as unknown as Array<Record<string, unknown>>, customers as unknown as Record<string, Record<string, unknown>>);
      const filename = `calls-${new Date().toISOString().split('T')[0]}`;

      switch (format) {
        case 'csv':
          exportToCSV(exportData, filename);
          break;
        case 'excel':
          await exportToExcel(exportData, filename);
          break;
        case 'pdf':
          await exportToPDF(exportData, filename, t('callList'));
          break;
      }

      toast({
        title: tc('success'),
        description: t('exportSuccess', { format: format.toUpperCase() }),
        variant: 'success',
      });
    } catch {
      toast({ title: tc('error'), description: t('exportError'), variant: 'error' });
    }
  }

  function renderTranscript(transcript: string | undefined | null) {
    if (!transcript) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('noTranscript')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{t('noTranscriptReason')}</p>
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
          <div key={`ai-${index}-${content.slice(0, 16)}`} className="flex justify-start">
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
        const speaker = speakerMatch ? speakerMatch[1] : 'Customer';
        return (
          <div key={`cust-${index}-${content.slice(0, 16)}`} className="flex justify-end">
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
        <div key={`sys-${index}-${trimmed.slice(0, 16)}`} className="flex justify-center">
          <p className="text-xs text-muted-foreground italic px-3 py-1">{trimmed}</p>
        </div>
      );
    });
  }

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
              <Phone className="h-5 w-5 text-emerald-500" />
            </div>
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {filteredCalls.length > 0 && (
            <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
              <SelectTrigger className="w-[140px] bg-white/[0.04] border-white/[0.08] rounded-xl">
                <SelectValue placeholder={t('export')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">{t('csvDownload')}</SelectItem>
                <SelectItem value="excel">{t('excelDownload')}</SelectItem>
                <SelectItem value="pdf">{t('pdfDownload')}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Button
            onClick={() => setShowOutboundModal(true)}
            className="bg-blue-600 hover:bg-blue-700 gap-2 text-white"
          >
            <PhoneOutgoing className="h-4 w-4" />
            {t('newCall')}
          </Button>

          <Button
            onClick={() => setVoiceCallOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2 text-white"
          >
            <Mic className="h-4 w-4" />
            {t('voiceSimulation')}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-6">
        <div className="rounded-2xl border border-slate-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40 font-medium">{t('totalInOut')}</span>
            <div className="h-8 w-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
              <Phone className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{totalCalls}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40 font-medium">{t('answeredSuccess')}</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <PhoneIncoming className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{answeredCalls}</p>
        </div>
        <div className="rounded-2xl border border-red-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40 font-medium">{t('missedUnreachable')}</span>
            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <PhoneOutgoing className="h-4 w-4 text-red-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{missedCalls}</p>
        </div>
      </div>

      <Card className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            <Filter className="h-4 w-4" /> {t('advancedFilter')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="relative md:col-span-4">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 rounded-xl bg-background border-border/60"
              />
            </div>
            <div className="md:col-span-2">
              <MultiSelectFilter
                options={statusOptions}
                selectedValues={statusFilters}
                onSelectionChange={setStatusFilters}
                placeholder={t('selectStatus')}
                className="w-full bg-background rounded-xl border-border/60"
              />
            </div>
            <div className="md:col-span-2">
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-full bg-background rounded-xl border-border/60">
                  <SelectValue placeholder={t('direction')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allDirections')}</SelectItem>
                  <SelectItem value="inbound">{t('inboundCalls')}</SelectItem>
                  <SelectItem value="outbound">{t('outboundCalls')}</SelectItem>
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
                  placeholder={t('intentFilter')}
                  className="w-full bg-background rounded-xl border-border/60"
                />
              </div>
            )}
          </div>

          {(searchInput || statusFilters.length > 0 || directionFilter !== 'all' || intentFilters.length > 0 || dateFrom || dateTo) && (
            <div className="flex justify-start">
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground hover:text-foreground text-xs h-8">
                <X className="h-3 w-3 mr-1" />
                {t('clearAllFilters')}
              </Button>
            </div>
          )}
        </div>

        <CardContent className="p-0">
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
              <Button variant="outline" onClick={() => refetchCalls()}>{tc('retry')}</Button>
            </div>
          ) : filteredCalls.length === 0 && calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                <Phone className="h-8 w-8 text-white/20" />
              </div>
              <h3 className="text-lg font-semibold text-white/80 mb-2">{t('noCallsTitle')}</h3>
              <p className="text-sm text-white/40 mb-6 max-w-sm">{t('noCallsDesc')}</p>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-white/20" />
              </div>
              <h3 className="text-lg font-semibold text-white/80 mb-2">{t('noResultsTitle')}</h3>
              <p className="text-sm text-white/40 mb-6 max-w-sm">{t('noResultsDesc')}</p>
              <Button variant="outline" onClick={handleClearFilters}>{t('clearFilters')}</Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-foreground/80 pl-6 shrink-0 min-w-[200px]">{t('customerProfile')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 hidden lg:table-cell cursor-pointer">{t('status')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 cursor-pointer">{t('type')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 hidden md:table-cell cursor-pointer">{t('durationTag')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 text-right pr-6">{t('action')}</TableHead>
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
                              <span className="font-semibold text-foreground">{customer?.name || call.customerName || t('anonymousCaller')}</span>
                              <span className="text-xs text-muted-foreground mt-0.5">{customer?.phone || call.customerPhone || call.customerId || '-'}</span>
                              <span className="text-[10px] bg-muted w-fit px-1.5 py-0.5 rounded text-muted-foreground mt-1.5">
                                {format(toDate(timestamp) ?? new Date(), 'dd MMM yyyy, HH:mm', { locale: dateLocale })}
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
                                {direction === 'inbound' ? t('inbound') : t('outbound')}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-col gap-1.5 items-start">
                              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3 text-primary/70" /> {duration} {t('seconds')}
                              </span>
                              {call.intent && getIntentBadge(call.intent)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Detayları görüntüle">
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t bg-muted/10 flex flex-wrap items-center justify-between gap-2">
                {!loading && filteredCalls.length > 0 && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {t('showingCalls', { count: filteredCalls.length, total: totalAvailable })}
                    </p>
                    {hasMore && (
                      <Button variant="outline" size="sm" onClick={handleLoadMore}>
                        {t('loadMore')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Call Details Drawer-like Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-4xl p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl">
          <DialogHeader className="p-6 pb-0">
            <div className="flex justify-between items-start pb-4 border-b border-border/40">
              <div>
                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                  <span className="bg-primary/10 p-2 rounded-xl text-primary border border-primary/20"><Phone className="h-6 w-6" /></span>
                  {t('callDetails')}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {selectedCall && format(toDate(selectedCall.timestamp || selectedCall.createdAt) ?? new Date(), 'dd MMMM yyyy, HH:mm:ss', { locale: dateLocale })}
                </p>
              </div>
            </div>
          </DialogHeader>

          {selectedCall && (
            <div className="flex flex-col md:flex-row h-full max-h-[80vh] sm:max-h-[75vh] min-h-0 sm:min-h-[400px] overflow-hidden">
              {/* Left Side: Attributes */}
              <div className="w-full md:w-1/3 bg-muted/10 p-6 overflow-y-auto border-r border-border/40 space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">{t('customerInfo')}</p>
                  <div className="bg-background rounded-xl p-4 shadow-sm border border-border/50">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 font-bold">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-sm truncate">{selectedCustomer?.name || selectedCall.customerName || t('anonymous')}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{selectedCustomer?.phone || selectedCall.customerPhone || selectedCall.customerId}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">{t('statusMetrics')}</p>
                  <div className="flex flex-wrap gap-2">
                    {getStatusBadge(selectedCall.status)}
                    <Badge variant={selectedCall.direction === 'inbound' ? 'default' : 'secondary'} className="shadow-none bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                      {selectedCall.direction === 'inbound' ? t('inboundCall') : t('outboundCall')}
                    </Badge>
                    <Badge variant="outline" className="shadow-none border-blue-200 text-blue-700 bg-blue-50/50">
                      {selectedCall.durationSec ?? selectedCall.duration ?? 0} {t('seconds')}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-3">{t('aiReport')}</p>
                  {selectedCall.intent ? (
                    getIntentBadge(selectedCall.intent)
                  ) : (
                    <span className="text-xs text-muted-foreground italic">{t('notAnalyzed')}</span>
                  )}
                </div>

                <div className="pt-4 border-t border-border/50">
                  <Label className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex">{t('operatorNotes')}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-sm bg-background border-border/50 shadow-sm mt-2 rounded-xl min-h-[100px]"
                    placeholder={t('notesPlaceholder')}
                  />
                  <div className="flex justify-end mt-3">
                    <Button onClick={handleSaveNotes} disabled={savingNotes} size="sm" className="rounded-lg">
                      {savingNotes ? tc('loading') : t('saveNote')}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Side: AI Transcription */}
              <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-background bg-grid-slate-100/30 dark:bg-grid-slate-900/30">
                <div className="mb-6 bg-indigo-50/50 dark:bg-indigo-950/20 border-l-4 border-indigo-500 rounded-r-xl p-4 shadow-sm">
                  <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 mb-1.5 flex items-center">
                    <MessageSquare className="h-4 w-4" /> {t('aiSummary')}
                  </h4>
                  <p className="text-sm text-indigo-800 dark:text-indigo-200/80 leading-relaxed">
                    {selectedCall.summary || t('noAiSummary')}
                  </p>
                </div>

                {/* Recording Player */}
                {selectedCall.recording?.status === 'completed' && selectedCall.recording.mp3Url && (
                  <RecordingPlayer
                    mp3Url={selectedCall.recording.mp3Url}
                    wavUrl={selectedCall.recording.wavUrl}
                    duration={selectedCall.recording.duration}
                  />
                )}

                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2 mb-4 text-slate-700 dark:text-slate-300">
                    <FileText className="h-4 w-4" />
                    {t('transcriptTitle')}
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

      {/* Outbound Call Modal */}
      <OutboundCallModal
        isOpen={showOutboundModal}
        onClose={() => setShowOutboundModal(false)}
        onCallInitiated={() => {
          setTimeout(() => refetchCalls(), 1500);
        }}
      />

      {/* Voice Call Modal */}
      <VoiceCallModal
        open={voiceCallOpen}
        onOpenChange={setVoiceCallOpen}
        onCallEnd={(summary) => {
          toast({
            title: t('callCompleted'),
            description: `${Math.round(summary.duration_seconds)}s, ${summary.metrics.turn_count} turns`,
            variant: 'success',
          });
          setTimeout(() => refetchCalls(), 1500);
        }}
      />
    </div>
  );
}

// =============================================
// Recording Player Component
// =============================================

function RecordingPlayer({
  mp3Url,
  wavUrl,
  duration,
}: {
  mp3Url: string;
  wavUrl?: string;
  duration?: number;
}) {
  const t = useTranslations('calls');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) {
      const audio = new Audio(mp3Url);
      audio.onloadedmetadata = () => setAudioDuration(audio.duration);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
      audio.onerror = () => setIsPlaying(false);
      audioRef.current = audio;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  return (
    <div className="mb-6 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl p-4 border shadow-sm">
      <h4 className="text-sm font-bold flex items-center gap-2 mb-3 text-slate-700 dark:text-slate-300">
        <Volume2 className="h-4 w-4" />
        {t('recording')}
      </h4>
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="h-10 w-10 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors shrink-0"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4 text-primary" />
          ) : (
            <Play className="h-4 w-4 text-primary ml-0.5" />
          )}
        </button>
        <div className="flex-1 space-y-1">
          <input
            type="range"
            min={0}
            max={audioDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(audioDuration)}</span>
          </div>
        </div>
        {wavUrl && (
          <a
            href={wavUrl}
            download
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<div className="p-8 max-w-6xl mx-auto space-y-6"><Skeleton className="h-[400px] w-full rounded-2xl" /></div>}>
      <CallsPageContent />
    </Suspense>
  );
}
