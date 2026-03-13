/**
 * Support Chat System — Unit Tests
 *
 * Tests prompt builder, session management, and API validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-admin before imports
vi.mock('@/lib/auth/firebase-admin', () => ({ initAdmin: vi.fn() }));

// Mock rate limiter
vi.mock('@/lib/utils/rate-limiter', () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 300000 }),
}));

// Mock LLM Streaming
vi.mock('@/lib/ai/llm-streaming', () => ({
    LLMStreaming: vi.fn().mockImplementation(() => ({
        streamCompletion: vi.fn(),
    })),
}));

import { buildSupportPrompt } from '@/lib/ai/support-prompt';

// ─── buildSupportPrompt Tests ───────────────────────────────────────────────

describe('Support Chat System', () => {
    describe('buildSupportPrompt()', () => {
        it('returns Turkish prompt by default', () => {
            const prompt = buildSupportPrompt();
            expect(prompt).toContain('Ayla');
            expect(prompt).toContain('Callception');
            expect(prompt).toContain('destek asistanı');
        });

        it('includes package information in Turkish', () => {
            const prompt = buildSupportPrompt('tr');
            // Should contain plan names
            expect(prompt).toContain('Starter');
            expect(prompt).toContain('Professional');
            expect(prompt).toContain('Enterprise');
            // Should contain pricing info
            expect(prompt).toContain('TL');
        });

        it('includes guardrails in Turkish prompt', () => {
            const prompt = buildSupportPrompt('tr');
            expect(prompt).toContain('MUTLAK KURALLAR');
            // Cost/margin secrecy
            expect(prompt).toContain('maliyetler');
            // Short response rule
            expect(prompt).toContain('1-4 cümle');
            // Product-only scope
            expect(prompt).toContain('SADECE');
            // 14-day trial
            expect(prompt).toContain('14 gün');
        });

        it('returns English prompt when language is en', () => {
            const prompt = buildSupportPrompt('en');
            expect(prompt).toContain('Ayla');
            expect(prompt).toContain('Callception');
            expect(prompt).toContain('support assistant');
            // Should contain English guardrails
            expect(prompt).toContain('STRICT RULES');
            expect(prompt).toContain('ONLY talk about');
        });

        it('includes package information in English', () => {
            const prompt = buildSupportPrompt('en');
            expect(prompt).toContain('Starter');
            expect(prompt).toContain('Professional');
            expect(prompt).toContain('Enterprise');
            expect(prompt).toContain('TL');
            expect(prompt).toContain('Minutes');
        });

        it('includes 14-day trial info in English', () => {
            const prompt = buildSupportPrompt('en');
            expect(prompt).toContain('14 days free trial');
        });

        it('includes competitor mention ban', () => {
            const promptTr = buildSupportPrompt('tr');
            const promptEn = buildSupportPrompt('en');
            expect(promptTr).toContain('Rakip');
            expect(promptEn).toContain('competitor');
        });

        it('includes email redirect for custom pricing', () => {
            const promptTr = buildSupportPrompt('tr');
            const promptEn = buildSupportPrompt('en');
            expect(promptTr).toContain('info@callception.com');
            expect(promptEn).toContain('info@callception.com');
        });

        it('forbids revealing internal costs', () => {
            const promptTr = buildSupportPrompt('tr');
            expect(promptTr).toContain('maliyetler');
            expect(promptTr).toContain('marjları');
            expect(promptTr).toContain('altyapı');
        });

        it('includes platform features', () => {
            const promptTr = buildSupportPrompt('tr');
            // AI voice assistant
            expect(promptTr).toContain('Sesli Asistan');
            // Appointment management
            expect(promptTr).toContain('Randevu');
            // CRM
            expect(promptTr).toContain('CRM');
            // Webhook
            expect(promptTr).toContain('Webhook');
            // n8n
            expect(promptTr).toContain('n8n');
        });

        it('does not fabricate features rule included', () => {
            const promptTr = buildSupportPrompt('tr');
            const promptEn = buildSupportPrompt('en');
            expect(promptTr).toContain('UYDURMA');
            expect(promptEn).toContain('make up');
        });
    });

    // ─── Middleware Public Paths ─────────────────────────────────────────

    describe('Public API Paths', () => {
        it('support chat paths should be in public list', async () => {
            // Read middleware file and check paths are listed
            const fs = await import('fs');
            const content = fs.readFileSync('middleware.ts', 'utf-8');
            expect(content).toContain("'/api/chat/support'");
            expect(content).toContain("'/api/chat/support/tts'");
        });
    });

    // ─── API Route Constants ────────────────────────────────────────────

    describe('API Constants', () => {
        it('chat API has max message length of 500', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/route.ts', 'utf-8');
            expect(content).toContain('MAX_MESSAGE_LENGTH = 500');
        });

        it('chat API has session TTL of 15 minutes', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/route.ts', 'utf-8');
            expect(content).toContain('15 * 60 * 1000');
        });

        it('chat API limits to 20 turns per session', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/route.ts', 'utf-8');
            expect(content).toContain('MAX_TURNS = 20');
        });

        it('TTS API limits text to 500 chars', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/tts/route.ts', 'utf-8');
            expect(content).toContain('MAX_TEXT_LENGTH = 500');
        });

        it('TTS API uses Leyla voice ID', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/tts/route.ts', 'utf-8');
            expect(content).toContain('fa7bfcdc-603c-4bf1-a600-a371400d2f8c');
        });

        it('chat API uses gpt-4o-mini model', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/route.ts', 'utf-8');
            expect(content).toContain("'gpt-4o-mini'");
        });

        it('chat API supports both SSE and JSON response modes', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('app/api/chat/support/route.ts', 'utf-8');
            // SSE mode
            expect(content).toContain('text/event-stream');
            // JSON mode via Accept header
            expect(content).toContain("'application/json'");
        });
    });

    // ─── Widget Integration ─────────────────────────────────────────────

    describe('Widget Integration', () => {
        it('widget is included in ClientLayout for /landing', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('components/layout/ClientLayout.tsx', 'utf-8');
            expect(content).toContain("pathname === '/landing'");
            expect(content).toContain('SupportChatWidget');
        });

        it('widget import exists in ClientLayout', async () => {
            const fs = await import('fs');
            const content = fs.readFileSync('components/layout/ClientLayout.tsx', 'utf-8');
            expect(content).toContain("from '@/components/chat/SupportChatWidget'");
        });
    });
});
