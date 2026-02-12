const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { initDatabase, closeDatabase, saveDatabase } = require('./config/database');
const { setupVoiceWebSocket, getActiveSessions } = require('./services/voice.ws');
const { rateLimitMiddleware } = require('./middleware/rate-limiter');
const { cleanupExpiredTokens, JWT_SECRET } = require('./middleware/auth');
const { logger } = require('./utils/logger');
const metrics = require('./services/metrics.service');
const { correlationMiddleware } = require('./middleware/correlation');
const eventBus = require('./services/event-bus');
const auditService = require('./services/audit.service');

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Twilio sends form-encoded webhooks
app.use(correlationMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    const requestId = require('uuid').v4().slice(0, 8);
    req.requestId = requestId;

    res.on('finish', () => {
        const duration = Date.now() - start;
        metrics.observe('http_request_duration_ms', duration, { method: req.method, path: req.path.split('/').slice(0, 3).join('/') });
        metrics.inc('http_requests_total', { method: req.method, status: String(res.statusCode) });
        if (res.statusCode >= 500) {
            metrics.inc('errors_total', { component: 'http' });
        }
    });

    next();
});

// Swagger configuration
const swaggerSpec = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'AI-Powered Voice Call Center API',
            version: '3.0.0',
            description: 'Real-Time Voice AI SaaS Platform with streaming pipeline, conversation memory, human handoff, usage-based billing, observability, and enterprise security.',
            contact: { name: 'Platform Admin' }
        },
        servers: [{ url: `http://localhost:${PORT}`, description: 'Development' }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: [path.join(__dirname, 'routes', '*.js')]
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Voice AI Platform API Docs'
}));

app.get('/api/spec', (req, res) => res.json(swaggerSpec));

// Rate limiting on API routes
app.use('/api', rateLimitMiddleware);

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/tenants', require('./routes/tenant.routes'));
app.use('/api/calls', require('./routes/call.routes'));
app.use('/api/recordings', require('./routes/recording.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/branding', require('./routes/branding.routes'));
app.use('/api/billing', require('./routes/billing.routes'));
app.use('/api/handoffs', require('./routes/handoff.routes'));
app.use('/api/metrics/latency', require('./routes/latency.routes'));
app.use('/api/compliance', require('./routes/compliance.routes'));
app.use('/api/twilio', require('./routes/twilio.routes'));
app.use('/api/call', require('./routes/outbound.routes'));

// Enterprise Onboarding routes (v5)
app.use('/api', require('./routes/signup.routes'));
app.use('/api/subscription', require('./routes/subscription.routes'));
app.use('/api/twilio-setup', require('./routes/twilio-setup.routes'));
app.use('/api/onboarding', require('./routes/onboarding.routes'));

// Seed subscription plans
try {
    const subscriptionService = require('./services/subscription.service');
    subscriptionService.seedPlans();
} catch (e) { /* table may not exist yet */ }

// Metrics endpoint (Prometheus-compatible)
const metricsHandler = (req, res) => {
    metrics.setGauge('uptime_seconds', Math.round(process.uptime()));
    metrics.setGauge('memory_rss_bytes', process.memoryUsage().rss);
    metrics.setGauge('event_loop_lag_ms', 0); // placeholder for real measurement
    const accept = req.headers.accept || '';
    if (accept.includes('application/json')) {
        res.json(metrics.toJSON());
    } else {
        res.set('Content-Type', 'text/plain');
        res.send(metrics.toPrometheus());
    }
};
app.get('/api/metrics', metricsHandler);
app.get('/metrics', metricsHandler);  // Standard Prometheus scrape path

// Health check
app.get('/api/health', (req, res) => {
    const { dbPrepareGet } = require('./config/database');
    try {
        const tenants = dbPrepareGet('SELECT COUNT(*) as c FROM tenants').c;
        const calls = dbPrepareGet('SELECT COUNT(*) as c FROM calls').c;
        const aiEnriched = dbPrepareGet('SELECT COUNT(*) as c FROM calls WHERE intent IS NOT NULL').c;
        const activeSessions = getActiveSessions();

        res.json({
            status: 'healthy',
            version: '3.0.0',
            uptime: process.uptime(),
            database: { tenants, calls, ai_enriched: aiEnriched },
            voice: {
                active_sessions: activeSessions.length,
                providers: {
                    stt: require('./services/stt.adapter').provider,
                    llm: require('./services/llm.streaming').provider,
                    tts: require('./services/tts.adapter').provider
                }
            },
            metrics: {
                total_requests: metrics.getCounter('http_requests_total'),
                errors: metrics.getCounter('errors_total'),
                voice_sessions: metrics.getCounter('voice_sessions_total'),
                handoffs: metrics.getCounter('handoffs_total')
            }
        });
    } catch (e) {
        res.json({ status: 'healthy', version: '3.0.0', uptime: process.uptime(), database: 'initializing' });
    }
});

// Serve panels
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.get('/agent', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'agent', 'index.html'));
});

