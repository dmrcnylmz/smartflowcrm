'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
    Phone, CheckCircle, XCircle, Clock, AlertTriangle, Upload,
    Play, Pause, Trash2, Plus, FileText, ArrowLeft, Loader2, Users,
} from 'lucide-react';
import type {
    ComplianceScoreResult,
    CampaignContact,
    CampaignSummary,
    ComplianceLevel,
} from '@/lib/compliance/compliance-score';
import { getComplianceLevelColor } from '@/lib/compliance/compliance-score';

// =============================================
// Types
// =============================================

interface Campaign {
    id: string;
    name: string;
    agentId: string;
    fromNumber?: string;
    status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
    contacts: CampaignContactWithStatus[];
    summary: CampaignSummary;
    createdAt: string;
    updatedAt: string;
}

interface CampaignContactWithStatus extends CampaignContact {
    status?: string;
    reason?: string;
    scheduledTime?: string;
}

interface Agent {
    id: string;
    name: string;
}

// =============================================
// Helper: Country flag from phone prefix
// =============================================

function getCountryFlag(phoneNumber: string): string {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    if (normalized.startsWith('+90')) return '🇹🇷';
    if (normalized.startsWith('+49')) return '🇩🇪';
    if (normalized.startsWith('+33')) return '🇫🇷';
    if (normalized.startsWith('+44')) return '🇬🇧';
    if (normalized.startsWith('+1')) return '🇺🇸';
    return '🌍';
}

function getCountryName(phoneNumber: string): string {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    if (normalized.startsWith('+90')) return 'TR';
    if (normalized.startsWith('+49')) return 'DE';
    if (normalized.startsWith('+33')) return 'FR';
    if (normalized.startsWith('+44')) return 'UK';
    if (normalized.startsWith('+1')) return 'US';
    return 'OTHER';
}

// =============================================
// CSV Parser
// =============================================

function parseCSV(text: string): Array<{ phoneNumber: string; name?: string; context?: string }> {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];

    // Detect separator
    const separator = lines[0].includes(';') ? ';' : ',';

    // Check if first line is a header
    const firstLine = lines[0].toLowerCase();
    const hasHeader = firstLine.includes('phone') || firstLine.includes('telefon') ||
        firstLine.includes('name') || firstLine.includes('isim') || firstLine.includes('number');

    const dataLines = hasHeader ? lines.slice(1) : lines;
    const results: Array<{ phoneNumber: string; name?: string; context?: string }> = [];

    for (const line of dataLines) {
        const cols = line.split(separator).map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length === 0 || !cols[0]) continue;

        results.push({
            phoneNumber: cols[0],
            name: cols[1] || undefined,
            context: cols[2] || undefined,
        });
    }

    return results;
}

// =============================================
// Compliance Score Badge Component
// =============================================

function ComplianceBadge({ score }: { score?: ComplianceScoreResult }) {
    if (!score) return <Badge variant="outline" className="text-slate-500">-</Badge>;

    const colorMap: Record<ComplianceLevel, string> = {
        green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
        yellow: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
        red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    };

    return (
        <Badge className={`shadow-none ${colorMap[score.level]}`}>
            {score.score}
        </Badge>
    );
}

// =============================================
// Circular Score Indicator
// =============================================

function CircularScore({ score, level }: { score: number; level: ComplianceLevel }) {
    const colorClass = getComplianceLevelColor(level);
    const colorMap: Record<string, string> = {
        'green-500': '#22c55e',
        'yellow-500': '#eab308',
        'red-500': '#ef4444',
    };
    const strokeColor = colorMap[colorClass] || '#6b7280';
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative w-32 h-32 mx-auto">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="6"
                    fill="none" className="text-slate-200 dark:text-slate-700" />
                <circle cx="50" cy="50" r="45" stroke={strokeColor} strokeWidth="6"
                    fill="none" strokeLinecap="round"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold">{score}</span>
            </div>
        </div>
    );
}

// =============================================
// Status Badge
// =============================================

