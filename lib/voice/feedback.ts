/**
 * Voice Call Feedback System
 *
 * Provides both automatic (sentiment-based) and manual (user-rated)
 * feedback collection for voice AI calls.
 *
 * Automatic feedback: Derives a 1-5 rating from conversation sentiment
 * Manual feedback: Admin can rate calls via the UI (1-5 stars + comment)
 *
 * Data stored at: tenants/{tenantId}/call_feedback/{autoId}
 *
 * Used by:
 * - app/api/voice/session/route.ts (auto-feedback on session save)
 * - app/api/voice/feedback/route.ts (manual feedback API)
 * - components/calls/CallFeedbackBadge.tsx (UI display)
 */

import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// =============================================
// Types
// =============================================

export interface CallFeedback {
    callId: string;
    rating: number; // 1-5
    feedbackType: 'auto' | 'manual';
    /** RAG chunk IDs used in this call (for quality tracking) */
    ragChunkIds?: string[];
    /** RAG similarity scores for used chunks */
    ragScores?: number[];
    /** User comment (manual feedback only) */
    comment?: string;
    /** Average sentiment score from conversation */
    sentimentScore?: number;
    createdAt: number;
}

export interface FeedbackStats {
    totalFeedback: number;
    averageRating: number;
    ratingDistribution: Record<number, number>; // { 1: count, 2: count, ... 5: count }
    autoCount: number;
    manualCount: number;
    lowRatingCalls: number; // rating <= 2
}

// =============================================
// Firestore
// =============================================

let db: FirebaseFirestore.Firestore | null = null;
function getDb() {
    if (!db) { initAdmin(); db = getFirestore(); }
    return db;
}

function feedbackCollection(tenantId: string) {
    return getDb().collection('tenants').doc(tenantId).collection('call_feedback');
}

// =============================================
// Core Functions
// =============================================

/**
 * Save call feedback to Firestore.
 */
export async function saveCallFeedback(
    tenantId: string,
    feedback: Omit<CallFeedback, 'createdAt'>,
): Promise<string> {
    const doc: CallFeedback = {
        ...feedback,
        rating: Math.max(1, Math.min(5, Math.round(feedback.rating))), // Clamp 1-5
        createdAt: Date.now(),
    };

    const ref = await feedbackCollection(tenantId).add(doc);
    return ref.id;
}

/**
 * Update existing feedback (e.g., admin overrides auto rating with manual one).
 */
export async function updateCallFeedback(
    tenantId: string,
    callId: string,
    update: { rating: number; comment?: string },
): Promise<boolean> {
    // Find existing feedback for this call
    const snap = await feedbackCollection(tenantId)
        .where('callId', '==', callId)
        .limit(1)
        .get();

    if (snap.empty) {
        // No existing feedback — create manual one
        await saveCallFeedback(tenantId, {
            callId,
            rating: update.rating,
            feedbackType: 'manual',
            comment: update.comment,
        });
        return true;
    }

    // Update existing
    const docRef = snap.docs[0].ref;
    await docRef.update({
        rating: Math.max(1, Math.min(5, Math.round(update.rating))),
        feedbackType: 'manual', // Manual override
        comment: update.comment || null,
        updatedAt: Date.now(),
    });

    return true;
}

/**
 * Get feedback for a specific call.
 */
export async function getCallFeedback(
    tenantId: string,
    callId: string,
): Promise<CallFeedback | null> {
    const snap = await feedbackCollection(tenantId)
        .where('callId', '==', callId)
        .limit(1)
        .get();

    if (snap.empty) return null;
    return snap.docs[0].data() as CallFeedback;
}

/**
 * Get aggregated feedback statistics for a time period.
 */
export async function getCallFeedbackStats(
    tenantId: string,
    days: number = 30,
): Promise<FeedbackStats> {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

    const snap = await feedbackCollection(tenantId)
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(1000) // Cap to prevent excessive reads
        .get();

    const stats: FeedbackStats = {
        totalFeedback: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        autoCount: 0,
        manualCount: 0,
        lowRatingCalls: 0,
    };

    if (snap.empty) return stats;

    let totalRating = 0;

    for (const doc of snap.docs) {
        const feedback = doc.data() as CallFeedback;
        stats.totalFeedback++;
        totalRating += feedback.rating;

        const ratingKey = Math.max(1, Math.min(5, Math.round(feedback.rating)));
        stats.ratingDistribution[ratingKey] = (stats.ratingDistribution[ratingKey] || 0) + 1;

        if (feedback.feedbackType === 'auto') stats.autoCount++;
        else stats.manualCount++;

        if (feedback.rating <= 2) stats.lowRatingCalls++;
    }

    stats.averageRating = Number((totalRating / stats.totalFeedback).toFixed(2));

    return stats;
}

// =============================================
// Automatic Feedback from Sentiment
// =============================================

/**
 * Derive a 1-5 rating from a sentiment score.
 * Sentiment scores typically range from -1.0 to +1.0.
 *
 * Mapping:
 *  -1.0 to -0.5 → 1 (very negative)
 *  -0.5 to -0.1 → 2 (negative)
 *  -0.1 to +0.2 → 3 (neutral)
 *  +0.2 to +0.5 → 4 (positive)
 *  +0.5 to +1.0 → 5 (very positive)
 */
export function sentimentToRating(sentimentScore: number): number {
    if (sentimentScore <= -0.5) return 1;
    if (sentimentScore <= -0.1) return 2;
    if (sentimentScore <= 0.2) return 3;
    if (sentimentScore <= 0.5) return 4;
    return 5;
}

/**
 * Create automatic feedback from conversation sentiment.
 * Fire-and-forget — errors are silently ignored.
 */
export async function createAutoFeedback(
    tenantId: string,
    callId: string,
    sentimentScore: number,
    ragChunkIds?: string[],
    ragScores?: number[],
): Promise<void> {
    try {
        await saveCallFeedback(tenantId, {
            callId,
            rating: sentimentToRating(sentimentScore),
            feedbackType: 'auto',
            sentimentScore,
            ragChunkIds,
            ragScores,
        });
    } catch {
        // Silent — auto-feedback failure must never break the pipeline
    }
}
