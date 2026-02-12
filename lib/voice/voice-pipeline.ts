/**
 * Voice Pipeline — Full-Duplex Streaming Orchestrator
 *
 * The central nervous system of the voice AI.
 *
 * Flow:
 * Audio In → STT (partial) → Intent (fast) → LLM+RAG (stream) → TTS (stream) → Audio Out
 *                                                      ↓
 *                                                Tool Calls → n8n Webhooks
 *
 * CORE PRINCIPLE: NEVER WAIT FOR FULL COMPLETION AT ANY STAGE.
 * Everything is streamed, partial, and parallel.
 */

import { EventEmitter } from 'events';
import { DeepgramSTT, type TranscriptEvent } from './stt-deepgram';
import { ElevenLabsTTS } from './tts-elevenlabs';
import { LLMStreaming, type ConversationTurn as LLMTurn, type ToolCallResult } from '../ai/llm-streaming';
import { detectIntentFast, hasEnoughTokensForIntent, getSafeResponse, shouldShortcut, getShortcutResponse, type IntentResult } from '../ai/intent-fast';
import { validateResponse, type RAGContext } from '../ai/guardrails';
import { VectorStore } from '../ai/vector-store';
import { buildSystemPrompt } from '../ai/prompt-builder';
import { getTenantConfig } from '../tenant/config';
import type { TenantConfig, VoiceSessionState, SessionMetrics, ConversationTurn } from '../tenant/types';

// --- Types ---

export interface PipelineConfig {
    deepgramApiKey: string;
    openaiApiKey: string;
    elevenlabsApiKey: string;
}

export interface PipelineEvents {
    /** Partial STT transcript received */
    transcript: (data: { text: string; isFinal: boolean }) => void;
    /** Intent detected */
    intent: (data: IntentResult) => void;
    /** LLM response text (streaming) */
    responseText: (data: { text: string; done: boolean }) => void;
    /** Audio output chunk */
    audioOut: (chunk: Buffer) => void;
    /** Tool call executed */
    toolCall: (data: ToolCallResult) => void;
    /** Session ended */
    sessionEnd: (metrics: SessionMetrics) => void;
    /** Error occurred */
    error: (error: Error) => void;
    /** Pipeline stage latency measurement */
    latency: (data: { stage: string; ms: number }) => void;
}

// --- Constants ---

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CONVERSATION_TURNS = 6; // 3 user + 3 assistant

// --- Voice Pipeline ---

export class VoicePipeline extends EventEmitter {
    private stt: DeepgramSTT;
    private tts: ElevenLabsTTS;
    private llm: LLMStreaming;
    private vectorStore: VectorStore;
    private tenant: TenantConfig | null = null;
    private session: VoiceSessionState;
    private config: PipelineConfig;

    private isProcessing = false;
    private isBargingIn = false;
    private sessionTimer: ReturnType<typeof setTimeout> | null = null;
    private partialTranscript = '';
    private lastIntentDetected: IntentResult | null = null;

    constructor(
        tenantId: string,
        sessionId: string,
        config: PipelineConfig,
    ) {
        super();
        this.config = config;

        // Initialize providers
        this.stt = new DeepgramSTT({ apiKey: config.deepgramApiKey });
        this.tts = new ElevenLabsTTS({ apiKey: config.elevenlabsApiKey });
        this.llm = new LLMStreaming({ apiKey: config.openaiApiKey });
        this.vectorStore = new VectorStore({ openaiApiKey: config.openaiApiKey });

        // Initialize session state
        this.session = {
            sessionId,
            tenantId,
            language: 'tr',
            startedAt: new Date(),
            conversationHistory: [],
            currentIntent: null,
            metrics: {
                turnCount: 0,
                totalLatencyMs: 0,
                sttLatencyMs: [],
                llmLatencyMs: [],
                ttsLatencyMs: [],
                intentsDetected: [],
                escalated: false,
                shortcutCount: 0,
                cacheHits: 0,
                cacheMisses: 0,
            },
        };
    }

    /**
     * Initialize the pipeline — load tenant config and connect STT.
     */
    async initialize(): Promise<void> {
        // Load tenant config
        this.tenant = await getTenantConfig(this.session.tenantId);
        this.session.language = this.tenant.language === 'en' ? 'en' : 'tr';

        // Configure STT language
        this.stt = new DeepgramSTT({
            apiKey: this.config.deepgramApiKey,
            language: this.tenant.voice.sttLanguage || 'tr',
        });

        // Wire up STT events
        this.stt.on('partial', (event: TranscriptEvent) => this.handlePartialTranscript(event));
        this.stt.on('final', (event: TranscriptEvent) => this.handleFinalTranscript(event));
        this.stt.on('error', (err: Error) => this.emit('error', err));

        // Connect to Deepgram
        await this.stt.connect();

        // Start session timeout
        this.resetSessionTimer();
    }

