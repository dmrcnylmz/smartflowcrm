/**
 * Voice WebSocket Handler — Phase 7 Real-Time Voice Streaming
 * 
 * Full-duplex voice pipeline:
 * Client Mic → STT Stream → LLM Stream → TTS Stream → Client Speaker
 * 
 * Protocol:
 * Client → { type: 'start', callId? }        Start session
 * Client → { type: 'audio', data: base64 }   Audio chunk
 * Client → { type: 'text', data: string }     Text input (fallback)
 * Client → { type: 'end' }                   End session
 * 
 * Server → { type: 'partial_transcript', text }  
 * Server → { type: 'transcript', text }          
 * Server → { type: 'response_text', text, isFinal }
 * Server → { type: 'response_audio', data, format }
 * Server → { type: 'handoff', reason, handoffId }
 * Server → { type: 'session_start', sessionId }
 * Server → { type: 'error', message }
 */
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');
const memoryService = require('./memory.service');
const sttAdapter = require('./stt.adapter');
const llmStreaming = require('./llm.streaming');
const ttsAdapter = require('./tts.adapter');
const handoffService = require('./handoff.service');
const { checkWsRate } = require('../middleware/rate-limiter');
const latencyTracker = require('./latency-tracker');
const llmRouter = require('./llm-router');
const embeddingService = require('./embedding.service');
const costControl = require('./cost-control');
const piiRedactor = require('./pii-redactor');
const { handleTwilioMediaConnection } = require('./twilio.media.ws');

const logger = rootLogger.child({ component: 'voice-ws' });

// Active sessions map
const sessions = new Map();

// Agent notification subscribers (for handoff alerts)
const agentSubscribers = new Map();

function setupVoiceWebSocket(server, jwtSecret) {
    const wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade for /ws/voice
    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url, `http://${request.headers.host}`);

        if (url.pathname === '/ws/voice') {
            // Authenticate via query token
            const token = url.searchParams.get('token');
            if (!token) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            try {
                const decoded = jwt.verify(token, jwtSecret);
                request.user = decoded;
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit('connection', ws, request);
                });
            } catch (e) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
            }
        } else if (url.pathname === '/ws/agent') {
            // Agent notification channel
            const token = url.searchParams.get('token');
            if (!token) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            try {
                const decoded = jwt.verify(token, jwtSecret);
                request.user = decoded;
                wss.handleUpgrade(request, socket, head, (ws) => {
                    handleAgentConnection(ws, decoded);
                });
            } catch (e) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
            }
        } else if (url.pathname === '/ws/twilio-media') {
            // Twilio Media Stream — no JWT auth (authenticated by Twilio call context)
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleTwilioMediaConnection(ws);
            });
        } else {
            socket.destroy();
        }
    });

    wss.on('connection', (ws, request) => {
        const user = request.user;
        const sessionId = uuid();

        const sessionLogger = logger.child({ sessionId, tenantId: user.tenantId, userId: user.userId });
        sessionLogger.info('Voice session connected');
        metrics.inc('voice_sessions_total', { tenant_id: user.tenantId });
        metrics.setGauge('voice_sessions_active', sessions.size + 1);

        const session = {
            id: sessionId,
            tenantId: user.tenantId,
            userId: user.userId,
            callId: null,
            sttStream: null,
            isProcessing: false,
            startTime: Date.now(),
            settings: null
        };

        sessions.set(sessionId, session);

        // Load tenant settings
        try {
            const { dbPrepareGet } = require('../config/database');
            session.settings = dbPrepareGet(
                'SELECT * FROM tenant_settings WHERE tenant_id = ?',
                [user.tenantId]
            );
        } catch (e) {
            sessionLogger.warn('Could not load tenant settings', { error: e.message });
        }

        // Send session info
        safeSend(ws, {
            type: 'session_start', sessionId, providers: {
                stt: sttAdapter.provider,
                llm: llmStreaming.provider,
                tts: ttsAdapter.provider
            }
        });

        // Initialize STT stream
        session.sttStream = sttAdapter.createStream(
            // onPartial
            (partial) => {
                safeSend(ws, { type: 'partial_transcript', text: partial });
            },
            // onFinal
            (final) => {
                safeSend(ws, { type: 'transcript', text: final });
                handleUserUtterance(ws, session, sessionLogger, final);
            }
        );

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                handleMessage(ws, session, sessionLogger, msg);
            } catch (e) {
                safeSend(ws, { type: 'error', message: 'Invalid message format' });
            }
        });

        ws.on('close', () => {
            sessionLogger.info('Voice session disconnected', {
                duration: Date.now() - session.startTime
            });
            cleanupSession(session);
            sessions.delete(sessionId);
            metrics.setGauge('voice_sessions_active', sessions.size);
        });

        ws.on('error', (err) => {
            sessionLogger.error('WebSocket error', { error: err.message });
            metrics.inc('errors_total', { component: 'voice-ws' });
        });
    });

    return wss;
}

