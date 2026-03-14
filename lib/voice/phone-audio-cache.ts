/**
 * Phone Audio Cache — Shared module-level cache for pre-generated Cartesia audio.
 *
 * WHY: Twilio's <Play> tag creates a double-hop:
 *   gather route → TwiML → Twilio fetches <Play> URL → tts/phone → Cartesia
 *
 * With this cache, gather route pre-generates audio, stores it here,
 * and tts/phone endpoint serves it instantly without calling Cartesia again.
 *
 * TTL: 60 seconds (plenty for Twilio to fetch the audio after receiving TwiML)
 * Key: UUID (returned in <Play> URL as ?id=UUID)
 *
 * NOTE: This relies on Vercel reusing the same function instance for back-to-back
 * requests from the same call. On cache miss (different instance), tts/phone falls
 * back to direct Cartesia generation.
 */

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
    buf: Buffer;
    exp: number;
}

/** Module-level cache — survives across multiple requests in same function instance */
const phoneAudioCache = new Map<string, CacheEntry>();

/** Auto-clean expired entries every 30 seconds */
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of phoneAudioCache) {
        if (v.exp < now) phoneAudioCache.delete(k);
    }
}, 30_000);

/** Store audio buffer with TTL. Returns the cache key (UUID). */
export function cachePhoneAudio(id: string, buf: Buffer): void {
    phoneAudioCache.set(id, { buf, exp: Date.now() + CACHE_TTL_MS });
}

/** Retrieve cached audio. Returns null if not found or expired. */
export function getCachedPhoneAudio(id: string): Buffer | null {
    const entry = phoneAudioCache.get(id);
    if (!entry) return null;
    if (entry.exp < Date.now()) {
        phoneAudioCache.delete(id);
        return null;
    }
    return entry.buf;
}

/** Cache size — for diagnostics */
export function getPhoneAudioCacheSize(): number {
    return phoneAudioCache.size;
}

// ─── Metin-bazlı cache (HMAC fallback path için) ───────────────────────────
//
// Streaming pipeline chunk2'yi arka planda üretip metne göre cache'e alır.
// tts/phone'un HMAC fallback yolu, Cartesia'ya gitmeden önce bu cache'i kontrol eder.
// Böylece Twilio chunk2'yi istediğinde cache'ten (~5ms) alınır.

import { createHash } from 'crypto';

function makeTextKey(text: string, lang: string, voiceId: string): string {
    return 'txt:' + createHash('sha256')
        .update(`${text}\x00${lang}\x00${voiceId}`)
        .digest('hex')
        .slice(0, 24);
}

/** Metne göre audio cache'e yaz (streaming pipeline chunk2 için). */
export function cachePhoneAudioByText(text: string, lang: string, voiceId: string, buf: Buffer): void {
    phoneAudioCache.set(makeTextKey(text, lang, voiceId), { buf, exp: Date.now() + CACHE_TTL_MS });
}

/** Metne göre audio al. Yoksa veya süre dolmuşsa null döner. */
export function getCachedPhoneAudioByText(text: string, lang: string, voiceId: string): Buffer | null {
    const key = makeTextKey(text, lang, voiceId);
    const entry = phoneAudioCache.get(key);
    if (!entry) return null;
    if (entry.exp < Date.now()) { phoneAudioCache.delete(key); return null; }
    return entry.buf;
}
