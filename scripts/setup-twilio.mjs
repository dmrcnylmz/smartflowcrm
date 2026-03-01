#!/usr/bin/env node

/**
 * SmartFlow CRM - Twilio Setup Script
 *
 * This script helps configure Twilio for SmartFlow:
 * 1. Lists available phone numbers
 * 2. Purchases a phone number (or uses existing)
 * 3. Configures webhook URLs on the number
 * 4. Registers the number in Firestore for tenant routing
 *
 * Prerequisites:
 * - TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env.local
 * - npm install twilio (as dev dependency)
 *
 * Usage:
 *   node scripts/setup-twilio.mjs                    # Interactive setup
 *   node scripts/setup-twilio.mjs --list-numbers     # List available TR numbers
 *   node scripts/setup-twilio.mjs --configure +905XXXXXXXXX https://yourdomain.com
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com';

if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.error('❌ TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in .env.local');
    console.log('\nSteps:');
    console.log('1. Go to https://www.twilio.com/console');
    console.log('2. Copy your Account SID and Auth Token');
    console.log('3. Add them to .env.local:');
    console.log('   TWILIO_ACCOUNT_SID=ACxxxxxxxxxx');
    console.log('   TWILIO_AUTH_TOKEN=your_auth_token');
    process.exit(1);
}

const args = process.argv.slice(2);

// =============================================
// Main
// =============================================

async function main() {
    console.log('🔧 SmartFlow CRM - Twilio Setup\n');
    console.log(`   Account SID: ${ACCOUNT_SID.substring(0, 6)}...${ACCOUNT_SID.substring(ACCOUNT_SID.length - 4)}`);
    console.log(`   App URL: ${APP_URL}\n`);

    if (args.includes('--list-numbers')) {
        await listAvailableNumbers();
    } else if (args.includes('--configure')) {
        const phoneIdx = args.indexOf('--configure');
        const phoneNumber = args[phoneIdx + 1];
        const baseUrl = args[phoneIdx + 2] || APP_URL;

        if (!phoneNumber) {
            console.error('Usage: --configure +905XXXXXXXXX [https://yourdomain.com]');
            process.exit(1);
        }

        await configureNumber(phoneNumber, baseUrl);
    } else if (args.includes('--list-owned')) {
        await listOwnedNumbers();
    } else {
        printUsage();
    }
}

// =============================================
// List available phone numbers for purchase
// =============================================

async function listAvailableNumbers() {
    console.log('📞 Searching for available Turkish phone numbers...\n');

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/AvailablePhoneNumbers/TR/Local.json?VoiceEnabled=true&PageSize=10`;

        const response = await fetch(url, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
            },
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('❌ Twilio API error:', response.status, error);

            if (response.status === 404) {
                console.log('\n💡 Turkish numbers may not be available in your Twilio account.');
                console.log('   Try US numbers: Change "TR" to "US" in the script');
                console.log('   Or purchase directly from: https://www.twilio.com/console/phone-numbers/search');
            }
            return;
        }

        const data = await response.json();

        if (data.available_phone_numbers?.length === 0) {
            console.log('No Turkish numbers available. Try the Twilio console for more options.');
            return;
        }

        console.log('Available numbers:\n');
        data.available_phone_numbers?.forEach((num, i) => {
            console.log(`  ${i + 1}. ${num.phone_number} (${num.friendly_name})`);
            console.log(`     Region: ${num.region || 'N/A'}, Capabilities: Voice=${num.capabilities?.voice}`);
        });

        console.log('\n💡 To purchase and configure a number:');
        console.log('   1. Buy from Twilio Console: https://www.twilio.com/console/phone-numbers/search');
        console.log(`   2. Run: node scripts/setup-twilio.mjs --configure +905XXXXXXXXX ${APP_URL}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// =============================================
// List already owned numbers
// =============================================

async function listOwnedNumbers() {
    console.log('📞 Your Twilio phone numbers:\n');

    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers.json?PageSize=20`;

        const response = await fetch(url, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
            },
        });

        if (!response.ok) {
            console.error('❌ Twilio API error:', response.status);
            return;
        }

        const data = await response.json();

        if (data.incoming_phone_numbers?.length === 0) {
            console.log('No phone numbers found on your account.');
            console.log('Purchase one at: https://www.twilio.com/console/phone-numbers/search');
            return;
        }

        data.incoming_phone_numbers?.forEach((num, i) => {
            console.log(`  ${i + 1}. ${num.phone_number} (${num.friendly_name})`);
            console.log(`     SID: ${num.sid}`);
            console.log(`     Voice URL: ${num.voice_url || '(not configured)'}`);
            console.log(`     Status Callback: ${num.status_callback || '(not configured)'}`);
            console.log('');
        });

        console.log(`\n💡 To configure webhooks on a number:`);
        console.log(`   node scripts/setup-twilio.mjs --configure +905XXXXXXXXX ${APP_URL}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// =============================================
// Configure webhooks on a phone number
// =============================================

async function configureNumber(phoneNumber, baseUrl) {
    console.log(`⚙️  Configuring ${phoneNumber} with SmartFlow webhooks...\n`);

    const voiceUrl = `${baseUrl}/api/twilio/incoming`;
    const statusCallback = `${baseUrl}/api/twilio/status`;

    console.log(`   Voice URL:        ${voiceUrl}`);
    console.log(`   Status Callback:  ${statusCallback}`);
    console.log('');

    try {
        // First, find the phone number SID
        const normalized = phoneNumber.replace(/[\s\-()]/g, '');
        const listUrl = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalized)}`;

        const listResponse = await fetch(listUrl, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
            },
        });

        const listData = await listResponse.json();

        if (!listData.incoming_phone_numbers?.length) {
            console.error(`❌ Phone number ${normalized} not found in your Twilio account.`);
            console.log('   Make sure you own this number. Check: https://www.twilio.com/console/phone-numbers');
            return;
        }

        const numberSid = listData.incoming_phone_numbers[0].sid;
        console.log(`   Number SID: ${numberSid}`);

        // Update the phone number with webhook URLs
        const updateUrl = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers/${numberSid}.json`;

        const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                VoiceUrl: voiceUrl,
                VoiceMethod: 'POST',
                StatusCallback: statusCallback,
                StatusCallbackMethod: 'POST',
            }).toString(),
        });

        if (!updateResponse.ok) {
            const error = await updateResponse.text();
            console.error('❌ Failed to update number:', error);
            return;
        }

        console.log('\n✅ Twilio webhooks configured successfully!\n');
        console.log('📋 Next steps:');
        console.log('   1. Register this number in SmartFlow for your tenant:');
        console.log(`      curl -X POST ${baseUrl}/api/twilio/phone-numbers \\`);
        console.log(`        -H "Authorization: Bearer YOUR_TOKEN" \\`);
        console.log(`        -H "Content-Type: application/json" \\`);
        console.log(`        -d '{"phoneNumber": "${normalized}"}'`);
        console.log('');
        console.log('   2. Or register via the Admin Panel in SmartFlow UI');
        console.log('');
        console.log('   3. Test by calling the number!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// =============================================
// Usage
// =============================================

function printUsage() {
    console.log('Usage:\n');
    console.log('  node scripts/setup-twilio.mjs --list-numbers    List available TR phone numbers');
    console.log('  node scripts/setup-twilio.mjs --list-owned      List your owned phone numbers');
    console.log('  node scripts/setup-twilio.mjs --configure +905XXXXXXXXX https://yourdomain.com');
    console.log('                                                   Configure webhooks on a number');
    console.log('\nEnvironment variables needed:');
    console.log('  TWILIO_ACCOUNT_SID    Your Twilio Account SID');
    console.log('  TWILIO_AUTH_TOKEN     Your Twilio Auth Token');
    console.log('  NEXT_PUBLIC_APP_URL   Your SmartFlow deployment URL');
    console.log('\nTwilio Console: https://www.twilio.com/console');
}

main().catch(console.error);
