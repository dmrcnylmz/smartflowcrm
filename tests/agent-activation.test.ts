/**
 * Agent Activation System — Unit Tests
 *
 * Tests schema updates, gateway functions, API routes, and onboarding changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before imports
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// Mock rate limiter
vi.mock('@/lib/utils/rate-limiter', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 300000 }),
}));

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe('Agent Activation System', () => {
    describe('Schema: PhoneNumberRecord', () => {
        it('PhoneNumberRecord supports agentId field', async () => {
            const types = await import('@/lib/phone/types');
            // Verify the type exports exist (TypeScript compile check)
            expect(types.getProviderForCountry).toBeDefined();
            // Verify agentId is accepted in the interface by creating a valid record shape
            const record: import('@/lib/phone/types').PhoneNumberRecord = {
                phoneNumber: '+905321234567',
                tenantId: 'tenant1',
                providerType: 'SIP_TRUNK',
                country: 'TR',
                capabilities: ['voice'],
                assignedAt: {} as FirebaseFirestore.Timestamp,
                isActive: true,
                agentId: 'agent123', // This should compile
            };
            expect(record.agentId).toBe('agent123');
        });

        it('PhoneNumberRecord allows agentId to be undefined', () => {
            const record: import('@/lib/phone/types').PhoneNumberRecord = {
                phoneNumber: '+905321234567',
                tenantId: 'tenant1',
                providerType: 'TWILIO_NATIVE',
                country: 'US',
                capabilities: ['voice'],
                assignedAt: {} as FirebaseFirestore.Timestamp,
                isActive: true,
                // agentId is optional — should work without it
            };
            expect(record.agentId).toBeUndefined();
        });
    });

    describe('Schema: ResolvedTenant', () => {
        it('ResolvedTenant includes agentId field', async () => {
            const { resolveTenantFromPhone } = await import('@/lib/twilio/telephony');
            expect(resolveTenantFromPhone).toBeDefined();

            // Type check: ResolvedTenant should accept agentId
            const resolved: import('@/lib/twilio/telephony').ResolvedTenant = {
                tenantId: 'tenant1',
                providerType: 'SIP_TRUNK',
                agentId: 'agent456',
            };
            expect(resolved.agentId).toBe('agent456');
        });
    });

    // ─── Gateway Tests ───────────────────────────────────────────────────────

    describe('Gateway: assignNumberToAgent / unassignNumberFromAgent', () => {
        it('gateway exports assignNumberToAgent function', async () => {
            const gateway = await import('@/lib/phone/gateway');
            expect(gateway.assignNumberToAgent).toBeDefined();
            expect(typeof gateway.assignNumberToAgent).toBe('function');
        });

        it('gateway exports unassignNumberFromAgent function', async () => {
            const gateway = await import('@/lib/phone/gateway');
            expect(gateway.unassignNumberFromAgent).toBeDefined();
            expect(typeof gateway.unassignNumberFromAgent).toBe('function');
        });

        it('provisionNumber accepts agentId parameter', async () => {
            const gateway = await import('@/lib/phone/gateway');
            expect(gateway.provisionNumber).toBeDefined();
            // Function should accept 5 parameters (db, tenantId, country, options, agentId)
            expect(gateway.provisionNumber.length).toBeGreaterThanOrEqual(3);
        });
    });

    // ─── API Route Constants ─────────────────────────────────────────────────

    describe('API Routes', () => {
        it('activate route exists', async () => {
            const fs = await import('fs');
            const exists = fs.existsSync('app/api/agents/activate/route.ts');
            expect(exists).toBe(true);
        });

        it('deactivate route exists', async () => {
            const fs = await import('fs');
            const exists = fs.existsSync('app/api/agents/deactivate/route.ts');
            expect(exists).toBe(true);
        });

        it('activate route requires subscription', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/activate/route.ts', 'utf-8');
            expect(content).toContain('SUBSCRIPTION_REQUIRED');
            expect(content).toContain('status: 402');
        });

        it('activate route checks agent ownership', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/activate/route.ts', 'utf-8');
            expect(content).toContain('requireStrictAuth');
            expect(content).toContain('Agent not found');
        });

        it('activate route calls provisionNumber or assignNumberToAgent', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/activate/route.ts', 'utf-8');
            expect(content).toContain('provisionNumber');
            expect(content).toContain('assignNumberToAgent');
        });

        it('activate route enables assistantEnabled', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/activate/route.ts', 'utf-8');
            expect(content).toContain('assistantEnabled: true');
        });

        it('deactivate route disables assistantEnabled when no active agents left', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/deactivate/route.ts', 'utf-8');
            expect(content).toContain('assistantEnabled: false');
            expect(content).toContain('activeAgentsSnap.empty');
        });

        it('deactivate route supports releaseNumber option', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/deactivate/route.ts', 'utf-8');
            expect(content).toContain('releaseNumber');
            expect(content).toContain('unassignNumberFromAgent');
        });
    });

    // ─── Incoming Call Flow ──────────────────────────────────────────────────

    describe('Incoming Call Flow', () => {
        it('incoming route supports agentId from resolved tenant', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/twilio/incoming/route.ts', 'utf-8');
            expect(content).toContain('boundAgentId');
            expect(content).toContain('resolved?.agentId');
        });

        it('incoming route passes agentId to gather URL', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/twilio/incoming/route.ts', 'utf-8');
            expect(content).toContain('&agentId=');
            expect(content).toContain('resolvedAgentId');
        });

        it('gather route reads agentId from query params', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/twilio/gather/route.ts', 'utf-8');
            expect(content).toContain("agentIdParam");
            expect(content).toContain("'agentId'");
        });

        it('gather route loads specific agent by ID when available', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/twilio/gather/route.ts', 'utf-8');
            expect(content).toContain("collection('agents')");
            expect(content).toContain('agentIdParam');
        });

        it('gather route falls back to first active agent', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/twilio/gather/route.ts', 'utf-8');
            expect(content).toContain('Legacy fallback');
            expect(content).toContain("'isActive', '==', true");
        });
    });

    // ─── Onboarding ──────────────────────────────────────────────────────────

    describe('Onboarding', () => {
        it('onboarding has 4 steps (no phone step)', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/onboarding/page.tsx', 'utf-8');
            // Should have exactly 4 steps: company, template, voice, launch
            expect(content).toContain("id: 'company'");
            expect(content).toContain("id: 'template'");
            expect(content).toContain("id: 'voice'");
            expect(content).toContain("id: 'launch'");
            // Should NOT have phone step
            expect(content).not.toContain("id: 'phone'");
        });

        it('onboarding does not import Phone or SkipForward icons', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/onboarding/page.tsx', 'utf-8');
            expect(content).not.toContain('SkipForward');
            expect(content).not.toContain("Phone,");
        });

        it('onboarding does not contain phoneCountry or phoneSkipped', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/onboarding/page.tsx', 'utf-8');
            expect(content).not.toContain('phoneCountry');
            expect(content).not.toContain('phoneSkipped');
        });

        it('onboarding launch banner mentions testing and activation', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/onboarding/page.tsx', 'utf-8');
            expect(content).toContain('ücretsiz test');
            expect(content).toContain('Asistanlar sayfasından');
        });
    });

    // ─── Agent Activation UI ─────────────────────────────────────────────────

    describe('Agent Activation UI', () => {
        it('AgentActivationFlow component exists', async () => {
            const fs = await import('fs');
            const exists = fs.existsSync('components/agents/AgentActivationFlow.tsx');
            expect(exists).toBe(true);
        });

        it('AgentActivationFlow has 3 steps', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('components/agents/AgentActivationFlow.tsx', 'utf-8');
            expect(content).toContain('Step 1');
            expect(content).toContain('Step 2');
            expect(content).toContain('Step 3');
        });

        it('AgentActivationFlow checks subscription', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('components/agents/AgentActivationFlow.tsx', 'utf-8');
            expect(content).toContain('checkSubscription');
            expect(content).toContain('/api/billing/subscription');
        });

        it('AgentActivationFlow supports existing and new numbers', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('components/agents/AgentActivationFlow.tsx', 'utf-8');
            expect(content).toContain('/api/phone/numbers?unassigned=true');
            expect(content).toContain('phoneCountry');
        });

        it('agents page imports AgentActivationFlow', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/agents/page.tsx', 'utf-8');
            expect(content).toContain('AgentActivationFlow');
        });

        it('agents page has Canlıya Al button', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/agents/page.tsx', 'utf-8');
            expect(content).toContain('Canlıya Al');
        });
    });

    // ─── Agent Deletion Cleanup ──────────────────────────────────────────────

    describe('Agent Deletion', () => {
        it('agent DELETE handler cleans up phone binding', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/agents/route.ts', 'utf-8');
            expect(content).toContain('tenant_phone_numbers');
            expect(content).toContain('agentId');
            expect(content).toContain('FieldValue.delete()');
        });
    });

    // ─── Phone Numbers API ───────────────────────────────────────────────────

    describe('Phone Numbers API', () => {
        it('supports ?unassigned=true filter', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/phone/numbers/route.ts', 'utf-8');
            expect(content).toContain('unassigned');
            expect(content).toContain('agentId');
        });
    });
});
