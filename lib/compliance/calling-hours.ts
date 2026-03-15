/**
 * Compliance: Calling Hours Guard
 *
 * BLOCKS outbound calls outside legal hours based on destination country.
 * Uses the callee's local time (from E.164 country code → IANA timezone).
 *
 * Regulations enforced:
 * - TR: 09:00-18:00 (all days)
 * - DE: 08:00-20:00 (weekdays only — UWG §7)
 * - FR: 10:00-20:00 weekdays only, lunch break 13:00-14:00 (Code de la consommation)
 * - US: 08:00-21:00 (all days — TCPA)
 * - UK: 08:00-21:00 (all days — Ofcom)
 * - OTHER: 09:00-18:00 (conservative default)
 *
 * Uses Intl.DateTimeFormat for timezone conversion (no external deps).
 */

// =============================================
// Types
// =============================================

export type CallingCountry = 'TR' | 'DE' | 'FR' | 'US' | 'UK' | 'OTHER';

export interface CallingHoursRule {
    start: number; // hour (0-23)
    end: number;   // hour (0-23)
    weekdaysOnly: boolean;
    maxCallsPerMonth?: number;
}

export interface CallingAllowedResult {
    allowed: boolean;
    reason?: string;
    country: CallingCountry;
    localTime: string;
    nextAllowedTime?: string;
}

// =============================================
// Legal Calling Hours per Country
// =============================================

export const CALLING_HOURS: Record<CallingCountry, CallingHoursRule> = {
    TR: { start: 9, end: 18, weekdaysOnly: false },
    DE: { start: 8, end: 20, weekdaysOnly: true },
    FR: { start: 10, end: 20, weekdaysOnly: true, maxCallsPerMonth: 4 },
    US: { start: 8, end: 21, weekdaysOnly: false },
    UK: { start: 8, end: 21, weekdaysOnly: false },
    OTHER: { start: 9, end: 18, weekdaysOnly: false },
};

/** France lunch break: no calls 13:00-14:00 */
export const FRANCE_LUNCH_BREAK = { start: 13, end: 14 };

// =============================================
// Country Detection from E.164
// =============================================

const COUNTRY_PREFIXES: Array<{ prefix: string; country: CallingCountry }> = [
    { prefix: '+90', country: 'TR' },
    { prefix: '+49', country: 'DE' },
    { prefix: '+33', country: 'FR' },
    { prefix: '+44', country: 'UK' },
    { prefix: '+1', country: 'US' },
];

/**
 * Detect country from E.164 phone number prefix.
 * Returns 'OTHER' for unrecognized prefixes.
 */
export function detectCountryFromPhone(phoneNumber: string): CallingCountry {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    // Match longest prefix first (already ordered correctly — +90 before +9, etc.)
    for (const { prefix, country } of COUNTRY_PREFIXES) {
        if (normalized.startsWith(prefix)) {
            return country;
        }
    }
    return 'OTHER';
}

// =============================================
// Timezone Mapping
// =============================================

const COUNTRY_TIMEZONES: Record<CallingCountry, string> = {
    TR: 'Europe/Istanbul',
    DE: 'Europe/Berlin',
    FR: 'Europe/Paris',
    US: 'America/New_York',
    UK: 'Europe/London',
    OTHER: 'UTC',
};

/**
 * Get IANA timezone for a calling country.
 */
export function getTimezoneForCountry(country: CallingCountry): string {
    return COUNTRY_TIMEZONES[country];
}

// =============================================
// Timezone Conversion (no external deps)
// =============================================

/**
 * Get current time components in a given IANA timezone.
 * Uses Intl.DateTimeFormat for reliable timezone conversion.
 */
function getTimeInTimezone(timezone: string, now?: Date): {
    hour: number;
    minute: number;
    dayOfWeek: number; // 0=Sunday, 6=Saturday
    formatted: string;
} {
    const date = now || new Date();

    // Use Intl.DateTimeFormat to extract parts in target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find(p => p.type === 'hour');
    const minutePart = parts.find(p => p.type === 'minute');
    const weekdayPart = parts.find(p => p.type === 'weekday');

    const hour = parseInt(hourPart?.value || '0', 10);
    const minute = parseInt(minutePart?.value || '0', 10);

    const dayMap: Record<string, number> = {
        'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
    };
    const dayOfWeek = dayMap[weekdayPart?.value || 'Mon'] ?? 1;

    // Human-readable format
    const fullFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const formatted = fullFormatter.format(date);

    return { hour, minute, dayOfWeek, formatted };
}

