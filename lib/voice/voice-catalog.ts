/**
 * Voice Catalog — Tüm TTS Provider Sesleri Merkezi Kayıt
 *
 * ElevenLabs, Google Cloud TTS ve OpenAI seslerini tek bir katalogda toplar.
 * Provider/dil/cinsiyet bazında filtreleme ve ses önizleme desteği sağlar.
 */

// =============================================
// Types
// =============================================

export type TTSProvider = 'elevenlabs' | 'google' | 'openai' | 'kokoro';
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
    // Google Cloud TTS — Turkish (~200ms, free tier)
    // ─────────────────────────────────────────
    {
        id: 'g-tr-wavenet-a',
        provider: 'google',
        voiceId: 'tr-TR-Wavenet-A',
        name: 'Google TR Kadın A',
        gender: 'female',
        language: 'tr',
        tone: 'Doğal',
        model: 'Wavenet',
        tier: 'free',
        avgLatencyMs: 200,
    },
    {
        id: 'g-tr-wavenet-b',
        provider: 'google',
        voiceId: 'tr-TR-Wavenet-B',
        name: 'Google TR Erkek B',
        gender: 'male',
        language: 'tr',
        tone: 'Doğal',
        model: 'Wavenet',
        tier: 'free',
        avgLatencyMs: 200,
    },
    {
        id: 'g-tr-wavenet-c',
        provider: 'google',
        voiceId: 'tr-TR-Wavenet-C',
        name: 'Google TR Kadın C',
        gender: 'female',
        language: 'tr',
        tone: 'Yumuşak',
        model: 'Wavenet',
        tier: 'free',
        avgLatencyMs: 200,
    },
    {
        id: 'g-tr-wavenet-d',
        provider: 'google',
        voiceId: 'tr-TR-Wavenet-D',
        name: 'Google TR Kadın D',
        gender: 'female',
        language: 'tr',
        tone: 'Profesyonel',
        model: 'Wavenet',
        tier: 'free',
        avgLatencyMs: 200,
    },
    {
        id: 'g-tr-wavenet-e',
        provider: 'google',
        voiceId: 'tr-TR-Wavenet-E',
        name: 'Google TR Erkek E',
        gender: 'male',
        language: 'tr',
        tone: 'Güçlü',
        model: 'Wavenet',
        tier: 'free',
        avgLatencyMs: 200,
    },

    // ─────────────────────────────────────────
    // Google Cloud TTS — Turkish Chirp 3: HD ($30/1M chars, premium quality)
    // ─────────────────────────────────────────
    {
        id: 'g-tr-chirp3hd-kore',
        provider: 'google',
        voiceId: 'tr-TR-Chirp3-HD-Kore',
        name: 'Kore (HD)',
        gender: 'female',
        language: 'tr',
        tone: 'Sıcak & Doğal',
        model: 'Chirp3-HD',
        tier: 'standard',
        avgLatencyMs: 300,
        recommended: true,
    },
    {
        id: 'g-tr-chirp3hd-aoede',
        provider: 'google',
        voiceId: 'tr-TR-Chirp3-HD-Aoede',
        name: 'Aoede (HD)',
        gender: 'female',
        language: 'tr',
        tone: 'Doğal & Akıcı',
        model: 'Chirp3-HD',
        tier: 'standard',
        avgLatencyMs: 300,
    },
    {
        id: 'g-tr-chirp3hd-leda',
        provider: 'google',
        voiceId: 'tr-TR-Chirp3-HD-Leda',
        name: 'Leda (HD)',
        gender: 'female',
        language: 'tr',
        tone: 'Profesyonel',
        model: 'Chirp3-HD',
        tier: 'standard',
        avgLatencyMs: 300,
    },
    {
        id: 'g-tr-chirp3hd-charon',
        provider: 'google',
        voiceId: 'tr-TR-Chirp3-HD-Charon',
        name: 'Charon (HD)',
        gender: 'male',
        language: 'tr',
        tone: 'Güçlü & Derin',
        model: 'Chirp3-HD',
        tier: 'standard',
        avgLatencyMs: 300,
    },
    {
        id: 'g-tr-chirp3hd-fenrir',
        provider: 'google',
        voiceId: 'tr-TR-Chirp3-HD-Fenrir',
        name: 'Fenrir (HD)',
        gender: 'male',
        language: 'tr',
        tone: 'Kararlı',
        model: 'Chirp3-HD',
        tier: 'standard',
        avgLatencyMs: 300,
    },
    {
        id: 'g-tr-chirp3hd-orus',
        provider: 'google',
        voiceId: 'tr-TR-Chirp3-HD-Orus',
        name: 'Orus (HD)',
        gender: 'male',
        language: 'tr',
        tone: 'Doğal',
        model: 'Chirp3-HD',
        tier: 'standard',
        avgLatencyMs: 300,
    },

    // ─────────────────────────────────────────
    // Google Cloud TTS — English (~200ms, free tier)
    // ─────────────────────────────────────────
    {
        id: 'g-en-neural2-c',
        provider: 'google',
        voiceId: 'en-US-Neural2-C',
        name: 'Google EN Kadın C',
        gender: 'female',
        language: 'en',
        tone: 'Sıcak',
        model: 'Neural2',
        tier: 'free',
        avgLatencyMs: 200,
    },
    {
        id: 'g-en-neural2-d',
        provider: 'google',
        voiceId: 'en-US-Neural2-D',
        name: 'Google EN Erkek D',
        gender: 'male',
        language: 'en',
        tone: 'Doğal',
        model: 'Neural2',
        tier: 'free',
        avgLatencyMs: 200,
    },
    {
        id: 'g-en-neural2-f',
        provider: 'google',
        voiceId: 'en-US-Neural2-F',
        name: 'Google EN Kadın F',
        gender: 'female',
        language: 'en',
        tone: 'Profesyonel',
        model: 'Neural2',
        tier: 'free',
        avgLatencyMs: 200,
        recommended: true,
    },

    // ─────────────────────────────────────────
    // OpenAI TTS (~4232ms, standard tier)
    // ─────────────────────────────────────────
    {
        id: 'oai-nova',
        provider: 'openai',
        voiceId: 'nova',
        name: 'Nova',
        gender: 'female',
        language: 'multi',
        tone: 'Enerjik',
        model: 'tts-1',
        tier: 'standard',
        avgLatencyMs: 4232,
    },
    {
        id: 'oai-alloy',
        provider: 'openai',
        voiceId: 'alloy',
        name: 'Alloy',
        gender: 'female',
        language: 'multi',
        tone: 'Nötr',
        model: 'tts-1',
        tier: 'standard',
        avgLatencyMs: 4232,
    },
    {
        id: 'oai-echo',
        provider: 'openai',
        voiceId: 'echo',
        name: 'Echo',
        gender: 'male',
        language: 'multi',
        tone: 'Derin',
        model: 'tts-1',
        tier: 'standard',
        avgLatencyMs: 4232,
    },
    {
        id: 'oai-shimmer',
        provider: 'openai',
        voiceId: 'shimmer',
        name: 'Shimmer',
        gender: 'female',
        language: 'multi',
        tone: 'Yumuşak',
        model: 'tts-1',
        tier: 'standard',
        avgLatencyMs: 4232,
    },
    {
        id: 'oai-onyx',
        provider: 'openai',
        voiceId: 'onyx',
        name: 'Onyx',
        gender: 'male',
        language: 'multi',
        tone: 'Otoriter',
        model: 'tts-1',
        tier: 'standard',
        avgLatencyMs: 4232,
    },
    {
        id: 'oai-fable',
        provider: 'openai',
        voiceId: 'fable',
        name: 'Fable',
        gender: 'male',
        language: 'multi',
        tone: 'Anlatıcı',
        model: 'tts-1',
        tier: 'standard',
        avgLatencyMs: 4232,
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
