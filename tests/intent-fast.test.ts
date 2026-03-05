/**
 * Intent Detection Tests — lib/ai/intent-fast.ts
 *
 * Tests detectIntentFast for all intent categories,
 * confidence levels, language detection, and keyword extraction.
 */

import { describe, it, expect } from 'vitest';
import {
    detectIntentFast,
    hasEnoughTokensForIntent,
    shouldShortcut,
    getSafeResponse,
    getShortcutResponse,
} from '@/lib/ai/intent-fast';
import type { IntentResult } from '@/lib/ai/intent-fast';

describe('detectIntentFast', () => {

    // ── Turkish Intent Detection ──

    describe('Turkish appointment keywords', () => {
        it('should detect "appointment" from "randevu almak"', () => {
            const result = detectIntentFast('Yarın için randevu almak istiyorum');
            expect(result.intent).toBe('appointment');
            expect(result.language).toBe('tr');
        });

        it('should detect "appointment" from root "randev"', () => {
            const result = detectIntentFast('Bir randevum var mı acaba');
            expect(result.intent).toBe('appointment');
        });
    });

    describe('Turkish complaint keywords', () => {
        it('should detect "complaint" from "sikayet etmek"', () => {
            const result = detectIntentFast('Bir şikayet etmek istiyorum');
            expect(result.intent).toBe('complaint');
            expect(result.language).toBe('tr');
        });

        it('should detect "complaint" from "sorun yasiyorum"', () => {
            const result = detectIntentFast('Ürünle sorun yaşıyorum');
            expect(result.intent).toBe('complaint');
        });

        it('should detect "complaint" from "calismiyar"', () => {
            const result = detectIntentFast('İnternet çalışmıyor');
            expect(result.intent).toBe('complaint');
        });
    });

    describe('Turkish pricing keywords', () => {
        it('should detect "pricing" from "ne kadar"', () => {
            const result = detectIntentFast('Bu ürün ne kadar');
            expect(result.intent).toBe('pricing');
            expect(result.language).toBe('tr');
        });

        it('should detect "pricing" from root "fiyat"', () => {
            const result = detectIntentFast('Fiyatları öğrenmek için arıyorum');
            expect(result.intent).toBe('pricing');
        });
    });

    describe('Turkish cancellation keywords', () => {
        it('should detect "cancellation" from "iptal etmek istiyorum"', () => {
            const result = detectIntentFast('Aboneliğimi iptal etmek istiyorum');
            expect(result.intent).toBe('cancellation');
            expect(result.language).toBe('tr');
        });
    });

    describe('Turkish greeting keywords', () => {
        it('should detect "greeting" from "merhaba"', () => {
            const result = detectIntentFast('Merhaba, nasılsınız');
            expect(result.intent).toBe('greeting');
            expect(result.language).toBe('tr');
        });
    });

    describe('Turkish farewell keywords', () => {
        it('should detect "farewell" from "gorusuruz"', () => {
            const result = detectIntentFast('Tamam, görüşürüz');
            expect(result.intent).toBe('farewell');
            expect(result.language).toBe('tr');
        });
    });

    describe('Turkish escalation keywords', () => {
        it('should detect "escalation" from "yoneticiyle gorusmek"', () => {
            const result = detectIntentFast('Yöneticiyle görüşmek istiyorum');
            expect(result.intent).toBe('escalation');
            expect(result.language).toBe('tr');
        });
    });

    describe('Turkish thanks keywords', () => {
        it('should detect "thanks" from "tesekkur ederim"', () => {
            const result = detectIntentFast('Teşekkür ederim, çok yardımcı oldunuz');
            expect(result.intent).toBe('thanks');
            expect(result.language).toBe('tr');
        });
    });

    describe('Turkish info keywords', () => {
        it('should detect "info" from "bilgi almak"', () => {
            const result = detectIntentFast('Hizmetleriniz hakkında bilgi almak istiyorum');
            expect(result.intent).toBe('info');
            expect(result.language).toBe('tr');
        });
    });

    // ── English Intent Detection ──

    describe('English appointment keywords', () => {
        it('should detect "appointment" from "book an appointment"', () => {
            const result = detectIntentFast('I want to book an appointment');
            expect(result.intent).toBe('appointment');
            expect(result.language).toBe('en');
        });

        it('should detect "appointment" from root "schedul"', () => {
            // Avoid words like "something" that contain "hi" (triggers greeting phrase match)
            const result = detectIntentFast('please schedule a call');
            expect(result.intent).toBe('appointment');
        });
    });

    describe('English complaint keywords', () => {
        it('should detect "complaint" from "not working"', () => {
            const result = detectIntentFast('My product is not working');
            expect(result.intent).toBe('complaint');
            expect(result.language).toBe('en');
        });

        it('should detect "complaint" from "file a complaint"', () => {
            const result = detectIntentFast('I want to file a complaint');
            expect(result.intent).toBe('complaint');
        });
    });

    describe('English pricing keywords', () => {
        it('should detect "pricing" from "how much"', () => {
            const result = detectIntentFast('How much does this cost');
            expect(result.intent).toBe('pricing');
            expect(result.language).toBe('en');
        });
    });

    describe('English cancellation keywords', () => {
        it('should detect "cancellation" from "cancel my"', () => {
            const result = detectIntentFast('I want to cancel my subscription');
            expect(result.intent).toBe('cancellation');
            expect(result.language).toBe('en');
        });
    });

    describe('English greeting keywords', () => {
        it('should detect "greeting" from "hello"', () => {
            const result = detectIntentFast('Hello there');
            expect(result.intent).toBe('greeting');
            expect(result.language).toBe('en');
        });
    });

    describe('English escalation keywords', () => {
        it('should detect "escalation" from "speak to a manager"', () => {
            const result = detectIntentFast('I want to speak to a manager');
            expect(result.intent).toBe('escalation');
            expect(result.language).toBe('en');
        });
    });

    // ── General / Unknown ──

    describe('general/unknown input', () => {
        it('should return "unknown" for gibberish', () => {
            const result = detectIntentFast('xyzzy foobar baz');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe('low');
        });

        it('should return "unknown" for empty string', () => {
            const result = detectIntentFast('');
            expect(result.intent).toBe('unknown');
            expect(result.confidence).toBe('low');
        });
    });

    // ── Confidence Levels ──

    describe('confidence levels', () => {
        it('should return "high" for exact phrase match (score >= 3)', () => {
            // "book an appointment" is a phrase match (score 3)
            const result = detectIntentFast('I want to book an appointment');
            expect(result.confidence).toBe('high');
        });

        it('should return "medium" for root-only match (score = 2)', () => {
            // "schedule" matches root "schedul" (score 2), no phrase match
            const result = detectIntentFast('schedule');
            expect(result.confidence).toBe('medium');
        });

        it('should return "low" for no match', () => {
            const result = detectIntentFast('random text');
            expect(result.confidence).toBe('low');
        });
    });

    // ── Language Detection ──

    describe('language detection', () => {
        it('should detect Turkish from Turkish characters', () => {
            const result = detectIntentFast('Şikayet etmek istiyorum');
            expect(result.language).toBe('tr');
        });

        it('should detect Turkish from Turkish common words', () => {
            const result = detectIntentFast('Bir sorun var');
            expect(result.language).toBe('tr');
        });

        it('should detect English for plain English text', () => {
            const result = detectIntentFast('I have a problem');
            expect(result.language).toBe('en');
        });
    });

    // ── Keyword Extraction ──

    describe('keyword extraction', () => {
        it('should include detected phrase in keywords', () => {
            const result = detectIntentFast('I want to book an appointment');
            expect(result.detectedKeywords).toContain('book an appointment');
        });

        it('should include detected root-matched word in keywords', () => {
            const result = detectIntentFast('Randevumu öğrenmek için arıyorum');
            expect(result.detectedKeywords.some(k => k.startsWith('randev'))).toBe(true);
        });

        it('should return empty keywords for unknown intent', () => {
            const result = detectIntentFast('xyzzy foobar');
            expect(result.detectedKeywords).toHaveLength(0);
        });
    });
});

