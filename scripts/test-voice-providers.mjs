/**
 * Voice Pipeline Provider Performance Test
 *
 * Tests each provider directly:
 * 1. ElevenLabs TTS (greeting — premium)
 * 2. OpenAI TTS (body — budget)
 * 3. Deepgram STT (speech-to-text)
 * 4. Groq LLM (primary)
 * 5. Gemini LLM (secondary)
 * 6. OpenAI LLM (tertiary)
 *
 * Measures: latency, success, audio size, token count
 */

import { readFileSync } from 'fs';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
    }
    env[key] = val;
}

const ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY || '';
const OPENAI_API_KEY = env.OPENAI_API_KEY || '';
const DEEPGRAM_API_KEY = env.DEEPGRAM_API_KEY || '';
const GROQ_API_KEY = env.GROQ_API_KEY || '';
const GEMINI_API_KEY = env.GOOGLE_AI_API_KEY || '';

// Test texts
const GREETING_TR = 'Merhaba! Ben Callception AI asistanıyım. Size nasıl yardımcı olabilirim?';
const BODY_TR = 'Randevunuz 15 Mart Cumartesi saat 14:00 olarak oluşturulmuştur. Başka bir isteğiniz var mı?';
const USER_INPUT = 'Yarın saat 3 için randevu almak istiyorum';

const results = [];

function log(emoji, msg) {
    console.log(`${emoji} ${msg}`);
}

async function measure(name, fn) {
    const start = performance.now();
    try {
        const result = await fn();
        const latencyMs = Math.round(performance.now() - start);
        results.push({ name, status: 'OK', latencyMs, ...result });
        log('✅', `${name}: ${latencyMs}ms ${result.detail || ''}`);
        return { ok: true, latencyMs, ...result };
    } catch (err) {
        const latencyMs = Math.round(performance.now() - start);
        results.push({ name, status: 'FAIL', latencyMs, error: err.message });
        log('❌', `${name}: FAIL (${latencyMs}ms) — ${err.message}`);
        return { ok: false, latencyMs, error: err.message };
    }
}

// =============================================
// 1. ElevenLabs TTS — Greeting (Premium)
// =============================================
async function testElevenLabsGreeting() {
    if (!ELEVENLABS_API_KEY) throw new Error('No API key');

    const voiceId = 'pFZP5JQG7iQjIQuC4Bku'; // Yildiz — Turkish
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text: GREETING_TR,
            model_id: 'eleven_multilingual_v2',
            language_code: 'tr',
            voice_settings: {
                stability: 0.6,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
            },
        }),
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const buf = await res.arrayBuffer();
    return { detail: `(${(buf.byteLength / 1024).toFixed(1)}KB audio)`, audioSizeKB: Math.round(buf.byteLength / 1024) };
}

// =============================================
// 2. ElevenLabs TTS — Body (Turbo)
// =============================================
async function testElevenLabsBody() {
    if (!ELEVENLABS_API_KEY) throw new Error('No API key');

    const voiceId = 'pFZP5JQG7iQjIQuC4Bku'; // Yildiz
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: 'POST',
        headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
            text: BODY_TR,
            model_id: 'eleven_turbo_v2_5',
            language_code: 'tr',
            voice_settings: {
                stability: 0.6,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
            },
        }),
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const buf = await res.arrayBuffer();
    return { detail: `(${(buf.byteLength / 1024).toFixed(1)}KB audio)`, audioSizeKB: Math.round(buf.byteLength / 1024) };
}

// =============================================
// 3. OpenAI TTS — Body (Budget)
// =============================================
async function testOpenAITTS() {
    if (!OPENAI_API_KEY) throw new Error('No API key');

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: BODY_TR,
            voice: 'nova',
            response_format: 'mp3',
            speed: 1.0,
        }),
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const buf = await res.arrayBuffer();
    return { detail: `(${(buf.byteLength / 1024).toFixed(1)}KB audio)`, audioSizeKB: Math.round(buf.byteLength / 1024) };
}

// =============================================
// 4. Deepgram STT
// =============================================
async function testDeepgramSTT() {
    if (!DEEPGRAM_API_KEY) throw new Error('No API key');

    // Create a simple test: send a pre-recorded audio or test the endpoint
    // Since we don't have a real audio file, we'll test connectivity + config
    const params = new URLSearchParams({
        model: 'nova-2',
        language: 'tr',
        smart_format: 'true',
        punctuate: 'true',
    });

    // Generate a tiny WAV file with silence (44-byte header + 1 second of silence)
    const sampleRate = 16000;
    const numSamples = sampleRate; // 1 second
    const byteRate = sampleRate * 2;
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    // Data = silence (zeros)

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': 'audio/wav',
        },
        body: buffer,
        signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const data = await res.json();
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return { detail: `(transcript: "${transcript || '[empty — silence test OK]'}")`, transcript };
}

// =============================================
// 5. Groq LLM (Primary)
// =============================================
async function testGroqLLM() {
    if (!GROQ_API_KEY) throw new Error('No API key');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: 'Sen bir CRM asistanısın. Kısa ve profesyonel cevaplar ver. Sadece Türkçe konuş.' },
                { role: 'user', content: USER_INPUT },
            ],
            max_tokens: 150,
            temperature: 0.3,
        }),
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;
    return { detail: `(${tokens} tokens) "${text.slice(0, 80)}..."`, responseText: text, tokens };
}

