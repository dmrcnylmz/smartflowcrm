/**
 * Self-Hosted AI Runtime (Optional)
 * 
 * Container architecture, licensing, air-gapped deployment,
 * and cloud sync protocol.
 */

const SELF_HOSTED = {

    // ═══════════════════════════════════════════════════
    // OVERVIEW
    // ═══════════════════════════════════════════════════
    overview: {
        title: "SmartFlow Self-Hosted Runtime",
        tagline: "Run SmartFlow's AI voice platform on your own infrastructure. Full data sovereignty.",
        target_customers: [
            "Government agencies (FedRAMP, ITAR requirements)",
            "Healthcare systems (HIPAA with on-premise mandates)",
            "Financial institutions (SOC 2 + data residency requirements)",
            "Defense contractors (air-gapped networks)",
            "Enterprises with strict data sovereignty policies"
        ],
        deployment_models: [
            { model: "Hybrid", description: "Self-hosted runtime + cloud management plane. AI inference on-premise, orchestration via SmartFlow cloud.", data_sovereignty: "full", management: "cloud" },
            { model: "Fully Air-Gapped", description: "100% on-premise. No cloud connectivity. Local AI models + local management.", data_sovereignty: "full", management: "local" },
            { model: "Private Cloud", description: "Deployed in customer's own cloud VPC (AWS, GCP, Azure). SmartFlow manages, customer owns infra.", data_sovereignty: "full", management: "shared" }
        ],
        pricing: {
            model: "Annual license + per-minute usage fee (metered locally)",
            tiers: [
                { tier: "Self-Hosted Standard", annual_license: "$24,000", per_minute: "$0.06", concurrent_agents: 10, includes: "Standard support, quarterly updates" },
                { tier: "Self-Hosted Enterprise", annual_license: "$60,000", per_minute: "$0.04", concurrent_agents: 50, includes: "24/7 support, monthly updates, dedicated CSM" },
                { tier: "Self-Hosted Government", annual_license: "Custom", per_minute: "Custom", concurrent_agents: "Unlimited", includes: "FedRAMP support, STIG hardening, custom SLA" }
            ]
        }
    },

    // ═══════════════════════════════════════════════════
    // CONTAINER ARCHITECTURE
    // ═══════════════════════════════════════════════════
    container_architecture: {
        title: "Containerized Microservice Architecture",
        orchestration: "Kubernetes (K8s) with Helm charts. Supports K3s for smaller deployments.",
        registry: "SmartFlow container registry (registry.smartflow.ai) or customer's private registry",
        services: [
            {
                name: "smartflow-gateway",
                image: "registry.smartflow.ai/gateway",
                description: "API gateway + WebSocket proxy. Handles auth, rate limiting, routing.",
                ports: [443, 8443],
                resources: { cpu: "2 cores", memory: "2Gi", replicas: "2 (HA)" },
                dependencies: []
            },
            {
                name: "smartflow-voice-engine",
                image: "registry.smartflow.ai/voice-engine",
                description: "Core voice AI processing. Speech-to-text, LLM, text-to-speech pipeline.",
                ports: [8080],
                resources: { cpu: "4 cores", memory: "8Gi", gpu: "1x NVIDIA T4/A10 (recommended)", replicas: "auto-scaled by call volume" },
                dependencies: ["smartflow-model-server"],
                env_vars: ["MODEL_SERVER_URL", "MAX_CONCURRENT_CALLS", "STT_ENGINE", "TTS_ENGINE"]
            },
            {
                name: "smartflow-model-server",
                image: "registry.smartflow.ai/model-server",
                description: "AI model serving (vLLM). Hosts LLM, intent classifier, sentiment analyzer.",
                ports: [8000],
                resources: { cpu: "4 cores", memory: "16Gi", gpu: "1x NVIDIA A10G or better", replicas: "1-4 (GPU-bound)" },
                dependencies: [],
                models: [
                    { model: "smartflow-voice-7b", size: "14GB", purpose: "Main conversational AI" },
                    { model: "smartflow-intent-classifier", size: "500MB", purpose: "Intent detection" },
                    { model: "smartflow-sentiment", size: "200MB", purpose: "Sentiment analysis" },
                    { model: "whisper-large-v3", size: "3GB", purpose: "Speech-to-text" }
                ]
            },
            {
                name: "smartflow-telephony",
                image: "registry.smartflow.ai/telephony",
                description: "SIP/PSTN integration. Handles inbound/outbound calls, DTMF, recording.",
                ports: [5060, 5061, "10000-20000/UDP (RTP)"],
                resources: { cpu: "2 cores", memory: "4Gi", replicas: "2 (HA)" },
                dependencies: ["smartflow-voice-engine"],
                env_vars: ["SIP_PROVIDER", "SIP_CREDENTIALS", "RECORDING_STORAGE"]
            },
            {
                name: "smartflow-workflow-engine",
                image: "registry.smartflow.ai/workflow-engine",
                description: "Executes no-code workflows. Event-driven, checkpoint-based.",
                ports: [8081],
                resources: { cpu: "2 cores", memory: "4Gi", replicas: "2" },
                dependencies: ["smartflow-db", "smartflow-queue"]
            },
            {
                name: "smartflow-api",
                image: "registry.smartflow.ai/api",
                description: "REST API server. CRUD for agents, calls, appointments, analytics.",
                ports: [3000],
                resources: { cpu: "2 cores", memory: "4Gi", replicas: "2 (HA)" },
                dependencies: ["smartflow-db", "smartflow-cache"]
            },
            {
                name: "smartflow-dashboard",
                image: "registry.smartflow.ai/dashboard",
                description: "Web UI dashboard. React SPA served via Nginx.",
                ports: [80, 443],
                resources: { cpu: "1 core", memory: "1Gi", replicas: "2" },
                dependencies: ["smartflow-api"]
            },
            {
                name: "smartflow-db",
                image: "postgres:16",
                description: "Primary database. Multi-tenant schema isolation.",
                ports: [5432],
                resources: { cpu: "4 cores", memory: "8Gi", storage: "100Gi SSD" },
                dependencies: [],
                backup: "Automated daily backup. 30-day retention."
            },
            {
                name: "smartflow-cache",
                image: "redis:7-alpine",
                description: "Caching, session state, response cache, rate limit counters.",
                ports: [6379],
                resources: { cpu: "1 core", memory: "4Gi" },
                dependencies: []
            },
            {
                name: "smartflow-queue",
                image: "redis:7-alpine",
                description: "Job queue for workflow execution, webhook delivery, async tasks.",
                ports: [6380],
                resources: { cpu: "1 core", memory: "2Gi" },
                dependencies: []
            },
            {
                name: "smartflow-metering",
                image: "registry.smartflow.ai/metering",
                description: "Usage metering. Counts minutes, generates usage reports. Supports offline license validation.",
                ports: [8082],
                resources: { cpu: "1 core", memory: "1Gi" },
                dependencies: ["smartflow-db"]
            }
        ],
        minimum_requirements: {
            standard: {
                description: "Up to 10 concurrent AI calls",
                cpu: "16 cores",
                memory: "48 GB RAM",
                gpu: "1x NVIDIA T4 (16GB VRAM) or equivalent",
                storage: "200 GB SSD",
                network: "100 Mbps",
                os: "Ubuntu 22.04 LTS or RHEL 8+"
            },
            enterprise: {
                description: "Up to 100 concurrent AI calls",
                cpu: "64 cores",
                memory: "192 GB RAM",
                gpu: "4x NVIDIA A10G (24GB VRAM each)",
                storage: "1 TB NVMe SSD",
                network: "1 Gbps",
                os: "Ubuntu 22.04 LTS or RHEL 8+"
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // LICENSING SYSTEM
    // ═══════════════════════════════════════════════════
    licensing: {
        title: "License Management",
        schema: {
            license_key: "sf-sh-{{uuid}}",
            type: "standard | enterprise | government | trial",
            tenant_id: "string",
            issued_at: "ISO 8601",
            expires_at: "ISO 8601",
            max_concurrent_agents: "number",
            max_monthly_minutes: "number (0 = unlimited)",
            features: {
                workflow_builder: "boolean",
                plugin_marketplace: "boolean",
                custom_fine_tuning: "boolean",
                white_label: "boolean",
                api_access: "boolean",
                benchmarks: "boolean",
                multi_language: "boolean"
            },
            restrictions: {
                allowed_ips: "Array of allowed server IPs (optional)",
                allowed_domains: "Array of allowed domains (optional)",
                air_gapped: "boolean — if true, no cloud sync required"
            }
        },
        validation: {
            online: "License validated against SmartFlow license server on startup + daily heartbeat. Grace period: 7 days offline.",
            offline: "Cryptographic license file (RSA-2048 signed). Validated locally. No network required. Manual renewal cycle.",
            tamper_detection: "License embedded in signed JWT. Public key hardcoded in runtime. Tampering = service shutdown."
        },
        metering: {
            description: "Minutes are metered locally by smartflow-metering service",
            reporting: {
                online: "Usage reports synced to SmartFlow cloud hourly",
                offline: "Usage logged locally. Monthly export (encrypted) for billing reconciliation."
            },
            enforcement: {
                soft_limit: "At 90% of monthly minutes: warning notification",
                hard_limit: "At 100%: new calls rejected. Existing calls complete. Override available for Enterprise (5% buffer)."
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // AIR-GAPPED DEPLOYMENT
    // ═══════════════════════════════════════════════════
    air_gapped: {
        title: "Air-Gapped Deployment Guide",
        description: "For environments with no internet connectivity (government, defense, classified networks).",
        deployment_steps: [
            {
                step: 1,
                name: "Media Preparation (on connected system)",
                actions: [
                    "Download SmartFlow deployment bundle from portal (signed .tar.gz)",
                    "Download all container images: smartflow-bundle export --all --output ./images/",
                    "Download AI model weights: smartflow-bundle export-models --output ./models/",
                    "Download Helm charts: smartflow-bundle export-charts --output ./charts/",
                    "Download license file from SmartFlow portal",
                    "Verify checksums: smartflow-bundle verify ./",
                    "Transfer to removable media (encrypted USB/HDD)"
                ]
            },
            {
                step: 2,
                name: "Infrastructure Setup (on air-gapped system)",
                actions: [
                    "Set up Kubernetes cluster (K3s for simplicity or full K8s)",
                    "Load container images: for img in images/*.tar; do k3s ctr images import $img; done",
                    "Configure local container registry (Harbor recommended)",
                    "Push images to local registry"
                ]
            },
            {
                step: 3,
                name: "Model Deployment",
                actions: [
                    "Copy model weights to persistent volume",
                    "Configure model-server to use local model paths",
                    "Verify model loading: smartflow-cli model verify"
                ]
            },
            {
                step: 4,
                name: "Application Deployment",
                actions: [
                    "Install license: smartflow-cli license install --file license.jwt",
                    "Deploy via Helm: helm install smartflow ./charts/smartflow -f values-airgap.yaml",
                    "Wait for all pods: kubectl wait --for=condition=ready pod --all --timeout=600s",
                    "Run health checks: smartflow-cli health --full"
                ]
            },
            {
                step: 5,
                name: "Telephony Integration",
                actions: [
                    "Configure SIP trunk to customer's PBX/PSTN gateway",
                    "Set up TLS certificates for SIP",
                    "Route inbound calls to smartflow-telephony service",
                    "Test end-to-end call flow"
                ]
            }
        ],
        updates: {
            process: "Manual update bundles delivered quarterly (or on-demand for security patches)",
            steps: [
                "Download update bundle on connected system",
                "Transfer to air-gapped environment via removable media",
                "Run: smartflow-cli update apply --bundle update-2026-Q1.tar.gz",
                "Rolling update — zero downtime for active calls",
                "Rollback: smartflow-cli update rollback --to-version 5.2.1"
            ]
        },
        monitoring: {
            description: "All monitoring is local. No external telemetry.",
            tools: [
                "Prometheus (metrics) — bundled in deployment",
                "Grafana (dashboards) — pre-configured SmartFlow dashboards",
                "Loki (logs) — centralized log aggregation",
                "AlertManager — configurable alerts (email, webhook to internal systems)"
            ]
        }
    },

    // ═══════════════════════════════════════════════════
    // CLOUD SYNC PROTOCOL (HYBRID MODE)
    // ═══════════════════════════════════════════════════
    sync_protocol: {
        title: "Cloud Sync Protocol (Hybrid Deployment)",
        description: "For hybrid deployments: AI runtime on-premise, management plane in SmartFlow cloud.",
        data_flows: [
            {
                direction: "ON-PREM → CLOUD",
                data: [
                    { type: "usage_metrics", description: "Call counts, duration, minute consumption", frequency: "hourly", sensitivity: "low" },
                    { type: "health_telemetry", description: "Service health, CPU/GPU/memory, error rates", frequency: "every 5 min", sensitivity: "low" },
                    { type: "aggregated_analytics", description: "Anonymized call stats (no PII, no transcripts)", frequency: "daily", sensitivity: "medium" },
                    { type: "license_heartbeat", description: "License validation ping", frequency: "daily", sensitivity: "low" }
                ],
                note: "NO call recordings, transcripts, PII, or customer data EVER leaves the on-premise environment."
            },
            {
                direction: "CLOUD → ON-PREM",
                data: [
                    { type: "config_updates", description: "Agent config, workflow definitions, template updates", frequency: "on-change", sensitivity: "low" },
                    { type: "model_updates", description: "Updated AI model weights (differential, compressed)", frequency: "monthly", sensitivity: "high" },
                    { type: "platform_updates", description: "Container image updates, Helm chart changes", frequency: "monthly", sensitivity: "medium" },
                    { type: "benchmark_data", description: "Industry benchmarks (anonymized, aggregated)", frequency: "weekly", sensitivity: "low" }
                ]
            }
        ],
        connection: {
            protocol: "mTLS (mutual TLS) over HTTPS",
            endpoint: "sync.smartflow.ai:443",
            auth: "Client certificate (issued per deployment) + API key",
            encryption: "TLS 1.3 in transit. AES-256-GCM for model weights at rest.",
            firewall: "Customer only needs to allow outbound HTTPS to sync.smartflow.ai:443"
        },
        offline_resilience: {
            grace_period: "7 days — full functionality without cloud connectivity",
            degraded_mode: "After 7 days: license warning, analytics paused. Calls still work.",
            hard_cutoff: "After 30 days: administrative functions disabled. Existing calls still complete."
        }
    },

    // ═══════════════════════════════════════════════════
    // HELM VALUES (SAMPLE)
    // ═══════════════════════════════════════════════════
    helm_values_sample: {
        filename: "values-production.yaml",
        content: `
# SmartFlow Self-Hosted — Helm Values
global:
  registry: registry.smartflow.ai  # or your.private.registry
  licenseKey: sf-sh-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxxxx
  domain: voice.yourcompany.com
  tls:
    enabled: true
    certManager: true  # or provide manual certs

voiceEngine:
  replicas: 2
  gpu:
    enabled: true
    type: nvidia-t4  # nvidia-a10g, nvidia-a100
  resources:
    requests:
      cpu: 4
      memory: 8Gi
    limits:
      cpu: 8
      memory: 16Gi

modelServer:
  replicas: 1
  gpu:
    enabled: true
    count: 1
  models:
    mainModel: smartflow-voice-7b
    sttModel: whisper-large-v3
  storage:
    modelPVC: 50Gi

telephony:
  provider: custom-sip  # twilio, custom-sip
  sipServer: sip.yourcompany.com
  sipPort: 5061
  tls: true

database:
  internal: true  # false to use external PostgreSQL
  storage: 100Gi
  backup:
    enabled: true
    schedule: "0 2 * * *"
    retention: 30

monitoring:
  prometheus: true
  grafana: true
  loki: true
  alerting:
    email: ops@yourcompany.com

metering:
  mode: online  # online | offline
  reportingEndpoint: https://sync.smartflow.ai/v1/usage
`
    }
};

module.exports = SELF_HOSTED;
