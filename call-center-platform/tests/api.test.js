/**
 * API Tests – Multi-Tenant Voice Call Center Platform
 */

let authService, tenantService, callService, analyticsService, recordingService, transcriptionService;

beforeAll(async () => {
    const { seed } = require('../src/seed/run-seed');
    await seed();
    authService = require('../src/services/auth.service');
    tenantService = require('../src/services/tenant.service');
    callService = require('../src/services/call.service');
    analyticsService = require('../src/services/analytics.service');
    recordingService = require('../src/services/recording.service');
    transcriptionService = require('../src/services/transcription.service');
});

afterAll(() => {
    const { closeDatabase } = require('../src/config/database');
    closeDatabase();
});

describe('Auth Service', () => {
    it('should login with valid credentials', () => {
        const result = authService.login('admin@atlas.com', 'password123', 'atlas_support');
        expect(result).toHaveProperty('token');
        expect(result.user.email).toBe('admin@atlas.com');
        expect(result.user.tenant_id).toBe('atlas_support');
    });

    it('should reject invalid password', () => {
        expect(() => authService.login('admin@atlas.com', 'wrongpass', 'atlas_support')).toThrow();
    });

    it('should reject wrong tenant', () => {
        expect(() => authService.login('admin@atlas.com', 'password123', 'nova_logistics')).toThrow();
    });

    it('should register a new user', () => {
        const result = authService.register({
            name: 'Test User', email: 'test_api2@atlas.com', password: 'test123', role: 'agent'
        }, 'atlas_support');
        expect(result.user.name).toBe('Test User');
        expect(result.user.tenant_id).toBe('atlas_support');
    });

    it('should reject duplicate email within same tenant', () => {
        expect(() => authService.register({
            name: 'Dup', email: 'admin@atlas.com', password: 'test', role: 'agent'
        }, 'atlas_support')).toThrow();
    });
});

describe('Tenant Service', () => {
    it('should get Atlas Support tenant', () => {
        const tenant = tenantService.getTenant('atlas_support');
        expect(tenant).toBeDefined();
        expect(tenant.name).toBe('Atlas Support');
    });

    it('should get Nova Logistics tenant', () => {
        const tenant = tenantService.getTenant('nova_logistics');
        expect(tenant).toBeDefined();
        expect(tenant.name).toBe('Nova Logistics');
    });

    it('should list Atlas agents', () => {
        const agents = tenantService.getAgents('atlas_support');
        expect(agents.length).toBeGreaterThanOrEqual(3);
        const names = agents.map(a => a.name);
        expect(names).toContain('Ayşe Kaya');
        expect(names).toContain('Mehmet Demir');
    });

    it('should list Atlas queues', () => {
        const queues = tenantService.getQueues('atlas_support');
        expect(queues.length).toBe(3);
        const names = queues.map(q => q.name);
        expect(names).toContain('Sales');
        expect(names).toContain('Technical Support');
        expect(names).toContain('Billing');
    });

    it('should list Atlas phone numbers', () => {
        const numbers = tenantService.getPhoneNumbers('atlas_support');
        expect(numbers.length).toBe(3);
    });

    it('should list all tenants', () => {
        const tenants = tenantService.listTenants();
        expect(tenants.length).toBeGreaterThanOrEqual(2);
    });
});

describe('Call Service', () => {
    it('should have 200+ inbound calls for Atlas', () => {
        const calls = callService.getCalls('atlas_support', { call_type: 'inbound' });
        expect(calls.length).toBeGreaterThanOrEqual(200);
    });

    it('should have 80+ outbound calls for Atlas', () => {
        const calls = callService.getCalls('atlas_support', { call_type: 'outbound' });
        expect(calls.length).toBeGreaterThanOrEqual(80);
    });

    it('should filter by queue', () => {
        const calls = callService.getCalls('atlas_support', { queue_id: 'atlas_q_sales' });
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach(c => expect(c.queue_id).toBe('atlas_q_sales'));
    });

    it('should filter by agent', () => {
        const calls = callService.getCalls('atlas_support', { agent_id: 'atlas_agent_1' });
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach(c => expect(c.agent_id).toBe('atlas_agent_1'));
    });

    it('every completed call should have required fields', () => {
        const calls = callService.getCalls('atlas_support', { status: 'completed', limit: 50 });
        calls.forEach(call => {
            expect(call.id).toBeDefined();
            expect(call.tenant_id).toBe('atlas_support');
            expect(call.duration).toBeGreaterThan(0);
            expect(call.recording_url).toBeDefined();
            expect(call.transcript_text).toBeDefined();
            expect(call.sentiment_score).toBeDefined();
            expect(typeof call.sentiment_score).toBe('number');
        });
    });

    it('should create a new inbound call', () => {
        const call = callService.createInboundCall('atlas_support', {
            caller_number: '+90 555 999 0001', queue_id: 'atlas_q_sales'
        });
        expect(call.tenant_id).toBe('atlas_support');
        expect(call.call_type).toBe('inbound');
    });

    it('should create a new outbound call', () => {
        const call = callService.createOutboundCall('atlas_support', {
            agent_id: 'atlas_agent_1', callee_number: '+90 555 888 0001'
        });
        expect(call.tenant_id).toBe('atlas_support');
        expect(call.call_type).toBe('outbound');
    });
});

describe('Analytics Service', () => {
    it('should compute dashboard metrics', () => {
        const dashboard = analyticsService.getDashboard('atlas_support');
        expect(dashboard.overview.total_calls).toBeGreaterThan(0);
        expect(dashboard.average_handle_time).toBeDefined();
        expect(dashboard.average_handle_time.seconds).toBeGreaterThan(0);
        expect(dashboard.abandon_rate).toBeDefined();
        expect(dashboard.first_call_resolution).toBeDefined();
    });

    it('should compute per-agent metrics', () => {
        const metrics = analyticsService.getAgentMetrics('atlas_support', 'atlas_agent_1');
        expect(metrics.agent.name).toBe('Ayşe Kaya');
        expect(metrics.total_calls).toBeGreaterThan(0);
        expect(metrics.average_handle_time).toBeGreaterThan(0);
    });

    it('should compute per-queue metrics', () => {
        const queues = analyticsService.getQueueMetrics('atlas_support');
        expect(queues.length).toBe(3);
        queues.forEach(q => {
            expect(q.queue.name).toBeDefined();
            expect(q.total_calls).toBeGreaterThan(0);
        });
    });
});

describe('Recording Service', () => {
    it('should get recording for a call', () => {
        const calls = callService.getCalls('atlas_support', { status: 'completed', limit: 1 });
        const recording = recordingService.getRecording('atlas_support', calls[0].id);
        expect(recording.recording_url).toBeDefined();
        expect(recording.storage_provider).toBe('mock-s3');
    });

    it('should get storage stats', () => {
        const stats = recordingService.getStorageStats('atlas_support');
        expect(stats.total_recordings).toBeGreaterThan(0);
    });
});

describe('Transcription Service', () => {
    it('should get transcription for a call', () => {
        const calls = callService.getCalls('atlas_support', { status: 'completed', limit: 1 });
        const trans = transcriptionService.getTranscription('atlas_support', calls[0].id);
        expect(trans.transcript).toBeDefined();
        expect(trans.language).toBe('tr');
        expect(trans.word_count).toBeGreaterThan(0);
        expect(['positive', 'neutral', 'negative']).toContain(trans.sentiment_label);
    });
});
