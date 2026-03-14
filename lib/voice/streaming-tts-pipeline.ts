/**
 * Streaming TTS Pipeline — LLM akışı + cümle-bazlı TTS parçalama
 *
 * ══ NEDEN? ══════════════════════════════════════════════════════════════════
 * Mevcut mimari: LLM biter → Cartesia başlar → TwiML döner → Twilio sesi çalar
 * Toplam: ~500ms LLM + ~900ms TTS = ~1400ms (kullanıcı bu kadar bekler)
 *
 * Yeni mimari:
 *   t=0ms   → Groq streaming başlar
 *   t=~80ms → İlk cümle tespit edilir → Cartesia chunk1 başlar (PARALEL!)
 *   t=~400ms→ LLM biter → chunk2 metni hazır → Cartesia chunk2 arka planda başlar
 *   t=~700ms→ Cartesia chunk1 hazır → TwiML döner
 *   t=700ms → Kullanıcı sesi DUYAR (önceki 1400ms'ye karşı)
 *   t=~1100ms→ Chunk2 Cartesia hazır → metin-hash cache'e alınır
 *
 * Twilio chunk1'i çalarken, chunk2 zaten cache'te hazır. Twilio chunk2'yi
 * istediğinde tts/phone text-cache'ten ~5ms'de servis eder.
 *
 * ══ FALLBACK ════════════════════════════════════════════════════════════════
 * - Groq akışı başarısız → null döner → caller mevcut fallback zincirini kullanır
 * - Chunk1 TTS başarısız → null döner
 * - Chunk2 tek cümleyse sadece chunk1 URL döner (chunk2Url=null)
 *
 * ══ SONUÇ ════════════════════════════════════════════════════════════════════
 * Yanıt uzunluğunu kısıtlamaya gerek yok — uzun yanıtlar paralel parçalanır.
 * Algılanan gecikme: max(ilk cümle tespiti, chunk1 TTS) ≈ 600-800ms
 */

import { streamGroqResponse, isGroqConfigured } from '@/lib/ai/groq-client';
import { groqCircuitBreaker } from '@/lib/voice/circuit-breaker';
import { synthesizeCartesiaTTS, isCartesiaConfigured } from '@/lib/voice/tts-cartesia';
import { cachePhoneAudio, cachePhoneAudioByText } from '@/lib/voice/phone-audio-cache';
import { buildPhoneTtsUrl } from '@/lib/twilio/telephony';
import { createLogger } from '@/lib/utils/logger';

const log = createLogger('streaming-tts');

/** Cümle sonu için minimum karakter — kısa parçaları önler */
const MIN_SENTENCE_CHARS = 20;

/**
 * Metin içinde ilk geçerli cümle sonu indeksini döner.
 * Türkçe + İngilizce: . ! ? ardından boşluk veya metnin sonu.
 * Returns -1 eğer bulunamazsa.
 */
function findSentenceBoundary(text: string): number {
    for (let i = MIN_SENTENCE_CHARS; i < text.length; i++) {
        const ch = text[i];
        if (ch === '.' || ch === '!' || ch === '?') {
            const next = text[i + 1];
            // Cümle sonu: sonrasında boşluk, yeni satır veya metin bitiyor
            if (next === undefined || next === ' ' || next === '\n') {
                return i + 1;
            }
        }
    }
    return -1;
}

export interface StreamingPipelineResult {
    /** Chunk1 ses URL'i — cache'te garantili (UUID bazlı) */
    chunk1Url: string;
    /** Chunk2 ses URL'i — HMAC imzalı, text-cache kontrolüyle tts/phone servis eder */
    chunk2Url: string | null;
    /**
     * Chunk2 arka plan TTS oluşturma Promise'i.
     * Caller bunu after() ile schedule etmeli — response gönderildikten sonra tamamlanır.
     */
    chunk2Gen: Promise<void>;
    /** LLM'in tam yanıtı (Firestore + LLM cache için) */
    fullText: string;
    /** Geliştirici logları için zamanlama bilgisi */
    timing: {
        /** İlk cümle tespit edilene kadar geçen ms */
        firstSentenceMs: number;
        /** Chunk1 TTS oluşturma süresi */
        chunk1TtsMs: number;
        /** Toplam pipeline süresi (caller'ın beklediği süre) */
        totalMs: number;
    };
}

/**
 * Groq'u streaming modda çalıştır, ilk cümle hazır olduğunda TTS başlat.
 * Chunk1 TTS tamamlanınca geri döner; chunk2 TTS arka planda devam eder.
 *
 * @returns null — Groq/Cartesia yapılandırılmamışsa, akış başarısız olursa,
 *                 veya chunk1 TTS başarısız olursa. Caller fallback kullanmalı.
 */
