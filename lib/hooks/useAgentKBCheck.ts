'use client';

/**
 * useAgentKBCheck — Checks if an agent (or tenant) has Knowledge Base documents.
 *
 * Used by RAGGateOverlay to block testing/activation when no KB data exists.
 *
 * When agentId is provided → checks agent-specific + tenant-wide KB docs
 * When agentId is undefined → checks tenant-level stats (any KB docs at all)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from './useAuthFetch';

interface AgentKBCheckResult {
    /** null = loading, true = has KB, false = no KB */
    hasKB: boolean | null;
    /** Number of documents found */
    documentCount: number;
    /** Whether the check is in progress */
    isChecking: boolean;
    /** Re-run the check (e.g., after adding KB content) */
    recheck: () => void;
}

export function useAgentKBCheck(agentId: string | undefined): AgentKBCheckResult {
    const authFetch = useAuthFetch();
    const [hasKB, setHasKB] = useState<boolean | null>(null);
    const [documentCount, setDocumentCount] = useState(0);
    const [isChecking, setIsChecking] = useState(true);
    const [trigger, setTrigger] = useState(0);

    const recheck = useCallback(() => {
        setTrigger(prev => prev + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsChecking(true);
        setHasKB(null);

        async function check() {
            try {
                if (agentId) {
                    // Check agent-specific KB documents
                    const res = await authFetch(`/api/knowledge?agentId=${agentId}`);
                    if (cancelled) return;
                    const data = await res.json();
                    const count = data.documents?.length || data.count || 0;

                    if (count > 0) {
                        setDocumentCount(count);
                        setHasKB(true);
                    } else {
                        // Also check tenant-wide KB (documents without agentId still help)
                        const statsRes = await authFetch('/api/knowledge?action=stats');
                        if (cancelled) return;
                        const stats = await statsRes.json();
                        const totalDocs = stats.documentCount || 0;
                        setDocumentCount(totalDocs);
                        setHasKB(totalDocs > 0);
                    }
                } else {
                    // No agent ID (pre-save wizard) — check tenant-level stats
                    const res = await authFetch('/api/knowledge?action=stats');
                    if (cancelled) return;
                    const data = await res.json();
                    const count = data.documentCount || 0;
                    setDocumentCount(count);
                    setHasKB(count > 0);
                }
            } catch {
                if (!cancelled) {
                    // On error, allow testing (don't block)
                    setHasKB(true);
                    setDocumentCount(0);
                }
            } finally {
                if (!cancelled) setIsChecking(false);
            }
        }

        check();
        return () => { cancelled = true; };
    }, [agentId, authFetch, trigger]);

    return { hasKB, documentCount, isChecking, recheck };
}
