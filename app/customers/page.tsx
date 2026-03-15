'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { exportCustomers, exportToCSV, exportToExcel, exportToPDF } from '@/lib/utils/export-helpers';
import { Plus, AlertCircle, Users, Search, Mail, Phone as PhoneIcon, Edit, Phone, Calendar, FileText, AlertTriangle, X, ChevronRight, Activity, Clock, ShieldCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { createCustomer, getCallLogs, getAppointments, getComplaints, getInfoRequests, updateCustomer } from '@/lib/firebase/db';
import { useCustomers } from '@/lib/firebase/hooks';
import { useToast } from '@/components/ui/toast';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/utils/date-locale';
import { toDate } from '@/lib/utils/date-helpers';
import type { Customer, CallLog, Appointment, Complaint, InfoRequest } from '@/lib/firebase/types';

function CustomersPageContent() {
  const { data: customers, loading, error: customersError, refetch: refetchCustomers } = useCustomers();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const t = useTranslations('customers');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
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
      void error;
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
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate email if provided
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast({
        title: t('invalidEmail'),
        description: t('invalidEmailDesc'),
        variant: 'error',
      });
      return;
    }

    // Validate phone format
    if (!/^[+]?[\d\s()-]{7,20}$/.test(formData.phone)) {
      toast({
        title: t('invalidPhone'),
        description: t('invalidPhoneDesc'),
        variant: 'error',
      });
      return;
    }

    setSaving(true);
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
        title: tCommon('success') + '!',
        description: t('customerAdded', { name: formData.name }),
        variant: 'success',
        duration: 3000,
      });
      refetchCustomers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('createError');
      toast({
        title: tCommon('error'),
        description: errorMessage,
        variant: 'error',
        duration: 5000,
      });
    } finally {
      setSaving(false);
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
      void error;
      toast({
        title: t('warning'),
        description: t('historyLoadError'),
        variant: 'warning',
      });
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleEditSave() {
    if (!selectedCustomer) return;

    // Validate email if provided
    if (editFormData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editFormData.email)) {
      toast({
        title: t('invalidEmail'),
        description: t('invalidEmailDesc'),
        variant: 'error',
      });
      return;
    }

    // Validate phone format
    if (!/^[+]?[\d\s()-]{7,20}$/.test(editFormData.phone)) {
      toast({
        title: t('invalidPhone'),
        description: t('invalidPhoneDesc'),
        variant: 'error',
      });
      return;
    }

    setEditSaving(true);
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
        title: tCommon('success') + '!',
        description: t('customerUpdated'),
        variant: 'success',
      });
      refetchCustomers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('updateError');
      toast({
        title: tCommon('error'),
        description: errorMessage,
        variant: 'error',
      });
    } finally {
      setEditSaving(false);
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
      const exportData = exportCustomers(filteredCustomers as unknown as Array<Record<string, unknown>>);
      const filename = `musteriler-${new Date().toISOString().split('T')[0]}`;

      switch (format) {
        case 'csv':
          exportToCSV(exportData, filename);
          break;
        case 'excel':
          await exportToExcel(exportData, filename);
          break;
        case 'pdf':
          await exportToPDF(exportData, filename, t('customerList'));
          break;
      }

      toast({
        title: tCommon('success') + '!',
        description: t('exportSuccess', { format: format.toUpperCase() }),
        variant: 'success',
      });
    } catch {
      toast({ title: tCommon('error'), description: t('exportError'), variant: 'error' });
    }
  }

  // Stats
  const totalCustomers = customers.length;
  const customersWithEmail = customers.filter(c => c.email).length;
  const newCustomersThisWeek = customers.filter(c => {
    const diff = new Date().getTime() - (toDate(c.createdAt) ?? new Date()).getTime();
    return diff < 1000 * 60 * 60 * 24 * 7;
  }).length;

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
            <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-400" />
            </div>
            {t('portfolio')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('portfolioDesc')}
          </p>
        </div>
        <div className="flex gap-3">
          {filteredCustomers.length > 0 && (
            <Select onValueChange={(v: 'csv' | 'excel' | 'pdf') => handleExport(v)}>
              <SelectTrigger className="w-[140px] bg-white/[0.04] border-white/[0.08] rounded-xl">
                <SelectValue placeholder={t('export')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">{t('csvDownload')}</SelectItem>
                <SelectItem value="excel">{t('excelDownload')}</SelectItem>
                <SelectItem value="pdf">{t('pdfDownload')}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                {t('newCustomer')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{t('addNewCustomer')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('fullNameRequired')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder={t('customerName')}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('phoneRequired')}</Label>
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
                    title={t('phoneTitle')}
                    placeholder="+905554443322"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{t('email')}</Label>
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
                  <Label htmlFor="notes">{t('specialNotes')}</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={t('notesPlaceholder')}
                    className="min-h-[100px]"
                  />
                </div>
                <Button type="submit" className="w-full mt-4" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
        <div className="rounded-2xl border border-blue-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40 font-medium">{t('totalCustomers')}</span>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{totalCustomers}</p>
          <p className="text-xs text-white/30 mt-1 flex items-center gap-1"><Activity className="h-3 w-3" /> {t('growingPortfolio')}</p>
        </div>
        <div className="rounded-2xl border border-purple-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up" style={{ animationDelay: '220ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40 font-medium">{t('newCustomers')}</span>
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-purple-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">+{newCustomersThisWeek}</p>
          <p className="text-xs text-white/30 mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> {t('addedLast7Days')}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/15 bg-white/[0.02] p-4 backdrop-blur-sm animate-fade-in-up" style={{ animationDelay: '340ms' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-white/40 font-medium">{t('contactQuality')}</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">%{totalCustomers > 0 ? Math.round((customersWithEmail / totalCustomers) * 100) : 0}</p>
          <p className="text-xs text-white/30 mt-1">{t('emailRatio')}</p>
        </div>
      </div>

      <Card className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden animate-fade-in-up" style={{ animationDelay: '460ms' }}>
        <div className="px-6 py-4 border-b border-white/[0.06] flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 focus:outline-none focus:border-inception-red/40"
            />
          </div>
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('clear')}
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
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-400/60" />
              </div>
              <h3 className="text-lg font-semibold text-white/80 mb-2">{t('errorOccurred')}</h3>
              <p className="text-sm text-white/40 mb-6 max-w-sm">{t('errorLoadDesc')}</p>
              <Button variant="outline" onClick={() => refetchCustomers()}>{t('retry')}</Button>
            </div>
          ) : paginatedCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-white/20" />
              </div>
              <h3 className="text-lg font-semibold text-white/80 mb-2">
                {searchTerm ? t('noCustomersFound') : t('noCustomersYet')}
              </h3>
              <p className="text-sm text-white/40 mb-6 max-w-sm">
                {searchTerm ? t('noSearchResults') : t('startByAdding')}
              </p>
              {!searchTerm && (
                <Button onClick={() => setDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t('newCustomer')}
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-white/[0.02]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold text-foreground/80 pl-6 shrink-0 min-w-[200px]">{t('customerProfile')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 shrink-0 min-w-[150px]">{t('contactType')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 hidden md:table-cell">{t('registrationDate')}</TableHead>
                      <TableHead className="font-semibold text-foreground/80 text-right pr-6">{t('action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow
                        key={customer.id}
                        className="cursor-pointer group hover:bg-white/[0.04] transition-colors focus-visible:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
                        tabIndex={0}
                        role="button"
                        aria-label={t('viewDetailsFor', { name: customer.name })}
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
                            <span className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{customer.notes || t('noNotes')}</span>
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
                          {format(toDate(customer.createdAt) ?? new Date(), 'dd MMM yyyy', { locale: dateLocale })}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" aria-label={t('viewDetails')}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('showingRecords', { count: paginatedCustomers.length, total: filteredCustomers.length })}
                </span>
                {hasMore && (
                  <Button variant="outline" size="sm" onClick={handleLoadMore}>
                    {t('loadMore')}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modern Customer Detail Drawer-like Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-4xl p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between pb-4 border-b border-border/40">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                  {selectedCustomer?.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold">
                    {selectedCustomer?.name || t('customerDetails')}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">{t('profileAndHistory')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {!editMode && (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setEditMode(true)}
                  >
                    <Edit className="h-4 w-4" />
                    {t('editInfo')}
                  </Button>
                )}
                {editMode && (
                  <>
                    <Button
                      variant="ghost"
                      disabled={editSaving}
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
                      {t('cancel')}
                    </Button>
                    <Button onClick={handleEditSave} disabled={editSaving}>
                      {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {t('save')}
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
                        <Label htmlFor="edit-name" className="text-xs text-muted-foreground">{t('nameRequired')}</Label>
                        <Input
                          id="edit-name"
                          className="mt-1"
                          value={editFormData.name}
                          onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-phone" className="text-xs text-muted-foreground">{t('phoneRequired')}</Label>
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
                          title={t('phoneTitle')}
                          autoComplete="tel"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-email" className="text-xs text-muted-foreground">{t('email')}</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          className="mt-1"
                          value={editFormData.email}
                          onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-notes" className="text-xs text-muted-foreground">{t('notes')}</Label>
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
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t('phoneInputLabel')}</p>
                            <p className="text-foreground font-medium mt-0.5">{selectedCustomer.phone}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t('email')}</p>
                            <p className="text-foreground font-medium mt-0.5">{selectedCustomer.email || t('notSpecified')}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{t('systemRegistrationDate')}</p>
                            <p className="text-foreground font-medium mt-0.5">
                              {format(toDate(selectedCustomer.createdAt) ?? new Date(), 'dd MMMM yyyy', { locale: dateLocale })}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-border/50">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" /> {t('specialNote')}
                        </p>
                        {selectedCustomer.notes ? (
                          <p className="text-sm text-foreground/80 leading-relaxed bg-background p-3 rounded-xl border shadow-sm">{selectedCustomer.notes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">{t('noNotesForCustomer')}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Activity */}
              <div className="w-full md:w-2/3 p-6 overflow-y-auto bg-background bg-grid-slate-100/30 dark:bg-grid-slate-900/30">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> {t('activityHistory')}
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
                          {t('callCount', { count: customerHistory.calls.length })}
                        </Badge>
                      )}
                      {(customerHistory.appointments.length > 0) && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-none px-3 py-1">
                          {t('appointmentCount', { count: customerHistory.appointments.length })}
                        </Badge>
                      )}
                      {(customerHistory.complaints.length > 0) && (
                        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-none px-3 py-1">
                          {t('complaintCount', { count: customerHistory.complaints.length })}
                        </Badge>
                      )}
                      {(customerHistory.infoRequests.length > 0) && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-none px-3 py-1">
                          {t('requestCount', { count: customerHistory.infoRequests.length })}
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
                                <p className="font-semibold text-sm">{t('appointmentLabel', { notes: apt.notes || t('appointmentCreated') })}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{format(toDate(apt.dateTime) ?? new Date(), 'dd MMMM yyyy HH:mm', { locale: dateLocale })} ({apt.durationMin} {t('min')})</p>
                              </div>
                              <Badge variant={apt.status === 'scheduled' ? 'default' : apt.status === 'completed' ? 'secondary' : 'destructive'} className="shadow-none">
                                {apt.status === 'scheduled' ? t('scheduled') : apt.status === 'completed' ? t('completed') : t('cancelled')}
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
                                <p className="font-semibold text-sm">{t('phoneCall')}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{format(toDate(call.timestamp || call.createdAt) ?? new Date(), 'dd MMMM yyyy HH:mm', { locale: dateLocale })}</p>
                                {call.intent && <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1"><Badge variant="outline" className="text-[10px] h-5">{call.intent}</Badge></p>}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant={call.status === 'answered' ? 'default' : 'destructive'} className="shadow-none bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300">
                                  {call.status === 'answered' ? t('answered') : t('unreachable')}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-medium">{call.durationSec || 0} {t('seconds')}</span>
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
                                <p className="font-semibold text-sm text-red-900 dark:text-red-300">{t('complaintLabel', { category: complaint.category || '' })}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{format(toDate(complaint.createdAt) ?? new Date(), 'dd MMMM yyyy HH:mm', { locale: dateLocale })}</p>
                              </div>
                              <Badge variant={complaint.status === 'resolved' ? 'outline' : 'destructive'} className="shadow-none">
                                {complaint.status === 'resolved' ? t('resolved') : complaint.status === 'investigating' ? t('investigating') : t('open')}
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
                            <p className="text-sm font-medium text-foreground">{t('emptyActivityTitle')}</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-[250px] mx-auto">{t('emptyActivityDesc')}</p>
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
    <div className="p-3 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-8">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/30 p-6 space-y-3 bg-muted/10 animate-fade-in-up"
            style={{ animationDelay: `${i * 100}ms` }}
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
              className="flex items-center gap-4 animate-fade-in-up"
              style={{ animationDelay: `${300 + i * 80}ms` }}
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
