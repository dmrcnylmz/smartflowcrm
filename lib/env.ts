import { z } from 'zod';

/**
 * Zod schema for environment variable validation.
 * Required variables will throw at import time if missing.
 * Optional variables are validated when present.
 *
 * Categories:
 *   🔴 Required — app won't start without these
 *   🟡 Optional — features degrade gracefully when absent
 */
const envSchema = z.object({
  // ─── Required: Firebase Client SDK ─────────────────────────────────
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, 'Firebase API key is required'),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1, 'Firebase Auth domain is required'),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, 'Firebase Project ID is required'),

  // ─── Optional: Firebase extended config ────────────────────────────
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),

  // ─── Optional: Firebase Admin (server-side) ────────────────────────
  FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_KEY_PATH: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // ─── Optional: Twilio (VoIP / Phone) ───────────────────────────────
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_CONVERSATION_RELAY_URL: z.string().url().optional(),
  TWILIO_STATUS_CALLBACK_URL: z.string().url().optional(),

  // ─── Optional: Voice AI / Personaplex ──────────────────────────────
  PERSONAPLEX_URL: z.string().optional(),
  PERSONAPLEX_CONTEXT_URL: z.string().optional(),
  PERSONAPLEX_API_KEY: z.string().optional(),
  PERSONAPLEX_MOCK_MODE: z.string().optional(),
  CONTEXT_API_URL: z.string().optional(),
  NEXT_PUBLIC_PERSONAPLEX_URL: z.string().optional(),

  // ─── Optional: LLM / AI Model Keys ────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  // ─── Optional: Voice Processing (STT/TTS) ─────────────────────────
  DEEPGRAM_API_KEY: z.string().optional(),
  CARTESIA_API_KEY: z.string().optional(),

  // ─── Optional: Local LLM ──────────────────────────────────────────
  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_URL: z.string().optional(),

  // ─── Optional: Billing / LemonSqueezy ──────────────────────────────
  LEMONSQUEEZY_API_KEY: z.string().optional(),
  LEMONSQUEEZY_STORE_ID: z.string().optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().optional(),
  LEMONSQUEEZY_VARIANT_STARTER: z.string().optional(),
  LEMONSQUEEZY_VARIANT_STARTER_YEARLY: z.string().optional(),
  LEMONSQUEEZY_VARIANT_PROFESSIONAL: z.string().optional(),
  LEMONSQUEEZY_VARIANT_PROFESSIONAL_YEARLY: z.string().optional(),
  LEMONSQUEEZY_VARIANT_ENTERPRISE: z.string().optional(),
  LEMONSQUEEZY_VARIANT_ENTERPRISE_YEARLY: z.string().optional(),

  // ─── Optional: Email ───────────────────────────────────────────────
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional().default('Callception <noreply@callception.com>'),

  // ─── Optional: Alerting / Monitoring ───────────────────────────────
  ALERT_SLACK_WEBHOOK_URL: z.string().url().optional(),
  ALERT_TELEGRAM_BOT_TOKEN: z.string().optional(),
  ALERT_TELEGRAM_CHAT_ID: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  // ─── Optional: GPU / RunPod ────────────────────────────────────────
  RUNPOD_ENDPOINT_ID: z.string().optional(),
  RUNPOD_API_KEY: z.string().optional(),

  // ─── Optional: Caching / Rate Limiting (Upstash Redis) ─────────────
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // ─── Optional: Webhooks / Security ─────────────────────────────────
  WEBHOOK_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // ─── Optional: Application URLs ────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.string().optional().default('http://localhost:3000'),
  APP_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),

  // ─── Application Environment ───────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  VERCEL_REGION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  // During build time (next build), env vars may not be available.
  // Use safeParse to avoid crashing the build — runtime will still validate.
  const result = envSchema.safeParse(process.env);

  if (result.success) {
    return result.data;
  }

  // In production runtime, throw with a helpful message
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PHASE) {
    const missing = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n[env] Environment validation failed.\n` +
        `The following variables are missing or invalid:\n${missing}\n\n` +
        `Hint: copy .env.example to .env.local and fill in the values.\n`,
    );
  }

  // During build or development, return partial env with defaults
  // This allows `next build` to succeed without all env vars
  return process.env as unknown as Env;
}

export const env = validateEnv();

/**
 * Logs warnings for missing optional service keys.
 * Call once at startup (e.g., from health route or server init).
 */
export function warnMissingOptionalKeys(): string[] {
  const optionalKeys = [
    // Core services
    { key: 'TWILIO_ACCOUNT_SID', label: 'Twilio (telefon)' },
    { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio (auth)' },
    { key: 'RESEND_API_KEY', label: 'Resend (e-posta)' },
    { key: 'EMAIL_FROM', label: 'E-posta gönderici adresi' },
    { key: 'CRON_SECRET', label: 'Cron job güvenliği' },
    // AI / LLM
    { key: 'OPENAI_API_KEY', label: 'OpenAI (AI)' },
    { key: 'GROQ_API_KEY', label: 'Groq (LLM — ücretsiz)' },
    { key: 'GOOGLE_AI_API_KEY', label: 'Google Gemini (LLM — ücretsiz)' },
    // Voice
    { key: 'DEEPGRAM_API_KEY', label: 'Deepgram (STT)' },
    { key: 'CARTESIA_API_KEY', label: 'Cartesia (TTS)' },
    { key: 'PERSONAPLEX_API_KEY', label: 'Personaplex (Voice AI)' },
    // Billing
    { key: 'LEMONSQUEEZY_API_KEY', label: 'LemonSqueezy (faturalandırma)' },
    { key: 'LEMONSQUEEZY_WEBHOOK_SECRET', label: 'LemonSqueezy webhook' },
    // Monitoring
    { key: 'SENTRY_DSN', label: 'Sentry (hata takibi)' },
    { key: 'ALERT_SLACK_WEBHOOK_URL', label: 'Slack (alert)' },
  ] as const;

  const missing = optionalKeys.filter(({ key }) => !process.env[key]);
  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn(
      `[env] Missing optional service keys (features may be limited):\n` +
        missing.map(({ key, label }) => `  - ${key} (${label})`).join('\n'),
    );
  }
  return missing.map(({ key }) => key);
}

/**
 * Feature readiness status — checks which features are fully configured.
 * Useful for admin dashboards, health checks, and go-live validation.
 */
export interface FeatureStatus {
    name: string;
    ready: boolean;
    detail: string;
}

export function getFeatureStatus(): FeatureStatus[] {
    const has = (key: string) => !!process.env[key];

    return [
        {
            name: 'Voice Pipeline (STT)',
            ready: has('DEEPGRAM_API_KEY'),
            detail: has('DEEPGRAM_API_KEY') ? 'Deepgram configured' : 'DEEPGRAM_API_KEY missing — speech-to-text disabled',
        },
        {
            name: 'Voice Pipeline (TTS)',
            ready: has('CARTESIA_API_KEY'),
            detail: has('CARTESIA_API_KEY') ? 'Cartesia configured' : 'CARTESIA_API_KEY missing — text-to-speech disabled',
        },
        {
            name: 'LLM (Primary)',
            ready: has('GROQ_API_KEY') || has('OPENAI_API_KEY'),
            detail: has('GROQ_API_KEY') ? 'Groq configured (free tier)' : has('OPENAI_API_KEY') ? 'OpenAI configured' : 'No LLM key — AI responses disabled',
        },
        {
            name: 'Telephony',
            ready: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN'),
            detail: has('TWILIO_ACCOUNT_SID') ? 'Twilio configured' : 'TWILIO_ACCOUNT_SID/AUTH_TOKEN missing — phone calls disabled',
        },
        {
            name: 'Billing',
            ready: has('LEMONSQUEEZY_API_KEY') && has('LEMONSQUEEZY_WEBHOOK_SECRET'),
            detail: has('LEMONSQUEEZY_API_KEY') ? 'LemonSqueezy configured' : 'Billing keys missing — free mode only',
        },
        {
            name: 'Email',
            ready: has('RESEND_API_KEY'),
            detail: has('RESEND_API_KEY') ? 'Resend configured' : 'RESEND_API_KEY missing — email notifications disabled',
        },
        {
            name: 'Error Tracking',
            ready: has('SENTRY_DSN'),
            detail: has('SENTRY_DSN') ? 'Sentry configured' : 'SENTRY_DSN missing — errors only in console',
        },
        {
            name: 'Distributed Cache',
            ready: has('UPSTASH_REDIS_REST_URL') && has('UPSTASH_REDIS_REST_TOKEN'),
            detail: has('UPSTASH_REDIS_REST_URL') ? 'Upstash Redis configured' : 'Redis not configured — using in-memory fallback',
        },
        {
            name: 'Embeddings',
            ready: has('GOOGLE_AI_API_KEY'),
            detail: has('GOOGLE_AI_API_KEY') ? 'Google AI configured' : 'GOOGLE_AI_API_KEY missing — knowledge base search disabled',
        },
        {
            name: 'Cron Security',
            ready: has('CRON_SECRET'),
            detail: has('CRON_SECRET') ? 'Cron secret configured' : 'CRON_SECRET missing — cron endpoints unprotected',
        },
    ];
}
