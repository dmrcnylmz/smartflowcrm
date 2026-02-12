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
        });
    } catch (error) {
        console.error('AI status check error:', error);
        return NextResponse.json(
            {
                status: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
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
