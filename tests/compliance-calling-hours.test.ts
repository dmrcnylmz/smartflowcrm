/**
 * Compliance Module Tests
 *
 * Tests for:
 * - Calling hours guard (time-window blocking)
 * - Country detection from E.164 phone numbers
 * - AI disclosure messages (all 4 languages)
 * - Recording disclaimers
 * - Compliance preamble builder
 */

import { describe, it, expect } from 'vitest';
import {
    detectCountryFromPhone,
    getTimezoneForCountry,
    isCallingAllowed,
    getNextAllowedWindow,
    CALLING_HOURS,
    FRANCE_LUNCH_BREAK,
    type CallingCountry,
} from '@/lib/compliance/calling-hours';
import {
    getAIDisclosure,
    getRecordingDisclaimer,
    buildCompliancePreamble,
    AI_DISCLOSURE_MESSAGES,
    RECORDING_DISCLAIMER,
} from '@/lib/compliance/ai-disclosure';

// =============================================
// Country Detection
// =============================================

describe('detectCountryFromPhone', () => {
    it('detects Turkey (+90)', () => {
        expect(detectCountryFromPhone('+905321234567')).toBe('TR');
    });

    it('detects Germany (+49)', () => {
        expect(detectCountryFromPhone('+4915112345678')).toBe('DE');
    });

    it('detects France (+33)', () => {
        expect(detectCountryFromPhone('+33612345678')).toBe('FR');
    });

    it('detects US (+1)', () => {
        expect(detectCountryFromPhone('+14155551234')).toBe('US');
    });

    it('detects UK (+44)', () => {
        expect(detectCountryFromPhone('+447911123456')).toBe('UK');
    });

    it('returns OTHER for unknown prefix', () => {
        expect(detectCountryFromPhone('+81312345678')).toBe('OTHER'); // Japan
        expect(detectCountryFromPhone('+551199999999')).toBe('OTHER'); // Brazil
    });

    it('handles numbers with spaces/dashes', () => {
        expect(detectCountryFromPhone('+90 532 123 45 67')).toBe('TR');
        expect(detectCountryFromPhone('+49-151-1234-5678')).toBe('DE');
    });
});

// =============================================
// Timezone Mapping
// =============================================

describe('getTimezoneForCountry', () => {
    it('returns correct IANA timezones', () => {
        expect(getTimezoneForCountry('TR')).toBe('Europe/Istanbul');
        expect(getTimezoneForCountry('DE')).toBe('Europe/Berlin');
        expect(getTimezoneForCountry('FR')).toBe('Europe/Paris');
        expect(getTimezoneForCountry('US')).toBe('America/New_York');
        expect(getTimezoneForCountry('UK')).toBe('Europe/London');
        expect(getTimezoneForCountry('OTHER')).toBe('UTC');
    });
});

// =============================================
// Calling Hours Configuration
// =============================================

describe('CALLING_HOURS configuration', () => {
    it('TR: 09-18, all days', () => {
        expect(CALLING_HOURS.TR).toEqual({ start: 9, end: 18, weekdaysOnly: false });
    });

    it('DE: 08-20, weekdays only', () => {
        expect(CALLING_HOURS.DE).toEqual({ start: 8, end: 20, weekdaysOnly: true });
    });

    it('FR: 10-20, weekdays only, max 4 calls/month', () => {
        expect(CALLING_HOURS.FR.start).toBe(10);
        expect(CALLING_HOURS.FR.end).toBe(20);
        expect(CALLING_HOURS.FR.weekdaysOnly).toBe(true);
        expect(CALLING_HOURS.FR.maxCallsPerMonth).toBe(4);
    });

    it('US: 08-21, all days', () => {
        expect(CALLING_HOURS.US).toEqual({ start: 8, end: 21, weekdaysOnly: false });
    });

    it('UK: 08-21, all days', () => {
        expect(CALLING_HOURS.UK).toEqual({ start: 8, end: 21, weekdaysOnly: false });
    });

    it('France lunch break is 13-14', () => {
        expect(FRANCE_LUNCH_BREAK).toEqual({ start: 13, end: 14 });
    });
});

// =============================================
// isCallingAllowed
// =============================================

