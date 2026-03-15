/**
 * Lead Capture API
 *
 * POST /api/leads
 *
 * Receives demo requests and stores them in Firestore.
 * No authentication required — public endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { handleApiError } from '@/lib/utils/error-handler';
import { checkSensitiveLimit } from '@/lib/utils/rate-limiter';

export const dynamic = 'force-dynamic';

let db: FirebaseFirestore.Firestore | null = null;

function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

// Simple email validation
function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
    try {
        // Rate limit by IP: 10 req/min
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rateResult = await checkSensitiveLimit(ip);
        if (!rateResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429 },
            );
        }

        const body = await request.json();
        const { email, source } = body;

        if (!email || typeof email !== 'string' || !isValidEmail(email)) {
            return NextResponse.json(
                { error: 'Geçerli bir e-posta adresi gerekli' },
                { status: 400 },
            );
        }

        const firestore = getDb();
        const normalizedEmail = email.toLowerCase().trim();

        // Use consistent timing to prevent email enumeration via timing attack
        const startTime = Date.now();
        const MIN_RESPONSE_MS = 200;

        // Check for duplicate
        const existing = await firestore
            .collection('leads')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();

        if (!existing.empty) {
            // Already exists — pad response time to match new-lead path
            const elapsed = Date.now() - startTime;
            if (elapsed < MIN_RESPONSE_MS) {
                await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
            }
            return NextResponse.json({ success: true });
        }

        // Store lead
        await firestore.collection('leads').add({
            email: normalizedEmail,
            source: source || 'unknown',
            status: 'new',
            createdAt: new Date().toISOString(),
            ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            userAgent: request.headers.get('user-agent') || null,
        });

        // Pad response time to match duplicate path
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_RESPONSE_MS) {
            await new Promise(resolve => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, 'Leads');
    }
}
