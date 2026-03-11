'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Play,
    Square,
    Loader2,
    Volume2,
    Mic,
    Zap,
    Clock,
    Star,
    Filter,
} from 'lucide-react';
import {
    VOICE_CATALOG,
    filterVoices,
    getProviderDisplayName,
    getTierColor,
    getLatencyLabel,
    type VoiceCatalogEntry,
    type TTSProvider,
    type VoiceGender,
} from '@/lib/voice/voice-catalog';

// =============================================
// Types
// =============================================

interface VoiceSelectorProps {
    /** Currently selected voice catalog ID */
    selectedVoiceId?: string;
    /** Callback when voice is selected */
    onSelect: (voice: VoiceCatalogEntry) => void;
    /** Filter by language */
    language?: 'tr' | 'en';
    /** Compact mode (dropdown-like) */
    compact?: boolean;
    /** Auth-aware fetch function (from useAuthFetch) */
    authFetch?: (url: string, init?: RequestInit) => Promise<Response>;
    /** Class name */
    className?: string;
}

// =============================================
// Component
// =============================================

export function VoiceSelector({
    selectedVoiceId,
    onSelect,
    language,
    compact = false,
    authFetch,
    className = '',
}: VoiceSelectorProps) {
    // ---- State ----
    const [providerFilter, setProviderFilter] = useState<TTSProvider | null>(null);
    const [genderFilter, setGenderFilter] = useState<VoiceGender | null>(null);
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ---- Filtered voices ----
    const voices = filterVoices({
        provider: providerFilter || undefined,
        language: language || undefined,
        gender: genderFilter || undefined,
    });

    // ---- Group by provider ----
    const grouped = voices.reduce<Record<TTSProvider, VoiceCatalogEntry[]>>(
        (acc, v) => {
            acc[v.provider].push(v);
            return acc;
        },
        { elevenlabs: [], google: [], kokoro: [], openai: [] },
    );

    // ---- Cleanup audio on unmount ----
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // ---- Preview playback ----
    const handlePreview = useCallback(async (voice: VoiceCatalogEntry) => {
        // Stop current
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        // If clicking same voice, just stop
        if (playingVoiceId === voice.id) {
            setPlayingVoiceId(null);
            return;
        }

        setLoadingVoiceId(voice.id);
        setPlayingVoiceId(null);

        try {
            const fetchFn = authFetch || fetch;
            const res = await fetchFn('/api/voice/tts/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voiceCatalogId: voice.id }),
            });

            if (!res.ok) throw new Error(`Preview failed: ${res.status}`);

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);

            audio.onended = () => {
                setPlayingVoiceId(null);
                URL.revokeObjectURL(url);
            };

            audio.onplay = () => {
                setPlayingVoiceId(voice.id);
                setLoadingVoiceId(null);
            };

            audio.onerror = () => {
                setPlayingVoiceId(null);
                setLoadingVoiceId(null);
            };

            audioRef.current = audio;
            await audio.play();
        } catch {
            setLoadingVoiceId(null);
            setPlayingVoiceId(null);
        }
    }, [playingVoiceId, authFetch]);

    // ---- Provider filter buttons ----
    const providerButtons: { value: TTSProvider | null; label: string; icon: string }[] = [
        { value: null, label: 'Tümü', icon: '🎤' },
        { value: 'elevenlabs', label: 'ElevenLabs', icon: '⚡' },
        { value: 'google', label: 'Gemini', icon: '✨' },
        { value: 'kokoro', label: 'Kokoro', icon: '🔊' },
    ];

    return (
        <div className={`space-y-4 ${className}`}>
            {/* ---- Filters ---- */}
            <div className="flex flex-wrap gap-2">
                {/* Provider */}
                <div className="flex gap-1">
                    {providerButtons.map(btn => (
                        <Button
                            key={btn.label}
                            variant={providerFilter === btn.value ? 'default' : 'outline'}
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() => setProviderFilter(btn.value)}
                        >
                            <span className="mr-1">{btn.icon}</span>
                            {btn.label}
                        </Button>
                    ))}
                </div>

                {/* Gender */}
                <div className="flex gap-1 ml-2">
                    <Button
                        variant={genderFilter === null ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => setGenderFilter(null)}
                    >
                        <Filter className="w-3 h-3 mr-1" />
                        Hepsi
                    </Button>
                    <Button
                        variant={genderFilter === 'female' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => setGenderFilter('female')}
                    >
                        Kadın
                    </Button>
                    <Button
                        variant={genderFilter === 'male' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => setGenderFilter('male')}
                    >
                        Erkek
                    </Button>
                </div>
            </div>

            {/* ---- Voice Count ---- */}
            <p className="text-xs text-muted-foreground">
                {voices.length} ses bulundu ({VOICE_CATALOG.length} toplam katalog)
            </p>

            {/* ---- Voice List by Provider ---- */}
            <div className="space-y-4">
                {(['elevenlabs', 'google', 'kokoro'] as TTSProvider[]).map(provider => {
                    const providerVoices = grouped[provider];
                    if (providerVoices.length === 0) return null;

                    return (
                        <div key={provider}>
                            {/* Provider Header */}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {getProviderDisplayName(provider)}
                                </span>
                                <Badge variant="secondary" className="text-[10px] h-4">
                                    {providerVoices.length}
                                </Badge>
                            </div>

                            {/* Voice Cards */}
                            <div className="grid gap-2">
                                {providerVoices.map(voice => {
                                    const isSelected = selectedVoiceId === voice.id;
                                    const isPlaying = playingVoiceId === voice.id;
                                    const isLoading = loadingVoiceId === voice.id;
                                    const latency = getLatencyLabel(voice.avgLatencyMs);

                                    return (
                                        <Card
                                            key={voice.id}
                                            className={`cursor-pointer transition-all duration-150 ${
                                                isSelected
                                                    ? 'ring-2 ring-primary bg-primary/5'
                                                    : 'hover:bg-muted/50'
                                            }`}
                                            onClick={() => onSelect(voice)}
                                        >
                                            <CardContent className="p-3">
                                                <div className="flex items-center justify-between">
                                                    {/* Left: Voice info */}
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        {/* Icon */}
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                                                            voice.gender === 'female'
                                                                ? 'bg-pink-500/20 text-pink-400'
                                                                : 'bg-blue-500/20 text-blue-400'
                                                        }`}>
                                                            {voice.gender === 'female' ? '♀' : '♂'}
                                                        </div>

                                                        {/* Name + Tone */}
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-sm truncate">
                                                                    {voice.name}
                                                                </span>
                                                                {voice.recommended && (
                                                                    <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                                <span>{voice.tone}</span>
                                                                <span>•</span>
                                                                <span className="uppercase">{voice.language}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Right: Badges + Preview */}
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        {/* Tier */}
                                                        <Badge className={`text-[10px] h-5 ${getTierColor(voice.tier)}`}>
                                                            {voice.tier}
                                                        </Badge>

                                                        {/* Latency */}
                                                        <span className={`text-[10px] font-mono ${latency.color}`}>
                                                            {voice.avgLatencyMs}ms
                                                        </span>

                                                        {/* Preview button */}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 w-7 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handlePreview(voice);
                                                            }}
                                                            disabled={isLoading}
                                                        >
                                                            {isLoading ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : isPlaying ? (
                                                                <Square className="w-4 h-4 text-red-400" />
                                                            ) : (
                                                                <Play className="w-4 h-4" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
