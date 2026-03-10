/**
 * GPU Manager — Sleep/Wake Controller for RunPod GPU Pods & Serverless
 *
 * Manages GPU lifecycle:
 * - RunPod Pod start/stop via REST API (enterprise on-demand)
 * - RunPod Serverless cold start detection
 * - Health caching to avoid hammering the GPU
 * - Automatic wake-up when calls come in
 * - Status tracking for the UI dashboard
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

export interface InferenceResult {
    session_id?: string;
    intent?: string;
    confidence?: number;
    response_text: string;
    latency_ms: number;
    source: string;
}

export interface GPUManagerConfig {
    /** Base URL of the Personaplex server (fallback) */
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
    /** RunPod Serverless endpoint ID */
    runpodEndpointId?: string;
    /** RunPod API key (shared for pod + serverless) */
    runpodApiKey?: string;
    /** RunPod GPU Pod ID (stop/start lifecycle) */
    runpodPodId?: string;
}

const RUNPOD_GQL_URL = 'https://api.runpod.io/graphql';

const DEFAULT_CONFIG: GPUManagerConfig = {
    serverUrl: process.env.PERSONAPLEX_URL || 'http://localhost:8998',
    apiKey: process.env.PERSONAPLEX_API_KEY || '',
    healthCacheTtl: 10_000,    // 10 seconds
    healthCheckTimeout: 5_000, // 5 seconds
    maxWakeRetries: 5,
    wakeRetryDelay: 2_000,     // 2 seconds between retries
    runpodEndpointId: process.env.RUNPOD_ENDPOINT_ID,
    runpodApiKey: process.env.RUNPOD_API_KEY,
    runpodPodId: process.env.RUNPOD_POD_ID,
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

    // ============================================
    // RunPod Pod Lifecycle (stop/start)
    // ============================================

    /** Check if RunPod GPU Pod is configured */
    isPodConfigured(): boolean {
        return !!(this.config.runpodPodId && this.config.runpodApiKey);
    }

    /** Get the RunPod proxy URL for the pod's HTTP port */
    getPodProxyUrl(): string {
        return `https://${this.config.runpodPodId}-8998.proxy.runpod.net`;
    }

    /** Get current pod status via RunPod GraphQL API */
    async getPodStatus(): Promise<{ status: string; uptimeSeconds: number }> {
        const data = await this.runpodGql(`
            query { pod(input: { podId: "${this.config.runpodPodId}" }) {
                desiredStatus
                runtime { uptimeInSeconds }
            }}
        `);
        const pod = data.pod as Record<string, unknown> | undefined;
        const runtime = pod?.runtime as Record<string, unknown> | undefined;
        return {
            status: (pod?.desiredStatus as string) || 'UNKNOWN',
            uptimeSeconds: (runtime?.uptimeInSeconds as number) || 0,
        };
    }

    /** Start a stopped RunPod Pod */
    async startPod(): Promise<boolean> {
        try {
            logger.debug('[GPUManager] Starting RunPod Pod...');
            const data = await this.runpodGql(`
                mutation { podResume(input: { podId: "${this.config.runpodPodId}", gpuCount: 1 }) {
                    id desiredStatus
                }}
            `);
            const podResume = data.podResume as Record<string, unknown> | undefined;
            const status = podResume?.desiredStatus as string | undefined;
            logger.debug(`[GPUManager] Pod start requested → ${status}`);
            return status === 'RUNNING';
        } catch (error) {
            logger.debug(`[GPUManager] Pod start failed: ${error}`);
            return false;
        }
    }

    /** Stop a running RunPod Pod */
    async stopPod(): Promise<boolean> {
        try {
            logger.debug('[GPUManager] Stopping RunPod Pod...');
            const data = await this.runpodGql(`
                mutation { podStop(input: { podId: "${this.config.runpodPodId}" }) {
                    id desiredStatus
                }}
            `);
            const podStop = data.podStop as Record<string, unknown> | undefined;
            const status = podStop?.desiredStatus as string | undefined;
            logger.debug(`[GPUManager] Pod stop requested → ${status}`);
            this.invalidateCache();
            return status === 'EXITED';
        } catch (error) {
            logger.debug(`[GPUManager] Pod stop failed: ${error}`);
            return false;
        }
    }

    /** Wake pod: check status, start if needed, wait for health */
    private async wakeViaRunpodPod(): Promise<boolean> {
        try {
            const { status } = await this.getPodStatus();

            if (status === 'RUNNING') {
                // Pod running, check if server is actually healthy
                const health = await this.checkHealthAtUrl(this.getPodProxyUrl());
                if (health.status === 'healthy' && health.model_loaded) {
                    this.totalWakeSuccesses++;
                    return true;
                }
                // Running but not yet healthy (model loading), poll
                return this.waitForPodReady(90_000);
            }

            if (status === 'EXITED' || status === 'STOPPED' || status === 'CREATED') {
                const started = await this.startPod();
                if (!started) return false;
                return this.waitForPodReady(120_000);
            }

            logger.debug(`[GPUManager] Unknown pod status: ${status}`);
            return false;
        } catch (error) {
            logger.debug(`[GPUManager] RunPod Pod wake failed: ${error}`);
            return false;
        }
    }

    /** Poll pod health endpoint until ready or timeout */
    private async waitForPodReady(maxWaitMs: number): Promise<boolean> {
        const deadline = Date.now() + maxWaitMs;
        const podUrl = this.getPodProxyUrl();
        let attempt = 0;

        while (Date.now() < deadline) {
            attempt++;
            await this.sleep(3_000); // 3s between polls

            try {
                const health = await this.checkHealthAtUrl(podUrl);
                if (health.status === 'healthy' && health.model_loaded) {
                    this.totalWakeSuccesses++;
                    logger.debug(`[GPUManager] Pod ready after ${attempt} polls`);
                    // Update main health cache
                    this.cachedHealth = health;
                    this.lastHealthCheck = Date.now();
                    return true;
                }
            } catch {
                // Pod still booting, continue polling
            }
        }

        logger.debug(`[GPUManager] Pod not ready after ${maxWaitMs}ms timeout`);
        return false;
    }

    /** Check health at a specific URL (for pod proxy URL) */
    private async checkHealthAtUrl(baseUrl: string): Promise<GPUHealthResult> {
        const startTime = performance.now();
        const headers: HeadersInit = { 'Accept': 'application/json' };
        if (this.config.apiKey) {
            headers['X-API-Key'] = this.config.apiKey;
        }

        const response = await fetch(`${baseUrl}/health`, {
            headers,
            signal: AbortSignal.timeout(this.config.healthCheckTimeout),
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }

        const data = await response.json();
        const latency = performance.now() - startTime;

        return {
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
            last_check: Date.now(),
        };
    }

    /** Run inference directly against the pod via HTTP */
    async runPodInference(params: {
        text: string;
        persona?: string;
        language?: string;
        session_id?: string;
    }): Promise<InferenceResult | null> {
        if (!this.isPodConfigured()) return null;

        const podUrl = this.getPodProxyUrl();
        const startTime = performance.now();

        try {
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (this.config.apiKey) {
                headers['X-API-Key'] = this.config.apiKey;
            }

            const response = await fetch(`${podUrl}/infer`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    text: params.text,
                    persona: params.persona || 'default',
                    language: params.language || 'tr',
                }),
                signal: AbortSignal.timeout(15_000),
            });

            if (!response.ok) return null;

            const data = await response.json();
            return {
                session_id: data.session_id,
                intent: data.intent,
                confidence: data.confidence,
                response_text: data.response_text || 'No response',
                latency_ms: Math.round(performance.now() - startTime),
                source: 'personaplex-gpu-pod',
            };
        } catch (error) {
            logger.debug(`[GPUManager] Pod inference error: ${error}`);
            return null;
        }
    }

    /** Helper: RunPod GraphQL API call */
    private async runpodGql(query: string): Promise<Record<string, unknown>> {
        const res = await fetch(`${RUNPOD_GQL_URL}?api_key=${this.config.runpodApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) {
            throw new Error(`RunPod API error: ${res.status}`);
        }

        const json = await res.json() as { data?: Record<string, unknown>; errors?: unknown[] };
        if (json.errors) {
            throw new Error(`RunPod GQL error: ${JSON.stringify(json.errors)}`);
        }
        return json.data || {};
    }

    // ============================================
    // Health Checks
    // ============================================

    /**
     * Check GPU health with caching.
     * Uses pod proxy URL when pod is configured, otherwise serverUrl.
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

        // Determine health URL: pod proxy > direct serverUrl
        const healthBaseUrl = this.isPodConfigured()
            ? this.getPodProxyUrl()
            : this.config.serverUrl;

        try {
            const result = await this.checkHealthAtUrl(healthBaseUrl);
            this.cachedHealth = result;
            this.lastHealthCheck = now;
            return result;
        } catch (error) {
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
                latency_ms: 0,
                cached: false,
                last_check: now,
            };

            this.cachedHealth = result;
            this.lastHealthCheck = now;
            return result;
        }
    }

    // ============================================
    // Wake Logic
    // ============================================

    /**
     * Ensure GPU is ready for inference.
     * If sleeping, attempts to wake it up.
     */
    async ensureReady(): Promise<boolean> {
        const health = await this.checkHealth();

        if (health.status === 'healthy' && health.model_loaded) {
            return true;
        }

        return this.wakeGPU();
    }

    /** Wake up the GPU. Deduplicates concurrent wake requests. */
    async wakeGPU(): Promise<boolean> {
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

        // Strategy 1: RunPod GPU Pod (stop/start lifecycle)
        if (this.isPodConfigured()) {
            return this.wakeViaRunpodPod();
        }

        // Strategy 2: RunPod Serverless API
        if (this.config.runpodEndpointId && this.config.runpodApiKey) {
            return this.wakeViaRunpodServerless();
        }

        // Strategy 3: Ping health endpoint repeatedly
        return this.wakeViaPing();
    }

    /** Wake via RunPod Serverless API */
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

    /** Wake by pinging the health endpoint */
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

    // ============================================
    // RunPod Serverless Inference
    // ============================================

    /** Check if RunPod Serverless is configured */
    isServerlessConfigured(): boolean {
        return !!(this.config.runpodEndpointId && this.config.runpodApiKey);
    }

    /** Run inference via RunPod Serverless API (POST /run → poll /status) */
    async runServerlessInference(params: {
        text: string;
        persona?: string;
        language?: string;
        session_id?: string;
    }): Promise<InferenceResult | null> {
        if (!this.config.runpodEndpointId || !this.config.runpodApiKey) {
            return null;
        }

        const startTime = performance.now();

        try {
            const runResponse = await fetch(
                `https://api.runpod.ai/v2/${this.config.runpodEndpointId}/run`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.runpodApiKey}`,
                    },
                    body: JSON.stringify({
                        input: {
                            action: 'infer',
                            text: params.text,
                            persona: params.persona || 'default',
                            language: params.language || 'tr',
                            session_id: params.session_id,
                        },
                    }),
                    signal: AbortSignal.timeout(10_000),
                },
            );

            if (!runResponse.ok) {
                logger.debug(`[GPUManager] RunPod /run failed: ${runResponse.status}`);
                return null;
            }

            const runData = await runResponse.json();
            const jobId = runData.id;

            if (!jobId) {
                logger.debug('[GPUManager] RunPod /run returned no job ID');
                return null;
            }

            const maxPolls = 15;
            const pollDelay = 2_000;

            for (let i = 0; i < maxPolls; i++) {
                await this.sleep(i === 0 ? 500 : pollDelay);

                const statusRes = await fetch(
                    `https://api.runpod.ai/v2/${this.config.runpodEndpointId}/status/${jobId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.config.runpodApiKey}`,
                        },
                        signal: AbortSignal.timeout(5_000),
                    },
                );

                if (!statusRes.ok) continue;

                const statusData = await statusRes.json();

                if (statusData.status === 'COMPLETED') {
                    const latency = Math.round(performance.now() - startTime);
                    const output = statusData.output || {};

                    return {
                        session_id: output.session_id,
                        intent: output.intent,
                        confidence: output.confidence,
                        response_text: output.response_text || output.error || 'No response',
                        latency_ms: latency,
                        source: 'personaplex-gpu-serverless',
                    };
                }

                if (statusData.status === 'FAILED') {
                    logger.debug(`[GPUManager] RunPod job ${jobId} FAILED: ${statusData.error}`);
                    return null;
                }
            }

            logger.debug(`[GPUManager] RunPod job ${jobId} timed out after polling`);
            return null;

        } catch (error) {
            logger.debug(`[GPUManager] RunPod inference error: ${error}`);
            return null;
        }
    }

    // ============================================
    // Utilities
    // ============================================

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
