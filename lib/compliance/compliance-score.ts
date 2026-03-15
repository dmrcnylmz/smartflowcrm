/**
 * Compliance Scoring Engine
 *
 * Calculates a 0-100 compliance score for outbound calling contacts.
 * Used by Campaign Manager to determine which contacts can be called,
 * scheduled, or are blocked.
 *
 * Levels:
 * - green  (90-100): All checks pass, call immediately
 * - yellow (50-89):  Partial pass, can be scheduled
 * - red    (0-49):   Blocked, cannot call
 */

// =============================================
// Types
// =============================================

export type ComplianceLevel = 'green' | 'yellow' | 'red';

export interface ComplianceScoreResult {
    score: number;           // 0-100
    level: ComplianceLevel;  // green (90-100), yellow (50-89), red (0-49)
    consentValid: boolean;
    callingHoursValid: boolean;
    callingHoursSchedulable: boolean; // true if outside hours but can be scheduled
    nextAllowedTime?: string; // ISO date for scheduling
    country: string;
    reasons: string[];       // human-readable reasons
    actionable: 'call_now' | 'schedule' | 'blocked';
}

export interface CampaignContact {
    phoneNumber: string;
    name?: string;
    context?: string;
    complianceScore?: ComplianceScoreResult;
}

export interface CampaignSummary {
    totalContacts: number;
    greenCount: number;     // can call now
    yellowCount: number;    // can schedule
    redCount: number;       // blocked
    overallScore: number;   // average
    overallLevel: ComplianceLevel;
}

// =============================================
// Score Calculation
// =============================================

/**
 * Calculate compliance score based on consent and calling hours status.
 *
 * Scoring logic:
 * - Consent valid + hours valid = 100 (green, call_now)
 * - Consent valid + hours invalid but schedulable = 70 (yellow, schedule)
 * - Consent invalid = 0 (red, blocked)
 */
export function calculateComplianceScore(
    consentValid: boolean,
    callingHoursValid: boolean,
    callingHoursSchedulable: boolean,
): ComplianceScoreResult {
    const reasons: string[] = [];
    let score: number;
    let actionable: ComplianceScoreResult['actionable'];

    if (!consentValid) {
        // No consent = hard block
        score = 0;
        actionable = 'blocked';
        reasons.push('noConsent');
    } else if (callingHoursValid) {
        // Consent + within hours = green
        score = 100;
        actionable = 'call_now';
    } else if (callingHoursSchedulable) {
        // Consent + outside hours but schedulable = yellow
        score = 70;
        actionable = 'schedule';
        reasons.push('outsideHours');
    } else {
        // Consent but cannot schedule (shouldn't normally happen)
        score = 30;
        actionable = 'blocked';
        reasons.push('outsideHours');
    }

    const level = getLevel(score);

    return {
        score,
        level,
        consentValid,
        callingHoursValid,
        callingHoursSchedulable,
        country: '',
        reasons,
        actionable,
    };
}

// =============================================
// Campaign Summary
// =============================================

/**
 * Calculate aggregate compliance summary for a campaign's contacts.
 */
export function calculateCampaignSummary(contacts: CampaignContact[]): CampaignSummary {
    if (contacts.length === 0) {
        return {
            totalContacts: 0,
            greenCount: 0,
            yellowCount: 0,
            redCount: 0,
            overallScore: 0,
            overallLevel: 'red',
        };
    }

    let greenCount = 0;
    let yellowCount = 0;
    let redCount = 0;
    let totalScore = 0;

    for (const contact of contacts) {
        const score = contact.complianceScore;
        if (!score) {
            redCount++;
            continue;
        }

        totalScore += score.score;

        switch (score.level) {
            case 'green':
                greenCount++;
                break;
            case 'yellow':
                yellowCount++;
                break;
            case 'red':
                redCount++;
                break;
        }
    }

    const overallScore = Math.round(totalScore / contacts.length);

    return {
        totalContacts: contacts.length,
        greenCount,
        yellowCount,
        redCount,
        overallScore,
        overallLevel: getLevel(overallScore),
    };
}

// =============================================
// UI Helpers
// =============================================

/**
 * Get Tailwind color class for a compliance level.
 */
export function getComplianceLevelColor(level: ComplianceLevel): string {
    switch (level) {
        case 'green':
            return 'green-500';
        case 'yellow':
            return 'yellow-500';
        case 'red':
            return 'red-500';
    }
}

/**
 * Get icon name for a compliance level.
 */
export function getComplianceLevelIcon(level: ComplianceLevel): string {
    switch (level) {
        case 'green':
            return 'CheckCircle';
        case 'yellow':
            return 'Clock';
        case 'red':
            return 'XCircle';
    }
}

// =============================================
// Internal Helpers
// =============================================

function getLevel(score: number): ComplianceLevel {
    if (score >= 90) return 'green';
    if (score >= 50) return 'yellow';
    return 'red';
}
