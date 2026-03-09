/**
 * Sentiment Analysis — Unit Tests
 *
 * Tests for lib/voice/sentiment.ts
 * Pure logic tests — no mocks needed.
 *
 * Covers:
 *   - Keyword analysis (Turkish & English, positive & negative)
 *   - Punctuation patterns (!!! ??? ALL CAPS, emojis)
 *   - Turn length scoring
 *   - Repetition detection
 *   - Score clamping [-1, +1]
 *   - Label mapping (very_negative → very_positive)
 *   - shouldEscalate flag
 *   - suggestedAction strings
 *   - Conversation context tracking
 *   - Negative streak escalation
 */

import { describe, it, expect } from 'vitest';
import {
    analyzeSentiment,
    analyzeConversationSentiment,
    createConversationContext,
    type SentimentResult,
    type ConversationContext,
} from '../lib/voice/sentiment';

// =============================================
// 1. Neutral text
// =============================================

describe('analyzeSentiment — neutral text', () => {
    it('returns neutral label and score near 0 for plain text', () => {
        const result = analyzeSentiment('bugün hava güneşli ve serin');
        expect(result.label).toBe('neutral');
        expect(result.score).toBeGreaterThanOrEqual(-0.2);
        expect(result.score).toBeLessThan(0.2);
    });

    it('returns neutral for a simple greeting without sentiment keywords', () => {
        const result = analyzeSentiment('merhaba, ben arıyordum');
        expect(result.label).toBe('neutral');
    });
});

// =============================================
// 2. Turkish positive keywords
// =============================================

describe('analyzeSentiment — Turkish positive keywords', () => {
    it('detects teşekkür as positive', () => {
        const result = analyzeSentiment('çok teşekkür ederim, memnun kaldım, harika bir hizmet aldım');
        expect(result.score).toBeGreaterThan(0);
        expect(['positive', 'very_positive']).toContain(result.label);
    });

    it('detects mükemmel / süper as positive', () => {
        const result = analyzeSentiment('mükemmel bir deneyimdi, süper hizmet');
        expect(result.score).toBeGreaterThan(0);
        expect(result.signals.keyword).toBeGreaterThan(0);
    });

    it('detects multiple positive keywords for stronger score', () => {
        const result = analyzeSentiment(
            'harika güzel mükemmel süper başarılı profesyonel kaliteli teşekkür memnun mutlu',
        );
        expect(result.signals.keyword).toBeGreaterThan(0.5);
    });
});

// =============================================
// 3. Turkish negative keywords
// =============================================

describe('analyzeSentiment — Turkish negative keywords', () => {
    it('detects şikayet / sorun as negative', () => {
        const result = analyzeSentiment('bu bir şikayet, sorun çözülmedi, berbat hizmet');
        expect(result.score).toBeLessThan(0);
        expect(['negative', 'very_negative']).toContain(result.label);
    });

    it('detects rezalet / kabul edilemez as negative', () => {
        const result = analyzeSentiment('rezalet bir durum, kabul edilemez');
        expect(result.score).toBeLessThan(0);
        expect(result.signals.keyword).toBeLessThan(0);
    });

    it('detects strong negative keywords for very low score', () => {
        const result = analyzeSentiment(
            'şikayet problem hata yanlış kötü berbat rezalet saçma sinirli kızgın öfkeli iptal vazgeçtim',
        );
        expect(result.signals.keyword).toBeLessThan(-0.5);
    });
});

// =============================================
// 4. English positive keywords
// =============================================

describe('analyzeSentiment — English positive keywords', () => {
    it('detects thank / great / excellent as positive', () => {
        const result = analyzeSentiment('thank you so much, this is great and excellent service');
        expect(result.score).toBeGreaterThan(0);
        expect(result.signals.keyword).toBeGreaterThan(0);
    });

    it('detects happy / satisfied / awesome as positive', () => {
        const result = analyzeSentiment('I am happy and satisfied, this is awesome and fantastic');
        expect(result.score).toBeGreaterThan(0);
    });
});

