/**
 * Voice Catalog — Tüm TTS Provider Sesleri Merkezi Kayıt
 *
 * ElevenLabs, Google Gemini TTS ve Kokoro seslerini tek bir katalogda toplar.
 * Provider/dil/cinsiyet bazında filtreleme ve ses önizleme desteği sağlar.
 */

// =============================================
// Types
// =============================================

export type TTSProvider = 'elevenlabs' | 'google' | 'openai' | 'kokoro' | 'cartesia' | 'murf';
export type VoiceGender = 'female' | 'male';
export type VoiceLanguage = 'tr' | 'en' | 'multi';
export type VoiceTier = 'premium' | 'standard' | 'free';

export interface VoiceCatalogEntry {
    /** Unique catalog ID (e.g. 'el-yildiz', 'g-tr-wavenet-d') */
    id: string;
    /** TTS provider */
    provider: TTSProvider;
    /** Provider-specific voice ID */
    voiceId: string;
    /** Display name */
    name: string;
    /** Voice gender */
    gender: VoiceGender;
    /** Primary language */
    language: VoiceLanguage;
    /** Tone description */
    tone: string;
    /** Provider model name */
    model: string;
    /** Pricing tier */
    tier: VoiceTier;
    /** Average latency in ms */
    avgLatencyMs: number;
    /** Whether this voice is a recommended default */
    recommended?: boolean;
}

// =============================================
// Sample Texts (for preview)
// =============================================

export const PREVIEW_SAMPLES = {
    tr: 'Merhaba, size nasıl yardımcı olabilirim? Randevu almak veya bilgi almak isterseniz ben buradayım.',
    en: 'Hello, how can I help you today? I\'m here to assist with appointments or any questions you may have.',
} as const;

// =============================================
// Voice Catalog
// =============================================

export const VOICE_CATALOG: VoiceCatalogEntry[] = [
    // ─────────────────────────────────────────
    // ElevenLabs (Premium — ~474ms body, ~1876ms greeting)
    // ─────────────────────────────────────────
    {
        id: 'el-yildiz',
        provider: 'elevenlabs',
        voiceId: 'pFZP5JQG7iQjIQuC4Bku',
        name: 'Yıldız',
        gender: 'female',
        language: 'tr',
        tone: 'Sıcak & Profesyonel',
        model: 'eleven_turbo_v2_5',
        tier: 'premium',
        avgLatencyMs: 474,
        recommended: true,
    },
    {
        id: 'el-sarah',
        provider: 'elevenlabs',
        voiceId: 'EXAVITQu4vr4xnSDxMaL',
        name: 'Sarah',
        gender: 'female',
        language: 'en',
        tone: 'Profesyonel',
        model: 'eleven_turbo_v2_5',
        tier: 'premium',
        avgLatencyMs: 474,
        recommended: true,
    },
    {
        id: 'el-rachel',
        provider: 'elevenlabs',
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        name: 'Rachel',
        gender: 'female',
        language: 'en',
        tone: 'Sakin & Güven Veren',
        model: 'eleven_turbo_v2_5',
        tier: 'premium',
        avgLatencyMs: 474,
    },
    {
        id: 'el-antoni',
        provider: 'elevenlabs',
        voiceId: 'ErXwobaYiN019PkySvjV',
        name: 'Antoni',
        gender: 'male',
        language: 'en',
        tone: 'Profesyonel & Kararlı',
        model: 'eleven_turbo_v2_5',
        tier: 'premium',
        avgLatencyMs: 474,
    },
    {
        id: 'el-arnold',
        provider: 'elevenlabs',
        voiceId: 'VR6AewLTigWG4xSOukaG',
        name: 'Arnold',
        gender: 'male',
        language: 'en',
        tone: 'Güçlü & Otoriter',
        model: 'eleven_turbo_v2_5',
        tier: 'premium',
        avgLatencyMs: 474,
    },

    // ─────────────────────────────────────────
    // Cartesia Sonic-3 — Ultra-low latency (~40ms TTFB)
    // 42+ dil, Türkçe dahil. Profesyonel voice agent standardı.
    // Multilingual voices — aynı ses tüm dilleri konuşur.
    // ─────────────────────────────────────────
    {
        id: 'ct-katie',
        provider: 'cartesia',
        voiceId: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
        name: 'Katie',
        gender: 'female',
        language: 'multi',
        tone: 'Sıcak & Doğal',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
        recommended: true,
    },
    {
        id: 'ct-kiefer',
        provider: 'cartesia',
        voiceId: '228fca29-3a0a-435c-8728-5cb483251068',
        name: 'Kiefer',
        gender: 'male',
        language: 'multi',
        tone: 'Profesyonel & Güvenilir',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-tessa',
        provider: 'cartesia',
        voiceId: '6ccbfb76-1fc6-48f7-b71d-91ac6298247b',
        name: 'Tessa',
        gender: 'female',
        language: 'multi',
        tone: 'Enerjik & İfade Edici',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-kyle',
        provider: 'cartesia',
        voiceId: 'c961b81c-a935-4c17-bfb3-ba2239de8c2f',
        name: 'Kyle',
        gender: 'male',
        language: 'multi',
        tone: 'Güçlü & Kararlı',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },

    // ─────────────────────────────────────────
    // Murf Falcon — Budget-friendly (~130ms TTFB)
    // 35+ dil, Türkçe 7 ses. $0.01/1K chars.
    // Voice ID'ler Murf API'den güncellenecek.
    // ─────────────────────────────────────────
    {
        id: 'mf-elif',
        provider: 'murf',
        voiceId: 'tr-TR-ElifNeural',
        name: 'Elif',
        gender: 'female',
        language: 'tr',
        tone: 'Doğal & Sıcak',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },
    {
        id: 'mf-emre',
        provider: 'murf',
        voiceId: 'tr-TR-EmreNeural',
        name: 'Emre',
        gender: 'male',
        language: 'tr',
        tone: 'Profesyonel & Kararlı',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },
    {
        id: 'mf-natalie',
        provider: 'murf',
        voiceId: 'en-US-NatalieNeural',
        name: 'Natalie',
        gender: 'female',
        language: 'en',
        tone: 'Net & Profesyonel',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },
    {
        id: 'mf-ryan',
        provider: 'murf',
        voiceId: 'en-US-RyanNeural',
        name: 'Ryan',
        gender: 'male',
        language: 'en',
        tone: 'Güvenilir & Kararlı',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },

    // ─────────────────────────────────────────
    // Kokoro TTS — English Only (~150ms, ultra-low cost)
    // CPU+GPU, <$1/1M chars via Together AI
    // ─────────────────────────────────────────
    {
        id: 'kk-af-heart',
        provider: 'kokoro',
        voiceId: 'af_heart',
        name: 'Heart',
        gender: 'female',
        language: 'en',
        tone: 'Sıcak & Doğal',
        model: 'kokoro-v1',
        tier: 'free',
        avgLatencyMs: 150,
        recommended: true,
    },
    {
        id: 'kk-af-star',
        provider: 'kokoro',
        voiceId: 'af_star',
        name: 'Star',
        gender: 'female',
        language: 'en',
        tone: 'Parlak & Enerjik',
        model: 'kokoro-v1',
        tier: 'free',
        avgLatencyMs: 150,
    },
    {
        id: 'kk-am-adam',
        provider: 'kokoro',
        voiceId: 'am_adam',
        name: 'Adam',
        gender: 'male',
        language: 'en',
        tone: 'Nötr & Net',
        model: 'kokoro-v1',
        tier: 'free',
        avgLatencyMs: 150,
    },
    {
        id: 'kk-am-michael',
        provider: 'kokoro',
        voiceId: 'am_michael',
        name: 'Michael',
        gender: 'male',
        language: 'en',
        tone: 'Profesyonel',
        model: 'kokoro-v1',
        tier: 'free',
        avgLatencyMs: 150,
    },
];

