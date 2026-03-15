'use client';

/**
 * Voicemail List Component
 *
 * Displays recent voicemails for the current tenant.
 * Features:
 *   - List voicemails with caller info, duration, date
 *   - Audio player for each voicemail
 *   - Mark as listened / archive
 *   - Badge for new (unlistened) voicemails
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Voicemail,
    Play,
    Pause,
    Clock,
    Phone,
    CheckCircle2,
    Archive,
    Loader2,
    RefreshCw,
    Volume2,
} from 'lucide-react';

// ─── Types ───

interface VoicemailRecord {
    id: string;
    tenantId: string;
    callSid?: string;
    from: string;
    recordingUrl?: string;
    recordingSid?: string;
    durationSeconds: number;
    status: 'new' | 'listened' | 'archived';
    createdAt?: { _seconds: number };
    listenedAt?: { _seconds: number };
    listenedBy?: string;
}

// ─── Helpers ───

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatDate(timestamp: { _seconds: number } | undefined, appLocale: string): string {
    if (!timestamp?._seconds) return '—';
    const date = new Date(timestamp._seconds * 1000);
    const localeMap: Record<string, string> = {
        tr: 'tr-TR',
        en: 'en-US',
        de: 'de-DE',
        fr: 'fr-FR',
    };
    return date.toLocaleDateString(localeMap[appLocale] || localeMap.tr, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ─── Component ───

export default function VoicemailList() {
    const authFetch = useAuthFetch();
    const { toast } = useToast();
    const t = useTranslations('voice');
    const tCommon = useTranslations('common');
    const locale = useLocale();

    const [voicemails, setVoicemails] = useState<VoicemailRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    function getStatusConfig(status: string) {
        switch (status) {
            case 'new':
                return { label: t('statusNew'), variant: 'default' as const, color: 'text-blue-600' };
            case 'listened':
                return { label: t('statusListened'), variant: 'secondary' as const, color: 'text-muted-foreground' };
            case 'archived':
                return { label: t('statusArchived'), variant: 'outline' as const, color: 'text-muted-foreground' };
            default:
                return { label: status, variant: 'secondary' as const, color: 'text-muted-foreground' };
        }
    }

    // ─── Fetch ───

    const fetchVoicemails = useCallback(async () => {
        try {
            setLoading(true);
            const res = await authFetch('/api/tenant/voicemails');
            if (!res.ok) throw new Error(t('voicemailLoadError'));
            const data = await res.json();
            setVoicemails(data.voicemails || []);
        } catch (err) {
            toast({
                title: tCommon('error'),
                description: err instanceof Error ? err.message : t('unknownError'),
                variant: 'error',
            });
        } finally {
            setLoading(false);
        }
    }, [authFetch, toast, t, tCommon]);

    useEffect(() => {
        fetchVoicemails();
    }, [fetchVoicemails]);

    // ─── Audio ───

    const handlePlay = (vm: VoicemailRecord) => {
        if (!vm.recordingUrl) return;

        if (playingId === vm.id) {
            // Pause
            audioRef.current?.pause();
            setPlayingId(null);
            return;
        }

        // Stop current if playing
        if (audioRef.current) {
            audioRef.current.pause();
        }

        // Play new
        const audio = new Audio(vm.recordingUrl);
        audio.onended = () => setPlayingId(null);
        audio.play().catch(() => {
            toast({
                title: t('playError'),
                description: t('playErrorDesc'),
                variant: 'error',
            });
        });
        audioRef.current = audio;
        setPlayingId(vm.id);

        // Mark as listened
        if (vm.status === 'new') {
            markAsListened(vm.id);
        }
    };

    // ─── Status Update ───

    const markAsListened = async (voicemailId: string) => {
        try {
            await authFetch('/api/tenant/voicemails', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voicemailId, status: 'listened' }),
            });
            setVoicemails(prev =>
                prev.map(v => v.id === voicemailId ? { ...v, status: 'listened' } : v)
            );
        } catch {
            // Silent fail for status update
        }
    };

    const handleArchive = async (voicemailId: string) => {
        try {
            const res = await authFetch('/api/tenant/voicemails', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voicemailId, status: 'archived' }),
            });
            if (!res.ok) throw new Error(t('archiveError'));

            setVoicemails(prev =>
                prev.map(v => v.id === voicemailId ? { ...v, status: 'archived' } : v)
            );
            toast({ title: t('archived'), description: t('archivedDesc') });
        } catch (err) {
            toast({
                title: tCommon('error'),
                description: err instanceof Error ? err.message : t('archiveError'),
                variant: 'error',
            });
        }
    };

    // ─── Stats ───

    const newCount = voicemails.filter(v => v.status === 'new').length;
    const activeVoicemails = voicemails.filter(v => v.status !== 'archived');

    // ─── Render ───

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Voicemail className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <CardTitle className="text-base">{t('voicemails')}</CardTitle>
                            <CardDescription>{t('voicemailsDesc')}</CardDescription>
                        </div>
                        {newCount > 0 && (
                            <Badge variant="default" className="ml-2">
                                {t('newCount', { count: newCount })}
                            </Badge>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchVoicemails} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : activeVoicemails.length === 0 ? (
                    <div className="text-center py-8">
                        <Volume2 className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                        <p className="text-sm text-muted-foreground">{t('noVoicemails')}</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {activeVoicemails.map(vm => {
                            const statusConfig = getStatusConfig(vm.status);
                            const isPlaying = playingId === vm.id;

                            return (
                                <div
                                    key={vm.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                        vm.status === 'new' ? 'bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900' : ''
                                    }`}
                                >
                                    {/* Play button */}
                                    <Button
                                        variant={isPlaying ? 'default' : 'outline'}
                                        size="sm"
                                        className="shrink-0 h-9 w-9 p-0"
                                        onClick={() => handlePlay(vm)}
                                        disabled={!vm.recordingUrl}
                                    >
                                        {isPlaying
                                            ? <Pause className="h-4 w-4" />
                                            : <Play className="h-4 w-4" />
                                        }
                                    </Button>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Phone className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-sm font-mono font-medium truncate">
                                                {vm.from}
                                            </span>
                                            <Badge variant={statusConfig.variant} className="text-[10px]">
                                                {statusConfig.label}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {formatDuration(vm.durationSeconds)}
                                            </span>
                                            <span>{formatDate(vm.createdAt, locale)}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {vm.status === 'new' && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 w-8 p-0"
                                                onClick={() => markAsListened(vm.id)}
                                                title={t('markListened')}
                                            >
                                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => handleArchive(vm.id)}
                                            title={t('archive')}
                                        >
                                            <Archive className="h-4 w-4 text-muted-foreground" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
