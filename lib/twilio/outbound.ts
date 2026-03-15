/**
 * Twilio Outbound Calling
 *
 * Creates outbound calls via Twilio REST API.
 * Uses raw HTTP requests (same pattern as lib/phone/twilio-native.ts).
 */

// =============================================
// Types
// =============================================

export interface OutboundCallParams {
    accountSid: string;
    authToken: string;
    to: string;
    from: string;
    webhookUrl: string;
    statusCallback?: string;
    machineDetection?: 'Enable' | 'DetectMessageEnd';
}

export interface OutboundCallResult {
    sid: string;
    status: string;
    direction: string;
    from: string;
    to: string;
    dateCreated: string;
}

// =============================================
// Outbound Greetings (4 languages)
// =============================================

/**
 * Outbound call greeting templates.
 * Use {agentName} and {companyName} placeholders.
 */
export const OUTBOUND_GREETINGS: Record<'tr' | 'en' | 'de' | 'fr', string> = {
    tr: 'Merhaba, ben {companyName} şirketinden {agentName}. Size ulaşmak istedik.',
    en: 'Hello, this is {agentName} from {companyName}. We wanted to reach out to you.',
    de: 'Hallo, hier ist {agentName} von {companyName}. Wir wollten Sie erreichen.',
    fr: 'Bonjour, ici {agentName} de {companyName}. Nous souhaitions vous contacter.',
};

/**
 * Build a personalized outbound greeting from template.
 */
export function buildOutboundGreeting(
    language: 'tr' | 'en' | 'de' | 'fr',
    agentName: string,
    companyName: string,
): string {
    return OUTBOUND_GREETINGS[language]
        .replace('{agentName}', agentName || (language === 'de' ? 'der Assistent' : language === 'fr' ? "l'assistant" : language === 'en' ? 'the assistant' : 'asistan'))
        .replace('{companyName}', companyName || (language === 'de' ? 'unserem Unternehmen' : language === 'fr' ? 'notre entreprise' : language === 'en' ? 'our company' : 'şirketimiz'));
}

// =============================================
// Twilio HTTP Helpers
// =============================================

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function basicAuth(sid: string, token: string): string {
    return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

// =============================================
// Create Outbound Call
// =============================================

/**
 * Create an outbound call via Twilio REST API.
 *
 * POST /2010-04-01/Accounts/{AccountSid}/Calls.json
 *
 * @returns Twilio Call resource (sid, status, etc.)
 */
export async function createOutboundCall(params: OutboundCallParams): Promise<OutboundCallResult> {
    const { accountSid, authToken, to, from, webhookUrl, statusCallback, machineDetection } = params;

    const url = `${TWILIO_API_BASE}/Accounts/${accountSid}/Calls.json`;

    const body: Record<string, string> = {
        To: to,
        From: from,
        Url: webhookUrl,
        Method: 'POST',
    };

    if (statusCallback) {
        body.StatusCallback = statusCallback;
        body.StatusCallbackMethod = 'POST';
    }

    if (machineDetection) {
        body.MachineDetection = machineDetection;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': basicAuth(accountSid, authToken),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body).toString(),
        signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Twilio outbound call failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
        sid: data.sid,
        status: data.status,
        direction: data.direction,
        from: data.from,
        to: data.to,
        dateCreated: data.date_created,
    };
}