    /**
     * Process an incoming audio chunk from the user.
     * This is the main entry point for audio data.
     */
    processAudioChunk(chunk: Buffer): void {
        // Reset inactivity timer
        this.resetSessionTimer();

        // Barge-in detection: if user speaks while TTS is playing
        if (this.isProcessing) {
            this.isBargingIn = true;
            this.emit('responseText', { text: '', done: true }); // Signal to stop playback
        }

        // Feed audio to STT
        this.stt.sendAudio(chunk);
    }

    /**
     * Handle partial (interim) transcript from STT.
     * Triggers early intent detection on 2+ tokens.
     */
    private handlePartialTranscript(event: TranscriptEvent): void {
        this.partialTranscript = event.text;
        this.emit('transcript', { text: event.text, isFinal: false });

        // Early intent detection on partial text
        if (hasEnoughTokensForIntent(this.partialTranscript)) {
            const intent = detectIntentFast(this.partialTranscript);
            if (intent.intent !== 'unknown' && intent.confidence !== 'low') {
                this.lastIntentDetected = intent;
                this.session.currentIntent = intent.intent;
                this.emit('intent', intent);
            }
        }
    }

    /**
     * Handle final (confirmed) transcript from STT.
     * Triggers the full pipeline: RAG → LLM → TTS.
     */
    private async handleFinalTranscript(event: TranscriptEvent): Promise<void> {
        const sttEnd = Date.now();
        const userText = event.text;

        if (!userText.trim()) return;

        this.emit('transcript', { text: userText, isFinal: true });

        // Record STT latency
        this.session.metrics.sttLatencyMs.push(Date.now() - sttEnd);

        // Final intent detection
        const intent = detectIntentFast(userText);
        this.lastIntentDetected = intent;
        this.session.currentIntent = intent.intent;
        this.session.metrics.intentsDetected.push(intent.intent);
        this.emit('intent', intent);

        // Add user turn to history
        this.addConversationTurn('user', userText, intent.intent);

        // Process through LLM + RAG pipeline
        await this.processUserInput(userText, intent);
    }

