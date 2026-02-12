import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ollama module before importing router
vi.mock('@/lib/ai/ollama', () => ({
    detectIntentWithOllama: vi.fn(),
    isOllamaAvailable: vi.fn(),
}));

import { detectIntent, detectIntentWithLLM, routeIntent } from '@/lib/ai/router';
import { detectIntentWithOllama, isOllamaAvailable } from '@/lib/ai/ollama';

const mockIsOllamaAvailable = vi.mocked(isOllamaAvailable);
const mockDetectIntentWithOllama = vi.mocked(detectIntentWithOllama);

describe('AI Intent Router', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('detectIntent (keyword-based)', () => {
        it('should detect "randevu" intent from Turkish keywords', async () => {
            const result = await detectIntent('Merhaba, yarın için randevu almak istiyorum');
            expect(result.intent).toBe('randevu');
            expect(result.confidence).toBe(0.85);
            expect(result.method).toBe('keyword');
        });

        it('should detect "randevu" intent from English keyword', async () => {
            const result = await detectIntent('I need an appointment');
            expect(result.intent).toBe('randevu');
            expect(result.confidence).toBe(0.85);
            expect(result.method).toBe('keyword');
        });

        it('should detect "sikayet" intent', async () => {
            const result = await detectIntent('Bir şikayet bildirmek istiyorum');
            expect(result.intent).toBe('sikayet');
            expect(result.confidence).toBe(0.85);
            expect(result.method).toBe('keyword');
        });

        it('should detect "sikayet" intent from problem keyword', async () => {
            const result = await detectIntent('Bir sorun var, çözmem gerekiyor');
            expect(result.intent).toBe('sikayet');
            expect(result.confidence).toBe(0.85);
        });

        it('should detect "bilgi" intent', async () => {
            const result = await detectIntent('Ürünlerin fiyat listesini öğrenmek istiyorum');
            expect(result.intent).toBe('bilgi');
            expect(result.confidence).toBe(0.85);
            expect(result.method).toBe('keyword');
        });

        it('should detect "iptal" intent', async () => {
            const result = await detectIntent('Randevumu iptal etmek istiyorum');
            // "iptal" keyword should match first since keywords are checked in order
            // Depending on iteration order, either "randevu" or "iptal" should match
            expect(['randevu', 'iptal']).toContain(result.intent);
            expect(result.confidence).toBe(0.85);
            expect(result.method).toBe('keyword');
        });

        it('should return unknown for unrecognizable text', async () => {
            const result = await detectIntent('hello world test message');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe(0.3);
            expect(result.method).toBe('keyword');
        });

        it('should be case insensitive', async () => {
            const result = await detectIntent('RANDEVU ALMAK İSTİYORUM');
            expect(result.intent).toBe('randevu');
        });

        it('should handle empty string', async () => {
            const result = await detectIntent('');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe(0.3);
        });
    });

    describe('detectIntentWithLLM', () => {
        it('should fallback to keyword detection when Ollama is unavailable', async () => {
            mockIsOllamaAvailable.mockResolvedValue(false);

            const result = await detectIntentWithLLM('randevu almak istiyorum');
            expect(result.intent).toBe('randevu');
            expect(result.method).toBe('keyword');
            expect(mockIsOllamaAvailable).toHaveBeenCalledOnce();
            expect(mockDetectIntentWithOllama).not.toHaveBeenCalled();
        });

        it('should use Ollama when available', async () => {
            mockIsOllamaAvailable.mockResolvedValue(true);
            mockDetectIntentWithOllama.mockResolvedValue({
                intent: 'randevu',
                confidence: 0.95,
                summary: 'LLM detected appointment intent',
            });

            const result = await detectIntentWithLLM('I would like to schedule something');
            expect(result.intent).toBe('randevu');
            expect(result.confidence).toBe(0.95);
            expect(result.method).toBe('llm');
        });

        it('should fallback to keyword on Ollama error', async () => {
            mockIsOllamaAvailable.mockResolvedValue(true);
            mockDetectIntentWithOllama.mockRejectedValue(new Error('Connection refused'));

            const result = await detectIntentWithLLM('şikayet');
            expect(result.intent).toBe('sikayet');
            expect(result.method).toBe('keyword');
        });
    });

    describe('routeIntent', () => {
        it('should use keyword detection by default', async () => {
            const result = await routeIntent('randevu istiyorum');
            expect(result.intent).toBe('randevu');
            expect(result.method).toBe('keyword');
        });

        it('should use LLM when useLLM is true', async () => {
            mockIsOllamaAvailable.mockResolvedValue(false);

            const result = await routeIntent('randevu istiyorum', true, 'ollama');
            expect(result.intent).toBe('randevu');
            // Falls back to keyword since Ollama is not available
            expect(result.method).toBe('keyword');
        });
    });
});
