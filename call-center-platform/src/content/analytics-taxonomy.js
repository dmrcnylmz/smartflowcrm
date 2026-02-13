/**
 * Analytics Event Taxonomy — AARRR Pirate Metrics
 * 
 * Complete event taxonomy organized by funnel stage:
 * Acquisition → Activation → Revenue → Retention → Referral
 * 
 * Each event includes: name, properties, trigger, stage, priority.
 * All customer metrics in minutes. No tokens.
 */

const ANALYTICS_EVENTS = {

    // ═══════════════════════════════════════════════════
    // ACQUISITION — How do users find us?
    // ═══════════════════════════════════════════════════
    acquisition: {
        stage_description: "Visitor → Signup. Tracks marketing effectiveness.",
        events: [
            {
                name: "page_viewed",
                trigger: "Any marketing page loads",
                properties: { page: "string", referrer: "string", utm_source: "string", utm_medium: "string", utm_campaign: "string", device: "string" },
                priority: "high",
                destination: ["mixpanel", "ga4"]
            },
            {
                name: "pricing_page_viewed",
                trigger: "Pricing page loads",
                properties: { referrer: "string", time_on_page_sec: "number" },
                priority: "high",
                destination: ["mixpanel", "ga4"]
            },
            {
                name: "demo_requested",
                trigger: "/api/demo/provision called",
                properties: { source: "string", referrer: "string" },
                priority: "high",
                destination: ["mixpanel", "hubspot"]
            },
            {
                name: "demo_call_made",
                trigger: "User calls demo phone number",
                properties: { duration_min: "number", completed: "boolean" },
                priority: "high",
                destination: ["mixpanel"]
            },
            {
                name: "signup_form_started",
                trigger: "Email field focused on signup form",
                properties: { source: "string", referrer: "string" },
                priority: "medium",
                destination: ["mixpanel", "ga4"]
            },
            {
                name: "signup_form_abandoned",
                trigger: "Signup form started but not completed within 5 min",
                properties: { last_field_filled: "string", time_spent_sec: "number" },
                priority: "medium",
                destination: ["mixpanel"]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // ACTIVATION — Do they experience the core value?
    // ═══════════════════════════════════════════════════
    activation: {
        stage_description: "Signup → First value moment (successful AI call).",
        events: [
            {
                name: "signup_completed",
                trigger: "POST /api/onboarding/quick-signup returns 201",
                properties: { tenant_id: "string", email_domain: "string", company_name: "string", source: "string" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "email_verified",
                trigger: "Verification link clicked",
                properties: { tenant_id: "string", time_to_verify_min: "number" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "onboarding_step_completed",
                trigger: "POST /api/onboarding/complete-step",
                properties: { tenant_id: "string", step_id: "string", step_order: "number", time_since_signup_min: "number" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "agent_configured",
                trigger: "POST /api/onboarding/configure-agent",
                properties: { tenant_id: "string", industry: "string", used_template: "boolean", custom_greeting: "boolean" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "phone_number_provisioned",
                trigger: "Phone number assigned to tenant",
                properties: { tenant_id: "string", number_type: "string" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "first_test_call",
                trigger: "First call completed for a tenant",
                properties: { tenant_id: "string", duration_min: "number", resolution: "string", time_since_signup_min: "number" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"],
                note: "This is the core activation metric — 'aha moment'"
            },
            {
                name: "onboarding_completed",
                trigger: "All required onboarding steps done",
                properties: { tenant_id: "string", total_time_min: "number", steps_skipped: "number" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "calendar_connected",
                trigger: "Calendar integration completed",
                properties: { tenant_id: "string", provider: "string" },
                priority: "medium",
                destination: ["mixpanel", "internal"]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // REVENUE — Do they pay us?
    // ═══════════════════════════════════════════════════
    revenue: {
        stage_description: "Trial → Paid conversion. Tracks monetization.",
        events: [
            {
                name: "trial_started",
                trigger: "Signup creates trial subscription",
                properties: { tenant_id: "string", trial_days: "number", trial_minutes: "number" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "trial_usage_milestone",
                trigger: "Usage reaches 25%, 50%, 75%, 100% of trial minutes",
                properties: { tenant_id: "string", percentage: "number", minutes_used: "number", minutes_total: "number" },
                priority: "medium",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "trial_expiring",
                trigger: "Trial has <6 hours remaining",
                properties: { tenant_id: "string", hours_remaining: "number", minutes_used: "number", has_payment_method: "boolean" },
                priority: "critical",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "trial_expired",
                trigger: "Trial period ends",
                properties: { tenant_id: "string", minutes_used: "number", was_suspended: "boolean", had_payment_method: "boolean" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "checkout_started",
                trigger: "POST /api/subscription/checkout",
                properties: { tenant_id: "string", plan_id: "string", billing_cycle: "string", previous_plan: "string" },
                priority: "critical",
                destination: ["mixpanel", "ga4", "internal"]
            },
            {
                name: "checkout_completed",
                trigger: "checkout.session.completed webhook",
                properties: { tenant_id: "string", plan_id: "string", billing_cycle: "string", amount: "number", is_upgrade: "boolean" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "ga4", "internal"]
            },
            {
                name: "plan_upgraded",
                trigger: "Subscription plan changed to higher tier",
                properties: { tenant_id: "string", from_plan: "string", to_plan: "string", mrr_change: "number" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "plan_downgraded",
                trigger: "Subscription plan changed to lower tier",
                properties: { tenant_id: "string", from_plan: "string", to_plan: "string", mrr_change: "number" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "overage_started",
                trigger: "Tenant exceeds included minutes",
                properties: { tenant_id: "string", included_minutes: "number", minutes_used: "number", overage_rate: "number" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "invoice_paid",
                trigger: "invoice.paid webhook",
                properties: { tenant_id: "string", amount: "number", subscription_amount: "number", overage_amount: "number" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "payment_failed",
                trigger: "invoice.payment_failed webhook",
                properties: { tenant_id: "string", amount: "number", failure_reason: "string", attempt_number: "number" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // RETENTION — Do they keep using it?
    // ═══════════════════════════════════════════════════
    retention: {
        stage_description: "Ongoing engagement and value delivery.",
        events: [
            {
                name: "call_completed",
                trigger: "AI call ends",
                properties: { tenant_id: "string", duration_min: "number", call_type: "string", resolution: "string", sentiment: "string", was_transferred: "boolean" },
                priority: "high",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "daily_active_usage",
                trigger: "End of day, at least 1 call",
                properties: { tenant_id: "string", calls_today: "number", minutes_today: "number", resolution_rate: "number" },
                priority: "medium",
                destination: ["internal"]
            },
            {
                name: "weekly_report_sent",
                trigger: "Weekly usage report email sent",
                properties: { tenant_id: "string", calls_this_week: "number", minutes_this_week: "number", resolution_rate: "number" },
                priority: "low",
                destination: ["internal"]
            },
            {
                name: "feature_used",
                trigger: "Specific feature engagement",
                properties: { tenant_id: "string", feature: "string", context: "string" },
                priority: "medium",
                destination: ["mixpanel", "internal"],
                feature_list: ["analytics_dashboard", "call_recordings", "agent_config", "calendar_integration", "api_access", "bulk_export", "team_management"]
            },
            {
                name: "health_score_changed",
                trigger: "Daily health score recalculation",
                properties: { tenant_id: "string", score: "number", previous_score: "number", direction: "string", category: "string" },
                priority: "medium",
                destination: ["internal"]
            },
            {
                name: "support_ticket_created",
                trigger: "Support ticket opened",
                properties: { tenant_id: "string", category: "string", priority: "string" },
                priority: "medium",
                destination: ["internal", "hubspot"]
            },
            {
                name: "cancellation_initiated",
                trigger: "Cancel page viewed or cancel button clicked",
                properties: { tenant_id: "string", plan: "string", months_active: "number", reason: "string" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "subscription_canceled",
                trigger: "customer.subscription.deleted webhook",
                properties: { tenant_id: "string", plan: "string", months_active: "number", total_revenue: "number", reason: "string" },
                priority: "critical",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "account_reactivated",
                trigger: "Previously canceled/suspended account resubscribes",
                properties: { tenant_id: "string", plan: "string", days_inactive: "number", previous_plan: "string" },
                priority: "high",
                destination: ["mixpanel", "hubspot", "internal"]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // REFERRAL — Do they bring others?
    // ═══════════════════════════════════════════════════
    referral: {
        stage_description: "Organic growth through user advocacy.",
        events: [
            {
                name: "referral_link_generated",
                trigger: "User creates a referral link",
                properties: { tenant_id: "string", referrer_plan: "string" },
                priority: "medium",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "referral_link_clicked",
                trigger: "Someone clicks a referral link",
                properties: { referrer_tenant_id: "string", source: "string" },
                priority: "medium",
                destination: ["mixpanel", "internal"]
            },
            {
                name: "referral_signup",
                trigger: "Referred user completes signup",
                properties: { referrer_tenant_id: "string", new_tenant_id: "string" },
                priority: "high",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "referral_converted",
                trigger: "Referred user becomes paid customer",
                properties: { referrer_tenant_id: "string", new_tenant_id: "string", plan: "string", referral_reward: "string" },
                priority: "high",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "nps_survey_completed",
                trigger: "NPS survey submitted",
                properties: { tenant_id: "string", score: "number", feedback: "string", would_recommend: "boolean" },
                priority: "medium",
                destination: ["mixpanel", "hubspot", "internal"]
            },
            {
                name: "testimonial_submitted",
                trigger: "User submits a testimonial or review",
                properties: { tenant_id: "string", platform: "string", rating: "number" },
                priority: "medium",
                destination: ["hubspot", "internal"]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // EVENT IMPLEMENTATION REGISTRY
    // ═══════════════════════════════════════════════════
    implementation: {
        tracking_service: "src/services/analytics.service.js",
        destinations: {
            mixpanel: { sdk: "mixpanel-node", server_side: true },
            ga4: { sdk: "measurement-protocol", server_side: true },
            hubspot: { sdk: "hubspot-api-client", server_side: true },
            internal: { storage: "analytics_events table", retention: "90 days" }
        },
        naming_convention: "snake_case, past tense (e.g., signup_completed, not signup)",
        property_rules: [
            "Always include tenant_id",
            "Always include timestamp (ISO 8601)",
            "Never include PII (email, name) — use hashed identifiers",
            "Minutes only — never expose token counts",
            "Amounts in USD, 2 decimal places"
        ],
        gdpr: {
            consent_required: ["mixpanel", "ga4"],
            consent_not_required: ["internal", "hubspot (legitimate interest)"],
            deletion_supported: true,
            export_supported: true
        }
    }
};

module.exports = ANALYTICS_EVENTS;
