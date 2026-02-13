/**
 * Public API & Developer Platform Design
 * 
 * REST + WebSocket API spec, OAuth2 + API key auth,
 * rate limiting, developer portal, SDK plan, webhooks.
 */

const PUBLIC_API = {

    // ═══════════════════════════════════════════════════
    // API OVERVIEW
    // ═══════════════════════════════════════════════════
    overview: {
        base_url: "https://api.smartflow.ai/v1",
        websocket_url: "wss://stream.smartflow.ai/v1",
        formats: ["JSON (REST)", "JSON (WebSocket frames)", "Server-Sent Events (streaming)"],
        versioning: "URL-path (/v1, /v2). Breaking changes = new version. Non-breaking additions to existing version.",
        environments: {
            production: "api.smartflow.ai",
            sandbox: "sandbox-api.smartflow.ai",
            self_hosted: "{{customer-domain}}/api"
        }
    },

    // ═══════════════════════════════════════════════════
    // REST API ENDPOINTS
    // ═══════════════════════════════════════════════════
    endpoints: {
        authentication: [
            { method: "POST", path: "/auth/token", description: "Exchange OAuth2 code for access token", auth: "client_credentials", rate: "10/min" },
            { method: "POST", path: "/auth/refresh", description: "Refresh access token", auth: "refresh_token", rate: "10/min" },
            { method: "POST", path: "/auth/revoke", description: "Revoke token", auth: "bearer", rate: "10/min" },
            { method: "GET", path: "/auth/keys", description: "List API keys for tenant", auth: "bearer", rate: "30/min" },
            { method: "POST", path: "/auth/keys", description: "Create new API key", auth: "bearer", rate: "5/min" },
            { method: "DELETE", path: "/auth/keys/:keyId", description: "Revoke API key", auth: "bearer", rate: "10/min" }
        ],
        agents: [
            { method: "GET", path: "/agents", description: "List AI agents", auth: "api_key|bearer", rate: "60/min" },
            { method: "POST", path: "/agents", description: "Create AI agent from template or custom config", auth: "api_key|bearer", rate: "10/min" },
            { method: "GET", path: "/agents/:agentId", description: "Get agent details + config", auth: "api_key|bearer", rate: "60/min" },
            { method: "PATCH", path: "/agents/:agentId", description: "Update agent config (greeting, persona, rules)", auth: "api_key|bearer", rate: "30/min" },
            { method: "DELETE", path: "/agents/:agentId", description: "Delete agent", auth: "api_key|bearer", rate: "10/min" },
            { method: "POST", path: "/agents/:agentId/test", description: "Trigger a test call to agent", auth: "api_key|bearer", rate: "5/min" },
            { method: "GET", path: "/agents/:agentId/metrics", description: "Agent performance metrics", auth: "api_key|bearer", rate: "30/min" }
        ],
        calls: [
            { method: "GET", path: "/calls", description: "List calls (filterable by date, status, agent)", auth: "api_key|bearer", rate: "60/min" },
            { method: "GET", path: "/calls/:callId", description: "Get call detail (metadata, transcript, actions)", auth: "api_key|bearer", rate: "60/min" },
            { method: "GET", path: "/calls/:callId/transcript", description: "Full transcript with timestamps + sentiment", auth: "api_key|bearer", rate: "30/min" },
            { method: "GET", path: "/calls/:callId/recording", description: "Audio recording (pre-signed URL, 1h expiry)", auth: "api_key|bearer", rate: "10/min" },
            { method: "POST", path: "/calls/outbound", description: "Initiate outbound AI call", auth: "api_key|bearer", rate: "10/min" },
            { method: "POST", path: "/calls/:callId/transfer", description: "Transfer active call to human agent", auth: "api_key|bearer", rate: "30/min" }
        ],
        phone_numbers: [
            { method: "GET", path: "/phone-numbers", description: "List provisioned numbers", auth: "api_key|bearer", rate: "30/min" },
            { method: "POST", path: "/phone-numbers", description: "Provision a new number", auth: "api_key|bearer", rate: "5/min" },
            { method: "PATCH", path: "/phone-numbers/:numberId", description: "Update routing (assign to agent)", auth: "api_key|bearer", rate: "10/min" },
            { method: "DELETE", path: "/phone-numbers/:numberId", description: "Release number", auth: "api_key|bearer", rate: "5/min" }
        ],
        appointments: [
            { method: "GET", path: "/appointments", description: "List appointments", auth: "api_key|bearer", rate: "60/min" },
            { method: "POST", path: "/appointments", description: "Create appointment manually", auth: "api_key|bearer", rate: "30/min" },
            { method: "PATCH", path: "/appointments/:apptId", description: "Update/reschedule appointment", auth: "api_key|bearer", rate: "30/min" },
            { method: "DELETE", path: "/appointments/:apptId", description: "Cancel appointment", auth: "api_key|bearer", rate: "30/min" }
        ],
        workflows: [
            { method: "GET", path: "/workflows", description: "List workflows", auth: "api_key|bearer", rate: "60/min" },
            { method: "POST", path: "/workflows", description: "Create workflow (JSON graph)", auth: "api_key|bearer", rate: "10/min" },
            { method: "GET", path: "/workflows/:workflowId", description: "Get workflow definition", auth: "api_key|bearer", rate: "60/min" },
            { method: "PATCH", path: "/workflows/:workflowId", description: "Update workflow", auth: "api_key|bearer", rate: "30/min" },
            { method: "POST", path: "/workflows/:workflowId/execute", description: "Manually trigger workflow", auth: "api_key|bearer", rate: "10/min" },
            { method: "GET", path: "/workflows/:workflowId/runs", description: "List execution history", auth: "api_key|bearer", rate: "30/min" }
        ],
        analytics: [
            { method: "GET", path: "/analytics/overview", description: "Dashboard overview (calls, minutes, CSAT)", auth: "api_key|bearer", rate: "30/min" },
            { method: "GET", path: "/analytics/calls", description: "Call analytics (volume, duration, resolution)", auth: "api_key|bearer", rate: "30/min" },
            { method: "GET", path: "/analytics/agents", description: "Per-agent performance metrics", auth: "api_key|bearer", rate: "30/min" },
            { method: "GET", path: "/analytics/benchmarks", description: "Industry benchmarks (anonymized)", auth: "api_key|bearer", rate: "10/min" },
            { method: "POST", path: "/analytics/export", description: "Schedule CSV/JSON export", auth: "api_key|bearer", rate: "5/min" }
        ],
        plugins: [
            { method: "GET", path: "/plugins", description: "List installed plugins", auth: "api_key|bearer", rate: "30/min" },
            { method: "POST", path: "/plugins/:pluginId/install", description: "Install marketplace plugin", auth: "bearer", rate: "5/min" },
            { method: "DELETE", path: "/plugins/:pluginId", description: "Uninstall plugin", auth: "bearer", rate: "5/min" },
            { method: "GET", path: "/plugins/:pluginId/config", description: "Get plugin config", auth: "api_key|bearer", rate: "30/min" },
            { method: "PATCH", path: "/plugins/:pluginId/config", description: "Update plugin config", auth: "bearer", rate: "10/min" }
        ],
        billing: [
            { method: "GET", path: "/billing/usage", description: "Current period usage (minutes consumed)", auth: "bearer", rate: "30/min" },
            { method: "GET", path: "/billing/invoices", description: "List invoices", auth: "bearer", rate: "10/min" },
            { method: "GET", path: "/billing/plan", description: "Current plan details", auth: "bearer", rate: "10/min" }
        ]
    },

    // ═══════════════════════════════════════════════════
    // WEBSOCKET API
    // ═══════════════════════════════════════════════════
    websocket: {
        connection: "wss://stream.smartflow.ai/v1?token={{access_token}}",
        channels: [
            {
                channel: "calls.live",
                description: "Real-time call events for all active calls",
                events: [
                    { event: "call.started", payload: "{ callId, agentId, callerNumber, timestamp }" },
                    { event: "call.transcript_chunk", payload: "{ callId, speaker, text, confidence, sentiment, timestamp }" },
                    { event: "call.intent_detected", payload: "{ callId, intent, confidence, entities }" },
                    { event: "call.action_taken", payload: "{ callId, action, details, timestamp }" },
                    { event: "call.transferred", payload: "{ callId, targetAgent, reason, transcript }" },
                    { event: "call.ended", payload: "{ callId, duration, resolution, summary }" }
                ]
            },
            {
                channel: "agents.status",
                description: "Agent state changes",
                events: [
                    { event: "agent.online", payload: "{ agentId, timestamp }" },
                    { event: "agent.busy", payload: "{ agentId, callId }" },
                    { event: "agent.error", payload: "{ agentId, error, timestamp }" }
                ]
            },
            {
                channel: "workflows.execution",
                description: "Workflow execution progress",
                events: [
                    { event: "workflow.started", payload: "{ workflowId, runId, trigger }" },
                    { event: "workflow.node_completed", payload: "{ runId, nodeId, output, duration }" },
                    { event: "workflow.completed", payload: "{ runId, status, duration }" },
                    { event: "workflow.failed", payload: "{ runId, nodeId, error }" }
                ]
            }
        ],
        heartbeat: "Ping every 30s. Disconnect after 3 missed pongs.",
        reconnection: "Exponential backoff: 1s, 2s, 4s, 8s, max 30s"
    },

    // ═══════════════════════════════════════════════════
    // AUTH SYSTEM
    // ═══════════════════════════════════════════════════
    auth: {
        methods: {
            oauth2: {
                grant_types: ["authorization_code", "client_credentials"],
                scopes: [
                    { scope: "agents:read", description: "Read agent configs" },
                    { scope: "agents:write", description: "Create/update/delete agents" },
                    { scope: "calls:read", description: "Read call data, transcripts, recordings" },
                    { scope: "calls:write", description: "Initiate outbound calls, transfer" },
                    { scope: "appointments:read", description: "Read appointments" },
                    { scope: "appointments:write", description: "Create/update/cancel appointments" },
                    { scope: "workflows:read", description: "Read workflow definitions" },
                    { scope: "workflows:write", description: "Create/update/execute workflows" },
                    { scope: "analytics:read", description: "Read analytics and benchmarks" },
                    { scope: "billing:read", description: "Read billing info" },
                    { scope: "plugins:manage", description: "Install/uninstall/configure plugins" },
                    { scope: "admin", description: "Full admin access (all scopes)" }
                ],
                token_lifetime: { access: "1 hour", refresh: "30 days" },
                endpoints: {
                    authorize: "https://auth.smartflow.ai/authorize",
                    token: "https://auth.smartflow.ai/token",
                    revoke: "https://auth.smartflow.ai/revoke"
                }
            },
            api_key: {
                description: "For server-to-server integrations. Scoped per key.",
                format: "sk_live_{{base64(tenant_id:key_id:random)}}",
                rotation: "New key active immediately, old key valid for 24h grace period",
                ip_restriction: "Optional IP allowlist per key"
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // RATE LIMITING & QUOTAS
    // ═══════════════════════════════════════════════════
    rate_limits: {
        strategy: "Sliding window with token bucket. Per API key or OAuth token.",
        tiers: [
            { plan: "Starter", requests_per_min: 60, burst: 10, concurrent_ws: 2 },
            { plan: "Pro", requests_per_min: 300, burst: 30, concurrent_ws: 5 },
            { plan: "Enterprise", requests_per_min: 1000, burst: 100, concurrent_ws: 20 },
            { plan: "Partner", requests_per_min: 3000, burst: 200, concurrent_ws: 50 }
        ],
        headers: {
            "X-RateLimit-Limit": "Requests allowed per window",
            "X-RateLimit-Remaining": "Requests remaining in current window",
            "X-RateLimit-Reset": "Unix timestamp of window reset",
            "Retry-After": "Seconds to wait (on 429 response)"
        },
        exceeded_response: { status: 429, body: { error: "rate_limit_exceeded", message: "Rate limit exceeded. Retry after {{retry_after}} seconds.", retry_after: "{{seconds}}" } }
    },

    // ═══════════════════════════════════════════════════
    // WEBHOOK DELIVERY
    // ═══════════════════════════════════════════════════
    webhooks: {
        description: "Push events to customer endpoints. Configure via API or dashboard.",
        delivery: {
            method: "POST",
            content_type: "application/json",
            signature: "HMAC-SHA256 in X-SmartFlow-Signature header",
            timeout: "10 seconds",
            retries: { count: 5, backoff: "exponential (1m, 5m, 30m, 2h, 12h)" },
            deactivation: "After 5 consecutive failures over 24h, webhook is paused. Email notification sent."
        },
        events: [
            "call.started", "call.completed", "call.transferred", "call.recording_ready",
            "appointment.created", "appointment.updated", "appointment.canceled",
            "agent.error", "agent.config_changed",
            "workflow.completed", "workflow.failed",
            "billing.usage_threshold", "billing.invoice_created",
            "plugin.installed", "plugin.error"
        ],
        schema: {
            id: "evt_{{uuid}}",
            type: "call.completed",
            created_at: "2026-02-12T10:00:00Z",
            tenant_id: "t_{{uuid}}",
            data: "{ ... event-specific payload ... }",
            api_version: "v1"
        },
        verification_endpoint: "POST /webhooks/verify — echoes challenge token to confirm ownership"
    },

    // ═══════════════════════════════════════════════════
    // DEVELOPER PORTAL SCHEMA
    // ═══════════════════════════════════════════════════
    developer_portal: {
        url: "https://developers.smartflow.ai",
        sections: [
            { name: "Getting Started", content: "Quick start guide, first API call in 5 min, sandbox setup" },
            { name: "Authentication", content: "OAuth2 flow, API key management, scopes reference" },
            { name: "API Reference", content: "OpenAPI 3.1 spec, interactive explorer (Swagger UI)" },
            { name: "WebSocket Guide", content: "Connection, channels, event schemas, reconnection" },
            { name: "Webhooks", content: "Setup, event catalog, signature verification, testing" },
            { name: "SDKs", content: "JavaScript, Python, Go, Ruby — installation + examples" },
            { name: "Plugins", content: "Build plugins, manifest format, submission, sandbox testing" },
            { name: "Workflows", content: "Workflow JSON schema, node types, execution model" },
            { name: "Templates", content: "Template catalog, customization, publishing" },
            { name: "Changelog", content: "Version history, breaking changes, migration guides" }
        ],
        interactive_features: [
            "API explorer with live sandbox requests",
            "Webhook tester (send test events to your endpoint)",
            "WebSocket debugger (connect and see live events)",
            "Code generator (curl, JS, Python, Go for any endpoint)"
        ]
    },

    // ═══════════════════════════════════════════════════
    // SDK GENERATION PLAN
    // ═══════════════════════════════════════════════════
    sdks: {
        generation: "Auto-generated from OpenAPI 3.1 spec via openapi-generator",
        languages: [
            { lang: "JavaScript/TypeScript", package: "@smartflow/sdk", registry: "npm", priority: "P0" },
            { lang: "Python", package: "smartflow-sdk", registry: "PyPI", priority: "P0" },
            { lang: "Go", package: "github.com/smartflow-ai/go-sdk", registry: "Go Modules", priority: "P1" },
            { lang: "Ruby", package: "smartflow", registry: "RubyGems", priority: "P2" },
            { lang: "PHP", package: "smartflow/sdk", registry: "Packagist", priority: "P2" }
        ],
        features: [
            "Type-safe request/response objects",
            "Automatic retry with exponential backoff",
            "Built-in rate limit handling (auto-wait on 429)",
            "WebSocket client with auto-reconnect",
            "Webhook signature verification helper",
            "Pagination helpers (cursor-based)"
        ],
        example_js: `
const SmartFlow = require('@smartflow/sdk');
const client = new SmartFlow({ apiKey: 'sk_live_...' });

// List calls from today
const calls = await client.calls.list({
  after: '2026-02-12',
  status: 'completed',
  limit: 50
});

// Stream live transcripts
const ws = client.stream.connect();
ws.subscribe('calls.live', (event) => {
  if (event.type === 'call.transcript_chunk') {
    console.log(\`[\${event.data.speaker}]: \${event.data.text}\`);
  }
});

// Create a workflow
const workflow = await client.workflows.create({
  name: 'After-hours routing',
  trigger: { type: 'call.started', conditions: { hour_range: [18, 8] } },
  nodes: [...] // see workflow builder schema
});
`
    },

    // ═══════════════════════════════════════════════════
    // API RESPONSE SCHEMAS
    // ═══════════════════════════════════════════════════
    response_schemas: {
        pagination: {
            data: "Array of resources",
            meta: {
                total: "Total count",
                page: "Current page",
                per_page: "Items per page",
                cursor: "Cursor for next page (cursor-based pagination)"
            },
            links: {
                next: "URL for next page",
                prev: "URL for previous page"
            }
        },
        error: {
            error: {
                type: "validation_error | authentication_error | rate_limit_exceeded | not_found | internal_error",
                message: "Human-readable description",
                code: "machine-readable error code (e.g., INVALID_AGENT_CONFIG)",
                details: "Array of field-level errors (for validation)",
                request_id: "req_{{uuid}} (for support reference)"
            }
        },
        call_object: {
            id: "call_{{uuid}}",
            agent_id: "agent_{{uuid}}",
            phone_number: "+1234567890",
            direction: "inbound | outbound",
            status: "ringing | active | completed | transferred | failed",
            started_at: "ISO 8601",
            ended_at: "ISO 8601",
            duration_seconds: 142,
            duration_minutes: 2.37,
            billed_minutes: 3,
            intent: "appointment_booking | faq | complaint | transfer | unknown",
            resolution: "resolved | transferred | voicemail | abandoned",
            sentiment: { overall: "positive", score: 0.82 },
            caller_satisfaction: 4.5,
            transcript_url: "/calls/call_xxx/transcript",
            recording_url: "/calls/call_xxx/recording",
            actions: [
                { type: "appointment_booked", details: { date: "2026-02-15", time: "14:00" } }
            ],
            metadata: {}
        },
        agent_object: {
            id: "agent_{{uuid}}",
            name: "Front Desk Agent",
            template: "healthcare_receptionist",
            status: "active | paused | error",
            config: {
                greeting: "Thank you for calling...",
                persona: "professional, warm",
                language: "en-US",
                capabilities: ["appointment_booking", "faq", "complaint_intake", "transfer"],
                transfer_triggers: ["legal question", "medical emergency", "billing dispute"],
                business_hours: { timezone: "America/New_York", hours: { mon_fri: "8:00-18:00" } },
                calendar_integration: { provider: "google", calendar_id: "..." }
            },
            metrics: {
                total_calls: 1420,
                resolution_rate: 0.78,
                avg_duration_seconds: 156,
                avg_satisfaction: 4.7
            },
            created_at: "ISO 8601",
            updated_at: "ISO 8601"
        }
    }
};

module.exports = PUBLIC_API;