function StatusBadge({ status, t }: { status: string; t: ReturnType<typeof useTranslations> }) {
    const config: Record<string, { label: string; className: string }> = {
        draft: { label: t('draft'), className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
        running: { label: t('running'), className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
        paused: { label: t('paused'), className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
        completed: { label: t('completed'), className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
        cancelled: { label: t('draft'), className: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
    };
    const c = config[status] || config.draft;
    return <Badge className={`shadow-none ${c.className}`}>{c.label}</Badge>;
}

// =============================================
// Main Page Content
// =============================================

function CampaignsPageContent() {
    const t = useTranslations('campaigns');
    const tc = useTranslations('common');
    const { toast } = useToast();

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewModal, setShowNewModal] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

    // New Campaign form state
    const [campaignName, setCampaignName] = useState('');
    const [selectedAgent, setSelectedAgent] = useState('');
    const [fromNumber, setFromNumber] = useState('');
    const [consentConfirmed, setConsentConfirmed] = useState(false);
    const [manualPhone, setManualPhone] = useState('');
    const [manualName, setManualName] = useState('');
    const [newContacts, setNewContacts] = useState<Array<{ phoneNumber: string; name?: string; context?: string }>>([]);
    const [creating, setCreating] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [agents, setAgents] = useState<Agent[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch campaigns
    const fetchCampaigns = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/campaigns');
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data.campaigns || []);
            }
        } catch {
            console.error('Failed to fetch campaigns');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch agents
    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch('/api/agents');
            if (res.ok) {
                const data = await res.json();
                setAgents(data.agents || []);
            }
        } catch {
            console.error('Failed to fetch agents');
        }
    }, []);

    useEffect(() => {
        fetchCampaigns();
        fetchAgents();
    }, [fetchCampaigns, fetchAgents]);

    // CSV Upload handler
    const handleCSVUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target?.result as string;
            const parsed = parseCSV(text);
            setNewContacts(prev => [...prev, ...parsed]);
            toast({
                title: tc('success'),
                description: `${parsed.length} contacts imported`,
                variant: 'success',
            });
        };
        reader.readAsText(file);

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [toast, tc]);

    // Add manual contact
    const handleAddManual = useCallback(() => {
        if (!manualPhone.trim()) return;
        setNewContacts(prev => [...prev, {
            phoneNumber: manualPhone.trim(),
            name: manualName.trim() || undefined,
        }]);
        setManualPhone('');
        setManualName('');
    }, [manualPhone, manualName]);

    // Create campaign
    const handleCreate = useCallback(async () => {
        if (!campaignName.trim() || !selectedAgent || newContacts.length === 0) return;
        if (!consentConfirmed) {
            toast({
                title: tc('error'),
                description: t('consentRequired'),
                variant: 'error',
            });
            return;
        }

        setCreating(true);
        try {
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: campaignName.trim(),
                    agentId: selectedAgent,
                    contacts: newContacts,
                    fromNumber: fromNumber || undefined,
                    consentConfirmed,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                toast({
                    title: tc('success'),
                    description: `Campaign "${data.name}" created`,
                    variant: 'success',
                });
                setShowNewModal(false);
                resetForm();
                fetchCampaigns();
            } else {
                const err = await res.json();
                toast({ title: tc('error'), description: err.error, variant: 'error' });
            }
        } catch {
            toast({ title: tc('error'), description: 'Failed to create campaign', variant: 'error' });
        } finally {
            setCreating(false);
        }
    }, [campaignName, selectedAgent, newContacts, fromNumber, consentConfirmed, toast, tc, t, fetchCampaigns]);

    // Execute campaign
    const handleExecute = useCallback(async (campaignId: string) => {
        setExecuting(true);
        try {
            const res = await fetch(`/api/campaigns/${campaignId}/execute`, {
                method: 'POST',
            });

            if (res.ok) {
                const data = await res.json();
                toast({
                    title: tc('success'),
                    description: data.message,
                    variant: 'success',
                });
                fetchCampaigns();
                // Refresh selected campaign
                if (selectedCampaign?.id === campaignId) {
                    const detailRes = await fetch(`/api/campaigns/${campaignId}`);
                    if (detailRes.ok) {
                        const detailData = await detailRes.json();
                        setSelectedCampaign(detailData);
                    }
                }
            } else {
                const err = await res.json();
                toast({ title: tc('error'), description: err.error, variant: 'error' });
            }
        } catch {
            toast({ title: tc('error'), description: 'Execution failed', variant: 'error' });
        } finally {
            setExecuting(false);
        }
    }, [toast, tc, fetchCampaigns, selectedCampaign]);

    // Pause/Resume campaign
    const handleStatusChange = useCallback(async (campaignId: string, newStatus: string) => {
        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });

            if (res.ok) {
                toast({ title: tc('success'), description: `Campaign ${newStatus}`, variant: 'success' });
                fetchCampaigns();
            }
        } catch {
            toast({ title: tc('error'), description: 'Status update failed', variant: 'error' });
        }
    }, [toast, tc, fetchCampaigns]);

    // Delete campaign
    const handleDelete = useCallback(async (campaignId: string) => {
        try {
            const res = await fetch(`/api/campaigns/${campaignId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                toast({ title: tc('success'), description: 'Campaign deleted', variant: 'success' });
                setSelectedCampaign(null);
                fetchCampaigns();
            } else {
                const err = await res.json();
                toast({ title: tc('error'), description: err.error, variant: 'error' });
            }
        } catch {
            toast({ title: tc('error'), description: 'Delete failed', variant: 'error' });
        }
    }, [toast, tc, fetchCampaigns]);

    function resetForm() {
        setCampaignName('');
        setSelectedAgent('');
        setFromNumber('');
        setConsentConfirmed(false);
        setNewContacts([]);
        setManualPhone('');
        setManualName('');
    }

    // =============================================
    // Campaign Detail View
    // =============================================

    if (selectedCampaign) {
        const campaign = selectedCampaign;
        const summary = campaign.summary;
        const greenContacts = campaign.contacts.filter(c => c.complianceScore?.level === 'green');

        return (
            <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
                {/* Back button + header */}
                <div className="flex items-center gap-4 animate-fade-in-down">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedCampaign(null)}
                        className="h-9 w-9 rounded-xl">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-xl sm:text-2xl font-bold text-foreground font-display tracking-wide">
                            {campaign.name}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={campaign.status} t={t} />
                            <span className="text-sm text-muted-foreground">
                                {t('totalContacts')}: {summary.totalContacts}
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {campaign.status === 'draft' && greenContacts.length > 0 && (
                            <Button onClick={() => handleExecute(campaign.id)}
                                disabled={executing}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                {t('startCampaign')}
                            </Button>
                        )}
                        {campaign.status === 'running' && (
                            <Button variant="outline" onClick={() => handleStatusChange(campaign.id, 'paused')}
                                className="gap-2">
                                <Pause className="h-4 w-4" /> {t('pauseCampaign')}
                            </Button>
                        )}
                        {campaign.status === 'paused' && (
                            <Button variant="outline" onClick={() => handleStatusChange(campaign.id, 'running')}
                                className="gap-2">
                                <Play className="h-4 w-4" /> {t('resumeCampaign')}
                            </Button>
                        )}
                        {campaign.status !== 'running' && (
                            <Button variant="outline" onClick={() => handleDelete(campaign.id)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 gap-2">
                                <Trash2 className="h-4 w-4" /> {t('deleteCampaign')}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Compliance Score Dashboard */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in-up">
                    {/* Overall Score */}
                    <Card className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6">
                        <p className="text-sm text-muted-foreground text-center mb-3 font-medium">{t('overallScore')}</p>
                        <CircularScore score={summary.overallScore} level={summary.overallLevel} />
                    </Card>

                    {/* Traffic light cards */}
                    <div className="rounded-2xl border border-emerald-500/15 bg-white/[0.02] p-4 backdrop-blur-sm flex flex-col items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-emerald-400 mb-2" />
                        <p className="text-2xl font-bold text-white">{summary.greenCount}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('callable')}</p>
                    </div>

                    <div className="rounded-2xl border border-amber-500/15 bg-white/[0.02] p-4 backdrop-blur-sm flex flex-col items-center justify-center">
                        <Clock className="h-8 w-8 text-amber-400 mb-2" />
                        <p className="text-2xl font-bold text-white">{summary.yellowCount}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('schedulable')}</p>
                    </div>

                    <div className="rounded-2xl border border-red-500/15 bg-white/[0.02] p-4 backdrop-blur-sm flex flex-col items-center justify-center">
                        <XCircle className="h-8 w-8 text-red-400 mb-2" />
                        <p className="text-2xl font-bold text-white">{summary.redCount}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('blocked')}</p>
                    </div>
                </div>

                {/* Progress bar for running campaigns */}
                {campaign.status === 'running' && (
                    <div className="animate-fade-in-up">
                        <div className="flex justify-between text-sm mb-2">
                            <span className="text-muted-foreground">{t('progress')}</span>
                            <span className="text-muted-foreground">
                                {campaign.contacts.filter(c => c.status === 'completed').length} / {summary.totalContacts}
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div
                                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                                style={{
                                    width: `${(campaign.contacts.filter(c => c.status === 'completed').length / summary.totalContacts) * 100}%`,
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Contact Table */}
                <Card className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-muted/30">
                                    <tr>
                                        <th className="text-left px-6 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">{t('phoneNumber')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">{t('contactName')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">{t('country')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">{t('complianceScore')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">{t('status')}</th>
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">{t('reason')}</th>
                                        <th className="text-right px-6 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.04]">
                                    {campaign.contacts.map((contact, idx) => {
                                        const score = contact.complianceScore;
                                        const actionable = score?.actionable;

                                        return (
                                            <tr key={`${contact.phoneNumber}-${idx}`}
                                                className="hover:bg-muted/30 transition-colors">
                                                <td className="px-6 py-3 text-sm font-mono">{contact.phoneNumber}</td>
                                                <td className="px-4 py-3 text-sm">{contact.name || '-'}</td>
                                                <td className="px-4 py-3 text-sm">
                                                    <span className="mr-1">{getCountryFlag(contact.phoneNumber)}</span>
                                                    {getCountryName(contact.phoneNumber)}
                                                </td>
                                                <td className="px-4 py-3"><ComplianceBadge score={score} /></td>
                                                <td className="px-4 py-3">
                                                    <Badge variant="outline" className="shadow-none text-xs capitalize">
                                                        {contact.status || 'pending'}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground">
                                                    {score?.reasons.map(r => t(r as Parameters<typeof t>[0])).join(', ') || contact.reason || '-'}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    {actionable === 'call_now' && (
                                                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 shadow-none">
                                                            <Phone className="h-3 w-3 mr-1" />{t('callNow')}
                                                        </Badge>
                                                    )}
                                                    {actionable === 'schedule' && (
                                                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 shadow-none">
                                                            <Clock className="h-3 w-3 mr-1" />{t('schedule')}
                                                        </Badge>
                                                    )}
                                                    {actionable === 'blocked' && (
                                                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 shadow-none">
                                                            <XCircle className="h-3 w-3 mr-1" />{t('blocked')}
                                                        </Badge>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // =============================================
    // Campaign List View
    // =============================================

    return (
        <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in-down">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-3 font-display tracking-wide">
                        <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center">
                            <Users className="h-5 w-5 text-indigo-500" />
                        </div>
                        {t('title')}
                    </h1>
                </div>
                <Button onClick={() => setShowNewModal(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    {t('newCampaign')}
                </Button>
            </div>

            {/* Campaign List */}
            {loading ? (
                <div className="space-y-4">
                    <Skeleton className="h-24 w-full rounded-2xl" />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                </div>
            ) : campaigns.length === 0 ? (
                <Card className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="h-16 w-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                            <FileText className="h-8 w-8 text-white/20" />
                        </div>
                        <h3 className="text-lg font-semibold text-white/80 mb-2">{t('noCampaigns')}</h3>
                        <p className="text-sm text-white/40 mb-6">{t('createFirst')}</p>
                        <Button onClick={() => setShowNewModal(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                            <Plus className="h-4 w-4" />
                            {t('newCampaign')}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {campaigns.map((campaign) => (
                        <Card key={campaign.id}
                            className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:bg-white/[0.04] transition-colors cursor-pointer"
                            onClick={() => setSelectedCampaign(campaign)}>
                            <CardContent className="p-4 sm:p-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="font-semibold text-foreground truncate">{campaign.name}</h3>
                                            <StatusBadge status={campaign.status} t={t} />
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Users className="h-3.5 w-3.5" />
                                                {campaign.summary.totalContacts} {t('totalContacts').toLowerCase()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Compliance mini summary */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                            <span className="text-muted-foreground">{campaign.summary.greenCount}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                                            <span className="text-muted-foreground">{campaign.summary.yellowCount}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-sm">
                                            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                                            <span className="text-muted-foreground">{campaign.summary.redCount}</span>
                                        </div>
                                        <div className="ml-2 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                                            <span className={`text-sm font-bold text-${getComplianceLevelColor(campaign.summary.overallLevel)}`}>
                                                {campaign.summary.overallScore}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        {campaign.status === 'draft' && campaign.summary.greenCount > 0 && (
                                            <Button size="sm" onClick={() => handleExecute(campaign.id)}
                                                disabled={executing}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                                                <Play className="h-3 w-3" />
                                            </Button>
                                        )}
                                        {campaign.status === 'running' && (
                                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(campaign.id, 'paused')}>
                                                <Pause className="h-3 w-3" />
                                            </Button>
                                        )}
                                        {campaign.status !== 'running' && (
                                            <Button size="sm" variant="outline"
                                                className="text-red-500 hover:text-red-600"
                                                onClick={() => handleDelete(campaign.id)}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* New Campaign Modal */}
            <Dialog open={showNewModal} onOpenChange={setShowNewModal}>
                <DialogContent className="w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-2xl p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader className="p-6 pb-4">
                        <DialogTitle className="text-xl font-bold flex items-center gap-3">
                            <span className="bg-indigo-500/10 p-2 rounded-xl text-indigo-500 border border-indigo-500/20">
                                <Users className="h-5 w-5" />
                            </span>
                            {t('newCampaign')}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="px-6 pb-6 space-y-5">
                        {/* Campaign Name */}
                        <div>
                            <Label className="text-sm font-medium">{t('campaignName')}</Label>
                            <Input
                                value={campaignName}
                                onChange={(e) => setCampaignName(e.target.value)}
                                placeholder={t('campaignName')}
                                className="mt-1.5 rounded-xl"
                            />
                        </div>

                        {/* Agent Selector */}
                        <div>
                            <Label className="text-sm font-medium">{t('selectAgent')}</Label>
                            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                                <SelectTrigger className="mt-1.5 rounded-xl">
                                    <SelectValue placeholder={t('selectAgent')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {agents.map(agent => (
                                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* From Number */}
                        <div>
                            <Label className="text-sm font-medium">{t('selectFromNumber')}</Label>
                            <Input
                                value={fromNumber}
                                onChange={(e) => setFromNumber(e.target.value)}
                                placeholder="+90..."
                                className="mt-1.5 rounded-xl"
                            />
                        </div>

                        {/* CSV Upload */}
                        <div>
                            <Label className="text-sm font-medium">{t('uploadCsv')}</Label>
                            <div
                                className="mt-1.5 border-2 border-dashed border-border/60 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file && file.name.endsWith('.csv')) {
                                        const reader = new FileReader();
                                        reader.onload = (evt) => {
                                            const text = evt.target?.result as string;
                                            const parsed = parseCSV(text);
                                            setNewContacts(prev => [...prev, ...parsed]);
                                        };
                                        reader.readAsText(file);
                                    }
                                }}
                            >
                                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">{t('dragDropCsv')}</p>
                                <p className="text-xs text-muted-foreground/70 mt-1">{t('orClickToSelect')}</p>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleCSVUpload}
                                className="hidden"
                            />
                        </div>

                        {/* Manual Add */}
                        <div>
                            <Label className="text-sm font-medium">{t('addManually')}</Label>
                            <div className="flex gap-2 mt-1.5">
                                <Input
                                    value={manualPhone}
                                    onChange={(e) => setManualPhone(e.target.value)}
                                    placeholder={t('phoneNumber')}
                                    className="flex-1 rounded-xl"
                                />
                                <Input
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                    placeholder={t('contactName')}
                                    className="flex-1 rounded-xl"
                                />
                                <Button variant="outline" onClick={handleAddManual} className="rounded-xl">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Contact Preview */}
                        {newContacts.length > 0 && (
                            <div>
                                <Label className="text-sm font-medium">{t('totalContacts')}: {newContacts.length}</Label>
                                <div className="mt-1.5 max-h-40 overflow-y-auto border rounded-xl divide-y divide-border/40">
                                    {newContacts.map((contact, idx) => (
                                        <div key={`${contact.phoneNumber}-${idx}`}
                                            className="flex items-center justify-between px-4 py-2 text-sm">
                                            <div>
                                                <span className="font-mono">{contact.phoneNumber}</span>
                                                {contact.name && <span className="ml-2 text-muted-foreground">{contact.name}</span>}
                                            </div>
                                            <Button variant="ghost" size="sm"
                                                onClick={() => setNewContacts(prev => prev.filter((_, i) => i !== idx))}
                                                className="h-6 w-6 p-0 text-red-500">
                                                <XCircle className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Consent Checkbox */}
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <input
                                type="checkbox"
                                id="consent"
                                checked={consentConfirmed}
                                onChange={(e) => setConsentConfirmed(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-amber-500/50 text-amber-600 focus:ring-amber-500"
                            />
                            <label htmlFor="consent" className="text-sm">
                                <span className="font-medium text-amber-800 dark:text-amber-300">{t('consentConfirmation')}</span>
                                <br />
                                <span className="text-xs text-amber-700/70 dark:text-amber-400/70">{t('consentRequired')}</span>
                            </label>
                        </div>

                        {/* Submit */}
                        <Button
                            onClick={handleCreate}
                            disabled={creating || !campaignName.trim() || !selectedAgent || newContacts.length === 0 || !consentConfirmed}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl gap-2"
                        >
                            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            {t('createCampaign')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function CampaignsPage() {
    return (
        <Suspense fallback={<div className="p-8 max-w-6xl mx-auto space-y-6"><Skeleton className="h-[400px] w-full rounded-2xl" /></div>}>
            <CampaignsPageContent />
        </Suspense>
    );
}
