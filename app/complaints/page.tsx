'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MultiSelectFilter, type FilterOption } from '@/components/ui/multi-select-filter';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { exportComplaints, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Search, FileText, User, X, Download, MessageSquareWarning, ArrowRight, Save, LayoutList } from 'lucide-react';
import { useComplaints } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import { updateComplaint } from '@/lib/firebase/db';
import { useToast } from '@/components/ui/toast';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import type { Customer, Complaint } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import { Suspense } from 'react';

function ComplaintsPageContent() {
  const { data: allComplaints, loading, error } = useComplaints();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [statusFilters, setStatusFilters] = useState<string[]>(
    searchParams.get('status')?.split(',').filter(Boolean) || []
  );
  const [categoryFilters, setCategoryFilters] = useState<string[]>(
    searchParams.get('category')?.split(',').filter(Boolean) || []
  );
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '');
  const [limit, setLimit] = useState(50);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (allComplaints.length > 0) {
      const customerIds = extractCustomerIds(allComplaints);
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
  }, [allComplaints]);

  // Update URL params when filters change
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilters.length > 0) params.set('status', statusFilters.join(','));
      if (categoryFilters.length > 0) params.set('category', categoryFilters.join(','));
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const newUrl = params.toString() ? `?${params.toString()}` : '/complaints';
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== newUrl) {
        window.history.replaceState({}, '', newUrl);
      }
    } catch (error) {
      console.warn('URL update error:', error);
    }
  }, [searchTerm, statusFilters, categoryFilters, dateFrom, dateTo]);

  // Get unique categories from complaints
  const uniqueCategories = Array.from(new Set(allComplaints.map(c => c.category).filter(Boolean))) as string[];

  const statusOptions: FilterOption[] = [
    { value: 'open', label: 'Açık' },
    { value: 'investigating', label: 'İşlemde' },
    { value: 'resolved', label: 'Çözüldü' },
    { value: 'closed', label: 'Kapatıldı' },
  ];

  const categoryOptions: FilterOption[] = uniqueCategories.map(cat => ({
    value: cat,
    label: cat,
  }));

  function handleClearFilters() {
    setSearchTerm('');
    setStatusFilters([]);
    setCategoryFilters([]);
    setDateFrom('');
    setDateTo('');
  }

  // Filter complaints
  const filteredComplaints = allComplaints.filter((complaint: Complaint) => {
    const customer = customers[complaint.customerId];
    const customerName = customer?.name || '';
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm ||
      customerName.toLowerCase().includes(searchLower) ||
      (complaint.category && complaint.category.toLowerCase().includes(searchLower)) ||
      (complaint.description && complaint.description.toLowerCase().includes(searchLower));

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(complaint.status);
    const matchesCategory = categoryFilters.length === 0 || (complaint.category && categoryFilters.includes(complaint.category));

    // Date range filter
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const complaintDate = toDate(complaint.createdAt);
      const complaintDateOnly = new Date(complaintDate.getFullYear(), complaintDate.getMonth(), complaintDate.getDate());

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (complaintDateOnly < fromDate) matchesDate = false;
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (complaintDateOnly > toDate) matchesDate = false;
      }
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesDate;
  });

  // Pagination
  const paginatedComplaints = filteredComplaints.slice(0, limit);
  const hasMore = filteredComplaints.length > limit;
  const totalAvailable = allComplaints.length;

  function handleLoadMore() {
    setLimit(prev => Math.min(prev + 50, 500));
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const exportData = exportComplaints(filteredComplaints, customers);
    const filename = `sikayetler-${new Date().toISOString().split('T')[0]}`;

    switch (format) {
      case 'csv':
        exportToCSV(exportData, filename);
        break;
      case 'excel':
        exportToExcel(exportData, filename);
        break;
      case 'pdf':
        exportToPDF(exportData, filename, 'Şikayet Listesi');
        break;
    }

    toast({
      title: 'Başarılı!',
      description: `${format.toUpperCase()} dosyası indirildi`,
      variant: 'success',
    });
  }

  async function handleStatusUpdate(complaintId: string, newStatus: 'open' | 'investigating' | 'resolved' | 'closed') {
    setUpdating(complaintId);
    try {
      await updateComplaint(complaintId, { status: newStatus });
      const statusLabels = {
        open: 'Açık',
        investigating: 'İşlemde',
        resolved: 'Çözüldü',
        closed: 'Kapatıldı',
      };
      toast({
        title: 'Durum Güncellendi',
        description: `Şikayet durumu "${statusLabels[newStatus]}" olarak değiştirildi`,
        variant: 'success',
      });
      // Update local state temporarily for snappy UI (in addition to relying on hook)
      if (selectedComplaint && selectedComplaint.id === complaintId) {
        setSelectedComplaint(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      console.error('Status update error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Durum güncellenirken hata oluştu';
      toast({
        title: 'Hata',
        description: errorMessage,
        variant: 'error',
      });
    } finally {
      setUpdating(null);
    }
  }

  function handleComplaintClick(complaint: Complaint) {
    setSelectedComplaint(complaint);
    setNotes(complaint.notes || '');
    setDetailDialogOpen(true);
    const customer = customers[complaint.customerId];
    setSelectedCustomer(customer || null);
  }

  async function handleSaveNotes() {
    if (!selectedComplaint) return;

    setSavingNotes(true);
    try {
      await updateComplaint(selectedComplaint.id, { notes });
      toast({
        title: 'Başarılı!',
        description: 'Müşteri operasyon notları senkronize edildi',
        variant: 'success',
      });
      setDetailDialogOpen(false);
    } catch (error) {
      console.error('Notes save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Notlar kaydedilirken hata oluştu';
      toast({
        title: 'Kayıt Hatası',
        description: errorMessage,
        variant: 'error',
      });
    } finally {
      setSavingNotes(false);
    }
  }

  // Stats
  const totalComplaints = allComplaints.length;
  const openComplaints = allComplaints.filter(c => c.status === 'open').length;
  const investigatingComplaints = allComplaints.filter(c => c.status === 'investigating').length;
  const resolvedComplaints = allComplaints.filter(c => c.status === 'resolved' || c.status === 'closed').length;

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <MessageSquareWarning className="h-8 w-8 text-orange-500" />
            Şikayet ve Talep Yönetimi
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Müşteri memnuniyetsizliklerini ve gelen talepleri proaktif olarak yönetin.
          </p>
        </div>
      </div>

      {/* KPI Stats Cards - Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-indigo-500 bg-indigo-500/10">
              <LayoutList className="h-6 w-6" />
            </div>
            <span className="text-indigo-500 bg-indigo-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Tümü</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Toplam Talep</h3>
            <div className="text-4xl font-bold tracking-tight text-foreground">{totalComplaints}</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-rose-500 bg-rose-500/10">
              <AlertCircle className="h-6 w-6" />
            </div>
            <span className="text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Acil</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Bekleyen (Açık)</h3>
            <div className="text-4xl font-bold tracking-tight text-rose-500">{openComplaints}</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-amber-500 bg-amber-500/10">
              <Clock className="h-6 w-6" />
            </div>
            <span className="text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Devam Eden</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">İşlemdeki Süreçler</h3>
            <div className="text-4xl font-bold tracking-tight text-amber-500">{investigatingComplaints}</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-emerald-500 bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <span className="text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Başarılı</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Çözüme Ulaşanlar</h3>
            <div className="text-4xl font-bold tracking-tight text-emerald-500">{resolvedComplaints}</div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="rounded-3xl border-white/10 shadow-xl bg-card/60 backdrop-blur-2xl overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-background/50 px-6 py-5">
          <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
            <div className="flex items-center gap-3 w-full lg:w-1/3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
              <Input
                placeholder="Müşteri adı, kategori veya kelime ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-2xl border-white/10 bg-background/50 h-12 w-full text-base transition-colors focus-visible:bg-background"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:flex-1 lg:justify-end">
              <MultiSelectFilter
                options={statusOptions}
                selectedValues={statusFilters}
                onSelectionChange={setStatusFilters}
                placeholder="Durum Seç"
                label="Durum"
                className="w-full sm:w-[150px] rounded-2xl h-12 border-white/10 bg-background/50"
              />
              {categoryOptions.length > 0 && (
                <MultiSelectFilter
                  options={categoryOptions}
                  selectedValues={categoryFilters}
                  onSelectionChange={setCategoryFilters}
                  placeholder="Kategori Seç"
                  label="Kategori"
                  className="w-full sm:w-[180px] rounded-2xl h-12 border-white/10 bg-background/50"
                />
              )}
              <div className="h-12 border border-white/10 bg-background/50 rounded-2xl px-2 flex items-center justify-center">
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

              {(searchTerm || statusFilters.length > 0 || categoryFilters.length > 0 || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  onClick={handleClearFilters}
                  className="rounded-xl h-12 font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4 mr-2" />
                  Sıfırla
                </Button>
              )}
              <div className="h-12 w-px bg-border/50 hidden sm:block"></div>
              {filteredComplaints.length > 0 && (
                <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
                  <SelectTrigger className="w-[130px] rounded-xl border-white/10 bg-background/50 h-12 hover:bg-muted text-sm font-medium transition-colors">
                    <Download className="mr-2 h-4 w-4" /> Dışarı Aktar
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl border-white/10 bg-card/95 backdrop-blur-xl">
                    <SelectItem value="csv">CSV İndir (.csv)</SelectItem>
                    <SelectItem value="excel">Excel İndir (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF İndir (.pdf)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[90px] w-full rounded-2xl bg-muted/60" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Bağlantı Hatası</h3>
              <p className="text-muted-foreground max-w-sm">
                {error.message?.includes('permission')
                  ? 'Veritabanı erişim izni reddedildi. Lütfen yöneticinizle iletişime geçin.'
                  : 'Şikayet listesi yüklenirken beklenmedik bir sistem hatası oluştu.'}
              </p>
            </div>
          ) : paginatedComplaints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-4 border border-white/5">
                <CheckCircle2 className="h-10 w-10 text-primary/40" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Pırıl Pırıl!</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {searchTerm || statusFilters.length > 0 || categoryFilters.length > 0 || dateFrom || dateTo
                  ? 'Girdiğiniz filtre ve arama kriterlerine uygun açık şikayet bulunmuyor.'
                  : 'Şu an sistemde aktif veya çözümlenmiş herhangi bir talep yok. İşler harika gidiyor!'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {paginatedComplaints.map((complaint, index) => {
                const customer = customers[complaint.customerId];

                return (
                  <div
                    key={complaint.id}
                    className="p-4 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 hover:bg-white/[0.02] cursor-pointer transition-all duration-200 animate-fade-in-up"
                    style={{ animationDelay: `${index * 40}ms` }}
                    onClick={() => handleComplaintClick(complaint)}
                  >
                    <div className="flex items-center gap-5 w-full lg:w-1/3">
                      <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-background border border-border shadow-sm">
                        {complaint.status === 'open' ? <AlertCircle className="h-5 w-5 text-rose-500" /> :
                          complaint.status === 'investigating' ? <Clock className="h-5 w-5 text-amber-500" /> :
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[15px] truncate mb-1">
                          {customer?.name || 'Bilinmeyen Kullanıcı'}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span>{format(toDate(complaint.createdAt), 'dd MMM HH:mm', { locale: tr })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:flex-1 flex flex-col items-start px-0 lg:px-4">
                      <Badge variant="outline" className="mb-2 bg-background/50 border-white/10 text-xs text-muted-foreground">
                        {complaint.category || 'Kategori Yok'}
                      </Badge>
                      <p className="text-sm font-medium text-foreground line-clamp-2 leading-relaxed opacity-90">
                        {complaint.description || 'Kullanıcının ekstra bir açıklaması bulunmuyor.'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between w-full lg:w-auto lg:justify-end gap-5">
                      <Badge
                        variant="secondary"
                        className={`px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none ${complaint.status === 'open' ? 'bg-rose-500/10 text-rose-500' :
                            complaint.status === 'investigating' ? 'bg-amber-500/10 text-amber-500' :
                              'bg-emerald-500/10 text-emerald-500'
                          }`}
                      >
                        {complaint.status === 'open' ? 'Açık Talep' :
                          complaint.status === 'investigating' ? 'İşlem Görüyor' :
                            'Bölüm Çözüldü'}
                      </Badge>

                      <ArrowRight className="h-5 w-5 text-muted-foreground/50 hidden lg:block" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && paginatedComplaints.length > 0 && (
            <div className="p-4 border-t border-border/50 bg-background/50">
              <PaginationControls
                currentLimit={limit}
                totalItems={totalAvailable}
                filteredItems={filteredComplaints.length}
                onLimitChange={handleLimitChange}
                onLoadMore={handleLoadMore}
                hasMore={hasMore}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Şikayet Detay Modal - Glassmorphism */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-white/10 shadow-2xl bg-card/95 backdrop-blur-2xl sm:rounded-[2rem]">
          <div className="flex flex-col md:flex-row h-full max-h-[85vh]">

            {/* Sol Taraf - Talep ve Müşteri Özeti */}
            <div className="w-full md:w-5/12 border-r border-border/50 bg-background/30 p-8 flex flex-col overflow-y-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">Talep No: {selectedComplaint?.id?.slice(-6).toUpperCase()}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">Sistem ve Kullanıcı Kayıtları</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/70 mb-3">Müşteri Profili</h4>
                  <div className="bg-background/50 border border-white/10 p-4 rounded-2xl flex flex-col gap-1">
                    <span className="font-semibold text-lg">{selectedCustomer?.name || 'Gizli Müşteri'}</span>
                    <span className="text-muted-foreground text-sm opacity-80">{selectedCustomer?.phone || 'Telefon Kaydı Yok'}</span>
                    {selectedCustomer?.email && <span className="text-muted-foreground text-sm opacity-80">{selectedCustomer.email}</span>}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/70 mb-3">Durum Akışı</h4>
                  {/* Status Timeline */}
                  <div className="bg-background/50 border border-white/10 p-4 rounded-2xl mb-3">
                    <div className="flex items-center justify-between relative">
                      {/* Connecting line */}
                      <div className="absolute top-3 left-3 right-3 h-0.5 bg-border/50" />
                      <div className="absolute top-3 left-3 h-0.5 bg-primary transition-all duration-500" style={{
                        width: selectedComplaint?.status === 'open' ? '0%'
                          : selectedComplaint?.status === 'investigating' ? '33%'
                          : selectedComplaint?.status === 'resolved' ? '66%'
                          : '95%'
                      }} />

                      {[
                        { key: 'open', label: 'Açık', icon: '🔴' },
                        { key: 'investigating', label: 'İnceleme', icon: '🟡' },
                        { key: 'resolved', label: 'Çözüldü', icon: '🟢' },
                        { key: 'closed', label: 'Kapalı', icon: '✅' },
                      ].map((step) => {
                        const statusOrder = ['open', 'investigating', 'resolved', 'closed'];
                        const currentIdx = statusOrder.indexOf(selectedComplaint?.status || 'open');
                        const stepIdx = statusOrder.indexOf(step.key);
                        const isCompleted = stepIdx <= currentIdx;
                        const isCurrent = step.key === selectedComplaint?.status;

                        return (
                          <div key={step.key} className="flex flex-col items-center relative z-10">
                            <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center text-[10px] transition-all duration-300 ${
                              isCurrent
                                ? 'border-primary bg-primary text-primary-foreground scale-125 shadow-lg shadow-primary/30'
                                : isCompleted
                                  ? 'border-primary bg-primary/20 text-primary'
                                  : 'border-muted-foreground/30 bg-background text-muted-foreground/40'
                            }`}>
                              {isCompleted ? '✓' : stepIdx + 1}
                            </div>
                            <span className={`text-[10px] mt-1.5 font-medium ${isCurrent ? 'text-primary' : isCompleted ? 'text-foreground/70' : 'text-muted-foreground/40'}`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2">
                    {selectedComplaint?.status === 'open' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-amber-500/5 hover:bg-amber-500/10 text-amber-500 border-amber-500/20 rounded-xl"
                        onClick={() => handleStatusUpdate(selectedComplaint.id, 'investigating')}
                        disabled={updating === selectedComplaint?.id}
                      >
                        <Clock className="h-3.5 w-3.5 mr-1" /> İncelemeye Al
                      </Button>
                    )}
                    {selectedComplaint?.status === 'investigating' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500 border-emerald-500/20 rounded-xl"
                        onClick={() => handleStatusUpdate(selectedComplaint.id, 'resolved')}
                        disabled={updating === selectedComplaint?.id}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Çözüldü İşaretle
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 border-rose-500/20 rounded-xl"
                      onClick={() => handleStatusUpdate(selectedComplaint!.id, 'closed')}
                      disabled={updating === selectedComplaint?.id || selectedComplaint?.status === 'closed'}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Arşive Kapat
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 text-sm mt-4 border-t border-border/50 pt-6">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Kayıt Tarihi</span>
                    <span className="font-medium text-right ml-4">{selectedComplaint ? format(toDate(selectedComplaint.createdAt), 'dd MMMM yyyy, HH:mm', { locale: tr }) : '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Kategori</span>
                    <span className="font-medium text-right text-indigo-400">{selectedComplaint?.category || '-'}</span>
                  </div>
                  {selectedComplaint?.resolvedAt && (
                    <div className="flex justify-between items-center text-emerald-500">
                      <span>Çözüm Tarihi</span>
                      <span className="font-medium">{format(toDate(selectedComplaint.resolvedAt), 'dd MMM, HH:mm', { locale: tr })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sağ Taraf - Konu İçeriği ve Yorumlar */}
            <div className="w-full md:w-7/12 p-8 flex flex-col gap-6 overflow-y-auto">
              <div>
                <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Müşteri Açıklaması</h3>
                <div className="bg-muted/30 border border-white/5 p-5 rounded-2xl text-foreground/90 leading-relaxed text-sm">
                  {selectedComplaint?.description || <span className="italic text-muted-foreground opacity-50">Ses kaydı veya yazılı not alınmamış...</span>}
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider flex items-center justify-between">
                  Müşteri Temsilcisi Notları
                  <span className="text-xs font-normal opacity-50 bg-background px-2 py-0.5 rounded border border-white/10">Admin Sadece</span>
                </h3>

                <Textarea
                  className="flex-1 min-h-[150px] resize-none bg-background/50 border-white/10 rounded-2xl focus-visible:ring-indigo-500"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Müşteriye yapılan operasyonları, şikayetin kök nedenini veya telafi sürecini buraya raporlayabilirsiniz..."
                />

                <div className="mt-4 flex justify-end gap-3">
                  <Button variant="ghost" onClick={() => setDetailDialogOpen(false)} className="rounded-xl">Kapat</Button>
                  <Button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-2 px-6"
                  >
                    {savingNotes ? <span className="animate-pulse">Kaydediliyor...</span> : <><Save className="h-4 w-4" /> Notları Kaydet</>}
                  </Button>
                </div>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] w-full items-center justify-center">
        <AlertCircle className="h-8 w-8 animate-pulse text-primary" />
      </div>
    }>
      <ComplaintsPageContent />
    </Suspense>
  );
}
