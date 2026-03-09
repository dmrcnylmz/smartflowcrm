'use client';

/**
 * CallFeedbackBadge — Star Rating Display + Edit for Call Logs
 *
 * Shows the current rating (1-5 stars) for a call.
 * Click to open inline rating editor with optional comment.
 * Submits via POST /api/voice/feedback.
 *
 * Props:
 * - callId: the call log ID
 * - initialRating: current rating (0 = no feedback yet)
 * - feedbackType: 'auto' | 'manual' | null
 *
 * Used in call list views and call detail pages.
 */

import { useState, useCallback } from 'react';
import { Star, Loader2, MessageSquare } from 'lucide-react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import { useToast } from '@/components/ui/toast';

// =============================================
// Types
// =============================================

interface CallFeedbackBadgeProps {
    callId: string;
    initialRating?: number;
    feedbackType?: 'auto' | 'manual' | null;
    /** Compact mode: shows only stars, no edit controls */
    compact?: boolean;
}

// =============================================
// Component
// =============================================

export function CallFeedbackBadge({
    callId,
    initialRating = 0,
    feedbackType = null,
    compact = false,
}: CallFeedbackBadgeProps) {
    const [rating, setRating] = useState(initialRating);
    const [hoveredStar, setHoveredStar] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);
    const [type, setType] = useState(feedbackType);
    const authFetch = useAuthFetch();
    const { toast } = useToast();

    const handleStarClick = useCallback(async (starValue: number) => {
        if (compact && !isEditing) {
            setIsEditing(true);
            return;
        }

        setSaving(true);
        try {
            const response = await authFetch('/api/voice/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callId,
                    rating: starValue,
                    comment: comment || undefined,
                }),
            });

            if (response.ok) {
                setRating(starValue);
                setType('manual');
                setIsEditing(false);
                setComment('');
                toast({ variant: 'success', description: 'Değerlendirme kaydedildi' });
            } else {
                toast({ variant: 'error', description: 'Değerlendirme kaydedilemedi' });
            }
        } catch {
            toast({ variant: 'error', description: 'Bağlantı hatası' });
        } finally {
            setSaving(false);
        }
    }, [callId, comment, compact, isEditing, authFetch, toast]);

    const handleSubmitWithComment = useCallback(async () => {
        if (rating === 0) return;
        await handleStarClick(rating);
    }, [rating, handleStarClick]);

    // Compact mode: just show stars inline
    if (compact && !isEditing) {
        return (
            <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-0.5 group"
                title="Değerlendir"
            >
                {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                        key={star}
                        className={`w-3 h-3 transition-colors ${
                            star <= rating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-600 group-hover:text-slate-500'
                        }`}
                    />
                ))}
                {type === 'auto' && rating > 0 && (
                    <span className="text-[10px] text-slate-500 ml-1">oto</span>
                )}
            </button>
        );
    }

    return (
        <div className="space-y-2">
            {/* Star Rating Row */}
            <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        disabled={saving}
                        onClick={() => {
                            setRating(star);
                            if (!isEditing) handleStarClick(star);
                        }}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                        className="p-0.5 transition-transform hover:scale-110 disabled:opacity-50"
                    >
                        <Star
                            className={`w-4 h-4 transition-colors ${
                                star <= (hoveredStar || rating)
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-slate-600 hover:text-slate-500'
                            }`}
                        />
                    </button>
                ))}

                {saving && <Loader2 className="w-3 h-3 text-blue-400 animate-spin ml-1" />}

                {type && rating > 0 && !saving && (
                    <span className="text-[10px] text-slate-500 ml-1">
                        {type === 'auto' ? 'otomatik' : 'manuel'}
                    </span>
                )}

                {!isEditing && rating > 0 && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="ml-1 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                        title="Yorum ekle"
                    >
                        <MessageSquare className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* Comment Input (expanded mode) */}
            {isEditing && (
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Yorum ekle (opsiyonel)..."
                        className="flex-1 text-xs bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSubmitWithComment();
                            if (e.key === 'Escape') setIsEditing(false);
                        }}
                    />
                    <button
                        onClick={handleSubmitWithComment}
                        disabled={saving || rating === 0}
                        className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Kaydet'}
                    </button>
                    <button
                        onClick={() => { setIsEditing(false); setComment(''); }}
                        className="text-xs px-2 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        İptal
                    </button>
                </div>
            )}
        </div>
    );
}
