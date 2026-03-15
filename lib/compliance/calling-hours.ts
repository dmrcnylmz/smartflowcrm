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
    const timezone = getTimezoneForPhone(phoneNumber, country);
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

// =============================================
// US Area Code → Timezone Mapping
// =============================================

const US_TIMEZONE_MAP: Record<string, string> = {
    // Eastern (UTC-5)
    '201': 'America/New_York',   // NJ
    '202': 'America/New_York',   // DC
    '203': 'America/New_York',   // CT
    '212': 'America/New_York',   // NYC
    '213': 'America/Los_Angeles', // LA
    '215': 'America/New_York',   // Philadelphia
    '216': 'America/New_York',   // Cleveland
    '224': 'America/Chicago',    // IL
    '229': 'America/New_York',   // GA
    '239': 'America/New_York',   // FL
    '240': 'America/New_York',   // MD
    '248': 'America/New_York',   // MI
    '267': 'America/New_York',   // Philadelphia
    '301': 'America/New_York',   // MD
    '302': 'America/New_York',   // DE
    '303': 'America/Denver',     // Denver
    '304': 'America/New_York',   // WV
    '305': 'America/New_York',   // Miami
    '310': 'America/Los_Angeles', // LA
    '312': 'America/Chicago',    // Chicago
    '313': 'America/New_York',   // Detroit
    '314': 'America/Chicago',    // St. Louis
    '315': 'America/New_York',   // NY
    '316': 'America/Chicago',    // Wichita
    '317': 'America/New_York',   // Indianapolis
    '318': 'America/Chicago',    // LA (Louisiana)
    '319': 'America/Chicago',    // IA
    '320': 'America/Chicago',    // MN
    '321': 'America/New_York',   // FL
    '323': 'America/Los_Angeles', // LA
    '330': 'America/New_York',   // OH
    '346': 'America/Chicago',    // Houston
    '347': 'America/New_York',   // NYC
    '385': 'America/Denver',     // UT
    '404': 'America/New_York',   // Atlanta
    '405': 'America/Chicago',    // Oklahoma City
    '407': 'America/New_York',   // Orlando
    '408': 'America/Los_Angeles', // San Jose
    '410': 'America/New_York',   // Baltimore
    '412': 'America/New_York',   // Pittsburgh
    '414': 'America/Chicago',    // Milwaukee
    '415': 'America/Los_Angeles', // SF
    '469': 'America/Chicago',    // Dallas
    '470': 'America/New_York',   // Atlanta
    '480': 'America/Phoenix',    // Phoenix (no DST)
    '484': 'America/New_York',   // PA
    '501': 'America/Chicago',    // Little Rock
    '502': 'America/New_York',   // Louisville
    '503': 'America/Los_Angeles', // Portland
    '504': 'America/Chicago',    // New Orleans
    '505': 'America/Denver',     // Albuquerque
    '507': 'America/Chicago',    // MN
    '510': 'America/Los_Angeles', // Oakland
    '512': 'America/Chicago',    // Austin
    '513': 'America/New_York',   // Cincinnati
    '515': 'America/Chicago',    // Des Moines
    '516': 'America/New_York',   // Long Island
    '518': 'America/New_York',   // Albany
    '520': 'America/Phoenix',    // Tucson
    '530': 'America/Los_Angeles', // CA
    '540': 'America/New_York',   // VA
    '541': 'America/Los_Angeles', // OR
    '551': 'America/New_York',   // NJ
    '559': 'America/Los_Angeles', // Fresno
    '561': 'America/New_York',   // FL
    '562': 'America/Los_Angeles', // Long Beach
    '571': 'America/New_York',   // VA
    '602': 'America/Phoenix',    // Phoenix
    '603': 'America/New_York',   // NH
    '609': 'America/New_York',   // NJ
    '610': 'America/New_York',   // PA
    '612': 'America/Chicago',    // Minneapolis
    '614': 'America/New_York',   // Columbus
    '615': 'America/Chicago',    // Nashville
    '616': 'America/New_York',   // Grand Rapids
    '617': 'America/New_York',   // Boston
    '619': 'America/Los_Angeles', // San Diego
    '623': 'America/Phoenix',    // Phoenix
    '626': 'America/Los_Angeles', // Pasadena
    '630': 'America/Chicago',    // IL
    '631': 'America/New_York',   // Long Island
    '646': 'America/New_York',   // NYC
    '650': 'America/Los_Angeles', // CA
    '651': 'America/Chicago',    // St. Paul
    '657': 'America/Los_Angeles', // CA
    '660': 'America/Chicago',    // MO
    '678': 'America/New_York',   // Atlanta
    '702': 'America/Los_Angeles', // Las Vegas
    '703': 'America/New_York',   // VA
    '704': 'America/New_York',   // Charlotte
    '706': 'America/New_York',   // GA
    '708': 'America/Chicago',    // IL
    '713': 'America/Chicago',    // Houston
    '714': 'America/Los_Angeles', // Orange County
    '718': 'America/New_York',   // NYC
    '720': 'America/Denver',     // Denver
    '725': 'America/Los_Angeles', // Las Vegas
    '727': 'America/New_York',   // FL
    '732': 'America/New_York',   // NJ
    '737': 'America/Chicago',    // Austin
    '740': 'America/New_York',   // OH
    '747': 'America/Los_Angeles', // LA
    '754': 'America/New_York',   // FL
    '757': 'America/New_York',   // VA
    '760': 'America/Los_Angeles', // CA
    '763': 'America/Chicago',    // MN
    '770': 'America/New_York',   // GA
    '773': 'America/Chicago',    // Chicago
    '786': 'America/New_York',   // Miami
    '801': 'America/Denver',     // Salt Lake City
    '802': 'America/New_York',   // VT
    '803': 'America/New_York',   // SC
    '804': 'America/New_York',   // Richmond
    '805': 'America/Los_Angeles', // CA
    '808': 'Pacific/Honolulu',   // Hawaii
    '810': 'America/New_York',   // MI
    '813': 'America/New_York',   // Tampa
    '814': 'America/New_York',   // PA
    '815': 'America/Chicago',    // IL
    '816': 'America/Chicago',    // Kansas City
    '818': 'America/Los_Angeles', // LA
    '828': 'America/New_York',   // NC
    '830': 'America/Chicago',    // TX
    '831': 'America/Los_Angeles', // CA
    '832': 'America/Chicago',    // Houston
    '843': 'America/New_York',   // SC
    '845': 'America/New_York',   // NY
    '847': 'America/Chicago',    // IL
    '848': 'America/New_York',   // NJ
    '856': 'America/New_York',   // NJ
    '857': 'America/New_York',   // Boston
    '858': 'America/Los_Angeles', // San Diego
    '860': 'America/New_York',   // CT
    '862': 'America/New_York',   // NJ
    '901': 'America/Chicago',    // Memphis
    '903': 'America/Chicago',    // TX
    '904': 'America/New_York',   // Jacksonville
    '907': 'America/Anchorage',  // Alaska
    '908': 'America/New_York',   // NJ
    '909': 'America/Los_Angeles', // CA
    '910': 'America/New_York',   // NC
    '912': 'America/New_York',   // GA
    '913': 'America/Chicago',    // Kansas City KS
    '914': 'America/New_York',   // Westchester
    '915': 'America/Denver',     // El Paso
    '916': 'America/Los_Angeles', // Sacramento
    '917': 'America/New_York',   // NYC
    '918': 'America/Chicago',    // Tulsa
    '919': 'America/New_York',   // Raleigh
    '920': 'America/Chicago',    // WI
    '925': 'America/Los_Angeles', // CA
    '929': 'America/New_York',   // NYC
    '936': 'America/Chicago',    // TX
    '940': 'America/Chicago',    // TX
    '941': 'America/New_York',   // FL
    '949': 'America/Los_Angeles', // Irvine
    '951': 'America/Los_Angeles', // CA
    '952': 'America/Chicago',    // MN
    '954': 'America/New_York',   // FL
    '956': 'America/Chicago',    // TX
    '971': 'America/Los_Angeles', // Portland
    '972': 'America/Chicago',    // Dallas
    '973': 'America/New_York',   // NJ
    '978': 'America/New_York',   // MA
    '979': 'America/Chicago',    // TX
    '980': 'America/New_York',   // Charlotte
};