// =============================================
// Helper Functions
// =============================================

/** Katalogdan ID ile ses bul */
export function getVoiceById(id: string): VoiceCatalogEntry | undefined {
    return VOICE_CATALOG.find(v => v.id === id);
}

/** Provider'a göre filtrele */
export function getVoicesByProvider(provider: TTSProvider): VoiceCatalogEntry[] {
    return VOICE_CATALOG.filter(v => v.provider === provider);
}

/** Dile göre filtrele (multi dil tüm dillere dahil) */
export function getVoicesByLanguage(lang: 'tr' | 'en'): VoiceCatalogEntry[] {
    return VOICE_CATALOG.filter(v => v.language === lang || v.language === 'multi');
}

/** Provider + dil bazında filtrele */
export function filterVoices(filters: {
    provider?: TTSProvider;
    language?: 'tr' | 'en';
    gender?: VoiceGender;
}): VoiceCatalogEntry[] {
    return VOICE_CATALOG.filter(v => {
        if (filters.provider && v.provider !== filters.provider) return false;
        if (filters.language && v.language !== filters.language && v.language !== 'multi') return false;
        if (filters.gender && v.gender !== filters.gender) return false;
        return true;
    });
}

/** Önerilen sesleri getir */
export function getRecommendedVoices(): VoiceCatalogEntry[] {
    return VOICE_CATALOG.filter(v => v.recommended);
}

/** Provider display name */
export function getProviderDisplayName(provider: TTSProvider): string {
    switch (provider) {
        case 'elevenlabs': return 'ElevenLabs';
        case 'google': return 'Google Cloud';
        case 'openai': return 'OpenAI';
        case 'kokoro': return 'Kokoro';
        case 'cartesia': return 'Cartesia Sonic';
        case 'murf': return 'Murf Falcon';
    }
}

/** Tier badge rengi */
export function getTierColor(tier: VoiceTier): string {
    switch (tier) {
        case 'premium': return 'bg-amber-500/20 text-amber-400';
        case 'standard': return 'bg-blue-500/20 text-blue-400';
        case 'free': return 'bg-green-500/20 text-green-400';
    }
}

/** Latency badge */
export function getLatencyLabel(ms: number): { label: string; color: string } {
    if (ms < 300) return { label: 'Çok Hızlı', color: 'text-green-400' };
    if (ms < 1000) return { label: 'Hızlı', color: 'text-blue-400' };
    if (ms < 3000) return { label: 'Orta', color: 'text-yellow-400' };
    return { label: 'Yavaş', color: 'text-red-400' };
}
