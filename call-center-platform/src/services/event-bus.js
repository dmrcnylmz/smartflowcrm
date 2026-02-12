/**
 * Event Bus — Production Hardening
 * 
 * Lightweight pub/sub for service decoupling.
 * Uses Redis pub/sub when available, in-process EventEmitter fallback.
 * 
 * Standard Events:
 *   call.started   — { tenantId, callId, direction, from, to }
 *   call.ended     — { tenantId, callId, duration, reason }
 *   ai.handoff     — { tenantId, callId, agentId, reason }
 *   billing.increment — { tenantId, resource, amount }
 *   agent.connected — { tenantId, agentId, callId }
 *   worker.overloaded — { workerId, load, capacity }
 *   circuit.opened  — { provider, failures }
 *   config.changed  — { tenantId, action, actor }
 *   auth.event      — { tenantId, action, userId, ip }
 */
const EventEmitter = require('events');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'event-bus' });

class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
        this._redis = null;
        this._subscriber = null;
        this._subscriptions = new Set();
        this._history = [];     // Recent events (circular buffer for debugging)
        this._historyMax = 500;
    }

    /**
     * Initialize with optional Redis for cross-process events.
     */
    async init(redisService) {
        this._redis = redisService;

        // If Redis is available and connected, set up pub/sub
        if (this._redis && !this._redis.isMemoryMode && process.env.REDIS_URL) {
            try {
                const { createClient } = require('redis');
                this._subscriber = createClient({ url: process.env.REDIS_URL });
                await this._subscriber.connect();
                logger.info('Event bus using Redis pub/sub');
            } catch (err) {
                logger.warn('Redis pub/sub unavailable, using local EventEmitter', { error: err.message });
                this._subscriber = null;
            }
        }

        this._setupMetricsListeners();
        logger.info('Event bus initialized', { mode: this._subscriber ? 'redis' : 'local' });
        return this;
    }

    /**
     * Publish an event to all subscribers.
     * @param {string} event - Event name (e.g., 'call.started')
     * @param {object} data  - Event payload
     */
    async publish(event, data = {}) {
        const envelope = {
            event,
            data,
            ts: Date.now(),
            source: process.env.WORKER_ID || 'primary'
        };

        // Record in history
        this._history.push(envelope);
        if (this._history.length > this._historyMax) {
            this._history = this._history.slice(-this._historyMax);
        }

        // Emit locally
        this.emit(event, data);
        this.emit('*', event, data);  // Wildcard listener

        // Publish to Redis if available
        if (this._redis && !this._redis.isMemoryMode) {
            try {
                await this._redis.publish(`bus:${event}`, JSON.stringify(envelope));
            } catch (err) {
                // Redis publish failure is non-fatal
                logger.debug('Redis publish failed', { event, error: err.message });
            }
        }

        metrics.inc('events_published', { event });
    }

    /**
     * Subscribe to a Redis channel for cross-process events.
     * @param {string} event - Event pattern to subscribe to
     */
    async subscribe(event) {
        if (this._subscriber && !this._subscriptions.has(event)) {
            try {
                await this._subscriber.subscribe(`bus:${event}`, (message) => {
                    try {
                        const envelope = JSON.parse(message);
                        // Avoid re-emitting own events
                        if (envelope.source !== (process.env.WORKER_ID || 'primary')) {
                            this.emit(event, envelope.data);
                        }
                    } catch (e) { /* ignore parse errors */ }
                });
                this._subscriptions.add(event);
            } catch (err) {
                logger.warn('Redis subscribe failed', { event, error: err.message });
            }
        }
    }

    /**
     * Get recent event history (for debugging/admin).
     * @param {number} limit - Max events to return
     * @param {string} [filter] - Optional event name filter
     */
    getHistory(limit = 50, filter) {
        let events = this._history;
        if (filter) events = events.filter(e => e.event === filter);
        return events.slice(-limit);
    }

    /**
     * Auto-track standard metrics from events.
     */
    _setupMetricsListeners() {
        this.on('call.started', (data) => {
            metrics.inc('calls_started', { tenant: data.tenantId, direction: data.direction || 'unknown' });
            logger.info('Call started', { callId: data.callId, tenantId: data.tenantId });
        });

        this.on('call.ended', (data) => {
            metrics.inc('calls_ended', { tenant: data.tenantId, reason: data.reason || 'normal' });
            if (data.duration) {
                metrics.observe('call_duration_seconds', data.duration, { tenant: data.tenantId });
            }
        });

        this.on('ai.handoff', (data) => {
            metrics.inc('handoffs_total', { tenant: data.tenantId });
            logger.info('AI handoff', { callId: data.callId, agentId: data.agentId });
        });

        this.on('billing.increment', (data) => {
            metrics.inc('billing_events', { tenant: data.tenantId, resource: data.resource });
        });

        this.on('circuit.opened', (data) => {
            metrics.inc('circuit_breaker_opens', { provider: data.provider });
            logger.warn('Circuit breaker opened', data);
        });

        this.on('worker.overloaded', (data) => {
            metrics.inc('worker_overload_events', { worker: data.workerId });
            logger.warn('Worker overloaded', data);
        });
    }

    async shutdown() {
        this.removeAllListeners();
        if (this._subscriber?.isOpen) {
            try { await this._subscriber.quit(); } catch (e) { /* ignore */ }
        }
    }
}

// Singleton
const bus = new EventBus();
module.exports = bus;
