/**
 * Prompt Builder — 4-Layer System Prompt Construction
 *
 * Builds a production-grade system prompt for the voice AI:
 *
 * Layer 1: Identity (agent persona)
 * Layer 2: Company facts (from tenant config)
 * Layer 3: RAG context (dynamic per query)
 * Layer 4: Guardrails (hard constraints)
 *
 * Goal: Make the AI behave like a REAL company employee.
 */

import type { TenantConfig } from '../tenant/types';
import type { SearchResult } from './vector-store';

// --- Types ---

export interface PromptContext {
    tenant: TenantConfig;
    ragResults: SearchResult[];
    currentIntent?: string;
    language: 'tr' | 'en';
}

// --- Core Builder ---

/**
 * Build the complete system prompt for a voice AI session.
 * Optimized for token efficiency (short but comprehensive).
 */
export function buildSystemPrompt(ctx: PromptContext): string {
    const { tenant, ragResults, currentIntent, language } = ctx;

    if (language === 'en') {
        return buildEnglishPrompt(tenant, ragResults, currentIntent);
    }

    return buildTurkishPrompt(tenant, ragResults, currentIntent);
}

// --- Turkish Prompt ---

function buildTurkishPrompt(
    tenant: TenantConfig,
    ragResults: SearchResult[],
    currentIntent?: string,
): string {
    const { agent, business, guardrails } = tenant;

    const parts: string[] = [];

    // Layer 1: Identity
    parts.push(`Sen ${tenant.companyName} firmasının ${agent.role}'ı ${agent.name}'sin.`);
    parts.push(`Kişilik özelliklerin: ${agent.traits.join(', ')}.`);
    parts.push('Telefonda bir müşteriyle konuşuyorsun. Kısa, net ve doğal konuş.');

    // Layer 2: Company Facts
    parts.push('');
    parts.push('--- FİRMA BİLGİLERİ ---');
    parts.push(`Firma: ${tenant.companyName}`);
    parts.push(`Sektör: ${tenant.sector}`);
    parts.push(`Çalışma saatleri: ${business.workingDays} ${business.workingHours}`);
    if (business.services.length > 0) {
        parts.push(`Hizmetler: ${business.services.join(', ')}`);
    }
    if (business.phone) parts.push(`Telefon: ${business.phone}`);
    if (business.email) parts.push(`E-posta: ${business.email}`);
    if (business.website) parts.push(`Web: ${business.website}`);

    // Layer 3: RAG Context
    if (ragResults.length > 0) {
        parts.push('');
        parts.push('--- BİLGİ TABANI (SADECE BURADAN CEVAP VER) ---');
        for (const result of ragResults) {
            parts.push(result.text);
        }
    }

    // Intent-specific instructions
    if (currentIntent) {
        parts.push('');
        parts.push(`--- MEVCUT MÜŞTERI NİYETİ: ${getIntentLabelTR(currentIntent)} ---`);
        parts.push(getIntentInstructionTR(currentIntent));
    }

    // Layer 4: Guardrails
    parts.push('');
    parts.push('--- MUTLAK KURALLAR (ASLA İHLAL ETME) ---');
    parts.push('1. SADECE yukarıdaki bilgi tabanından cevap ver. Bilmediğini uydurma.');
    parts.push('2. Emin değilsen "Bu konuyu kontrol edip size dönmem gerekiyor" de.');
    parts.push('3. Asla yapay zeka, bot veya asistan olduğunu söyleme.');
    parts.push('4. Rakip firma isimlerini asla söyleme.');

    if (!guardrails.allowPriceQuotes) {
        parts.push('5. Bilgi tabanında yazmıyorsa fiyat/ücret bilgisi verme.');
    }
    if (!guardrails.allowContractTerms) {
        parts.push('6. Sözleşme veya taahhüt verme.');
    }
    if (guardrails.forbiddenTopics.length > 0) {
        parts.push(`7. Şu konulardan konuşma: ${guardrails.forbiddenTopics.join(', ')}`);
    }

    parts.push('');
    parts.push('Kısa cevap ver (1-3 cümle). Telefon konuşması gibi doğal ol.');

    return parts.join('\n');
}

// --- English Prompt ---

