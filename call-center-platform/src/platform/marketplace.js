/**
 * App / Plugin Marketplace Architecture
 * 
 * Plugin manifest, lifecycle, marketplace schema,
 * sandboxed execution, and revenue share model.
 */

const MARKETPLACE = {

    // ═══════════════════════════════════════════════════
    // MARKETPLACE OVERVIEW
    // ═══════════════════════════════════════════════════
    overview: {
        url: "https://marketplace.smartflow.ai",
        api: "https://api.smartflow.ai/v1/marketplace",
        description: "Discover and install plugins that extend SmartFlow with new integrations, call actions, analytics, and workflows.",
        categories: [
            { name: "CRM Integrations", description: "Sync calls, contacts, and appointments to your CRM", examples: ["Salesforce", "HubSpot", "Zoho", "Pipedrive"] },
            { name: "Calendar & Scheduling", description: "Connect calendar systems for appointment booking", examples: ["Google Calendar", "Outlook", "Calendly", "Acuity"] },
            { name: "Productivity", description: "Notifications, task management, and team tools", examples: ["Slack", "Microsoft Teams", "Zapier", "Asana"] },
            { name: "Analytics & Reporting", description: "Advanced analytics, BI connectors, and custom reports", examples: ["Tableau", "Looker", "Custom dashboards"] },
            { name: "Voice & Telephony", description: "Extended voice capabilities and phone system integrations", examples: ["Number porting", "SIP trunking", "Multi-line routing"] },
            { name: "Compliance & Security", description: "Recording consent, data retention, audit tools", examples: ["HIPAA toolkit", "PCI redaction", "Audit logger"] },
            { name: "AI & Custom Logic", description: "Custom AI models, intent libraries, and response logic", examples: ["Industry intents", "Sentiment enhancer", "Custom NLU"] },
            { name: "Vertical Solutions", description: "Pre-built solutions for specific industries", examples: ["Dental suite", "Real estate pack", "Auto service bundle"] }
        ]
    },

    // ═══════════════════════════════════════════════════
    // PLUGIN MANIFEST SCHEMA
    // ═══════════════════════════════════════════════════
    manifest_schema: {
        spec_version: "1.0",
        description: "Every plugin must include a smartflow-plugin.json manifest in the repository root.",
        schema: {
            manifest_version: { type: "string", required: true, description: "Manifest spec version", example: "1.0" },
            plugin_id: { type: "string", required: true, description: "Unique identifier (reverse domain)", example: "com.salesforce.smartflow-crm-sync" },
            name: { type: "string", required: true, description: "Display name", example: "Salesforce CRM Sync" },
            version: { type: "semver", required: true, description: "Semantic version", example: "2.1.0" },
            description: { type: "string", required: true, description: "Short description (max 200 chars)" },
            long_description: { type: "markdown", required: false, description: "Full description with formatting" },
            author: {
                type: "object", required: true,
                properties: {
                    name: "Developer or company name",
                    email: "Contact email",
                    url: "Developer website",
                    verified: "boolean — SmartFlow-verified developer"
                }
            },
            category: { type: "string", required: true, enum: ["crm", "calendar", "productivity", "analytics", "telephony", "compliance", "ai", "vertical"] },
            pricing: {
                type: "object", required: true,
                properties: {
                    model: "free | one_time | monthly | per_minute | usage_based",
                    price: "number (USD) — 0 for free",
                    trial_days: "number — free trial period",
                    usage_unit: "string — for usage_based (e.g., 'per sync')"
                }
            },
            permissions: {
                type: "array", required: true,
                description: "OAuth scopes the plugin requires",
                example: ["calls:read", "appointments:write", "agents:read"]
            },
            hooks: {
                type: "object", required: false,
                description: "Event hooks the plugin subscribes to",
                properties: {
                    on_call_started: "Handler for call start events",
                    on_call_completed: "Handler for call completion",
                    on_call_transcript: "Handler for real-time transcript chunks",
                    on_appointment_created: "Handler for new appointments",
                    on_appointment_updated: "Handler for appointment changes",
                    on_workflow_trigger: "Handler for custom workflow triggers",
                    on_install: "Setup logic on plugin install",
                    on_uninstall: "Cleanup logic on plugin uninstall"
                }
            },
            config_schema: {
                type: "json_schema", required: false,
                description: "JSON Schema defining user-configurable settings",
                example: {
                    type: "object",
                    properties: {
                        salesforce_instance_url: { type: "string", title: "Salesforce Instance URL" },
                        sync_direction: { type: "string", enum: ["push", "pull", "bidirectional"], default: "push" },
                        auto_create_contacts: { type: "boolean", default: true }
                    },
                    required: ["salesforce_instance_url"]
                }
            },
            ui: {
                type: "object", required: false,
                properties: {
                    settings_page: "URL or component for plugin settings UI",
                    dashboard_widget: "JSON definition for dashboard widget (max 1)",
                    call_sidebar: "Component rendered during active calls"
                }
            },
            runtime: {
                type: "object", required: true,
                properties: {
                    engine: "node18 | node20 | python3.11 | wasm",
                    entry_point: "Path to main handler file",
                    memory_limit_mb: "number (max 256 for free, 512 for paid)",
                    timeout_seconds: "number (max 30 per invocation)",
                    environment_variables: "Array of env var names the plugin needs"
                }
            },
            compatibility: {
                type: "object", required: true,
                properties: {
                    min_api_version: "v1",
                    plans: "Array of plan names (e.g., ['pro', 'enterprise'] — empty = all plans)",
                    regions: "Array of supported regions (empty = all)"
                }
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // PLUGIN LIFECYCLE
    // ═══════════════════════════════════════════════════
    lifecycle: {
        phases: [
            {
                phase: "Development",
                steps: [
                    "Create smartflow-plugin.json manifest",
                    "Implement hook handlers and config schema",
                    "Test locally using SmartFlow Plugin CLI (sf-dev)",
                    "Run against sandbox environment (sandbox-api.smartflow.ai)",
                    "Write documentation (README.md)"
                ],
                tools: {
                    cli: "npx @smartflow/plugin-cli init | dev | test | package | submit",
                    sandbox: "Isolated tenant with test data, no billing"
                }
            },
            {
                phase: "Submission",
                steps: [
                    "Run automated checks: npx @smartflow/plugin-cli validate",
                    "Submit via developer portal or CLI: npx @smartflow/plugin-cli submit",
                    "Submission includes: manifest, source code, documentation, icon (512×512 PNG)"
                ],
                requirements: [
                    "All automated tests pass",
                    "No security vulnerabilities (Snyk scan)",
                    "Manifest is valid against schema",
                    "Description and screenshots provided",
                    "Privacy policy URL (if collects data)"
                ]
            },
            {
                phase: "Review",
                sla: "5 business days for first review",
                criteria: [
                    "Security: No data exfiltration, no excessive permissions, no eval() / dynamic code execution",
                    "Quality: Handles errors gracefully, respects rate limits, no memory leaks",
                    "UX: Clear configuration, helpful error messages, documentation complete",
                    "Compliance: Follows marketplace guidelines, pricing is fair and transparent",
                    "Performance: <100ms p95 for hook handlers, <256MB memory"
                ],
                outcomes: ["Approved", "Approved with conditions", "Rejected with feedback"]
            },
            {
                phase: "Published",
                steps: [
                    "Listed in marketplace with listing page",
                    "Discoverable via search and category browsing",
                    "Version updates follow same review process (expedited for trusted developers)",
                    "Usage analytics available in developer dashboard"
                ]
            },
            {
                phase: "Maintenance",
                responsibilities: [
                    "Developer: fix bugs, respond to reviews, update for API changes",
                    "SmartFlow: provide deprecation notice (90 days) for API changes",
                    "SmartFlow: remove plugins that violate guidelines or are abandoned (180 days inactive)"
                ]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // SANDBOXED EXECUTION
    // ═══════════════════════════════════════════════════
    sandbox: {
        title: "Plugin Sandboxed Execution Environment",
        architecture: {
            isolation: "Each plugin invocation runs in an isolated V8 isolate (Cloudflare Workers model) or container",
            networking: "Outbound HTTPS only to declared domains in manifest. No raw TCP/UDP.",
            filesystem: "No filesystem access. Persistent state via SmartFlow KV store (per-plugin, per-tenant).",
            secrets: "Plugin secrets stored encrypted. Injected as env vars at runtime. Never logged.",
            memory: "Hard limit: 256MB (free) / 512MB (paid). OOM = invocation terminated.",
            cpu: "Max 30s CPU time per invocation. Long-running tasks must use async / queue pattern.",
            kv_store: {
                description: "Per-plugin, per-tenant key-value store for persistent state",
                limits: { max_keys: 10000, max_value_size: "256KB", max_total: "100MB" },
                api: {
                    get: "await ctx.kv.get(key)",
                    set: "await ctx.kv.set(key, value, { ttl: 3600 })",
                    delete: "await ctx.kv.delete(key)",
                    list: "await ctx.kv.list({ prefix: 'cache:' })"
                }
            }
        },
        security: {
            permissions: "Plugin can ONLY access scopes declared in manifest and approved by tenant admin",
            data_access: "Plugin receives ONLY data relevant to subscribed hooks. No full database access.",
            audit: "All plugin invocations logged (timestamp, plugin_id, tenant_id, hook, duration, status)",
            rate_limits: "Plugin API calls count against tenant's rate limit quota"
        }
    },

    // ═══════════════════════════════════════════════════
    // REVENUE SHARE MODEL
    // ═══════════════════════════════════════════════════
    revenue_share: {
        title: "Marketplace Revenue Share",
        model: {
            developer_share: "70%",
            smartflow_share: "30%",
            note: "Standard 70/30 split (same as Apple App Store, Shopify). Renegotiable at $100K+ annual revenue."
        },
        payout: {
            frequency: "Monthly, NET 30",
            minimum: "$50 (rolls over if below)",
            methods: ["ACH (US)", "Wire transfer (international)", "PayPal"],
            reporting: "Real-time revenue dashboard in developer portal"
        },
        free_plugins: {
            description: "Free plugins are encouraged. Developers can monetize via premium tiers or usage-based pricing.",
            examples: [
                "Freemium: Basic CRM sync free, advanced sync $9/mo",
                "Usage-based: Free up to 100 syncs/mo, $0.01/sync after",
                "Lead gen: Free plugin, developer sells consulting services"
            ]
        },
        promotions: {
            featured_listing: "SmartFlow may feature high-quality plugins at no additional cost",
            launch_bonus: "First 50 plugins to launch receive 90/10 split for first 12 months",
            enterprise_referral: "If plugin drives enterprise upgrades, developer earns 5% of plan delta for 12 months"
        }
    },

    // ═══════════════════════════════════════════════════
    // MARKETPLACE API
    // ═══════════════════════════════════════════════════
    marketplace_api: {
        endpoints: [
            { method: "GET", path: "/marketplace/plugins", description: "Search/browse plugins", auth: "none (public)" },
            { method: "GET", path: "/marketplace/plugins/:pluginId", description: "Plugin detail page data", auth: "none" },
            { method: "GET", path: "/marketplace/plugins/:pluginId/reviews", description: "User reviews", auth: "none" },
            { method: "POST", path: "/marketplace/plugins/:pluginId/reviews", description: "Submit review", auth: "bearer" },
            { method: "GET", path: "/marketplace/categories", description: "List categories", auth: "none" },
            { method: "GET", path: "/marketplace/featured", description: "Featured plugins", auth: "none" },
            { method: "POST", path: "/marketplace/developer/plugins", description: "Submit plugin for review", auth: "developer_token" },
            { method: "PATCH", path: "/marketplace/developer/plugins/:pluginId", description: "Update plugin listing", auth: "developer_token" },
            { method: "GET", path: "/marketplace/developer/analytics", description: "Developer revenue + usage analytics", auth: "developer_token" }
        ]
    }
};

module.exports = MARKETPLACE;
