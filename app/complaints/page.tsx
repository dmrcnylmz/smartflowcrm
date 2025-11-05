'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { useComplaints } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import { updateComplaint } from '@/lib/firebase/db';
import type { Customer } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export default function ComplaintsPage() {
  const { data: complaints, loading, error } = useComplaints('open');
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (complaints.length > 0) {
      const customerIds = extractCustomerIds(complaints);
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
  }, [complaints]);

  async function handleStatusUpdate(complaintId: string, newStatus: 'open' | 'investigating' | 'resolved' | 'closed') {
    setUpdating(complaintId);
    try {
      await updateComplaint(complaintId, { status: newStatus });
    } catch (err) {
      console.error('Status update error:', err);
      alert('Durum güncellenirken hata oluştu');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Şikayetler</h1>
        <p className="text-muted-foreground">Müşteri şikayetlerini yönetin ve takip edin</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktif Şikayetler</CardTitle>
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
          ) : complaints.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Henüz şikayet yok
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
                {complaints.map((complaint) => {
                  const customer = customers[complaint.customerId];
                  return (
                    <TableRow key={complaint.id}>
                      <TableCell>
                        {format(complaint.createdAt.toDate(), 'PPp', { locale: tr })}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{customer?.name || 'Bilinmeyen'}</div>
                          <div className="text-sm text-muted-foreground">{customer?.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{complaint.category}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate">{complaint.description}</div>
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
        </CardContent>
      </Card>
    </div>
  );
}

