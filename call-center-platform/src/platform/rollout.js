/**
 * Stage 5 — Rollout Phases & Folder Structure
 * 
 * 4-phase rollout timeline and recommended
 * folder structure for the platform layer.
 */

const ROLLOUT = {

    // ═══════════════════════════════════════════════════
    // FOLDER STRUCTURE
    // ═══════════════════════════════════════════════════
    folder_structure: {
        description: "Recommended folder structure for the platform layer within the existing monorepo.",
        tree: `
src/
├── platform/                        # ← Stage 5 — Platform Moat & Ecosystem
│   ├── public-api.js                # REST + WebSocket API spec, auth, rate limits, webhooks, SDKs
│   ├── marketplace.js               # Plugin manifest, lifecycle, sandbox, revenue share
│   ├── workflow-builder.js          # Node graph schema, node library, execution engine, versioning
│   ├── template-library.js          # 8 vertical templates, customization API, marketplace integration
│   ├── data-moat.js                 # Anonymized pipeline, insights, benchmarks, fine-tuning
│   ├── self-hosted.js               # Container architecture, licensing, air-gap, sync protocol
│   └── rollout.js                   # This file — phases, folder structure, dependencies
│
├── content/                         # ← Stages 3-4 — Sales & GTM content
│   ├── marketing-copy.js
│   ├── email-sequences.js
│   ├── cs-playbooks.js
│   ├── analytics-taxonomy.js
│   ├── security-compliance.js
│   ├── enterprise-sales-kit.js
│   ├── poc-framework.js
│   ├── abm-playbooks.js
│   ├── partner-program.js
│   └── deal-desk.js
│
├── routes/                          # ← Stage 3 — API routes
│   ├── onboarding.routes.js
│   └── demo.routes.js
│
└── services/                        # Future — service implementations
    ├── api-gateway/                 #   API gateway + auth middleware
    ├── voice-engine/                #   Core voice AI pipeline
    ├── workflow-engine/             #   Workflow execution runtime
    ├── plugin-sandbox/              #   Plugin sandboxed execution
    ├── metering/                    #   Usage metering + billing
    └── data-pipeline/               #   Anonymization + aggregation
`
    },

    // ═══════════════════════════════════════════════════
    // 4-PHASE ROLLOUT PLAN
    // ═══════════════════════════════════════════════════
    phases: [
        {
            phase: "P1 — Foundation",
            timeline: "Months 1-3",
            theme: "Ship the public API and developer portal",
            deliverables: [
                { item: "Public REST API v1 (all endpoints)", owner: "Backend", status: "build", priority: "P0" },
                { item: "OAuth2 + API key authentication", owner: "Backend", status: "build", priority: "P0" },
                { item: "Rate limiting middleware", owner: "Backend", status: "build", priority: "P0" },
                { item: "Webhook delivery system (with retries)", owner: "Backend", status: "build", priority: "P0" },
                { item: "Developer portal (docs, API explorer, changelog)", owner: "Frontend", status: "build", priority: "P0" },
                { item: "JavaScript SDK + Python SDK (auto-generated)", owner: "DevEx", status: "build", priority: "P0" },
                { item: "WebSocket streaming API", owner: "Backend", status: "build", priority: "P1" },
                { item: "Sandbox environment for developers", owner: "Infra", status: "build", priority: "P1" }
            ],
            success_metrics: [
                "API v1 serves 100% of dashboard functionality (dogfooding)",
                "≥50 developer accounts within 30 days of launch",
                "SDK download count ≥200 in first month",
                "Webhook delivery success rate ≥99.5%"
            ],
            dependencies: [
                "Existing call center platform fully operational",
                "Auth infrastructure (Firebase Auth or custom)",
                "CI/CD pipeline for SDK publishing"
            ]
        },
        {
            phase: "P2 — Ecosystem",
            timeline: "Months 4-6",
            theme: "Launch the marketplace and workflow builder",
            deliverables: [
                { item: "Plugin manifest schema + validation CLI", owner: "DevEx", status: "build", priority: "P0" },
                { item: "Plugin sandbox execution environment (V8 isolates)", owner: "Backend", status: "build", priority: "P0" },
                { item: "Marketplace web UI (browse, install, configure)", owner: "Frontend", status: "build", priority: "P0" },
                { item: "Plugin review pipeline (automated + manual)", owner: "Ops", status: "build", priority: "P0" },
                { item: "No-code workflow builder UI (drag-and-drop)", owner: "Frontend", status: "build", priority: "P0" },
                { item: "Workflow execution engine (event-driven, checkpointed)", owner: "Backend", status: "build", priority: "P0" },
                { item: "8 pre-built workflow templates", owner: "Product", status: "build", priority: "P1" },
                { item: "5 first-party plugins (Salesforce, HubSpot, Google Calendar, Slack, Zapier)", owner: "Integrations", status: "build", priority: "P1" },
                { item: "Revenue share system + developer payouts", owner: "Billing", status: "build", priority: "P1" },
                { item: "Go, Ruby SDKs", owner: "DevEx", status: "build", priority: "P2" }
            ],
            success_metrics: [
                "≥10 published plugins (including 5 first-party)",
                "≥100 workflows created by customers",
                "Workflow execution success rate ≥98%",
                "Plugin marketplace MAU ≥500"
            ],
            dependencies: [
                "P1 (Public API) fully launched",
                "Plugin sandbox infrastructure provisioned",
                "Workflow UI design system approved"
            ]
        },
        {
            phase: "P3 — Intelligence",
            timeline: "Months 7-9",
            theme: "Launch vertical templates, benchmarks, and data moat",
            deliverables: [
                { item: "Template library UI (browse, preview, apply)", owner: "Frontend", status: "build", priority: "P0" },
                { item: "15 vertical templates (8 industries)", owner: "Product + AI", status: "build", priority: "P0" },
                { item: "Template customization API + one-click deploy", owner: "Backend", status: "build", priority: "P0" },
                { item: "Anonymized data pipeline (collection → aggregation)", owner: "Data", status: "build", priority: "P0" },
                { item: "Benchmark engine (6 metrics × 8 verticals)", owner: "Data", status: "build", priority: "P0" },
                { item: "Cross-tenant insight engine (6 insight types)", owner: "Data + AI", status: "build", priority: "P1" },
                { item: "Dashboard benchmark widgets", owner: "Frontend", status: "build", priority: "P1" },
                { item: "Vertical model fine-tuning pipeline", owner: "ML", status: "build", priority: "P1" },
                { item: "Template marketplace (third-party templates)", owner: "DevEx", status: "build", priority: "P2" },
                { item: "A/B testing framework for model variants", owner: "ML", status: "build", priority: "P2" }
            ],
            success_metrics: [
                "≥60% of new signups use a template (vs. blank agent)",
                "Benchmark data covers ≥1000 tenants per vertical",
                "Vertical models show ≥5% improvement in resolution rate vs. base",
                "Data pipeline processes ≥1M anonymized records/day"
            ],
            dependencies: [
                "Sufficient customer base for anonymization k-anonymity (k=50)",
                "GPU infrastructure for fine-tuning (Vertex AI or dedicated)",
                "Legal review of data aggregation practices"
            ]
        },
        {
            phase: "P4 — Sovereignty",
            timeline: "Months 10-12",
            theme: "Self-hosted runtime, enterprise fine-tuning, ecosystem maturity",
            deliverables: [
                { item: "Self-hosted container packaging (11 services)", owner: "Infra", status: "build", priority: "P0" },
                { item: "Helm charts + Kubernetes deployment", owner: "Infra", status: "build", priority: "P0" },
                { item: "Licensing system (online + offline)", owner: "Backend", status: "build", priority: "P0" },
                { item: "Air-gapped deployment toolkit", owner: "Infra", status: "build", priority: "P0" },
                { item: "Cloud sync protocol (hybrid mode)", owner: "Backend", status: "build", priority: "P0" },
                { item: "Local metering + usage reporting", owner: "Backend", status: "build", priority: "P0" },
                { item: "Tenant-specific model fine-tuning (Enterprise)", owner: "ML", status: "build", priority: "P1" },
                { item: "Monitoring stack (Prometheus + Grafana + Loki)", owner: "Infra", status: "build", priority: "P1" },
                { item: "Government-ready hardening (FedRAMP prep)", owner: "Security", status: "build", priority: "P2" },
                { item: "Partner white-label self-hosted bundle", owner: "Partnerships", status: "build", priority: "P2" }
            ],
            success_metrics: [
                "≥3 enterprise customers on self-hosted deployment",
                "Air-gapped deployment tested and validated",
                "Tenant fine-tuning shows ≥10% improvement over vertical model",
                "License system handles online + offline validation with <0.1% false rejections"
            ],
            dependencies: [
                "P1-P3 fully launched and stable",
                "Enterprise customers who need on-premise (pipeline)",
                "Security audit and penetration testing completed",
                "GPU hosting partnerships (for customer on-premise support)"
            ]
        }
    ],

    // ═══════════════════════════════════════════════════
    // CROSS-CUTTING CONCERNS
    // ═══════════════════════════════════════════════════
    cross_cutting: {
        multi_tenancy: {
            description: "Every component is multi-tenant by design",
            isolation: "Schema-per-tenant in PostgreSQL. Namespace-per-tenant in Kubernetes.",
            routing: "Tenant resolved from subdomain, API key, or JWT claim",
            data: "Strict tenant isolation — no cross-tenant data leakage except anonymized aggregates"
        },
        minute_only_pricing: {
            description: "All pricing remains minute-based. No token exposure.",
            enforcement: [
                "API calls: no cost (within rate limits)",
                "Workflow execution: no cost (unless AI nodes used — those bill as minutes)",
                "Plugin execution: no cost (plugin pricing is separate marketplace concern)",
                "Self-hosted: per-minute metering regardless of infrastructure",
                "Benchmarks/insights: included in plan (no additional cost)"
            ]
        },
        white_label: {
            description: "Every customer-facing component supports white-label",
            scope: [
                "API: custom domain (api.{{partner}}.com)",
                "Dashboard: custom branding, logo, colors",
                "Marketplace: white-labeled marketplace for each partner",
                "Developer portal: optional white-label for partner developers",
                "Self-hosted: full white-label by default (no SmartFlow branding)"
            ]
        }
    }
};

module.exports = ROLLOUT;
