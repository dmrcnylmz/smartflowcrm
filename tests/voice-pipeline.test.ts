/**
 * Voice Pipeline Test Suite
 *
 * Tests for:
 * - intent-fast.ts: all TR/EN intents, partial detection, edge cases
 * - guardrails.ts: hallucination blocking, identity leak, competitors, price
 * - prompt-builder.ts: correct prompt assembly per tenant
 * - embeddings.ts: cosine similarity math
 */

import { describe, it, expect } from 'vitest';
import {
    detectIntentFast,
    hasEnoughTokensForIntent,
    getSafeResponse,
} from '@/lib/ai/intent-fast';
import {
    validateResponse,
} from '@/lib/ai/guardrails';
import { buildSystemPrompt } from '@/lib/ai/prompt-builder';
import { cosineSimilarity, chunkText } from '@/lib/ai/embeddings';
import { DEFAULT_TENANT } from '@/lib/tenant/types';

// ─── Intent Detection Tests ───────────────────────────────

describe('Intent Detection (Fast)', () => {
    describe('Turkish intents', () => {
        it('detects appointment intent', () => {
            const result = detectIntentFast('randevu almak istiyorum lütfen');
            expect(result.intent).toBe('appointment');
            expect(result.confidence).toBe('high');
            expect(result.language).toBe('tr');
        });

        it('detects appointment from partial word "randev"', () => {
            const result = detectIntentFast('yarın randev almak');
            expect(result.intent).toBe('appointment');
        });

        it('detects complaint intent', () => {
            const result = detectIntentFast('bir şikayetim var');
            expect(result.intent).toBe('complaint');
            expect(result.confidence).toBe('high');
        });

        it('detects complaint from "sorun yaşıyorum"', () => {
            const result = detectIntentFast('internet sorun yaşıyorum');
            expect(result.intent).toBe('complaint');
        });

        it('detects pricing intent', () => {
            const result = detectIntentFast('fiyatı nedir bu hizmetin');
            expect(result.intent).toBe('pricing');
        });

        it('detects pricing from "ne kadar"', () => {
            const result = detectIntentFast('bu hizmet ne kadar');
            expect(result.intent).toBe('pricing');
        });

        it('detects cancellation intent', () => {
            const result = detectIntentFast('aboneliğimi iptal etmek istiyorum');
            expect(result.intent).toBe('cancellation');
        });

        it('detects greeting', () => {
            const result = detectIntentFast('merhaba iyi günler');
            expect(result.intent).toBe('greeting');
        });

        it('detects farewell', () => {
            const result = detectIntentFast('teşekkürler görüşürüz');
            expect(result.intent).toBe('farewell');
        });

        it('detects escalation', () => {
            const result = detectIntentFast('yöneticiyle görüşmek istiyorum');
            expect(result.intent).toBe('escalation');
        });

        it('detects thanks', () => {
            const result = detectIntentFast('teşekkür ederim çok sağolun');
            expect(result.intent).toBe('thanks');
        });

        it('returns unknown for gibberish', () => {
            const result = detectIntentFast('asdfghjkl');
            expect(result.intent).toBe('unknown');
        });
    });

    describe('English intents', () => {
        it('detects appointment intent', () => {
            const result = detectIntentFast('I want to book an appointment');
            expect(result.intent).toBe('appointment');
            expect(result.language).toBe('en');
        });

        it('detects complaint from "not working"', () => {
            const result = detectIntentFast('my service is not working');
            expect(result.intent).toBe('complaint');
        });

        it('detects pricing', () => {
            const result = detectIntentFast('how much does it cost');
            expect(result.intent).toBe('pricing');
        });

        it('detects escalation', () => {
            const result = detectIntentFast('I want to speak to a manager');
            expect(result.intent).toBe('escalation');
        });
    });

    describe('Token threshold', () => {
        it('returns false for single short word', () => {
            expect(hasEnoughTokensForIntent('m')).toBe(false);
        });

        it('returns true for 2+ meaningful tokens', () => {
            expect(hasEnoughTokensForIntent('randevu almak')).toBe(true);
        });

        it('returns false for empty string', () => {
            expect(hasEnoughTokensForIntent('')).toBe(false);
        });
    });

    describe('Safe responses', () => {
        it('returns Turkish safe response for appointment', () => {
            const response = getSafeResponse('appointment', 'tr');
            expect(response).toContain('Randevu');
        });

        it('returns English safe response for complaint', () => {
            const response = getSafeResponse('complaint', 'en');
            expect(response).toContain('complaint');
        });
    });
});

// ─── Guardrails Tests ─────────────────────────────────────

