// Mock Personaplex Server for Local Testing
// Simulates GPU server responses without actual API keys

import { NextRequest, NextResponse } from 'next/server';

// Demo personas
const MOCK_PERSONAS = [
    { id: 'default', name: 'Genel Asistan', style: 'professional' },
    { id: 'support', name: 'Müşteri Destek', style: 'empathetic' },
    { id: 'sales', name: 'Satış Temsilcisi', style: 'persuasive' },
];

// Demo responses based on intent
const MOCK_RESPONSES: Record<string, { intent: string; response: string; confidence: number }> = {
    randevu: {
        intent: 'appointment',
        response: 'Tabii, randevu oluşturabilirim. Hangi gün ve saat uygun olur?',
        confidence: 0.92,
    },
    şikayet: {
        intent: 'complaint',
        response: 'Yaşadığınız sorun için üzgünüm. Detayları alabilir miyim?',
        confidence: 0.88,
    },
    fiyat: {
        intent: 'info_request',
        response: 'Fiyat bilgisi için size yardımcı olabilirim. Hangi ürün/hizmet ile ilgileniyorsunuz?',
        confidence: 0.85,
    },
    merhaba: {
        intent: 'greeting',
        response: 'Merhaba! SmartFlow CRM\'e hoş geldiniz. Size nasıl yardımcı olabilirim?',
        confidence: 0.95,
    },
    teşekkür: {
        intent: 'thanks',
        response: 'Rica ederim! Başka bir konuda yardımcı olabilir miyim?',
        confidence: 0.90,
    },
};

// Default response for unknown intents
const DEFAULT_RESPONSE = {
    intent: 'unknown',
    response: 'Anladım. Bu konuda size nasıl yardımcı olabilirim?',
    confidence: 0.60,
};

// Simulate inference latency
function simulateLatency(): Promise<void> {
    const latency = 100 + Math.random() * 200; // 100-300ms
    return new Promise(resolve => setTimeout(resolve, latency));
}

// Match intent from text
function matchIntent(text: string): typeof DEFAULT_RESPONSE {
    const lowerText = text.toLowerCase();

    for (const [keyword, response] of Object.entries(MOCK_RESPONSES)) {
        if (lowerText.includes(keyword)) {
            return response;
        }
    }

    return DEFAULT_RESPONSE;
}

// GET: Mock health/status/personas
export async function GET(request: NextRequest) {
    const action = request.nextUrl.searchParams.get('action') || 'health';

    await simulateLatency();

    if (action === 'health') {
        return NextResponse.json({
            status: 'healthy',
            model_loaded: true,
            cuda_available: false,
            gpu_name: 'Mock GPU (Demo Mode)',
            active_sessions: 0,
            max_sessions: 4,
            mode: 'mock',
        });
    }

    if (action === 'personas') {
        return NextResponse.json({ personas: MOCK_PERSONAS });
    }

    if (action === 'status') {
        return NextResponse.json({
            available: true,
            model_loaded: true,
            active_sessions: 0,
            max_sessions: 4,
            gpu_name: 'Mock GPU (Demo Mode)',
            mode: 'mock',
        });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// POST: Mock inference
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { text, persona = 'default', action = 'infer' } = body;

        await simulateLatency();

        if (action === 'infer') {
            const result = matchIntent(text || '');

            return NextResponse.json({
                session_id: `mock_${Date.now()}`,
                text: result.response,
                intent: result.intent,
                confidence: result.confidence,
                persona,
                latency_ms: Math.round(100 + Math.random() * 200),
                mode: 'mock',
            });
        }

        // Mock session save
        if (action === 'save') {
            return NextResponse.json({
                success: true,
                callLogId: `mock_call_${Date.now()}`,
                mode: 'mock',
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        return NextResponse.json(
            { error: 'Mock server error', message: String(error) },
            { status: 500 }
        );
    }
}