function buildEnglishPrompt(
    tenant: TenantConfig,
    ragResults: SearchResult[],
    currentIntent?: string,
): string {
    const { agent, business, guardrails } = tenant;

    const parts: string[] = [];

    // Layer 1: Identity
    parts.push(`You are ${agent.name}, a ${agent.role} at ${tenant.companyName}.`);
    parts.push(`Your personality: ${agent.traits.join(', ')}.`);
    parts.push('You are on a phone call with a customer. Speak briefly, clearly, and naturally.');

    // Layer 2: Company Facts
    parts.push('');
    parts.push('--- COMPANY INFO ---');
    parts.push(`Company: ${tenant.companyName}`);
    parts.push(`Sector: ${tenant.sector}`);
    parts.push(`Working hours: ${business.workingDays} ${business.workingHours}`);
    if (business.services.length > 0) {
        parts.push(`Services: ${business.services.join(', ')}`);
    }
    if (business.phone) parts.push(`Phone: ${business.phone}`);
    if (business.email) parts.push(`Email: ${business.email}`);

    // Layer 3: RAG Context
    if (ragResults.length > 0) {
        parts.push('');
        parts.push('--- KNOWLEDGE BASE (ANSWER ONLY FROM THIS) ---');
        for (const result of ragResults) {
            parts.push(result.text);
        }
    }

    // Intent-specific
    if (currentIntent) {
        parts.push('');
        parts.push(`--- CURRENT CUSTOMER INTENT: ${currentIntent.toUpperCase()} ---`);
        parts.push(getIntentInstructionEN(currentIntent));
    }

    // Layer 4: Guardrails
    parts.push('');
    parts.push('--- ABSOLUTE RULES (NEVER VIOLATE) ---');
    parts.push('1. ONLY answer from the knowledge base above. Never fabricate information.');
    parts.push('2. If unsure, say "Let me check on that and get back to you."');
    parts.push('3. Never reveal you are an AI, bot, or assistant.');
    parts.push('4. Never mention competitor companies.');

    if (!guardrails.allowPriceQuotes) {
        parts.push('5. Do not quote prices unless they appear in the knowledge base.');
    }
    if (guardrails.forbiddenTopics.length > 0) {
        parts.push(`6. Never discuss: ${guardrails.forbiddenTopics.join(', ')}`);
    }

    parts.push('');
    parts.push('Keep responses short (1-3 sentences). Sound natural, like a real phone call.');

    return parts.join('\n');
}

// --- Intent Helpers ---

function getIntentLabelTR(intent: string): string {
    const labels: Record<string, string> = {
        appointment: 'Randevu Talebi',
        complaint: 'Şikayet',
        pricing: 'Fiyat Bilgisi',
        info: 'Bilgi Talebi',
        cancellation: 'İptal Talebi',
        greeting: 'Karşılama',
        farewell: 'Vedalaşma',
        escalation: 'Yetkili Bağlama',
        thanks: 'Teşekkür',
    };
    return labels[intent] || intent;
}

function getIntentInstructionTR(intent: string): string {
    const instructions: Record<string, string> = {
        appointment: 'Müşteri randevu almak istiyor. Tarih ve saat sor. book_appointment aracını kullan.',
        complaint: 'Müşteri şikayet ediyor. Detayı dinle, empatik ol. log_complaint aracını kullan.',
        pricing: 'Müşteri fiyat soruyor. Bilgi tabanında varsa paylaş, yoksa yetkili birime yönlendir.',
        info: 'Müşteri bilgi istiyor. Bilgi tabanından cevapla.',
        cancellation: 'Müşteri iptal istiyor. Sebebini sor, çözüm öner, ikna edemezsen iptal sürecini başlat.',
        greeting: 'Müşteriyi karşıla ve nasıl yardımcı olabileceğini sor.',
        farewell: 'Müşteriye teşekkür et ve uğurla.',
        escalation: 'Müşteriyi yetkili birime bağla. escalate_to_human aracını kullan.',
        thanks: 'Rica et ve başka bir konu olup olmadığını sor.',
    };
    return instructions[intent] || 'Müşteriye yardımcı ol.';
}

function getIntentInstructionEN(intent: string): string {
    const instructions: Record<string, string> = {
        appointment: 'Customer wants to book an appointment. Ask for date and time. Use book_appointment tool.',
        complaint: 'Customer has a complaint. Listen carefully, show empathy. Use log_complaint tool.',
        pricing: 'Customer asks about pricing. Share if in knowledge base, otherwise redirect to specialist.',
        info: 'Customer wants information. Answer from knowledge base.',
        cancellation: 'Customer wants to cancel. Ask why, offer solutions, escalate if needed.',
        greeting: 'Greet the customer and ask how you can help.',
        farewell: 'Thank the customer and say goodbye.',
        escalation: 'Connect customer to a supervisor. Use escalate_to_human tool.',
        thanks: 'Say you\'re welcome and ask if there\'s anything else.',
    };
    return instructions[intent] || 'Help the customer.';
}
