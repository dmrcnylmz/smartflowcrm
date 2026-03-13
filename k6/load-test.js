/**
 * k6 Load Test — Callception API Endpoints
 *
 * Tests API performance under load to ensure response times
 * and error rates are within acceptable thresholds.
 *
 * Prerequisites:
 *   brew install k6  (macOS)
 *   or: https://k6.io/docs/get-started/installation/
 *
 * Usage:
 *   k6 run k6/load-test.js
 *   k6 run k6/load-test.js --env BASE_URL=https://callception.com
 *   k6 run k6/load-test.js --env BASE_URL=http://localhost:3002
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom Metrics ─────────────────────────────────────────────────────────

const errorRate = new Rate('errors');
const landingLatency = new Trend('landing_latency', true);
const healthLatency = new Trend('health_latency', true);
const apiLatency = new Trend('api_latency', true);

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';

export const options = {
    stages: [
        { duration: '30s', target: 10 },   // Ramp up to 10 users
        { duration: '1m', target: 25 },    // Ramp to 25 users
        { duration: '1m', target: 50 },    // Ramp to 50 users
        { duration: '2m', target: 50 },    // Stay at 50 users
        { duration: '30s', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],  // 95% of requests under 2s
        http_req_failed: ['rate<0.01'],     // Error rate < 1%
        errors: ['rate<0.01'],              // Custom error rate < 1%
        landing_latency: ['p(95)<3000'],    // Landing page under 3s
        health_latency: ['p(95)<500'],      // Health check under 500ms
        api_latency: ['p(95)<2000'],        // API endpoints under 2s
    },
};

// ─── Test Scenarios ─────────────────────────────────────────────────────────

export default function () {
    group('Public Pages', () => {
        // Landing page
        const landingRes = http.get(`${BASE_URL}/landing`);
        check(landingRes, {
            'landing: status 200': (r) => r.status === 200,
            'landing: has content': (r) => r.body && r.body.length > 0,
        }) || errorRate.add(1);
        landingLatency.add(landingRes.timings.duration);
    });

    group('Health Checks', () => {
        // Health endpoint
        const healthRes = http.get(`${BASE_URL}/api/health`);
        check(healthRes, {
            'health: status 200': (r) => r.status === 200,
        }) || errorRate.add(1);
        healthLatency.add(healthRes.timings.duration);
    });

    group('Public API', () => {
        // Privacy page
        const privacyRes = http.get(`${BASE_URL}/privacy`);
        check(privacyRes, {
            'privacy: status 200': (r) => r.status === 200,
        }) || errorRate.add(1);
        apiLatency.add(privacyRes.timings.duration);

        // Terms page
        const termsRes = http.get(`${BASE_URL}/terms`);
        check(termsRes, {
            'terms: status 200': (r) => r.status === 200,
        }) || errorRate.add(1);
        apiLatency.add(termsRes.timings.duration);

        // Changelog page
        const changelogRes = http.get(`${BASE_URL}/changelog`);
        check(changelogRes, {
            'changelog: status 200': (r) => r.status === 200,
        }) || errorRate.add(1);
        apiLatency.add(changelogRes.timings.duration);

        // Sitemap
        const sitemapRes = http.get(`${BASE_URL}/sitemap.xml`);
        check(sitemapRes, {
            'sitemap: status 200': (r) => r.status === 200,
        }) || errorRate.add(1);
    });

    group('Lead Capture', () => {
        // Submit a lead (with test email)
        const leadPayload = JSON.stringify({
            email: `loadtest-${__VU}-${Date.now()}@test.callception.com`,
            source: 'k6_load_test',
        });

        const leadRes = http.post(`${BASE_URL}/api/leads`, leadPayload, {
            headers: { 'Content-Type': 'application/json' },
        });

        check(leadRes, {
            'lead: status 200': (r) => r.status === 200,
            'lead: success': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.success === true;
                } catch {
                    return false;
                }
            },
        }) || errorRate.add(1);
        apiLatency.add(leadRes.timings.duration);
    });

    // Pause between iterations to simulate real user behavior
    sleep(1 + Math.random() * 2);
}

// ─── Summary ────────────────────────────────────────────────────────────────

export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        baseUrl: BASE_URL,
        totalRequests: data.metrics.http_reqs?.values?.count || 0,
        p95Duration: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
        errorRate: data.metrics.http_req_failed?.values?.rate || 0,
        thresholdsOk: Object.values(data.root_group?.checks || {})
            .every(c => c.fails === 0),
    };

    console.log('\n=== Load Test Summary ===');
    console.log(`Base URL: ${summary.baseUrl}`);
    console.log(`Total Requests: ${summary.totalRequests}`);
    console.log(`P95 Duration: ${Math.round(summary.p95Duration)}ms`);
    console.log(`Error Rate: ${(summary.errorRate * 100).toFixed(2)}%`);
    console.log(`All Thresholds OK: ${summary.thresholdsOk}`);

    return {
        stdout: JSON.stringify(summary, null, 2),
    };
}
