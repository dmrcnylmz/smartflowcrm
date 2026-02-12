/**
 * Worker Registry — Horizontal Scale
 * 
 * Tracks media worker instances for load-based routing.
 * Uses Redis for multi-process, in-memory Map for single-process.
 * 
 * Features:
 *   - Worker registration with heartbeat
 *   - Least-loaded routing algorithm
 *   - Sticky routing by call_id
 *   - Dead worker eviction (missed heartbeats)
 */
const { logger: rootLogger } = require('../utils/logger');
const metrics = require('./metrics.service');

const logger = rootLogger.child({ component: 'worker-registry' });

const HEARTBEAT_INTERVAL = 5000;    // 5s
const HEARTBEAT_TIMEOUT = 15000;    // 15s — evict after 3 missed beats
const STICKY_TTL = 3600000;         // 1h — sticky routing expiry

class WorkerRegistry {
    constructor() {
        this._workers = new Map();      // workerId → { capacity, load, lastHeartbeat, ... }
        this._stickyRoutes = new Map();  // callId → workerId
        this._redis = null;
        this._heartbeatTimer = null;
        this._evictionTimer = null;
    }

    /**
     * Initialize registry, optionally backed by Redis.
     */
    async init(redisService) {
        this._redis = redisService;

        // Start eviction timer
        this._evictionTimer = setInterval(() => this._evictDead(), HEARTBEAT_INTERVAL);

        logger.info('Worker registry initialized', {
            mode: this._redis?.isMemoryMode === false ? 'redis' : 'local'
        });
        return this;
    }

    /**
     * Register a worker instance.
     * @param {object} worker - { id, host, port, capacity, tags }
     */
    async register(worker) {
        const entry = {
            id: worker.id,
            host: worker.host || 'localhost',
            port: worker.port || 0,
            capacity: worker.capacity || 50,
            load: 0,
            activeCalls: [],
            lastHeartbeat: Date.now(),
            registeredAt: Date.now(),
            tags: worker.tags || []
        };

        this._workers.set(worker.id, entry);

        if (this._redis && !this._redis.isMemoryMode) {
            await this._redis.hset('workers', worker.id, JSON.stringify(entry));
        }

        metrics.setGauge('worker_count', this._workers.size);
        logger.info('Worker registered', { workerId: worker.id, capacity: entry.capacity });
    }

    /**
     * Update worker heartbeat and load.
     * @param {string} workerId
     * @param {object} status - { load, activeCalls }
     */
    async heartbeat(workerId, status = {}) {
        const worker = this._workers.get(workerId);
        if (!worker) return;

        worker.lastHeartbeat = Date.now();
        worker.load = status.load || worker.load;
        if (status.activeCalls !== undefined) worker.activeCalls = status.activeCalls;

        if (this._redis && !this._redis.isMemoryMode) {
            await this._redis.hset('workers', workerId, JSON.stringify(worker));
        }

        metrics.setGauge('worker_load', worker.load, { worker: workerId });
    }

    /**
     * Deregister a worker (graceful shutdown).
     */
    async deregister(workerId) {
        this._workers.delete(workerId);

        if (this._redis && !this._redis.isMemoryMode) {
            await this._redis.hdel('workers', workerId);
        }

        // Clean up sticky routes pointing to this worker
        for (const [callId, wId] of this._stickyRoutes) {
            if (wId === workerId) this._stickyRoutes.delete(callId);
        }

        metrics.setGauge('worker_count', this._workers.size);
        logger.info('Worker deregistered', { workerId });
    }

    /**
     * Route a call to the best worker.
     * Uses sticky routing if call already assigned, otherwise least-loaded.
     * @param {string} callId
     * @returns {{ workerId: string, host: string, port: number } | null}
     */
    route(callId) {
        // Check sticky route
        const stickyWorkerId = this._stickyRoutes.get(callId);
        if (stickyWorkerId) {
            const worker = this._workers.get(stickyWorkerId);
            if (worker && this._isAlive(worker)) {
                return { workerId: worker.id, host: worker.host, port: worker.port };
            }
            // Sticky worker dead, clear and re-route
            this._stickyRoutes.delete(callId);
        }

        // Least-loaded routing
        const best = this._leastLoaded();
        if (!best) {
            logger.warn('No workers available for routing');
            return null;
        }

        // Set sticky route
        this._stickyRoutes.set(callId, best.id);
        setTimeout(() => this._stickyRoutes.delete(callId), STICKY_TTL);

        return { workerId: best.id, host: best.host, port: best.port };
    }

    /**
     * Increment load on a worker (call assigned).
     */
    async assignCall(workerId, callId) {
        const worker = this._workers.get(workerId);
        if (!worker) return;
        worker.load++;
        worker.activeCalls.push(callId);
        this._stickyRoutes.set(callId, workerId);
        metrics.setGauge('worker_load', worker.load, { worker: workerId });
    }

    /**
     * Decrement load on a worker (call ended).
     */
    async releaseCall(workerId, callId) {
        const worker = this._workers.get(workerId);
        if (!worker) return;
        worker.load = Math.max(0, worker.load - 1);
        worker.activeCalls = worker.activeCalls.filter(id => id !== callId);
        this._stickyRoutes.delete(callId);
        metrics.setGauge('worker_load', worker.load, { worker: workerId });
    }

    /**
     * Get all registered workers with status.
     */
    getAll() {
        return [...this._workers.values()].map(w => ({
            id: w.id,
            host: w.host,
            port: w.port,
            capacity: w.capacity,
            load: w.load,
            utilization: Math.round((w.load / w.capacity) * 100),
            alive: this._isAlive(w),
            activeCalls: w.activeCalls.length,
            uptime: Date.now() - w.registeredAt
        }));
    }

    // ─── Internal ────────────────────────────────────

    _leastLoaded() {
        let best = null;
        let bestRatio = Infinity;

        for (const worker of this._workers.values()) {
            if (!this._isAlive(worker)) continue;
            if (worker.load >= worker.capacity) continue;

            const ratio = worker.load / worker.capacity;
            if (ratio < bestRatio) {
                bestRatio = ratio;
                best = worker;
            }
        }

        return best;
    }

    _isAlive(worker) {
        return (Date.now() - worker.lastHeartbeat) < HEARTBEAT_TIMEOUT;
    }

    _evictDead() {
        for (const [id, worker] of this._workers) {
            if (!this._isAlive(worker)) {
                logger.warn('Evicting dead worker', { workerId: id, lastHeartbeat: new Date(worker.lastHeartbeat).toISOString() });
                this.deregister(id);
                metrics.inc('worker_evictions');
            }
        }
    }

    shutdown() {
        if (this._evictionTimer) clearInterval(this._evictionTimer);
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        this._workers.clear();
        this._stickyRoutes.clear();
    }
}

module.exports = new WorkerRegistry();
