import { describe, it, expect } from 'vitest';
import { detectIntent, detectIntentWithLLM, routeIntent } from '@/lib/ai/router';
import type { IntentResult } from '@/lib/ai/intent-fast';

describe('AI Intent Router', () => {

    describe('detectIntent (keyword-based)', () => {
        it('should detect "appointment" intent from Turkish keywords', () => {
            // "için" triggers Turkish detection, "randevu almak" phrase matches appointment
            const result = detectIntent('Merhaba, yarın için randevu almak istiyorum');
            expect(result.intent).toBe('appointment');
            expect(result.confidence).toBe('high');
            expect(result.detectedKeywords.length).toBeGreaterThan(0);
        });

        it('should detect "appointment" intent from English phrase', () => {
            // "book an appointment" is an exact phrase match (score 3 -> high)
            const result = detectIntent('I want to book an appointment');
            expect(result.intent).toBe('appointment');
            expect(result.confidence).toBe('high');
        });

        it('should detect "complaint" intent from Turkish phrase', () => {
            // "şikayet" contains Turkish ş, "şikayet etmek" is a phrase match
            const result = detectIntent('Bir şikayet etmek istiyorum');
            expect(result.intent).toBe('complaint');
            expect(result.confidence).toBe('high');
        });

        it('should detect "complaint" intent from English phrase', () => {
            // "not working" is an exact phrase match in English complaint rules
            const result = detectIntent('My product is not working properly');
            expect(result.intent).toBe('complaint');
            expect(result.confidence).toBe('high');
        });

        it('should detect "pricing" intent from Turkish phrase', () => {
            // "ne kadar" is a pricing phrase; "için" triggers Turkish
            const result = detectIntent('Bu ürün ne kadar, fiyatı nedir');
            expect(result.intent).toBe('pricing');
            expect(result.confidence).toBe('high');
        });

        it('should detect "cancellation" intent from Turkish phrase', () => {
            // "iptal etmek istiyorum" is a cancellation phrase; "için" not needed since
            // we need Turkish detection -- use a phrase that includes Turkish chars
            const result = detectIntent('Aboneliği iptal etmek istiyorum, çünkü memnun değilim');
            // "aboneliği iptal" matches cancellation phrase, "memnun değilim" matches complaint
            // Either could win depending on scoring
            expect(['cancellation', 'complaint']).toContain(result.intent);
        });

        it('should return unknown for unrecognizable text', () => {
            const result = detectIntent('xyzzy foobar baz');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe('low');
        });

        it('should be case insensitive', () => {
            // Use an English phrase that clearly matches
            const result = detectIntent('I WANT TO BOOK AN APPOINTMENT');
            expect(result.intent).toBe('appointment');
        });

        it('should handle empty string', () => {
            const result = detectIntent('');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe('low');
        });
    });

    describe('detectIntentWithLLM', () => {
        it('should return fast detection result for high confidence', async () => {
            // "book an appointment" is a phrase match -> score 3 -> high
            const result = await detectIntentWithLLM('I want to book an appointment');
            expect(result.intent).toBe('appointment');
            expect(result.confidence).toBe('high');
        });

        it('should return fast detection result even for root-match text', async () => {
            // "schedule" matches root "schedul" (score 2 -> medium)
            const result = await detectIntentWithLLM('I want to schedule a meeting');
            expect(result.intent).toBe('appointment');
            expect(['high', 'medium']).toContain(result.confidence);
        });

        it('should return unknown for unrecognizable text', async () => {
            const result = await detectIntentWithLLM('xyzzy foobar baz');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe('low');
        });
    });

    describe('routeIntent', () => {
        it('should route appointment intent to rag handler', () => {
            const intentResult: IntentResult = {
                intent: 'appointment',
                confidence: 'high',
                detectedKeywords: ['randevu'],
                language: 'tr',
            };
            const result = routeIntent(intentResult);
            expect(result.intent).toBe('appointment');
            expect(result.handler).toBe('rag');
        });

        it('should route greeting intent to shortcut handler', () => {
            const intentResult: IntentResult = {
                intent: 'greeting',
                confidence: 'high',
                detectedKeywords: ['merhaba'],
                language: 'tr',
            };
            const result = routeIntent(intentResult);
            expect(result.intent).toBe('greeting');
            expect(result.handler).toBe('shortcut');
        });

        it('should route escalation intent to escalation handler', () => {
            const intentResult: IntentResult = {
                intent: 'escalation',
                confidence: 'high',
                detectedKeywords: ['yönetici'],
                language: 'tr',
            };
            const result = routeIntent(intentResult);
            expect(result.intent).toBe('escalation');
            expect(result.handler).toBe('escalation');
        });

        it('should route unknown intent to llm handler', () => {
            const intentResult: IntentResult = {
                intent: 'unknown',
                confidence: 'low',
                detectedKeywords: [],
                language: 'tr',
            };
            const result = routeIntent(intentResult);
            expect(result.intent).toBe('unknown');
            expect(result.handler).toBe('llm');
        });
    });
});
