/**
 * Retry with exponential backoff + jitter
 * For voice pipeline external API calls
 */

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitter: boolean;
}

const DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 2,
    baseDelayMs: 200,
    maxDelayMs: 2000,
    jitter: true,
};

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    config: Partial<RetryConfig> = {},
): Promise<T> {
    const { maxRetries, baseDelayMs, maxDelayMs, jitter } = { ...DEFAULT_CONFIG, ...config };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt === maxRetries) break;

            // Don't retry non-transient errors
            if (isNonTransientError(error)) break;

            const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
            const actualDelay = jitter ? delay * (0.5 + Math.random() * 0.5) : delay;

            await new Promise(resolve => setTimeout(resolve, actualDelay));
        }
    }

    throw lastError;
}

function isNonTransientError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        // Don't retry auth errors, validation errors, or quota exceeded
        if (msg.includes('401') || msg.includes('403') || msg.includes('invalid') ||
            msg.includes('quota') || msg.includes('billing')) {
            return true;
        }
    }
    return false;
}
