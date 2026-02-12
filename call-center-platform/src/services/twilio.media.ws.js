/**
 * Twilio Media Stream WebSocket Handler
 * 
 * Handles real-time audio streaming between Twilio and the voice pipeline.
 * 
 * Protocol (Twilio → Server):
 *   { event: 'connected', ... }
 *   { event: 'start', streamSid, start: { callSid, customParameters } }
 *   { event: 'media', media: { payload (base64 μ-law), timestamp, chunk } }
 *   { event: 'stop' }
 * 
 * Protocol (Server → Twilio):
 *   { event: 'media', streamSid, media: { payload (base64 μ-law) } }
 *   { event: 'clear', streamSid }    // barge-in: cancel pending audio
 *   { event: 'mark', streamSid, mark: { name } }
 */
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');
const memoryService = require('./memory.service');
const sttAdapter = require('./stt.adapter');
const ttsAdapter = require('./tts.adapter');
const llmRouter = require('./llm-router');
const embeddingService = require('./embedding.service');
const costControl = require('./cost-control');
const piiRedactor = require('./pii-redactor');
const handoffService = require('./handoff.service');
const latencyTracker = require('./latency-tracker');
const twilioService = require('./twilio.service');

const logger = rootLogger.child({ component: 'twilio-media' });

// Active Twilio media sessions
const twilioSessions = new Map();

// ─── Audio Conversion: μ-law ↔ PCM ──────────────────────

// μ-law to 16-bit linear PCM lookup table
const MULAW_TO_LINEAR = new Int16Array(256);
(function buildMulawTable() {
    for (let i = 0; i < 256; i++) {
        let mu = ~i & 0xFF;
        let sign = (mu & 0x80) ? -1 : 1;
        let exponent = (mu >> 4) & 0x07;
        let mantissa = mu & 0x0F;
        let magnitude = ((mantissa << 1) + 33) << (exponent + 2);
        magnitude -= 0x84;
        MULAW_TO_LINEAR[i] = sign * magnitude;
    }
})();

/**
 * Convert μ-law 8kHz buffer to 16-bit PCM 16kHz (upsample 2x)
 */
function mulawToPcm16k(mulawBuffer) {
    const pcm = Buffer.alloc(mulawBuffer.length * 4); // 2x samples, 2 bytes each
    for (let i = 0; i < mulawBuffer.length; i++) {
        const sample = MULAW_TO_LINEAR[mulawBuffer[i]];
        // Write each sample twice for 8kHz → 16kHz upsampling
        pcm.writeInt16LE(sample, i * 4);
        pcm.writeInt16LE(sample, i * 4 + 2);
    }
    return pcm;
}

/**
 * Convert 16-bit PCM to μ-law
 */
function pcmToMulaw(pcmBuffer) {
    const mulawBuf = Buffer.alloc(pcmBuffer.length / 2);
    for (let i = 0; i < mulawBuf.length; i++) {
        const sample = pcmBuffer.readInt16LE(i * 2);
        mulawBuf[i] = linearToMulaw(sample);
    }
    return mulawBuf;
}

function linearToMulaw(sample) {
    const BIAS = 0x84;
    const MAX = 32635;
    let sign = 0;

    if (sample < 0) {
        sign = 0x80;
        sample = -sample;
    }

    if (sample > MAX) sample = MAX;
    sample += BIAS;

    let exponent = 7;
    let mask = 0x4000;
    while ((sample & mask) === 0 && exponent > 0) {
        exponent--;
        mask >>= 1;
    }

    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulaw = ~(sign | (exponent << 4) | mantissa) & 0xFF;
    return mulaw;
}

/**
 * Handle a new Twilio Media Stream WebSocket connection
 */
