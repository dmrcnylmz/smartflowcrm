'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus, AlertCircle, Users, Search, Mail, Phone as PhoneIcon, Edit, Phone, Calendar, FileText, AlertTriangle, X } from 'lucide-react';
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
  const [limit, setLimit] = useState(50);

  // Update URL params when search changes
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      
      const newUrl = params.toString() ? `?${params.toString()}` : '/customers';
      const currentUrl = window.location.pathname + window.location.search;
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

  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      customer.name.toLowerCase().includes(search) ||
      customer.phone.includes(searchTerm) ||
      (customer.email && customer.email.toLowerCase().includes(search))
    );
  });

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

  function handleExport(format: 'csv' | 'excel' | 'pdf') {
    const exportData = exportCustomers(filteredCustomers);
    const filename = `musteriler-${new Date().toISOString().split('T')[0]}`;
    
    switch (format) {
      case 'csv':
        exportToCSV(exportData, filename);
        break;
      case 'excel':
        exportToExcel(exportData, filename);
        break;
      case 'pdf':
        exportToPDF(exportData, filename, 'Müşteri Listesi');
        break;
    }
    
    toast({
      title: 'Başarılı!',
      description: `${format.toUpperCase()} dosyası indirildi`,
      variant: 'success',
    });
  }

  // Stats
  const totalCustomers = customers.length;
  const customersWithEmail = customers.filter(c => c.email).length;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Müşteriler</h1>
          <p className="text-muted-foreground">Müşteri listesi ve detayları</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Yeni Müşteri
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Müşteri Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">İsim *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefon *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Müşteri</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">E-posta Kayıtlı</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{customersWithEmail}</div>
            <p className="text-xs text-muted-foreground mt-1">
              %{totalCustomers > 0 ? Math.round((customersWithEmail / totalCustomers) * 100) : 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kayıtlı Telefon</CardTitle>
            <PhoneIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Müşteri Listesi</CardTitle>
            <div className="flex items-center gap-2">
              {filteredCustomers.length > 0 && (
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
              {searchTerm && (
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
          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="İsim, telefon veya e-posta ile ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                  <Skeleton className="h-12 flex-1" />
                </div>
              ))}
            </div>
          ) : customersError ? (
            <div className="flex items-center justify-center py-8 text-destructive">
              <AlertCircle className="mr-2 h-5 w-5" />
              <span>
                {customersError.message?.includes('permission') 
                  ? 'Firebase izin hatası. Security rules kontrol edin.'
                  : 'Müşteriler yüklenirken hata oluştu.'}
              </span>
            </div>
          ) : paginatedCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'Arama kriterine uygun müşteri bulunamadı' : 'Henüz müşteri yok'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İsim</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>E-posta</TableHead>
                  <TableHead>Oluşturulma</TableHead>
                  <TableHead>Durum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.map((customer) => (
                  <TableRow 
                    key={customer.id}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => handleCustomerClick(customer)}
                  >
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell>{customer.email || '-'}</TableCell>
                    <TableCell>
                      {format(toDate(customer.createdAt), 'PP', { locale: tr })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">Aktif</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
        </CardContent>
      </Card>

      {/* Müşteri Detay Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">
                {selectedCustomer?.name || 'Müşteri Detayları'}
              </DialogTitle>
              <div className="flex gap-2">
                {!editMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Düzenle
                  </Button>
                )}
                {editMode && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
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
                    <Button
                      size="sm"
                      onClick={handleEditSave}
                    >
                      Kaydet
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6 mt-4">
              {/* Müşteri Bilgileri */}
              <Card>
                <CardHeader>
                  <CardTitle>Müşteri Bilgileri</CardTitle>
                </CardHeader>
                <CardContent>
                  {editMode ? (
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="edit-name">İsim *</Label>
                        <Input
                          id="edit-name"
                          value={editFormData.name}
                          onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-phone">Telefon *</Label>
                        <Input
                          id="edit-phone"
                          value={editFormData.phone}
                          onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-email">E-posta</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={editFormData.email}
                          onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
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
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">İsim</Label>
                        <p className="font-medium">{selectedCustomer.name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Telefon</Label>
                        <p className="font-medium">{selectedCustomer.phone}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">E-posta</Label>
                        <p className="font-medium">{selectedCustomer.email || '-'}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Kayıt Tarihi</Label>
                        <p className="font-medium">
                          {format(toDate(selectedCustomer.createdAt), 'PPp', { locale: tr })}
                        </p>
                      </div>
                      {selectedCustomer.notes && (
                        <div className="col-span-2">
                          <Label className="text-muted-foreground">Notlar</Label>
                          <p className="font-medium">{selectedCustomer.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* İstatistikler */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Çağrılar</p>
                        <p className="text-2xl font-bold">{customerHistory.calls.length}</p>
                      </div>
                      <Phone className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Randevular</p>
                        <p className="text-2xl font-bold">{customerHistory.appointments.length}</p>
                      </div>
                      <Calendar className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Şikayetler</p>
                        <p className="text-2xl font-bold">{customerHistory.complaints.length}</p>
                      </div>
                      <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Bilgi Talepleri</p>
                        <p className="text-2xl font-bold">{customerHistory.infoRequests.length}</p>
                      </div>
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Geçmiş */}
              {loadingHistory ? (
                <div className="text-center py-8">
                  <Skeleton className="h-8 w-full mb-4" />
                  <Skeleton className="h-8 w-full mb-4" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Son Çağrılar */}
                  {customerHistory.calls.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Phone className="h-5 w-5" />
                          Son Çağrılar
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {customerHistory.calls.slice(0, 5).map((call) => (
                            <div key={call.id} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <p className="text-sm font-medium">
                                  {format(toDate(call.timestamp || call.createdAt), 'PPp', { locale: tr })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {call.intent || 'Intent yok'} • {call.durationSec || 0}s
                                </p>
                              </div>
                              <Badge variant={call.status === 'answered' ? 'default' : 'destructive'}>
                                {call.status === 'answered' ? 'Yanıtlandı' : 'Kaçırıldı'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Randevular */}
                  {customerHistory.appointments.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          Randevular
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {customerHistory.appointments.slice(0, 5).map((apt) => (
                            <div key={apt.id} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <p className="text-sm font-medium">
                                  {format(toDate(apt.dateTime), 'PPp', { locale: tr })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {apt.durationMin} dk • {apt.notes || 'Not yok'}
                                </p>
                              </div>
                              <Badge variant={apt.status === 'scheduled' ? 'default' : apt.status === 'completed' ? 'default' : 'secondary'}>
                                {apt.status === 'scheduled' ? 'Planlandı' : apt.status === 'completed' ? 'Tamamlandı' : 'İptal'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Şikayetler */}
                  {customerHistory.complaints.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5" />
                          Şikayetler
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {customerHistory.complaints.slice(0, 5).map((complaint) => (
                            <div key={complaint.id} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <p className="text-sm font-medium">
                                  {format(toDate(complaint.createdAt), 'PPp', { locale: tr })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {complaint.category || 'Kategori yok'} • {complaint.description || 'Açıklama yok'}
                                </p>
                              </div>
                              <Badge variant={complaint.status === 'resolved' ? 'default' : 'destructive'}>
                                {complaint.status === 'resolved' ? 'Çözüldü' : complaint.status === 'investigating' ? 'İşlemde' : 'Açık'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Bilgi Talepleri */}
                  {customerHistory.infoRequests.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <FileText className="h-5 w-5" />
                          Bilgi Talepleri
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {customerHistory.infoRequests.slice(0, 5).map((req) => (
                            <div key={req.id} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <p className="text-sm font-medium">
                                  {format(toDate(req.createdAt), 'PPp', { locale: tr })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {req.topic || 'Konu yok'} • {req.details || 'Detay yok'}
                                </p>
                              </div>
                              <Badge variant={req.status === 'answered' ? 'default' : 'secondary'}>
                                {req.status === 'answered' ? 'Yanıtlandı' : req.status === 'closed' ? 'Kapatıldı' : 'Beklemede'}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Boş Durum */}
                  {customerHistory.calls.length === 0 &&
                   customerHistory.appointments.length === 0 &&
                   customerHistory.complaints.length === 0 &&
                   customerHistory.infoRequests.length === 0 && (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        Bu müşteri için henüz aktivite kaydı yok
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-8">Yükleniyor...</div>}>
      <CustomersPageContent />
    </Suspense>
  );
}

