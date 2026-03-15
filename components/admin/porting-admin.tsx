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
import { useTranslations } from 'next-intl';

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

const STATUS_STYLE: Record<PortingStatus, {
    icon: React.ElementType;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
    color: string;
}> = {
    pending: { icon: Clock, variant: 'secondary', color: 'text-yellow-600' },
    submitted: { icon: Send, variant: 'default', color: 'text-blue-600' },
    in_progress: { icon: ArrowRightLeft, variant: 'outline', color: 'text-orange-600' },
    completed: { icon: CheckCircle2, variant: 'success', color: 'text-emerald-600' },
    rejected: { icon: XCircle, variant: 'destructive', color: 'text-red-600' },
};

const STATUS_LABEL_KEYS: Record<PortingStatus, string> = {
    pending: 'statusPending',
    submitted: 'statusSubmitted',
    in_progress: 'statusInProgress',
    completed: 'statusCompleted',
    rejected: 'statusRejected',
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
    const t = useTranslations('phoneManagement');

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
            if (!res.ok) throw new Error(t('portingLoadFailed'));
            const data = await res.json();
            setRequests(data.requests || []);
        } catch (err) {
            toast({
                title: t('error'),
                description: err instanceof Error ? err.message : t('unknownError'),
                variant: 'error',
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
                throw new Error(err.error || t('updateFailed'));
            }

            const statusLabel = t(STATUS_LABEL_KEYS[newStatus as PortingStatus] || 'statusPending');
            toast({
                title: t('updated'),
                description: t('portingStatusUpdated', { status: statusLabel }),
            });

            setEditingId(null);
            setNewStatus('');
            setAdminNote('');
            await fetchRequests();
        } catch (err) {
            toast({
                title: t('error'),
                description: err instanceof Error ? err.message : t('updateFailed'),
                variant: 'error',
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
                        <p className="text-xs text-muted-foreground">{t('totalRequests')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                        <p className="text-xs text-muted-foreground">{t('statusPending')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold text-orange-600">{stats.inProgress}</div>
                        <p className="text-xs text-muted-foreground">{t('statusInProgress')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-3">
                        <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
                        <p className="text-xs text-muted-foreground">{t('statusCompleted')}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 flex-1">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="max-w-sm"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder={t('filterByStatus')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('all')}</SelectItem>
                        <SelectItem value="pending">{t('statusPending')}</SelectItem>
                        <SelectItem value="submitted">{t('statusSubmitted')}</SelectItem>
                        <SelectItem value="in_progress">{t('statusInProgress')}</SelectItem>
                        <SelectItem value="completed">{t('statusCompleted')}</SelectItem>
                        <SelectItem value="rejected">{t('statusRejected')}</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    {t('refresh')}
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
                                ? t('noPortingRequests')
                                : t('noFilterResults')}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {filtered.map(req => {
                        const style = STATUS_STYLE[req.status as PortingStatus] || STATUS_STYLE.pending;
                        const statusLabel = t(STATUS_LABEL_KEYS[req.status as PortingStatus] || 'statusPending');
                        const StatusIcon = style.icon;
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
                                                <Badge variant={style.variant} className="gap-1">
                                                    <StatusIcon className="h-3 w-3" />
                                                    {statusLabel}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                <span>{t('tenant')}: <span className="font-mono">{req.tenantId.slice(0, 12)}...</span></span>
                                                <span>{req.currentCarrier} → {req.targetCarrier}</span>
                                                {req.estimatedCompletionDate && (
                                                    <span>{t('estimated')}: {req.estimatedCompletionDate}</span>
                                                )}
                                            </div>

                                            {req.notes && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    <span className="font-medium">{t('tenantNote')}:</span> {req.notes}
                                                </p>
                                            )}

                                            {req.adminNotes && (
                                                <p className="text-xs mt-1">
                                                    <span className="font-medium text-orange-600">{t('adminNote')}:</span>{' '}
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
                                                    {t('update')}
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
                                                        <SelectValue placeholder={t('selectNewStatus')} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {nextOptions.map(s => (
                                                            <SelectItem key={s} value={s}>
                                                                {t(STATUS_LABEL_KEYS[s])}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-start gap-2">
                                                <MessageSquare className="h-4 w-4 mt-2.5 text-muted-foreground shrink-0" />
                                                <Textarea
                                                    placeholder={t('adminNotePlaceholder')}
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
                                                    {t('cancel')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleUpdateStatus(req.id)}
                                                    disabled={!newStatus || updating}
                                                >
                                                    {updating && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                                                    {t('save')}
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
