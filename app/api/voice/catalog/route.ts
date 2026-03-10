/**
 * Voice Catalog API — GET /api/voice/catalog
 *
 * Tüm TTS seslerini listeler. Provider, dil ve cinsiyet bazında filtreleme destekler.
 *
 * Query params:
 *   ?provider=google|elevenlabs|openai|kokoro
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

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const provider = searchParams.get('provider') as 'elevenlabs' | 'google' | 'kokoro' | null;
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
        elevenlabs: {
            name: getProviderDisplayName('elevenlabs'),
            available: !!process.env.ELEVENLABS_API_KEY,
        },
        google: {
            name: getProviderDisplayName('google'),
            available: !!getServiceAccountKey(),
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
    });
}
