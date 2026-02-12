/**
 * Tenant Types — Multi-Tenant Data Model
 *
 * Each company gets an isolated AI agent with:
 * - Own knowledge base (RAG documents)
 * - Own voice/persona configuration
 * - Own escalation rules and quotas
 * - No cross-tenant data leakage
 */

// --- Core Tenant Config ---

export interface TenantConfig {
    /** Unique tenant identifier */
    id: string;

    /** Company display name */
    companyName: string;

    /** Business sector (e.g., "Sigorta", "E-Ticaret") */
    sector: string;

    /** Primary language support */
    language: 'tr' | 'en' | 'tr-en';

    /** AI agent persona */
    agent: AgentPersona;

    /** Business information */
    business: BusinessInfo;

    /** Voice configuration */
    voice: VoiceConfig;

    /** Safety & compliance rules */
    guardrails: TenantGuardrails;

    /** Usage quotas */
    quotas: TenantQuotas;

    /** Active status */
    active: boolean;

    /** Creation timestamp */
    createdAt: string;

    /** Last updated timestamp */
    updatedAt: string;
}

// --- Agent Persona ---

export interface AgentPersona {
    /** Agent display name (e.g., "Ayşe") */
    name: string;

    /** Agent role (e.g., "Müşteri Temsilcisi") */
    role: string;

    /** Personality traits for prompt (e.g., "profesyonel, nazik, çözüm odaklı") */
    traits: string[];

    /** Greeting message */
    greeting: string;

    /** Farewell message */
    farewell: string;
}

// --- Business Info ---

export interface BusinessInfo {
    /** Working hours (e.g., "09:00-18:00") */
    workingHours: string;

    /** Working days (e.g., "Pazartesi-Cuma") */
    workingDays: string;

    /** Services offered */
    services: string[];

    /** Contact phone */
    phone?: string;

    /** Contact email */
    email?: string;

    /** Website */
    website?: string;

    /** Address */
    address?: string;
}

// --- Voice Config ---

export interface VoiceConfig {
    /** ElevenLabs voice ID */
    voiceId: string;

    /** TTS model (default: eleven_flash_v2_5) */
    ttsModel?: string;

    /** STT language code (default: tr) */
    sttLanguage?: string;

    /** Voice stability (0-1) */
    stability?: number;

    /** Voice similarity boost (0-1) */
    similarityBoost?: number;
}

// --- Guardrails ---

export interface TenantGuardrails {
    /** Topics the agent MUST NOT discuss */
    forbiddenTopics: string[];

    /** Competitor company names to never mention */
    competitorNames: string[];

    /** Allow the agent to quote prices from RAG */
    allowPriceQuotes: boolean;

    /** Allow the agent to commit to contract terms */
    allowContractTerms: boolean;

    /** Maximum response length in characters */
    maxResponseLength: number;

    /** Escalation rules */
    escalationRules: EscalationRule[];
}

// --- Escalation Rules ---

export interface EscalationRule {
    /** Rule trigger condition */
    trigger: 'intent' | 'keyword' | 'confidence' | 'request';

    /** Trigger value (e.g., intent name, keyword) */
    value: string;

    /** Target department */
    department: string;

    /** Priority level */
    priority: 'low' | 'medium' | 'high' | 'critical';

    /** Auto-escalate without confirmation */
    autoEscalate: boolean;
}

// --- Quotas ---

export interface TenantQuotas {
    /** Maximum daily call minutes */
    dailyMinutes: number;

    /** Maximum monthly calls */
    monthlyCalls: number;

    /** Maximum concurrent sessions */
    maxConcurrentSessions: number;

    /** Cost per minute (for billing) */
    costPerMinute?: number;
}

// --- Session & Metrics ---

export interface VoiceSessionState {
    sessionId: string;
    tenantId: string;
    language: 'tr' | 'en';
    startedAt: Date;
    conversationHistory: ConversationTurn[];
    currentIntent: string | null;
    metrics: SessionMetrics;
}

export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    intent?: string;
    toolCalls?: ToolCallRecord[];
}

export interface ToolCallRecord {
    toolName: string;
    arguments: Record<string, unknown>;
    result?: unknown;
    executedAt: Date;
}

export interface SessionMetrics {
    turnCount: number;
    totalLatencyMs: number;
    sttLatencyMs: number[];
    llmLatencyMs: number[];
    ttsLatencyMs: number[];
    intentsDetected: string[];
    escalated: boolean;
    escalationReason?: string;
    /** Phase A: shortcuts that bypassed LLM */
    shortcutCount?: number;
    /** Phase A: cache hits */
    cacheHits?: number;
    /** Phase A: cache misses */
    cacheMisses?: number;
}

// --- Default Tenant (Development) ---

export const DEFAULT_TENANT: TenantConfig = {
    id: 'default',
    companyName: 'SmartFlow Demo',
    sector: 'Teknoloji',
    language: 'tr-en',
    agent: {
        name: 'Ayşe',
        role: 'Müşteri Temsilcisi',
        traits: ['profesyonel', 'nazik', 'çözüm odaklı', 'sabırlı'],
        greeting: 'Merhaba, SmartFlow Demo\'ya hoş geldiniz. Ben Ayşe, size nasıl yardımcı olabilirim?',
        farewell: 'Aradığınız için teşekkür ederiz. İyi günler dileriz.',
    },
    business: {
        workingHours: '09:00-18:00',
        workingDays: 'Pazartesi-Cuma',
        services: ['CRM Yönetimi', 'Sesli AI Asistan', 'Otomasyon'],
        phone: '+90 212 000 00 00',
        email: 'info@smartflow.demo',
        website: 'https://smartflow.demo',
    },
    voice: {
        voiceId: 'EXAVITQu4vr4xnSDxMaL', // Sarah - professional female
        ttsModel: 'eleven_flash_v2_5',
        sttLanguage: 'tr',
        stability: 0.5,
        similarityBoost: 0.75,
    },
    guardrails: {
        forbiddenTopics: [],
        competitorNames: [],
        allowPriceQuotes: false,
        allowContractTerms: false,
        maxResponseLength: 500,
        escalationRules: [
            {
                trigger: 'intent',
                value: 'escalation',
                department: 'Genel',
                priority: 'high',
                autoEscalate: true,
            },
        ],
    },
    quotas: {
        dailyMinutes: 60,
        monthlyCalls: 500,
        maxConcurrentSessions: 3,
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};
