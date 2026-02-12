/**
 * Multi-Tenant Isolation Tests
 */

let callService, tenantService, authService, analyticsService, recordingService;

beforeAll(async () => {
    const { seed } = require('../src/seed/run-seed');
    await seed();
    callService = require('../src/services/call.service');
    tenantService = require('../src/services/tenant.service');
    authService = require('../src/services/auth.service');
    analyticsService = require('../src/services/analytics.service');
    recordingService = require('../src/services/recording.service');
});

afterAll(() => {
    const { closeDatabase } = require('../src/config/database');
    closeDatabase();
});

describe('Tenant Data Isolation', () => {
    it('Atlas agents should NOT appear in Nova queries', () => {
        const atlasAgents = tenantService.getAgents('atlas_support');
        const novaAgents = tenantService.getAgents('nova_logistics');
        const atlasIds = new Set(atlasAgents.map(a => a.id));
        const novaIds = new Set(novaAgents.map(a => a.id));
        atlasIds.forEach(id => expect(novaIds.has(id)).toBe(false));
        novaIds.forEach(id => expect(atlasIds.has(id)).toBe(false));
    });

    it('Atlas agents should all have tenant_id=atlas_support', () => {
        tenantService.getAgents('atlas_support').forEach(a => expect(a.tenant_id).toBe('atlas_support'));
    });

    it('Nova agents should all have tenant_id=nova_logistics', () => {
        tenantService.getAgents('nova_logistics').forEach(a => expect(a.tenant_id).toBe('nova_logistics'));
    });

    it('Atlas calls should NOT appear in Nova queries', () => {
        const atlasCallIds = new Set(callService.getCalls('atlas_support').map(c => c.id));
        const novaCallIds = new Set(callService.getCalls('nova_logistics').map(c => c.id));
        atlasCallIds.forEach(id => expect(novaCallIds.has(id)).toBe(false));
        novaCallIds.forEach(id => expect(atlasCallIds.has(id)).toBe(false));
    });

    it('All Atlas calls should have tenant_id=atlas_support', () => {
        callService.getCalls('atlas_support').forEach(c => expect(c.tenant_id).toBe('atlas_support'));
    });

    it('All Nova calls should have tenant_id=nova_logistics', () => {
        callService.getCalls('nova_logistics').forEach(c => expect(c.tenant_id).toBe('nova_logistics'));
    });

    it('Atlas queues should NOT appear in Nova queries', () => {
        const atlasQueueIds = new Set(tenantService.getQueues('atlas_support').map(q => q.id));
        const novaQueueIds = new Set(tenantService.getQueues('nova_logistics').map(q => q.id));
        atlasQueueIds.forEach(id => expect(novaQueueIds.has(id)).toBe(false));
    });

    it('Atlas phone numbers should NOT appear in Nova queries', () => {
        const atlasNums = new Set(tenantService.getPhoneNumbers('atlas_support').map(n => n.number));
        const novaNums = new Set(tenantService.getPhoneNumbers('nova_logistics').map(n => n.number));
        atlasNums.forEach(n => expect(novaNums.has(n)).toBe(false));
    });

    it('Atlas admin should NOT login to Nova tenant', () => {
        expect(() => authService.login('admin@atlas.com', 'password123', 'nova_logistics')).toThrow();
    });

    it('Nova admin should NOT login to Atlas tenant', () => {
        expect(() => authService.login('admin@nova.com', 'password123', 'atlas_support')).toThrow();
    });

    it('Atlas analytics should only contain Atlas data', () => {
        const atlasDash = analyticsService.getDashboard('atlas_support');
        const novaDash = analyticsService.getDashboard('nova_logistics');
        expect(atlasDash.overview.total_calls).toBeGreaterThanOrEqual(280);
        expect(atlasDash.overview.total_calls).not.toBe(novaDash.overview.total_calls);
    });

    it('Atlas agent metrics should NOT include Nova agents', () => {
        expect(() => analyticsService.getAgentMetrics('atlas_support', 'nova_agent_1')).toThrow();
    });

    it('Nova agent metrics should NOT include Atlas agents', () => {
        expect(() => analyticsService.getAgentMetrics('nova_logistics', 'atlas_agent_1')).toThrow();
    });

    it('Direct DB query confirms no cross-tenant data leaks', () => {
        const { dbPrepareGet } = require('../src/config/database');
        const tables = ['users', 'queues', 'phone_numbers', 'calls', 'call_logs'];
        tables.forEach(table => {
            const leaks = dbPrepareGet(
                `SELECT COUNT(*) as c FROM ${table} WHERE tenant_id = 'atlas_support' AND id IN (SELECT id FROM ${table} WHERE tenant_id = 'nova_logistics')`
            );
            expect(leaks.c).toBe(0);
        });
    });
});

describe('Cross-Tenant Access Prevention', () => {
    it('getCall should return null for cross-tenant access', () => {
        const atlasCalls = callService.getCalls('atlas_support', { limit: 1 });
        const crossAccess = callService.getCall('nova_logistics', atlasCalls[0].id);
        expect(crossAccess).toBeNull();
    });

    it('getAgent should return null for cross-tenant access', () => {
        const crossAgent = tenantService.getAgent('nova_logistics', 'atlas_agent_1');
        expect(crossAgent).toBeNull();
    });

    it('Recording cross-tenant access should fail', () => {
        const atlasCalls = callService.getCalls('atlas_support', { status: 'completed', limit: 1 });
        expect(() => recordingService.getRecording('nova_logistics', atlasCalls[0].id)).toThrow();
    });
});
