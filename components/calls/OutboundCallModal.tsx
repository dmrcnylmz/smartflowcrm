'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Phone, PhoneOutgoing, CheckCircle, XCircle, AlertTriangle, Globe, Loader2 } from 'lucide-react';
import CompliancePreflightCard from '@/components/compliance/CompliancePreflightCard';
import type { ComplianceScoreResult } from '@/lib/compliance/compliance-score';

interface OutboundCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallInitiated?: (callSid: string) => void;
}

const COUNTRY_PREFIXES: { prefix: string; flag: string; country: string }[] = [
  { prefix: '+90', flag: '\u{1F1F9}\u{1F1F7}', country: 'TR' },
  { prefix: '+49', flag: '\u{1F1E9}\u{1F1EA}', country: 'DE' },
  { prefix: '+33', flag: '\u{1F1EB}\u{1F1F7}', country: 'FR' },
  { prefix: '+1', flag: '\u{1F1FA}\u{1F1F8}', country: 'US' },
  { prefix: '+44', flag: '\u{1F1EC}\u{1F1E7}', country: 'GB' },
  { prefix: '+31', flag: '\u{1F1F3}\u{1F1F1}', country: 'NL' },
  { prefix: '+43', flag: '\u{1F1E6}\u{1F1F9}', country: 'AT' },
  { prefix: '+41', flag: '\u{1F1E8}\u{1F1ED}', country: 'CH' },
];

const CALL_PURPOSES = [
  'follow_up',
  'appointment_reminder',
  'survey',
  'support',
  'sales',
  'info_request',
  'billing',
  'other',
] as const;

function detectCountryFlag(phone: string): string {
  for (const { prefix, flag } of COUNTRY_PREFIXES) {
    if (phone.startsWith(prefix)) return flag;
  }
  return '\u{1F30D}';
}

export default function OutboundCallModal({ isOpen, onClose, onCallInitiated }: OutboundCallModalProps) {
  const t = useTranslations('calls');
  const tc = useTranslations('common');

  const [phoneNumber, setPhoneNumber] = useState('');
  const [agentId, setAgentId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Compliance pre-flight
  const [complianceResult, setComplianceResult] = useState<ComplianceScoreResult | undefined>();
  const [complianceLoading, setComplianceLoading] = useState(false);

  // Call state
  const [callLoading, setCallLoading] = useState(false);
  const [callSuccess, setCallSuccess] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  // Fetch agents on mount
  useEffect(() => {
    if (!isOpen) return;
    setLoadingAgents(true);
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.agents || [];
        setAgents(list.map((a: { id: string; name?: string }) => ({ id: a.id, name: a.name || a.id })));
      })
      .catch(() => setAgents([]))
      .finally(() => setLoadingAgents(false));
  }, [isOpen]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setPhoneNumber('');
      setAgentId('');
      setPurpose('');
      setNotes('');
      setComplianceResult(undefined);
      setCallSuccess(null);
      setCallError(null);
    }
  }, [isOpen]);

  // Compliance pre-flight check (debounced)
  const runComplianceCheck = useCallback(async (phone: string) => {
    if (phone.length < 8) {
      setComplianceResult(undefined);
      return;
    }
    setComplianceLoading(true);
    try {
      const res = await fetch('/api/compliance/outbound-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      });
      if (res.ok) {
        const data = await res.json();
        setComplianceResult(data);
      } else {
        setComplianceResult(undefined);
      }
    } catch {
      setComplianceResult(undefined);
    } finally {
      setComplianceLoading(false);
    }
  }, []);

  // Debounce compliance check
  useEffect(() => {
    if (!phoneNumber || phoneNumber.length < 8) {
      setComplianceResult(undefined);
      return;
    }
    const timer = setTimeout(() => runComplianceCheck(phoneNumber), 600);
    return () => clearTimeout(timer);
  }, [phoneNumber, runComplianceCheck]);

  const isBlocked = complianceResult?.level === 'red';
  const canCall = phoneNumber.length >= 8 && !isBlocked && !callLoading;

  async function handleInitiateCall() {
    setCallLoading(true);
    setCallError(null);
    setCallSuccess(null);

    try {
      const res = await fetch('/api/calls/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber,
          agentId: agentId || undefined,
          purpose: purpose || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCallSuccess(data.callSid || data.sid || 'OK');
      onCallInitiated?.(data.callSid || data.sid);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : t('callFailed'));
    } finally {
      setCallLoading(false);
    }
  }

  const detectedFlag = detectCountryFlag(phoneNumber);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-1rem)] sm:max-w-lg p-0 gap-0 overflow-hidden bg-background rounded-2xl shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/40">
          <DialogTitle className="text-xl font-bold flex items-center gap-3">
            <span className="bg-emerald-500/10 p-2 rounded-xl text-emerald-500 border border-emerald-500/20">
              <PhoneOutgoing className="h-5 w-5" />
            </span>
            {t('newCall')}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Phone number input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('enterPhoneNumber')}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg">
                {detectedFlag}
              </span>
              <Input
                type="tel"
                placeholder="+90 5XX XXX XX XX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="pl-10 rounded-xl bg-background border-border/60"
              />
            </div>
          </div>

          {/* Agent selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('selectAgent')}</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-full rounded-xl bg-background border-border/60">
                <SelectValue placeholder={t('selectAgent')} />
              </SelectTrigger>
              <SelectContent>
                {loadingAgents ? (
                  <SelectItem value="__loading" disabled>{tc('loading')}</SelectItem>
                ) : agents.length === 0 ? (
                  <SelectItem value="__none" disabled>{tc('noData')}</SelectItem>
                ) : (
                  agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Call purpose */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('callPurpose')}</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger className="w-full rounded-xl bg-background border-border/60">
                <SelectValue placeholder={t('callPurpose')} />
              </SelectTrigger>
              <SelectContent>
                {CALL_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('callNotes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('callNotes')}
              className="rounded-xl bg-background border-border/60 min-h-[80px]"
            />
          </div>

          {/* Compliance pre-flight */}
          {(complianceLoading || complianceResult) && (
            <CompliancePreflightCard
              phoneNumber={phoneNumber}
              result={complianceResult}
              loading={complianceLoading}
            />
          )}

          {/* Success state */}
          {callSuccess && (
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-4 flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  {t('callStarted')}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  CallSid: {callSuccess}
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {callError && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {t('callFailed')}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{callError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-border/40 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="rounded-xl">
            {tc('cancel')}
          </Button>
          <Button
            onClick={handleInitiateCall}
            disabled={!canCall}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2"
          >
            {callLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            {t('initiateCall')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
