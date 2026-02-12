'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Search, FileText, User, X } from 'lucide-react';
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
  // Note: useComplaints doesn't support limitCount yet, we'll filter client-side
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

  // Pagination - client-side filtering, so we slice the filtered results
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
        description: `Şikayet durumu "${statusLabels[newStatus]}" olarak güncellendi`,
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
        description: 'Notlar kaydedildi',
        variant: 'success',
      });
    } catch (error) {
      console.error('Notes save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Notlar kaydedilirken hata oluştu';
      toast({
        title: 'Hata',
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
  const resolvedComplaints = allComplaints.filter(c => c.status === 'resolved').length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Şikayetler</h1>
        <p className="text-muted-foreground">Müşteri şikayetlerini yönetin ve takip edin</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalComplaints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Açık</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{openComplaints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">İşlemde</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{investigatingComplaints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Çözüldü</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{resolvedComplaints}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Şikayet Listesi</CardTitle>
            <div className="flex items-center gap-2">
              {filteredComplaints.length > 0 && (
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
              {(searchTerm || statusFilters.length > 0 || categoryFilters.length > 0 || dateFrom || dateTo) && (
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
                  placeholder="Müşteri, kategori veya açıklama ara..."
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
              {categoryOptions.length > 0 && (
                <MultiSelectFilter
                  options={categoryOptions}
                  selectedValues={categoryFilters}
                  onSelectionChange={setCategoryFilters}
                  placeholder="Kategori seçin..."
                  label="Kategori"
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
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8 text-destructive">
              <AlertCircle className="mr-2 h-5 w-5" />
              <span>
                {error.message?.includes('permission') 
                  ? 'Firebase izin hatası. Security rules kontrol edin.'
                  : 'Şikayetler yüklenirken hata oluştu.'}
              </span>
            </div>
          ) : paginatedComplaints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || statusFilters.length > 0 || categoryFilters.length > 0 || dateFrom || dateTo
                ? 'Filtre kriterlerine uygun şikayet bulunamadı' 
                : 'Henüz şikayet yok'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedComplaints.map((complaint) => {
                  const customer = customers[complaint.customerId];
                  return (
                    <TableRow 
                      key={complaint.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => handleComplaintClick(complaint)}
                    >
                      <TableCell>
                        {format(toDate(complaint.createdAt), 'PPp', { locale: tr })}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer?.name || 'Bilinmeyen'}</div>
                          <div className="text-sm text-muted-foreground">{customer?.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{complaint.category || 'Kategori Yok'}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate">{complaint.description || '-'}</div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            complaint.status === 'resolved' ? 'default' : 
                            complaint.status === 'investigating' ? 'secondary' : 
                            'destructive'
                          }
                        >
                          {complaint.status === 'open' ? 'Açık' :
                           complaint.status === 'investigating' ? 'İşlemde' :
                           'Çözüldü'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {complaint.status === 'open' && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updating === complaint.id}
                              onClick={() => handleStatusUpdate(complaint.id, 'investigating')}
                            >
                              Başlat
                            </Button>
                          )}
                          {complaint.status === 'investigating' && (
                            <Button
                              size="sm"
                              disabled={updating === complaint.id}
                              onClick={() => handleStatusUpdate(complaint.id, 'resolved')}
                            >
                              Çöz
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!loading && paginatedComplaints.length > 0 && (
            <PaginationControls
              currentLimit={limit}
              totalItems={totalAvailable}
              filteredItems={filteredComplaints.length}
              onLimitChange={handleLimitChange}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
            />
          )}
        </CardContent>
      </Card>

      {/* Şikayet Detay Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Şikayet Detayları</DialogTitle>
          </DialogHeader>

          {selectedComplaint && (
            <div className="space-y-6 mt-4">
              {/* Şikayet Bilgileri */}
              <Card>
                <CardHeader>
                  <CardTitle>Şikayet Bilgileri</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Tarih</Label>
                      <p className="font-medium">
                        {format(toDate(selectedComplaint.createdAt), 'PPpp', { locale: tr })}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Durum</Label>
                      <p className="font-medium">
                        <Badge 
                          variant={
                            selectedComplaint.status === 'resolved' ? 'default' : 
                            selectedComplaint.status === 'investigating' ? 'secondary' : 
                            'destructive'
                          }
                        >
                          {selectedComplaint.status === 'open' ? 'Açık' :
                           selectedComplaint.status === 'investigating' ? 'İşlemde' :
                           selectedComplaint.status === 'resolved' ? 'Çözüldü' :
                           'Kapatıldı'}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Kategori</Label>
                      <p className="font-medium">{selectedComplaint.category || 'Kategori Yok'}</p>
                    </div>
                    {selectedComplaint.resolvedAt && (
                      <div>
                        <Label className="text-muted-foreground">Çözüm Tarihi</Label>
                        <p className="font-medium">
                          {format(toDate(selectedComplaint.resolvedAt), 'PPpp', { locale: tr })}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <Label className="text-muted-foreground">Açıklama</Label>
                    <p className="font-medium mt-2 bg-muted p-3 rounded">
                      {selectedComplaint.description || 'Açıklama yok'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Müşteri Bilgileri */}
              {selectedCustomer ? (
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

              {/* Notlar */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notlar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="complaint-notes">Şikayet Notları</Label>
                    <Textarea
                      id="complaint-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Şikayet hakkında notlar ekleyin..."
                      rows={6}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                    >
                      {savingNotes ? 'Kaydediliyor...' : 'Notları Kaydet'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ComplaintsPage() {
  return (
    <Suspense fallback={<div className="p-8">Yükleniyor...</div>}>
      <ComplaintsPageContent />
    </Suspense>
  );
}

