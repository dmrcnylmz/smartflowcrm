'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MultiSelectFilter, type FilterOption } from '@/components/ui/multi-select-filter';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { exportAppointments, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { Plus, AlertCircle, Calendar as CalendarIcon, Clock, CheckCircle2, XCircle, Search, Edit, Trash2, X } from 'lucide-react';
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
    { value: 'cancelled', label: 'İptal' },
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
      description: `${format.toUpperCase()} dosyası indirildi`,
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
        description: `${customer?.name || 'Müşteri'} için randevu oluşturuldu`,
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
        description: `Randevu durumu "${statusLabels[newStatus]}" olarak güncellendi`,
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

  async function handleDelete(appointmentId: string) {
    if (!confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) return;

    try {
      await deleteAppointment(appointmentId);
      toast({
        title: 'Başarılı!',
        description: 'Randevu silindi',
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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Randevular</h1>
          <p className="text-muted-foreground">Randevu yönetimi ve takvimi</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Randevu
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Yeni Randevu Oluştur</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="customerId">Müşteri *</Label>
                <Select value={formData.customerId} onValueChange={(value) => setFormData({ ...formData, customerId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Müşteri seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCustomers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} - {customer.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dateTime">Tarih & Saat *</Label>
                <Input
                  id="dateTime"
                  type="datetime-local"
                  value={formData.dateTime}
                  onChange={(e) => setFormData({ ...formData, dateTime: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="durationMin">Süre (dakika) *</Label>
                <Input
                  id="durationMin"
                  type="number"
                  min="15"
                  step="15"
                  value={formData.durationMin}
                  onChange={(e) => setFormData({ ...formData, durationMin: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="notes">Notlar</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                Oluştur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAppointments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planlandı</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{scheduledCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamamlandı</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">İptal</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{cancelledCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Randevu Listesi</CardTitle>
            <div className="flex items-center gap-2">
              {filteredAppointments.length > 0 && (
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
              {(searchTerm || statusFilters.length > 0 || dateFrom || dateTo) && (
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
                  placeholder="Müşteri adı veya not ara..."
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
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                </div>
              ))}
            </div>
          ) : appointmentsError ? (
            <div className="flex items-center justify-center py-8 text-destructive">
              <AlertCircle className="mr-2 h-5 w-5" />
              <span>
                {appointmentsError.message?.includes('permission')
                  ? 'Firebase izin hatası. Security rules kontrol edin.'
                  : 'Randevular yüklenirken hata oluştu.'}
              </span>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilters.length > 0 || dateFrom || dateTo
                ? 'Filtre kriterlerine uygun randevu bulunamadı'
                : 'Henüz randevu yok'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih & Saat</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Süre</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Notlar</TableHead>
                  <TableHead>İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAppointments.map((apt) => {
                  const customer = customers[apt.customerId];
                  return (
                    <TableRow key={apt.id}>
                      <TableCell>
                        {format(toDate(apt.dateTime), 'PPp', { locale: tr })}
                      </TableCell>
                      <TableCell>{customer?.name || 'Bilinmeyen'}</TableCell>
                      <TableCell>{apt.durationMin} dk</TableCell>
                      <TableCell>
                        <Badge variant={apt.status === 'scheduled' ? 'default' : 'secondary'}>
                          {apt.status === 'scheduled' ? 'Planlandı' : apt.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {apt.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditClick(apt)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {apt.status === 'scheduled' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updating === apt.id}
                                onClick={() => handleStatusUpdate(apt.id, 'completed')}
                              >
                                Tamamla
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={updating === apt.id}
                                onClick={() => handleStatusUpdate(apt.id, 'cancelled')}
                              >
                                İptal
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(apt.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!loading && filteredAppointments.length > 0 && (
            <PaginationControls
              currentLimit={limit}
              totalItems={totalAvailable}
              filteredItems={filteredAppointments.length}
              onLimitChange={handleLimitChange}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
            />
          )}
        </CardContent>
      </Card>

      {/* Edit Appointment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Randevu Düzenle</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-dateTime">Tarih & Saat *</Label>
                  <Input
                    id="edit-dateTime"
                    type="datetime-local"
                    value={editFormData.dateTime}
                    onChange={(e) => setEditFormData({ ...editFormData, dateTime: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-durationMin">Süre (dakika) *</Label>
                  <Input
                    id="edit-durationMin"
                    type="number"
                    min="15"
                    step="15"
                    value={editFormData.durationMin}
                    onChange={(e) => setEditFormData({ ...editFormData, durationMin: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-notes">Notlar</Label>
                  <Textarea
                    id="edit-notes"
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                    İptal
                  </Button>
                  <Button type="submit">
                    Kaydet
                  </Button>
                </div>
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
    <Suspense fallback={<div className="p-8">Yükleniyor...</div>}>
      <AppointmentsPageContent />
    </Suspense>
  );
}

