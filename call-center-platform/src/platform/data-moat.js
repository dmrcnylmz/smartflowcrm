/**
 * Data Moat & Learning System
 * 
 * Anonymized data pipeline, cross-tenant insights,
 * benchmark engine, and model fine-tuning loop.
 */

const DATA_MOAT = {

    // ═══════════════════════════════════════════════════
    // OVERVIEW
    // ═══════════════════════════════════════════════════
    overview: {
        title: "SmartFlow Data Moat & Collective Intelligence",
        thesis: "Every call processed by SmartFlow makes every customer's AI agent smarter. This is the data network effect — the moat that grows with scale.",
        pillars: [
            "1. Anonymized data pipeline — strip PII, aggregate patterns",
            "2. Cross-tenant insights — industry-level intelligence",
            "3. Benchmark engine — performance comparison",
            "4. Fine-tuning loop — models improve from collective data"
        ],
        privacy_principles: [
            "All data is anonymized BEFORE aggregation. PII never leaves tenant boundary.",
            "Tenants can opt-out of collective intelligence at any time (Enterprise plan).",
            "Aggregation requires minimum K-anonymity (k=50) — no insights from <50 tenants.",
            "Compliance: GDPR Art. 89 (research/statistical exemption), CCPA de-identification."
        ]
    },

    // ═══════════════════════════════════════════════════
    // ANONYMIZED DATA PIPELINE
    // ═══════════════════════════════════════════════════
    data_pipeline: {
        title: "Anonymization & Aggregation Pipeline",
        architecture: {
            layers: [
                {
                    name: "Collection Layer",
                    description: "Raw call data stored in tenant-isolated databases",
                    data_points: [
                        "Call metadata (duration, time, direction, resolution)",
                        "Intent classifications with confidence scores",
                        "Sentiment scores (per-utterance and overall)",
                        "Response latency (time-to-first-word, total)",
                        "Escalation patterns (when, why, to whom)",
                        "Customer satisfaction scores",
                        "Appointment booking success/failure patterns",
                        "FAQ match rates and miss rates"
                    ],
                    storage: "PostgreSQL per-tenant schema (tenant isolation)"
                },
                {
                    name: "Anonymization Layer",
                    description: "Strip PII, tokenize identifiers, generalize location",
                    operations: [
                        { op: "remove", fields: ["caller_name", "caller_email", "caller_phone", "transcript_text", "recording_audio"] },
                        { op: "tokenize", fields: ["caller_id → anonymous_caller_hash", "agent_id → anonymous_agent_hash"] },
                        { op: "generalize", fields: ["location → region (e.g., 'Northeast US')", "company → industry_vertical + size_bucket"] },
                        { op: "suppress", rule: "Drop records where any quasi-identifier combination has <50 matching records (k-anonymity)" },
                        { op: "noise", rule: "Add differential privacy noise (ε=1.0) to numeric aggregates" }
                    ],
                    validation: "Automated PII scanner runs on anonymized output. Any PII detection → pipeline halts + alert."
                },
                {
                    name: "Aggregation Layer",
                    description: "Compute cross-tenant metrics and patterns",
                    aggregation_types: [
                        { type: "time_series", description: "Hourly/daily/weekly/monthly metrics by vertical", granularity: "minimum 1 hour" },
                        { type: "distribution", description: "Percentile distributions (p10, p25, p50, p75, p90) for key metrics" },
                        { type: "pattern", description: "Common call flow patterns, intent sequences, escalation paths" },
                        { type: "anomaly", description: "Deviation detection from baseline (z-score > 2)" }
                    ],
                    storage: "BigQuery (partitioned by vertical + date). Retention: 3 years."
                },
                {
                    name: "Insight Layer",
                    description: "Generate actionable insights from aggregated data",
                    outputs: [
                        "Industry benchmarks (see benchmark engine below)",
                        "Best practice recommendations",
                        "Trend alerts (e.g., 'complaint calls up 30% this month in healthcare')",
                        "Optimal configuration suggestions (greeting, transfer triggers, hours)"
                    ]
                }
            ]
        },
        scheduling: {
            frequency: "Aggregation runs nightly at 02:00 UTC. Benchmarks updated weekly (Sunday 04:00 UTC).",
            lag: "Insights reflect data up to 24 hours old.",
            backfill: "Historical data can be re-aggregated after pipeline changes (max 90-day lookback)."
        }
    },

    // ═══════════════════════════════════════════════════
    // CROSS-TENANT INSIGHT ENGINE
    // ═══════════════════════════════════════════════════
    insight_engine: {
        title: "Cross-Tenant Collective Intelligence",
        insights: [
            {
                name: "Optimal Greeting Analysis",
                description: "Correlate greeting styles with CSAT scores across verticals",
                output: "Top-performing greeting patterns per vertical, ranked by CSAT impact",
                example: "Healthcare: Greetings that include 'How can I help you today?' show 12% higher CSAT than 'How may I direct your call?'",
                update_frequency: "Monthly"
            },
            {
                name: "Intent Gap Detection",
                description: "Identify common caller intents that current agents frequently miss or escalate",
                output: "Ranked list of unhandled intents per vertical + recommended training data",
                example: "Auto service: 'Tire price comparison' intent detected in 8% of calls but 0% resolution — adding intent could capture $12K/yr per shop",
                update_frequency: "Weekly"
            },
            {
                name: "Peak Hour Optimization",
                description: "Analyze call volume patterns to recommend staffing and AI config changes",
                output: "Hourly call volume heatmaps per vertical + day-of-week patterns",
                example: "Dental offices: Monday 8-10am = 3.2x average volume. Recommend: dedicated appointment-only AI during peak.",
                update_frequency: "Weekly"
            },
            {
                name: "Escalation Pattern Analysis",
                description: "Identify which call patterns lead to escalation and train agents to avoid them",
                output: "Escalation triggers ranked by frequency and preventability",
                example: "Insurance: Calls mentioning 'claim denied' escalate 78% of the time. Adding empathy acknowledgment reduces this to 45%.",
                update_frequency: "Bi-weekly"
            },
            {
                name: "Sentiment Recovery Patterns",
                description: "Analyze how top-performing agents recover from negative sentiment",
                output: "Recovery technique effectiveness scores by situation type",
                update_frequency: "Monthly"
            },
            {
                name: "Seasonal Trend Forecasting",
                description: "Predict call volume and intent distribution shifts based on seasonal patterns",
                output: "Next 30-day forecast per vertical (volume, top intents, resolution rates)",
                update_frequency: "Weekly"
            }
        ],
        api: {
            endpoints: [
                { method: "GET", path: "/insights/industry/:vertical", description: "Get all insights for a vertical" },
                { method: "GET", path: "/insights/recommendations", description: "Personalized recommendations for tenant's agent(s)" },
                { method: "GET", path: "/insights/trends", description: "Current trends and anomalies" }
            ],
            access: "Pro + Enterprise plans only. Starter sees limited benchmarks."
        }
    },

    // ═══════════════════════════════════════════════════
    // BENCHMARK ENGINE
    // ═══════════════════════════════════════════════════
    benchmark_engine: {
        title: "Industry Performance Benchmarks",
        description: "Compare your AI agent performance against anonymized industry averages. Powered by collective data.",
        metrics: [
            {
                metric: "ai_resolution_rate",
                display: "AI Resolution Rate",
                description: "% of calls fully resolved by AI without human escalation",
                benchmarks_by_vertical: {
                    healthcare: { p25: "58%", p50: "68%", p75: "78%", p90: "85%" },
                    real_estate: { p25: "52%", p50: "64%", p75: "74%", p90: "82%" },
                    automotive: { p25: "60%", p50: "72%", p75: "80%", p90: "88%" },
                    legal: { p25: "45%", p50: "55%", p75: "65%", p90: "72%" },
                    insurance: { p25: "50%", p50: "62%", p75: "72%", p90: "80%" },
                    hospitality: { p25: "65%", p50: "75%", p75: "83%", p90: "90%" },
                    home_services: { p25: "55%", p50: "67%", p75: "76%", p90: "84%" },
                    professional_services: { p25: "48%", p50: "60%", p75: "70%", p90: "78%" }
                }
            },
            {
                metric: "average_csat",
                display: "Average Customer Satisfaction",
                description: "Customer satisfaction score (1-5 scale)",
                benchmarks_by_vertical: {
                    healthcare: { p25: 3.8, p50: 4.2, p75: 4.5, p90: 4.8 },
                    real_estate: { p25: 3.6, p50: 4.0, p75: 4.4, p90: 4.7 },
                    automotive: { p25: 3.9, p50: 4.3, p75: 4.6, p90: 4.8 },
                    all: { p25: 3.7, p50: 4.1, p75: 4.5, p90: 4.8 }
                }
            },
            {
                metric: "avg_handle_time",
                display: "Average Handle Time",
                description: "Average call duration in seconds",
                benchmarks_by_vertical: {
                    healthcare: { p25: 210, p50: 165, p75: 120, p90: 90 },
                    real_estate: { p25: 240, p50: 180, p75: 135, p90: 100 },
                    automotive: { p25: 195, p50: 150, p75: 110, p90: 85 },
                    all: { p25: 220, p50: 170, p75: 125, p90: 95 }
                },
                note: "Lower is better — p90 represents fastest resolution"
            },
            {
                metric: "first_call_resolution",
                display: "First Call Resolution",
                description: "% of issues resolved on the first call (no callbacks needed)",
                all: { p25: "72%", p50: "80%", p75: "87%", p90: "93%" }
            },
            {
                metric: "answer_rate",
                display: "Answer Rate",
                description: "% of calls answered (vs. abandoned, missed, voicemail)",
                all: { p25: "88%", p50: "95%", p75: "98%", p90: "99.5%" }
            },
            {
                metric: "cost_per_minute",
                display: "Effective Cost per Minute",
                description: "Total cost divided by total call minutes (AI only)",
                all: { p25: "$0.08", p50: "$0.05", p75: "$0.04", p90: "$0.03" }
            }
        ],
        api: {
            endpoint: "GET /analytics/benchmarks?vertical={{vertical}}&metric={{metric}}",
            response: {
                metric: "ai_resolution_rate",
                vertical: "healthcare",
                your_value: "72%",
                percentile: 62,
                industry: { p25: "58%", p50: "68%", p75: "78%", p90: "85%" },
                trend: "+3% vs last month",
                recommendation: "Adding 'prescription refill' intent handling could improve resolution rate by ~5%"
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // MODEL FINE-TUNING LOOP
    // ═══════════════════════════════════════════════════
    fine_tuning: {
        title: "Collective Model Improvement Loop",
        description: "Use anonymized call outcomes to continuously improve AI models. Tenant-specific fine-tuning also available for Enterprise.",
        layers: [
            {
                name: "Base Model (Shared)",
                source: "OpenAI / Google foundation models",
                improvement: "Prompt engineering based on aggregate performance data",
                frequency: "Monthly prompt optimization cycle",
                scope: "All tenants benefit automatically"
            },
            {
                name: "Vertical Model (Industry-Specific)",
                source: "Fine-tuned from base model using anonymized vertical data",
                data_requirements: "Minimum 100K anonymized call records per vertical",
                improvement: [
                    "Intent classification accuracy (from labeled escalation/resolution outcomes)",
                    "Response quality (from CSAT-correlated response patterns)",
                    "Industry terminology and jargon handling",
                    "Regulation-aware responses (HIPAA, fair housing, etc.)"
                ],
                frequency: "Quarterly re-training",
                scope: "All tenants in the vertical benefit"
            },
            {
                name: "Tenant Model (Private Fine-Tune)",
                tier: "Enterprise only",
                source: "Fine-tuned from vertical model using TENANT'S OWN DATA",
                data_stays: "Training data never leaves tenant boundary. Model weights stored in tenant's isolated namespace.",
                improvement: [
                    "Company-specific terminology and products",
                    "Branded response style matching",
                    "Custom workflow and escalation patterns",
                    "Customer segments and VIP handling"
                ],
                frequency: "On-demand (triggered by tenant) or monthly",
                minimum_data: "5,000 call records"
            }
        ],
        feedback_signals: [
            { signal: "call_resolution", weight: 0.30, description: "Did the AI resolve the call? Yes=positive, transferred=neutral, failed=negative" },
            { signal: "csat_score", weight: 0.25, description: "Customer satisfaction rating (1-5)" },
            { signal: "callback_rate", weight: 0.15, description: "Did the caller call back about the same issue? Low=better" },
            { signal: "handle_time", weight: 0.10, description: "Shorter handle time (when resolved) = better" },
            { signal: "intent_accuracy", weight: 0.10, description: "Was the detected intent correct? (audited sample)" },
            { signal: "escalation_outcome", weight: 0.10, description: "Was the escalation necessary? (post-escalation audit)" }
        ],
        training_pipeline: {
            steps: [
                "1. Collect feedback signals from resolved calls (continuous)",
                "2. Anonymize and aggregate by vertical (nightly)",
                "3. Generate training pairs: { input: anonymized_call_flow, output: optimal_response, reward: composite_score } (weekly)",
                "4. Validate training set quality (automated + human sample review)",
                "5. Fine-tune model using RLHF (Reinforcement Learning from Human Feedback)",
                "6. A/B test new model vs current (2-week test, 10% traffic)",
                "7. If new model wins on composite score: promote to production",
                "8. Archive old model weights (90-day rollback window)"
            ],
            infrastructure: {
                training: "GCP Vertex AI or dedicated GPU cluster (A100)",
                model_registry: "MLflow for versioning and lineage tracking",
                serving: "vLLM or TensorRT-LLM for optimized inference",
                a_b_testing: "Feature flags per tenant, metric collection per model variant"
            }
        },
        data_flywheel: {
            title: "The Data Flywheel Effect",
            stages: [
                "1. More customers → more call data",
                "2. More data → better anonymized training corpus",
                "3. Better corpus → more accurate AI models",
                "4. Better models → higher resolution rates & CSAT",
                "5. Higher performance → more customers (word of mouth + benchmarks)",
                "6. Network effect compounds over time — competitors cannot replicate without the data"
            ],
            competitive_advantage: "At 10K+ tenants, the collective data creates an insurmountable advantage. New entrants would need years to accumulate comparable training data."
        }
    }
};

module.exports = DATA_MOAT;
