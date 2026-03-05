// Voice API Test Endpoint
// For E2E testing and validation

import { NextRequest, NextResponse } from 'next/server';

interface TestScenario {
    name: string;
    input: string;
    expectedIntent: string;
}

const TEST_SCENARIOS: TestScenario[] = [
    { name: 'Randevu Talebi', input: 'Yarın için randevu almak istiyorum', expectedIntent: 'appointment' },
    { name: 'Şikayet', input: 'Ürünümle ilgili bir şikayet etmek istiyorum', expectedIntent: 'complaint' },
    { name: 'Fiyat Bilgisi', input: 'Fiyatlar hakkında bilgi alabilir miyim?', expectedIntent: 'info_request' },
    { name: 'Selamlama', input: 'Merhaba, iyi günler', expectedIntent: 'greeting' },
    { name: 'Teşekkür', input: 'Teşekkür ederim, yardımcı oldunuz', expectedIntent: 'thanks' },
];

export async function GET() {
    return NextResponse.json({
        scenarios: TEST_SCENARIOS,
        endpoints: {
            health: '/api/voice/health',
            mock: '/api/voice/mock',
            session: '/api/voice/session',
            connect: '/api/voice/connect',
            metrics: '/api/metrics',
        },
        usage: {
            test_health: 'GET /api/voice/health?mock=true',
            test_infer: 'POST /api/voice/mock with { "text": "randevu istiyorum", "action": "infer" }',
            run_all: 'POST /api/voice/test with { "run": true }',
        },
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.run) {
            return NextResponse.json({ error: 'Set run=true to execute tests' }, { status: 400 });
        }

        const results: { scenario: string; passed: boolean; response: unknown; error?: string }[] = [];
        const baseUrl = request.nextUrl.origin;

        // Test each scenario
        for (const scenario of TEST_SCENARIOS) {
            try {
                const response = await fetch(`${baseUrl}/api/voice/mock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: scenario.input, action: 'infer' }),
                });

                const data = await response.json();
                const passed = data.intent === scenario.expectedIntent;

                results.push({
                    scenario: scenario.name,
                    passed,
                    response: {
                        intent: data.intent,
                        expected: scenario.expectedIntent,
                        confidence: data.confidence,
                    },
                });
            } catch (error) {
                results.push({
                    scenario: scenario.name,
                    passed: false,
                    response: null,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        // Health check test
        try {
            const healthRes = await fetch(`${baseUrl}/api/voice/health?mock=true`);
            const healthData = await healthRes.json();

            results.push({
                scenario: 'Health Check',
                passed: healthData.status === 'healthy',
                response: healthData,
            });
        } catch (error) {
            results.push({
                scenario: 'Health Check',
                passed: false,
                response: null,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        const passedCount = results.filter(r => r.passed).length;
        const totalCount = results.length;

        return NextResponse.json({
            summary: {
                passed: passedCount,
                failed: totalCount - passedCount,
                total: totalCount,
                success_rate: `${Math.round((passedCount / totalCount) * 100)}%`,
            },
            results,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        return NextResponse.json(
            { error: 'Test execution failed', message: String(error) },
            { status: 500 }
        );
    }
}