function handleTwilioMediaConnection(ws) {
    const sessionId = uuid();
    let streamSid = null;
    let callSid = null;
    let tenantId = null;
    let session = null;
    let isProcessing = false;
    let isSpeaking = false;

    const sessionLogger = logger.child({ sessionId });
    sessionLogger.info('Twilio media WS connected');

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleTwilioEvent(msg);
        } catch (e) {
            sessionLogger.error('Invalid Twilio media message', { error: e.message });
        }
    });

    ws.on('close', () => {
        sessionLogger.info('Twilio media WS disconnected', {
            duration: session ? Date.now() - session.startTime : 0
        });

        if (session) {
            // Track telephony minutes
            const durationSec = Math.floor((Date.now() - session.startTime) / 1000);
            if (tenantId && durationSec > 0) {
                twilioService.trackMinutes(tenantId, durationSec);
            }

            // Cleanup STT stream
            if (session.sttStream && session.sttStream.close) {
                session.sttStream.close();
            }
            twilioSessions.delete(sessionId);
            metrics.setGauge('twilio_sessions_active', twilioSessions.size);
        }
    });

    ws.on('error', (err) => {
        sessionLogger.error('Twilio media WS error', { error: err.message });
        metrics.inc('errors_total', { component: 'twilio-media' });
    });

    function handleTwilioEvent(msg) {
        switch (msg.event) {
            case 'connected':
                sessionLogger.info('Twilio stream connected');
                break;

            case 'start':
                streamSid = msg.streamSid;
                callSid = msg.start?.callSid;
                const customParams = msg.start?.customParameters || {};
                tenantId = customParams.tenantId || 'default';

                sessionLogger.info('Twilio stream started', { streamSid, callSid, tenantId });
                metrics.inc('twilio_sessions_total', { tenant: tenantId });

                // Load tenant settings
                let settings = null;
                try {
                    const { dbPrepareGet } = require('../config/database');
                    settings = dbPrepareGet(
                        'SELECT * FROM tenant_settings WHERE tenant_id = ?',
                        [tenantId]
                    );
                } catch (e) {
                    sessionLogger.warn('Could not load tenant settings', { error: e.message });
                }

                // Create session (mirroring voice.ws.js session structure)
                session = {
                    id: sessionId,
                    tenantId,
                    userId: 'twilio-caller',
                    callId: callSid,
                    sttStream: null,
                    isProcessing: false,
                    startTime: Date.now(),
                    settings,
                    language: settings?.language || 'en'
                };

                twilioSessions.set(sessionId, session);
                metrics.setGauge('twilio_sessions_active', twilioSessions.size);

                // Add system prompt
                if (settings) {
                    memoryService.addTurn(
                        sessionId, tenantId, callSid,
                        'system', `You are an AI phone agent for ${settings.company_name || 'the company'}. Keep responses concise and natural for phone conversation.`
                    );
                }

                // Initialize STT stream
                session.sttStream = sttAdapter.createStream(
                    // onPartial — no-op for phone (no partial display)
                    () => { },
                    // onFinal — process utterance
                    (finalText) => {
                        handlePhoneUtterance(finalText);
                    }
                );
                break;

            case 'media':
                if (!session || !session.sttStream) return;

                // Barge-in: if user speaks while AI is speaking, clear AI audio
                if (isSpeaking) {
                    isSpeaking = false;
                    sendClear();
                    sessionLogger.info('Barge-in detected');
                    metrics.inc('twilio_bargein', { tenant: tenantId });
                }

                // Decode μ-law payload and convert to PCM for STT
                const audioData = Buffer.from(msg.media.payload, 'base64');
                const pcmData = mulawToPcm16k(audioData);
                session.sttStream.feed(pcmData.toString('base64'));
                break;

            case 'stop':
                sessionLogger.info('Twilio stream stopped');
                if (session?.sttStream) {
                    session.sttStream.flush();
                }
                break;

            default:
                break;
        }
    }

    async function handlePhoneUtterance(text) {
        if (!session || isProcessing) return;
        isProcessing = true;

        const trace = latencyTracker.createTrace(sessionId, tenantId);

        try {
            // PII redaction
            const redactedText = piiRedactor.redactForStorage(text);

            // Store in memory
            memoryService.addTurn(sessionId, tenantId, callSid, 'user', redactedText);
            embeddingService.storeEmbedding(sessionId, tenantId, redactedText).catch(() => { });

            // Intent detection + handoff evaluation
            trace.startStage('intent');
            let aiService;
            try { aiService = require('./ai.service'); } catch (e) { }

            const intent = aiService ? aiService.detectIntent(text) : 'other';
            trace.endStage('intent');

            const knownIntents = ['appointment', 'complaint', 'pricing'];
            const confidence = knownIntents.includes(intent) ? 0.85 : (intent === 'human' ? 0.1 : 0.5);

            const handoffResult = handoffService.evaluateHandoff(text, intent, confidence, session.settings);
            if (handoffResult.shouldHandoff) {
                const handoffId = handoffService.createHandoff(
                    callSid, tenantId, sessionId, handoffResult.reason
                );

                // TODO: Bridge to agent phone via Twilio <Dial> when agent SIP is configured
                sessionLogger.info('Handoff triggered on phone call', { handoffId, reason: handoffResult.reason });

                // For now, speak a handoff message
                const handoffMsg = session.language === 'tr'
                    ? 'Sizi bir müşteri temsilcisine bağlıyorum. Lütfen bekleyin.'
                    : 'I am transferring you to a representative. Please hold.';
                await speakToTwilio(handoffMsg);

                trace.finalize();
                isProcessing = false;
                return;
            }

            // Budget check
            const budget = costControl.checkBudget(tenantId, 'tokens');
            if (budget.exceeded) {
                const budgetMsg = costControl.getBudgetExceededMessage(session.language);
                await speakToTwilio(budgetMsg);
                trace.finalize();
                isProcessing = false;
                return;
            }

            // Get memory + RAG context
            const memoryContext = memoryService.getFormattedHistory(sessionId, 10);
            const ragContext = await embeddingService.buildRagContext(tenantId, text);
            const enrichedContext = memoryContext + ragContext;

            // LLM routing
            trace.startStage('llm');
            let fullResponse = '';
            let firstChunkSent = false;

            await llmRouter.route(
                text,
                session.settings,
                enrichedContext,
                async (sentenceText, isFinal) => {
                    fullResponse += (fullResponse ? ' ' : '') + sentenceText;

                    if (!firstChunkSent) {
                        trace.endStage('llm');
                        trace.markFirstByte();
                        firstChunkSent = true;
                    }

                    // Convert TTS response to μ-law and send to Twilio
                    trace.startStage('tts');
                    await speakToTwilio(sentenceText);
                    trace.endStage('tts');
                },
                session.language,
                { forceProvider: budget.degraded ? 'local' : undefined }
            );

            if (!firstChunkSent) {
                trace.endStage('llm');
            }

            // Store assistant response
            const redactedResponse = piiRedactor.redactForStorage(fullResponse);
            memoryService.addTurn(sessionId, tenantId, callSid, 'assistant', redactedResponse);
            embeddingService.storeEmbedding(sessionId, tenantId, redactedResponse).catch(() => { });

            // Track billing
            if (aiService) {
                aiService._trackUsage(tenantId, 0, 0);
            }

            trace.finalize();

        } catch (e) {
            sessionLogger.error('Phone pipeline error', { error: e.message });
            metrics.inc('errors_total', { component: 'twilio-pipeline' });

            // Speak error message
            const errorMsg = session?.language === 'tr'
                ? 'Bir hata oluştu. Lütfen tekrar deneyin.'
                : 'An error occurred. Please try again.';
            await speakToTwilio(errorMsg).catch(() => { });
        } finally {
            isProcessing = false;
        }
    }

    /**
     * Synthesize text via TTS and send μ-law audio to Twilio
     */
    async function speakToTwilio(text) {
        try {
            const audioPayload = await ttsAdapter.synthesize(text);
            isSpeaking = true;

            if (audioPayload.type === 'browser_tts') {
                // Local TTS: generate silence placeholder (Twilio needs actual audio)
                // In production with ElevenLabs, this would be real audio
                const silenceBytes = 8000; // 1 second of μ-law silence at 8kHz
                const silence = Buffer.alloc(silenceBytes, 0xFF); // 0xFF = μ-law silence
                sendMedia(silence.toString('base64'));
            } else if (audioPayload.data) {
                // Real audio (MP3/PCM from ElevenLabs) — convert to μ-law
                // For now, send as-is (Twilio also accepts base64-encoded audio)
                sendMedia(audioPayload.data);
            }

            // Mark end of speech segment
            sendMark(`speech-${Date.now()}`);
        } catch (e) {
            sessionLogger.error('TTS for Twilio failed', { error: e.message });
        }
    }

    function sendMedia(payload) {
        if (ws.readyState !== 1 || !streamSid) return;
        ws.send(JSON.stringify({
            event: 'media',
            streamSid,
            media: { payload }
        }));
    }

    function sendClear() {
        if (ws.readyState !== 1 || !streamSid) return;
        ws.send(JSON.stringify({
            event: 'clear',
            streamSid
        }));
    }

    function sendMark(name) {
        if (ws.readyState !== 1 || !streamSid) return;
        ws.send(JSON.stringify({
            event: 'mark',
            streamSid,
            mark: { name }
        }));
    }
}

function getTwilioSessions() {
    const result = [];
    for (const [id, session] of twilioSessions) {
        result.push({
            sessionId: id,
            tenantId: session.tenantId,
            callId: session.callId,
            duration: Date.now() - session.startTime,
            type: 'twilio'
        });
    }
    return result;
}

module.exports = { handleTwilioMediaConnection, getTwilioSessions, twilioSessions };
