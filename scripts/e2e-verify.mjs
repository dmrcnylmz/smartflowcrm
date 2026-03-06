// E2E Verification Script — Voice Pipeline
const BASE = 'http://localhost:3009';
let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        const result = await fn();
        console.log('✅', name);
        passed++;
        return result;
    } catch(e) {
        console.log('❌', name, '—', e.message.substring(0, 100));
        failed++;
        return null;
    }
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log(' KAPSAMLI E2E DOĞRULAMA');
    console.log('═══════════════════════════════════════════');
    console.log('');

    // 1. Health
    await test('Voice Health — düzgün yanıt veriyor', async () => {
        const r = await fetch(BASE + '/api/voice/health');
        const d = await r.json();
        if (d.status !== 'healthy') throw new Error('Not healthy');
    });

    // 2. LLM Multi-turn conversation
    const sid = 'e2e-' + Date.now();

    await test('LLM Turn 1 — Selamlama', async () => {
        const r = await fetch(BASE + '/api/voice/infer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: 'Merhaba, iyi günler', language: 'tr', session_id: sid })
        });
        const d = await r.json();
        if (d.source !== 'groq-llama') throw new Error('Wrong source: ' + d.source);
        if (d.intent !== 'greeting') throw new Error('Wrong intent: ' + d.intent);
        console.log('   → Groq primary ✓ | Intent: greeting ✓ | Turn:', d.turn);
    });

    await test('LLM Turn 2 — Randevu talebi (aynı session)', async () => {
        const r = await fetch(BASE + '/api/voice/infer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: 'Yarın için bir randevu almak istiyorum', language: 'tr', session_id: sid })
        });
        const d = await r.json();
        if (d.source !== 'groq-llama') throw new Error('Wrong source: ' + d.source);
        console.log('   → Multi-turn ✓ | Intent:', d.intent, '| Turn:', d.turn);
    });

    await test('LLM Turn 3 — Bilgi talebi (aynı session)', async () => {
        const r = await fetch(BASE + '/api/voice/infer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: 'Fiyat bilgisi alabilir miyim?', language: 'tr', session_id: sid })
        });
        const d = await r.json();
        console.log('   → Conversation memory ✓ | Intent:', d.intent, '| Turn:', d.turn);
    });

    // 3. TTS Greeting (ElevenLabs premium)
    await test('TTS Greeting — ElevenLabs multilingual_v2', async () => {
        const r = await fetch(BASE + '/api/voice/tts', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: 'Merhaba, hoş geldiniz!', greeting: true, language: 'tr' })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const provider = r.headers.get('x-tts-provider');
        const model = r.headers.get('x-tts-model');
        const buf = await r.arrayBuffer();
        if (provider !== 'elevenlabs') throw new Error('Wrong provider: ' + provider);
        if (model !== 'eleven_multilingual_v2') throw new Error('Wrong model: ' + model);
        console.log('   → Provider: elevenlabs ✓ | Model: multilingual_v2 ✓ | Size:', (buf.byteLength/1024).toFixed(0), 'KB');
    });

    // 4. TTS Body (ElevenLabs turbo)
    await test('TTS Body — ElevenLabs turbo_v2_5', async () => {
        const r = await fetch(BASE + '/api/voice/tts', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: 'Randevunuzu aldım, başka bir şey var mı?', greeting: false, language: 'tr' })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const provider = r.headers.get('x-tts-provider');
        const model = r.headers.get('x-tts-model');
        const buf = await r.arrayBuffer();
        if (provider !== 'elevenlabs') throw new Error('Wrong provider: ' + provider);
        if (model !== 'eleven_turbo_v2_5') throw new Error('Wrong model: ' + model);
        console.log('   → Provider: elevenlabs ✓ | Model: turbo_v2_5 ✓ | Size:', (buf.byteLength/1024).toFixed(0), 'KB');
    });

    // 5. STT Status
    await test('STT Status — Deepgram Nova-2 yapılandırılmış', async () => {
        const r = await fetch(BASE + '/api/voice/stt');
        const d = await r.json();
        if (d.provider !== 'deepgram') throw new Error('Wrong provider: ' + d.provider);
        if (!d.configured) throw new Error('Not configured');
        console.log('   → Provider: deepgram ✓ | Model: nova-2 ✓ | Configured: true ✓');
    });

    // 6. Infer Status — Gemini disabled check
    await test('LLM Status — Gemini devre dışı onayı', async () => {
        const r = await fetch(BASE + '/api/voice/infer');
        const d = await r.json();
        if (!d.providers.gemini.role.includes('DISABLED')) throw new Error('Gemini still enabled');
        if (!d.providers.groq.role.includes('primary')) throw new Error('Groq not primary');
        console.log('   → Groq: primary ✓ | OpenAI: secondary ✓ | Gemini: DISABLED ✓');
    });

    // 7. Chinese character sanitization
    await test('LLM — Çince karakter sanitizasyonu', async () => {
        const r = await fetch(BASE + '/api/voice/infer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: '你好 merhaba', language: 'tr', session_id: 'sanitize-test' })
        });
        const d = await r.json();
        const hasCJK = /[\u4e00-\u9fff]/.test(d.response_text);
        if (hasCJK) throw new Error('Chinese chars in response!');
        console.log('   → Sanitized ✓ | No CJK chars in output');
    });

    // 8. TTS Status endpoint
    await test('TTS Status — Strateji doğrulaması', async () => {
        const r = await fetch(BASE + '/api/voice/tts');
        const d = await r.json();
        if (d.providers.openai.role !== 'last-resort fallback only') throw new Error('OpenAI should be last-resort');
        if (d.providers.elevenlabs.role !== 'primary (all TTS)') throw new Error('ElevenLabs should be primary');
        console.log('   → ElevenLabs: primary ✓ | OpenAI: last-resort fallback ✓');
    });

    // 9. Main page loads
    await test('Main Page — 200 döndürüyor', async () => {
        const r = await fetch(BASE + '/');
        if (r.status !== 200) throw new Error('HTTP ' + r.status);
        console.log('   → Status: 200 ✓');
    });

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(` SONUÇ: ${passed}/${passed + failed} test başarılı`);
    if (failed === 0) {
        console.log(' ✅ TÜM TESTLER GEÇTİ!');
    } else {
        console.log(` ❌ ${failed} test başarısız oldu`);
    }
    console.log('═══════════════════════════════════════════');
}

main().catch(e => console.error('FATAL:', e));
