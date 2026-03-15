/**
 * EmptyState — Reusable empty state component for pages with no data.
 *
 * Used across dashboard, customers, calls, appointments, knowledge base, etc.
 * Provides consistent styling with icon, title, description, and optional CTA.
 */

import { type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
    /** Lucide icon component */
    icon: LucideIcon;
    /** Primary heading */
    title: string;
    /** Supporting description text */
    description: string;
    /** Optional CTA button */
    action?: {
        label: string;
        onClick: () => void;
        icon?: LucideIcon;
    };
    /** Optional icon accent color class (default: text-white/20) */
    iconColor?: string;
    /** Optional icon background class */
    iconBg?: string;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    action,
    iconColor = 'text-white/20',
    iconBg = 'bg-white/[0.04] border border-white/[0.06]',
}: EmptyStateProps) {
    const ActionIcon = action?.icon;

    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className={`h-16 w-16 rounded-2xl ${iconBg} flex items-center justify-center mb-4`}>
                <Icon className={`h-8 w-8 ${iconColor}`} />
            </div>
            <h3 className="text-lg font-semibold text-white/80 mb-2">{title}</h3>
            <p className="text-sm text-white/40 mb-6 max-w-sm">{description}</p>
            {action && (
                <Button onClick={action.onClick} className="gap-2">
                    {ActionIcon && <ActionIcon className="h-4 w-4" />}
                    {action.label}
                </Button>
            )}
        </div>
    );
}