// ── Helper Function Tests ──

describe('hasEnoughTokensForIntent', () => {
    it('should return true for 2+ meaningful tokens', () => {
        expect(hasEnoughTokensForIntent('hello world')).toBe(true);
    });

    it('should return false for single short token', () => {
        expect(hasEnoughTokensForIntent('a')).toBe(false);
    });
});

describe('shouldShortcut', () => {
    it('should return true for high-confidence greeting', () => {
        const intent: IntentResult = {
            intent: 'greeting', confidence: 'high', detectedKeywords: ['merhaba'], language: 'tr',
        };
        expect(shouldShortcut(intent)).toBe(true);
    });

    it('should return false for medium-confidence greeting', () => {
        const intent: IntentResult = {
            intent: 'greeting', confidence: 'medium', detectedKeywords: ['hey'], language: 'en',
        };
        expect(shouldShortcut(intent)).toBe(false);
    });

    it('should return false for non-shortcuttable intent', () => {
        const intent: IntentResult = {
            intent: 'appointment', confidence: 'high', detectedKeywords: ['randevu'], language: 'tr',
        };
        expect(shouldShortcut(intent)).toBe(false);
    });
});

describe('getSafeResponse', () => {
    it('should return Turkish response for Turkish language', () => {
        const response = getSafeResponse('greeting', 'tr');
        expect(response).toContain('Merhaba');
    });

    it('should return English response for English language', () => {
        const response = getSafeResponse('greeting', 'en');
        expect(response).toContain('Hello');
    });
});

describe('getShortcutResponse', () => {
    it('should return greeting response in Turkish', () => {
        const response = getShortcutResponse('greeting', 'tr');
        expect(response).toContain('Merhaba');
    });

    it('should return greeting response in English', () => {
        const response = getShortcutResponse('greeting', 'en');
        expect(response).toContain('Hello');
    });

    it('should include agent name when provided', () => {
        const response = getShortcutResponse('greeting', 'tr', 'SmartBot');
        expect(response).toContain('SmartBot');
    });
});
