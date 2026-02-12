/**
 * Load Test Script – Multi-Tenant Voice Call Center Platform
 * Simulates concurrent API requests and measures response times
 * 
 * Run standalone: node tests/load-test.js
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3456';

async function runLoadTest() {
    console.log('🏋️ Load Test – Multi-Tenant Voice Call Center Platform\n');
    console.log(`Target: ${BASE_URL}`);
    console.log('═'.repeat(60));

    // Step 1: Login to get tokens
    const atlasToken = await login('admin@atlas.com', 'password123', 'atlas_support');
    const novaToken = await login('admin@nova.com', 'password123', 'nova_logistics');

    if (!atlasToken || !novaToken) {
        console.error('❌ Login failed. Is the server running?');
        process.exit(1);
    }

    console.log('✅ Authentication successful\n');

    // Step 2: Define test scenarios
    const scenarios = [
        { name: 'GET /api/calls (50 concurrent)', endpoint: '/api/calls?limit=20', concurrency: 50, token: atlasToken },
        { name: 'GET /api/analytics/dashboard (30 concurrent)', endpoint: '/api/analytics/dashboard', concurrency: 30, token: atlasToken },
        { name: 'GET /api/tenants/me/agents (50 concurrent)', endpoint: '/api/tenants/me/agents', concurrency: 50, token: atlasToken },
        { name: 'GET /api/analytics/queues (40 concurrent)', endpoint: '/api/analytics/queues', concurrency: 40, token: atlasToken },
        { name: 'Multi-tenant concurrent (Atlas+Nova)', endpoint: '/api/calls?limit=10', concurrency: 25, token: atlasToken, novaToken },
        { name: 'GET /api/health (100 concurrent)', endpoint: '/api/health', concurrency: 100, token: null },
    ];

    const results = [];

    for (const scenario of scenarios) {
        console.log(`\n📊 ${scenario.name}`);
        const result = await runScenario(scenario);
        results.push({ name: scenario.name, ...result });
        printResult(result);
    }

    // Step 3: Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📋 SUMMARY');
    console.log('═'.repeat(60));
    console.log(`${'Scenario'.padEnd(50)} ${'Avg'.padStart(8)} ${'P95'.padStart(8)} ${'Pass'.padStart(6)}`);
    console.log('─'.repeat(72));

    let allPassed = true;
    results.forEach(r => {
        const pass = r.p95 < 2000 && r.errorRate === 0;
        if (!pass) allPassed = false;
        console.log(
            `${r.name.padEnd(50)} ${(r.avg + 'ms').padStart(8)} ${(r.p95 + 'ms').padStart(8)} ${(pass ? '✅' : '❌').padStart(6)}`
        );
    });

    console.log('\n' + (allPassed ? '✅ ALL LOAD TESTS PASSED' : '❌ SOME TESTS FAILED'));
    console.log('\nAcceptance Criteria:');
    console.log('  - P95 response time < 2000ms');
    console.log('  - Error rate = 0%');

    return allPassed;
}

async function login(email, password, tenantId) {
    try {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, tenant_id: tenantId })
        });
        const data = await res.json();
        return data.token;
    } catch {
        return null;
    }
}

async function runScenario(scenario) {
    const promises = [];
    const start = Date.now();

    for (let i = 0; i < scenario.concurrency; i++) {
        const token = i % 2 === 0 ? scenario.token : (scenario.novaToken || scenario.token);
        promises.push(makeRequest(scenario.endpoint, token));
    }

    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;

    const times = responses.map(r => r.time).sort((a, b) => a - b);
    const errors = responses.filter(r => !r.ok).length;

    return {
        total: scenario.concurrency,
        totalTime,
        avg: Math.round(times.reduce((s, t) => s + t, 0) / times.length),
        min: times[0],
        max: times[times.length - 1],
        median: times[Math.floor(times.length / 2)],
        p95: times[Math.floor(times.length * 0.95)],
        p99: times[Math.floor(times.length * 0.99)],
        errors,
        errorRate: parseFloat(((errors / scenario.concurrency) * 100).toFixed(1)),
        rps: parseFloat((scenario.concurrency / (totalTime / 1000)).toFixed(1))
    };
}

async function makeRequest(endpoint, token) {
    const start = Date.now();
    try {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${BASE_URL}${endpoint}`, { headers });
        return { ok: res.ok, time: Date.now() - start, status: res.status };
    } catch {
        return { ok: false, time: Date.now() - start, status: 0 };
    }
}

function printResult(r) {
    console.log(`  Requests:  ${r.total} | Errors: ${r.errors} (${r.errorRate}%)`);
    console.log(`  Avg: ${r.avg}ms | Median: ${r.median}ms | P95: ${r.p95}ms | P99: ${r.p99}ms`);
    console.log(`  Min: ${r.min}ms | Max: ${r.max}ms | RPS: ${r.rps}`);
}

// Run if called directly
if (require.main === module) {
    runLoadTest().then(passed => process.exit(passed ? 0 : 1));
}

module.exports = { runLoadTest };
