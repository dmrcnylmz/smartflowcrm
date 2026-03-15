'use client';

/**
 * NumberPoolAdmin — Super-Admin Pool Management
 *
 * Provides admin interface for managing the +90 number pool:
 * - Pool statistics (total/available/assigned)
 * - Add numbers (single or bulk)
 * - Remove available numbers
 * - Filter by carrier and status
 *
 * This component is intended for super-admin dashboard, not tenant admins.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
    Database, Plus, Trash2, Loader2, RefreshCw, Phone,
    CheckCircle, Clock, User,
} from 'lucide-react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useTranslations } from 'next-intl';

// =============================================
// Types
// =============================================

interface PoolStats {
    total: number;
    available: number;
    assigned: number;
    reserved: number;
    byCarrier: Record<string, { total: number; available: number }>;
}

interface PoolNumber {
    id: string;
    phoneNumber: string;
    sipCarrier: string;
    status: string;
    reservedFor?: string;
    monthlyRate: number;
}

// =============================================
// Component
// =============================================

export default function NumberPoolAdmin() {
    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const t = useTranslations('phoneManagement');

    const [stats, setStats] = useState<PoolStats | null>(null);
    const [numbers, setNumbers] = useState<PoolNumber[]>([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);

    // Add form
    const [showAddForm, setShowAddForm] = useState(false);
    const [addPhone, setAddPhone] = useState('');
    const [addCarrier, setAddCarrier] = useState<'netgsm' | 'bulutfon'>('netgsm');
    const [addRate, setAddRate] = useState('1.00');

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterCarrier, setFilterCarrier] = useState<string>('');

    // ─── Fetch Pool Data ───
    const fetchPool = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (filterStatus) params.set('status', filterStatus);
            if (filterCarrier) params.set('carrier', filterCarrier);

            const res = await authFetch(`/api/phone/pool?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data.stats || null);
                setNumbers(data.numbers || []);
            }
        } catch {
            // Silent
        } finally {
            setLoading(false);
        }
    }, [authFetch, filterStatus, filterCarrier]);

    useEffect(() => {
        fetchPool();
    }, [fetchPool]);

    // ─── Add Number ───
    async function handleAdd() {
        if (!addPhone) return;

        setAdding(true);
        try {
            const res = await authFetch('/api/phone/pool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    numbers: [{ phone: addPhone, carrier: addCarrier, rate: parseFloat(addRate) }],
                }),
            });

            const data = await res.json();
            if (res.ok) {
                toast({
                    title: t('numberAdded'),
                    description: t('numberAddedDesc', { added: data.added, skipped: data.skipped || 0 }),
                    variant: 'success',
                });
                setAddPhone('');
                setShowAddForm(false);
                fetchPool();
            } else {
                toast({ title: t('error'), description: data.error, variant: 'error' });
            }
        } catch {
            toast({ title: t('error'), description: t('numberAddError'), variant: 'error' });
        } finally {
            setAdding(false);
        }
    }

    // ─── Remove Number ───
    async function handleRemove(poolEntryId: string) {
        if (!confirm(t('poolRemoveConfirm'))) return;

        setRemoving(poolEntryId);
        try {
            const res = await authFetch('/api/phone/pool', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ poolEntryId }),
            });

            if (res.ok) {
                toast({ title: t('numberRemoved'), description: t('numberRemovedDesc'), variant: 'success' });
                fetchPool();
            } else {
                const data = await res.json();
                toast({ title: t('error'), description: data.error, variant: 'error' });
            }
        } catch {
            toast({ title: t('error'), description: t('operationError'), variant: 'error' });
        } finally {
            setRemoving(null);
        }
    }

    // ─── Loading ───
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <Skeleton className="h-48 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label={t('poolTotal')} value={stats.total} icon={Database} color="text-blue-500" bgColor="bg-blue-500/10" />
                    <StatCard label={t('poolAvailable')} value={stats.available} icon={CheckCircle} color="text-emerald-500" bgColor="bg-emerald-500/10" />
                    <StatCard label={t('poolAssigned')} value={stats.assigned} icon={User} color="text-purple-500" bgColor="bg-purple-500/10" />
                    <StatCard label={t('poolReserved')} value={stats.reserved} icon={Clock} color="text-amber-500" bgColor="bg-amber-500/10" />
                </div>
            )}

            {/* Carrier Breakdown */}
            {stats && Object.keys(stats.byCarrier).length > 0 && (
                <div className="flex gap-3">
                    {Object.entries(stats.byCarrier).map(([carrier, data]) => (
                        <Badge key={carrier} variant="outline" className="px-3 py-1">
                            {carrier}: {data.available}/{data.total} {t('poolAvailable').toLowerCase()}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Pool Numbers */}
            <Card className="rounded-2xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-5 w-5 text-blue-500" />
                                {t('numberPool')}
                            </CardTitle>
                            <CardDescription>
                                {t('numberPoolDesc')}
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={fetchPool} className="gap-2">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="gap-2">
                                <Plus className="h-3.5 w-3.5" />
                                {t('addNumber')}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Add Form */}
                    {showAddForm && (
                        <div className="border rounded-xl p-4 mb-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                            <h4 className="text-sm font-medium">{t('addNumberToPool')}</h4>
                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <Label htmlFor="poolPhone">{t('phoneNumber')}</Label>
                                    <Input
                                        id="poolPhone"
                                        value={addPhone}
                                        onChange={(e) => setAddPhone(e.target.value)}
                                        placeholder="+902121234567"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="poolCarrier">{t('carrier')}</Label>
                                    <select
                                        id="poolCarrier"
                                        value={addCarrier}
                                        onChange={(e) => setAddCarrier(e.target.value as 'netgsm' | 'bulutfon')}
                                        className="flex h-10 rounded-lg border border-input bg-background px-3 py-2 text-sm mt-1"
                                    >
                                        <option value="netgsm">Netgsm</option>
                                        <option value="bulutfon">Bulutfon</option>
                                    </select>
                                </div>
                                <div className="w-24">
                                    <Label htmlFor="poolRate">$/ay</Label>
                                    <Input
                                        id="poolRate"
                                        type="number"
                                        step="0.01"
                                        value={addRate}
                                        onChange={(e) => setAddRate(e.target.value)}
                                        className="mt-1"
                                    />
                                </div>
                                <Button onClick={handleAdd} disabled={adding || !addPhone} className="gap-2">
                                    {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {t('add')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex gap-2 mb-4">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="flex h-8 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                        >
                            <option value="">{t('allStatuses')}</option>
                            <option value="available">{t('poolAvailable')}</option>
                            <option value="assigned">{t('poolAssigned')}</option>
                            <option value="reserved">{t('poolReserved')}</option>
                        </select>
                        <select
                            value={filterCarrier}
                            onChange={(e) => setFilterCarrier(e.target.value)}
                            className="flex h-8 rounded-lg border border-input bg-background px-2 py-1 text-xs"
                        >
                            <option value="">{t('allCarriers')}</option>
                            <option value="netgsm">Netgsm</option>
                            <option value="bulutfon">Bulutfon</option>
                        </select>
                    </div>

                    {/* Numbers Table */}
                    {numbers.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Database className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">{t('noNumbersInPool')}</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {numbers.map((num) => (
                                <div key={num.id} className="flex items-center justify-between py-2.5">
                                    <div className="flex items-center gap-3">
                                        <Phone className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <span className="text-sm font-mono">{num.phoneNumber}</span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                                    {num.sipCarrier}
                                                </Badge>
                                                <PoolStatusBadge status={num.status} />
                                                <span className="text-[10px] text-muted-foreground">${num.monthlyRate}/ay</span>
                                                {num.reservedFor && (
                                                    <span className="text-[10px] text-purple-500">→ {num.reservedFor.slice(0, 8)}...</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {num.status !== 'assigned' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemove(num.id)}
                                            disabled={removing === num.id}
                                            className="text-red-500 hover:text-red-600 h-8 w-8 p-0"
                                        >
                                            {removing === num.id
                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                : <Trash2 className="h-3.5 w-3.5" />
                                            }
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// =============================================
// Sub-components
// =============================================

function StatCard({ label, value, icon: Icon, color, bgColor }: {
    label: string; value: number; icon: React.ElementType; color: string; bgColor: string;
}) {
    return (
        <Card className="rounded-2xl">
            <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl ${bgColor} flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-foreground">{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function PoolStatusBadge({ status }: { status: string }) {
    const t = useTranslations('phoneManagement');
    const config: Record<string, { label: string; className: string }> = {
        available: { label: t('poolAvailable'), className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
        assigned: { label: t('poolAssigned'), className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
        reserved: { label: t('poolReserved'), className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    };

    const c = config[status] || config.available;

    return (
        <span className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium border ${c.className}`}>
            {c.label}
        </span>
    );
}
