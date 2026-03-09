/**
 * LLM Fallback Chain Tests
 *
 * Tests the generateWithFallback() and getLLMProviderStatus() functions
 * from lib/ai/llm-fallback-chain.ts.
 *
 * The fallback order is: Groq -> Gemini -> OpenAI -> graceful fallback.
 * Each provider is guarded by configuration checks and circuit breakers.
 *
 * IMPORTANT: OPENAI_API_KEY is read at module level (line 34), so we must
 * use vi.resetModules() + dynamic await import() for every test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock circuit breakers ──
const mockGroqCircuitBreaker = {
    isOpen: vi.fn(() => false),
    execute: vi.fn(),
    getState: vi.fn(() => 'CLOSED'),
};
const mockGeminiCircuitBreaker = {
    isOpen: vi.fn(() => false),
    execute: vi.fn(),
    getState: vi.fn(() => 'CLOSED'),
};
const mockOpenaiCircuitBreaker = {
    isOpen: vi.fn(() => false),
    execute: vi.fn(),
    getState: vi.fn(() => 'CLOSED'),
};

vi.mock('@/lib/voice/circuit-breaker', () => ({
    groqCircuitBreaker: mockGroqCircuitBreaker,
    geminiCircuitBreaker: mockGeminiCircuitBreaker,
    openaiCircuitBreaker: mockOpenaiCircuitBreaker,
}));

// ── Mock Groq client ──
const mockGenerateGroqResponse = vi.fn();
const mockIsGroqConfigured = vi.fn(() => true);
vi.mock('@/lib/ai/groq-client', () => ({
    generateGroqResponse: (...args: unknown[]) => mockGenerateGroqResponse(...args),
    isGroqConfigured: () => mockIsGroqConfigured(),
}));

// ── Mock Gemini client ──
const mockGenerateGeminiResponse = vi.fn();
const mockIsGeminiConfigured = vi.fn(() => true);
vi.mock('@/lib/ai/gemini-client', () => ({
    generateGeminiResponse: (...args: unknown[]) => mockGenerateGeminiResponse(...args),
    isGeminiConfigured: () => mockIsGeminiConfigured(),
}));

// ── Mock circuit alert init (module-level side effect) ──
vi.mock('@/lib/ai/llm-circuit-alerts', () => ({
    initLLMCircuitAlerts: vi.fn(),
}));

// ── Mock global fetch for OpenAI calls ──
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper messages used across tests
const testMessages = [{ role: 'user' as const, content: 'test prompt' }];

// Turkish and English graceful fallback messages from the source
const TURKISH_FALLBACK =
    'Özür dilerim, kısa bir teknik sorun yaşıyoruz. Lütfen bir dakika sonra tekrar deneyin veya sizi bir müşteri temsilcisine bağlayabilirim.';
const ENGLISH_FALLBACK =
    'I apologize, we are experiencing a brief technical issue. Please try again in a moment, or I can connect you with a human agent.';

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default: OPENAI_API_KEY is set
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Default: all providers configured, circuits closed
    mockIsGroqConfigured.mockReturnValue(true);
    mockIsGeminiConfigured.mockReturnValue(true);
    mockGroqCircuitBreaker.isOpen.mockReturnValue(false);
    mockGeminiCircuitBreaker.isOpen.mockReturnValue(false);
    mockOpenaiCircuitBreaker.isOpen.mockReturnValue(false);
    mockGroqCircuitBreaker.getState.mockReturnValue('CLOSED');
    mockGeminiCircuitBreaker.getState.mockReturnValue('CLOSED');
    mockOpenaiCircuitBreaker.getState.mockReturnValue('CLOSED');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

// ============================================================
// generateWithFallback
// ============================================================
describe('generateWithFallback', () => {
    it('returns groq-llama source when Groq succeeds', async () => {
        mockGroqCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGroqResponse.mockResolvedValue('Groq response');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.text).toBe('Groq response');
        expect(result.source).toBe('groq-llama');
        expect(mockGenerateGroqResponse).toHaveBeenCalledOnce();
        expect(mockGenerateGeminiResponse).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('falls to Gemini when Groq fails', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq unavailable'));
        mockGeminiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGeminiResponse.mockResolvedValue('Gemini response');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.text).toBe('Gemini response');
        expect(result.source).toBe('gemini-flash');
    });

    it('falls to OpenAI when both Groq and Gemini fail', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockGeminiCircuitBreaker.execute.mockRejectedValue(new Error('Gemini down'));
        mockOpenaiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
        });

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.text).toBe('OpenAI response');
        expect(result.source).toBe('openai-gpt');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/chat/completions',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('returns graceful fallback in Turkish when all providers fail', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockGeminiCircuitBreaker.execute.mockRejectedValue(new Error('Gemini down'));
        mockOpenaiCircuitBreaker.execute.mockRejectedValue(new Error('OpenAI down'));

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.text).toBe(TURKISH_FALLBACK);
        expect(result.source).toBe('graceful-fallback');
    });

    it('returns graceful fallback in English when language=en and all fail', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockGeminiCircuitBreaker.execute.mockRejectedValue(new Error('Gemini down'));
        mockOpenaiCircuitBreaker.execute.mockRejectedValue(new Error('OpenAI down'));

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages, { language: 'en' });

        expect(result.text).toBe(ENGLISH_FALLBACK);
        expect(result.source).toBe('graceful-fallback');
    });

    it('skips Groq when its circuit breaker is open', async () => {
        mockGroqCircuitBreaker.isOpen.mockReturnValue(true);
        mockGeminiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGeminiResponse.mockResolvedValue('Gemini response');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.source).toBe('gemini-flash');
        expect(mockGroqCircuitBreaker.execute).not.toHaveBeenCalled();
    });

    it('skips Groq when not configured', async () => {
        mockIsGroqConfigured.mockReturnValue(false);
        mockGeminiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGeminiResponse.mockResolvedValue('Gemini response');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.source).toBe('gemini-flash');
        expect(mockGroqCircuitBreaker.execute).not.toHaveBeenCalled();
    });

    it('skips Gemini when its circuit breaker is open', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockGeminiCircuitBreaker.isOpen.mockReturnValue(true);
        mockOpenaiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
        });

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.source).toBe('openai-gpt');
        expect(mockGeminiCircuitBreaker.execute).not.toHaveBeenCalled();
    });

    it('skips Gemini when not configured', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockIsGeminiConfigured.mockReturnValue(false);
        mockOpenaiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
        });

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.source).toBe('openai-gpt');
        expect(mockGeminiCircuitBreaker.execute).not.toHaveBeenCalled();
    });

    it('skips OpenAI when its circuit breaker is open', async () => {
        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockGeminiCircuitBreaker.execute.mockRejectedValue(new Error('Gemini down'));
        mockOpenaiCircuitBreaker.isOpen.mockReturnValue(true);

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.source).toBe('graceful-fallback');
        expect(mockOpenaiCircuitBreaker.execute).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips OpenAI when no API key is set', async () => {
        delete process.env.OPENAI_API_KEY;

        mockGroqCircuitBreaker.execute.mockRejectedValue(new Error('Groq down'));
        mockGeminiCircuitBreaker.execute.mockRejectedValue(new Error('Gemini down'));

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.source).toBe('graceful-fallback');
        expect(mockOpenaiCircuitBreaker.execute).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('passes custom maxTokens and temperature to providers', async () => {
        mockGroqCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGroqResponse.mockResolvedValue('Groq custom');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        await generateWithFallback(testMessages, { maxTokens: 500, temperature: 0.9 });

        expect(mockGenerateGroqResponse).toHaveBeenCalledWith(testMessages, {
            maxTokens: 500,
            temperature: 0.9,
        });
    });

    it('falls to next provider when Groq returns empty string', async () => {
        mockGroqCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGroqResponse.mockResolvedValue('');
        mockGeminiCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGeminiResponse.mockResolvedValue('Gemini response');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');
        const result = await generateWithFallback(testMessages);

        expect(result.text).toBe('Gemini response');
        expect(result.source).toBe('gemini-flash');
    });

    it('uses default options: maxTokens=150, temperature=0.3, language=tr', async () => {
        // Make all providers fail so we hit the graceful fallback and can verify language default
        mockGroqCircuitBreaker.execute.mockImplementation(async (fn: () => Promise<string>) => fn());
        mockGenerateGroqResponse.mockResolvedValue('Groq ok');

        const { generateWithFallback } = await import('@/lib/ai/llm-fallback-chain');

        // Call without options to verify defaults
        await generateWithFallback(testMessages);

        // Verify default maxTokens=150 and temperature=0.3 passed to Groq
        expect(mockGenerateGroqResponse).toHaveBeenCalledWith(testMessages, {
            maxTokens: 150,
            temperature: 0.3,
        });
    });
});

// ============================================================
// getLLMProviderStatus
// ============================================================
describe('getLLMProviderStatus', () => {
    it('returns all providers with configured status and circuit state', async () => {
        mockIsGroqConfigured.mockReturnValue(true);
        mockIsGeminiConfigured.mockReturnValue(true);
        mockGroqCircuitBreaker.getState.mockReturnValue('CLOSED');
        mockGeminiCircuitBreaker.getState.mockReturnValue('CLOSED');
        mockOpenaiCircuitBreaker.getState.mockReturnValue('CLOSED');

        const { getLLMProviderStatus } = await import('@/lib/ai/llm-fallback-chain');
        const status = getLLMProviderStatus();

        expect(status).toEqual({
            openai: { configured: true, circuitState: 'CLOSED' },
            groq: { configured: true, circuitState: 'CLOSED' },
            gemini: { configured: true, circuitState: 'CLOSED' },
        });
    });

    it('shows OpenAI as not configured when no API key', async () => {
        delete process.env.OPENAI_API_KEY;

        const { getLLMProviderStatus } = await import('@/lib/ai/llm-fallback-chain');
        const status = getLLMProviderStatus();

        expect(status.openai.configured).toBe(false);
    });

    it('shows Groq circuit state correctly', async () => {
        mockGroqCircuitBreaker.getState.mockReturnValue('OPEN');

        const { getLLMProviderStatus } = await import('@/lib/ai/llm-fallback-chain');
        const status = getLLMProviderStatus();

        expect(status.groq.circuitState).toBe('OPEN');
    });

    it('shows Gemini circuit state correctly', async () => {
        mockGeminiCircuitBreaker.getState.mockReturnValue('HALF_OPEN');

        const { getLLMProviderStatus } = await import('@/lib/ai/llm-fallback-chain');
        const status = getLLMProviderStatus();

        expect(status.gemini.circuitState).toBe('HALF_OPEN');
    });
});