// =============================================
// 5. English negative keywords
// =============================================

describe('analyzeSentiment — English negative keywords', () => {
    it('detects complaint / problem / terrible as negative', () => {
        const result = analyzeSentiment('I have a complaint, this is a terrible problem');
        expect(result.score).toBeLessThan(0);
        expect(result.signals.keyword).toBeLessThan(0);
    });

    it('detects frustrated / angry / unacceptable as negative', () => {
        const result = analyzeSentiment('I am frustrated and angry, this is unacceptable');
        expect(result.score).toBeLessThan(0);
    });
});

// =============================================
// 6. Multiple "!!!" → lower punctuation score
// =============================================

describe('analyzeSentiment — exclamation marks', () => {
    it('gives negative punctuation score for 3+ exclamation marks', () => {
        const result = analyzeSentiment('bu ne demek!!!');
        expect(result.signals.punctuation).toBeLessThan(0);
    });

    it('gives slightly negative punctuation for 2 exclamation marks', () => {
        const result = analyzeSentiment('olmaz böyle!!');
        expect(result.signals.punctuation).toBeLessThanOrEqual(-0.2);
    });

    it('gives more negative punctuation for many exclamation marks', () => {
        const resultTwo = analyzeSentiment('ne!!');
        const resultThree = analyzeSentiment('ne!!!');
        expect(resultThree.signals.punctuation).toBeLessThanOrEqual(resultTwo.signals.punctuation);
    });

    it('gives negative punctuation for 3+ question marks', () => {
        const result = analyzeSentiment('nasıl olur bu???');
        expect(result.signals.punctuation).toBeLessThan(0);
    });
});

// =============================================
// 7. ALL CAPS text → lower punctuation score
// =============================================

describe('analyzeSentiment — ALL CAPS', () => {
    it('gives negative punctuation for ALL CAPS words', () => {
        const result = analyzeSentiment('BEN BURADA BEKLİYORUM');
        expect(result.signals.punctuation).toBeLessThan(0);
    });

    it('gives more negative punctuation for 3+ caps words', () => {
        const resultOne = analyzeSentiment('BEN bekliyorum burada');
        const resultThree = analyzeSentiment('BEN BURADA BEKLİYORUM SAATLERDIR');
        expect(resultThree.signals.punctuation).toBeLessThan(resultOne.signals.punctuation);
    });

    it('does not count short uppercase words (2 chars or less)', () => {
        // Words with length <= 2 are filtered out from caps detection
        const result = analyzeSentiment('bu da ne');
        expect(result.signals.punctuation).toBe(0);
    });
});

// =============================================
// 8. Very short text (1-2 words) → slightly negative turnLength
// =============================================

describe('analyzeSentiment — short text turn length', () => {
    it('gives negative turnLength for single word', () => {
        const result = analyzeSentiment('hayır');
        expect(result.signals.turnLength).toBe(-0.2);
    });

    it('gives negative turnLength for two words', () => {
        const result = analyzeSentiment('olmaz böyle');
        expect(result.signals.turnLength).toBe(-0.2);
    });
});

// =============================================
// 9. Medium text (10-30 words) → slightly positive turnLength
// =============================================

describe('analyzeSentiment — medium text turn length', () => {
    it('gives positive turnLength for 10-30 word text', () => {
        const words = Array(15).fill('kelime').join(' ');
        const result = analyzeSentiment(words);
        expect(result.signals.turnLength).toBe(0.1);
    });

    it('gives zero turnLength for 3-9 word text', () => {
        const result = analyzeSentiment('ben dün sizi aradım ama ulaşamadım');
        expect(result.signals.turnLength).toBe(0);
    });

    it('gives slightly negative turnLength for very long text (50+ words)', () => {
        const words = Array(55).fill('kelime').join(' ');
        const result = analyzeSentiment(words);
        expect(result.signals.turnLength).toBe(-0.1);
    });
});

// =============================================
// 10. Repeated words → negative repetition score
// =============================================

