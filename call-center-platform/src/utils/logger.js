/**
 * Structured Logger — Phase 11 Observability
 * 
 * JSON-structured logging with context enrichment,
 * performance timers, and level-based filtering.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

class Logger {
    constructor(context = {}) {
        this._context = context;
    }

    child(extra) {
        return new Logger({ ...this._context, ...extra });
    }

    _log(level, message, data = {}) {
        if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

        const entry = {
            ts: new Date().toISOString(),
            level,
            msg: message,
            ...this._context,
            ...data
        };

        // Remove undefined values
        Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);

        const line = JSON.stringify(entry);
        if (level === 'error') {
            process.stderr.write(line + '\n');
        } else {
            process.stdout.write(line + '\n');
        }
    }

    debug(msg, data) { this._log('debug', msg, data); }
    info(msg, data) { this._log('info', msg, data); }
    warn(msg, data) { this._log('warn', msg, data); }
    error(msg, data) { this._log('error', msg, data); }

    /**
     * Start a performance timer.
     * @returns {{ end: () => number }} Timer object; call .end() to get elapsed ms.
     */
    startTimer(label) {
        const start = process.hrtime.bigint();
        return {
            end: () => {
                const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
                this._log('info', `timer:${label}`, { duration_ms: Math.round(elapsed * 100) / 100 });
                return elapsed;
            }
        };
    }
}

const rootLogger = new Logger({ service: 'call-center' });

module.exports = { Logger, logger: rootLogger };
