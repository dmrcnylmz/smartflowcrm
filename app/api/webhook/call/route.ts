import { NextRequest, NextResponse } from 'next/server';
import {
  addCallLog,
  addActivityLog,
  getCustomerByPhone,
  createCustomer,
  getCustomer,
  getTenantFromRequest,
  Timestamp,
} from '@/lib/firebase/admin-db';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { handleApiError, requireFields, errorResponse } from '@/lib/utils/error-handler';

export const dynamic = 'force-dynamic';

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkWebhookRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || entry.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

// Cleanup stale entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap) {
        if (val.resetAt < now) rateLimitMap.delete(key);
    }
}, 120_000);

// ─── Firestore for idempotency checks ────────────────────────────────────────

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// Idempotency TTL: 24 hours (in ms)
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Check if a call with the given idempotency key has already been processed.
 * Returns the existing callLogId if duplicate, null otherwise.
 */
async function checkIdempotency(
    tenantId: string,
    idempotencyKey: string,
): Promise<string | null> {
    const docRef = getDb()
        .collection('tenants').doc(tenantId)
        .collection('call_idempotency').doc(idempotencyKey);

    const doc = await docRef.get();
    if (!doc.exists) return null;

    const data = doc.data();
    // Check TTL — expired entries are treated as non-existent
    if (data?.expiresAt && data.expiresAt < Date.now()) {
        // Expired, clean up asynchronously
        docRef.delete().catch(() => {});
        return null;
    }

    return data?.callLogId || null;
}

/**
 * Record an idempotency key after successful call log creation.
 */
async function recordIdempotency(
    tenantId: string,
    idempotencyKey: string,
    callLogId: string,
): Promise<void> {
    await getDb()
        .collection('tenants').doc(tenantId)
        .collection('call_idempotency').doc(idempotencyKey)
        .set({
            callLogId,
            createdAt: Date.now(),
            expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        });
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkWebhookRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Webhook authentication — validate API key
    const webhookKey = process.env.WEBHOOK_API_KEY;
    if (!webhookKey && process.env.NODE_ENV === 'production') {
      // In production, WEBHOOK_API_KEY must be configured
      return NextResponse.json(
        { error: 'Webhook authentication not configured' },
        { status: 503 },
      );
    }
    if (webhookKey) {
      const providedKey = request.headers.get('x-webhook-key');
      if (providedKey !== webhookKey) {
        return NextResponse.json({ error: 'Invalid webhook key' }, { status: 401 });
      }
    }

    const body = await request.json();

    const validation = requireFields(body, ['customerPhone']);
    if (validation) return errorResponse(validation);

    // Webhook API — get tenantId from body or headers
    const tenantId =
      body.tenantId || getTenantFromRequest(request) || null;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required in request body for webhook calls' },
        { status: 400 },
      );
    }

    // Validate tenant exists in Firestore
    const tenantDoc = await getDb().collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json(
        { error: 'Invalid tenantId' },
        { status: 404 },
      );
    }

    // ── Idempotency check ──────────────────────────────────────────────────
    // Use Twilio CallSid as natural idempotency key, or explicit idempotencyKey
    const idempotencyKey = body.callSid || body.idempotencyKey || null;

    if (idempotencyKey) {
      const existingCallLogId = await checkIdempotency(tenantId, idempotencyKey);
      if (existingCallLogId) {
        // Duplicate request — return success without creating new records
        return NextResponse.json(
          {
            success: true,
            duplicate: true,
            callLogId: existingCallLogId,
            message: 'Call already logged (duplicate webhook)',
          },
          { status: 200 },
        );
      }
    }

    const {
      customerPhone,
      customerName,
      duration,
      status,
      intent,
      summary,
      direction = 'inbound',
    } = body;

    // Get or create customer
    let customer = await getCustomerByPhone(tenantId, customerPhone);
    if (!customer) {
      const newCustomerRef = await createCustomer(tenantId, {
        name: customerName || 'Bilinmeyen',
        phone: customerPhone,
        email: '',
      });
      customer = await getCustomer(tenantId, newCustomerRef.id);
      if (!customer) {
        throw new Error('Failed to retrieve created customer');
      }
    }

    // Add call log
    const callLog = await addCallLog(tenantId, {
      customerPhone,
      customerName: customer.name,
      customerId: customer.id,
      duration: duration || 0,
      status: status || 'answered',
      intent,
      summary,
      direction,
      timestamp: Timestamp.now(),
    });

    // Add activity log
    await addActivityLog(tenantId, {
      type: 'call',
      description: `${direction === 'inbound' ? 'Gelen' : 'Giden'} arama: ${customer.name} (${customerPhone})`,
      relatedId: callLog.id,
    });

    // Record idempotency key for future duplicate detection
    if (idempotencyKey) {
      recordIdempotency(tenantId, idempotencyKey, callLog.id).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        callLogId: callLog.id,
        customerId: customer.id,
        message: 'Call logged successfully',
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleApiError(error, 'Webhook Call');
  }
}