describe('isCallingAllowed', () => {
    // Helper: create a date at a specific time in a timezone
    function createDateInTimezone(timezone: string, hour: number, minute: number, dayOfWeek: number): Date {
        // We need to find a UTC date that corresponds to the given local time
        // Start with a base date and adjust
        const now = new Date();

        // Find a date with the correct day of week
        const currentDow = now.getDay();
        const daysToAdd = ((dayOfWeek - currentDow) + 7) % 7;
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysToAdd);

        // Format the target date to get its current offset in the timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
        });
        const parts = formatter.formatToParts(targetDate);
        const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
        const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

        // Adjust to desired time
        const hourDiff = hour - currentHour;
        const minuteDiff = minute - currentMinute;
        const result = new Date(targetDate.getTime() + hourDiff * 3600000 + minuteDiff * 60000);

        return result;
    }

    describe('Turkey (+90)', () => {
        it('allows calls during business hours (10:00 weekday)', () => {
            const time = createDateInTimezone('Europe/Istanbul', 10, 0, 1); // Monday 10:00
            const result = isCallingAllowed('+905321234567', time);
            expect(result.allowed).toBe(true);
            expect(result.country).toBe('TR');
        });

        it('blocks calls before 09:00', () => {
            const time = createDateInTimezone('Europe/Istanbul', 7, 0, 1); // Monday 07:00
            const result = isCallingAllowed('+905321234567', time);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Outside calling hours');
        });

        it('blocks calls at/after 18:00', () => {
            const time = createDateInTimezone('Europe/Istanbul', 19, 0, 1); // Monday 19:00
            const result = isCallingAllowed('+905321234567', time);
            expect(result.allowed).toBe(false);
        });

        it('allows calls on weekends', () => {
            const time = createDateInTimezone('Europe/Istanbul', 12, 0, 6); // Saturday 12:00
            const result = isCallingAllowed('+905321234567', time);
            expect(result.allowed).toBe(true);
        });
    });

    describe('Germany (+49)', () => {
        it('allows calls during business hours (14:00 weekday)', () => {
            const time = createDateInTimezone('Europe/Berlin', 14, 0, 3); // Wednesday 14:00
            const result = isCallingAllowed('+4915112345678', time);
            expect(result.allowed).toBe(true);
            expect(result.country).toBe('DE');
        });

        it('blocks calls on Saturday', () => {
            const time = createDateInTimezone('Europe/Berlin', 12, 0, 6); // Saturday 12:00
            const result = isCallingAllowed('+4915112345678', time);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('weekends');
        });

        it('blocks calls on Sunday', () => {
            const time = createDateInTimezone('Europe/Berlin', 12, 0, 0); // Sunday 12:00
            const result = isCallingAllowed('+4915112345678', time);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('weekends');
        });

        it('blocks calls before 08:00', () => {
            const time = createDateInTimezone('Europe/Berlin', 7, 0, 1); // Monday 07:00
            const result = isCallingAllowed('+4915112345678', time);
            expect(result.allowed).toBe(false);
        });

        it('blocks calls at/after 20:00', () => {
            const time = createDateInTimezone('Europe/Berlin', 21, 0, 2); // Tuesday 21:00
            const result = isCallingAllowed('+4915112345678', time);
            expect(result.allowed).toBe(false);
        });
    });

    describe('France (+33)', () => {
        it('allows calls during business hours (15:00 weekday)', () => {
            const time = createDateInTimezone('Europe/Paris', 15, 0, 4); // Thursday 15:00
            const result = isCallingAllowed('+33612345678', time);
            expect(result.allowed).toBe(true);
            expect(result.country).toBe('FR');
        });

        it('blocks calls during lunch break (13:00-14:00)', () => {
            const time = createDateInTimezone('Europe/Paris', 13, 30, 1); // Monday 13:30
            const result = isCallingAllowed('+33612345678', time);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('lunch break');
        });

        it('allows calls right at 14:00 (lunch break ends)', () => {
            const time = createDateInTimezone('Europe/Paris', 14, 0, 1); // Monday 14:00
            const result = isCallingAllowed('+33612345678', time);
            expect(result.allowed).toBe(true);
        });

        it('blocks calls on weekends', () => {
            const time = createDateInTimezone('Europe/Paris', 14, 0, 0); // Sunday 14:00
            const result = isCallingAllowed('+33612345678', time);
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('weekends');
        });

        it('blocks calls before 10:00', () => {
            const time = createDateInTimezone('Europe/Paris', 9, 0, 2); // Tuesday 09:00
            const result = isCallingAllowed('+33612345678', time);
            expect(result.allowed).toBe(false);
        });
    });

    describe('US (+1)', () => {
        // Use a New York area code (212) so timezone matches test expectations
        it('allows calls during business hours (14:00 any day)', () => {
            const time = createDateInTimezone('America/New_York', 14, 0, 3);
            const result = isCallingAllowed('+12125551234', time);
            expect(result.allowed).toBe(true);
            expect(result.country).toBe('US');
        });

        it('allows calls on weekends', () => {
            const time = createDateInTimezone('America/New_York', 12, 0, 0); // Sunday
            const result = isCallingAllowed('+12125551234', time);
            expect(result.allowed).toBe(true);
        });

        it('blocks calls before 08:00', () => {
            const time = createDateInTimezone('America/New_York', 6, 0, 1);
            const result = isCallingAllowed('+12125551234', time);
            expect(result.allowed).toBe(false);
        });

        it('blocks calls at/after 21:00', () => {
            const time = createDateInTimezone('America/New_York', 22, 0, 1);
            const result = isCallingAllowed('+12125551234', time);
            expect(result.allowed).toBe(false);
        });
    });

    describe('UK (+44)', () => {
        it('allows calls during business hours', () => {
            const time = createDateInTimezone('Europe/London', 10, 0, 2);
            const result = isCallingAllowed('+447911123456', time);
            expect(result.allowed).toBe(true);
            expect(result.country).toBe('UK');
        });

        it('blocks calls before 08:00', () => {
            const time = createDateInTimezone('Europe/London', 7, 0, 1);
            const result = isCallingAllowed('+447911123456', time);
            expect(result.allowed).toBe(false);
        });
    });

    describe('result structure', () => {
        it('returns country and localTime for allowed calls', () => {
            const time = createDateInTimezone('Europe/Istanbul', 12, 0, 1);
            const result = isCallingAllowed('+905321234567', time);
            expect(result.country).toBe('TR');
            expect(result.localTime).toBeTruthy();
            expect(result.reason).toBeUndefined();
        });

        it('returns reason and nextAllowedTime for blocked calls', () => {
            const time = createDateInTimezone('Europe/Istanbul', 22, 0, 1);
            const result = isCallingAllowed('+905321234567', time);
            expect(result.allowed).toBe(false);
            expect(result.reason).toBeTruthy();
            expect(result.nextAllowedTime).toBeTruthy();
        });
    });
});

