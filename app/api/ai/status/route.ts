import { NextResponse } from 'next/server';
import { isOllamaAvailable, getAvailableModels } from '@/lib/ai/ollama';

export async function GET() {
    try {
        const ollamaAvailable = await isOllamaAvailable();
        const models = ollamaAvailable ? await getAvailableModels() : [];

        return NextResponse.json({
            status: 'ok',
            providers: {
                ollama: {
                    available: ollamaAvailable,
                    models,
                    url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                },
                openai: {
                    available: !!process.env.OPENAI_API_KEY,
                    models: process.env.OPENAI_API_KEY ? ['gpt-4', 'gpt-3.5-turbo'] : [],
                },
            },
            defaultProvider: ollamaAvailable ? 'ollama' : 'keyword',
        }, {
            headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
        });
    } catch {
        return NextResponse.json(
            {
                status: 'error',
                message: 'AI status check failed',
                providers: {
                    ollama: { available: false, models: [] },
                    openai: { available: false, models: [] },
                },
                defaultProvider: 'keyword',
            },
            { status: 500 }
        );
    }
}
