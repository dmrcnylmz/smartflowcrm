/**
 * Voice Catalog — Unit Tests
 *
 * Tests catalog data integrity, filtering, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
    VOICE_CATALOG,
    PREVIEW_SAMPLES,
    getVoiceById,
    getVoicesByProvider,
    getVoicesByLanguage,
    filterVoices,
    getRecommendedVoices,
    getProviderDisplayName,
    getTierColor,
    getLatencyLabel,
    type TTSProvider,
    type VoiceCatalogEntry,
} from '@/lib/voice/voice-catalog';

describe('Voice Catalog', () => {
    // ─── Data Integrity ─────────────────────────────────────────────
    describe('Catalog Data', () => {
        it('should have at least 10 voices', () => {
            expect(VOICE_CATALOG.length).toBeGreaterThanOrEqual(10);
        });

        it('all entries should have required fields', () => {
            for (const voice of VOICE_CATALOG) {
                expect(voice.id).toBeTruthy();
                expect(voice.provider).toBeTruthy();
                expect(voice.voiceId).toBeTruthy();
                expect(voice.name).toBeTruthy();
                expect(['female', 'male']).toContain(voice.gender);
                expect(['tr', 'en', 'multi']).toContain(voice.language);
                expect(['premium', 'standard', 'free']).toContain(voice.tier);
                expect(voice.avgLatencyMs).toBeGreaterThan(0);
                expect(voice.model).toBeTruthy();
            }
        });

        it('should have unique IDs', () => {
            const ids = VOICE_CATALOG.map(v => v.id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });

        it('should include multiple providers', () => {
            const providers = new Set(VOICE_CATALOG.map(v => v.provider));
            expect(providers.size).toBeGreaterThanOrEqual(3);
        });

        it('should include both Turkish and English voices', () => {
            const trVoices = VOICE_CATALOG.filter(v => v.language === 'tr');
            const enVoices = VOICE_CATALOG.filter(v => v.language === 'en');
            expect(trVoices.length).toBeGreaterThan(0);
            expect(enVoices.length).toBeGreaterThan(0);
        });
    });

    // ─── Preview Samples ────────────────────────────────────────────
    describe('PREVIEW_SAMPLES', () => {
        it('should have Turkish and English samples', () => {
            expect(PREVIEW_SAMPLES.tr).toBeTruthy();
            expect(PREVIEW_SAMPLES.en).toBeTruthy();
        });

        it('samples should be non-empty strings', () => {
            expect(typeof PREVIEW_SAMPLES.tr).toBe('string');
            expect(typeof PREVIEW_SAMPLES.en).toBe('string');
            expect(PREVIEW_SAMPLES.tr.length).toBeGreaterThan(10);
            expect(PREVIEW_SAMPLES.en.length).toBeGreaterThan(10);
        });
    });

    // ─── getVoiceById ───────────────────────────────────────────────
    describe('getVoiceById()', () => {
        it('returns voice for valid ID', () => {
            const voice = getVoiceById('ct-leyla');
            expect(voice).toBeDefined();
            expect(voice!.name).toBe('Leyla');
            expect(voice!.provider).toBe('cartesia');
        });

        it('returns undefined for invalid ID', () => {
            expect(getVoiceById('nonexistent-voice')).toBeUndefined();
        });

        it('returns undefined for empty string', () => {
            expect(getVoiceById('')).toBeUndefined();
        });
    });

    // ─── getVoicesByProvider ────────────────────────────────────────
    describe('getVoicesByProvider()', () => {
        it('returns only Cartesia voices', () => {
            const voices = getVoicesByProvider('cartesia');
            expect(voices.length).toBeGreaterThan(0);
            expect(voices.every(v => v.provider === 'cartesia')).toBe(true);
        });

        it('returns only Murf voices', () => {
            const voices = getVoicesByProvider('murf');
            expect(voices.length).toBeGreaterThan(0);
            expect(voices.every(v => v.provider === 'murf')).toBe(true);
        });

        it('returns only Kokoro voices', () => {
            const voices = getVoicesByProvider('kokoro');
            expect(voices.length).toBeGreaterThan(0);
            expect(voices.every(v => v.provider === 'kokoro')).toBe(true);
        });

        it('returns empty array for provider with no voices', () => {
            // openai is a valid provider type but has no catalog entries
            const voices = getVoicesByProvider('openai');
            expect(Array.isArray(voices)).toBe(true);
        });
    });

    // ─── getVoicesByLanguage ────────────────────────────────────────
    describe('getVoicesByLanguage()', () => {
        it('returns TR voices (including multi)', () => {
            const voices = getVoicesByLanguage('tr');
            expect(voices.length).toBeGreaterThan(0);
            expect(voices.every(v => v.language === 'tr' || v.language === 'multi')).toBe(true);
        });

        it('returns EN voices (including multi)', () => {
            const voices = getVoicesByLanguage('en');
            expect(voices.length).toBeGreaterThan(0);
            expect(voices.every(v => v.language === 'en' || v.language === 'multi')).toBe(true);
        });
    });

    // ─── filterVoices ───────────────────────────────────────────────
    describe('filterVoices()', () => {
        it('returns all voices with empty filter', () => {
            const all = filterVoices({});
            expect(all.length).toBe(VOICE_CATALOG.length);
        });

        it('filters by provider', () => {
            const cartesia = filterVoices({ provider: 'cartesia' });
            expect(cartesia.every(v => v.provider === 'cartesia')).toBe(true);
        });

        it('filters by language (includes multi)', () => {
            const trVoices = filterVoices({ language: 'tr' });
            expect(trVoices.every(v => v.language === 'tr' || v.language === 'multi')).toBe(true);
        });

        it('filters by gender', () => {
            const femaleVoices = filterVoices({ gender: 'female' });
            expect(femaleVoices.every(v => v.gender === 'female')).toBe(true);

            const maleVoices = filterVoices({ gender: 'male' });
            expect(maleVoices.every(v => v.gender === 'male')).toBe(true);
        });

        it('combines multiple filters', () => {
            const result = filterVoices({
                provider: 'cartesia',
                language: 'tr',
                gender: 'female',
            });
            expect(result.length).toBeGreaterThan(0);
            expect(result.every(v =>
                v.provider === 'cartesia' &&
                (v.language === 'tr' || v.language === 'multi') &&
                v.gender === 'female'
            )).toBe(true);
        });

        it('returns empty when no match', () => {
            // Murf has no Turkish voices
            const result = filterVoices({ provider: 'murf', language: 'tr' });
            expect(result).toHaveLength(0);
        });
    });

    // ─── getRecommendedVoices ───────────────────────────────────────
    describe('getRecommendedVoices()', () => {
        it('returns only recommended voices', () => {
            const recommended = getRecommendedVoices();
            expect(recommended.length).toBeGreaterThan(0);
            expect(recommended.every(v => v.recommended === true)).toBe(true);
        });

        it('includes at least one per major provider', () => {
            const recommended = getRecommendedVoices();
            const providers = new Set(recommended.map(v => v.provider));
            expect(providers.has('cartesia')).toBe(true);
        });
    });

    // ─── getProviderDisplayName ─────────────────────────────────────
    describe('getProviderDisplayName()', () => {
        it.each([
            ['google', 'Google Cloud'],
            ['openai', 'OpenAI'],
            ['kokoro', 'Kokoro'],
            ['cartesia', 'Cartesia Sonic'],
            ['murf', 'Murf Falcon'],
        ] as [TTSProvider, string][])(
            'returns "%s" → "%s"',
            (provider, expected) => {
                expect(getProviderDisplayName(provider)).toBe(expected);
            }
        );
    });

    // ─── getTierColor ───────────────────────────────────────────────
    describe('getTierColor()', () => {
        it('returns amber classes for premium', () => {
            expect(getTierColor('premium')).toContain('amber');
        });

        it('returns blue classes for standard', () => {
            expect(getTierColor('standard')).toContain('blue');
        });

        it('returns green classes for free', () => {
            expect(getTierColor('free')).toContain('green');
        });
    });

    // ─── getLatencyLabel ────────────────────────────────────────────
    describe('getLatencyLabel()', () => {
        it('returns "Çok Hızlı" for < 300ms', () => {
            const result = getLatencyLabel(40);
            expect(result.label).toBe('Çok Hızlı');
            expect(result.color).toContain('green');
        });

        it('returns "Hızlı" for 300-999ms', () => {
            const result = getLatencyLabel(500);
            expect(result.label).toBe('Hızlı');
            expect(result.color).toContain('blue');
        });

        it('returns "Orta" for 1000-2999ms', () => {
            const result = getLatencyLabel(2000);
            expect(result.label).toBe('Orta');
            expect(result.color).toContain('yellow');
        });

        it('returns "Yavaş" for >= 3000ms', () => {
            const result = getLatencyLabel(5000);
            expect(result.label).toBe('Yavaş');
            expect(result.color).toContain('red');
        });

        it('handles boundary values', () => {
            expect(getLatencyLabel(299).label).toBe('Çok Hızlı');
            expect(getLatencyLabel(300).label).toBe('Hızlı');
            expect(getLatencyLabel(999).label).toBe('Hızlı');
            expect(getLatencyLabel(1000).label).toBe('Orta');
            expect(getLatencyLabel(2999).label).toBe('Orta');
            expect(getLatencyLabel(3000).label).toBe('Yavaş');
        });
    });
});