/**
 * Get IANA timezone for a US phone number based on area code.
 * Falls back to America/New_York if area code is not mapped.
 */
export function getUSTimezone(phoneNumber: string): string {
    const normalized = phoneNumber.replace(/[\s\-()]/g, '');
    // E.164 US number: +1XXXXXXXXXX — area code is digits 3-5 (0-indexed: chars at index 2,3,4)
    if (normalized.startsWith('+1') && normalized.length >= 5) {
        const areaCode = normalized.substring(2, 5);
        return US_TIMEZONE_MAP[areaCode] || 'America/New_York';
    }
    return 'America/New_York';
}

/**
 * Get IANA timezone for a phone number, considering country-specific
 * timezone variations (e.g., US area codes).
 */
export function getTimezoneForPhone(phoneNumber: string, country?: CallingCountry): string {
    const resolvedCountry = country || detectCountryFromPhone(phoneNumber);
    if (resolvedCountry === 'US') {
        return getUSTimezone(phoneNumber);
    }
    return COUNTRY_TIMEZONES[resolvedCountry];
}

// =============================================
// Call Frequency Limit (France: max 4/month)
// =============================================

export interface CallFrequencyResult {
    allowed: boolean;
    callsMade: number;
    maxAllowed: number;
}

/**
 * Check if a phone number has exceeded the monthly call frequency limit.
 * Currently only France enforces a limit (4 calls/month per number).
 *
 * @param phoneNumber - E.164 phone number
 * @param tenantId - Tenant ID for Firestore query
 * @param db - Firestore instance
 * @returns Whether the call is allowed, how many calls were made, and the limit
 */
export async function checkCallFrequencyLimit(
    phoneNumber: string,
    tenantId: string,
    db: FirebaseFirestore.Firestore,
): Promise<CallFrequencyResult> {
    const country = detectCountryFromPhone(phoneNumber);
    const rules = CALLING_HOURS[country];

    // Only check frequency if the country has a maxCallsPerMonth limit
    if (!rules.maxCallsPerMonth) {
        return { allowed: true, callsMade: 0, maxAllowed: Infinity };
    }

    // Query outbound calls to this number this month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const callsSnap = await db
        .collection('tenants').doc(tenantId)
        .collection('calls')
        .where('to', '==', phoneNumber)
        .where('direction', '==', 'outbound')
        .where('startedAt', '>=', firstOfMonth)
        .get();

    const callsMade = callsSnap.size;
    const maxAllowed = rules.maxCallsPerMonth;

    return {
        allowed: callsMade < maxAllowed,
        callsMade,
        maxAllowed,
    };
}

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
