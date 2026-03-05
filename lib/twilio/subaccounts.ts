/**
 * Twilio Multi-Tenant Subaccount Management
 *
 * Each tenant gets their own Twilio subaccount for:
 * - Isolated billing & usage tracking
 * - Per-tenant phone numbers
 * - Independent call logs & recordings
 * - Secure credential isolation
 *
 * Uses Twilio REST API directly (no SDK dependency).
 *
 * Required env:
 *   TWILIO_ACCOUNT_SID  — Master account SID
 *   TWILIO_AUTH_TOKEN    — Master account auth token
 */

// --- Types ---

export interface SubaccountResult {
    sid: string;
    authToken: string;
    friendlyName: string;
    status: string;
    dateCreated: string;
}

export interface PhoneNumberResult {
    sid: string;
    phoneNumber: string;
    friendlyName: string;
    country: string;
}

export interface TenantTwilioSetup {
    subaccount: SubaccountResult;
    phoneNumber?: PhoneNumberResult;
    webhookConfigured: boolean;
}

// --- Constants ---

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

// --- Helpers ---

function getMasterCredentials(): { accountSid: string; authToken: string } {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        throw new Error(
            'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in environment variables'
        );
    }

    return { accountSid, authToken };
}

function basicAuth(sid: string, token: string): string {
    return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

async function twilioRequest<T>(
    url: string,
    options: {
        method?: string;
        body?: Record<string, string>;
        accountSid?: string;
        authToken?: string;
    } = {},
): Promise<T> {
    const master = getMasterCredentials();
    const sid = options.accountSid || master.accountSid;
    const token = options.authToken || master.authToken;

    const fetchOptions: RequestInit = {
        method: options.method || 'GET',
        headers: {
            'Authorization': basicAuth(sid, token),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(15000),
    };

    if (options.body) {
        fetchOptions.body = new URLSearchParams(options.body).toString();
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Twilio API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
}

// --- Core Functions ---

/**
 * Create a Twilio subaccount for a tenant.
 *
 * @param tenantName - Friendly name for the subaccount (e.g., company name)
 * @returns SubaccountResult with sid and authToken
 */
export async function createTenantSubaccount(
    tenantName: string,
): Promise<SubaccountResult> {
    const master = getMasterCredentials();

    const friendlyName = `Callception - ${tenantName}`.slice(0, 64);

    const data = await twilioRequest<{
        sid: string;
        auth_token: string;
        friendly_name: string;
        status: string;
        date_created: string;
    }>(`${TWILIO_API_BASE}/Accounts.json`, {
        method: 'POST',
        body: { FriendlyName: friendlyName },
        accountSid: master.accountSid,
        authToken: master.authToken,
    });

    return {
        sid: data.sid,
        authToken: data.auth_token,
        friendlyName: data.friendly_name,
        status: data.status,
        dateCreated: data.date_created,
    };
}

/**
 * Search available phone numbers in a given country.
 *
 * @param country - ISO country code (e.g., 'TR', 'US')
 * @param options - Search filters
 * @returns List of available numbers
 */
export async function searchAvailableNumbers(
    country: string,
    options: {
        type?: 'Local' | 'Mobile' | 'TollFree';
        contains?: string;
        limit?: number;
        subaccountSid?: string;
        subaccountToken?: string;
    } = {},
): Promise<Array<{ phoneNumber: string; friendlyName: string; locality: string }>> {
    const numberType = options.type || 'Local';
    const limit = options.limit || 5;

    const sid = options.subaccountSid || getMasterCredentials().accountSid;
    const token = options.subaccountToken || getMasterCredentials().authToken;

    let url = `${TWILIO_API_BASE}/Accounts/${sid}/AvailablePhoneNumbers/${country}/${numberType}.json?PageSize=${limit}`;

    if (options.contains) {
        url += `&Contains=${encodeURIComponent(options.contains)}`;
    }

    const data = await twilioRequest<{
        available_phone_numbers: Array<{
            phone_number: string;
            friendly_name: string;
            locality: string;
        }>;
    }>(url, { accountSid: sid, authToken: token });

    return data.available_phone_numbers.map(n => ({
        phoneNumber: n.phone_number,
        friendlyName: n.friendly_name,
        locality: n.locality,
    }));
}

/**
 * Purchase a phone number for a tenant's subaccount.
 *
 * @param subaccountSid - The tenant's subaccount SID
 * @param subaccountToken - The tenant's subaccount auth token
 * @param phoneNumber - E.164 number to purchase
 * @param webhookBaseUrl - Base URL for webhook configuration
 * @returns Purchased number details
 */
export async function purchasePhoneNumber(
    subaccountSid: string,
    subaccountToken: string,
    phoneNumber: string,
    webhookBaseUrl: string,
): Promise<PhoneNumberResult> {
    const data = await twilioRequest<{
        sid: string;
        phone_number: string;
        friendly_name: string;
        // Twilio returns ISO country code in the response
        [key: string]: unknown;
    }>(`${TWILIO_API_BASE}/Accounts/${subaccountSid}/IncomingPhoneNumbers.json`, {
        method: 'POST',
        body: {
            PhoneNumber: phoneNumber,
            VoiceUrl: `${webhookBaseUrl}/api/twilio/incoming`,
            VoiceMethod: 'POST',
            StatusCallback: `${webhookBaseUrl}/api/twilio/status`,
            StatusCallbackMethod: 'POST',
        },
        accountSid: subaccountSid,
        authToken: subaccountToken,
    });

    return {
        sid: data.sid,
        phoneNumber: data.phone_number,
        friendlyName: data.friendly_name,
        country: (data.iso_country as string) || '',
    };
}

/**
 * Configure webhooks for an existing phone number on a subaccount.
 */
export async function configurePhoneWebhooks(
    subaccountSid: string,
    subaccountToken: string,
    phoneNumberSid: string,
    webhookBaseUrl: string,
): Promise<void> {
    await twilioRequest(
        `${TWILIO_API_BASE}/Accounts/${subaccountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`,
        {
            method: 'POST',
            body: {
                VoiceUrl: `${webhookBaseUrl}/api/twilio/incoming`,
                VoiceMethod: 'POST',
                StatusCallback: `${webhookBaseUrl}/api/twilio/status`,
                StatusCallbackMethod: 'POST',
            },
            accountSid: subaccountSid,
            authToken: subaccountToken,
        },
    );
}

/**
 * Suspend or reactivate a tenant's subaccount.
 * Use 'suspended' to pause, 'active' to reactivate.
 */
export async function updateSubaccountStatus(
    subaccountSid: string,
    status: 'active' | 'suspended' | 'closed',
): Promise<void> {
    const master = getMasterCredentials();

    await twilioRequest(
        `${TWILIO_API_BASE}/Accounts/${subaccountSid}.json`,
        {
            method: 'POST',
            body: { Status: status },
            accountSid: master.accountSid,
            authToken: master.authToken,
        },
    );
}

/**
 * Get subaccount usage for billing.
 * Returns total call minutes and costs for the current month.
 */
export async function getSubaccountUsage(
    subaccountSid: string,
    subaccountToken: string,
): Promise<{
    callMinutes: number;
    totalCost: number;
    currency: string;
}> {
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const data = await twilioRequest<{
        usage_records: Array<{
            category: string;
            usage: string;
            price: string;
            price_unit: string;
        }>;
    }>(
        `${TWILIO_API_BASE}/Accounts/${subaccountSid}/Usage/Records.json?StartDate=${startDate}&Category=calls`,
        {
            accountSid: subaccountSid,
            authToken: subaccountToken,
        },
    );

    const callRecord = data.usage_records?.find(r => r.category === 'calls');

    return {
        callMinutes: callRecord ? parseFloat(callRecord.usage) : 0,
        totalCost: callRecord ? parseFloat(callRecord.price) : 0,
        currency: callRecord?.price_unit || 'USD',
    };
}

/**
 * Full tenant Twilio setup flow:
 * 1. Create subaccount
 * 2. Optionally search & purchase a phone number
 * 3. Configure webhooks
 *
 * Returns all credentials and config needed for the tenant.
 */
export async function provisionTenantTwilio(
    tenantName: string,
    options: {
        phoneCountry?: string;
        phoneType?: 'Local' | 'Mobile' | 'TollFree';
        webhookBaseUrl: string;
        purchaseNumber?: boolean;
    },
): Promise<TenantTwilioSetup> {
    // Step 1: Create subaccount
    const subaccount = await createTenantSubaccount(tenantName);

    let phoneNumber: PhoneNumberResult | undefined;
    let webhookConfigured = false;

    // Step 2: Optionally purchase a phone number
    if (options.purchaseNumber && options.phoneCountry) {
        const available = await searchAvailableNumbers(
            options.phoneCountry,
            {
                type: options.phoneType,
                limit: 1,
                subaccountSid: subaccount.sid,
                subaccountToken: subaccount.authToken,
            },
        );

        if (available.length > 0) {
            phoneNumber = await purchasePhoneNumber(
                subaccount.sid,
                subaccount.authToken,
                available[0].phoneNumber,
                options.webhookBaseUrl,
            );
            webhookConfigured = true;
        }
    }

    return {
        subaccount,
        phoneNumber,
        webhookConfigured,
    };
}
