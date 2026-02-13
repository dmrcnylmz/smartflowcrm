/**
 * POC Framework — 14-Day Enterprise Proof of Concept
 * 
 * Structured flow from scoping → shadow mode → measurement → decision.
 * Include: success metrics, exit criteria, and agreement template.
 */

const POC_FRAMEWORK = {

    // ═══════════════════════════════════════════════════
    // POC OVERVIEW
    // ═══════════════════════════════════════════════════
    overview: {
        title: "14-Day Enterprise Proof of Concept",
        objective: "Prove SmartFlow delivers measurable ROI on the prospect's actual call volume, call types, and quality standards — with zero risk.",
        duration: "14 calendar days",
        cost: "Free (Enterprise plan features, up to 2,000 minutes)",
        commitment: "No contract. No credit card. Decision at Day 14.",
        team: {
            smartflow: ["Solution Engineer (dedicated)", "Customer Success Manager", "Engineering escalation (on-call)"],
            customer: ["Project sponsor (executive)", "IT/Telephony contact", "Operations lead (daily check-in)"]
        }
    },

    // ═══════════════════════════════════════════════════
    // 14-DAY FLOW
    // ═══════════════════════════════════════════════════
    daily_flow: {
        phase_1_setup: {
            name: "Setup & Configuration",
            days: "Day 0-2",
            activities: [
                {
                    day: 0,
                    title: "Kick-off & Scoping",
                    tasks: [
                        "60-min kick-off call: align on success criteria, call types, volume expectations",
                        "Identify top 3 call types to automate (appointment, FAQ, complaint)",
                        "Collect business rules: hours, greeting, escalation paths, calendar systems",
                        "Define success metrics and thresholds (see success_metrics below)",
                        "Sign POC agreement (see template below)",
                        "Assign dedicated Slack/Teams channel"
                    ],
                    deliverable: "POC scope document, signed agreement",
                    owner: "Solution Engineer + Customer Sponsor"
                },
                {
                    day: 1,
                    title: "Technical Integration",
                    tasks: [
                        "Configure AI agent with customer's business rules and persona",
                        "Set up phone forwarding or SIP trunk (shadow mode — AI listens, doesn't answer)",
                        "Connect calendar integration (Google/Outlook/Calendly)",
                        "Configure CRM webhook (if applicable)",
                        "Test internal calls — validate greeting, routing, appointment flow",
                        "Provision analytics dashboard access for customer team"
                    ],
                    deliverable: "Working AI agent in shadow mode",
                    owner: "Solution Engineer"
                },
                {
                    day: 2,
                    title: "Validation & Go-Live Shadow",
                    tasks: [
                        "Run 10+ test calls across all configured call types",
                        "Customer team validates transcript accuracy and routing decisions",
                        "Fine-tune agent responses based on feedback",
                        "Enable shadow mode on live calls (AI processes but human still answers)",
                        "Begin capturing baseline metrics"
                    ],
                    deliverable: "Shadow mode active on live traffic",
                    owner: "Solution Engineer + Operations Lead"
                }
            ]
        },
        phase_2_shadow: {
            name: "Shadow Mode — AI vs. Human Comparison",
            days: "Day 3-7",
            activities: [
                {
                    day: "3-5",
                    title: "Shadow Analysis",
                    tasks: [
                        "AI processes all incoming calls in parallel (human still answers)",
                        "Daily report: AI classification accuracy vs. human agent decisions",
                        "Identify edge cases and gaps in AI configuration",
                        "Fine-tune: add FAQ entries, adjust transfer triggers, refine persona",
                        "Daily 15-min standup with customer operations lead"
                    ],
                    deliverable: "Daily comparison report (AI accuracy, intent match rate, latency)"
                },
                {
                    day: "6-7",
                    title: "Shadow Graduation",
                    tasks: [
                        "Review shadow data: AI must hit ≥70% on all success metrics to proceed",
                        "Customer stakeholder review meeting (30 min)",
                        "Decision: proceed to assisted mode or extend shadow (max 3 days)",
                        "If proceeding: enable AI-first answering with human fallback"
                    ],
                    deliverable: "Shadow graduation report, go/no-go decision"
                }
            ]
        },
        phase_3_assisted: {
            name: "Assisted Mode — AI Answers, Humans Monitor",
            days: "Day 8-12",
            activities: [
                {
                    day: "8-10",
                    title: "AI-First with Monitoring",
                    tasks: [
                        "AI answers all configured call types (top 3)",
                        "Human agents monitor via dashboard — can intervene on any call",
                        "Calls not matching configured types route directly to human",
                        "Daily metrics tracked: resolution rate, transfer rate, duration, satisfaction",
                        "Continue fine-tuning based on real-call feedback"
                    ],
                    deliverable: "Daily operational metrics report"
                },
                {
                    day: "11-12",
                    title: "Full Autonomy Test",
                    tasks: [
                        "AI handles calls autonomously (no passive monitoring)",
                        "Human agents freed for complex work or outbound tasks",
                        "Final metrics collection period",
                        "Customer satisfaction survey on AI-handled calls (sample of 20+)",
                        "Prepare final POC report"
                    ],
                    deliverable: "Full autonomy performance data"
                }
            ]
        },
        phase_4_decision: {
            name: "Review & Decision",
            days: "Day 13-14",
            activities: [
                {
                    day: 13,
                    title: "POC Results Presentation",
                    tasks: [
                        "45-min results presentation to customer stakeholders",
                        "Present: metrics vs. success criteria, cost analysis, recommendation",
                        "Share call recordings of best/representative AI conversations",
                        "Live Q&A with customer team",
                        "If metrics met: present commercial proposal (Enterprise plan + custom terms)"
                    ],
                    deliverable: "POC results deck, commercial proposal"
                },
                {
                    day: 14,
                    title: "Decision Day",
                    tasks: [
                        "Customer decision: convert, extend POC, or decline",
                        "If convert: begin enterprise onboarding (same-day activation)",
                        "If extend: define additional scope and timeline (max 14 more days)",
                        "If decline: exit interview, document reasons, schedule 90-day follow-up"
                    ],
                    deliverable: "Signed enterprise agreement or documented next steps"
                }
            ]
        }
    },

    // ═══════════════════════════════════════════════════
    // SUCCESS METRICS
    // ═══════════════════════════════════════════════════
    success_metrics: {
        description: "Agreed upon at kick-off. All metrics measured during Day 8-12 (assisted mode).",
        metrics: [
            {
                name: "AI Resolution Rate",
                description: "Percentage of calls fully resolved by AI without human intervention",
                target: "≥ 70%",
                measurement: "Resolved calls / Total AI-handled calls",
                minimum_viable: "≥ 60%",
                industry_benchmark: "78% (SmartFlow average)",
                weight: 0.25
            },
            {
                name: "Caller Satisfaction (CSAT)",
                description: "Post-call satisfaction score from caller survey",
                target: "≥ 4.2 / 5.0",
                measurement: "Average of post-call SMS surveys (automated)",
                minimum_viable: "≥ 3.8 / 5.0",
                industry_benchmark: "4.7/5.0 (SmartFlow average)",
                weight: 0.20
            },
            {
                name: "Average Handle Time",
                description: "Average duration of AI-handled calls",
                target: "≤ customer's current AHT or ≤ 4 min",
                measurement: "Total AI call minutes / Total AI calls",
                minimum_viable: "≤ 5 min",
                industry_benchmark: "2.6 min (SmartFlow average)",
                weight: 0.15
            },
            {
                name: "Answer Rate",
                description: "Percentage of calls answered within 3 seconds",
                target: "≥ 98%",
                measurement: "Calls answered <3s / Total incoming calls",
                minimum_viable: "≥ 95%",
                industry_benchmark: "99.8% (SmartFlow average)",
                weight: 0.10
            },
            {
                name: "Intent Accuracy",
                description: "AI correctly identifies call intent on first attempt",
                target: "≥ 85%",
                measurement: "Correct intents / Total classified calls (human-validated sample)",
                minimum_viable: "≥ 75%",
                industry_benchmark: "91% (SmartFlow average)",
                weight: 0.15
            },
            {
                name: "Cost per Handled Minute",
                description: "Total SmartFlow cost divided by total minutes handled",
                target: "≤ 50% of current cost per minute",
                measurement: "SmartFlow monthly cost / Total minutes handled",
                minimum_viable: "≤ 70% of current cost",
                industry_benchmark: "$0.05/min (Enterprise plan)",
                weight: 0.15
            }
        ],
        exit_criteria: {
            pass: "≥ 4 of 6 metrics meet target AND all meet minimum viable threshold",
            conditional_pass: "3 of 6 metrics meet target — extend POC by 7 days with fine-tuning",
            fail: "<3 metrics meet minimum viable thresholds — exit with learnings"
        }
    },

    // ═══════════════════════════════════════════════════
    // POC AGREEMENT TEMPLATE
    // ═══════════════════════════════════════════════════
    agreement_template: {
        title: "Proof of Concept Agreement",
        sections: [
            {
                title: "1. Parties",
                content: `This Proof of Concept Agreement ("Agreement") is entered into between:
- SmartFlow AI, Inc. ("SmartFlow"), and
- {{customer_legal_name}} ("Customer")
Effective Date: {{effective_date}}`
            },
            {
                title: "2. Purpose",
                content: `The purpose of this POC is to evaluate SmartFlow's AI Voice Call Center platform on Customer's live call traffic, measuring performance against mutually agreed success metrics. This POC is provided at no cost and creates no obligation to purchase.`
            },
            {
                title: "3. Scope",
                content: `3.1 Duration: 14 calendar days from the Effective Date.
3.2 Call Types: Up to 3 call types as identified during kick-off:
    (a) {{call_type_1}}
    (b) {{call_type_2}}
    (c) {{call_type_3}}
3.3 Volume: Up to 2,000 minutes of AI-processed calls.
3.4 Coverage: {{coverage_hours}} (e.g., 24/7, business hours only, after-hours only).
3.5 Integration: {{integrations}} (e.g., Google Calendar, Salesforce, SIP trunk).`
            },
            {
                title: "4. Success Criteria",
                content: `The POC will be evaluated against the following metrics, measured during the assisted mode phase (Days 8-12):

| Metric | Target | Minimum |
|--------|--------|---------|
| AI Resolution Rate | {{target_resolution}} | {{min_resolution}} |
| Caller Satisfaction | {{target_csat}} | {{min_csat}} |
| Average Handle Time | {{target_aht}} | {{min_aht}} |
| Answer Rate | {{target_answer}} | {{min_answer}} |
| Intent Accuracy | {{target_intent}} | {{min_intent}} |
| Cost per Minute | {{target_cost}} | {{min_cost}} |

Pass Criteria: ≥ 4 of 6 metrics meet target AND all meet minimum threshold.`
            },
            {
                title: "5. Responsibilities",
                content: `5.1 SmartFlow shall:
    (a) Provide a dedicated Solution Engineer for duration of POC
    (b) Configure AI agents per Customer's business rules
    (c) Deliver daily analytics reports
    (d) Present POC results on Day 13
    (e) Provide all Enterprise-plan features during POC

5.2 Customer shall:
    (a) Designate a project sponsor and operations lead
    (b) Provide call forwarding or SIP trunk access
    (c) Share business rules, FAQs, and escalation paths
    (d) Participate in daily 15-minute standups (Days 3-12)
    (e) Make decision by Day 14`
            },
            {
                title: "6. Data & Confidentiality",
                content: `6.1 All Customer data processed during the POC is governed by SmartFlow's Data Processing Agreement (Annex A).
6.2 Call recordings and transcripts will be deleted within 30 days of POC conclusion unless Customer opts to retain.
6.3 SmartFlow may use anonymized, aggregated POC metrics for internal benchmarking. No Customer-identifiable data will be shared externally.
6.4 Both parties agree to maintain confidentiality of proprietary information disclosed during the POC.`
            },
            {
                title: "7. Commercial Terms (Post-POC)",
                content: `7.1 If POC success criteria are met and Customer elects to proceed:
    (a) Customer will receive a commercial proposal within 2 business days of POC conclusion
    (b) POC configuration (agent, rules, integrations) will carry over seamlessly
    (c) No service interruption between POC and production

7.2 Proposed Plan: Enterprise ($499/month, 10,000 minutes, $0.05/min overage)
7.3 Custom pricing available for volumes exceeding 50,000 minutes/month.
7.4 Annual commitment discount: 20%.`
            },
            {
                title: "8. Termination",
                content: `Either party may terminate this POC at any time with written notice. Upon termination:
(a) SmartFlow will cease processing Customer calls within 4 hours
(b) All Customer data will be deleted within 30 days
(c) No charges will be incurred by Customer`
            },
            {
                title: "9. Signatures",
                content: `SmartFlow AI, Inc.
Name: ___________________  Title: ___________________  Date: ___________

{{customer_legal_name}}
Name: ___________________  Title: ___________________  Date: ___________`
            }
        ]
    }
};

module.exports = POC_FRAMEWORK;
