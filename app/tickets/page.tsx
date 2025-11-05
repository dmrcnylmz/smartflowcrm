'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useInfoRequests, useComplaints } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import type { Customer } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export default function TicketsPage() {
  const { data: infoRequests, loading: infoLoading, error: infoError } = useInfoRequests();
  const { data: complaints, loading: complaintsLoading, error: complaintsError } = useComplaints();
  const [customers, setCustomers] = useState<Record<string, Customer>>({});

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
    const variants: Record<string, any> = {
      open: { variant: 'destructive' as const, label: 'Açık' },
      in_progress: { variant: 'default' as const, label: 'İşleniyor' },
      investigating: { variant: 'default' as const, label: 'İnceleniyor' },
      resolved: { variant: 'secondary' as const, label: 'Çözüldü' },
    };
    const config = variants[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Biletler</h1>
        <p className="text-muted-foreground">Bilgi talepleri ve şikayet yönetimi</p>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info">Bilgi Talepleri</TabsTrigger>
          <TabsTrigger value="complaints">Şikayetler</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Bilgi Talepleri</CardTitle>
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
              ) : infoRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Henüz bilgi talebi yok
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
                    {infoRequests.map((req) => {
                      const customer = req.customerId ? customers[req.customerId] : undefined;
                      return (
                        <TableRow key={req.id}>
                          <TableCell>{customer?.name || 'Bilinmeyen'}</TableCell>
                          <TableCell>{req.topic}</TableCell>
                          <TableCell>{getStatusBadge(req.status)}</TableCell>
                          <TableCell>
                            {format(req.createdAt.toDate(), 'PPp', { locale: tr })}
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
              <CardTitle>Şikayetler</CardTitle>
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
              ) : complaints.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Henüz şikayet yok
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
                    {complaints.map((complaint) => {
                      const customer = customers[complaint.customerId];
                      return (
                        <TableRow key={complaint.id}>
                          <TableCell>{customer?.name || 'Bilinmeyen'}</TableCell>
                          <TableCell>{complaint.category}</TableCell>
                          <TableCell>{getStatusBadge(complaint.status)}</TableCell>
                          <TableCell>
                            {format(complaint.createdAt.toDate(), 'PPp', { locale: tr })}
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

