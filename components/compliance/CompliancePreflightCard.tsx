'use client';

import { useTranslations } from 'next-intl';
import { Globe, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import ComplianceStatusBadge from './ComplianceStatusBadge';
import type { ComplianceScoreResult } from '@/lib/compliance/compliance-score';

interface CompliancePreflightCardProps {
  phoneNumber: string;
  result?: ComplianceScoreResult;
  loading?: boolean;
}

const COUNTRY_FLAGS: Record<string, string> = {
  TR: '\u{1F1F9}\u{1F1F7}',
  DE: '\u{1F1E9}\u{1F1EA}',
  FR: '\u{1F1EB}\u{1F1F7}',
  US: '\u{1F1FA}\u{1F1F8}',
  GB: '\u{1F1EC}\u{1F1E7}',
  NL: '\u{1F1F3}\u{1F1F1}',
  AT: '\u{1F1E6}\u{1F1F9}',
  CH: '\u{1F1E8}\u{1F1ED}',
  BE: '\u{1F1E7}\u{1F1EA}',
};

function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country.toUpperCase()] || '\u{1F30D}';
}

export default function CompliancePreflightCard({
  phoneNumber,
  result,
  loading,
}: CompliancePreflightCardProps) {
  const t = useTranslations('calls');

  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3 animate-pulse">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('checking')}
        </div>
      </div>
    );
  }

  if (!result) return null;

  const flag = getCountryFlag(result.country);
  const now = new Date();
  // Simple local time display (we show the phone number's implied timezone info)
  const localTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const actionMap: Record<string, { text: string; className: string }> = {
    call_now: {
      text: t('callable'),
      className: 'text-green-700 dark:text-green-400',
    },
    schedule: {
      text: result.nextAllowedTime
        ? t('scheduleAt', { time: new Date(result.nextAllowedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
        : t('notCallable'),
      className: 'text-yellow-700 dark:text-yellow-400',
    },
    blocked: {
      text: `${t('notCallable')}: ${result.reasons.join(', ')}`,
      className: 'text-red-700 dark:text-red-400',
    },
  };

  const action = actionMap[result.actionable] || actionMap.blocked;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          {t('preflightCheck')}
        </span>
        <ComplianceStatusBadge level={result.level} score={result.score} size="sm" />
      </div>

      {/* Country + time */}
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          {flag} {result.country || 'Unknown'}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {localTimeStr}
        </span>
      </div>

      {/* Check results */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          {result.consentValid ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span>Consent</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {result.callingHoursValid ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : result.callingHoursSchedulable ? (
            <Clock className="h-4 w-4 text-yellow-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span>Calling Hours</span>
        </div>
      </div>

      {/* Action recommendation */}
      <div className={`text-sm font-medium ${action.className}`}>
        {action.text}
      </div>
    </div>
  );
}
