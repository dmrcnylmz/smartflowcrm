'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { AlertCircle, Phone, PhoneIncoming, PhoneOutgoing, Search, Clock, User, MessageSquare, FileText, X, Download, Mic } from 'lucide-react';
import { VoiceCallModal } from '@/components/voice/VoiceCallModal';
import { useCalls } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds, getCustomer } from '@/lib/firebase/batch-helpers';
import { updateCallLog } from '@/lib/firebase/db';
import { useToast } from '@/components/ui/toast';
import type { Customer, CallLog } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import { Suspense } from 'react';

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
            // Don't fail the whole page if customer loading fails
          });
      }
    }
  }, [calls]);

  const error = callsError ? callsError instanceof Error && 'code' in callsError && callsError.code === 'permission-denied'
    ? 'Firebase izin hatası. Security rules kontrol edin.'
    : callsError instanceof Error ? callsError.message : 'Çağrı verileri yüklenemedi.'
    : null;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'destructive' | 'secondary'; label: string }> = {
      answered: { variant: 'default' as const, label: 'Yanıtlandı' },
      missed: { variant: 'destructive' as const, label: 'Kaçırıldı' },
      voicemail: { variant: 'secondary' as const, label: 'Sesli Mesaj' },
    };
    const config = variants[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getIntentBadge = (intent: string) => {
    const colors: Record<string, string> = {
      randevu: 'bg-blue-500',
      appointment: 'bg-blue-500',
      fatura: 'bg-purple-500',
      invoice: 'bg-purple-500',
      destek: 'bg-green-500',
      support: 'bg-green-500',
      şikayet: 'bg-red-500',
      complaint: 'bg-red-500',
      bilgi: 'bg-yellow-500',
      info_request: 'bg-yellow-500',
    };
    const color = colors[intent] || 'bg-gray-500';
    return <Badge className={color}>{intent}</Badge>;
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

    // Date range filter
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
  const totalAvailable = calls.length; // Real-time'da tam sayıyı bilmiyoruz, mevcut yüklenen sayıyı gösteriyoruz

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

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Çağrılar</h1>
            <p className="text-muted-foreground">Tüm çağrı kayıtları ve geçmiş</p>
          </div>
          <Button
            onClick={() => setVoiceCallOpen(true)}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            <Mic className="h-4 w-4" />
            Sesli AI Arama
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Çağrı</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCalls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yanıtlanan</CardTitle>
            <PhoneIncoming className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{answeredCalls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kaçırılan</CardTitle>
            <PhoneOutgoing className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{missedCalls}</div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <AlertCircle className="h-5 w-5 inline-block mr-2" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Çağrı Listesi</CardTitle>
            <div className="flex items-center gap-2">
              {filteredCalls.length > 0 && (
                <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Export" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV İndir</SelectItem>
                    <SelectItem value="excel">Excel İndir</SelectItem>
                    <SelectItem value="pdf">PDF İndir</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(searchTerm || statusFilters.length > 0 || directionFilter !== 'all' || intentFilters.length > 0 || dateFrom || dateTo) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearFilters}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Filtreleri Temizle
                </Button>
              )}
            </div>
          </div>
          {/* Filters */}
          <div className="space-y-4 mt-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Müşteri adı veya telefon..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <MultiSelectFilter
                options={statusOptions}
                selectedValues={statusFilters}
                onSelectionChange={setStatusFilters}
                placeholder="Durum seçin..."
                label="Durum"
                className="w-full md:w-[200px]"
              />
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Yön" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm Yönler</SelectItem>
                  <SelectItem value="inbound">Gelen</SelectItem>
                  <SelectItem value="outbound">Giden</SelectItem>
                </SelectContent>
              </Select>
              {intentOptions.length > 0 && (
                <MultiSelectFilter
                  options={intentOptions}
                  selectedValues={intentFilters}
                  onSelectionChange={setIntentFilters}
                  placeholder="Intent seçin..."
                  label="Intent"
                  className="w-full md:w-[200px]"
                />
              )}
            </div>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Yükleniyor...
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilters.length > 0 || directionFilter !== 'all' || intentFilters.length > 0 || dateFrom || dateTo
                ? 'Filtre kriterlerine uygun çağrı bulunamadı'
                : 'Henüz çağrı kaydı yok'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Yön</TableHead>
                  <TableHead>Intent</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Süre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.map((call) => {
                  const customer = call.customerId ? customers[call.customerId] : undefined;
                  const timestamp = call.timestamp || call.createdAt;
                  const duration = call.durationSec ?? call.duration;
                  const direction = call.direction || 'inbound';

                  return (
                    <TableRow
                      key={call.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => handleCallClick(call)}
                    >
                      <TableCell>
                        {format(toDate(timestamp), 'PPp', { locale: tr })}
                      </TableCell>
                      <TableCell>{customer?.name || call.customerName || 'Bilinmeyen'}</TableCell>
                      <TableCell>{customer?.phone || call.customerPhone || call.customerId || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={direction === 'inbound' ? 'default' : 'secondary'}>
                          {direction === 'inbound' ? 'Gelen' : 'Giden'}
                        </Badge>
                      </TableCell>
                      <TableCell>{call.intent ? getIntentBadge(call.intent) : '-'}</TableCell>
                      <TableCell>{getStatusBadge(call.status)}</TableCell>
                      <TableCell>{duration}s</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
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
        </CardContent>
      </Card>

      {/* Çağrı Detay Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Çağrı Detayları</DialogTitle>
          </DialogHeader>

          {selectedCall && (
            <div className="space-y-6 mt-4">
              {/* Çağrı Bilgileri */}
              <Card>
                <CardHeader>
                  <CardTitle>Çağrı Bilgileri</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Tarih & Saat
                      </Label>
                      <p className="font-medium">
                        {format(toDate(selectedCall.timestamp || selectedCall.createdAt), 'PPpp', { locale: tr })}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Durum
                      </Label>
                      <p className="font-medium">{getStatusBadge(selectedCall.status)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Intent
                      </Label>
                      <p className="font-medium">{selectedCall.intent ? getIntentBadge(selectedCall.intent) : '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Süre</Label>
                      <p className="font-medium">{selectedCall.durationSec ?? selectedCall.duration ?? 0}s</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Yön</Label>
                      <p className="font-medium">
                        <Badge variant={selectedCall.direction === 'inbound' ? 'default' : 'secondary'}>
                          {selectedCall.direction === 'inbound' ? 'Gelen' : 'Giden'}
                        </Badge>
                      </p>
                    </div>
                    {selectedCall.customerPhone && (
                      <div>
                        <Label className="text-muted-foreground">Telefon</Label>
                        <p className="font-medium">{selectedCall.customerPhone}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Müşteri Bilgileri */}
              {loadingCustomer ? (
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ) : selectedCustomer ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Müşteri Bilgileri
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">İsim</Label>
                        <p className="font-medium">{selectedCustomer.name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Telefon</Label>
                        <p className="font-medium">{selectedCustomer.phone}</p>
                      </div>
                      {selectedCustomer.email && (
                        <div>
                          <Label className="text-muted-foreground">E-posta</Label>
                          <p className="font-medium">{selectedCustomer.email}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-muted-foreground text-center">Müşteri bilgisi bulunamadı</p>
                  </CardContent>
                </Card>
              )}

              {/* Transcript & Summary */}
              {(selectedCall.transcript || selectedCall.summary) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Konuşma Detayları
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedCall.transcript && (
                      <div>
                        <Label className="text-muted-foreground">Transcript</Label>
                        <p className="text-sm mt-2 bg-muted p-3 rounded">{selectedCall.transcript}</p>
                      </div>
                    )}
                    {selectedCall.summary && (
                      <div>
                        <Label className="text-muted-foreground">Özet</Label>
                        <p className="text-sm mt-2 bg-muted p-3 rounded">{selectedCall.summary}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Notlar */}
              <Card>
                <CardHeader>
                  <CardTitle>Notlar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="call-notes">Çağrı Notları</Label>
                    <Textarea
                      id="call-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Çağrı hakkında notlar ekleyin..."
                      rows={4}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                    >
                      {savingNotes ? 'Kaydediliyor...' : 'Kaydet'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
    <Suspense fallback={<div className="p-8">Yükleniyor...</div>}>
      <CallsPageContent />
    </Suspense>
  );
}

