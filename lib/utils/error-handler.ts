/**
 * Centralized Error Handler
 * 
 * Provides consistent error formatting, logging, and response generation
 * for all API routes in SmartFlow CRM.
 */

import { NextResponse } from 'next/server';

// --- Error Types ---

export type ErrorCode =
    | 'VALIDATION_ERROR'
    | 'AUTH_ERROR'
    | 'NOT_FOUND'
    | 'RATE_LIMITED'
    | 'FIREBASE_ERROR'
    | 'EXTERNAL_SERVICE'
    | 'INTERNAL_ERROR';

interface ApiError {
    code: ErrorCode;
    message: string;
    details?: string;
    statusCode: number;
}

interface ErrorResponseBody {
    error: string;
    code: ErrorCode;
    details?: string;
    timestamp: string;
}

// --- Error Factory ---

export function createApiError(
    code: ErrorCode,
    message: string,
    details?: string,
): ApiError {
    const statusMap: Record<ErrorCode, number> = {
        VALIDATION_ERROR: 400,
        AUTH_ERROR: 401,
        NOT_FOUND: 404,
        RATE_LIMITED: 429,
        FIREBASE_ERROR: 503,
        EXTERNAL_SERVICE: 502,
        INTERNAL_ERROR: 500,
    };

    return {
        code,
        message,
        details,
        statusCode: statusMap[code],
    };
}

// --- Error Response ---

export function errorResponse(error: ApiError): NextResponse<ErrorResponseBody> {
    const body: ErrorResponseBody = {
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString(),
    };

    // Only include details in development
    if (process.env.NODE_ENV !== 'production' && error.details) {
        body.details = error.details;
    }

    return NextResponse.json(body, { status: error.statusCode });
}

// --- Catch-all Handler ---

export function handleApiError(err: unknown, context?: string): NextResponse<ErrorResponseBody> {
    const prefix = context ? `[${context}]` : '[API]';

    // Firebase permission errors
    const errCode = typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code: string }).code
        : '';
    if (err instanceof Error && (
        err.message.includes('permission') ||
        err.message.includes('Permission') ||
        errCode === 'permission-denied'
    )) {
        console.warn(`${prefix} Firebase permission error:`, err.message);
        return errorResponse(createApiError(
            'FIREBASE_ERROR',
            'Veritabanı erişim hatası',
            err.message,
        ));
    }

    // Network/fetch errors (external services)
    if (err instanceof Error && (
        err.message.includes('fetch') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('timeout') ||
        err.message.includes('AbortError')
    )) {
        console.error(`${prefix} External service error:`, err.message);
        return errorResponse(createApiError(
            'EXTERNAL_SERVICE',
            'Harici servis erişim hatası',
            err.message,
        ));
    }

    // Validation errors
    if (err instanceof Error && err.message.includes('Invalid')) {
        return errorResponse(createApiError(
            'VALIDATION_ERROR',
            err.message,
        ));
    }

    // Generic errors
    console.error(`${prefix} Unhandled error:`, err);
    return errorResponse(createApiError(
        'INTERNAL_ERROR',
        'Sunucu hatası oluştu',
        err instanceof Error ? err.message : String(err),
    ));
}

// --- Rate Limit Response ---

export function rateLimitResponse(retryAfterMs: number = 60000): NextResponse {
    return NextResponse.json(
        {
            error: 'Çok fazla istek gönderildi. Lütfen bekleyin.',
            code: 'RATE_LIMITED',
            retryAfterMs,
            timestamp: new Date().toISOString(),
        },
        {
            status: 429,
            headers: {
                'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
            },
        },
    );
}

// --- Validation Helpers ---

export function requireFields<T extends Record<string, unknown>>(
    body: T,
    fields: (keyof T)[],
): ApiError | null {
    const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
    if (missing.length > 0) {
        return createApiError(
            'VALIDATION_ERROR',
            `Eksik alanlar: ${missing.join(', ')}`,
        );
    }
    return null;
}

export function requireAuth(tenantId: string | null): ApiError | null {
    if (!tenantId) {
        return createApiError(
            'AUTH_ERROR',
            'Kimlik doğrulama gerekli',
        );
    }
    return null;
}