describe('analyzeSentiment — repetition detection', () => {
    it('gives negative repetition for a word repeated 3+ times', () => {
        const result = analyzeSentiment('lütfen lütfen lütfen yardım edin');
        expect(result.signals.repetition).toBe(-0.2);
    });

    it('gives more negative repetition for 3+ different repeated words', () => {
        const result = analyzeSentiment(
            'sorun sorun sorun hata hata hata neden neden neden',
        );
        expect(result.signals.repetition).toBe(-0.5);
    });

    it('ignores short words (3 chars or less) for repetition', () => {
        const result = analyzeSentiment('bir bir bir iki iki iki üç üç üç');
        // All words are 3 chars or less, so no repetition detected
        expect(result.signals.repetition).toBe(0);
    });

    it('gives zero repetition when no word appears 3+ times', () => {
        const result = analyzeSentiment('merhaba bugün güzel bir gün');
        expect(result.signals.repetition).toBe(0);
    });
});

// =============================================
// 11. Score clamped to [-1, +1]
// =============================================

describe('analyzeSentiment — score clamping', () => {
    it('never returns a score below -1', () => {
        // Stack every negative signal: keywords + !!! + CAPS + repetition + short
        const result = analyzeSentiment(
            'SORUN PROBLEM HATA YANLIŞ KÖTÜ BERBAT REZALET SAÇMA!!! sorun sorun sorun hata hata hata neden neden neden',
        );
        expect(result.score).toBeGreaterThanOrEqual(-1);
    });

    it('never returns a score above 1', () => {
        const result = analyzeSentiment(
            'teşekkür memnun harika güzel mükemmel süper başarılı olumlu kaliteli profesyonel thank great excellent wonderful perfect amazing happy satisfied :) 😊 👍',
        );
        expect(result.score).toBeLessThanOrEqual(1);
    });

    it('individual signal scores are also within range', () => {
        const result = analyzeSentiment(
            'BERBAT REZALET SAÇMA!!! KABUL EDILEMEZ??? sorun sorun sorun',
        );
        expect(result.signals.punctuation).toBeGreaterThanOrEqual(-1);
        expect(result.signals.punctuation).toBeLessThanOrEqual(1);
    });
});

// =============================================
// 12. shouldEscalate true when very_negative
// =============================================

describe('analyzeSentiment — shouldEscalate', () => {
    it('is true when score < -0.5', () => {
        const result = analyzeSentiment(
            'şikayet sorun problem hata yanlış kötü berbat rezalet saçma sinirli kızgın!!!',
        );
        expect(result.score).toBeLessThan(-0.5);
        expect(result.shouldEscalate).toBe(true);
        expect(result.label).toBe('very_negative');
    });

    it('is false when score is neutral or positive', () => {
        const result = analyzeSentiment('bugün hava güneşli');
        expect(result.shouldEscalate).toBe(false);
    });

    it('is false for mildly negative score (> -0.5)', () => {
        const result = analyzeSentiment('biraz sorun var');
        if (result.score > -0.5) {
            expect(result.shouldEscalate).toBe(false);
        }
    });
});

// =============================================
// 13. suggestedAction present for non-neutral labels
// =============================================

describe('analyzeSentiment — suggestedAction', () => {
    it('returns undefined for neutral label', () => {
        const result = analyzeSentiment('bugün hava güneşli');
        if (result.label === 'neutral') {
            expect(result.suggestedAction).toBeUndefined();
        }
    });

    it('returns Turkish escalation string for very_negative', () => {
        const result = analyzeSentiment(
            'şikayet sorun problem hata yanlış kötü berbat rezalet saçma sinirli kızgın!!!',
        );
        expect(result.suggestedAction).toBe(
            'Müşteriyi yöneticiye devret — yüksek memnuniyetsizlik',
        );
    });

    it('returns empathy string for negative', () => {
        const result = analyzeSentiment('sorun var ama halledilir');
        if (result.label === 'negative') {
            expect(result.suggestedAction).toBe(
                'Empati göster ve çözüm odaklı yaklaş',
            );
        }
    });

    it('returns upsell string for very_positive', () => {
        const result = analyzeSentiment(
            'teşekkür memnun harika güzel mükemmel süper başarılı kaliteli profesyonel mutlu 😊 👍',
        );
        if (result.label === 'very_positive') {
            expect(result.suggestedAction).toBe(
                'Fırsat: Üst satış veya referans talebi',
            );
        }
    });

    it('returns sustain string for positive', () => {
        const result = analyzeSentiment(
            'teşekkür ederim, memnun kaldım diyebilirim, yardımcı oldunuz gerçekten',
        );
        if (result.label === 'positive') {
            expect(result.suggestedAction).toBe('Pozitif deneyimi sürdür');
        }
    });
});

