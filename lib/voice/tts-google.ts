/**
 * Google Cloud TTS Provider — Service Account Auth
 *
 * ElevenLabs'ın ilk fallback'i. OpenAI TTS'den (~4232ms) çok daha hızlı (~200ms).
 *
 * Auth: Service Account JSON → JWT → OAuth2 Access Token (1 saat cache)
 * Voices: tr-TR-Wavenet-D (Türkçe kadın), en-US-Neural2-F (İngilizce kadın)
 * Free Tier: 1M char/ay (Wavenet), 4M char/ay (Standard)
 *
 * Credential Loading (Firebase Admin pattern):
 *   1. GOOGLE_TTS_SERVICE_ACCOUNT_KEY env var (inline JSON or base64)
 *   2. GOOGLE_TTS_SERVICE_ACCOUNT_KEY_PATH env var (file path)
 *   3. null → skip Google TTS entirely
 */

import jwt from 'jsonwebtoken';
import { googleTtsCircuitBreaker, CircuitOpenError } from '@/lib/voice/circuit-breaker';

// =============================================
// Types
// =============================================

interface ServiceAccountKey {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
}

// =============================================
// Configuration
// =============================================

const GOOGLE_TTS_API_V1 = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GOOGLE_TTS_API_V1BETA1 = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';

/** Chirp 3: HD voices use v1beta1 endpoint */
function isChirp3HDVoice(voiceName?: string): boolean {
    return !!voiceName && voiceName.includes('Chirp3-HD');
}
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TTS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

// Token cache: refresh 5 min before expiry (55 min lifetime)
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Voice selection — language-aware
const GOOGLE_VOICES = {
    tr: { languageCode: 'tr-TR', name: 'tr-TR-Wavenet-D', ssmlGender: 'FEMALE' as const },
    en: { languageCode: 'en-US', name: 'en-US-Neural2-F', ssmlGender: 'FEMALE' as const },
} as const;

// =============================================
// Credential Loading (Firebase Admin pattern)
// =============================================

let _cachedKey: ServiceAccountKey | null | undefined = undefined; // undefined = not loaded yet

function getServiceAccountKey(): ServiceAccountKey | null {
    // Return cached result (null means "tried and failed")
    if (_cachedKey !== undefined) return _cachedKey;

    // Option 1: Inline JSON from env var (for Vercel/cloud deployments)
    const keyEnv = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_KEY;
    if (keyEnv) {
        try {
            const jsonString = keyEnv.trim().startsWith('{')
                ? keyEnv
                : Buffer.from(keyEnv, 'base64').toString('utf-8');

            const parsed = JSON.parse(jsonString) as ServiceAccountKey;

            // Fix escaped newlines in private key (common Vercel issue)
            if (parsed.private_key) {
                parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
            }

            _cachedKey = parsed;
            return _cachedKey;
        } catch (err) {
            console.error('[TTS:Google] Failed to parse GOOGLE_TTS_SERVICE_ACCOUNT_KEY:', err);
        }
    }

    // Option 2: File path (local dev)
    const keyPath = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_KEY_PATH;
    if (keyPath) {
        try {
            const fs = require('fs');
            const path = require('path');
            const absolutePath = path.resolve(process.cwd(), keyPath);
            const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as ServiceAccountKey;

            if (parsed.private_key) {
                parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
            }

            _cachedKey = parsed;
            return _cachedKey;
        } catch (err) {
            console.error('[TTS:Google] Failed to read service account key file:', err);
        }
    }

    // No credentials found
    _cachedKey = null;
    return null;
}

// Export for use in GET status endpoint
export { getServiceAccountKey };

// =============================================
// OAuth2 Access Token (JWT → Token Exchange)
// =============================================

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
    // Return cached token if still valid
    if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
        return _cachedToken.token;
    }

    const key = getServiceAccountKey();
    if (!key) return null;

    try {
        // Create JWT assertion
        const now = Math.floor(Date.now() / 1000);
        const payload = {
            iss: key.client_email,
            scope: TTS_SCOPE,
            aud: GOOGLE_TOKEN_URL,
            iat: now,
            exp: now + 3600, // 1 hour
        };

        const assertion = jwt.sign(payload, key.private_key, { algorithm: 'RS256' });

        // Exchange JWT for access token
        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }),
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            const err = await response.text().catch(() => '');
            throw new Error(`Google OAuth2 token exchange failed ${response.status}: ${err}`);
        }

        const data = await response.json();
        const accessToken = data.access_token;
        const expiresIn = data.expires_in || 3600; // seconds

        // Cache with 5 min margin
        _cachedToken = {
            token: accessToken,
            expiresAt: Date.now() + (expiresIn * 1000) - TOKEN_REFRESH_MARGIN_MS,
        };

        return accessToken;
    } catch (err) {
        console.error('[TTS:Google] Failed to get access token:', err);
        return null;
    }
}

// =============================================
// Synthesize Function
// =============================================

/**
 * Synthesize text using Google Cloud TTS with Service Account auth.
 * Returns a Response with audio/mpeg body, or null on failure.
 */
export async function synthesizeGoogleTTS(
    text: string,
    lang: 'tr' | 'en',
    voiceName?: string,
): Promise<Response | null> {
    // Fast-fail: no credentials
    const key = getServiceAccountKey();
    if (!key) return null;

    // Fast-fail if circuit breaker is open
    if (googleTtsCircuitBreaker.isOpen()) {
        console.warn('[TTS:Google] Circuit breaker OPEN — skipping');
        return null;
    }

    // Get access token (cached, auto-refreshes)
    const accessToken = await getAccessToken();
    if (!accessToken) return null;

    const isChirp3HD = isChirp3HDVoice(voiceName);
    const apiUrl = isChirp3HD ? GOOGLE_TTS_API_V1BETA1 : GOOGLE_TTS_API_V1;

    const voice = voiceName
        ? { languageCode: voiceName.substring(0, 5), name: voiceName, ssmlGender: 'NEUTRAL' as const }
        : GOOGLE_VOICES[lang];

    try {
        const response = await googleTtsCircuitBreaker.execute(async () => {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: { text },
                    voice: {
                        languageCode: voice.languageCode,
                        name: voice.name,
                        ssmlGender: voice.ssmlGender,
                    },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: 1.0,
                        pitch: 0.0,
                        effectsProfileId: ['telephony-class-application'],
                    },
                }),
                signal: AbortSignal.timeout(8000),
            });

            if (!res.ok) {
                const err = await res.text().catch(() => '');

                // If 401/403, invalidate token cache so next call refreshes
                if (res.status === 401 || res.status === 403) {
                    _cachedToken = null;
                }

                throw new Error(`Google TTS ${res.status}: ${err}`);
            }

            return res;
        });

        // Google Cloud TTS returns JSON with base64-encoded audioContent
        const data = await response.json();
        const audioContent = data.audioContent;

        if (!audioContent) {
            throw new Error('Google TTS: No audioContent in response');
        }

        // Decode base64 to binary
        const audioBuffer = Buffer.from(audioContent, 'base64');

        // Create a proper Response with audio body
        return new Response(audioBuffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': String(audioBuffer.length),
            },
        });
    } catch (err) {
        if (err instanceof CircuitOpenError) {
            console.warn('[TTS:Google] Circuit breaker OPEN — skipping');
        } else {
            console.error('[TTS:Google] Request failed:', err);
        }
        return null;
    }
}
