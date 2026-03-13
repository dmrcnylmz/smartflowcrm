/**
 * Cache Headers — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { cacheHeaders, CACHE_PRESETS, type CachePreset } from '@/lib/utils/cache-headers';

describe('Cache Headers', () => {
    describe('CACHE_PRESETS', () => {
        it('should have 4 presets', () => {
            expect(Object.keys(CACHE_PRESETS)).toHaveLength(4);
        });

        it('NO_CACHE should include no-store', () => {
            expect(CACHE_PRESETS.NO_CACHE).toContain('no-store');
            expect(CACHE_PRESETS.NO_CACHE).toContain('must-revalidate');
        });

        it('SHORT should include s-maxage=10', () => {
            expect(CACHE_PRESETS.SHORT).toContain('s-maxage=10');
            expect(CACHE_PRESETS.SHORT).toContain('stale-while-revalidate=30');
        });

        it('MEDIUM should include max-age=30', () => {
            expect(CACHE_PRESETS.MEDIUM).toContain('max-age=30');
            expect(CACHE_PRESETS.MEDIUM).toContain('stale-while-revalidate=60');
        });

        it('LONG should include max-age=60', () => {
            expect(CACHE_PRESETS.LONG).toContain('max-age=60');
            expect(CACHE_PRESETS.LONG).toContain('stale-while-revalidate=120');
        });

        it('all presets should include private', () => {
            expect(CACHE_PRESETS.SHORT).toContain('private');
            expect(CACHE_PRESETS.MEDIUM).toContain('private');
            expect(CACHE_PRESETS.LONG).toContain('private');
        });
    });

    describe('cacheHeaders()', () => {
        it.each(['NO_CACHE', 'SHORT', 'MEDIUM', 'LONG'] as CachePreset[])(
            'returns correct Cache-Control header for %s preset',
            (preset) => {
                const headers = cacheHeaders(preset);
                expect(headers).toHaveProperty('Cache-Control');
                expect(headers['Cache-Control']).toBe(CACHE_PRESETS[preset]);
            }
        );

        it('returns a plain object with single key', () => {
            const headers = cacheHeaders('SHORT');
            expect(Object.keys(headers)).toHaveLength(1);
            expect(typeof headers['Cache-Control']).toBe('string');
        });
    });
});
