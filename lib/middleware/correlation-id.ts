/**
 * Correlation ID Middleware
 *
 * Generates unique request IDs for tracing requests across services.
 * Uses AsyncLocalStorage for context propagation without explicit passing.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { NextRequest, NextResponse } from 'next/server';

// --- Context Store ---

interface RequestContext {
    correlationId: string;
    startTime: number;
    tenantId?: string;
}

const requestStore = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current correlation ID from async context.
 * Returns 'unknown' if called outside of a request context.
 */
export function getCorrelationId(): string {
    return requestStore.getStore()?.correlationId || 'unknown';
}

/**
 * Get the full request context from async local storage.
 */
export function getRequestContext(): RequestContext | undefined {
    return requestStore.getStore();
}

/**
 * Wrap an API route handler with correlation ID context.
 * Reads X-Request-ID/X-Correlation-ID from incoming request,
 * or generates a new UUID if not present.
 *
 * Adds X-Correlation-ID to the response headers.
 */
export function withCorrelationId<T>(
    handler: (req: NextRequest, context?: T) => Promise<NextResponse>
): (req: NextRequest, context?: T) => Promise<NextResponse> {
    return async (req: NextRequest, context?: T): Promise<NextResponse> => {
        const incomingId =
            req.headers.get('x-request-id') ||
            req.headers.get('x-correlation-id');

        const correlationId = incomingId || crypto.randomUUID();

        const requestContext: RequestContext = {
            correlationId,
            startTime: Date.now(),
        };

        return requestStore.run(requestContext, async () => {
            const response = await handler(req, context);

            // Add correlation ID to response headers
            response.headers.set('X-Correlation-ID', correlationId);

            // Log request duration
            const duration = Date.now() - requestContext.startTime;
            if (duration > 3000) {
                console.warn(JSON.stringify({
                    level: 'warn',
                    msg: 'Slow request detected',
                    correlationId,
                    durationMs: duration,
                    path: req.nextUrl.pathname,
                    method: req.method,
                }));
            }

            return response;
        });
    };
}

/**
 * Create a logger binding with correlation ID included.
 * Use with the existing logger.child() method.
 */
export function correlationBindings(): Record<string, unknown> {
    const ctx = requestStore.getStore();
    if (!ctx) return {};
    return {
        correlationId: ctx.correlationId,
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
    };
}

/**
 * Set the tenant ID in the current request context.
 * Call this after authentication resolves the tenant.
 */
export function setContextTenantId(tenantId: string): void {
    const ctx = requestStore.getStore();
    if (ctx) {
        ctx.tenantId = tenantId;
    }
}