// =============================================
// Main Guard
// =============================================

/**
 * Check if an outbound call is allowed to the given phone number.
 *
 * Checks:
 * 1. Time window (calling hours in destination's local time)
 * 2. Weekday restriction (DE/FR: no weekend calls)
 * 3. France lunch break (13:00-14:00)
 *
 * @returns Detailed result with reason if blocked, and next allowed window.
 */
export function isCallingAllowed(phoneNumber: string, now?: Date): CallingAllowedResult {
    const country = detectCountryFromPhone(phoneNumber);
    const timezone = getTimezoneForCountry(country);
    const { hour, minute, dayOfWeek, formatted } = getTimeInTimezone(timezone, now);
    const rules = CALLING_HOURS[country];

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Check weekend restriction
    if (rules.weekdaysOnly && isWeekend) {
        const nextAllowed = getNextAllowedWindow(country, now);
        return {
            allowed: false,
            reason: `Calling not permitted on weekends in ${country}. Next allowed: ${nextAllowed.toISOString()}`,
            country,
            localTime: formatted,
            nextAllowedTime: nextAllowed.toISOString(),
        };
    }

    // Check time window
    if (hour < rules.start || hour >= rules.end) {
        const nextAllowed = getNextAllowedWindow(country, now);
        return {
            allowed: false,
            reason: `Outside calling hours for ${country} (${rules.start}:00-${rules.end}:00 local time). Current local time: ${formatted}`,
            country,
            localTime: formatted,
            nextAllowedTime: nextAllowed.toISOString(),
        };
    }

    // France lunch break: 13:00-14:00
    if (country === 'FR' && hour >= FRANCE_LUNCH_BREAK.start && hour < FRANCE_LUNCH_BREAK.end) {
        const nextAllowed = getNextAllowedWindow(country, now);
        return {
            allowed: false,
            reason: `France lunch break (${FRANCE_LUNCH_BREAK.start}:00-${FRANCE_LUNCH_BREAK.end}:00). Calls resume at 14:00 local time.`,
            country,
            localTime: formatted,
            nextAllowedTime: nextAllowed.toISOString(),
        };
    }

    return {
        allowed: true,
        country,
        localTime: formatted,
    };
}

// =============================================
// Next Allowed Window Calculator
// =============================================

/**
 * Calculate when the next allowed calling window opens for a country.
 */
export function getNextAllowedWindow(country: CallingCountry, now?: Date): Date {
    const rules = CALLING_HOURS[country];
    const timezone = getTimezoneForCountry(country);
    const date = now || new Date();
    const { hour, dayOfWeek } = getTimeInTimezone(timezone, date);

    // Start from current time, advance until we find an allowed slot
    const result = new Date(date);

    // If we're past end time or before start time today, try next start
    if (hour >= rules.end) {
        // Move to next day's start
        result.setTime(result.getTime() + (24 - hour + rules.start) * 60 * 60 * 1000);
    } else if (hour < rules.start) {
        // Move to today's start
        result.setTime(result.getTime() + (rules.start - hour) * 60 * 60 * 1000);
        // Zero out minutes/seconds
        result.setMinutes(0, 0, 0);
    } else {
        // We're in a lunch break (FR) — move to end of lunch
        result.setTime(result.getTime() + (FRANCE_LUNCH_BREAK.end - hour) * 60 * 60 * 1000);
        result.setMinutes(0, 0, 0);
    }

    // If weekdays only, skip weekends
    if (rules.weekdaysOnly) {
        const futureTime = getTimeInTimezone(timezone, result);
        let futureDow = futureTime.dayOfWeek;
        let daysToAdd = 0;

        if (futureDow === 6) daysToAdd = 2; // Saturday → Monday
        else if (futureDow === 0) daysToAdd = 1; // Sunday → Monday

        if (daysToAdd > 0) {
            result.setTime(result.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
            // Reset to start hour
            const adjusted = getTimeInTimezone(timezone, result);
            const hourDiff = adjusted.hour - rules.start;
            if (hourDiff !== 0) {
                result.setTime(result.getTime() - hourDiff * 60 * 60 * 1000);
            }
            result.setMinutes(0, 0, 0);
        }
    }

    return result;
}
