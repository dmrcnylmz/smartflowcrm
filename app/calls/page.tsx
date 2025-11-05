'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle } from 'lucide-react';
import { useCalls } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import type { Customer } from '@/lib/firebase/types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export default function CallsPage() {
  const [customers, setCustomers] = useState<Record<string, Customer>>({});

  // Real-time calls with limit
  const { data: calls, loading, error: callsError } = useCalls({ limitCount: 50 });

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

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Çağrılar</h1>
        <p className="text-muted-foreground">Tüm çağrı kayıtları ve geçmiş</p>
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
          <CardTitle>Çağrı Listesi</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Yükleniyor...
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Henüz çağrı kaydı yok
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
                {calls.map((call) => {
                  const customer = call.customerId ? customers[call.customerId] : undefined;
                  const timestamp = call.timestamp || call.createdAt;
                  const duration = call.durationSec ?? call.duration;
                  const direction = call.direction || 'inbound';
                  
                  return (
                    <TableRow key={call.id}>
                      <TableCell>
                        {format(timestamp.toDate(), 'PPp', { locale: tr })}
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
        </CardContent>
      </Card>
    </div>
  );
}

