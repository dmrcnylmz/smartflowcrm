'use client';

/**
 * Emergency Mode Control Panel
 *
 * Shows TTS character usage progress bar, threshold indicators,
 * emergency mode status, manual toggle, and recent alerts.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Shield, ShieldAlert, Zap, Volume2, RefreshCw } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CostAlert {
    type: string;
    percentUsed: number;
    estimatedCostUsd: number;
    timestamp: string | Date;
    reason?: string;
}

interface EmergencyModeCardProps {
    active: boolean;
    manualOverride: boolean;
    ttsCharsUsed: number;
    ttsCharsBudget: number;
    percentUsed: number;
    estimatedCostUsd: number;
    recentAlerts: CostAlert[];
    onToggle?: (action: 'activate' | 'deactivate') => Promise<void>;
    isLoading?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmergencyModeCard({
    active,
    manualOverride,
    ttsCharsUsed,
    ttsCharsBudget,
    percentUsed,
    estimatedCostUsd,
    recentAlerts,
    onToggle,
    isLoading,
}: EmergencyModeCardProps) {
    const [toggling, setToggling] = useState(false);

    const handleToggle = useCallback(async () => {
        if (!onToggle || toggling) return;
        setToggling(true);
        try {
            await onToggle(active ? 'deactivate' : 'activate');
        } finally {
            setToggling(false);
        }
    }, [active, onToggle, toggling]);

    // Progress bar color based on usage
    const getProgressColor = () => {
        if (percentUsed >= 95) return 'bg-red-500';
        if (percentUsed >= 80) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    // Status badge
    const getStatusBadge = () => {
        if (active) {
            return (
                <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Acil Durum Aktif
                </Badge>
            );
        }
        return (
            <Badge variant="success" className="gap-1">
                <Shield className="h-3 w-3" />
                Normal Mod
            </Badge>
        );
    };

    const formatChars = (n: number) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
        return String(n);
    };

    return (
        <Card className="rounded-3xl border-white/5 bg-card overflow-hidden">
            {/* Emergency mode active indicator */}
            {active && (
                <div className="h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500 animate-pulse" />
            )}

            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        TTS Maliyet Kontrolu
                    </CardTitle>
                    {getStatusBadge()}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Usage Progress Bar */}
                <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Karakter Kullanimi</span>
                        <span className="font-mono">
                            {formatChars(ttsCharsUsed)} / {formatChars(ttsCharsBudget)}
                        </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
                        {/* Warning threshold marker */}
                        <div
                            className="absolute top-0 bottom-0 w-px bg-amber-500/50 z-10"
                            style={{ left: '80%' }}
                        />
                        {/* Critical threshold marker */}
                        <div
                            className="absolute top-0 bottom-0 w-px bg-red-500/50 z-10"
                            style={{ left: '95%' }}
                        />
                        {/* Progress fill */}
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${getProgressColor()}`}
                            style={{ width: `${Math.min(percentUsed, 100)}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-muted-foreground">
                            %{Math.round(percentUsed)} kullanildi
                        </span>
                        <span className="text-muted-foreground font-mono">
                            ~${estimatedCostUsd.toFixed(2)}
                        </span>
                    </div>
                </div>

                {/* Emergency Mode Info */}
                {active && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-red-300">
                                <p className="font-medium mb-1">Acil Durum Modu Aktif</p>
                                <p className="text-red-400/80">
                                    Body TTS: OpenAI (dusuk maliyet) kullaniliyor.
                                    Karsilama TTS: ElevenLabs (kaliteli) korunuyor.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toggle Button */}
                <Button
                    variant={active ? 'default' : 'destructive'}
                    size="sm"
                    className="w-full"
                    onClick={handleToggle}
                    disabled={toggling || isLoading}
                >
                    {toggling ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : active ? (
                        <Shield className="h-4 w-4 mr-2" />
                    ) : (
                        <ShieldAlert className="h-4 w-4 mr-2" />
                    )}
                    {active ? 'Normal Moda Don' : 'Acil Durum Modunu Etkinlestir'}
                </Button>

                {manualOverride && (
                    <p className="text-xs text-center text-muted-foreground">
                        Manuel olarak kontrol ediliyor
                    </p>
                )}

                {/* Recent Alerts */}
                {recentAlerts.length > 0 && (
                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                            Son Uyarilar
                        </p>
                        <div className="space-y-1.5">
                            {recentAlerts.slice(0, 5).map((alert, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between text-xs rounded-lg bg-muted/50 px-3 py-1.5"
                                >
                                    <span className="flex items-center gap-1.5">
                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                            alert.type === 'critical' || alert.type === 'emergency_activated'
                                                ? 'bg-red-500'
                                                : alert.type === 'warning'
                                                    ? 'bg-amber-500'
                                                    : 'bg-emerald-500'
                                        }`} />
                                        {formatAlertType(alert.type)}
                                    </span>
                                    <span className="text-muted-foreground font-mono">
                                        %{alert.percentUsed}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAlertType(type: string): string {
    const map: Record<string, string> = {
        'warning': 'Uyari Esigi',
        'critical': 'Kritik Esik',
        'emergency_activated': 'Acil Mod Acildi',
        'emergency_deactivated': 'Acil Mod Kapandi',
    };
    return map[type] || type;
}