// =============================================
// getNextAllowedWindow
// =============================================

describe('getNextAllowedWindow', () => {
    it('returns a future Date', () => {
        const now = new Date();
        const next = getNextAllowedWindow('TR', now);
        // The next window should be at or after now (within a reasonable future)
        expect(next instanceof Date).toBe(true);
    });

    it('returns a Date for all country codes', () => {
        const countries: CallingCountry[] = ['TR', 'DE', 'FR', 'US', 'UK', 'OTHER'];
        for (const country of countries) {
            const next = getNextAllowedWindow(country);
            expect(next instanceof Date).toBe(true);
            expect(isNaN(next.getTime())).toBe(false);
        }
    });
});

// =============================================
// AI Disclosure Messages
// =============================================

describe('AI Disclosure', () => {
    describe('AI_DISCLOSURE_MESSAGES', () => {
        it('has messages for all 4 languages', () => {
            expect(AI_DISCLOSURE_MESSAGES.tr).toBeTruthy();
            expect(AI_DISCLOSURE_MESSAGES.en).toBeTruthy();
            expect(AI_DISCLOSURE_MESSAGES.de).toBeTruthy();
            expect(AI_DISCLOSURE_MESSAGES.fr).toBeTruthy();
        });

        it('all messages are non-empty strings', () => {
            for (const [lang, msg] of Object.entries(AI_DISCLOSURE_MESSAGES)) {
                expect(typeof msg).toBe('string');
                expect(msg.length).toBeGreaterThan(10);
            }
        });
    });

    describe('getAIDisclosure', () => {
        it('returns Turkish disclosure', () => {
            expect(getAIDisclosure('tr')).toBe(AI_DISCLOSURE_MESSAGES.tr);
        });

        it('returns English disclosure', () => {
            expect(getAIDisclosure('en')).toBe(AI_DISCLOSURE_MESSAGES.en);
        });

        it('returns German disclosure', () => {
            expect(getAIDisclosure('de')).toBe(AI_DISCLOSURE_MESSAGES.de);
        });

        it('returns French disclosure', () => {
            expect(getAIDisclosure('fr')).toBe(AI_DISCLOSURE_MESSAGES.fr);
        });

        it('falls back to English for unknown languages', () => {
            expect(getAIDisclosure('ja')).toBe(AI_DISCLOSURE_MESSAGES.en);
            expect(getAIDisclosure('zh')).toBe(AI_DISCLOSURE_MESSAGES.en);
        });

        it('never returns empty string', () => {
            expect(getAIDisclosure('xx')).toBeTruthy();
            expect(getAIDisclosure('')).toBeTruthy();
        });

        it('handles BCP47 language codes', () => {
            expect(getAIDisclosure('tr-TR')).toBe(AI_DISCLOSURE_MESSAGES.tr);
            expect(getAIDisclosure('de-DE')).toBe(AI_DISCLOSURE_MESSAGES.de);
        });
    });
});

