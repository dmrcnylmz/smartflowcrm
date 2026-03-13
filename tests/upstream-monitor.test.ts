/**
 * Upstream Service Monitor — Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    recordServiceCall,
    withServiceMonitoring,
    getServiceHealth,
    getRecordCount,
    clearRecords,
} from '@/lib/monitoring/upstream-monitor';

describe('Upstream Service Monitor', () => {
    beforeEach(() => {
        clearRecords();
    });

    describe('recordServiceCall()', () => {
        it('records a successful call', () => {
            recordServiceCall({
                service: 'deepgram',
                operation: 'stt',
                durationMs: 120,
                success: true,
            });
            expect(getRecordCount()).toBe(1);
        });

        it('records a failed call with error type', () => {
            recordServiceCall({
                service: 'cartesia',
                operation: 'tts',
                durationMs: 5000,
                success: false,
                errorType: 'TimeoutError',
            });
            expect(getRecordCount()).toBe(1);
        });

        it('enforces max buffer size', () => {
            for (let i = 0; i < 600; i++) {
                recordServiceCall({
                    service: 'test',
                    operation: 'op',
                    durationMs: 10,
                    success: true,
                });
            }
            expect(getRecordCount()).toBeLessThanOrEqual(500);
        });
    });

    describe('withServiceMonitoring()', () => {
        it('records successful async call', async () => {
            const result = await withServiceMonitoring('openai', 'chat', async () => {
                return 'response';
            });

            expect(result).toBe('response');
            expect(getRecordCount()).toBe(1);

            const health = getServiceHealth();
            expect(health).toHaveLength(1);
            expect(health[0].service).toBe('openai');
            expect(health[0].successCount).toBe(1);
        });

        it('records and rethrows failed async call', async () => {
            await expect(
                withServiceMonitoring('deepgram', 'stt', async () => {
                    throw new Error('Connection refused');
                })
            ).rejects.toThrow('Connection refused');

            expect(getRecordCount()).toBe(1);
            const health = getServiceHealth();
            expect(health[0].errorCount).toBe(1);
            expect(health[0].lastError).toBe('Error');
        });

        it('measures duration', async () => {
            await withServiceMonitoring('test', 'slow', async () => {
                await new Promise(r => setTimeout(r, 50));
                return 'done';
            });

            const health = getServiceHealth();
            expect(health[0].avgLatencyMs).toBeGreaterThanOrEqual(40);
        });
    });

    describe('getServiceHealth()', () => {
        it('returns empty array when no records', () => {
            expect(getServiceHealth()).toHaveLength(0);
        });

        it('groups by service', () => {
            recordServiceCall({ service: 'deepgram', operation: 'stt', durationMs: 100, success: true });
            recordServiceCall({ service: 'cartesia', operation: 'tts', durationMs: 40, success: true });
            recordServiceCall({ service: 'deepgram', operation: 'stt', durationMs: 120, success: true });

            const health = getServiceHealth();
            expect(health).toHaveLength(2);

            const deepgram = health.find(h => h.service === 'deepgram');
            expect(deepgram!.totalCalls).toBe(2);
            expect(deepgram!.avgLatencyMs).toBe(110); // (100 + 120) / 2

            const cartesia = health.find(h => h.service === 'cartesia');
            expect(cartesia!.totalCalls).toBe(1);
        });

        it('calculates success rate', () => {
            for (let i = 0; i < 8; i++) {
                recordServiceCall({ service: 'openai', operation: 'chat', durationMs: 200, success: true });
            }
            for (let i = 0; i < 2; i++) {
                recordServiceCall({ service: 'openai', operation: 'chat', durationMs: 5000, success: false, errorType: 'Timeout' });
            }

            const health = getServiceHealth();
            expect(health[0].successRate).toBe(80);
            expect(health[0].successCount).toBe(8);
            expect(health[0].errorCount).toBe(2);
        });

        it('filters by service name', () => {
            recordServiceCall({ service: 'deepgram', operation: 'stt', durationMs: 100, success: true });
            recordServiceCall({ service: 'cartesia', operation: 'tts', durationMs: 40, success: true });

            const health = getServiceHealth(5 * 60 * 1000, 'deepgram');
            expect(health).toHaveLength(1);
            expect(health[0].service).toBe('deepgram');
        });

        it('respects time window', async () => {
            recordServiceCall({ service: 'test', operation: 'op', durationMs: 10, success: true });

            // Wait a bit then use a very short window so the record is outside
            await new Promise(r => setTimeout(r, 20));
            const health = getServiceHealth(1); // 1ms window, record is ~20ms old
            expect(health).toHaveLength(0);
        });

        it('calculates p95 latency', () => {
            // 20 calls: 19 fast, 1 slow
            for (let i = 0; i < 19; i++) {
                recordServiceCall({ service: 'api', operation: 'call', durationMs: 100, success: true });
            }
            recordServiceCall({ service: 'api', operation: 'call', durationMs: 2000, success: true });

            const health = getServiceHealth();
            expect(health[0].p95LatencyMs).toBe(2000); // The slow one should be at p95
        });

        it('sorts results alphabetically', () => {
            recordServiceCall({ service: 'zebra', operation: 'op', durationMs: 10, success: true });
            recordServiceCall({ service: 'alpha', operation: 'op', durationMs: 10, success: true });
            recordServiceCall({ service: 'beta', operation: 'op', durationMs: 10, success: true });

            const health = getServiceHealth();
            expect(health.map(h => h.service)).toEqual(['alpha', 'beta', 'zebra']);
        });
    });

    describe('clearRecords()', () => {
        it('empties the buffer', () => {
            recordServiceCall({ service: 'test', operation: 'op', durationMs: 10, success: true });
            expect(getRecordCount()).toBe(1);
            clearRecords();
            expect(getRecordCount()).toBe(0);
        });
    });
});
