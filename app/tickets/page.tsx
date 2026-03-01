'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useAuth } from '@/lib/firebase/auth-context';
import { useToast } from '@/components/ui/toast';
import {
  Ticket,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Flame,
  ShieldAlert,
  LayoutList,
  User,
  Calendar,
  Tag,
  Trash2,
  Pencil,
  X,
  Loader2,
  Inbox,
  RefreshCw,
  WifiOff,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SupportTicket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  assignee?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
}

type TicketStatus = SupportTicket['status'];
type TicketPriority = SupportTicket['priority'];

// ---------------------------------------------------------------------------
// Config maps
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bgColor: string; icon: typeof AlertCircle }> = {
  open: { label: 'Acik', color: 'text-rose-500', bgColor: 'bg-rose-500/10', icon: AlertCircle },
  in_progress: { label: 'Islemde', color: 'text-amber-500', bgColor: 'bg-amber-500/10', icon: Clock },
  resolved: { label: 'Cozuldu', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', icon: CheckCircle2 },
  closed: { label: 'Kapatildi', color: 'text-slate-400', bgColor: 'bg-slate-400/10', icon: XCircle },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bgColor: string; borderColor: string; icon: typeof AlertTriangle }> = {
  low: { label: 'Dusuk', color: 'text-sky-500', bgColor: 'bg-sky-500/10', borderColor: 'border-sky-500/20', icon: ArrowRight },
  medium: { label: 'Orta', color: 'text-amber-500', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20', icon: AlertTriangle },
  high: { label: 'Yuksek', color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20', icon: Flame },
  critical: { label: 'Kritik', color: 'text-rose-500', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/20', icon: ShieldAlert },
};

const STATUS_WORKFLOW: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
};

const CATEGORIES = [
  'Teknik Destek',
  'Fatura / Odeme',
  'Urun Sorunu',
  'Hesap Yonetimi',
  'Genel Bilgi',
  'Entegrasyon',
  'Performans',
  'Diger',
];

// ---------------------------------------------------------------------------
// Demo data generator
// ---------------------------------------------------------------------------

function generateDemoTickets(): SupportTicket[] {
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

  return [
    { id: 'TK-1001', title: 'Sesli asistan yanitlarda gecikme yasaniyor', description: 'Musteri cagri sirasinda 10 saniyeden fazla bekleme suresi oldugunu bildirdi. Ozellikle yogun saatlerde sorun artiyormis.', status: 'open', priority: 'high', category: 'Teknik Destek', customerName: 'Ahmet Yilmaz', customerEmail: 'ahmet@example.com', customerPhone: '+905321234567', createdAt: day(0) },
    { id: 'TK-1002', title: 'Fatura tutari yanlis hesaplanmis', description: 'Ocak ayi faturasinda fazla ucretlendirme yapilmis. Musteri detayli dokum talep ediyor.', status: 'in_progress', priority: 'medium', category: 'Fatura / Odeme', customerName: 'Fatma Demir', customerEmail: 'fatma@example.com', assignee: 'Mehmet K.', createdAt: day(1), updatedAt: day(0) },
    { id: 'TK-1003', title: 'SMS bildirim sistemi calismiyor', description: 'Randevu hatirlatma SMS leri gonderilmiyor. Son 3 gundur hicbir musteri bildirim almamis.', status: 'open', priority: 'critical', category: 'Teknik Destek', customerName: 'Mehmet Kaya', customerPhone: '+905339876543', createdAt: day(1) },
    { id: 'TK-1004', title: 'Hesap erisim sorunu', description: 'Musteri sifre sifirlama islemini yapamiyor, email dogrulama kodu gelmiyor.', status: 'resolved', priority: 'high', category: 'Hesap Yonetimi', customerName: 'Ayse Ozturk', customerEmail: 'ayse@example.com', assignee: 'Ali B.', createdAt: day(3), resolvedAt: day(1) },
    { id: 'TK-1005', title: 'API entegrasyon hatasi', description: 'Webhook endpointleri 500 hatasi donuyor. Uretim ortaminda son 24 saatte 150+ basarisiz istek var.', status: 'in_progress', priority: 'critical', category: 'Entegrasyon', customerName: 'Can Aksoy', customerEmail: 'can@techfirm.com', assignee: 'Zeynep A.', createdAt: day(2), updatedAt: day(0) },
    { id: 'TK-1006', title: 'Raporlama modulunde yavas yuklenme', description: 'Gunluk rapor sayfasi 30 saniyeden fazla yukleniyor, kullanici deneyimi cok kotu.', status: 'open', priority: 'medium', category: 'Performans', customerName: 'Elif Sahin', createdAt: day(0) },
    { id: 'TK-1007', title: 'Mobil uygulama cokme sorunu', description: 'iOS 17 guncellemesinden sonra uygulama acilista cokerek kapaniyor.', status: 'resolved', priority: 'high', category: 'Teknik Destek', customerName: 'Burak Yildiz', customerPhone: '+905551112233', createdAt: day(5), resolvedAt: day(2) },
    { id: 'TK-1008', title: 'Toplu veri aktarimi talebi', description: 'Musteri mevcut CRM sisteminden SmartFlow a 50.000 kayit aktarmak istiyor.', status: 'open', priority: 'low', category: 'Genel Bilgi', customerName: 'Selin Arslan', customerEmail: 'selin@bigcorp.com', createdAt: day(1) },
    { id: 'TK-1009', title: 'Cagri kaydi eksik', description: 'Dunku cagri kayitlarindan 5 tanesi sistemde gorunmuyor.', status: 'closed', priority: 'medium', category: 'Teknik Destek', customerName: 'Emre Celik', createdAt: day(7), resolvedAt: day(4) },
    { id: 'TK-1010', title: 'Ozel alan ekleme talebi', description: 'Musteri formlarina ozel alan eklemek istiyor, mevcut yapida bu ozellik yok.', status: 'closed', priority: 'low', category: 'Urun Sorunu', customerName: 'Deniz Koc', createdAt: day(10), resolvedAt: day(6) },
    { id: 'TK-1011', title: 'Dashboard grafikleri yuklenmiyor', description: 'Tarayicida konsol hatasi veriyor, grafik kutuphanesi yuklenmemis olabilir.', status: 'in_progress', priority: 'medium', category: 'Teknik Destek', customerName: 'Gizem Tas', assignee: 'Mehmet K.', createdAt: day(0), updatedAt: day(0) },
    { id: 'TK-1012', title: 'Abonelik yukseltme talebi', description: 'Mevcut plandaki kullanici limiti asilmis, acil olarak enterprise plana gecis gerekiyor.', status: 'open', priority: 'high', category: 'Fatura / Odeme', customerName: 'Kerem Dogan', customerEmail: 'kerem@startup.io', createdAt: day(0) },
  ];
}

// ---------------------------------------------------------------------------
// Page size
// ---------------------------------------------------------------------------
const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// Main content component
// ---------------------------------------------------------------------------

function TicketsPageContent() {
  const authFetch = useAuthFetch();
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // Data state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get('priority') || 'all');
  const [currentPage, setCurrentPage] = useState(1);

  // Dialog state
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketToDelete, setTicketToDelete] = useState<SupportTicket | null>(null);

  // Mutation state
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  // Create form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<TicketPriority>('medium');
  const [formCategory, setFormCategory] = useState('');
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerEmail, setFormCustomerEmail] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchTickets = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await authFetch('/api/tickets');
      if (!res.ok) throw new Error('API yanit vermedi');
      const data = await res.json();
      const list: SupportTicket[] = Array.isArray(data) ? data : data.tickets || data.data || [];
      setTickets(list);
      setDemoMode(false);
    } catch (err) {
      console.warn('Tickets API hatasi, demo moda geciliyor:', err);
      // Fallback to demo data
      if (tickets.length === 0) {
        setTickets(generateDemoTickets());
        setDemoMode(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // -----------------------------------------------------------------------
  // Filtering & pagination
  // -----------------------------------------------------------------------

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        ticket.title.toLowerCase().includes(searchLower) ||
        ticket.description.toLowerCase().includes(searchLower) ||
        ticket.customerName.toLowerCase().includes(searchLower) ||
        ticket.id.toLowerCase().includes(searchLower) ||
        (ticket.category && ticket.category.toLowerCase().includes(searchLower));

      const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === 'all' || ticket.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, searchTerm, statusFilter, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / PAGE_SIZE));
  const paginatedTickets = filteredTickets.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, priorityFilter]);

  // -----------------------------------------------------------------------
  // KPI stats
  // -----------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === 'open').length;
    const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
    const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    return { total, open, inProgress, resolved };
  }, [tickets]);

  // -----------------------------------------------------------------------
  // CRUD: Create
  // -----------------------------------------------------------------------

  function resetCreateForm() {
    setFormTitle('');
    setFormDescription('');
    setFormPriority('medium');
    setFormCategory('');
    setFormCustomerName('');
    setFormCustomerEmail('');
    setFormCustomerPhone('');
  }

  async function handleCreateTicket() {
    if (!formTitle.trim() || !formCustomerName.trim()) {
      toast({ title: 'Eksik Bilgi', description: 'Baslik ve musteri adi zorunludur.', variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      if (demoMode) {
        // Demo mode: local creation
        const newTicket: SupportTicket = {
          id: `TK-${Date.now().toString().slice(-4)}`,
          title: formTitle.trim(),
          description: formDescription.trim(),
          priority: formPriority,
          category: formCategory || undefined,
          status: 'open',
          customerName: formCustomerName.trim(),
          customerEmail: formCustomerEmail.trim() || undefined,
          customerPhone: formCustomerPhone.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        setTickets((prev) => [newTicket, ...prev]);
      } else {
        const res = await authFetch('/api/tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim(),
            priority: formPriority,
            category: formCategory || undefined,
            customerName: formCustomerName.trim(),
            customerEmail: formCustomerEmail.trim() || undefined,
            customerPhone: formCustomerPhone.trim() || undefined,
          }),
        });
        if (!res.ok) throw new Error('Talep olusturulamadi');
        await fetchTickets();
      }

      toast({ title: 'Basarili', description: 'Yeni destek talebi olusturuldu.', variant: 'success' });
      setCreateDialogOpen(false);
      resetCreateForm();
    } catch (err) {
      console.error('Create ticket error:', err);
      toast({ title: 'Hata', description: 'Talep olusturulurken bir sorun olustu.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // CRUD: Update status
  // -----------------------------------------------------------------------

  async function handleStatusUpdate(ticketId: string, newStatus: TicketStatus) {
    setUpdatingStatus(ticketId);
    try {
      if (demoMode) {
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, status: newStatus, updatedAt: new Date().toISOString(), ...(newStatus === 'resolved' ? { resolvedAt: new Date().toISOString() } : {}) }
              : t
          )
        );
      } else {
        const res = await authFetch(`/api/tickets/${ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error('Durum guncellenemedi');
        await fetchTickets();
      }

      // Update selected ticket in detail dialog
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) =>
          prev ? { ...prev, status: newStatus, updatedAt: new Date().toISOString() } : null
        );
      }

      const statusLabel = STATUS_CONFIG[newStatus].label;
      toast({ title: 'Durum Guncellendi', description: `Talep durumu "${statusLabel}" olarak degistirildi.`, variant: 'success' });
    } catch (err) {
      console.error('Status update error:', err);
      toast({ title: 'Hata', description: 'Durum guncellenirken bir sorun olustu.', variant: 'error' });
    } finally {
      setUpdatingStatus(null);
    }
  }

  // -----------------------------------------------------------------------
  // CRUD: Delete
  // -----------------------------------------------------------------------

  async function handleDeleteTicket() {
    if (!ticketToDelete) return;
    setDeleting(true);
    try {
      if (demoMode) {
        setTickets((prev) => prev.filter((t) => t.id !== ticketToDelete.id));
      } else {
        const res = await authFetch(`/api/tickets/${ticketToDelete.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Talep silinemedi');
        await fetchTickets();
      }

      toast({ title: 'Silindi', description: `"${ticketToDelete.title}" talebi basariyla silindi.`, variant: 'success' });
      setDeleteDialogOpen(false);
      setTicketToDelete(null);
      // Close detail dialog if the deleted ticket was open
      if (selectedTicket?.id === ticketToDelete.id) {
        setDetailDialogOpen(false);
        setSelectedTicket(null);
      }
    } catch (err) {
      console.error('Delete ticket error:', err);
      toast({ title: 'Hata', description: 'Talep silinirken bir sorun olustu.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  function handleTicketClick(ticket: SupportTicket) {
    setSelectedTicket(ticket);
    setDetailDialogOpen(true);
  }

  function handleDeleteClick(e: React.MouseEvent, ticket: SupportTicket) {
    e.stopPropagation();
    setTicketToDelete(ticket);
    setDeleteDialogOpen(true);
  }

  function handleClearFilters() {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
  }

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || priorityFilter !== 'all';

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  function formatDateShort(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  }

  // -----------------------------------------------------------------------
  // Render: Loading skeleton
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Header skeleton */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Skeleton className="h-10 w-72 rounded-xl mb-3" />
            <Skeleton className="h-5 w-96 rounded-lg" />
          </div>
          <Skeleton className="h-12 w-40 rounded-2xl" />
        </div>

        {/* KPI skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-white/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <div>
                <Skeleton className="h-4 w-24 rounded mb-2" />
                <Skeleton className="h-10 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <Card className="rounded-3xl border-white/10 shadow-xl overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-background/50 px-6 py-5">
            <div className="flex gap-4">
              <Skeleton className="h-12 flex-1 rounded-2xl" />
              <Skeleton className="h-12 w-40 rounded-2xl" />
              <Skeleton className="h-12 w-40 rounded-2xl" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-6 flex items-center gap-5">
                  <Skeleton className="h-12 w-12 rounded-2xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-64 rounded" />
                    <Skeleton className="h-4 w-96 rounded" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                  <Skeleton className="h-7 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Main page
  // -----------------------------------------------------------------------

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Demo mode banner */}
      {demoMode && (
        <div className="animate-fade-in-down flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-3 text-sm text-amber-600 dark:text-amber-400">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          <span className="font-medium">Demo Modu</span>
          <span className="text-amber-500/70">API baglantisi kurulamadi. Demo veriler gosteriliyor.</span>
        </div>
      )}

      {/* ---- Header Section ---- */}
      <div
        className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down"
      >
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Ticket className="h-8 w-8 text-indigo-500" />
            Destek Talepleri
          </h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Musteri destek taleplerini olusturun, takip edin ve cozume ulastirin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="rounded-2xl h-12 w-12 border-white/10"
            onClick={() => fetchTickets(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            className="rounded-2xl h-12 px-6 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 font-semibold"
            onClick={() => {
              resetCreateForm();
              setCreateDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Yeni Talep Olustur
          </Button>
        </div>
      </div>

      {/* ---- KPI Stats Cards ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1 animate-fade-in-up"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-indigo-500 bg-indigo-500/10">
              <LayoutList className="h-6 w-6" />
            </div>
            <span className="text-indigo-500 bg-indigo-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Toplam</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Tum Talepler</h3>
            <div className="text-4xl font-bold tracking-tight text-foreground">{stats.total}</div>
          </div>
        </div>

        {/* Open */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-500/10 to-rose-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1 animate-fade-in-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-rose-500 bg-rose-500/10">
              <AlertCircle className="h-6 w-6" />
            </div>
            <span className="text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Acil</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Acik Talepler</h3>
            <div className="text-4xl font-bold tracking-tight text-rose-500">{stats.open}</div>
          </div>
        </div>

        {/* In Progress */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1 animate-fade-in-up"
          style={{ animationDelay: '160ms' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-amber-500 bg-amber-500/10">
              <Clock className="h-6 w-6" />
            </div>
            <span className="text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Devam</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Islemdeki Talepler</h3>
            <div className="text-4xl font-bold tracking-tight text-amber-500">{stats.inProgress}</div>
          </div>
        </div>

        {/* Resolved */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-6 shadow-sm backdrop-blur-xl transition-all hover:shadow-md hover:-translate-y-1 animate-fade-in-up"
          style={{ animationDelay: '240ms' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-2xl text-emerald-500 bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <span className="text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Basarili</span>
          </div>
          <div>
            <h3 className="text-muted-foreground font-medium mb-1">Cozume Ulasanlar</h3>
            <div className="text-4xl font-bold tracking-tight text-emerald-500">{stats.resolved}</div>
          </div>
        </div>
      </div>

      {/* ---- Main Content Card ---- */}
      <Card className="rounded-3xl border-white/10 shadow-xl bg-card/60 backdrop-blur-2xl overflow-hidden animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <CardHeader className="border-b border-border/50 bg-background/50 px-6 py-5">
          <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
            {/* Search */}
            <div className="flex items-center gap-3 w-full lg:w-1/3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
              <Input
                placeholder="Talep ara (ID, baslik, musteri)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-2xl border-white/10 bg-background/50 h-12 w-full text-base transition-colors focus-visible:bg-background"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:flex-1 lg:justify-end">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px] rounded-2xl h-12 border-white/10 bg-background/50 font-medium">
                  <SelectValue placeholder="Durum Filtrele" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-white/10 bg-card/95 backdrop-blur-xl">
                  <SelectItem value="all">Tum Durumlar</SelectItem>
                  <SelectItem value="open">Acik</SelectItem>
                  <SelectItem value="in_progress">Islemde</SelectItem>
                  <SelectItem value="resolved">Cozuldu</SelectItem>
                  <SelectItem value="closed">Kapatildi</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[160px] rounded-2xl h-12 border-white/10 bg-background/50 font-medium">
                  <SelectValue placeholder="Oncelik Filtrele" />
                </SelectTrigger>
                <SelectContent className="rounded-xl shadow-xl border-white/10 bg-card/95 backdrop-blur-xl">
                  <SelectItem value="all">Tum Oncelikler</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                  <SelectItem value="high">Yuksek</SelectItem>
                  <SelectItem value="medium">Orta</SelectItem>
                  <SelectItem value="low">Dusuk</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  onClick={handleClearFilters}
                  className="rounded-xl h-12 font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  <X className="h-4 w-4 mr-2" />
                  Sifirla
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Empty state */}
          {filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mb-6 border border-white/5">
                <Inbox className="h-10 w-10 text-primary/40" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">
                {hasActiveFilters ? 'Sonuc Bulunamadi' : 'Henuz Talep Yok'}
              </h3>
              <p className="text-muted-foreground mb-6 max-w-sm">
                {hasActiveFilters
                  ? 'Girdiginiz filtre kriterlerine uygun destek talebi bulunmuyor. Filtreleri temizleyerek tekrar deneyin.'
                  : 'Sistemde henuz bir destek talebi olusturulmamis. Yeni bir talep olusturarak baslayabilirsiniz.'}
              </p>
              {hasActiveFilters ? (
                <Button variant="outline" onClick={handleClearFilters} className="rounded-xl">
                  <X className="h-4 w-4 mr-2" />
                  Filtreleri Temizle
                </Button>
              ) : (
                <Button
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => {
                    resetCreateForm();
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ilk Talebi Olustur
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Ticket list */}
              <div className="divide-y divide-border/50">
                {paginatedTickets.map((ticket, index) => {
                  const statusCfg = STATUS_CONFIG[ticket.status];
                  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
                  const StatusIcon = statusCfg.icon;
                  const PriorityIcon = priorityCfg.icon;

                  return (
                    <div
                      key={ticket.id}
                      className="p-4 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-6 hover:bg-white/[0.02] cursor-pointer transition-all duration-200 group animate-fade-in-up"
                      style={{ animationDelay: `${index * 40}ms` }}
                      onClick={() => handleTicketClick(ticket)}
                    >
                      {/* Left: Icon + Title */}
                      <div className="flex items-center gap-4 w-full lg:w-5/12 min-w-0">
                        <div className={`flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl ${statusCfg.bgColor} border border-white/5`}>
                          <StatusIcon className={`h-5 w-5 ${statusCfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-mono text-muted-foreground/60">{ticket.id}</span>
                            <Badge
                              variant="secondary"
                              className={`px-2 py-0.5 text-[10px] border-0 rounded-full font-bold shadow-none uppercase tracking-wider ${priorityCfg.bgColor} ${priorityCfg.color}`}
                            >
                              <PriorityIcon className="h-2.5 w-2.5 mr-0.5" />
                              {priorityCfg.label}
                            </Badge>
                          </div>
                          <div className="font-semibold text-[15px] truncate">{ticket.title}</div>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {ticket.customerName}
                            </span>
                            <span className="hidden sm:inline">{formatDateShort(ticket.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Center: Description excerpt */}
                      <div className="w-full lg:flex-1 px-0 lg:px-4 hidden md:block">
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                          {ticket.description || 'Aciklama eklenmemis.'}
                        </p>
                        {ticket.category && (
                          <Badge variant="outline" className="mt-1.5 bg-background/50 border-white/10 text-xs text-muted-foreground">
                            <Tag className="h-2.5 w-2.5 mr-1" />
                            {ticket.category}
                          </Badge>
                        )}
                      </div>

                      {/* Right: Status badge + Actions */}
                      <div className="flex items-center justify-between w-full lg:w-auto lg:justify-end gap-3">
                        <Badge
                          variant="secondary"
                          className={`px-3 py-1 text-xs border-0 rounded-full font-semibold shadow-none ${statusCfg.bgColor} ${statusCfg.color}`}
                        >
                          {statusCfg.label}
                        </Badge>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-xl text-muted-foreground/40 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDeleteClick(e, ticket)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>

                        <ArrowRight className="h-5 w-5 text-muted-foreground/30 hidden lg:block group-hover:text-muted-foreground/60 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="p-4 border-t border-border/50 bg-background/50">
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  pageSize={PAGE_SIZE}
                  totalItems={filteredTickets.length}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/*  DETAIL DIALOG                                                    */}
      {/* ================================================================= */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden border-white/10 shadow-2xl bg-card/95 backdrop-blur-2xl sm:rounded-[2rem]">
          {selectedTicket && (() => {
            const statusCfg = STATUS_CONFIG[selectedTicket.status];
            const priorityCfg = PRIORITY_CONFIG[selectedTicket.priority];
            const StatusIcon = statusCfg.icon;
            const PriorityIcon = priorityCfg.icon;
            const nextStatuses = STATUS_WORKFLOW[selectedTicket.status];

            return (
              <div className="flex flex-col md:flex-row h-full max-h-[85vh]">
                {/* Left panel */}
                <div className="w-full md:w-5/12 border-r border-border/50 bg-background/30 p-8 flex flex-col overflow-y-auto">
                  <div className="flex items-center gap-3 mb-8">
                    <div className={`h-10 w-10 flex items-center justify-center rounded-xl ${statusCfg.bgColor}`}>
                      <StatusIcon className={`h-5 w-5 ${statusCfg.color}`} />
                    </div>
                    <div>
                      <DialogTitle className="text-xl font-bold">
                        {selectedTicket.id}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        Destek Talebi Detaylari
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Customer profile */}
                    <div>
                      <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/70 mb-3">Musteri Profili</h4>
                      <div className="bg-background/50 border border-white/10 p-4 rounded-2xl flex flex-col gap-1">
                        <span className="font-semibold text-lg">{selectedTicket.customerName}</span>
                        {selectedTicket.customerPhone && (
                          <span className="text-muted-foreground text-sm opacity-80">{selectedTicket.customerPhone}</span>
                        )}
                        {selectedTicket.customerEmail && (
                          <span className="text-muted-foreground text-sm opacity-80">{selectedTicket.customerEmail}</span>
                        )}
                      </div>
                    </div>

                    {/* Priority */}
                    <div>
                      <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/70 mb-3">Oncelik Seviyesi</h4>
                      <Badge
                        variant="secondary"
                        className={`px-3 py-1.5 text-sm border rounded-xl font-semibold ${priorityCfg.bgColor} ${priorityCfg.color} ${priorityCfg.borderColor}`}
                      >
                        <PriorityIcon className="h-3.5 w-3.5 mr-1.5" />
                        {priorityCfg.label}
                      </Badge>
                    </div>

                    {/* Status workflow */}
                    <div>
                      <h4 className="text-xs uppercase font-bold tracking-wider text-muted-foreground/70 mb-3">Durum Yonetimi</h4>
                      <div className="flex flex-wrap gap-2">
                        {nextStatuses.map((ns) => {
                          const nsCfg = STATUS_CONFIG[ns];
                          const NsIcon = nsCfg.icon;
                          return (
                            <Button
                              key={ns}
                              variant="outline"
                              size="sm"
                              className={`${nsCfg.bgColor} hover:opacity-80 ${nsCfg.color} border-white/10 rounded-xl`}
                              onClick={() => handleStatusUpdate(selectedTicket.id, ns)}
                              disabled={updatingStatus === selectedTicket.id}
                            >
                              {updatingStatus === selectedTicket.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <NsIcon className="h-3.5 w-3.5 mr-1" />
                              )}
                              {ns === 'in_progress' && 'Isleme Al'}
                              {ns === 'resolved' && 'Cozuldu Isaretle'}
                              {ns === 'closed' && 'Arsive Kapat'}
                            </Button>
                          );
                        })}
                        {selectedTicket.status !== 'closed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 border-rose-500/20 rounded-xl"
                            onClick={() => {
                              setDetailDialogOpen(false);
                              setTicketToDelete(selectedTicket);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Talebi Sil
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-4 text-sm mt-4 border-t border-border/50 pt-6">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" /> Olusturma
                        </span>
                        <span className="font-medium text-right ml-4">{formatDate(selectedTicket.createdAt)}</span>
                      </div>
                      {selectedTicket.updatedAt && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Pencil className="h-3.5 w-3.5" /> Guncelleme
                          </span>
                          <span className="font-medium text-right ml-4">{formatDate(selectedTicket.updatedAt)}</span>
                        </div>
                      )}
                      {selectedTicket.resolvedAt && (
                        <div className="flex justify-between items-center text-emerald-500">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Cozum
                          </span>
                          <span className="font-medium text-right ml-4">{formatDate(selectedTicket.resolvedAt)}</span>
                        </div>
                      )}
                      {selectedTicket.category && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5" /> Kategori
                          </span>
                          <span className="font-medium text-right text-indigo-400">{selectedTicket.category}</span>
                        </div>
                      )}
                      {selectedTicket.assignee && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" /> Atanan
                          </span>
                          <span className="font-medium text-right">{selectedTicket.assignee}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right panel */}
                <div className="w-full md:w-7/12 p-8 flex flex-col gap-6 overflow-y-auto">
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Talep Basligi</h3>
                    <div className="text-lg font-semibold text-foreground mb-4">{selectedTicket.title}</div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Detayli Aciklama</h3>
                    <div className="bg-muted/30 border border-white/5 p-5 rounded-2xl text-foreground/90 leading-relaxed text-sm whitespace-pre-wrap">
                      {selectedTicket.description || (
                        <span className="italic text-muted-foreground opacity-50">Herhangi bir aciklama eklenmemis...</span>
                      )}
                    </div>
                  </div>

                  {selectedTicket.notes && (
                    <div>
                      <h3 className="text-sm font-bold text-muted-foreground mb-3 uppercase tracking-wider">Dahili Notlar</h3>
                      <div className="bg-muted/30 border border-white/5 p-5 rounded-2xl text-foreground/90 leading-relaxed text-sm whitespace-pre-wrap">
                        {selectedTicket.notes}
                      </div>
                    </div>
                  )}

                  <div className="flex-1" />

                  <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
                    <Button variant="ghost" onClick={() => setDetailDialogOpen(false)} className="rounded-xl">
                      Kapat
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/*  CREATE DIALOG                                                    */}
      {/* ================================================================= */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl border-white/10 shadow-2xl bg-card/95 backdrop-blur-2xl sm:rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Plus className="h-5 w-5 text-indigo-500" />
              Yeni Destek Talebi
            </DialogTitle>
            <DialogDescription>
              Musteri talebini olusturmak icin asagidaki formu doldurun.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="ticket-title" className="text-sm font-semibold">
                Talep Basligi <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="ticket-title"
                placeholder="Sorunu kisa ve net olarak tanimlayiniz..."
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="rounded-xl border-white/10 bg-background/50 h-11"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="ticket-desc" className="text-sm font-semibold">
                Detayli Aciklama
              </Label>
              <Textarea
                id="ticket-desc"
                placeholder="Sorunun detaylarini, tekrar etme kosullarini ve beklenen davranisi yaziniz..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="rounded-xl border-white/10 bg-background/50 min-h-[100px] resize-none"
              />
            </div>

            {/* Priority & Category row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Oncelik</Label>
                <Select value={formPriority} onValueChange={(v) => setFormPriority(v as TicketPriority)}>
                  <SelectTrigger className="rounded-xl border-white/10 bg-background/50 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl border-white/10 bg-card/95 backdrop-blur-xl">
                    <SelectItem value="low">Dusuk</SelectItem>
                    <SelectItem value="medium">Orta</SelectItem>
                    <SelectItem value="high">Yuksek</SelectItem>
                    <SelectItem value="critical">Kritik</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Kategori</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="rounded-xl border-white/10 bg-background/50 h-11">
                    <SelectValue placeholder="Kategori secin..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl border-white/10 bg-card/95 backdrop-blur-xl">
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Customer info */}
            <div className="border-t border-border/50 pt-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Musteri Bilgileri
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cust-name" className="text-xs text-muted-foreground">
                    Ad Soyad <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cust-name"
                    placeholder="Musteri adi"
                    value={formCustomerName}
                    onChange={(e) => setFormCustomerName(e.target.value)}
                    className="rounded-xl border-white/10 bg-background/50 h-10 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-email" className="text-xs text-muted-foreground">E-posta</Label>
                  <Input
                    id="cust-email"
                    type="email"
                    placeholder="ornek@mail.com"
                    value={formCustomerEmail}
                    onChange={(e) => setFormCustomerEmail(e.target.value)}
                    className="rounded-xl border-white/10 bg-background/50 h-10 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-phone" className="text-xs text-muted-foreground">Telefon</Label>
                  <Input
                    id="cust-phone"
                    type="tel"
                    placeholder="+90 5XX XXX XX XX"
                    value={formCustomerPhone}
                    onChange={(e) => setFormCustomerPhone(e.target.value)}
                    className="rounded-xl border-white/10 bg-background/50 h-10 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)} className="rounded-xl">
              Iptal
            </Button>
            <Button
              onClick={handleCreateTicket}
              disabled={saving || !formTitle.trim() || !formCustomerName.trim()}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 gap-2 px-6"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Olusturuluyor...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Talebi Olustur
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/*  DELETE CONFIRMATION DIALOG                                       */}
      {/* ================================================================= */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md border-white/10 shadow-2xl bg-card/95 backdrop-blur-2xl sm:rounded-[2rem]">
          <DialogHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center mb-2">
              <Trash2 className="h-7 w-7 text-rose-500" />
            </div>
            <DialogTitle className="text-center text-xl">Talebi Silmek Istediginizden Emin Misiniz?</DialogTitle>
            <DialogDescription className="text-center">
              <span className="font-semibold text-foreground">{ticketToDelete?.title}</span> basligi ile kayitli destek talebi kalici olarak silinecektir. Bu islem geri alinamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl px-6">
              Vazgec
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTicket}
              disabled={deleting}
              className="rounded-xl px-6 gap-2"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Siliniyor...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Evet, Sil
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export with Suspense
// ---------------------------------------------------------------------------

export default function TicketsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <Ticket className="h-8 w-8 animate-pulse text-primary" />
        </div>
      }
    >
      <TicketsPageContent />
    </Suspense>
  );
}