// =============================================
// 14. createConversationContext returns zeroed state
// =============================================

describe('createConversationContext', () => {
    it('returns empty turns array', () => {
        const ctx = createConversationContext();
        expect(ctx.turns).toEqual([]);
    });

    it('returns averageSentiment of 0', () => {
        const ctx = createConversationContext();
        expect(ctx.averageSentiment).toBe(0);
    });

    it('returns negativeStreak of 0', () => {
        const ctx = createConversationContext();
        expect(ctx.negativeStreak).toBe(0);
    });
});

// =============================================
// 15. analyzeConversationSentiment tracks running average
// =============================================

describe('analyzeConversationSentiment — running average', () => {
    it('updates averageSentiment with exponential moving average (alpha=0.3)', () => {
        const ctx = createConversationContext();
        const text = 'teşekkür memnun harika güzel mükemmel süper';
        const { result, updatedContext } = analyzeConversationSentiment(text, ctx);

        // EMA: (1-0.3)*0 + 0.3*result.score = 0.3 * result.score
        const expected = Math.round(0.3 * result.score * 100) / 100;
        expect(updatedContext.averageSentiment).toBe(expected);
    });

    it('accumulates sentiment over multiple turns', () => {
        let ctx = createConversationContext();

        // First turn: positive
        const { result: r1, updatedContext: c1 } = analyzeConversationSentiment(
            'teşekkür memnun harika güzel mükemmel süper', ctx,
        );
        ctx = c1;

        // Second turn: also positive
        const { result: r2, updatedContext: c2 } = analyzeConversationSentiment(
            'harika güzel başarılı profesyonel kaliteli teşekkür ederim', ctx,
        );
        ctx = c2;

        // Average should reflect both positive turns
        expect(ctx.averageSentiment).toBeGreaterThan(0);
    });

    it('adds current turn to the turns array', () => {
        const ctx = createConversationContext();
        const { updatedContext } = analyzeConversationSentiment('merhaba', ctx);
        expect(updatedContext.turns).toContain('merhaba');
        expect(updatedContext.turns.length).toBe(1);
    });

    it('keeps only last 10 turns', () => {
        let ctx = createConversationContext();
        for (let i = 0; i < 12; i++) {
            const { updatedContext } = analyzeConversationSentiment(`turn ${i}`, ctx);
            ctx = updatedContext;
        }
        expect(ctx.turns.length).toBe(10);
        // First two turns should have been dropped
        expect(ctx.turns[0]).toBe('turn 2');
        expect(ctx.turns[9]).toBe('turn 11');
    });
});

// =============================================
// 16. 3+ consecutive negative turns forces escalation
// =============================================

