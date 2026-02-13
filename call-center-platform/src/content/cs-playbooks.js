/**
 * Customer Success Playbooks — First 30 Days
 * 
 * Structured playbooks for CS team:
 * - Automated triggers + human touchpoints
 * - Health score calculation
 * - At-risk intervention
 * - Expansion signals
 * 
 * All customer-facing metrics in minutes. No tokens.
 */

const CS_PLAYBOOKS = {

    // ═══════════════════════════════════════════════════
    // HEALTH SCORE MODEL
    // ═══════════════════════════════════════════════════
    health_score: {
        description: "0-100 composite score. Updated daily.",
        weights: {
            usage_engagement: 0.30,     // Are they using their minutes?
            feature_adoption: 0.20,     // Have they configured agent, calendar, etc.?
            support_sentiment: 0.15,    // Support tickets: resolved vs unresolved
            call_quality: 0.20,         // Resolution rate, avg duration, transfer rate
            payment_health: 0.15        // On time, no failures, no disputes
        },
        thresholds: {
            healthy: { min: 70, color: 'green', action: 'nurture' },
            at_risk: { min: 40, color: 'yellow', action: 'intervene' },
            critical: { min: 0, color: 'red', action: 'escalate' }
        },
        calculate: (metrics) => {
            const usage = Math.min(100, (metrics.minutes_used / metrics.minutes_included) * 150);
            const features = (metrics.steps_completed / metrics.steps_total) * 100;
            const support = metrics.open_tickets === 0 ? 100 : Math.max(0, 100 - metrics.open_tickets * 20);
            const quality = metrics.resolution_rate * 100;
            const payment = metrics.payments_on_time ? 100 : metrics.past_due ? 20 : 60;

            return Math.round(
                usage * 0.30 + features * 0.20 + support * 0.15 + quality * 0.20 + payment * 0.15
            );
        }
    },

    // ═══════════════════════════════════════════════════
    // DAY-BY-DAY PLAYBOOKS
    // ═══════════════════════════════════════════════════

    day_0: {
        title: "Welcome + First Call",
        trigger: "signup_completed",
        automated_actions: [
            { action: "send_welcome_email", template: "trial_00_welcome" },
            { action: "create_onboarding_checklist", service: "onboarding" },
            { action: "track_event", event: "trial_started" },
            { action: "assign_cs_owner", rule: "round_robin" }
        ],
        human_touchpoint: {
            channel: "none",
            note: "Self-serve. No human contact on Day 0 — let them explore."
        },
        success_criteria: [
            "Account created",
            "Verification email sent",
            "Onboarding checklist initialized"
        ],
        health_signals: {
            positive: ["Signed up with business email (not gmail/yahoo)", "Filled in company name"],
            negative: ["Used throwaway email", "Bounced within 30 seconds"]
        }
    },

    day_1: {
        title: "First Call + Setup Check",
        trigger: "24_hours_post_signup",
        automated_actions: [
            { action: "send_email", template: "trial_01_day1" },
            { action: "check_first_call", condition: "has_made_test_call" },
            { action: "track_event", event: "day_1_check" }
        ],
        human_touchpoint: {
            channel: "email (only if no first call)",
            script: `Hi {{first_name}}, noticed you signed up yesterday but haven't made your first test call yet. 
It takes 30 seconds — just call {{ai_phone_number}} and chat with your AI agent. 
Any questions? I'm here to help.`,
            trigger: "no_test_call_after_24h"
        },
        success_criteria: [
            "First test call completed",
            "Agent configured (or default accepted)",
            "Email verified"
        ],
        health_signals: {
            positive: ["Made test call", "Configured agent persona", "Connected calendar"],
            negative: ["No login since signup", "Email not verified", "0 minutes used"]
        }
    },

    day_2: {
        title: "Urgency + Value Demo",
        trigger: "48_hours_post_signup",
        automated_actions: [
            { action: "send_email", template: "trial_02_day2" },
            { action: "calculate_projected_savings" },
            { action: "track_event", event: "day_2_check" }
        ],
        human_touchpoint: {
            channel: "in-app notification",
            message: "⏰ 24 hours left in your trial. Your AI has handled {call_count} calls. Upgrade to keep it running →",
            trigger: "always"
        },
        success_criteria: [
            "Multiple test calls made",
            "Understanding value (viewed analytics)",
            "Considering upgrade (visited pricing page)"
        ],
        health_signals: {
            positive: ["Multiple calls made", "Visited pricing page", "Shared demo with colleague"],
            negative: ["Only 1 call made", "No return visit", "No agent customization"]
        }
    },

    day_3: {
        title: "Trial Ending — Convert or Lose",
        trigger: "trial_expiring",
        automated_actions: [
            { action: "send_email", template: "trial_03_expiring" },
            { action: "in_app_banner", message: "Trial expires in {{hours_remaining}} hours" },
            { action: "track_event", event: "trial_expiring" }
        ],
        human_touchpoint: {
            channel: "phone call (high-value leads only)",
            criteria: "minutes_used > 20 AND has_configured_agent AND NOT upgraded",
            script: `Hi {{first_name}}, this is {{cs_name}} from SmartFlow. I saw your AI agent handled {{call_count}} calls 
during your trial — that's great usage! Your trial expires tonight, and I wanted to see if you had any 
questions before deciding. We often find the Starter plan at $49/month is perfect for teams at your stage.`,
            fallback: "SMS with direct upgrade link if no phone answer"
        },
        success_criteria: [
            "Converted to paid plan",
            "OR: Understand objection and log for follow-up"
        ],
        health_signals: {
            positive: ["Upgraded", "Asked about annual pricing", "Requested enterprise features"],
            negative: ["No login on Day 3", "0 minutes used", "Explicitly declined"]
        }
    },

    day_7: {
        title: "Value Realization Check (Post-Convert)",
        trigger: "7_days_post_signup AND status = active",
        automated_actions: [
            { action: "calculate_health_score" },
            { action: "send_weekly_report_email" },
            { action: "track_event", event: "week_1_check" }
        ],
        human_touchpoint: {
            channel: "email",
            script: `Hi {{first_name}}, happy one-week anniversary with SmartFlow! 🎉

Quick stats from your first week:
- {{call_count}} calls handled
- {{minutes_used}} minutes used of {{minutes_included}} included
- {{resolution_rate}}% resolved without human handoff

Are there any call types your AI isn't handling well? I can help fine-tune the configuration.

Also — have you connected your calendar yet? It's the #1 feature that boosts resolution rates.`,
            trigger: "always_for_paid"
        },
        success_criteria: [
            "Using >20% of included minutes",
            "Health score >= 60",
            "No open support tickets"
        ]
    },

    day_14: {
        title: "Expansion Conversation",
        trigger: "14_days_post_signup AND status = active",
        automated_actions: [
            { action: "analyze_usage_trend" },
            { action: "check_overage_trajectory" },
            { action: "track_event", event: "week_2_review" }
        ],
        human_touchpoint: {
            channel: "video call (15 min)",
            criteria: "minutes_used > 50% of included OR health_score > 70",
            agenda: [
                "Review call analytics together",
                "Identify any unhandled call types",
                "Discuss team expansion (more agents?)",
                "Preview upcoming features",
                "If approaching limit: discuss plan upgrade vs overage strategy"
            ],
            trigger: "proactive_outreach"
        },
        success_criteria: [
            "Using >50% of included minutes",
            "Health score >= 65",
            "No churn signals"
        ],
        expansion_signals: [
            "Approaching minute limit",
            "Multiple team members logging in",
            "Requesting API access",
            "Asking about additional phone numbers",
            "Mentioning other departments/locations"
        ]
    },

    day_30: {
        title: "Health Score Review + Renewal Prep",
        trigger: "30_days_post_signup AND status = active",
        automated_actions: [
            { action: "generate_monthly_report" },
            { action: "calculate_roi_summary" },
            { action: "track_event", event: "month_1_review" }
        ],
        human_touchpoint: {
            channel: "email with report + call offer",
            script: `Hi {{first_name}},

Your first month report is ready: {{report_link}}

Key highlights:
- {{total_calls}} calls handled ({{resolution_rate}}% auto-resolved)
- {{minutes_used}}/{{minutes_included}} minutes used
- Estimated cost savings: \${{savings}}/month vs. traditional call center
- Customer satisfaction: {{csat}}/5.0

{{#if approaching_renewal}}
Your subscription renews on {{renewal_date}}. Everything looks great — no action needed.
{{/if}}

{{#if overage_minutes > 0}}
You went over your included minutes by {{overage_minutes}} min (\${{overage_charge}}). 
Upgrading to {{recommended_plan}} would save you \${{upgrade_savings}}/month. Want me to make the switch?
{{/if}}

Anything I can help optimize? Reply anytime.`,
            trigger: "always"
        },
        success_criteria: [
            "Health score >= 70",
            "Monthly renewal successful",
            "Positive ROI demonstrated"
        ]
    },

    // ═══════════════════════════════════════════════════
    // AT-RISK INTERVENTION TRIGGERS
    // ═══════════════════════════════════════════════════
    intervention_triggers: {
        immediate: [
            {
                signal: "payment_failed",
                action: "Send payment failure email + in-app alert. CS followup in 24h if not resolved.",
                severity: "high"
            },
            {
                signal: "health_score_dropped_below_40",
                action: "Flag for CS manager. Personal outreach within 4 hours.",
                severity: "high"
            },
            {
                signal: "support_ticket_unresolved_48h",
                action: "Escalate to senior CS. Offer live call.",
                severity: "medium"
            }
        ],
        weekly_review: [
            {
                signal: "usage_dropped_50_pct_wow",
                action: "Check-in email: 'We noticed fewer calls this week — everything okay?'",
                severity: "medium"
            },
            {
                signal: "no_login_7_days",
                action: "Re-engagement email with usage summary + feature highlight.",
                severity: "medium"
            },
            {
                signal: "resolution_rate_below_60_pct",
                action: "Offer AI agent optimization session. Schedule 15-min call.",
                severity: "low"
            }
        ],
        pre_churn: [
            {
                signal: "viewed_cancel_page",
                action: "Immediate in-app offer: 'Before you go — what if we gave you 30 days free to try our latest features?'",
                severity: "critical"
            },
            {
                signal: "downgraded_plan",
                action: "CS call: understand situation, offer annual discount, document reason.",
                severity: "high"
            },
            {
                signal: "trial_expired_high_usage",
                action: "Phone call within 2 hours. This user was engaged — find the blocker.",
                severity: "critical"
            }
        ]
    }
};

module.exports = CS_PLAYBOOKS;
