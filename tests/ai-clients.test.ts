/**
 * AI Client Tests — Groq & Gemini API Clients
 *
 * Tests for lib/ai/groq-client.ts and lib/ai/gemini-client.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Global fetch mock ──
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Groq Client', () => {
    const ORIGINAL_GROQ_KEY = process.env.GROQ_API_KEY;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    afterEach(() => {
        // Restore original env
        if (ORIGINAL_GROQ_KEY !== undefined) {
            process.env.GROQ_API_KEY = ORIGINAL_GROQ_KEY;
        } else {
            delete process.env.GROQ_API_KEY;
        }
    });

    it('1. returns response text from Groq API', async () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'Hello from Groq' } }],
            }),
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');
        const result = await generateGroqResponse([
            { role: 'user', content: 'Hello' },
        ]);

        expect(result).toBe('Hello from Groq');
    });

    it('2. sends correct Authorization header with Bearer token', async () => {
        process.env.GROQ_API_KEY = 'my-secret-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'ok' } }],
            }),
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');
        await generateGroqResponse([{ role: 'user', content: 'test' }]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockFetch.mock.calls[0];
        const requestInit = callArgs[1];
        expect(requestInit.headers['Authorization']).toBe('Bearer my-secret-key');
        expect(requestInit.headers['Content-Type']).toBe('application/json');
    });

    it('3. sends correct model (llama-3.3-70b-versatile)', async () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'ok' } }],
            }),
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');
        await generateGroqResponse([{ role: 'user', content: 'test' }]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model).toBe('llama-3.3-70b-versatile');
    });

    it('4. respects maxTokens and temperature options', async () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'ok' } }],
            }),
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');
        await generateGroqResponse(
            [{ role: 'user', content: 'test' }],
            { maxTokens: 500, temperature: 0.7 },
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(500);
        expect(body.temperature).toBe(0.7);
    });

    it('5. throws on non-ok response', async () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded',
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');

        await expect(
            generateGroqResponse([{ role: 'user', content: 'test' }]),
        ).rejects.toThrow('Groq API error 429: Rate limit exceeded');
    });

    it('6. throws when GROQ_API_KEY is not set', async () => {
        delete process.env.GROQ_API_KEY;
        vi.resetModules();

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');

        await expect(
            generateGroqResponse([{ role: 'user', content: 'test' }]),
        ).rejects.toThrow('GROQ_API_KEY not configured');
    });

    it('7. isGroqConfigured returns true when env var is set', async () => {
        process.env.GROQ_API_KEY = 'some-key';
        vi.resetModules();

        const { isGroqConfigured } = await import('@/lib/ai/groq-client');
        expect(isGroqConfigured()).toBe(true);
    });

    it('7b. isGroqConfigured returns false when env var is not set', async () => {
        delete process.env.GROQ_API_KEY;
        vi.resetModules();

        const { isGroqConfigured } = await import('@/lib/ai/groq-client');
        expect(isGroqConfigured()).toBe(false);
    });

    it('8. uses default maxTokens=150 and temperature=0.3', async () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'ok' } }],
            }),
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');
        await generateGroqResponse([{ role: 'user', content: 'test' }]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.max_tokens).toBe(150);
        expect(body.temperature).toBe(0.3);
    });

    it('9. calls the correct Groq API URL', async () => {
        process.env.GROQ_API_KEY = 'test-groq-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: 'ok' } }],
            }),
        });

        const { generateGroqResponse } = await import('@/lib/ai/groq-client');
        await generateGroqResponse([{ role: 'user', content: 'test' }]);

        expect(mockFetch.mock.calls[0][0]).toBe(
            'https://api.groq.com/openai/v1/chat/completions',
        );
    });
});

describe('Gemini Client', () => {
    const ORIGINAL_GOOGLE_KEY = process.env.GOOGLE_AI_API_KEY;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    afterEach(() => {
        if (ORIGINAL_GOOGLE_KEY !== undefined) {
            process.env.GOOGLE_AI_API_KEY = ORIGINAL_GOOGLE_KEY;
        } else {
            delete process.env.GOOGLE_AI_API_KEY;
        }
    });

    it('10. returns response text from Gemini API', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'Hello from Gemini' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        const result = await generateGeminiResponse([
            { role: 'user', content: 'Hello' },
        ]);

        expect(result).toBe('Hello from Gemini');
    });

    it('11. converts system messages to systemInstruction', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse([
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' },
        ]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.systemInstruction).toEqual({
            parts: [{ text: 'You are a helpful assistant' }],
        });
        // System message should NOT appear in contents
        const roles = body.contents.map((c: { role: string }) => c.role);
        expect(roles).not.toContain('system');
    });

    it('12. converts assistant role to model', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse([
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
            { role: 'user', content: 'How are you?' },
        ]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.contents[1].role).toBe('model');
    });

    it('13. adds dummy user message if none present', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse([
            { role: 'system', content: 'You are a bot' },
        ]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        // System is extracted; contents should have a dummy user message
        expect(body.contents).toHaveLength(1);
        expect(body.contents[0].role).toBe('user');
        expect(body.contents[0].parts[0].text).toBe('.');
    });

    it('14. sends API key as query parameter', async () => {
        process.env.GOOGLE_AI_API_KEY = 'my-google-key-123';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse([{ role: 'user', content: 'test' }]);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('key=my-google-key-123');
    });

    it('15. throws on non-ok response', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: async () => 'Forbidden',
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');

        await expect(
            generateGeminiResponse([{ role: 'user', content: 'test' }]),
        ).rejects.toThrow('Gemini API error 403: Forbidden');
    });

    it('16. throws when GOOGLE_AI_API_KEY is not set', async () => {
        delete process.env.GOOGLE_AI_API_KEY;
        vi.resetModules();

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');

        await expect(
            generateGeminiResponse([{ role: 'user', content: 'test' }]),
        ).rejects.toThrow('GOOGLE_AI_API_KEY not configured');
    });

    it('17. isGeminiConfigured returns true when env var is set', async () => {
        process.env.GOOGLE_AI_API_KEY = 'some-key';
        vi.resetModules();

        const { isGeminiConfigured } = await import('@/lib/ai/gemini-client');
        expect(isGeminiConfigured()).toBe(true);
    });

    it('17b. isGeminiConfigured returns false when env var is not set', async () => {
        delete process.env.GOOGLE_AI_API_KEY;
        vi.resetModules();

        const { isGeminiConfigured } = await import('@/lib/ai/gemini-client');
        expect(isGeminiConfigured()).toBe(false);
    });

    it('18. respects maxTokens as maxOutputTokens in generationConfig', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse(
            [{ role: 'user', content: 'test' }],
            { maxTokens: 300, temperature: 0.9 },
        );

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.generationConfig.maxOutputTokens).toBe(300);
        expect(body.generationConfig.temperature).toBe(0.9);
    });

    it('19. does not include systemInstruction when no system messages', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-gemini-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse([
            { role: 'user', content: 'Hello' },
        ]);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.systemInstruction).toBeUndefined();
    });

    it('20. calls the correct Gemini API URL with model name', async () => {
        process.env.GOOGLE_AI_API_KEY = 'test-key';
        vi.resetModules();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                candidates: [
                    { content: { parts: [{ text: 'ok' }] } },
                ],
            }),
        });

        const { generateGeminiResponse } = await import('@/lib/ai/gemini-client');
        await generateGeminiResponse([{ role: 'user', content: 'test' }]);

        const url = mockFetch.mock.calls[0][0] as string;
        expect(url).toContain('generativelanguage.googleapis.com');
        expect(url).toContain('gemini-2.0-flash');
        expect(url).toContain('generateContent');
    });
});
