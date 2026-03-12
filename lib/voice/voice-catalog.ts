/**
 * Voice Catalog — Tüm TTS Provider Sesleri Merkezi Kayıt
 *
 * Cartesia Sonic-3, Murf Falcon ve Kokoro seslerini tek bir katalogda toplar.
 * Provider/dil/cinsiyet bazında filtreleme ve ses önizleme desteği sağlar.
 */

// =============================================
// Types
// =============================================

export type TTSProvider = 'google' | 'openai' | 'kokoro' | 'cartesia' | 'murf';
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
    // Cartesia Sonic-3 — Ultra-low latency (~40ms TTFB)
    // 42+ dil. Türkçe native sesler + EN multilingual sesler.
    // Profesyonel voice agent standardı.
    // ─────────────────────────────────────────
    // Cartesia Sonic-3: Sonic-3 modeli 42+ dil destekler.
    // Native TR sesler → sadece Türkçe agent'larda göster (aksansız Türkçe).
    // Native EN sesler → sadece İngilizce agent'larda göster (aksansız İngilizce).
    // Katie (multi) → her iki dilde de göster.
    {
        id: 'ct-leyla',
        provider: 'cartesia',
        voiceId: 'fa7bfcdc-603c-4bf1-a600-a371400d2f8c',
        name: 'Leyla',
        gender: 'female',
        language: 'tr',
        tone: 'İfade Edici & Sıcak',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
        recommended: true,
    },
    {
        id: 'ct-aylin',
        provider: 'cartesia',
        voiceId: 'bb2347fe-69e9-4810-873f-ffd759fe8420',
        name: 'Aylin',
        gender: 'female',
        language: 'tr',
        tone: 'Sıcak & Rehber',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-elif',
        provider: 'cartesia',
        voiceId: '8036098f-cff4-401e-bfba-f0a6a6e5e49b',
        name: 'Elif',
        gender: 'female',
        language: 'tr',
        tone: 'Sistematik & Güvenilir',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-azra',
        provider: 'cartesia',
        voiceId: '0f95596c-09c4-4418-99fe-5c107e0713c0',
        name: 'Azra',
        gender: 'female',
        language: 'tr',
        tone: 'Profesyonel & Net',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-emre',
        provider: 'cartesia',
        voiceId: '39f753ef-b0eb-41cd-aa53-2f3c284f948f',
        name: 'Emre',
        gender: 'male',
        language: 'tr',
        tone: 'Sakin & Rahatlatıcı',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-taylan',
        provider: 'cartesia',
        voiceId: 'c1cfee3d-532d-47f8-8dd2-8e5b2b66bf1d',
        name: 'Taylan',
        gender: 'male',
        language: 'tr',
        tone: 'İfade Edici & Çok Yönlü',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-murat',
        provider: 'cartesia',
        voiceId: '5a31e4fb-f823-4359-aa91-82c0ae9a991c',
        name: 'Murat',
        gender: 'male',
        language: 'tr',
        tone: 'Derin & Otoriter',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    // Native EN voices — İngilizce agent'larda göster (aksansız İngilizce)
    {
        id: 'ct-katie',
        provider: 'cartesia',
        voiceId: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
        name: 'Katie',
        gender: 'female',
        language: 'en',
        tone: 'Doğal & Yardımsever',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
        recommended: true,
    },
    {
        id: 'ct-brooke',
        provider: 'cartesia',
        voiceId: 'e07c00bc-4134-4eae-9ea4-1a55fb45746b',
        name: 'Brooke',
        gender: 'female',
        language: 'en',
        tone: 'Güvenli & Rahat',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-jacqueline',
        provider: 'cartesia',
        voiceId: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
        name: 'Jacqueline',
        gender: 'female',
        language: 'en',
        tone: 'Empatik & Destekleyici',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },
    {
        id: 'ct-blake',
        provider: 'cartesia',
        voiceId: 'a167e0f3-df7e-4d52-a9c3-f949145efdab',
        name: 'Blake',
        gender: 'male',
        language: 'en',
        tone: 'Enerjik & İlgi Çekici',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
        recommended: true,
    },
    {
        id: 'ct-gemma',
        provider: 'cartesia',
        voiceId: '62ae83ad-4f6a-430b-af41-a9bede9286ca',
        name: 'Gemma',
        gender: 'female',
        language: 'en',
        tone: 'Profesyonel & Kararlı (British)',
        model: 'sonic-3',
        tier: 'premium',
        avgLatencyMs: 40,
    },

    // ─────────────────────────────────────────
    // Murf Falcon — Budget-friendly EN fallback (~130ms TTFB)
    // Türkçe desteği YOK. Sadece İngilizce voice agent'lar için.
    // $0.01/1K chars — en ucuz premium ses.
    // ─────────────────────────────────────────
    {
        id: 'mf-alina',
        provider: 'murf',
        voiceId: 'en-US-alina',
        name: 'Alina',
        gender: 'female',
        language: 'en',
        tone: 'Doğal & Sıcak',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },
    {
        id: 'mf-cooper',
        provider: 'murf',
        voiceId: 'en-US-cooper',
        name: 'Cooper',
        gender: 'male',
        language: 'en',
        tone: 'Profesyonel & Enerjik',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },
    {
        id: 'mf-imani',
        provider: 'murf',
        voiceId: 'en-US-imani',
        name: 'Imani',
        gender: 'female',
        language: 'en',
        tone: 'Net & Profesyonel',
        model: 'falcon',
        tier: 'standard',
        avgLatencyMs: 130,
    },
    {
        id: 'mf-daniel',
        provider: 'murf',
        voiceId: 'en-US-daniel',
        name: 'Daniel',
        gender: 'male',
        language: 'en',
        tone: 'Güvenilir & Sakin',
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