// =============================================
// 6. Gemini LLM (Secondary)
// =============================================
async function testGeminiLLM() {
    if (!GEMINI_API_KEY) throw new Error('No API key');

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Sen bir CRM asistanısın. Kısa ve profesyonel cevaplar ver. Sadece Türkçe konuş.\n\nKullanıcı: ${USER_INPUT}`,
                    }],
                }],
                generationConfig: {
                    maxOutputTokens: 150,
                    temperature: 0.3,
                },
            }),
            signal: AbortSignal.timeout(10000),
        },
    );

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const tokens = data.usageMetadata?.totalTokenCount || 0;
    return { detail: `(${tokens} tokens) "${text.slice(0, 80)}..."`, responseText: text, tokens };
}

// =============================================
// 7. OpenAI LLM (Tertiary — gpt-4o-mini)
// =============================================
async function testOpenAILLM() {
    if (!OPENAI_API_KEY) throw new Error('No API key');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Sen bir CRM asistanısın. Kısa ve profesyonel cevaplar ver. Sadece Türkçe konuş.' },
                { role: 'user', content: USER_INPUT },
            ],
            max_tokens: 150,
            temperature: 0.3,
        }),
        signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 100)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || 0;
    return { detail: `(${tokens} tokens) "${text.slice(0, 80)}..."`, responseText: text, tokens };
}

// =============================================
// Run All Tests
// =============================================
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║     🎙️  Voice Pipeline Provider Performance Test  🎙️        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    // TTS Tests
    log('🔊', '--- TTS PROVIDERS ---');
    await measure('ElevenLabs TTS (greeting, multilingual_v2)', testElevenLabsGreeting);
    await measure('ElevenLabs TTS (body, turbo_v2_5)', testElevenLabsBody);
    await measure('OpenAI TTS (body, tts-1/nova)', testOpenAITTS);
    console.log('');

    // STT Test
    log('🎤', '--- STT PROVIDER ---');
    await measure('Deepgram STT (nova-2, Turkish)', testDeepgramSTT);
    console.log('');

    // LLM Tests
    log('🧠', '--- LLM PROVIDERS ---');
    await measure('Groq LLM (llama-3.3-70b, PRIMARY)', testGroqLLM);
    await measure('Gemini LLM (flash-2.0, SECONDARY)', testGeminiLLM);
    await measure('OpenAI LLM (gpt-4o-mini, TERTIARY)', testOpenAILLM);
    console.log('');

    // Summary Table
    console.log('╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                         📊 SONUÇ TABLOSU                                ║');
    console.log('╠═══════════════════════════════════════════════╦════════╦═════════════════╣');
    console.log('║ Provider                                      ║ Durum  ║ Latency         ║');
    console.log('╠═══════════════════════════════════════════════╬════════╬═════════════════╣');

    for (const r of results) {
        const name = r.name.padEnd(45);
        const status = r.status === 'OK' ? ' ✅  ' : ' ❌  ';
        const latency = `${r.latencyMs}ms`.padEnd(15);
        console.log(`║ ${name} ║${status} ║ ${latency} ║`);
    }

    console.log('╚═══════════════════════════════════════════════╩════════╩═════════════════╝');
    console.log('');

    // Cost Analysis
    log('💰', '--- MALİYET ANALİZİ ---');
    const elGreeting = results.find(r => r.name.includes('greeting'));
    const elBody = results.find(r => r.name.includes('turbo'));
    const oaiTTS = results.find(r => r.name.includes('OpenAI TTS'));

    if (elGreeting?.status === 'OK' && oaiTTS?.status === 'OK') {
        console.log(`  ElevenLabs Greeting: ${elGreeting.latencyMs}ms — premium kalite, yüksek maliyet`);
        console.log(`  ElevenLabs Body (turbo): ${elBody?.latencyMs || 'N/A'}ms — orta maliyet, hızlı`);
        console.log(`  OpenAI TTS Body: ${oaiTTS.latencyMs}ms — düşük maliyet, güvenilir`);
        console.log('');

        if (oaiTTS.latencyMs < (elBody?.latencyMs || 99999)) {
            log('✨', 'ÖNERİ: OpenAI TTS body için daha hızlı ve ucuz → Body için OpenAI TTS tercih edilmeli');
        } else {
            log('✨', `ÖNERİ: ElevenLabs Turbo body için ${(elBody?.latencyMs || 0) - oaiTTS.latencyMs}ms daha hızlı ama daha pahalı`);
        }
    }
    console.log('');

    // Pipeline Latency Estimate
    const groq = results.find(r => r.name.includes('Groq'));
    const deepgram = results.find(r => r.name.includes('Deepgram'));

    if (groq?.status === 'OK' && deepgram?.status === 'OK' && oaiTTS?.status === 'OK') {
        const totalEstimate = deepgram.latencyMs + groq.latencyMs + oaiTTS.latencyMs;
        log('⚡', `TAHMİNİ TOPLAM PIPELINE LATENCY: ~${totalEstimate}ms`);
        log('📐', `  STT: ${deepgram.latencyMs}ms + LLM: ${groq.latencyMs}ms + TTS: ${oaiTTS.latencyMs}ms`);

        if (totalEstimate < 2000) {
            log('🟢', 'Pipeline latency < 2s — İYİ (konuşma temposu için kabul edilebilir)');
        } else if (totalEstimate < 4000) {
            log('🟡', 'Pipeline latency 2-4s — ORTA (fark edilebilir gecikme)');
        } else {
            log('🔴', 'Pipeline latency > 4s — KÖTÜ (müşteri kaybı riski)');
        }
    }

    // Failures summary
    const failures = results.filter(r => r.status === 'FAIL');
    if (failures.length > 0) {
        console.log('');
        log('⚠️', `${failures.length} BAŞARISIZ TEST:`);
        for (const f of failures) {
            log('  ❌', `${f.name}: ${f.error}`);
        }
    }

    console.log('');
    console.log('Test tamamlandı.');
}

main().catch(console.error);