app.get('/voice', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'voice', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    metrics.inc('errors_total', { component: 'unhandled' });
    res.status(500).json({ error: 'Internal server error' });
});

// Auto-save DB periodically
setInterval(() => { try { saveDatabase(); } catch (e) { } }, 30000);

// Cleanup expired refresh tokens periodically
setInterval(() => { cleanupExpiredTokens(); }, 3600000);

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    try {
        const mediaWorker = require('./services/media-worker');
        await mediaWorker.shutdown();
    } catch (e) { /* ignore */ }
    try {
        const redis = require('./services/redis.service');
        await redis.shutdown();
    } catch (e) { /* ignore */ }
    try {
        const bus = require('./services/event-bus');
        await bus.shutdown();
    } catch (e) { /* ignore */ }
    closeDatabase();
    process.exit(0);
});

// Start with async DB init
async function start() {
    await initDatabase();

    // Initialize production infrastructure
    const redis = require('./services/redis.service');
    await redis.init();

    await eventBus.init(redis);
    auditService.init();

    const workerRegistry = require('./services/worker-registry');
    await workerRegistry.init(redis);

    const mediaWorker = require('./services/media-worker');
    await mediaWorker.start();

    const server = http.createServer(app);

    // Attach WebSocket server
    setupVoiceWebSocket(server, JWT_SECRET);

    server.listen(PORT, () => {
        logger.info('Server started', { port: PORT, version: '5.0.0' });
        console.log(`
╔══════════════════════════════════════════════════════╗
║   🎧 Real-Time Voice AI Platform v5.0               ║
║   ⚡ Enterprise Onboarding & Self-Service            ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║   Server:     http://localhost:${PORT}                  ║
║   Admin:      http://localhost:${PORT}/admin             ║
║   Signup:     POST /api/signup                       ║
║   Plans:      GET /api/subscription/plans            ║
║   Onboard:    GET /api/onboarding/checklist          ║
║   Voice:      http://localhost:${PORT}/voice             ║
║   API Docs:   http://localhost:${PORT}/api-docs          ║
║   Health:     http://localhost:${PORT}/api/health         ║
║   Metrics:    http://localhost:${PORT}/metrics            ║
║                                                      ║
║   Redis:      ${redis.isConnected ? '🟢 Connected' : '🔶 Memory Mode'}                       ║
║   Worker:     ${mediaWorker.id.slice(0, 24).padEnd(24)}           ║
║   Stripe:     ${process.env.STRIPE_SECRET_KEY ? '🟢 Active' : '🔶 Dev Mode'}                       ║
║   2FA/TOTP:   🟢 Ready                              ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
    });
    return server;
}

if (require.main === module) {
    start().catch(err => {
        logger.error('Failed to start', { error: err.message });
        process.exit(1);
    });
}

module.exports = { app, start };
