'use client';

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
import { exportAppointments, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { Plus, AlertCircle, AlertTriangle, Calendar as CalendarIcon, Clock, CheckCircle2, XCircle, Search, Edit, Trash2, X, Download, UserRoundSearch, UserPlus, Phone, Activity, Loader2 } from 'lucide-react';
import { getAllCustomers, createAppointment, updateAppointment, deleteAppointment } from '@/lib/firebase/db';
import { useAppointments } from '@/lib/firebase/hooks';
import { useToast } from '@/components/ui/toast';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { getCustomersBatch, extractCustomerIds } from '@/lib/firebase/batch-helpers';
import type { Customer, Appointment } from '@/lib/firebase/types';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { getDateLocale } from '@/lib/utils/date-locale';
import { toDate } from '@/lib/utils/date-helpers';
import { Suspense } from 'react';

function AppointmentsPageContent() {
  const { toast } = useToast();
  const t = useTranslations('appointments');
  const tc = useTranslations('common');
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
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
  const { data: allAppointments, loading, error: appointmentsError, refetch: refetchAppointments } = useAppointments();
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
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Load customer details for appointments
  useEffect(() => {
    if (allAppointments.length > 0) {
      const customerIds = extractCustomerIds(allAppointments);
      if (customerIds.length > 0) {
        getCustomersBatch(customerIds)
          .then((customerMap) => {
            setCustomers(Object.fromEntries(customerMap));
          })
          .catch((err: unknown) => {
            void err;
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
      void error;
    }
  }, [searchTerm, statusFilters, dateFrom, dateTo]);

  const statusOptions: FilterOption[] = [
    { value: 'scheduled', label: t('scheduled') },
    { value: 'completed', label: t('completed') },
    { value: 'cancelled', label: t('cancelled') },
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

  async function handleExport(format: 'csv' | 'excel' | 'pdf') {
    try {
      const exportData = exportAppointments(filteredAppointments as unknown as Array<Record<string, unknown>>, customers as unknown as Record<string, Record<string, unknown>>);
      const filename = `appointments-${new Date().toISOString().split('T')[0]}`;

      switch (format) {
        case 'csv':
          exportToCSV(exportData, filename);
          break;
        case 'excel':
          await exportToExcel(exportData, filename);
          break;
        case 'pdf':
          await exportToPDF(exportData, filename, t('appointmentList'));
          break;
      }

      toast({
        title: tc('success'),
        description: t('exportSuccess', { format: format.toUpperCase() }),
        variant: 'success',
      });
    } catch {
      toast({ title: tc('error'), description: t('exportError'), variant: 'error' });
    }
  }

  async function loadAllCustomers() {
    try {
      const customerList = await getAllCustomers();
      setAllCustomers(customerList);
    } catch (error) {
      void error;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!formData.customerId || !formData.dateTime) {
        toast({
          title: t('missingInfo'),
          description: t('selectCustomerDate'),
          variant: 'warning',
        });
        return;
      }

      const dateTime = new Date(formData.dateTime);

      // Prevent creating appointments in the past
      if (dateTime < new Date()) {
        toast({
          title: t('invalidDate'),
          description: t('pastDateError'),
          variant: 'error',
        });
        return;
      }

      setSaving(true);
      const customer = allCustomers.find(c => c.id === formData.customerId);
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
        title: tc('success'),
        description: t('appointmentCreated', { name: customer?.name || t('customer') }),
        variant: 'success',
      });
      refetchAppointments();
    } catch (error) {
      void error;
      const errorMessage = error instanceof Error ? error.message : t('createError');
      toast({
        title: tc('error'),
        description: errorMessage,
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(appointmentId: string, newStatus: 'scheduled' | 'completed' | 'cancelled') {
    setUpdating(appointmentId);
    try {
      await updateAppointment(appointmentId, { status: newStatus });
      const statusLabels = {
        scheduled: t('scheduled'),
        completed: t('completed'),
        cancelled: t('cancelled'),
      };
      toast({
        title: t('statusUpdated'),
        description: t('statusChanged', { status: statusLabels[newStatus] }),
        variant: 'success',
      });
      refetchAppointments();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('statusUpdateError');
      toast({
        title: tc('error'),
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
      dateTime: dateTime ? format(dateTime, "yyyy-MM-dd'T'HH:mm") : '',
      durationMin: appointment.durationMin?.toString() || '30',
      notes: appointment.notes || '',
    });
    setEditDialogOpen(true);
  }

  async function handleEditSave() {
    if (!selectedAppointment) return;

    try {
      const dateTime = new Date(editFormData.dateTime);

      // Prevent updating to a past date/time
      if (dateTime < new Date()) {
        toast({
          title: t('invalidDate'),
          description: t('pastDateError'),
          variant: 'error',
        });
        return;
      }

      setEditSaving(true);
      await updateAppointment(selectedAppointment.id, {
        dateTime: Timestamp.fromDate(dateTime),
        durationMin: parseInt(editFormData.durationMin),
        notes: editFormData.notes || undefined,
      });
      setEditDialogOpen(false);
      toast({
        title: tc('success'),
        description: t('appointmentUpdated'),
        variant: 'success',
      });
      refetchAppointments();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('updateError');
      toast({
        title: tc('error'),
        description: errorMessage,
        variant: 'error',
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirmId) return;
    const appointmentId = deleteConfirmId;
    setDeleteConfirmId(null);

    try {
      await deleteAppointment(appointmentId);
      toast({
        title: t('deleted'),
        description: t('deleteSuccess'),
        variant: 'success',
      });
      refetchAppointments();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('deleteError');
      toast({
        title: tc('error'),
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
      if (!aptDate) { matchesDate = false; }
      const aptDateOnly = aptDate ? new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate()) : null;

      if (aptDateOnly && dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (aptDateOnly < fromDate) matchesDate = false;
      }

      if (aptDateOnly && dateTo) {
        const toDateVal = new Date(dateTo);
        toDateVal.setHours(23, 59, 59, 999);
        if (aptDateOnly > toDateVal) matchesDate = false;
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
    <div className="p-3 sm:p-4 md:p-8 max-w-[1600px] mx-auto space-y-5 sm:space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <CalendarIcon className="h-8 w-8 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-card p-2 rounded-2xl border shadow-sm backdrop-blur-md">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="px-4 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t('newAppointment')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] rounded-2xl border-white/[0.08] shadow-xl bg-card/95 backdrop-blur-xl">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                  <CalendarIcon className="h-6 w-6 text-primary" />
                  {t('createAppointment')}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{t('createDesc')}</p>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="customerId" className="text-sm font-medium">{t('customerSelect')} <span className="text-destructive">*</span></Label>
                  <Select value={formData.customerId} onValueChange={(value) => setFormData({ ...formData, customerId: value })}>
                    <SelectTrigger className="rounded-xl bg-white/[0.04] outline-none border-white/[0.08] h-10">
                      <SelectValue placeholder={t('customerPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-white/[0.08] shadow-lg backdrop-blur-sm bg-card/95">
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
                    <Label htmlFor="dateTime" className="text-sm font-medium">{t('dateTime')} <span className="text-destructive">*</span></Label>
                    <Input
                      id="dateTime"
                      type="datetime-local"
                      value={formData.dateTime}
                      onChange={(e) => setFormData({ ...formData, dateTime: e.target.value })}
                      required
                      className="rounded-xl bg-white/[0.04] border-white/[0.08] h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="durationMin" className="text-sm font-medium">{t('duration')} <span className="text-destructive">*</span></Label>
                    <Input
                      id="durationMin"
                      type="number"
                      min="15"
                      step="15"
                      value={formData.durationMin}
                      onChange={(e) => setFormData({ ...formData, durationMin: e.target.value })}
                      required
                      className="rounded-xl bg-white/[0.04] border-white/[0.08] h-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm font-medium">{t('extraNotes')}</Label>
                  <Textarea
                    id="notes"
                    placeholder={t('notesPlaceholder')}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="rounded-xl bg-white/[0.04] border-white/[0.08] resize-none h-24"
                  />
                </div>
                <Button type="submit" className="w-full font-medium py-6 mt-2" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('saveAppointment')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <div className="h-8 w-px bg-border"></div>
          {filteredAppointments.length > 0 && (
            <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
              <SelectTrigger className="w-[130px] rounded-xl border-none bg-transparent shadow-none hover:bg-muted text-sm font-medium transition-colors">
                <Download className="mr-2 h-4 w-4" /> {t('export')}
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-lg border-white/[0.08] bg-card/95 backdrop-blur-sm">
                <SelectItem value="csv">{t('csvDownload')}</SelectItem>
                <SelectItem value="excel">{t('excelDownload')}</SelectItem>
                <SelectItem value="pdf">{t('pdfDownload')}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPI Stats Cards - Glassmorphism */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-indigo-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> {t('totalRecords')}
            </h3>
            <span className="text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full text-xs font-bold">{t('all')}</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-foreground">{totalAppointments}</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-blue-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> {t('scheduled')}
            </h3>
            <span className="text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full text-xs font-bold">{t('open')}</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-blue-500">{scheduledCount}</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> {t('completed')}
            </h3>
            <span className="text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full text-xs font-bold">{t('closed')}</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-emerald-500">{completedCount}</div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-rose-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-muted-foreground font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4" /> {t('cancelled')}
            </h3>
            <span className="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full text-xs font-bold">{t('returned')}</span>
          </div>
          <div className="text-4xl font-bold tracking-tight text-rose-500">{cancelledCount}</div>
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="rounded-2xl border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-background/50 px-6 py-5">
          <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
            <div className="flex items-center gap-3 w-full lg:w-1/3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
              <Input
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-xl bg-white/[0.04] border border-white/[0.08] h-10 text-sm w-full transition-colors focus-visible:bg-background"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <MultiSelectFilter
                options={statusOptions}
                selectedValues={statusFilters}
                onSelectionChange={setStatusFilters}
                placeholder={t('selectStatus')}
                className="w-full sm:w-[220px] rounded-xl h-10 border-white/[0.08] bg-white/[0.04]"
              />
              <div className="h-10 border border-white/[0.08] bg-white/[0.04] rounded-xl px-2 flex items-center">
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
                  className="rounded-xl h-10 font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('reset')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-white/40 animate-spin mb-4" />
              <p className="text-sm text-white/40">{t('loadingData')}</p>
            </div>
          ) : appointmentsError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-400/60" />
              </div>
              <h3 className="text-lg font-semibold text-white/80 mb-2">{t('errorOccurred')}</h3>
              <p className="text-sm text-white/40 mb-6 max-w-sm">{appointmentsError instanceof Error ? appointmentsError.message : t('errorLoadDesc')}</p>
              <Button variant="outline" onClick={() => refetchAppointments()}>{tc('retry')}</Button>
            </div>
          ) : filteredAppointments.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                <CalendarIcon className="h-8 w-8 text-white/20" />
              </div>
              <h3 className="text-lg font-semibold text-white/80 mb-2">{t('noAppointmentsTitle')}</h3>
              <p className="text-sm text-white/40 mb-6 max-w-sm">{t('noAppointmentsDesc')}</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('newAppointment')}
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredAppointments.map((apt, aptIdx) => {
                const customer = customers[apt.customerId];
                const dDate = toDate(apt.dateTime) ?? new Date();

                return (
                  <div key={apt.id} className="p-4 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 hover:bg-white/[0.02] transition-all duration-200 animate-fade-in-up" style={{ animationDelay: `${aptIdx * 40}ms` }}>
                    <div className="flex items-center gap-5 w-full lg:w-1/3">
                      <div className="flex-shrink-0 flex flex-col items-center justify-center h-14 w-14 rounded-2xl bg-background border border-border shadow-sm">
                        <span className="text-xs font-semibold text-primary/80 uppercase mb-0.5">{format(dDate, 'MMM', { locale: dateLocale })}</span>
                        <span className="text-xl font-bold leading-none text-foreground">{format(dDate, 'dd')}</span>
                      </div>
                      <div>
                        <div className="font-semibold text-[15px] flex items-center gap-2 mb-1">
                          {customer?.name || t('unknownUser')}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5 whitespace-nowrap"><Phone className="h-3.5 w-3.5" /> {customer?.phone || '-'}</span>
                          <span className="h-1 w-1 rounded-full bg-border"></span>
                          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {format(dDate, 'HH:mm', { locale: dateLocale })} ({apt.durationMin}{t('min')})</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full lg:w-1/3 px-0 lg:px-4">
                      <div className="text-sm border-l-2 border-indigo-500/20 pl-4 py-1 italic text-muted-foreground max-w-md line-clamp-2">
                        {apt.notes && apt.notes.length > 0 ? (
                          `"${apt.notes}"`
                        ) : (
                          <span className="text-muted-foreground/50 not-italic">{t('noNotes')}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full lg:w-auto lg:justify-end gap-5">
                      <div>
                        {apt.status === 'scheduled' && (
                          <Badge className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none">{t('upcoming')}</Badge>
                        )}
                        {apt.status === 'completed' && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none flex gap-1">
                            <CheckCircle2 className="w-3 h-3" /> {t('occurred')}
                          </Badge>
                        )}
                        {apt.status === 'cancelled' && (
                          <Badge className="bg-rose-500/10 text-rose-500 px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none flex gap-1">
                            <XCircle className="w-3 h-3" /> {t('cancel')}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 bg-background shadow-sm border border-border/60 p-1.5 rounded-xl">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 rounded-lg hover:bg-muted"
                          onClick={() => handleEditClick(apt)}
                          title={t('edit')}
                          aria-label={t('edit')}
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
                              title={t('markCompleted')}
                              aria-label={t('markCompleted')}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg hover:bg-orange-500/10 hover:text-orange-500"
                              disabled={updating === apt.id}
                              onClick={() => handleStatusUpdate(apt.id, 'cancelled')}
                              title={t('markCancelled')}
                              aria-label={t('markCancelled')}
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
                          title={t('deleteBtn')}
                          aria-label={t('deleteBtn')}
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
            <div className="p-4 border-t border-border/50 bg-background/50 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t('showingAppointments', { count: filteredAppointments.length, total: totalAvailable })}
              </p>
              {hasMore && (
                <Button variant="outline" size="sm" onClick={handleLoadMore}>
                  {t('loadMore')}
                </Button>
              )}
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
              {t('deleteTitle')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('deleteConfirm')}
          </p>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              {t('cancelBtn')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirmed}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('confirmDelete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Appointment Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[450px] rounded-2xl border-white/[0.08] shadow-xl bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              {t('editTitle')}
            </DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <form onSubmit={(e) => { e.preventDefault(); handleEditSave(); }} className="space-y-5 mt-2">
              <div className="space-y-2">
                <Label htmlFor="edit-dateTime" className="text-sm font-medium">{t('dateTime')} <span className="text-destructive">*</span></Label>
                <Input
                  id="edit-dateTime"
                  type="datetime-local"
                  value={editFormData.dateTime}
                  onChange={(e) => setEditFormData({ ...editFormData, dateTime: e.target.value })}
                  required
                  className="rounded-xl border-white/[0.08] bg-white/[0.04] h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-durationMin" className="text-sm font-medium">{t('durationMinutes')} <span className="text-destructive">*</span></Label>
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
                    className="rounded-xl border-white/[0.08] bg-white/[0.04] h-10 pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes" className="text-sm font-medium">{t('appointmentNotes')}</Label>
                <Textarea
                  id="edit-notes"
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="rounded-xl border-white/[0.08] bg-white/[0.04] resize-none h-28"
                  placeholder={t('editNotesPlaceholder')}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} disabled={editSaving}>
                  {t('cancelBtn')}
                </Button>
                <Button type="submit" disabled={editSaving}>
                  {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('saveChanges')}
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
