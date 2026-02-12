/**
 * OpenAI GPT-4o Streaming LLM Provider
 *
 * Streaming completions with tool calling support.
 * First token target: ~100ms.
 *
 * Rules:
 * - Temperature 0.3 (factual, not creative)
 * - Max 200 tokens per response (short, employee-like)
 * - 10s hard timeout with safe fallback
 * - Last 3 turns context only (no memory growth)
 */

import OpenAI from 'openai';

// --- Types ---

export interface LLMConfig {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

export interface ConversationTurn {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface ToolCallResult {
    toolName: string;
    arguments: Record<string, unknown>;
}

export interface LLMStreamResult {
    tokens: AsyncGenerator<string>;
    toolCalls: Promise<ToolCallResult[]>;
}

// --- Constants ---

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_CONVERSATION_TURNS = 3;

// --- Safe fallback responses ---

const SAFE_RESPONSES: Record<string, string> = {
    tr: 'Bir teknik sorun yaşıyoruz. Sizi en kısa sürede geri arayacağız. Anlayışınız için teşekkür ederiz.',
    en: 'We are experiencing a technical issue. We will call you back as soon as possible. Thank you for your understanding.',
};

// --- Tool definitions for CRM actions ---

export const CRM_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'book_appointment',
            description: 'Müşteri için randevu oluştur. Tarih ve saat bilgisi gereklidir.',
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'Randevu tarihi (YYYY-MM-DD)' },
                    time: { type: 'string', description: 'Randevu saati (HH:MM)' },
                    subject: { type: 'string', description: 'Randevu konusu' },
                    customerName: { type: 'string', description: 'Müşteri adı' },
                },
                required: ['date', 'time', 'subject'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'log_complaint',
            description: 'Müşteri şikayetini kaydet.',
            parameters: {
                type: 'object',
                properties: {
                    category: { type: 'string', description: 'Şikayet kategorisi' },
                    description: { type: 'string', description: 'Şikayet detayı' },
                    priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                },
                required: ['category', 'description'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'escalate_to_human',
            description: 'Müşteriyi insan operatöre bağla. AI çözemediğinde veya müşteri talep ettiğinde kullan.',
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: 'Eskalasyon sebebi' },
                    department: { type: 'string', description: 'Yönlendirilecek departman' },
                },
                required: ['reason'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'request_info',
            description: 'Bilgi talebini kaydet ve ilgili departmana ilet.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'Bilgi konusu' },
                    details: { type: 'string', description: 'Detaylı talep' },
                },
                required: ['topic'],
            },
        },
    },
];

// --- LLM Streaming Provider ---

export class LLMStreaming {
    private client: OpenAI;
    private config: Required<LLMConfig>;

    constructor(config: LLMConfig) {
        this.config = {
            apiKey: config.apiKey,
            model: config.model || DEFAULT_MODEL,
            maxTokens: config.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: config.temperature || DEFAULT_TEMPERATURE,
            timeoutMs: config.timeoutMs || DEFAULT_TIMEOUT_MS,
        };

        this.client = new OpenAI({
            apiKey: this.config.apiKey,
            timeout: this.config.timeoutMs,
        });
    }

    /**
     * Stream a completion from GPT-4o.
     * Returns an async generator yielding tokens as strings.
     *
     * @param systemPrompt - Full system prompt (built by prompt-builder)
     * @param conversationHistory - Last N turns
     * @param userMessage - Current user input
     * @param enableTools - Whether to enable CRM tool calling
     */
    async *streamCompletion(
        systemPrompt: string,
        conversationHistory: ConversationTurn[],
        userMessage: string,
        enableTools: boolean = true,
        language: string = 'tr',
    ): AsyncGenerator<string, ToolCallResult[]> {
        // Trim conversation to last N turns
        const recentHistory = conversationHistory.slice(-MAX_CONVERSATION_TURNS * 2);

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPrompt },
            ...recentHistory.map(turn => ({
                role: turn.role as 'user' | 'assistant',
                content: turn.content,
            })),
            { role: 'user', content: userMessage },
        ];

        const toolCalls: ToolCallResult[] = [];

        try {
            const stream = await this.client.chat.completions.create({
                model: this.config.model,
                messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                stream: true,
                ...(enableTools ? { tools: CRM_TOOLS, tool_choice: 'auto' } : {}),
            });

            // Track tool call assembly
            const pendingToolCalls: Map<number, { name: string; args: string }> = new Map();

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta;
                if (!delta) continue;

                // Content tokens
                if (delta.content) {
                    yield delta.content;
                }

                // Tool call deltas
                if (delta.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (!pendingToolCalls.has(tc.index)) {
                            pendingToolCalls.set(tc.index, { name: '', args: '' });
                        }
                        const pending = pendingToolCalls.get(tc.index)!;
                        if (tc.function?.name) pending.name = tc.function.name;
                        if (tc.function?.arguments) pending.args += tc.function.arguments;
                    }
                }
            }

            // Finalize tool calls
            for (const [, tc] of pendingToolCalls) {
                try {
                    toolCalls.push({
                        toolName: tc.name,
                        arguments: JSON.parse(tc.args),
                    });
                } catch {
                    // Skip malformed tool calls
                }
            }

            return toolCalls;
        } catch (err) {
            console.error('[LLM] Stream error:', err);
            // Yield safe fallback
            yield SAFE_RESPONSES[language] || SAFE_RESPONSES.tr;
            return [];
        }
    }

    /**
     * Simple non-streaming completion for quick tasks.
     */
    async complete(
        systemPrompt: string,
        userMessage: string,
    ): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
            });

            return response.choices[0]?.message?.content || '';
        } catch {
            return SAFE_RESPONSES.tr;
        }
    }
}