    /**
     * Core processing: RAG retrieval → LLM streaming → Guardrails → TTS streaming.
     */
    private async processUserInput(userText: string, intent: IntentResult): Promise<void> {
        if (!this.tenant) return;

        this.isProcessing = true;
        this.isBargingIn = false;

        const llmStart = Date.now();

        try {
            // 0. SHORTCUT: Skip LLM entirely for simple, high-confidence intents
            if (shouldShortcut(intent)) {
                const shortcutResponse = getShortcutResponse(
                    intent.intent,
                    this.session.language,
                    this.tenant.agent.name,
                );
                this.emit('responseText', { text: shortcutResponse, done: true });
                this.emit('latency', { stage: 'shortcut', ms: Date.now() - llmStart });
                await this.streamResponseToTTS(shortcutResponse);
                this.addConversationTurn('assistant', shortcutResponse, intent.intent);
                this.session.metrics.shortcutCount = (this.session.metrics.shortcutCount || 0) + 1;
                this.session.metrics.turnCount++;
                this.isProcessing = false;
                return;
            }

            // 1. RAG Retrieval
            const ragResults = await this.vectorStore.search(this.session.tenantId, userText);

            const ragContexts: RAGContext[] = ragResults.map(r => ({
                text: r.text,
                score: r.score,
                source: r.metadata.source,
            }));

            // 2. Check RAG confidence — if too low, use safe response
            const maxRagScore = ragContexts.length > 0
                ? Math.max(...ragContexts.map(c => c.score))
                : 0;

            if (ragContexts.length === 0 || maxRagScore < 0.75) {
                // No grounded answer possible — use safe fallback
                const safeResponse = getSafeResponse(intent.intent, this.session.language);
                this.emit('responseText', { text: safeResponse, done: true });
                await this.streamResponseToTTS(safeResponse);
                this.addConversationTurn('assistant', safeResponse, intent.intent);
                this.isProcessing = false;
                return;
            }

            // 3. Build system prompt with RAG context
            const systemPrompt = buildSystemPrompt({
                tenant: this.tenant,
                ragResults,
                currentIntent: intent.intent,
                language: this.session.language,
            });

            // 4. Stream LLM response
            const history: LLMTurn[] = this.session.conversationHistory.map(t => ({
                role: t.role,
                content: t.content,
            }));

            let fullResponse = '';
            const tokenGenerator = this.llm.streamCompletion(
                systemPrompt,
                history.slice(0, -1), // Exclude current user message (already passed)
                userText,
                true,
                this.session.language,
            );

            // Create a passthrough async generator for TTS consumption
            const ttsTokens = this.createTTSTokenStream(tokenGenerator, (token) => {
                fullResponse += token;
                if (!this.isBargingIn) {
                    this.emit('responseText', { text: token, done: false });
                }
            });

            // 5. Stream tokens to TTS (parallel)
            const ttsStart = Date.now();

            for await (const audioChunk of this.tts.streamTokens(ttsTokens, {
                voiceId: this.tenant.voice.voiceId,
                language: this.session.language,
            })) {
                if (this.isBargingIn) break; // Stop TTS on barge-in
                this.emit('audioOut', audioChunk);
            }

            this.session.metrics.ttsLatencyMs.push(Date.now() - ttsStart);

            // 6. Validate response with guardrails
            const guardrailResult = validateResponse(fullResponse, ragContexts, {
                forbiddenTopics: this.tenant.guardrails.forbiddenTopics,
                competitorNames: this.tenant.guardrails.competitorNames,
                allowPriceQuotes: this.tenant.guardrails.allowPriceQuotes,
                language: this.session.language,
            });

            // Log violations but don't block (already spoke)
            if (guardrailResult.violations.length > 0) {
                console.warn('[Pipeline] Guardrail violations:', guardrailResult.violations);
            }

            this.emit('responseText', { text: '', done: true });
            this.session.metrics.llmLatencyMs.push(Date.now() - llmStart);

            // 7. Record assistant turn
            this.addConversationTurn('assistant', fullResponse, intent.intent);

            // 8. Update metrics
            this.session.metrics.turnCount++;
            this.session.metrics.totalLatencyMs += Date.now() - llmStart;

        } catch (err) {
            console.error('[Pipeline] Processing error:', err);
            const fallback = getSafeResponse(intent.intent, this.session.language);
            this.emit('responseText', { text: fallback, done: true });
            await this.streamResponseToTTS(fallback);
            this.emit('error', err instanceof Error ? err : new Error(String(err)));
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Create a passthrough async generator that intercepts tokens
     * for UI streaming while feeding them to TTS.
     */
    private async *createTTSTokenStream(
        source: AsyncGenerator<string, ToolCallResult[]>,
        onToken: (token: string) => void,
    ): AsyncGenerator<string> {
        try {
            while (true) {
                const { value, done } = await source.next();
                if (done) {
                    // value is ToolCallResult[] on done
                    const toolCalls = value as ToolCallResult[];
                    if (toolCalls && toolCalls.length > 0) {
                        for (const tc of toolCalls) {
                            this.emit('toolCall', tc);
                            await this.executeToolCall(tc);
                        }
                    }
                    break;
                }
                onToken(value);
                yield value;
            }
        } catch {
            // Generator closed (e.g., barge-in)
        }
    }

    /**
     * Stream a complete text response through TTS.
     * Used for safe fallback responses.
     */
    private async streamResponseToTTS(text: string): Promise<void> {
        if (!this.tenant) return;

        try {
            for await (const chunk of this.tts.streamText(text, {
                voiceId: this.tenant.voice.voiceId,
                language: this.session.language,
            })) {
                if (this.isBargingIn) break;
                this.emit('audioOut', chunk);
            }
        } catch (err) {
            console.error('[Pipeline] TTS error:', err);
        }
    }

    /**
     * Execute a tool call via n8n webhook.
     */
    private async executeToolCall(toolCall: ToolCallResult): Promise<void> {
        try {
            const { triggerN8NWebhook } = await import('../n8n/client');

            const payload = {
                sessionId: this.session.sessionId,
                tenantId: this.session.tenantId,
                toolName: toolCall.toolName,
                arguments: toolCall.arguments,
                timestamp: new Date().toISOString(),
            };

            await triggerN8NWebhook(toolCall.toolName.replace(/_/g, '-'), payload);
        } catch (err) {
            console.error(`[Pipeline] Tool call failed (${toolCall.toolName}):`, err);
        }
    }

    /**
     * Add a turn to conversation history (capped at MAX_CONVERSATION_TURNS).
     */
    private addConversationTurn(
        role: 'user' | 'assistant',
        content: string,
        intent?: string,
    ): void {
        this.session.conversationHistory.push({
            role,
            content,
            timestamp: new Date(),
            intent,
        });

        // Keep only last N turns
        if (this.session.conversationHistory.length > MAX_CONVERSATION_TURNS) {
            this.session.conversationHistory = this.session.conversationHistory.slice(-MAX_CONVERSATION_TURNS);
        }
    }

    /**
     * Reset the inactivity timer.
     */
    private resetSessionTimer(): void {
        if (this.sessionTimer) clearTimeout(this.sessionTimer);
        this.sessionTimer = setTimeout(() => this.endSession(), SESSION_TIMEOUT_MS);
    }

    /**
     * End the session and clean up.
     */
    async endSession(): Promise<void> {
        if (this.sessionTimer) clearTimeout(this.sessionTimer);

        this.emit('sessionEnd', this.session.metrics);

        // Close STT
        await this.stt.close();

        this.removeAllListeners();
    }

    /**
     * Get current session state (for monitoring).
     */
    getSessionState(): VoiceSessionState {
        return { ...this.session };
    }

    /**
     * Get session metrics.
     */
    getMetrics(): SessionMetrics {
        return { ...this.session.metrics };
    }
}