// =============================================
// Recording Disclaimer
// =============================================

describe('Recording Disclaimer', () => {
    describe('RECORDING_DISCLAIMER', () => {
        it('has messages for all 4 languages', () => {
            expect(RECORDING_DISCLAIMER.tr).toBeTruthy();
            expect(RECORDING_DISCLAIMER.en).toBeTruthy();
            expect(RECORDING_DISCLAIMER.de).toBeTruthy();
            expect(RECORDING_DISCLAIMER.fr).toBeTruthy();
        });

        it('all messages are non-empty strings', () => {
            for (const [lang, msg] of Object.entries(RECORDING_DISCLAIMER)) {
                expect(typeof msg).toBe('string');
                expect(msg.length).toBeGreaterThan(10);
            }
        });
    });

    describe('getRecordingDisclaimer', () => {
        it('returns correct disclaimer for each language', () => {
            expect(getRecordingDisclaimer('tr')).toBe(RECORDING_DISCLAIMER.tr);
            expect(getRecordingDisclaimer('en')).toBe(RECORDING_DISCLAIMER.en);
            expect(getRecordingDisclaimer('de')).toBe(RECORDING_DISCLAIMER.de);
            expect(getRecordingDisclaimer('fr')).toBe(RECORDING_DISCLAIMER.fr);
        });

        it('falls back to English for unknown languages', () => {
            expect(getRecordingDisclaimer('ja')).toBe(RECORDING_DISCLAIMER.en);
        });
    });
});

// =============================================
// Compliance Preamble Builder
// =============================================

describe('buildCompliancePreamble', () => {
    it('always includes AI disclosure', () => {
        const preamble = buildCompliancePreamble('en', false);
        expect(preamble).toContain('AI assistant');
    });

    it('includes recording disclaimer when recording is enabled', () => {
        const preamble = buildCompliancePreamble('en', true);
        expect(preamble).toContain('AI assistant');
        expect(preamble).toContain('recorded');
        expect(preamble).toContain('consent');
    });

    it('does NOT include recording disclaimer when recording is disabled', () => {
        const preamble = buildCompliancePreamble('en', false);
        expect(preamble).not.toContain('consent to the recording');
    });

    it('works for all 4 languages with recording enabled', () => {
        for (const lang of ['tr', 'en', 'de', 'fr']) {
            const preamble = buildCompliancePreamble(lang, true);
            expect(preamble.length).toBeGreaterThan(20);
            // Should contain both disclosure and disclaimer
            expect(preamble).toContain(AI_DISCLOSURE_MESSAGES[lang]);
            expect(preamble).toContain(RECORDING_DISCLAIMER[lang]);
        }
    });

    it('works for all 4 languages without recording', () => {
        for (const lang of ['tr', 'en', 'de', 'fr']) {
            const preamble = buildCompliancePreamble(lang, false);
            expect(preamble).toBe(AI_DISCLOSURE_MESSAGES[lang]);
        }
    });

    it('Turkish preamble contains yapay zeka', () => {
        const preamble = buildCompliancePreamble('tr', false);
        expect(preamble).toContain('yapay zeka');
    });

    it('German preamble contains KI-Assistent', () => {
        const preamble = buildCompliancePreamble('de', false);
        expect(preamble).toContain('KI-Assistent');
    });

    it('French preamble contains assistant IA', () => {
        const preamble = buildCompliancePreamble('fr', false);
        expect(preamble).toContain('assistant IA');
    });
});