export async function streamLLMWithChunkedTTS(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
        lang: 'tr' | 'en' | 'de' | 'fr';
        voiceId?: string;
        maxTokens?: number;
        temperature?: number;
        baseUrl: string;
    },
): Promise<StreamingPipelineResult | null> {
    // Ön koşullar
    if (!isGroqConfigured() || groqCircuitBreaker.isOpen()) return null;
    if (!isCartesiaConfigured()) return null;

    const pipeStart = Date.now();
    const { lang, voiceId, maxTokens = 150, temperature = 0.3, baseUrl } = options;

    let accumulator = '';
    let chunk1Text = '';
    let firstSentenceMs = 0;
    let chunk1TtsStart = 0;
    let chunk1TtsPromise: Promise<Response | null> | null = null;

    // ── Groq token akışı ────────────────────────────────────────────────────
    try {
        for await (const token of streamGroqResponse(messages, { maxTokens, temperature })) {
            accumulator += token;

            // İlk cümle sınırı tespit et → chunk1 TTS'i hemen başlat
            if (!chunk1TtsPromise) {
                const idx = findSentenceBoundary(accumulator);
                if (idx !== -1) {
                    chunk1Text = accumulator.slice(0, idx).trim();
                    accumulator = accumulator.slice(idx).trimStart();
                    firstSentenceMs = Date.now() - pipeStart;
                    chunk1TtsStart = Date.now();

                    // LLM akışı devam ederken chunk1 TTS paralel başlar
                    chunk1TtsPromise = synthesizeCartesiaTTS(chunk1Text, lang, voiceId)
                        .catch(() => null);

                    log.debug('streaming:sentence1', {
                        chars: chunk1Text.length,
                        firstSentenceMs,
                    });
                }
            }
        }
    } catch (err) {
        log.warn('streaming:groq-failed', {
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }

    // ── LLM tamamlandı, kalan metin chunk2 ──────────────────────────────────
    const chunk2Text = accumulator.trim();
    const fullText = [chunk1Text, chunk2Text].filter(Boolean).join(' ');

    // Cümle sınırı bulunamadıysa → tüm metni chunk1 olarak işle
    if (!chunk1TtsPromise) {
        chunk1Text = fullText;
        chunk2Text; // chunk2 artık yok
        chunk1TtsStart = Date.now();
        chunk1TtsPromise = synthesizeCartesiaTTS(chunk1Text, lang, voiceId)
            .catch(() => null);
    }

    // ── Chunk1 TTS'i bekle (TwiML dönmeden önce hazır olmalı) ───────────────
    const chunk1Response = await chunk1TtsPromise;
    if (!chunk1Response) {
        log.warn('streaming:chunk1-tts-failed', { chars: chunk1Text.length });
        return null;
    }

    const chunk1TtsMs = Date.now() - chunk1TtsStart;
    const chunk1Id = crypto.randomUUID();
    const chunk1Buf = Buffer.from(await chunk1Response.arrayBuffer());
    cachePhoneAudio(chunk1Id, chunk1Buf);
    const chunk1Url = `${baseUrl}/api/voice/tts/phone?id=${chunk1Id}`;

    log.info('streaming:chunk1-ready', {
        chars: chunk1Text.length,
        firstSentenceMs,
        chunk1TtsMs,
        totalMs: Date.now() - pipeStart,
    });

    // ── Chunk2: HMAC URL + arka plan oluşturma ───────────────────────────────
    let chunk2Url: string | null = null;
    let chunk2Gen: Promise<void> = Promise.resolve();

    if (chunk2Text) {
        // HMAC URL: tts/phone text-cache kontrolü yapar, yoksa Cartesia'ya gider
        chunk2Url = buildPhoneTtsUrl(baseUrl, chunk2Text, lang, voiceId);

        // Arka plan: chunk2'yi üret ve text-hash cache'e al
        // Caller bunu after() ile schedule etmeli ki response sonrası tamamlansın
        chunk2Gen = synthesizeCartesiaTTS(chunk2Text, lang, voiceId)
            .then(async (resp) => {
                if (resp) {
                    const buf = Buffer.from(await resp.arrayBuffer());
                    // Text-hash'e göre cache'le — tts/phone HMAC fallback bunu bulur
                    cachePhoneAudioByText(chunk2Text, lang, voiceId || '', buf);
                    log.debug('streaming:chunk2-cached', { chars: chunk2Text.length });
                }
            })
            .catch(() => { /* en iyi çaba */ });
    }

    return {
        chunk1Url,
        chunk2Url,
        chunk2Gen,
        fullText,
        timing: {
            firstSentenceMs,
            chunk1TtsMs,
            totalMs: Date.now() - pipeStart,
        },
    };
}
