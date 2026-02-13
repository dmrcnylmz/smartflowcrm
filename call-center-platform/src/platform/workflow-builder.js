/**
 * No-Code Workflow Builder
 * 
 * Visual node graph schema, trigger/action/condition nodes,
 * built-in node library, execution engine, versioning.
 */

const WORKFLOW_BUILDER = {

    // ═══════════════════════════════════════════════════
    // WORKFLOW GRAPH SCHEMA
    // ═══════════════════════════════════════════════════
    graph_schema: {
        spec_version: "1.0",
        description: "A workflow is a directed acyclic graph (DAG) of nodes connected by edges. Each node is a trigger, condition, action, or transform.",
        schema: {
            id: { type: "string", format: "wf_{{uuid}}", description: "Unique workflow ID" },
            name: { type: "string", max_length: 100, description: "Human-readable name" },
            description: { type: "string", max_length: 500 },
            tenant_id: { type: "string", description: "Owner tenant" },
            status: { type: "enum", values: ["draft", "active", "paused", "archived"] },
            version: { type: "integer", description: "Auto-incremented on each save. Rollback supported." },
            trigger: {
                type: "object",
                description: "The single entry point. Every workflow has exactly one trigger.",
                properties: {
                    type: "event | schedule | manual | webhook | api",
                    config: "Trigger-specific configuration (see trigger_nodes below)"
                }
            },
            nodes: {
                type: "array",
                description: "All non-trigger nodes in the graph",
                item_schema: {
                    id: "node_{{short_uuid}}",
                    type: "condition | action | transform | delay | loop | sub_workflow",
                    name: "Human-readable label",
                    config: "Node-specific configuration object",
                    position: { x: "number", y: "number" },
                    notes: "Optional designer notes"
                }
            },
            edges: {
                type: "array",
                description: "Connections between nodes. Conditions have labeled edges (true/false branches).",
                item_schema: {
                    from: "source node ID or 'trigger'",
                    to: "target node ID",
                    label: "Optional label (e.g., 'yes', 'no', 'default')",
                    condition: "Optional edge condition expression"
                }
            },
            error_handler: {
                type: "object",
                description: "Global error handling for the workflow",
                properties: {
                    on_error: "stop | continue | retry | goto_node",
                    retry_count: "number (max 3)",
                    retry_delay_seconds: "number",
                    fallback_node: "node ID to execute on error",
                    notification: "email | slack | webhook"
                }
            },
            metadata: {
                created_at: "ISO 8601",
                updated_at: "ISO 8601",
                created_by: "user ID",
                execution_count: "number",
                last_run_at: "ISO 8601",
                avg_duration_ms: "number"
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // NODE TYPES — COMPLETE LIBRARY
    // ═══════════════════════════════════════════════════
    node_library: {
        triggers: [
            {
                type: "trigger.call_event",
                name: "Call Event",
                description: "Fires when a call event occurs",
                config: {
                    event: { enum: ["call.started", "call.completed", "call.transferred", "call.missed"] },
                    filters: {
                        agent_id: "Optional — specific agent",
                        intent: "Optional — specific intent (e.g., 'complaint')",
                        sentiment: "Optional — below threshold (e.g., < 0.3)",
                        duration_min: "Optional — minimum seconds",
                        caller_number: "Optional — regex pattern"
                    }
                },
                outputs: ["call_id", "agent_id", "caller_number", "intent", "sentiment", "transcript", "duration"]
            },
            {
                type: "trigger.appointment_event",
                name: "Appointment Event",
                config: { event: { enum: ["appointment.created", "appointment.updated", "appointment.canceled", "appointment.reminder"] } },
                outputs: ["appointment_id", "date", "time", "customer_name", "customer_phone", "type"]
            },
            {
                type: "trigger.schedule",
                name: "Schedule (Cron)",
                config: { cron: "Cron expression (e.g., '0 9 * * 1' = every Monday 9am)", timezone: "IANA timezone" },
                outputs: ["execution_time", "run_count"]
            },
            {
                type: "trigger.webhook",
                name: "Incoming Webhook",
                config: { method: "POST|GET", path: "/hooks/wf_{{id}}", secret: "HMAC validation secret" },
                outputs: ["headers", "body", "query_params"]
            },
            {
                type: "trigger.manual",
                name: "Manual Trigger",
                config: { input_schema: "JSON Schema for manual input form" },
                outputs: ["{{user_defined}}"]
            },
            {
                type: "trigger.threshold",
                name: "Metric Threshold",
                config: { metric: "resolution_rate | csat | call_volume | wait_time", operator: "< | > | <= | >=", value: "number", window_minutes: "number" },
                outputs: ["metric_name", "current_value", "threshold", "timestamp"]
            }
        ],

        conditions: [
            {
                type: "condition.if",
                name: "If / Else",
                description: "Branch based on expression. Supports nested conditions.",
                config: {
                    expression: "JavaScript-like expression using node outputs",
                    examples: [
                        "{{call.sentiment}} < 0.3",
                        "{{call.intent}} === 'complaint'",
                        "{{call.duration}} > 300 && {{call.resolution}} === 'transferred'",
                        "{{appointment.date}} === today()"
                    ]
                },
                outputs: { true_branch: "Executes if condition is true", false_branch: "Executes if condition is false" }
            },
            {
                type: "condition.switch",
                name: "Switch / Case",
                description: "Multi-branch based on value matching",
                config: { expression: "Value to match", cases: "Array of { value, label }", default_label: "Fallback branch" },
                outputs: "One edge per case + default"
            },
            {
                type: "condition.time",
                name: "Time-Based",
                description: "Branch based on current time",
                config: { business_hours: "boolean — true if within business hours", timezone: "IANA timezone", custom_hours: "{ start, end }" },
                outputs: { within_hours: "true branch", outside_hours: "false branch" }
            }
        ],

        actions: [
            {
                type: "action.send_sms",
                name: "Send SMS",
                config: { to: "Phone number or {{variable}}", body: "Message text with {{variables}}", from: "Agent phone number (optional)" },
                outputs: ["message_id", "status"]
            },
            {
                type: "action.send_email",
                name: "Send Email",
                config: { to: "Email or {{variable}}", subject: "Subject line", body: "HTML or plain text", template_id: "Optional template" },
                outputs: ["email_id", "status"]
            },
            {
                type: "action.create_appointment",
                name: "Create Appointment",
                config: { calendar_id: "string", title: "string", date: "date", time: "time", duration_minutes: "number", attendee: "{ name, email, phone }" },
                outputs: ["appointment_id", "calendar_event_id"]
            },
            {
                type: "action.update_crm",
                name: "Update CRM Record",
                config: { crm: "salesforce | hubspot | zoho | custom", object: "contact | lead | deal | custom", operation: "create | update | upsert", fields: "{ field: value } mapping" },
                outputs: ["record_id", "status"]
            },
            {
                type: "action.transfer_call",
                name: "Transfer Call",
                config: { target: "Phone number or agent ID", warm: "boolean — warm or cold transfer", context: "Message to play to receiving agent" },
                outputs: ["transfer_status"]
            },
            {
                type: "action.create_ticket",
                name: "Create Support Ticket",
                config: { system: "zendesk | freshdesk | servicenow | custom", subject: "string", description: "string", priority: "low | medium | high | urgent", tags: "array" },
                outputs: ["ticket_id", "ticket_url"]
            },
            {
                type: "action.http_request",
                name: "HTTP Request",
                config: { method: "GET|POST|PUT|PATCH|DELETE", url: "string", headers: "object", body: "string or object", auth: "none | bearer | basic | api_key" },
                outputs: ["status_code", "response_body", "headers"]
            },
            {
                type: "action.notify_slack",
                name: "Slack Notification",
                config: { channel: "Channel ID or name", message: "Message with {{variables}}", blocks: "Optional Slack Block Kit JSON" },
                outputs: ["message_ts"]
            },
            {
                type: "action.notify_teams",
                name: "Microsoft Teams",
                config: { webhook_url: "Incoming webhook URL", card: "Adaptive Card JSON" },
                outputs: ["status"]
            },
            {
                type: "action.update_agent",
                name: "Update Agent Config",
                config: { agent_id: "string", fields: "{ greeting, persona, capabilities, transfer_triggers }" },
                outputs: ["updated_fields"]
            },
            {
                type: "action.log_analytics",
                name: "Log Custom Event",
                config: { event_name: "string", properties: "object" },
                outputs: ["event_id"]
            }
        ],

        transforms: [
            {
                type: "transform.map",
                name: "Map / Transform Data",
                config: { input: "{{variable}}", expression: "JavaScript expression or JSONPath", output_name: "variable name" },
                outputs: ["{{output_name}}"]
            },
            {
                type: "transform.aggregate",
                name: "Aggregate Data",
                config: { source: "calls | appointments | analytics", query: "{ date_range, filters, group_by, metrics }" },
                outputs: ["results"]
            },
            {
                type: "transform.ai_prompt",
                name: "AI Text Generation",
                description: "Send text to AI and get a structured response. Usage billed as call minutes.",
                config: { prompt: "Prompt template with {{variables}}", output_format: "text | json", max_length: "number" },
                outputs: ["response", "billed_minutes"]
            }
        ],

        flow_control: [
            {
                type: "flow.delay",
                name: "Delay / Wait",
                config: { duration: "number", unit: "seconds | minutes | hours | days" },
                outputs: ["resumed_at"]
            },
            {
                type: "flow.loop",
                name: "For Each",
                config: { collection: "{{variable}} — array to iterate", item_name: "Variable name for current item", max_iterations: "number (safety limit)" },
                outputs: ["{{item_name}}", "index", "is_last"]
            },
            {
                type: "flow.parallel",
                name: "Parallel Branches",
                description: "Execute multiple branches simultaneously",
                config: { branches: "Array of node IDs to run in parallel", wait_for_all: "boolean" },
                outputs: ["all_results"]
            },
            {
                type: "flow.sub_workflow",
                name: "Run Sub-Workflow",
                config: { workflow_id: "wf_{{uuid}}", input: "Data to pass to sub-workflow" },
                outputs: ["sub_workflow_output"]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // EXECUTION ENGINE
    // ═══════════════════════════════════════════════════
    execution_engine: {
        architecture: {
            model: "Event-driven, step-by-step execution with persistent state",
            queue: "Each workflow execution is a job in a persistent queue (Redis + PostgreSQL)",
            concurrency: "Per-tenant concurrency limits: Starter=5, Pro=20, Enterprise=100",
            durability: "Each node completion is checkpointed. Crash-safe — resumes from last checkpoint.",
            timeout: "Per-workflow: 1 hour max. Per-node: 30 seconds (configurable up to 5 min for Enterprise)."
        },
        execution_record: {
            id: "run_{{uuid}}",
            workflow_id: "wf_{{uuid}}",
            tenant_id: "t_{{uuid}}",
            status: "running | completed | failed | timed_out | canceled",
            trigger_event: "The event that started the execution",
            started_at: "ISO 8601",
            completed_at: "ISO 8601",
            duration_ms: "number",
            nodes_executed: [
                { node_id: "string", status: "completed | failed | skipped", started_at: "ISO", duration_ms: "number", input: "{}", output: "{}", error: "string | null" }
            ],
            error: "Top-level error if workflow failed",
            cost_minutes: "Billed minutes for AI operations within workflow"
        },
        retry_policy: {
            node_level: "Configurable per node: 0-3 retries with exponential backoff",
            workflow_level: "Can be re-run manually or automatically on failure",
            dead_letter: "Failed executions after max retries go to dead-letter queue for manual review"
        }
    },

    // ═══════════════════════════════════════════════════
    // VERSIONING & ROLLBACK
    // ═══════════════════════════════════════════════════
    versioning: {
        strategy: "Every save creates a new version. Active version is the one receiving traffic.",
        schema: {
            workflow_id: "wf_{{uuid}}",
            version: "integer (auto-incremented)",
            status: "draft | active | archived",
            graph: "Complete workflow graph at this version",
            created_at: "ISO 8601",
            created_by: "user ID",
            change_summary: "Auto-generated diff description"
        },
        rollback: {
            method: "PATCH /workflows/:workflowId with { active_version: N }",
            behavior: "Immediately routes new executions to version N. In-flight executions complete on their original version.",
            retention: "Last 50 versions retained. Older versions archived (retrievable on request)."
        },
        comparison: {
            method: "GET /workflows/:workflowId/diff?from=3&to=5",
            output: "JSON diff showing added/removed/modified nodes and edges"
        }
    },

    // ═══════════════════════════════════════════════════
    // PREBUILT WORKFLOW TEMPLATES
    // ═══════════════════════════════════════════════════
    templates: [
        {
            name: "Complaint Escalation",
            trigger: "trigger.call_event (intent=complaint, sentiment<0.3)",
            flow: "→ Create ticket (high priority) → Notify Slack → Assign to senior agent → Schedule callback",
            industry: "all"
        },
        {
            name: "After-Hours Routing",
            trigger: "trigger.call_event (call.started)",
            flow: "→ Check business hours → If outside: AI handles → SMS acknowledgment → Create morning follow-up task",
            industry: "all"
        },
        {
            name: "Appointment Reminders",
            trigger: "trigger.schedule (daily at 9am)",
            flow: "→ Query tomorrow's appointments → For each: Send SMS reminder → Log analytics event",
            industry: "healthcare, salon, auto"
        },
        {
            name: "VIP Customer Detection",
            trigger: "trigger.call_event (call.started)",
            flow: "→ Lookup caller in CRM → If VIP: Transfer to dedicated agent → If not: AI handles → Update CRM",
            industry: "all"
        },
        {
            name: "CSAT Survey",
            trigger: "trigger.call_event (call.completed, resolution=resolved)",
            flow: "→ Delay 5 minutes → Send SMS survey → Collect response → Log to analytics → If score < 3: Create follow-up",
            industry: "all"
        },
        {
            name: "Lead Qualification",
            trigger: "trigger.call_event (call.completed, intent=inquiry)",
            flow: "→ Extract lead info from transcript → Score lead → Create CRM contact → If qualified: Route to sales → Send follow-up email",
            industry: "real_estate, insurance, financial"
        },
        {
            name: "Usage Alert",
            trigger: "trigger.threshold (call_volume > 80% of plan)",
            flow: "→ Send email to admin → Notify Slack → Log analytics event",
            industry: "all"
        },
        {
            name: "Weekly Performance Report",
            trigger: "trigger.schedule (every Friday at 5pm)",
            flow: "→ Aggregate call metrics → Generate report → Send email to team → Post to Slack",
            industry: "all"
        }
    ]
};

module.exports = WORKFLOW_BUILDER;