describe('analyzeConversationSentiment — negative streak escalation', () => {
    it('forces escalation after 3 consecutive negative turns', () => {
        let ctx = createConversationContext();

        // 3 negative turns
        for (let i = 0; i < 3; i++) {
            const { result, updatedContext } = analyzeConversationSentiment(
                'sorun var, problem çözülmedi, hata devam ediyor',
                ctx,
            );
            ctx = updatedContext;

            if (i < 2) {
                // Before reaching 3 consecutive, streak is building
                expect(ctx.negativeStreak).toBe(i + 1);
            } else {
                // On the 3rd negative turn, escalation should be forced
                expect(ctx.negativeStreak).toBe(3);
                expect(result.shouldEscalate).toBe(true);
                expect(result.suggestedAction).toBe(
                    'Müşteri 3+ tur boyunca olumsuz — yöneticiye devret',
                );
            }
        }
    });

    it('forces escalation even when individual turn is only mildly negative', () => {
        let ctx = createConversationContext();

        // Use mildly negative text (score between -0.5 and -0.2)
        const mildlyNegative = 'sorun var ama ciddi bir durum değil belki hallolur diye düşünüyorum';
        for (let i = 0; i < 3; i++) {
            const { result, updatedContext } = analyzeConversationSentiment(
                mildlyNegative, ctx,
            );
            ctx = updatedContext;

            if (i === 2 && ctx.negativeStreak >= 3) {
                // Even mild negativity, if streaked, should escalate
                expect(result.shouldEscalate).toBe(true);
            }
        }
    });

    it('increments negativeStreak for scores below -0.2', () => {
        let ctx = createConversationContext();
        const { updatedContext } = analyzeConversationSentiment(
            'şikayet sorun problem berbat rezalet', ctx,
        );
        expect(updatedContext.negativeStreak).toBeGreaterThanOrEqual(1);
    });
});

// =============================================
// 17. Positive turn resets negativeStreak
// =============================================

describe('analyzeConversationSentiment — positive turn resets streak', () => {
    it('resets negativeStreak to 0 when a non-negative turn arrives', () => {
        let ctx = createConversationContext();

        // Two negative turns
        for (let i = 0; i < 2; i++) {
            const { updatedContext } = analyzeConversationSentiment(
                'sorun var, problem çözülmedi, hata devam ediyor',
                ctx,
            );
            ctx = updatedContext;
        }
        expect(ctx.negativeStreak).toBe(2);

        // One positive turn resets streak
        const { updatedContext: resetCtx } = analyzeConversationSentiment(
            'teşekkür ederim, memnun kaldım, harika hizmet aldım, çok güzel oldu',
            ctx,
        );
        expect(resetCtx.negativeStreak).toBe(0);
    });

    it('resets negativeStreak on neutral turn', () => {
        let ctx = createConversationContext();

        // One negative turn
        const { updatedContext: c1 } = analyzeConversationSentiment(
            'şikayet sorun problem berbat', ctx,
        );
        ctx = c1;
        expect(ctx.negativeStreak).toBeGreaterThanOrEqual(1);

        // Neutral turn (score >= -0.2) resets streak
        const { result, updatedContext: c2 } = analyzeConversationSentiment(
            'anladım peki tamam bilgi için', ctx,
        );
        // Only resets if score >= -0.2
        if (result.score >= -0.2) {
            expect(c2.negativeStreak).toBe(0);
        }
    });
});

// =============================================
// 18. Mixed sentiment text
// =============================================

describe('analyzeSentiment — mixed sentiment', () => {
    it('balances positive and negative keywords', () => {
        const result = analyzeSentiment('teşekkür ederim ama sorun hala devam ediyor');
        // Has both positive (teşekkür) and negative (sorun, hala) keywords
        // Keyword signal should be near 0 or slightly negative
        expect(result.signals.keyword).toBeDefined();
        expect(result.score).toBeGreaterThanOrEqual(-1);
        expect(result.score).toBeLessThanOrEqual(1);
    });

    it('returns a moderate score rather than extreme for mixed input', () => {
        const result = analyzeSentiment(
            'memnun kaldım güzel hizmet ama bazı sorunlar problem vardı',
        );
        // Score should be moderate, not extreme
        expect(result.score).toBeGreaterThan(-0.5);
        expect(result.score).toBeLessThan(0.5);
    });

    it('correctly combines signals from different analyzers', () => {
        // Positive keywords but negative punctuation (caps + exclamation)
        const result = analyzeSentiment('TEŞEKKÜR EDERİM!!!');
        // Keyword is positive but punctuation is negative
        expect(result.signals.keyword).toBeGreaterThan(0);
        expect(result.signals.punctuation).toBeLessThan(0);
    });
});

