'use client';

import { useEffect, useState } from 'react';
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
import { Plus, AlertCircle } from 'lucide-react';
import { getAllCustomers, createAppointment, updateAppointment } from '@/lib/firebase/db';
import { useAppointments } from '@/lib/firebase/hooks';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import type { Customer } from '@/lib/firebase/types';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale/tr';

export default function AppointmentsPage() {
  const { data: appointments, loading, error: appointmentsError } = useAppointments({ status: 'scheduled' });
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    customerId: '',
    dateTime: '',
    durationMin: '30',
    notes: '',
  });

  // Load customer details for appointments
  useEffect(() => {
    if (appointments.length > 0) {
      const customerIds = extractCustomerIds(appointments);
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
  }, [appointments]);

  // Load all customers for the form dropdown
  useEffect(() => {
    loadAllCustomers();
  }, []);

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
        alert('Lütfen müşteri ve tarih seçin');
        return;
      }

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
    } catch (error) {
      console.error('Appointment create error:', error);
      alert('Randevu oluşturulurken hata oluştu');
    }
  }

  async function handleStatusUpdate(appointmentId: string, newStatus: 'scheduled' | 'completed' | 'cancelled') {
    setUpdating(appointmentId);
    try {
      await updateAppointment(appointmentId, { status: newStatus });
    } catch (err) {
      console.error('Status update error:', err);
      alert('Durum güncellenirken hata oluştu');
    } finally {
      setUpdating(null);
    }
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Yaklaşan Randevular</CardTitle>
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
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Henüz randevu yok
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
                {appointments.map((apt) => {
                  const customer = customers[apt.customerId];
                  return (
                    <TableRow key={apt.id}>
                      <TableCell>
                        {format(apt.dateTime.toDate(), 'PPp', { locale: tr })}
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

