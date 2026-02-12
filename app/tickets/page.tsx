'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileText, MessageSquare, AlertTriangle, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useInfoRequests, useComplaints } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import type { Customer, InfoRequest, Complaint } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { toDate } from '@/lib/utils/date-helpers';
import { Suspense } from 'react';

function TicketsPageContent() {
  const { data: infoRequests, loading: infoLoading, error: infoError } = useInfoRequests();
  const { data: complaints, loading: complaintsLoading, error: complaintsError } = useComplaints();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  // Update URL params when search changes
  useEffect(() => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      
      const newUrl = params.toString() ? `?${params.toString()}` : '/tickets';
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

  // Load customer details for all tickets
  useEffect(() => {
      const allCustomerIds = [
      ...extractCustomerIds(infoRequests),
      ...extractCustomerIds(complaints),
      ];
    const uniqueIds = Array.from(new Set(allCustomerIds));
    
    if (uniqueIds.length > 0) {
      getCustomersBatch(uniqueIds)
        .then((customerMap) => {
      setCustomers(customerMap);
        })
        .catch((err: unknown) => {
          console.warn('Customer batch load error:', err);
        });
    }
  }, [infoRequests, complaints]);

  const getStatusBadge = (status: string) => {
    type BadgeVariant = 'default' | 'destructive' | 'secondary' | 'outline';
    interface StatusConfig {
      variant: BadgeVariant;
      label: string;
    }
    
    const variants: Record<string, StatusConfig> = {
      open: { variant: 'destructive', label: 'Açık' },
      in_progress: { variant: 'default', label: 'İşleniyor' },
      investigating: { variant: 'default', label: 'İnceleniyor' },
      resolved: { variant: 'secondary', label: 'Çözüldü' },
    };
    const config = variants[status] || { variant: 'secondary' as BadgeVariant, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // Filter info requests
  const filteredInfoRequests = infoRequests.filter((req: InfoRequest) => {
    if (!searchTerm) return true;
    const customer = req.customerId ? customers[req.customerId] : undefined;
    const customerName = customer?.name || '';
    const search = searchTerm.toLowerCase();
    return (
      customerName.toLowerCase().includes(search) ||
      (req.topic && req.topic.toLowerCase().includes(search)) ||
      (req.details && req.details.toLowerCase().includes(search))
    );
  });

  // Filter complaints
  const filteredComplaints = complaints.filter((comp: Complaint) => {
    if (!searchTerm) return true;
    const customer = customers[comp.customerId];
    const customerName = customer?.name || '';
    const search = searchTerm.toLowerCase();
    return (
      customerName.toLowerCase().includes(search) ||
      comp.category.toLowerCase().includes(search) ||
      comp.description.toLowerCase().includes(search)
    );
  });

  // Stats
  const totalInfoRequests = infoRequests.length;
  const pendingInfoRequests = infoRequests.filter(r => r.status === 'pending').length;
  const totalComplaints = complaints.length;
  const openComplaints = complaints.filter(c => c.status === 'open').length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Biletler</h1>
        <p className="text-muted-foreground">Bilgi talepleri ve şikayet yönetimi</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bilgi Talepleri</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInfoRequests}</div>
            <p className="text-xs text-muted-foreground mt-1">Bekleyen: {pendingInfoRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Şikayetler</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalComplaints}</div>
            <p className="text-xs text-muted-foreground mt-1">Açık: {openComplaints}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Toplam Bilet</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInfoRequests + totalComplaints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bekleyen İşlem</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{pendingInfoRequests + openComplaints}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">
            Bilgi Talepleri ({totalInfoRequests})
          </TabsTrigger>
          <TabsTrigger value="complaints">
            Şikayetler ({totalComplaints})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bilgi Talepleri</CardTitle>
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
              {/* Search */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Müşteri, konu veya detay ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              {infoLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex space-x-4">
                      <Skeleton className="h-12 flex-1" />
                      <Skeleton className="h-12 flex-1" />
                      <Skeleton className="h-12 flex-1" />
                    </div>
                  ))}
                </div>
              ) : infoError ? (
                <div className="flex items-center justify-center py-8 text-destructive">
                  <AlertCircle className="mr-2 h-5 w-5" />
                  <span>
                    {infoError.message?.includes('permission') 
                      ? 'Firebase izin hatası. Security rules kontrol edin.'
                      : 'Bilgi talepleri yüklenirken hata oluştu.'}
                  </span>
                </div>
              ) : filteredInfoRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'Arama kriterine uygun bilgi talebi bulunamadı' : 'Henüz bilgi talebi yok'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Müşteri</TableHead>
                      <TableHead>Konu</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Oluşturulma</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInfoRequests.map((req) => {
                      const customer = req.customerId ? customers[req.customerId] : undefined;
                      return (
                        <TableRow key={req.id}>
                          <TableCell>{customer?.name || 'Bilinmeyen'}</TableCell>
                          <TableCell>{req.topic}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell>
                            {format(toDate(req.createdAt), 'PPp', { locale: tr })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="complaints">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Şikayetler</CardTitle>
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
              {/* Search */}
              <div className="relative mt-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Müşteri, kategori veya açıklama ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              {complaintsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex space-x-4">
                      <Skeleton className="h-12 flex-1" />
                      <Skeleton className="h-12 flex-1" />
                      <Skeleton className="h-12 flex-1" />
                    </div>
                  ))}
                </div>
              ) : complaintsError ? (
                <div className="flex items-center justify-center py-8 text-destructive">
                  <AlertCircle className="mr-2 h-5 w-5" />
                  <span>
                    {complaintsError.message?.includes('permission') 
                      ? 'Firebase izin hatası. Security rules kontrol edin.'
                      : 'Şikayetler yüklenirken hata oluştu.'}
                  </span>
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ? 'Arama kriterine uygun şikayet bulunamadı' : 'Henüz şikayet yok'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Müşteri</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead>Oluşturulma</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredComplaints.map((complaint) => {
                      const customer = customers[complaint.customerId];
                      return (
                        <TableRow key={complaint.id}>
                          <TableCell>{customer?.name || 'Bilinmeyen'}</TableCell>
                          <TableCell>{complaint.category}</TableCell>
                          <TableCell>{getStatusBadge(complaint.status)}</TableCell>
                          <TableCell>
                            {format(toDate(complaint.createdAt), 'PPp', { locale: tr })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<div className="p-8">Yükleniyor...</div>}>
      <TicketsPageContent />
    </Suspense>
  );
}

