/**
 * Structured Logger — Lightweight JSON Logging for Vercel Serverless
 *
 * Zero external dependencies. Outputs structured JSON in production,
 * pretty-printed human-readable logs in development.
 *
 * Features:
 * - Log level filtering via LOG_LEVEL env var (default: 'info' in prod, 'debug' in dev)
 * - Each entry has: timestamp, level, service, message, extra data
 * - child() creates loggers with additional bound context (tenantId, sessionId, etc.)
 * - Error objects are automatically serialized (message + stack)
 * - Pre-configured loggers for billing, voice, auth, system
 *
 * Usage:
 *   import { billingLogger } from '@/lib/utils/logger';
 *   billingLogger.info('Webhook received', { eventName, tenantId });
 *   billingLogger.error('Signature verification failed', { signature });
 *
 *   const reqLogger = billingLogger.child({ requestId: 'abc-123' });
 *   reqLogger.warn('Retrying', { attempt: 2 });
 */

// ---- Types -----------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
    level: LogLevel;
    msg: string;
    timestamp: string;
    service: string;
    [key: string]: unknown;
}

// ---- Constants -------------------------------------------------------------

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
};

const isDev = process.env.NODE_ENV !== 'production';

function getMinLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
    if (envLevel && envLevel in LOG_LEVEL_VALUES) {
        return envLevel;
    }
    return isDev ? 'debug' : 'info';
}

// ---- Error Serialization ---------------------------------------------------

function serializeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
        return {
            errorName: err.name,
            errorMessage: err.message,
            ...(err.stack ? { errorStack: err.stack } : {}),
            ...(('code' in err && err.code) ? { errorCode: (err as { code: unknown }).code } : {}),
        };
    }
    if (typeof err === 'string') {
        return { errorMessage: err };
    }
    return { errorMessage: String(err) };
}

// Scan data values and serialize any Error objects found
function serializeDataErrors(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (value instanceof Error) {
            result[key] = serializeError(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ---- Pretty Printer (Dev) --------------------------------------------------

const LEVEL_COLORS: Record<LogLevel, string> = {
    debug: '\x1b[90m',  // gray
    info: '\x1b[36m',   // cyan
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',  // red
    fatal: '\x1b[35m',  // magenta
};
const RESET = '\x1b[0m';

function prettyPrint(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level] || '';
    const levelTag = `${color}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
    const serviceTag = `\x1b[90m[${entry.service}]${RESET}`;
    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false });

    // Extract known fields, leave the rest as extra
    const { level: _l, msg: _m, timestamp: _t, service: _s, ...extra } = entry;
    const extraStr = Object.keys(extra).length > 0
        ? ` ${JSON.stringify(extra)}`
        : '';

    const consoleFn =
        entry.level === 'fatal' || entry.level === 'error'
            ? console.error
            : entry.level === 'warn'
                ? console.warn
                : entry.level === 'debug'
                    ? console.debug
                    : console.info;

    consoleFn(`${time} ${levelTag} ${serviceTag} ${entry.msg}${extraStr}`);
}

// ---- Logger Class ----------------------------------------------------------

class Logger {
    private service: string;
    private bindings: Record<string, unknown>;

    constructor(service: string, bindings?: Record<string, unknown>) {
        this.service = service;
        this.bindings = bindings || {};
    }

    /**
     * Create a child logger with additional bound context.
     * The child inherits the service name and parent bindings.
     */
    child(bindings: Record<string, unknown>): Logger {
        return new Logger(this.service, { ...this.bindings, ...bindings });
    }

    debug(msg: string, data?: Record<string, unknown>): void {
        this._log('debug', msg, data);
    }

    info(msg: string, data?: Record<string, unknown>): void {
        this._log('info', msg, data);
    }

    warn(msg: string, data?: Record<string, unknown>): void {
        this._log('warn', msg, data);
    }

    error(msg: string, data?: Record<string, unknown>): void {
        this._log('error', msg, data);
    }

    fatal(msg: string, data?: Record<string, unknown>): void {
        this._log('fatal', msg, data);
    }

    // ---- Internal ----------------------------------------------------------

    private _log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
        // Level filter
        if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[getMinLevel()]) {
            return;
        }

        const entry: LogEntry = {
            level,
            msg,
            timestamp: new Date().toISOString(),
            service: this.service,
            ...this.bindings,
            ...(data ? serializeDataErrors(data) : {}),
        };

        if (isDev) {
            prettyPrint(entry);
        } else {
            // Production: structured JSON to stdout/stderr
            const jsonStr = JSON.stringify(entry);
            if (level === 'error' || level === 'fatal') {
                console.error(jsonStr);
            } else if (level === 'warn') {
                console.warn(jsonStr);
            } else {
                console.log(jsonStr);
            }
        }
    }
}

// ---- Factory ---------------------------------------------------------------

export function createLogger(service: string): Logger {
    return new Logger(service);
}

// ---- Pre-Configured Loggers ------------------------------------------------

export const billingLogger = createLogger('billing');
export const voiceLogger = createLogger('voice');
export const authLogger = createLogger('auth');
export const systemLogger = createLogger('system');

// ---- Backward-Compatible Default Logger ------------------------------------
// Existing code imports: import { logger } from '@/lib/utils/logger';
// This keeps the same API shape (debug/info/warn/error) so nothing breaks.

export const logger = createLogger('app');
