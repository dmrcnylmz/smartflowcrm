/**
 * useTenantSettings — Hook for fetching tenant settings with smart variable resolution
 *
 * Used by AgentCreationWizard to auto-fill variables from company settings.
 * Leverages the existing /api/tenant/settings GET endpoint.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthFetch } from '@/lib/hooks/useAuthFetch';
import type { AgentVariable } from '@/lib/agents/types';
import { SMART_VARIABLE_KEYS, resolveSmartVariable } from '@/lib/agents/templates';

export interface TenantSettings {
    companyName: string;
    companyEmail: string;
    companyPhone: string;
    companyWebsite: string;
    language: string;
    timezone: string;
    agentName: string;
    agentGreeting: string;
    agentPersonality: string;
    agentFallbackMessage: string;
    // Business info (from tenant doc)
    business?: {
        workingHours?: string;
        workingDays?: string;
        services?: string[];
        phone?: string;
        email?: string;
        address?: string;
        website?: string;
    };
}

interface UseTenantSettingsResult {
    settings: TenantSettings | null;
    loading: boolean;
    error: string | null;
    /** Auto-fill smart variables using tenant settings */
    resolveSmartVariables: (variables: AgentVariable[]) => AgentVariable[];
    /** Check if a variable key is a smart variable */
    isSmartVariable: (key: string) => boolean;
    /** Get resolved value for a specific key */
    getSmartValue: (key: string) => string | null;
}

export function useTenantSettings(): UseTenantSettingsResult {
    const authFetch = useAuthFetch();
    const [settings, setSettings] = useState<TenantSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        async function fetchSettings() {
            try {
                setLoading(true);
                const response = await authFetch('/api/tenant/settings');
                if (!response.ok) throw new Error('Ayarlar yuklenemedi');

                const data = await response.json();
                if (mounted) {
                    setSettings(data.settings || null);
                    setError(null);
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Bilinmeyen hata');
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }

        fetchSettings();
        return () => { mounted = false; };
    }, [authFetch]);

    /**
     * Auto-fill smart variables using tenant settings.
     * Returns a new array with defaultValues filled in where possible.
     */
    const resolveSmartVariablesFromSettings = useCallback(
        (variables: AgentVariable[]): AgentVariable[] => {
            if (!settings) return variables;

            // Flatten settings into a single object for dot-notation lookup
            const flatSettings: Record<string, unknown> = {
                ...settings,
            };

            return variables.map(v => {
                const resolved = resolveSmartVariable(v.key, flatSettings);
                if (resolved && !v.defaultValue) {
                    return { ...v, defaultValue: resolved };
                }
                return v;
            });
        },
        [settings]
    );

    const isSmartVariable = useCallback((key: string): boolean => {
        return SMART_VARIABLE_KEYS.some(m => m.key === key);
    }, []);

    const getSmartValue = useCallback(
        (key: string): string | null => {
            if (!settings) return null;
            const flatSettings: Record<string, unknown> = { ...settings };
            return resolveSmartVariable(key, flatSettings);
        },
        [settings]
    );

    return {
        settings,
        loading,
        error,
        resolveSmartVariables: resolveSmartVariablesFromSettings,
        isSmartVariable,
        getSmartValue,
    };
}
