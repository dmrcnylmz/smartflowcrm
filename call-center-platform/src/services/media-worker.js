/**
 * Media Worker — Horizontal Scale
 * 
 * Represents a single media processing worker instance.
 * Manages concurrent call capacity, load reporting, and graceful drain.
 * 
 * In single-process mode this runs in-process.
 * In multi-process mode each worker is a separate Node.js process.
 */
const { v4: uuidv4 } = require('uuid');
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');
const workerRegistry = require('./worker-registry');
const eventBus = require('./event-bus');

const logger = rootLogger.child({ component: 'media-worker' });

class MediaWorker {
    constructor() {
        this._id = process.env.WORKER_ID || `worker-${uuidv4().slice(0, 8)}`;
        this._capacity = parseInt(process.env.WORKER_CAPACITY || '50', 10);
        this._host = process.env.WORKER_HOST || 'localhost';
        this._port = parseInt(process.env.WORKER_PORT || '0', 10);
        this._activeSessions = new Map();  // callId → session metadata
        this._draining = false;
        this._heartbeatTimer = null;
        this._registered = false;
    }

    get id() { return this._id; }
    get load() { return this._activeSessions.size; }
    get capacity() { return this._capacity; }
    get utilization() { return Math.round((this.load / this._capacity) * 100); }
    get isDraining() { return this._draining; }

    /**
     * Start the worker — register with registry and begin heartbeat.
     */
    async start() {
        await workerRegistry.register({
            id: this._id,
            host: this._host,
            port: this._port,
            capacity: this._capacity,
            tags: [process.env.WORKER_TAG || 'default']
        });

        this._registered = true;

        // Begin heartbeat
        this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), 5000);

        logger.info('Media worker started', {
            workerId: this._id,
            capacity: this._capacity,
            host: this._host,
            port: this._port
        });

        metrics.setGauge('worker_capacity', this._capacity, { worker: this._id });
        return this;
    }

    /**
     * Check if this worker can accept a new call.
     */
    canAccept() {
        if (this._draining) return false;
        return this.load < this._capacity;
    }

    /**
     * Track a new call session on this worker.
     * @param {string} callId
     * @param {object} meta - { tenantId, direction, from, to }
     */
    async trackCall(callId, meta = {}) {
        if (!this.canAccept()) {
            eventBus.publish('worker.overloaded', {
                workerId: this._id,
                load: this.load,
                capacity: this._capacity
            });
            return false;
        }

        this._activeSessions.set(callId, {
            ...meta,
            startedAt: Date.now()
        });

        await workerRegistry.assignCall(this._id, callId);
        metrics.setGauge('active_calls', this.load, { worker: this._id });

        eventBus.publish('call.started', {
            tenantId: meta.tenantId,
            callId,
            direction: meta.direction,
            workerId: this._id
        });

        return true;
    }

    /**
     * Release a call session from this worker.
     * @param {string} callId
     * @param {string} [reason='normal']
     */
    async releaseCall(callId, reason = 'normal') {
        const session = this._activeSessions.get(callId);
        if (!session) return;

        const duration = Math.round((Date.now() - session.startedAt) / 1000);
        this._activeSessions.delete(callId);

        await workerRegistry.releaseCall(this._id, callId);
        metrics.setGauge('active_calls', this.load, { worker: this._id });

        eventBus.publish('call.ended', {
            tenantId: session.tenantId,
            callId,
            duration,
            reason,
            workerId: this._id
        });
    }

    /**
     * Begin draining — stop accepting new calls.
     * Existing calls continue until completion.
     * @returns {Promise} Resolves when all calls drained.
     */
    async drain() {
        this._draining = true;
        logger.info('Worker draining', { workerId: this._id, activeCalls: this.load });

        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (this.load === 0) {
                    clearInterval(check);
                    logger.info('Worker drained', { workerId: this._id });
                    resolve();
                }
            }, 1000);

            // Force resolve after 60s timeout
            setTimeout(() => {
                clearInterval(check);
                logger.warn('Worker drain timeout', { workerId: this._id, remaining: this.load });
                resolve();
            }, 60000);
        });
    }

    /**
     * Graceful shutdown.
     */
    async shutdown() {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);

        // Drain active calls
        if (this.load > 0) {
            await this.drain();
        }

        // Deregister from registry
        if (this._registered) {
            await workerRegistry.deregister(this._id);
        }

        this._activeSessions.clear();
        logger.info('Media worker shut down', { workerId: this._id });
    }

    /**
     * Get worker status snapshot.
     */
    getStatus() {
        return {
            id: this._id,
            capacity: this._capacity,
            load: this.load,
            utilization: this.utilization,
            draining: this._draining,
            activeSessions: [...this._activeSessions.entries()].map(([id, meta]) => ({
                callId: id,
                tenantId: meta.tenantId,
                duration: Math.round((Date.now() - meta.startedAt) / 1000)
            }))
        };
    }

    _sendHeartbeat() {
        workerRegistry.heartbeat(this._id, {
            load: this.load,
            activeCalls: [...this._activeSessions.keys()]
        }).catch(err => {
            logger.debug('Heartbeat failed', { error: err.message });
        });
    }
}

// Singleton worker for this process
const worker = new MediaWorker();
module.exports = worker;