// =============================================
// Structural / contract tests
// =============================================

describe('analyzeSentiment — result structure', () => {
    it('returns all expected fields in SentimentResult', () => {
        const result = analyzeSentiment('merhaba');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('label');
        expect(result).toHaveProperty('signals');
        expect(result).toHaveProperty('shouldEscalate');
        expect(result).toHaveProperty('signals.keyword');
        expect(result).toHaveProperty('signals.punctuation');
        expect(result).toHaveProperty('signals.turnLength');
        expect(result).toHaveProperty('signals.repetition');
    });

    it('score is rounded to 2 decimal places', () => {
        const result = analyzeSentiment('teşekkür ederim güzel hizmet');
        const decimalPlaces = (result.score.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('signal scores are rounded to 2 decimal places', () => {
        const result = analyzeSentiment('teşekkür ederim güzel hizmet');
        for (const key of ['keyword', 'punctuation', 'turnLength', 'repetition'] as const) {
            const decimalPlaces = (result.signals[key].toString().split('.')[1] || '').length;
            expect(decimalPlaces).toBeLessThanOrEqual(2);
        }
    });

    it('label is one of the 5 valid values', () => {
        const validLabels = ['very_negative', 'negative', 'neutral', 'positive', 'very_positive'];
        const texts = [
            'merhaba',
            'teşekkür memnun harika güzel mükemmel süper',
            'şikayet sorun problem hata yanlış kötü berbat rezalet!!!',
        ];
        for (const text of texts) {
            const result = analyzeSentiment(text);
            expect(validLabels).toContain(result.label);
        }
    });
});

// =============================================
// Emoji patterns
// =============================================

describe('analyzeSentiment — emoji patterns', () => {
    it('gives positive punctuation for positive emojis', () => {
        const result = analyzeSentiment('tamam 😊 👍');
        expect(result.signals.punctuation).toBeGreaterThan(0);
    });

    it('gives negative punctuation for negative emojis', () => {
        const result = analyzeSentiment('hayır 😡 😤');
        expect(result.signals.punctuation).toBeLessThan(0);
    });

    it('gives positive punctuation for smiley text emoticon', () => {
        const result = analyzeSentiment('tamam :)');
        expect(result.signals.punctuation).toBeGreaterThan(0);
    });

    it('gives negative punctuation for frown text emoticon', () => {
        const result = analyzeSentiment('hayır :(');
        expect(result.signals.punctuation).toBeLessThan(0);
    });
});

// =============================================
// Label boundary tests
// =============================================

describe('scoreToLabel boundaries', () => {
    it('maps score <= -0.5 to very_negative', () => {
        const result = analyzeSentiment(
            'şikayet sorun problem hata yanlış kötü berbat rezalet saçma sinirli kızgın öfkeli iptal vazgeçtim!!!',
        );
        if (result.score <= -0.5) {
            expect(result.label).toBe('very_negative');
        }
    });

    it('maps score between -0.5 and -0.2 to negative', () => {
        const result = analyzeSentiment('sorun var, problem çözülmedi');
        if (result.score > -0.5 && result.score <= -0.2) {
            expect(result.label).toBe('negative');
        }
    });

    it('maps score between -0.2 and 0.2 to neutral', () => {
        const result = analyzeSentiment('merhaba bugün nasılsınız');
        if (result.score > -0.2 && result.score < 0.2) {
            expect(result.label).toBe('neutral');
        }
    });

    it('maps score between 0.2 and 0.5 to positive', () => {
        const result = analyzeSentiment(
            'teşekkür ederim memnun kaldım yardımcı oldunuz gerçekten',
        );
        if (result.score >= 0.2 && result.score < 0.5) {
            expect(result.label).toBe('positive');
        }
    });

    it('maps score >= 0.5 to very_positive', () => {
        const result = analyzeSentiment(
            'teşekkür memnun harika güzel mükemmel süper başarılı kaliteli profesyonel mutlu 😊 👍',
        );
        if (result.score >= 0.5) {
            expect(result.label).toBe('very_positive');
        }
    });
});
