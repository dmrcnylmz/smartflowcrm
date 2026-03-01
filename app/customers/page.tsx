'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { exportCustomers, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { Plus, AlertCircle, Users, Search, Mail, Phone as PhoneIcon, Edit, Phone, Calendar, FileText, AlertTriangle, X, ChevronRight, Activity, Clock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { createCustomer, getCallLogs, getAppointments, getComplaints, getInfoRequests, updateCustomer } from '@/lib/firebase/db';
import { useCustomers } from '@/lib/firebase/hooks';
import { useToast } from '@/components/ui/toast';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import type { Customer, CallLog, Appointment, Complaint, InfoRequest } from '@/lib/firebase/types';

function CustomersPageContent() {
  const { data: customers, loading, error: customersError } = useCustomers();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<{
    calls: CallLog[];
    appointments: Appointment[];
    complaints: Complaint[];
    infoRequests: InfoRequest[];
  }>({
    calls: [],
    appointments: [],
    complaints: [],
    infoRequests: [],
  });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [limit, setLimit] = useState(50);

  // Update URL params when search changes
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);

      const newUrl = params.toString() ? `?${params.toString()}` : '/customers';
      const currentUrl = window.location.pathname + window.location.search;
      // In Next 13 App Route this works via window history push without reload
      if (currentUrl !== newUrl) {
        window.history.replaceState({}, '', newUrl);
      }
    } catch (error) {
      console.warn('URL update error:', error);
    }
  }, [searchTerm]);

  function handleClearFilters() {
    setSearchTerm('');
  }

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [editFormData, setEditFormData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createCustomer({
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        notes: formData.notes || undefined,
      });
      setFormData({ name: '', phone: '', email: '', notes: '' });
      setDialogOpen(false);
      toast({
        title: 'Başarılı!',
        description: `${formData.name} müşteri olarak eklendi`,
        variant: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.error('Customer create error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Müşteri oluşturulurken hata oluştu';
      toast({
        title: 'Hata',
        description: errorMessage,
        variant: 'error',
        duration: 5000,
      });
    }
  }

  async function handleCustomerClick(customer: Customer) {
    setSelectedCustomer(customer);
    setEditFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      notes: customer.notes || '',
    });
    setDetailDialogOpen(true);
    setLoadingHistory(true);

    try {
      const [calls, appointments, complaints, infoRequests] = await Promise.all([
        getCallLogs({ customerId: customer.id, limitCount: 10 }),
        getAppointments({ customerId: customer.id }),
        getComplaints({ customerId: customer.id }),
        getInfoRequests({ customerId: customer.id }),
      ]);

      setCustomerHistory({ calls, appointments, complaints, infoRequests });
    } catch (error) {
      console.error('History load error:', error);
      toast({
        title: 'Uyarı',
        description: 'Müşteri geçmişi yüklenirken hata oluştu',
        variant: 'warning',
      });
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleEditSave() {
    if (!selectedCustomer) return;

    try {
      await updateCustomer(selectedCustomer.id, {
        name: editFormData.name,
        phone: editFormData.phone,
        email: editFormData.email || undefined,
        notes: editFormData.notes || undefined,
      });
      setEditMode(false);

      // Update local state optimistic
      setSelectedCustomer({
        ...selectedCustomer,
        name: editFormData.name,
        phone: editFormData.phone,
        email: editFormData.email || undefined,
        notes: editFormData.notes || undefined,
      });

      toast({
        title: 'Başarılı!',
        description: 'Müşteri bilgileri güncellendi',
        variant: 'success',
      });
    } catch (error) {
      console.error('Customer update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Müşteri güncellenirken hata oluştu';
      toast({
        title: 'Hata',
        description: errorMessage,
        variant: 'error',
      });
    }
  }

  // Filter customers (using debounced search for performance)
  const filteredCustomers = useMemo(() => customers.filter(customer => {
    if (!debouncedSearch) return true;
    const search = debouncedSearch.toLowerCase();
    return (
      customer.name.toLowerCase().includes(search) ||
      customer.phone.includes(debouncedSearch) ||
      (customer.email && customer.email.toLowerCase().includes(search))
    );
  }), [customers, debouncedSearch]);

  // Pagination
  const paginatedCustomers = filteredCustomers.slice(0, limit);
  const hasMore = filteredCustomers.length > limit;
  const totalAvailable = customers.length;

  function handleLoadMore() {
    setLimit(prev => Math.min(prev + 50, 500));
  }

  function handleLimitChange(newLimit: number) {
    setLimit(newLimit);
  }

  async function handleExport(format: 'csv' | 'excel' | 'pdf') {
    try {
      const exportData = exportCustomers(filteredCustomers);
      const filename = `musteriler-${new Date().toISOString().split('T')[0]}`;

      switch (format) {
        case 'csv':
          exportToCSV(exportData, filename);
          break;
        case 'excel':
          await exportToExcel(exportData, filename);
          break;
        case 'pdf':
          await exportToPDF(exportData, filename, 'Müşteri Listesi');
          break;
      }

      toast({
        title: 'Başarılı!',
        description: `${format.toUpperCase()} dosyası indirildi`,
        variant: 'success',
      });
    } catch {
      toast({ title: 'Hata', description: 'Dışa aktarma başarısız oldu.', variant: 'destructive' });
    }
  }

  // Stats
  const totalCustomers = customers.length;
  const customersWithEmail = customers.filter(c => c.email).length;
  const newCustomersThisWeek = customers.filter(c => {
    const diff = new Date().getTime() - toDate(c.createdAt).getTime();
    return diff < 1000 * 60 * 60 * 24 * 7;
  }).length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Users className="h-7 w-7 md:h-8 md:w-8 text-primary" />
            Müşteri Portföyü
          </h1>
          <p className="text-muted-foreground mt-2">
            Müşterilerinizi yönetin, etkileşim geçmişlerini inceleyin.
          </p>
        </div>
        <div className="flex gap-3">
          {filteredCustomers.length > 0 && (
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

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow gap-2">
                <Plus className="h-4 w-4" />
                Yeni Müşteri
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Yeni Müşteri Ekle</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">İsim Soyisim *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Müşteri Adı"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => {
                      // Only allow digits, +, spaces, parens, dashes
                      const sanitized = e.target.value.replace(/[^\d+\s()-]/g, '');
                      setFormData({ ...formData, phone: sanitized });
                    }}
                    required
                    pattern="[\+]?[\d\s()-]{7,20}"
                    title="Geçerli bir telefon numarası girin (ör: +905554443322)"
                    placeholder="+905554443322"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-posta</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value.trim() })}
                    placeholder="ornek@mail.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Özel Notlar</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Müşteri için kısa bir not ekleyin..."
                    className="min-h-[100px]"
                  />
                </div>
                <Button type="submit" className="w-full mt-4 rounded-xl">
                  Kaydet
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-2xl border-none shadow-sm bg-blue-50/50 dark:bg-blue-950/20 animate-fade-in-up opacity-0" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-300">Toplam Müşteri</CardTitle>
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">{totalCustomers}</div>
            <p className="text-xs text-blue-600/80 dark:text-blue-400 mt-2 font-medium flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Giderek büyüyen portföy
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-indigo-50/50 dark:bg-indigo-950/20 animate-fade-in-up opacity-0" style={{ animationDelay: '220ms', animationFillMode: 'forwards' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-indigo-800 dark:text-indigo-300">Yeni Müşteriler</CardTitle>
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
              <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">+{newCustomersThisWeek}</div>
            <p className="text-xs text-indigo-600/80 dark:text-indigo-400 mt-2 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Son 7 gün içerisinde eklendi
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-none shadow-sm bg-emerald-50/50 dark:bg-emerald-950/20 animate-fade-in-up opacity-0" style={{ animationDelay: '340ms', animationFillMode: 'forwards' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800 dark:text-emerald-300">İletişim Kalitesi</CardTitle>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900 rounded-lg">
              <Mail className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
              %{totalCustomers > 0 ? Math.round((customersWithEmail / totalCustomers) * 100) : 0}
            </div>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400 mt-2 font-medium">
              E-posta bilgisi olan müşterilerin oranı
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl overflow-hidden border-border/50 shadow-sm animate-fade-in-up opacity-0" style={{ animationDelay: '460ms', animationFillMode: 'forwards' }}>
        <div className="p-4 border-b bg-muted/20 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="İsim, telefon veya e-posta ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-xl bg-background border-border/60 focus-visible:ring-primary/20"
            />
          </div>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              Temizle
            </Button>
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
          ) : customersError ? (
            <div className="flex flex-col items-center justify-center py-12 text-destructive">
              <AlertCircle className="mb-3 h-10 w-10 opacity-80" />
              <span className="font-medium text-lg">
                {customersError.message?.includes('permission')
                  ? 'Erişim yetkiniz bulunmamaktadır.'
                  : 'Müşteriler yüklenirken hata oluştu.'}
              </span>
            </div>
          ) : paginatedCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center">
              <Users className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium text-foreground">
                {searchTerm ? 'Müşteri Bulunamadı' : 'Henüz Müşteri Yok'}
              </p>
              <p className="text-sm mt-1 max-w-sm">
                {searchTerm ? 'Arama kriterlerinize uygun sonuç bulamadık. Lütfen farklı kelimeler deneyin.' : 'Sisteme kayıtlı müşteri yok. Sağ üst köşeden "Yeni Müşteri" butonuna tıklayarak ekleme yapabilirsiniz.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-foreground/80 pl-6 shrink-0 min-w-[200px]">Müşteri Profil</TableHead>
                      <TableHead className="font-semibold text-foreground/80 shrink-0 min-w-[150px]">İletişim Türü</TableHead>
                      <TableHead className="font-semibold text-foreground/80 hidden md:table-cell">Kayıt Tarihi</TableHead>
                      <TableHead className="font-semibold text-foreground/80 text-right pr-6">Aksiyon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow
                        key={customer.id}
                        className="cursor-pointer group hover:bg-muted/30 transition-colors focus-visible:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
                        tabIndex={0}
                        role="button"
                        aria-label={`${customer.name} müşteri detaylarını görüntüle`}
                        onClick={() => handleCustomerClick(customer)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleCustomerClick(customer);
                          }
                        }}
                      >
                        <TableCell className="pl-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{customer.name}</span>
                            <span className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{customer.notes || 'Not eklenmemiş.'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1.5">
                            <span className="text-sm flex items-center gap-2 text-foreground break-all">
                              <PhoneIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                              {customer.phone}
                            </span>
                            {customer.email && (
                              <span className="text-xs flex items-center gap-2 text-muted-foreground max-w-[200px] truncate">
                                <Mail className="h-3 w-3 shrink-0" />
                                {customer.email}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground/80 text-sm">
                          {format(toDate(customer.createdAt), 'dd MMM yyyy', { locale: tr })}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t bg-muted/10 flex justify-center">
                {!loading && paginatedCustomers.length > 0 && (
                  <PaginationControls
                    currentLimit={limit}
                    totalItems={totalAvailable}
                    filteredItems={filteredCustomers.length}
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

      {/* Modern Customer Detail Drawer-like Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between pb-4 border-b border-border/40">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                  {selectedCustomer?.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold">
                    {selectedCustomer?.name || 'Müşteri Detayları'}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">Müşteri Profili ve Geçmişi</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!editMode && (
                  <Button
                    variant="outline"
                    className="rounded-xl shadow-sm gap-2"
                    onClick={() => setEditMode(true)}
                  >
                    <Edit className="h-4 w-4" />
                    Bilgileri Düzenle
                  </Button>
                )}
                {editMode && (
                  <>
                    <Button
                      variant="ghost"
                      className="rounded-xl"
                      onClick={() => {
                        setEditMode(false);
                        if (selectedCustomer) {
                          setEditFormData({
                            name: selectedCustomer.name,
                            phone: selectedCustomer.phone,
                            email: selectedCustomer.email || '',
                            notes: selectedCustomer.notes || '',
                          });
                        }
                      }}
                    >
                      İptal
                    </Button>
                    <Button className="rounded-xl shadow-sm shadow-primary/20" onClick={handleEditSave}>
                      Kaydet
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          {selectedCustomer && (
            <div className="flex flex-col md:flex-row h-full max-h-[80vh] overflow-hidden">
              {/* Left Side: Info */}
              <div className="w-full md:w-1/3 bg-muted/10 p-6 overflow-y-auto border-r border-border/40">
                <div className="space-y-6">
                  {editMode ? (
                    <div className="space-y-4 bg-background p-4 rounded-xl shadow-sm border border-border/50">
                      <div>
                        <Label htmlFor="edit-name" className="text-xs text-muted-foreground">İsim *</Label>
                        <Input
                          id="edit-name"
                          className="mt-1"
                          value={editFormData.name}
                          onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-phone" className="text-xs text-muted-foreground">Telefon *</Label>
                        <Input
                          id="edit-phone"
                          type="tel"
                          className="mt-1"
                          value={editFormData.phone}
                          onChange={(e) => {
                            const sanitized = e.target.value.replace(/[^\d+\s()-]/g, '');
                            setEditFormData({ ...editFormData, phone: sanitized });
                          }}
                          required
                          pattern="[\+]?[\d\s()-]{7,20}"
                          title="Geçerli bir telefon numarası girin"
                          autoComplete="tel"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-email" className="text-xs text-muted-foreground">E-posta</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          className="mt-1"
                          value={editFormData.email}
                          onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-notes" className="text-xs text-muted-foreground">Notlar</Label>
                        <Textarea
                          id="edit-notes"
                          className="mt-1 min-h-[120px]"
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Telefon</p>
                            <p className="text-foreground font-medium mt-0.5">{selectedCustomer.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">E-posta</p>
                            <p className="text-foreground font-medium mt-0.5">{selectedCustomer.email || 'Belirtilmemiş'}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Sisteme Kayıt Tarihi</p>
                            <p className="text-foreground font-medium mt-0.5">
                              {format(toDate(selectedCustomer.createdAt), 'dd MMMM yyyy', { locale: tr })}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" /> Özel Not
                        </p>
                        {selectedCustomer.notes ? (
                          <p className="text-sm text-foreground/80 leading-relaxed bg-background p-3 rounded-xl border shadow-sm">{selectedCustomer.notes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Müşteri için eklenmiş bir not bulunmuyor.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Activity */}
              <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-background bg-grid-slate-100/30 dark:bg-grid-slate-900/30">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Müşteri Aktivite Geçmişi
                </h3>

                {loadingHistory ? (
                  <div className="space-y-4">
                    <Skeleton className="h-[80px] w-full rounded-xl" />
                    <Skeleton className="h-[80px] w-full rounded-xl" />
                    <Skeleton className="h-[80px] w-full rounded-xl" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary Badges */}
                    <div className="flex flex-wrap gap-2">
                      {(customerHistory.calls.length > 0) && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-none px-3 py-1">
                          {customerHistory.calls.length} Çağrı
                        </Badge>
                      )}
                      {(customerHistory.appointments.length > 0) && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-none px-3 py-1">
                          {customerHistory.appointments.length} Randevu
                        </Badge>
                      )}
                      {(customerHistory.complaints.length > 0) && (
                        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-none px-3 py-1">
                          {customerHistory.complaints.length} Şikayet
                        </Badge>
                      )}
                      {(customerHistory.infoRequests.length > 0) && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-none px-3 py-1">
                          {customerHistory.infoRequests.length} Talep
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Appointments First */}
                      {customerHistory.appointments.length > 0 && customerHistory.appointments.map(apt => (
                        <div key={apt.id} className="relative pl-6 pb-2 before:content-[''] before:absolute before:left-[11px] before:top-6 before:bottom-[-8px] before:w-[2px] before:bg-border last:before:hidden">
                          <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center border-2 border-background z-10 shadow-sm">
                            <Calendar className="h-3 w-3" />
                          </div>
                          <div className="bg-card border shadow-sm rounded-xl p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold text-sm">Randevu: {apt.notes || 'Randevu Oluşturuldu'}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{format(toDate(apt.dateTime), 'dd MMMM yyyy HH:mm', { locale: tr })} ({apt.durationMin} dk)</p>
                              </div>
                              <Badge variant={apt.status === 'scheduled' ? 'default' : apt.status === 'completed' ? 'secondary' : 'destructive'} className="shadow-none">
                                {apt.status === 'scheduled' ? 'Planlandı' : apt.status === 'completed' ? 'Tamamlandı' : 'İptal'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Calls */}
                      {customerHistory.calls.length > 0 && customerHistory.calls.map(call => (
                        <div key={call.id} className="relative pl-6 pb-2 before:content-[''] before:absolute before:left-[11px] before:top-6 before:bottom-[-8px] before:w-[2px] before:bg-border last:before:hidden">
                          <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border-2 border-background z-10 shadow-sm">
                            <Phone className="h-3 w-3" />
                          </div>
                          <div className="bg-card border shadow-sm rounded-xl p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-sm">Telefon Görüşmesi</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{format(toDate(call.timestamp || call.createdAt), 'dd MMMM yyyy HH:mm', { locale: tr })}</p>
                                {call.intent && <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1"><Badge variant="outline" className="text-[10px] h-5">{call.intent}</Badge></p>}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={call.status === 'answered' ? 'default' : 'destructive'} className="shadow-none bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300">
                                  {call.status === 'answered' ? 'Yanıtlandı' : 'Ulaşılamadı'}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-medium">{call.durationSec || 0} saniye</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Complaints */}
                      {customerHistory.complaints.length > 0 && customerHistory.complaints.map(complaint => (
                        <div key={complaint.id} className="relative pl-6 pb-2 before:content-[''] before:absolute before:left-[11px] before:top-6 before:bottom-[-8px] before:w-[2px] before:bg-border last:before:hidden">
                          <div className="absolute left-0 top-1 h-6 w-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center border-2 border-background z-10 shadow-sm">
                            <AlertTriangle className="h-3 w-3" />
                          </div>
                          <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 shadow-sm rounded-xl p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="font-semibold text-sm text-red-900 dark:text-red-300">Şikayet: {complaint.category}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{format(toDate(complaint.createdAt), 'dd MMMM yyyy HH:mm', { locale: tr })}</p>
                              </div>
                              <Badge variant={complaint.status === 'resolved' ? 'outline' : 'destructive'} className="shadow-none">
                                {complaint.status === 'resolved' ? 'Çözüldü' : complaint.status === 'investigating' ? 'İşlemde' : 'Açık'}
                              </Badge>
                            </div>
                            <p className="text-sm mt-3 text-red-800/80 dark:text-red-200/80 italic">"{complaint.description}"</p>
                          </div>
                        </div>
                      ))}


                      {/* Empty State */}
                      {customerHistory.calls.length === 0 &&
                        customerHistory.appointments.length === 0 &&
                        customerHistory.complaints.length === 0 &&
                        customerHistory.infoRequests.length === 0 && (
                          <div className="text-center py-12 px-4 rounded-xl border border-dashed border-border/60 bg-muted/10">
                            <Clock className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
                            <p className="text-sm font-medium text-foreground">Aktivite Geçmişi Boş</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[250px] mx-auto">Bu müşteriyle henüz herhangi bir işlem (çağrı, randevu, şikayet) kaydedilmemiş.</p>
                          </div>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomersPageSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-5 w-80 rounded-lg" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-[140px] rounded-xl" />
          <Skeleton className="h-10 w-[140px] rounded-xl" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/30 p-6 space-y-3 bg-muted/10 animate-fade-in-up opacity-0"
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'forwards' }}
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-9 w-20 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
          </div>
        ))}
      </div>

      {/* Customer table skeleton */}
      <div className="rounded-2xl border border-border/30 overflow-hidden bg-card/50">
        {/* Search bar skeleton */}
        <div className="p-4 border-b bg-muted/20">
          <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
        </div>
        {/* Table rows skeleton */}
        <div className="p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 animate-fade-in-up opacity-0"
              style={{ animationDelay: `${300 + i * 80}ms`, animationFillMode: 'forwards' }}
            >
              <div className="flex-[2] space-y-1.5">
                <Skeleton className="h-4 w-36 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-3 w-36 rounded" />
              </div>
              <Skeleton className="h-4 w-24 rounded hidden md:block flex-1" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<CustomersPageSkeleton />}>
      <CustomersPageContent />
    </Suspense>
  );
}
