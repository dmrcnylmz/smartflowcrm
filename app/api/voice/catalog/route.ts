/**
 * Voice Catalog API — GET /api/voice/catalog
 *
 * Tüm TTS seslerini listeler. Provider, dil ve cinsiyet bazında filtreleme destekler.
 *
 * Query params:
 *   ?provider=cartesia|murf|google|kokoro|openai
 *   ?lang=tr|en
 *   ?gender=female|male
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    VOICE_CATALOG,
    filterVoices,
    getProviderDisplayName,
    PREVIEW_SAMPLES,
    type VoiceGender,
} from '@/lib/voice/voice-catalog';
import { getServiceAccountKey } from '@/lib/voice/tts-google';
import { isKokoroConfigured } from '@/lib/voice/tts-kokoro';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const provider = searchParams.get('provider') as 'cartesia' | 'murf' | 'google' | 'kokoro' | null;
    const lang = searchParams.get('lang') as 'tr' | 'en' | null;
    const gender = searchParams.get('gender') as VoiceGender | null;

    // Filter catalog
    const voices = filterVoices({
        provider: provider || undefined,
        language: lang || undefined,
        gender: gender || undefined,
    });

    // Provider availability check
    const providers = {
        cartesia: {
            name: getProviderDisplayName('cartesia'),
            available: !!process.env.CARTESIA_API_KEY,
            note: 'Primary TTS — ultra-low latency (~40ms)',
        },
        murf: {
            name: getProviderDisplayName('murf'),
            available: !!process.env.MURF_API_KEY,
            note: 'Budget EN-only fallback (~130ms)',
        },
        google: {
            name: getProviderDisplayName('google'),
            available: !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || getServiceAccountKey()),
            note: 'Gemini 2.5 Flash TTS — multi-language premium',
        },
        kokoro: {
            name: getProviderDisplayName('kokoro'),
            available: isKokoroConfigured(),
            note: 'English only',
        },
    };

    return NextResponse.json({
        voices,
        providers,
        previewSamples: PREVIEW_SAMPLES,
        total: voices.length,
        totalCatalog: VOICE_CATALOG.length,
    }, {
        headers: cacheHeaders('LONG'), // Voice catalog is mostly static
    });
}
