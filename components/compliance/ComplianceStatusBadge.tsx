'use client';

import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceLevel } from '@/lib/compliance/compliance-score';

interface ComplianceStatusBadgeProps {
  level: ComplianceLevel;
  score?: number;
  size?: 'sm' | 'md' | 'lg';
}

const config: Record<ComplianceLevel, { bg: string; icon: typeof CheckCircle; label: string }> = {
  green: {
    bg: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    icon: CheckCircle,
    label: 'OK',
  },
  yellow: {
    bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    icon: Clock,
    label: 'Schedule',
  },
  red: {
    bg: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    icon: XCircle,
    label: 'Blocked',
  },
};

const sizeMap = {
  sm: { badge: 'px-1.5 py-0.5 text-xs gap-1', icon: 'h-3 w-3' },
  md: { badge: 'px-2.5 py-1 text-sm gap-1.5', icon: 'h-4 w-4' },
  lg: { badge: 'px-3 py-1.5 text-base gap-2', icon: 'h-5 w-5' },
};

export default function ComplianceStatusBadge({ level, score, size = 'md' }: ComplianceStatusBadgeProps) {
  const { bg, icon: Icon, label } = config[level];
  const s = sizeMap[size];

  return (
    <span className={cn('inline-flex items-center rounded-full font-medium', bg, s.badge)}>
      <Icon className={s.icon} />
      {score !== undefined ? score : label}
    </span>
  );
}
