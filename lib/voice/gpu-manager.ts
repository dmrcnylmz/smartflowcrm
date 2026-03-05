/**
 * GPU Manager — Sleep/Wake Controller for RunPod Serverless
 *
 * Manages GPU lifecycle:
 * - Health caching to avoid hammering the GPU with health checks
 * - Cold start detection and pre-warming
 * - Automatic wake-up when calls come in
 * - Status tracking for the UI dashboard
 *
 * Integrates with RunPod Serverless API for future pod-to-serverless migration.
 */

import { logger } from '@/lib/utils/logger';

export type GPUStatus = 'healthy' | 'sleeping' | 'waking' | 'unhealthy' | 'unknown';

export interface GPUHealthResult {
    status: GPUStatus;
    model_loaded: boolean;
    cuda_available: boolean;
    gpu_name: string | null;
    gpu_memory_gb: number | null;
    active_sessions: number;
    max_sessions: number;
    uptime_seconds: number;
    latency_ms: number;
    cached: boolean;
    last_check: number;
}

export interface GPUManagerConfig {
    /** Base URL of the Personaplex server */
    serverUrl: string;
    /** API key for authentication */
    apiKey?: string;
    /** Health check cache TTL in ms (default: 10s) */
    healthCacheTtl: number;
    /** Timeout for health check requests in ms */
    healthCheckTimeout: number;
    /** Max retries for wake-up attempts */
    maxWakeRetries: number;
    /** Delay between wake-up retries in ms */
    wakeRetryDelay: number;
    /** RunPod Serverless endpoint ID (future migration) */
    runpodEndpointId?: string;
    /** RunPod API key */
    runpodApiKey?: string;
}

const DEFAULT_CONFIG: GPUManagerConfig = {
    serverUrl: process.env.PERSONAPLEX_URL || 'http://localhost:8998',
    apiKey: process.env.PERSONAPLEX_API_KEY || '',
    healthCacheTtl: 10_000,    // 10 seconds
    healthCheckTimeout: 5_000, // 5 seconds
    maxWakeRetries: 5,
    wakeRetryDelay: 2_000,     // 2 seconds between retries
    runpodEndpointId: process.env.RUNPOD_ENDPOINT_ID,
    runpodApiKey: process.env.RUNPOD_API_KEY,
};

class GPUManager {
    private config: GPUManagerConfig;
    private cachedHealth: GPUHealthResult | null = null;
    private lastHealthCheck: number = 0;
    private wakeInProgress: boolean = false;
    private wakePromise: Promise<boolean> | null = null;

    // Metrics
    private totalHealthChecks = 0;
    private totalCacheHits = 0;
    private totalWakeAttempts = 0;
    private totalWakeSuccesses = 0;

    constructor(config: Partial<GPUManagerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Check GPU health with caching.
     * Returns cached result if within TTL, otherwise checks live.
     */
    async checkHealth(forceRefresh = false): Promise<GPUHealthResult> {
        const now = Date.now();

        // Return cached if within TTL
        if (
            !forceRefresh &&
            this.cachedHealth &&
            now - this.lastHealthCheck < this.config.healthCacheTtl
        ) {
            this.totalCacheHits++;
            return { ...this.cachedHealth, cached: true };
        }

        this.totalHealthChecks++;
        const startTime = performance.now();

        try {
            const headers: HeadersInit = { 'Accept': 'application/json' };
            if (this.config.apiKey) {
                headers['X-API-Key'] = this.config.apiKey;
            }

            const response = await fetch(`${this.config.serverUrl}/health`, {
                headers,
                signal: AbortSignal.timeout(this.config.healthCheckTimeout),
            });

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }

            const data = await response.json();
            const latency = performance.now() - startTime;

            const result: GPUHealthResult = {
                status: data.status === 'healthy' ? 'healthy' : 'unhealthy',
                model_loaded: data.model_loaded ?? false,
                cuda_available: data.cuda_available ?? false,
                gpu_name: data.gpu_name ?? null,
                gpu_memory_gb: data.gpu_memory_gb ?? null,
                active_sessions: data.active_sessions ?? 0,
                max_sessions: data.max_sessions ?? 4,
                uptime_seconds: data.uptime_seconds ?? 0,
                latency_ms: Math.round(latency),
                cached: false,
                last_check: now,
            };

            this.cachedHealth = result;
            this.lastHealthCheck = now;

            return result;

        } catch (error) {
            const latency = performance.now() - startTime;
            const isTimeout = error instanceof DOMException && error.name === 'AbortError';

            const result: GPUHealthResult = {
                status: isTimeout ? 'sleeping' : 'unhealthy',
                model_loaded: false,
                cuda_available: false,
                gpu_name: null,
                gpu_memory_gb: null,
                active_sessions: 0,
                max_sessions: 0,
                uptime_seconds: 0,
                latency_ms: Math.round(latency),
                cached: false,
                last_check: now,
            };

            this.cachedHealth = result;
            this.lastHealthCheck = now;

            return result;
        }
    }

