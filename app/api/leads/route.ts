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

        // Check for duplicate
        const existing = await firestore
            .collection('leads')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();

        if (!existing.empty) {
            // Already exists — return success silently (don't reveal existence)
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

        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, 'Leads');
    }
}
