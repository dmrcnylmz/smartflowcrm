'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelectFilter, type FilterOption } from '@/components/ui/multi-select-filter';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { exportAppointments, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { Plus, AlertCircle, Calendar as CalendarIcon, Clock, CheckCircle2, XCircle, Search, Edit, Trash2, X, Download, UserRoundSearch, UserPlus, Phone, Activity } from 'lucide-react';
import { getAllCustomers, createAppointment, updateAppointment, deleteAppointment } from '@/lib/firebase/db';
import { useAppointments } from '@/lib/firebase/hooks';
import { useToast } from '@/components/ui/toast';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import type { Customer, Appointment } from '@/lib/firebase/types';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import { Suspense } from 'react';

function AppointmentsPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [statusFilters, setStatusFilters] = useState<string[]>(
    searchParams.get('status')?.split(',').filter(Boolean) || []
  );
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState<string>(searchParams.get('dateTo') || '');
  const [limit, setLimit] = useState(50);
  const { data: allAppointments, loading, error: appointmentsError } = useAppointments({ limitCount: limit });
  const [formData, setFormData] = useState({
    customerId: '',
    dateTime: '',
    durationMin: '30',
    notes: '',
  });
  const [editFormData, setEditFormData] = useState({
    dateTime: '',
    durationMin: '30',
    notes: '',
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load customer details for appointments
  useEffect(() => {
    if (allAppointments.length > 0) {
      const customerIds = extractCustomerIds(allAppointments);
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
  }, [allAppointments]);

  // Load all customers for the form dropdown
  useEffect(() => {
    loadAllCustomers();
  }, []);

  // Update URL params when filters change
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (statusFilters.length > 0) params.set('status', statusFilters.join(','));
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const newUrl = params.toString() ? `?${params.toString()}` : '/appointments';
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== newUrl) {
        window.history.replaceState({}, '', newUrl);
      }
    } catch (error) {
      console.warn('URL update error:', error);
    }
  }, [searchTerm, statusFilters, dateFrom, dateTo]);

  const statusOptions: FilterOption[] = [
    { value: 'scheduled', label: 'Planlandı' },
    { value: 'completed', label: 'Tamamlandı' },
    { value: 'cancelled', label: 'İptal Edildi' },
  ];

  function handleClearFilters() {
    setSearchTerm('');
    setStatusFilters([]);
    setDateFrom('');
    setDateTo('');
  }

  // Pagination
  const hasMore = allAppointments.length >= limit;
  const totalAvailable = allAppointments.length;

  function handleLoadMore() {
    setLimit(prev => Math.min(prev + 50, 500));
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
  }

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const exportData = exportAppointments(filteredAppointments, customers);
    const filename = `randevular-${new Date().toISOString().split('T')[0]}`;

    switch (format) {
      case 'csv':
        exportToCSV(exportData, filename);
        break;
      case 'excel':
        exportToExcel(exportData, filename);
        break;
      case 'pdf':
        exportToPDF(exportData, filename, 'Randevu Listesi');
        break;
    }

    toast({
      title: 'Başarılı!',
      description: `${format.toUpperCase()} formatında dışa aktarıldı.`,
      variant: 'success',
    });
  }

  async function loadAllCustomers() {
    try {
      const customerList = await getAllCustomers();
      setAllCustomers(customerList);
    } catch (error) {
      console.error('Customers load error:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!formData.customerId || !formData.dateTime) {
        toast({
          title: 'Eksik Bilgi',
          description: 'Lütfen müşteri ve tarih seçin',
          variant: 'warning',
        });
        return;
      }

      const customer = allCustomers.find(c => c.id === formData.customerId);
      const dateTime = new Date(formData.dateTime);
      await createAppointment({
        customerId: formData.customerId,
        dateTime: Timestamp.fromDate(dateTime),
        durationMin: parseInt(formData.durationMin),
        notes: formData.notes || undefined,
        status: 'scheduled',
      });
      setFormData({ customerId: '', dateTime: '', durationMin: '30', notes: '' });
      setDialogOpen(false);
      toast({
        title: 'Başarılı!',
        description: `${customer?.name || 'Müşteri'} için yeni randevu oluşturuldu.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Appointment create error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Randevu oluşturulurken hata oluştu';
      toast({
        title: 'Hata',
        description: errorMessage,
        variant: 'error',
      });
    }
  }

  async function handleStatusUpdate(appointmentId: string, newStatus: 'scheduled' | 'completed' | 'cancelled') {
    setUpdating(appointmentId);
    try {
      await updateAppointment(appointmentId, { status: newStatus });
      const statusLabels = {
        scheduled: 'Planlandı',
        completed: 'Tamamlandı',
        cancelled: 'İptal Edildi',
      };
      toast({
        title: 'Durum Güncellendi',
        description: `Randevu "${statusLabels[newStatus]}" statüsüne alındı.`,
        variant: 'success',
      });
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

  function handleEditClick(appointment: Appointment) {
    setSelectedAppointment(appointment);
    const dateTime = toDate(appointment.dateTime);
    setEditFormData({
      dateTime: format(dateTime, "yyyy-MM-dd'T'HH:mm"),
      durationMin: appointment.durationMin?.toString() || '30',
      notes: appointment.notes || '',
    });
    setEditDialogOpen(true);
  }

  async function handleEditSave() {
    if (!selectedAppointment) return;

    try {
      const dateTime = new Date(editFormData.dateTime);
      await updateAppointment(selectedAppointment.id, {
        dateTime: Timestamp.fromDate(dateTime),
        durationMin: parseInt(editFormData.durationMin),
        notes: editFormData.notes || undefined,
      });
      setEditDialogOpen(false);
      toast({
        title: 'Başarılı!',
        description: 'Randevu güncellendi',
        variant: 'success',
      });
    } catch (error) {
      console.error('Appointment update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Randevu güncellenirken hata oluştu';
      toast({
        title: 'Hata',
        description: errorMessage,
        variant: 'error',
      });
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirmId) return;
    const appointmentId = deleteConfirmId;
    setDeleteConfirmId(null);

    try {
      await deleteAppointment(appointmentId);
      toast({
        title: 'Silindi!',
        description: 'Randevu başarıyla kaldırıldı',
        variant: 'success',
      });
    } catch (error) {
      console.error('Appointment delete error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Randevu silinirken hata oluştu';
      toast({
        title: 'Hata',
        description: errorMessage,
        variant: 'error',
      });
    }
  }

  // Filter appointments
  const filteredAppointments = allAppointments.filter((apt: Appointment) => {
    const customer = customers[apt.customerId];
    const customerName = customer?.name || '';
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm ||
      customerName.toLowerCase().includes(searchLower) ||
      (apt.notes && apt.notes.toLowerCase().includes(searchLower));

    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(apt.status);

    // Date range filter
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const aptDate = toDate(apt.dateTime);
      const aptDateOnly = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (aptDateOnly < fromDate) matchesDate = false;
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (aptDateOnly > toDate) matchesDate = false;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  // Stats
  const totalAppointments = allAppointments.length;
  const scheduledCount = allAppointments.filter(a => a.status === 'scheduled').length;
  const completedCount = allAppointments.filter(a => a.status === 'completed').length;
  const cancelledCount = allAppointments.filter(a => a.status === 'cancelled').length;

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-primary" />
            Randevu Yönetimi
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Müşteri randevuları, takvim organizasyonları ve durum takipleri.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-card p-2 rounded-2xl border shadow-sm backdrop-blur-md">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl px-4 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md transition-all">
                <Plus className="h-4 w-4" />
                Yeni Randevu
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] rounded-3xl border-white/10 shadow-2xl bg-card/95 backdrop-blur-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                  <CalendarIcon className="h-6 w-6 text-primary" />
                  Yeni Randevu Oluştur
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">Sisteme yeni bir ziyaret planlaması ekleyin</p>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="customerId" className="text-sm font-medium">Müşteri Seçimi <span className="text-destructive">*</span></Label>
                  <Select value={formData.customerId} onValueChange={(value) => setFormData({ ...formData, customerId: value })}>
                    <SelectTrigger className="rounded-xl bg-background/50 outline-none border-white/10">
                      <SelectValue placeholder="Sistemde kayıtlı müşteri arayın..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/10 shadow-xl backdrop-blur-xl bg-background/95">
                      {allCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id} className="cursor-pointer">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-sm">{customer.name}</span>
                            <span className="text-xs text-muted-foreground">{customer.phone}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateTime" className="text-sm font-medium">Tarih & Saat <span className="text-destructive">*</span></Label>
                    <Input
                      id="dateTime"
                      type="datetime-local"
                      value={formData.dateTime}
                      onChange={(e) => setFormData({ ...formData, dateTime: e.target.value })}
                      required
                      className="rounded-xl bg-background/50 border-white/10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="durationMin" className="text-sm font-medium">Süre (Dk) <span className="text-destructive">*</span></Label>
                    <Input
                      id="durationMin"
                      type="number"
                      min="15"
                      step="15"
                      value={formData.durationMin}
                      onChange={(e) => setFormData({ ...formData, durationMin: e.target.value })}
                      required
                      className="rounded-xl bg-background/50 border-white/10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm font-medium">Ekstra Not / Konu</Label>
                  <Textarea
                    id="notes"
                    placeholder="Gösterim hakkında kısa bilgiler ekleyin..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="rounded-xl bg-background/50 border-white/10 resize-none h-24"
                  />
                </div>
                <Button type="submit" className="w-full rounded-xl bg-primary hover:bg-primary/90 text-white font-medium py-6 mt-2">
                  Randevuyu Kaydet
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <div className="h-8 w-px bg-border"></div>
          {filteredAppointments.length > 0 && (
            <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
              <SelectTrigger className="w-[130px] rounded-xl border-none bg-transparent shadow-none hover:bg-muted text-sm font-medium transition-colors">
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

      {/* KPI Stats Cards - Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Toplam Kayıt
            </h3>
            <span className="text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full text-xs font-bold">TÜMÜ</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-foreground">{totalAppointments}</div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Planlandı
            </h3>
            <span className="text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full text-xs font-bold">AÇIK</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-blue-500">{scheduledCount}</div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Tamamlandı
            </h3>
            <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full text-xs font-bold">KAPALI</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-emerald-500">{completedCount}</div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4" /> İptal Edildi
            </h3>
            <span className="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full text-xs font-bold">GERİ DÖNDÜ</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-rose-500">{cancelledCount}</div>
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="rounded-3xl border-white/10 shadow-xl bg-card/60 backdrop-blur-2xl overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-background/50 px-6 py-5">
          <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
            <div className="flex items-center gap-3 w-full lg:w-1/3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
              <Input
                placeholder="Müşteri adı veya konu vb ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-2xl border-white/10 bg-background/50 h-12 w-full text-base transition-colors focus-visible:bg-background"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <MultiSelectFilter
                options={statusOptions}
                selectedValues={statusFilters}
                onSelectionChange={setStatusFilters}
                placeholder="Randevu Durumu Seç"
                label="Durum Filtresi"
                className="w-full sm:w-[220px] rounded-2xl h-12 border-white/10 bg-background/50"
              />
              <div className="h-12 border border-white/10 bg-background/50 rounded-2xl px-2 flex items-center">
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

              {(searchTerm || statusFilters.length > 0 || dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  onClick={handleClearFilters}
                  className="rounded-xl h-12 font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4 mr-2" />
                  Sıfırla
                </Button>
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
          ) : appointmentsError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-16 h-16 rounded-3xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Bağlantı Hatası</h3>
              <p className="text-muted-foreground max-w-sm">
                {appointmentsError.message?.includes('permission')
                  ? 'Veritabanı erişim izni reddedildi. Güvenlik kurallarını denetleyin.'
                  : 'Randevu listesi yüklenirken beklenmedik bir sistem hatası belirdi.'}
              </p>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-4 border border-white/5">
                <UserRoundSearch className="h-10 w-10 text-primary/40" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">Kayıt Bulunamadı</h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {searchTerm || statusFilters.length > 0 || dateFrom || dateTo
                  ? 'Filtre kombinasyonunuza uygun sonuç yok.'
                  : 'Sistemde henüz bir randevu aktivitesi yok. Oluşturarak başlayabilirsiniz!'}
              </p>
              {!searchTerm && statusFilters.length === 0 && !dateFrom && !dateTo && (
                <Button onClick={() => setDialogOpen(true)} variant="outline" className="rounded-xl shadow-sm border-white/10 gap-2">
                  <UserPlus className="h-4 w-4" /> Randevu Oluştur
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredAppointments.map((apt, aptIdx) => {
                const customer = customers[apt.customerId];
                const dDate = toDate(apt.dateTime);

                return (
                  <div key={apt.id} className="p-4 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 hover:bg-white/[0.02] transition-all duration-200 animate-fade-in-up" style={{ animationDelay: `${aptIdx * 40}ms` }}>
                    <div className="flex items-center gap-5 w-full lg:w-1/3">
                      <div className="flex-shrink-0 flex flex-col items-center justify-center h-14 w-14 rounded-2xl bg-background border border-border shadow-sm">
                        <span className="text-xs font-semibold text-primary/80 uppercase mb-0.5">{format(dDate, 'MMM')}</span>
                        <span className="text-xl font-bold leading-none text-foreground">{format(dDate, 'dd')}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-[15px] flex items-center gap-2 mb-1">
                          {customer?.name || 'Bilinmeyen Kullanıcı'}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5 whitespace-nowrap"><Phone className="h-3.5 w-3.5" /> {customer?.phone || '-'}</span>
                          <span className="h-1 w-1 rounded-full bg-border"></span>
                          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {format(dDate, 'HH:mm')} ({apt.durationMin}dk)</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-1/3 px-0 lg:px-4">
                      <div className="text-sm border-l-2 border-indigo-500/20 pl-4 py-1 italic text-muted-foreground max-w-md line-clamp-2">
                        {apt.notes && apt.notes.length > 0 ? (
                          `"${apt.notes}"`
                        ) : (
                          <span className="text-muted-foreground/50 not-italic">Ekstra bir not veya başlık düşülmemiş.</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full lg:w-auto lg:justify-end gap-5">
                      <div>
                        {apt.status === 'scheduled' && (
                          <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none">Önümde</Badge>
                        )}
                        {apt.status === 'completed' && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none flex gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Gerçekleşti
                          </Badge>
                        )}
                        {apt.status === 'cancelled' && (
                          <Badge className="bg-rose-500/10 text-rose-500 px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none flex gap-1">
                            <XCircle className="w-3 h-3" /> İptal
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 bg-background shadow-sm border border-border/60 p-1.5 rounded-xl">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                          onClick={() => handleEditClick(apt)}
                          title="Düzenle"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        {apt.status === 'scheduled' && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-500"
                              disabled={updating === apt.id}
                              onClick={() => handleStatusUpdate(apt.id, 'completed')}
                              title="Tamamlandı Olarak İşaretle"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg hover:bg-orange-500/10 hover:text-orange-500"
                              disabled={updating === apt.id}
                              onClick={() => handleStatusUpdate(apt.id, 'cancelled')}
                              title="İptal Et"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg hover:bg-rose-500/10 hover:text-rose-500"
                          onClick={() => setDeleteConfirmId(apt.id)}
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filteredAppointments.length > 0 && (
            <div className="p-4 border-t border-border/50 bg-background/50">
              <PaginationControls
                currentLimit={limit}
                totalItems={totalAvailable}
                filteredItems={filteredAppointments.length}
                onLimitChange={handleLimitChange}
                onLoadMore={handleLoadMore}
                hasMore={hasMore}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-[400px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Randevu Silinecek
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bu randevuyu kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteConfirmId(null)}>
              Vazgeç
            </Button>
            <Button variant="destructive" className="rounded-xl" onClick={handleDeleteConfirmed}>
              <Trash2 className="h-4 w-4 mr-1" />
              Evet, Sil
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Appointment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl border-white/10 shadow-2xl bg-card/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              Randevu Bilgileri Düzenle
            </DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }} className="space-y-5 mt-2">
              <div className="space-y-2">
                <Label htmlFor="edit-dateTime" className="text-sm font-medium">Tarih & Saat <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-dateTime"
                  type="datetime-local"
                  value={editFormData.dateTime}
                  onChange={(e) => setEditFormData({ ...editFormData, dateTime: e.target.value })}
                  required
                  className="rounded-xl border-white/10 bg-background/50 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-durationMin" className="text-sm font-medium">Süre (Dakika) <span className="text-destructive">*</span></Label>
                <div className="relative">
                  <Clock className="absolute top-1/2 left-3 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="edit-durationMin"
                    type="number"
                    min="15"
                    step="15"
                    value={editFormData.durationMin}
                    onChange={(e) => setEditFormData({ ...editFormData, durationMin: e.target.value })}
                    required
                    className="rounded-xl border-white/10 bg-background/50 h-11 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes" className="text-sm font-medium">Randevu Notları</Label>
                <Textarea
                  id="edit-notes"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="rounded-xl border-white/10 bg-background/50 resize-none h-28"
                  placeholder="Buraya müşteri görüşmesi için spesifik detayları girebilirsiniz..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setEditDialogOpen(false)}>
                  Vazgeç
                </Button>
                <Button type="submit" className="rounded-xl bg-primary hover:bg-primary/90">
                  Değişiklikleri Kaydet
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Activity className="h-8 w-8 animate-pulse text-primary" />
      </div>
    }>
      <AppointmentsPageContent />
    </Suspense>
  );
}