    /**
     * Ensure GPU is ready for inference.
     * If sleeping, attempts to wake it up.
     * Returns true if GPU is ready, false if wake-up failed.
     */
    async ensureReady(): Promise<boolean> {
        const health = await this.checkHealth();

        if (health.status === 'healthy' && health.model_loaded) {
            return true;
        }

        // GPU is sleeping or unhealthy — attempt wake
        return this.wakeGPU();
    }

    /**
     * Wake up the GPU from sleep state.
     * Deduplicates concurrent wake requests.
     */
    async wakeGPU(): Promise<boolean> {
        // Deduplicate concurrent wake requests
        if (this.wakeInProgress && this.wakePromise) {
            return this.wakePromise;
        }

        this.wakeInProgress = true;
        this.wakePromise = this._performWake();

        try {
            return await this.wakePromise;
        } finally {
            this.wakeInProgress = false;
            this.wakePromise = null;
        }
    }

    private async _performWake(): Promise<boolean> {
        this.totalWakeAttempts++;
        logger.debug(`[GPUManager] Waking GPU... (attempt ${this.totalWakeAttempts})`);

        // Strategy 1: RunPod Serverless API (future)
        if (this.config.runpodEndpointId && this.config.runpodApiKey) {
            return this.wakeViaRunpodServerless();
        }

        // Strategy 2: Ping health endpoint repeatedly (current RunPod pod)
        return this.wakeViaPing();
    }

    /**
     * Wake via RunPod Serverless API.
     * Sends a lightweight request to trigger cold start.
     */
    private async wakeViaRunpodServerless(): Promise<boolean> {
        try {
            const response = await fetch(
                `https://api.runpod.ai/v2/${this.config.runpodEndpointId}/run`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.runpodApiKey}`,
                    },
                    body: JSON.stringify({
                        input: { action: 'health_check' },
                    }),
                    signal: AbortSignal.timeout(10_000),
                },
            );

            if (!response.ok) {
                console.error(`[GPUManager] RunPod API error: ${response.status}`);
                return false;
            }

            const data = await response.json();
            const jobId = data.id;

            // Poll for completion
            for (let i = 0; i < this.config.maxWakeRetries; i++) {
                await this.sleep(this.config.wakeRetryDelay);

                const statusRes = await fetch(
                    `https://api.runpod.ai/v2/${this.config.runpodEndpointId}/status/${jobId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.config.runpodApiKey}`,
                        },
                        signal: AbortSignal.timeout(5_000),
                    },
                );

                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    if (statusData.status === 'COMPLETED') {
                        this.totalWakeSuccesses++;
                        logger.debug('[GPUManager] GPU woke via RunPod Serverless');
                        // Refresh health cache
                        await this.checkHealth(true);
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error('[GPUManager] RunPod Serverless wake failed:', error);
            return false;
        }
    }

    /**
     * Wake by pinging the health endpoint.
     * Works with standard RunPod pods that auto-start on request.
     */
    private async wakeViaPing(): Promise<boolean> {
        for (let attempt = 1; attempt <= this.config.maxWakeRetries; attempt++) {
            logger.debug(`[GPUManager] Ping wake attempt ${attempt}/${this.config.maxWakeRetries}`);

            const health = await this.checkHealth(true);

            if (health.status === 'healthy' && health.model_loaded) {
                this.totalWakeSuccesses++;
                logger.debug(`[GPUManager] GPU ready after ${attempt} attempts`);
                return true;
            }

            if (attempt < this.config.maxWakeRetries) {
                await this.sleep(this.config.wakeRetryDelay);
            }
        }

        console.error('[GPUManager] GPU wake failed after all retries');
        return false;
    }

    /**
     * Get a mock health result for demo/testing mode.
     */
    getMockHealth(): GPUHealthResult {
        return {
            status: 'healthy',
            model_loaded: true,
            cuda_available: true,
            gpu_name: 'Mock GPU (Demo Mode)',
            gpu_memory_gb: 24,
            active_sessions: 0,
            max_sessions: 4,
            uptime_seconds: 0,
            latency_ms: 5,
            cached: false,
            last_check: Date.now(),
        };
    }

    /**
     * Get current GPU status for dashboard display.
     */
    getStatus(): {
        status: GPUStatus;
        metrics: {
            totalHealthChecks: number;
            cacheHitRate: number;
            wakeAttempts: number;
            wakeSuccessRate: number;
        };
        lastHealth: GPUHealthResult | null;
    } {
        const totalChecks = this.totalHealthChecks + this.totalCacheHits;
        return {
            status: this.cachedHealth?.status ?? 'unknown',
            metrics: {
                totalHealthChecks: this.totalHealthChecks,
                cacheHitRate: totalChecks > 0
                    ? this.totalCacheHits / totalChecks
                    : 0,
                wakeAttempts: this.totalWakeAttempts,
                wakeSuccessRate: this.totalWakeAttempts > 0
                    ? this.totalWakeSuccesses / this.totalWakeAttempts
                    : 0,
            },
            lastHealth: this.cachedHealth,
        };
    }

    /** Invalidate health cache */
    invalidateCache(): void {
        this.cachedHealth = null;
        this.lastHealthCheck = 0;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// Singleton Instance
// ============================================

export const gpuManager = new GPUManager();

export { GPUManager };
