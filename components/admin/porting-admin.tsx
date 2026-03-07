'use client';

/**
 * Porting Admin — Super-Admin Porting Request Management
 *
 * Features:
 *   - List all porting requests across tenants
 *   - Filter by status (pending, submitted, in_progress, completed, rejected)
 *   - Update request status with admin notes
 *   - Complete porting (triggers number activation)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ArrowRightLeft,
    Clock,
    CheckCircle2,
    XCircle,
    FileText,
    Send,
    Loader2,
    RefreshCw,
    Filter,
    MessageSquare,
} from 'lucide-react';

// ─── Types ───

interface PortingRequest {
    id: string;
    tenantId: string;
    phoneNumber: string;
    currentCarrier: string;
    targetCarrier: string;
    status: string;
    notes?: string;
    adminNotes?: string;
    estimatedCompletionDate?: string;
    submittedAt?: string;
    updatedAt?: string;
}

type PortingStatus = 'pending' | 'submitted' | 'in_progress' | 'completed' | 'rejected';

const STATUS_CONFIG: Record<PortingStatus, {
    label: string;
    icon: React.ElementType;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
    color: string;
}> = {
    pending: {
        label: 'Beklemede',
        icon: Clock,
        variant: 'secondary',
        color: 'text-yellow-600',
    },
    submitted: {
        label: 'Gönderildi',
        icon: Send,
        variant: 'default',
        color: 'text-blue-600',
    },
    in_progress: {
        label: 'İşleniyor',
        icon: ArrowRightLeft,
        variant: 'outline',
        color: 'text-orange-600',
    },
    completed: {
        label: 'Tamamlandı',
        icon: CheckCircle2,
        variant: 'success',
        color: 'text-emerald-600',
    },
    rejected: {
        label: 'Reddedildi',
        icon: XCircle,
        variant: 'destructive',
        color: 'text-red-600',
    },
};

const NEXT_STATUS_OPTIONS: Record<string, PortingStatus[]> = {
    pending: ['submitted', 'rejected'],
    submitted: ['in_progress', 'rejected'],
    in_progress: ['completed', 'rejected'],
    completed: [],
    rejected: ['pending'],
};

// ─── Component ───

export default function PortingAdmin() {
    const authFetch = useAuthFetch();
    const { toast } = useToast();

    const [requests, setRequests] = useState<PortingRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newStatus, setNewStatus] = useState<string>('');
    const [adminNote, setAdminNote] = useState('');
    const [updating, setUpdating] = useState(false);

    // ─── Fetch ───

    const fetchRequests = useCallback(async () => {
        try {
            setLoading(true);
            const res = await authFetch('/api/phone/porting?all=true');
            if (!res.ok) throw new Error('Porting istekleri yüklenemedi');
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            toast({
                title: 'Hata',
                description: err instanceof Error ? err.message : 'Bilinmeyen hata',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    }, [authFetch, toast]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    // ─── Update Status ───

    const handleUpdateStatus = async (requestId: string) => {
        if (!newStatus) return;

        try {
            setUpdating(true);

            const body: Record<string, string> = {
                requestId,
                status: newStatus,
            };
            if (adminNote.trim()) {
                body.adminNotes = adminNote.trim();
            }

            const res = await authFetch('/api/phone/porting', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Güncelleme başarısız');
            }

            toast({
                title: 'Güncellendi',
                description: `Porting durumu "${STATUS_CONFIG[newStatus as PortingStatus]?.label}" olarak güncellendi.`,
            });

            setEditingId(null);
            setNewStatus('');
            setAdminNote('');
            await fetchRequests();
        } catch (err) {
            toast({
                title: 'Hata',
                description: err instanceof Error ? err.message : 'Güncelleme başarısız',
                variant: 'destructive',
            });
        } finally {
            setUpdating(false);
        }
    };

    // ─── Filter ───

    const filtered = requests.filter(r => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                r.phoneNumber.toLowerCase().includes(q) ||
                r.tenantId.toLowerCase().includes(q) ||
                r.currentCarrier.toLowerCase().includes(q)
            );
        }
        return true;
    });

    // ─── Stats ───

    const stats = {
        total: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        inProgress: requests.filter(r => ['submitted', 'in_progress'].includes(r.status)).length,
        completed: requests.filter(r => r.status === 'completed').length,
    };

    // ─── Render ───

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold">{stats.total}</div>
                        <p className="text-xs text-muted-foreground">Toplam İstek</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                        <p className="text-xs text-muted-foreground">Beklemede</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold text-orange-600">{stats.inProgress}</div>
                        <p className="text-xs text-muted-foreground">İşlemde</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
                        <p className="text-xs text-muted-foreground">Tamamlandı</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 flex-1">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Numara, tenant veya operatör ara..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="max-w-sm"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Durum filtrele" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tümü</SelectItem>
                        <SelectItem value="pending">Beklemede</SelectItem>
                        <SelectItem value="submitted">Gönderildi</SelectItem>
                        <SelectItem value="in_progress">İşleniyor</SelectItem>
                        <SelectItem value="completed">Tamamlandı</SelectItem>
                        <SelectItem value="rejected">Reddedildi</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Yenile
                </Button>
            </div>

            {/* Request List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : filtered.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">
                            {requests.length === 0
                                ? 'Henüz porting isteği yok.'
                                : 'Filtrelere uygun istek bulunamadı.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map(req => {
                        const config = STATUS_CONFIG[req.status as PortingStatus] || STATUS_CONFIG.pending;
                        const StatusIcon = config.icon;
                        const isEditing = editingId === req.id;
                        const nextOptions = NEXT_STATUS_OPTIONS[req.status] || [];

                        return (
                            <Card key={req.id} className="overflow-hidden">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        {/* Left — Info */}
                                        <div className="space-y-1 min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-semibold text-sm">
                                                    {req.phoneNumber}
                                                </span>
                                                <Badge variant={config.variant} className="gap-1">
                                                    <StatusIcon className="h-3 w-3" />
                                                    {config.label}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                <span>Tenant: <span className="font-mono">{req.tenantId.slice(0, 12)}...</span></span>
                                                <span>{req.currentCarrier} → {req.targetCarrier}</span>
                                                {req.estimatedCompletionDate && (
                                                    <span>Tahmini: {req.estimatedCompletionDate}</span>
                                                )}
                                            </div>

                                            {req.notes && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    <span className="font-medium">Tenant notu:</span> {req.notes}
                                                </p>
                                            )}

                                            {req.adminNotes && (
                                                <p className="text-xs mt-1">
                                                    <span className="font-medium text-orange-600">Admin notu:</span>{' '}
                                                    {req.adminNotes}
                                                </p>
                                            )}
                                        </div>

                                        {/* Right — Actions */}
                                        <div className="shrink-0">
                                            {nextOptions.length > 0 && !isEditing && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        setEditingId(req.id);
                                                        setNewStatus('');
                                                        setAdminNote('');
                                                    }}
                                                >
                                                    Güncelle
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Edit Panel */}
                                    {isEditing && (
                                        <div className="mt-4 pt-4 border-t space-y-3">
                                            <div className="flex gap-3">
                                                <Select value={newStatus} onValueChange={setNewStatus}>
                                                    <SelectTrigger className="w-[200px]">
                                                        <SelectValue placeholder="Yeni durum seç" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {nextOptions.map(s => (
                                                            <SelectItem key={s} value={s}>
                                                                {STATUS_CONFIG[s].label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-start gap-2">
                                                <MessageSquare className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
                                                <Textarea
                                                    placeholder="Admin notu (opsiyonel)..."
                                                    value={adminNote}
                                                    onChange={e => setAdminNote(e.target.value)}
                                                    rows={2}
                                                    className="resize-none"
                                                />
                                            </div>

                                            <div className="flex gap-2 justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setEditingId(null)}
                                                    disabled={updating}
                                                >
                                                    İptal
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleUpdateStatus(req.id)}
                                                    disabled={!newStatus || updating}
                                                >
                                                    {updating && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                                                    Kaydet
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