// ─── Message Handlers ────────────────────────────────────

function handleMessage(ws, session, log, msg) {
    switch (msg.type) {
        case 'start':
            session.callId = msg.callId || null;
            // Language: explicit from client > tenant setting > default 'en'
            session.language = msg.language || (session.settings && session.settings.language) || 'en';
            log.info('Voice session started', { callId: session.callId, language: session.language });
            // Add system prompt to memory
            if (session.settings) {
                memoryService.addTurn(
                    session.id, session.tenantId, session.callId,
                    'system', `You are an AI agent for ${session.settings.company_name || 'the company'}.`
                );
            }
            safeSend(ws, { type: 'ready', language: session.language });
            break;

        case 'audio':
            // Rate limit audio chunks
            if (!checkWsRate(session.id)) {
                safeSend(ws, { type: 'error', message: 'Audio rate limit exceeded' });
                return;
            }
            if (session.sttStream && msg.data) {
                session.sttStream.feed(msg.data);
            }
            break;

        case 'text':
            // Direct text input (fallback for no mic)
            // NOTE: Do NOT echo 'transcript' back — client already shows user message
            if (msg.data) {
                handleUserUtterance(ws, session, log, msg.data);
            }
            break;

        case 'end':
            log.info('Voice session ending');
            if (session.sttStream) {
                session.sttStream.flush();
            }
            safeSend(ws, { type: 'session_end', sessionId: session.id });
            break;

        case 'set_language':
            if (msg.language && ['en', 'tr'].includes(msg.language)) {
                session.language = msg.language;
                log.info('Language changed', { language: session.language });
                safeSend(ws, { type: 'language_changed', language: session.language });
            } else {
                safeSend(ws, { type: 'error', message: 'Invalid language. Supported: en, tr' });
            }
            break;

        default:
            safeSend(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
}

async function handleUserUtterance(ws, session, log, text) {
    if (session.isProcessing) {
        log.warn('Already processing, queuing');
        return;
    }
    session.isProcessing = true;

    // Phase 13: Start pipeline latency trace
    const trace = latencyTracker.createTrace(session.id, session.tenantId);

    try {
        // Phase 18: Redact PII from user input before storing
        const redactedText = piiRedactor.redactForStorage(text);

        // 1. Store user turn in memory (redacted)
        memoryService.addTurn(session.id, session.tenantId, session.callId, 'user', redactedText);

        // Phase 15: Store embedding for RAG
        embeddingService.storeEmbedding(session.id, session.tenantId, redactedText).catch(() => { });

        // 2. Check handoff conditions (parallel with intent detection)
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
                session.callId, session.tenantId, session.id, handoffResult.reason
            );
            safeSend(ws, { type: 'handoff', reason: handoffResult.reason, handoffId });
            notifyAgents(session.tenantId, {
                type: 'handoff_alert', handoffId,
                sessionId: session.id, reason: handoffResult.reason, callId: session.callId
            });
            trace.finalize();
            session.isProcessing = false;
            return;
        }

        // Phase 16: Check cost budget before expensive LLM call
        const budget = costControl.checkBudget(session.tenantId, 'tokens');
        if (budget.exceeded) {
            const budgetMsg = costControl.getBudgetExceededMessage(session.language);
            safeSend(ws, { type: 'response_text', text: budgetMsg, isFinal: true });
            safeSend(ws, { type: 'budget_warning', ...budget });
            try {
                const audioPayload = await ttsAdapter.synthesize(budgetMsg);
                safeSend(ws, { type: 'response_audio', ...audioPayload });
            } catch (e) { /* best effort */ }
            trace.finalize();
            session.isProcessing = false;
            return;
        }

        // Notify client if budget degraded
        if (budget.degraded) {
            safeSend(ws, { type: 'budget_warning', ...budget });
        }

        // 3. Get memory context + RAG context
        const memoryContext = memoryService.getFormattedHistory(session.id, 10);
        const ragContext = await embeddingService.buildRagContext(session.tenantId, text);
        const enrichedContext = memoryContext + ragContext;

        // 4. Route to optimal LLM (Phase 14) with latency tracking (Phase 13)
        trace.startStage('llm');
        let fullResponse = '';
        let firstChunkSent = false;

        const result = await llmRouter.route(
            text,
            session.settings,
            enrichedContext,
            async (sentenceText, isFinal) => {
                fullResponse += (fullResponse ? ' ' : '') + sentenceText;
                safeSend(ws, { type: 'response_text', text: sentenceText, isFinal });

                if (!firstChunkSent) {
                    trace.endStage('llm');
                    trace.markFirstByte();
                    firstChunkSent = true;
                }

                // 5. Pipeline TTS for each sentence
                trace.startStage('tts');
                try {
                    const audioPayload = await ttsAdapter.synthesize(sentenceText);
                    safeSend(ws, { type: 'response_audio', ...audioPayload });
                } catch (e) {
                    log.error('TTS failed for sentence', { error: e.message });
                }
                trace.endStage('tts');
            },
            session.language,
            { forceProvider: budget.degraded ? 'local' : undefined }
        );

        if (!firstChunkSent) {
            trace.endStage('llm');
        }

        // 6. Store assistant turn (redacted) + embedding
        const redactedResponse = piiRedactor.redactForStorage(fullResponse);
        memoryService.addTurn(session.id, session.tenantId, session.callId, 'assistant', redactedResponse);
        embeddingService.storeEmbedding(session.id, session.tenantId, redactedResponse).catch(() => { });

        // 7. Track billing
        if (aiService) {
            aiService._trackUsage(session.tenantId, 0, result.totalTokens || 0);
        }

        // Phase 13: Finalize latency trace
        const latency = trace.finalize();

        // Send latency info to client
        safeSend(ws, {
            type: 'latency',
            stt_ms: latency.stt_ms,
            llm_ms: latency.llm_ms,
            tts_ms: latency.tts_ms,
            total_ms: latency.total_ms,
            provider: result.provider || 'local'
        });

    } catch (e) {
        log.error('Voice pipeline error', { error: e.message });
        metrics.inc('errors_total', { component: 'voice-pipeline' });
        safeSend(ws, { type: 'error', message: 'Processing error' });
    } finally {
        session.isProcessing = false;
    }
}

// ─── Agent Notification ──────────────────────────────────

function handleAgentConnection(ws, user) {
    const key = `${user.tenantId}:${user.userId}`;
    agentSubscribers.set(key, ws);
    logger.info('Agent subscribed', { userId: user.userId, tenantId: user.tenantId });

    ws.on('close', () => {
        agentSubscribers.delete(key);
    });
}

function notifyAgents(tenantId, message) {
    for (const [key, ws] of agentSubscribers.entries()) {
        if (key.startsWith(tenantId + ':') && ws.readyState === 1) {
            safeSend(ws, message);
        }
    }
}

// ─── Utilities ───────────────────────────────────────────

function safeSend(ws, data) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
    }
}

function cleanupSession(session) {
    if (session.sttStream && session.sttStream.close) {
        session.sttStream.close();
    }
}

function getActiveSessions() {
    const result = [];
    for (const [id, session] of sessions) {
        result.push({
            sessionId: id,
            tenantId: session.tenantId,
            callId: session.callId,
            duration: Date.now() - session.startTime,
            turnCount: memoryService.getTurnCount(id)
        });
    }
    return result;
}

module.exports = { setupVoiceWebSocket, getActiveSessions, sessions, handleUserUtterance, safeSend, notifyAgents };