describe('Guardrails', () => {
    const goodContext = [
        { text: 'Kasko sigortası yıllık 5000 TL\'den başlayan fiyatlarla sunulmaktadır.', score: 0.85, source: 'pricing.md' },
    ];

    describe('RAG confidence gate', () => {
        it('blocks when no RAG context', () => {
            const result = validateResponse('Fiyatımız 1000 TL', [], { language: 'tr' });
            expect(result.approved).toBe(false);
            expect(result.violations.some(v => v.toLowerCase().includes('rag') || v.toLowerCase().includes('threshold') || v.toLowerCase().includes('confidence'))).toBe(true);
        });

        it('blocks when RAG score below 0.75', () => {
            const lowContext = [{ text: 'irrelevant', score: 0.5, source: 'doc' }];
            const result = validateResponse('Evet tabii', lowContext, { language: 'tr' });
            expect(result.approved).toBe(false);
        });

        it('allows when RAG score above 0.75', () => {
            const result = validateResponse(
                'Kasko sigortası 5000 TL\'den başlayan fiyatlarla sunulmaktadır.',
                goodContext,
                { language: 'tr', allowPriceQuotes: true },
            );
            expect(result.approved).toBe(true);
        });
    });

    describe('AI identity leak', () => {
        it('detects Turkish AI identity leak', () => {
            const result = validateResponse(
                'Ben bir yapay zeka asistanım, size yardımcı olabilirim.',
                goodContext,
                { language: 'tr' },
            );
            expect(result.violations.some(v => v.includes('identity'))).toBe(true);
        });

        it('detects English AI identity leak', () => {
            const result = validateResponse(
                'As an AI, I can help you with insurance.',
                goodContext,
                { language: 'en' },
            );
            expect(result.violations.some(v => v.includes('identity'))).toBe(true);
        });
    });

    describe('Competitor blocking', () => {
        it('blocks competitor mentions', () => {
            const result = validateResponse(
                'Belki RakipFirma\'yı deneyebilirsiniz.',
                goodContext,
                { language: 'tr', competitorNames: ['RakipFirma'] },
            );
            expect(result.violations.some(v => v.includes('Competitor'))).toBe(true);
        });
    });

    describe('Price check', () => {
        it('blocks unauthorized price quotes', () => {
            const noPrice = [{ text: 'Genel bilgi dökümanı.', score: 0.85, source: 'general.md' }];
            const result = validateResponse(
                'Bu hizmetimiz 2500 TL\'dir.',
                noPrice,
                { language: 'tr', allowPriceQuotes: false },
            );
            expect(result.approved).toBe(false);
        });

        it('allows price from RAG context', () => {
            const result = validateResponse(
                'Kasko sigortası 5000 TL\'den başlamaktadır.',
                goodContext,
                { language: 'tr', allowPriceQuotes: true },
            );
            // Should pass because price quoting is allowed
            expect(result.approved).toBe(true);
        });
    });
});

// ─── Prompt Builder Tests ─────────────────────────────────

describe('Prompt Builder', () => {
    it('builds Turkish prompt with all layers', () => {
        const prompt = buildSystemPrompt({
            tenant: DEFAULT_TENANT,
            ragResults: [
                { docId: 'test', text: 'Test bilgi.', score: 0.9, metadata: { source: 'test', createdAt: '' } },
            ],
            currentIntent: 'appointment',
            language: 'tr',
        });

        // Layer 1: Identity
        expect(prompt).toContain(DEFAULT_TENANT.agent.name);
        expect(prompt).toContain(DEFAULT_TENANT.companyName);

        // Layer 2: Company facts
        expect(prompt).toContain(DEFAULT_TENANT.business.workingHours);

        // Layer 3: RAG
        expect(prompt).toContain('Test bilgi.');
        expect(prompt).toContain('BİLGİ TABANI');

        // Layer 4: Guardrails
        expect(prompt).toContain('ASLA');
        expect(prompt).toContain('uydurma');
    });

    it('builds English prompt correctly', () => {
        const prompt = buildSystemPrompt({
            tenant: { ...DEFAULT_TENANT, language: 'en' },
            ragResults: [],
            language: 'en',
        });

        expect(prompt).toContain('ABSOLUTE RULES');
        expect(prompt).toContain('NEVER VIOLATE');
        expect(prompt).toContain(DEFAULT_TENANT.agent.name);
    });

    it('omits RAG section when no results', () => {
        const prompt = buildSystemPrompt({
            tenant: DEFAULT_TENANT,
            ragResults: [],
            language: 'tr',
        });

        expect(prompt).not.toContain('BİLGİ TABANI');
    });
});

// ─── Embeddings Math Tests ────────────────────────────────

describe('Cosine Similarity', () => {
    it('returns 1 for identical vectors', () => {
        const v = [1, 2, 3, 4, 5];
        expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
        expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
    });

    it('handles high-dimensional vectors', () => {
        const a = Array.from({ length: 1536 }, () => Math.random());
        const b = [...a];
        expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('throws on dimension mismatch', () => {
        expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('mismatch');
    });

    it('returns 0 for zero vectors', () => {
        expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    });
});

describe('Text Chunking', () => {
    it('chunks long text at sentence boundaries', () => {
        const text = 'First sentence. Second sentence. Third sentence which is much longer and has many words in it to test the chunking behavior.';
        const chunks = chunkText(text, 50);
        expect(chunks.length).toBeGreaterThan(1);
        // Each chunk should end near a sentence boundary
        for (const chunk of chunks) {
            expect(chunk.length).toBeLessThanOrEqual(150); // Allow some overflow
        }
    });

    it('returns single chunk for short text', () => {
        const chunks = chunkText('Short text.');
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe('Short text.');
    });

    it('handles empty text', () => {
        const chunks = chunkText('');
        expect(chunks).toHaveLength(0);
    });
});
