'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Bug, Zap, Shield } from 'lucide-react';

// ─────────────────────────────────────────────
// Changelog Page — Son Güncellemeler
// ─────────────────────────────────────────────

type ChangeType = 'feature' | 'improvement' | 'fix' | 'security';

interface ChangelogEntry {
    date: string;
    version: string;
    title: string;
    type: ChangeType;
    description: string;
    items: string[];
}

const TYPE_CONFIG: Record<ChangeType, { label: string; icon: typeof Sparkles; color: string; bg: string }> = {
    feature: { label: 'Yeni Özellik', icon: Sparkles, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30' },
    improvement: { label: 'İyileştirme', icon: Zap, color: 'text-cyan-600', bg: 'bg-cyan-100 dark:bg-cyan-900/30' },
    fix: { label: 'Düzeltme', icon: Bug, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    security: { label: 'Güvenlik', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
};

const CHANGELOG: ChangelogEntry[] = [
    {
        date: '2026-03-13',
        version: '1.4.0',
        title: 'Webhook Retry Sistemi & Production Readiness',
        type: 'feature',
        description: 'Webhook teslimatları için otomatik yeniden deneme sistemi ve production hazırlık iyileştirmeleri.',
        items: [
            'Exponential backoff ile webhook retry sistemi (1dk → 5dk → 15dk → 1h → 4h)',
            'SEO optimizasyonları: robots.txt, sitemap, OpenGraph metadata',
            'KVKK uyumlu çerez onay banneri',
            'Sentry hata takibi entegrasyonu',
            'Google Analytics entegrasyonu (çerez onayı bağlı)',
            'E-posta doğrulama banneri',
            'Kullanım Şartları sayfası',
        ],
    },
    {
        date: '2026-03-01',
        version: '1.3.0',
        title: 'Gelişmiş Asistan Yapılandırma Sihirbazı',
        type: 'feature',
        description: 'Asistan oluşturma deneyimi tamamen yenilendi. Kişilik profilleri, ses önizleme ve gelişmiş yapılandırma seçenekleri.',
        items: [
            '6 hazır kişilik profili (Profesyonel, Samimi, Empatik vb.)',
            'TTS ses önizleme özelliği',
            'Mesai saatleri ve tatil günleri yapılandırması',
            'Webhook yönetim paneli',
            'Otomatik çağrı sonrası e-posta bildirimi',
        ],
    },
    {
        date: '2026-02-15',
        version: '1.2.0',
        title: 'Ses Pipeline İyileştirmeleri',
        type: 'improvement',
        description: 'Ses işleme altyapısı güncellendi. Daha hızlı yanıt süreleri ve daha doğal konuşma deneyimi.',
        items: [
            'Cartesia TTS entegrasyonu ile doğal Türkçe ses',
            'Deepgram STT entegrasyonu',
            'Çağrı kayıt ve transkript özelliği',
            'Duygu analizi ile çağrı değerlendirmesi',
        ],
    },
    {
        date: '2026-02-01',
        version: '1.1.0',
        title: 'Raporlama & Dashboard',
        type: 'feature',
        description: 'Kapsamlı raporlama paneli ve gerçek zamanlı dashboard.',
        items: [
            'Çağrı istatistikleri dashboard\'u',
            'Haftalık/aylık performans raporları',
            'Müşteri memnuniyet skoru takibi',
            'CSV/Excel export özelliği',
        ],
    },
    {
        date: '2026-01-15',
        version: '1.0.0',
        title: 'Callception Lansmanı',
        type: 'feature',
        description: 'Callception resmi olarak yayınlandı. AI destekli sesli asistan ile çağrılarınızı otomatikleştirin.',
        items: [
            'AI sesli asistan ile 7/24 çağrı yanıtlama',
            'Randevu oluşturma ve yönetimi',
            'Müşteri bilgi yönetimi (CRM)',
            'Şikayet takip sistemi',
            'Çoklu kullanıcı ve tenant desteği',
            'Twilio entegrasyonu',
        ],
    },
];

export default function ChangelogPage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
            {/* Header */}
            <div className="max-w-3xl mx-auto px-4 pt-12 pb-8">
                <Link
                    href="/landing"
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Ana Sayfa
                </Link>

                <h1 className="text-3xl font-bold text-foreground">
                    Değişiklik Günlüğü
                </h1>
                <p className="text-muted-foreground mt-2">
                    Callception platformundaki son güncellemeler ve yeni özellikler.
                </p>
            </div>

            {/* Timeline */}
            <div className="max-w-3xl mx-auto px-4 pb-16">
                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gradient-to-b from-violet-300 via-gray-200 to-gray-200 dark:from-violet-700 dark:via-gray-700 dark:to-gray-800" />

                    <div className="space-y-10">
                        {CHANGELOG.map((entry) => {
                            const config = TYPE_CONFIG[entry.type];
                            const Icon = config.icon;

                            return (
                                <div key={entry.version} className="relative pl-12">
                                    {/* Timeline dot */}
                                    <div className={`absolute left-0 top-1 w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center`}>
                                        <Icon className={`h-5 w-5 ${config.color}`} />
                                    </div>

                                    {/* Content */}
                                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
                                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                                            <span className="text-xs font-mono text-muted-foreground">
                                                {entry.date}
                                            </span>
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-muted-foreground">
                                                v{entry.version}
                                            </span>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
                                                {config.label}
                                            </span>
                                        </div>

                                        <h3 className="text-lg font-semibold text-foreground mb-1">
                                            {entry.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground mb-3">
                                            {entry.description}
                                        </p>

                                        <ul className="space-y-1.5">
                                            {entry.items.map((item, i) => (
                                                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2">
                                                    <span className="text-violet-500 mt-1.5 flex-shrink-0">•</span>
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
