/**
 * Account-Based Sales Playbooks
 * 
 * ICP definition, scoring model, persona-based outreach,
 * multi-threading, and objection handling.
 */

const ABM_PLAYBOOKS = {

    // ═══════════════════════════════════════════════════
    // IDEAL CUSTOMER PROFILE (ICP)
    // ═══════════════════════════════════════════════════
    icp: {
        title: "Ideal Customer Profile — Scoring Model",
        tiers: [
            {
                tier: "Tier 1 — Perfect Fit",
                score_range: "80-100",
                characteristics: {
                    industry: ["Healthcare (dental, clinics, urgent care)", "Property Management", "Automotive (service/dealership)", "Legal (intake)", "Insurance (claims intake)"],
                    company_size: "50-500 employees",
                    call_volume: "2,000-20,000 inbound calls/month",
                    current_solution: "In-house agents or outsourced call center",
                    pain_signals: ["High turnover in call center", "After-hours coverage gaps", "Growth outpacing staffing", "Recent cost-cutting initiative"],
                    budget_authority: "VP Operations, COO, or Owner",
                    technology: "Cloud-based systems, modern CRM (Salesforce, HubSpot)"
                },
                approach: "Full ABM: personalized outreach, custom content, POC offer",
                expected_deal_size: "$6,000-$60,000 ARR"
            },
            {
                tier: "Tier 2 — Strong Fit",
                score_range: "60-79",
                characteristics: {
                    industry: ["Professional Services", "Home Services (HVAC, plumbing)", "Hospitality", "Education", "E-commerce (phone support)"],
                    company_size: "20-200 employees",
                    call_volume: "500-5,000 inbound calls/month",
                    current_solution: "Receptionist + voicemail, basic IVR",
                    pain_signals: ["Missed calls", "No after-hours coverage", "Single receptionist bottleneck"],
                    budget_authority: "Owner, Office Manager",
                    technology: "Google Workspace, basic CRM or spreadsheets"
                },
                approach: "Targeted outbound: industry-specific sequences, template demos",
                expected_deal_size: "$600-$6,000 ARR"
            },
            {
                tier: "Tier 3 — Growth Opportunity",
                score_range: "40-59",
                characteristics: {
                    industry: ["Retail", "Non-profit", "Government", "Startups"],
                    company_size: "5-50 employees",
                    call_volume: "<500 inbound calls/month",
                    current_solution: "Owner answers phone, basic voicemail",
                    pain_signals: ["Owner time consumed by calls", "Missing leads"],
                    budget_authority: "Founder/Owner",
                    technology: "Minimal — needs simple solution"
                },
                approach: "Self-serve: content marketing, free trial, nurture sequences",
                expected_deal_size: "$600-$1,800 ARR"
            }
        ],
        scoring_model: {
            dimensions: [
                { name: "Industry Fit", weight: 25, scoring: { perfect_match: 25, strong_match: 18, moderate: 10, weak: 5 } },
                { name: "Call Volume", weight: 20, scoring: { "10000+": 20, "2000-9999": 18, "500-1999": 12, "<500": 5 } },
                { name: "Company Size", weight: 15, scoring: { "200-500": 15, "50-199": 13, "20-49": 8, "<20": 4 } },
                { name: "Current Pain", weight: 20, scoring: { high_turnover_and_gaps: 20, missed_calls: 15, cost_pressure: 10, none_identified: 3 } },
                { name: "Technology Readiness", weight: 10, scoring: { modern_stack: 10, basic_cloud: 7, legacy: 3 } },
                { name: "Budget Signal", weight: 10, scoring: { active_evaluation: 10, aware_of_need: 7, not_looking: 3 } }
            ],
            total: 100
        }
    },

    // ═══════════════════════════════════════════════════
    // PERSONA-BASED OUTREACH CADENCES
    // ═══════════════════════════════════════════════════
    persona_cadences: {
        description: "Multi-channel outreach tailored to each buyer persona.",
        personas: [
            {
                persona: "VP Operations / COO",
                title_patterns: ["VP Operations", "VP Customer Experience", "COO", "Chief Operating Officer", "Director of Operations"],
                priorities: ["Cost reduction", "Operational efficiency", "Scalability", "Quality consistency"],
                messaging_angle: "COGS reduction + capacity scaling without headcount",
                cadence: [
                    { day: 1, channel: "LinkedIn", action: "Connection request with personalized note about their industry's call center challenges" },
                    { day: 3, channel: "Email", action: "Problem email: cost of current call center operations + missed call revenue" },
                    { day: 5, channel: "LinkedIn", action: "Share relevant case study from their industry" },
                    { day: 8, channel: "Email", action: "ROI email: custom cost analysis with their estimated volume" },
                    { day: 10, channel: "Phone", action: "Warm call referencing emails + LinkedIn activity" },
                    { day: 14, channel: "Email", action: "POC invitation: 14-day free proof of concept offer" },
                    { day: 18, channel: "LinkedIn", action: "Engage with their content or share industry article" },
                    { day: 21, channel: "Email", action: "Final value email with internal champion kit" },
                    { day: 25, channel: "Phone", action: "Second call attempt" },
                    { day: 30, channel: "Email", action: "Breakup email — close the loop" }
                ],
                subject_lines: [
                    "Cutting {{company_name}}'s call center COGS by 55%",
                    "How {{peer_company}} handles 5K calls/month with 2 agents",
                    "Custom cost model for {{company_name}}'s operations",
                    "14-day free proof — zero risk for {{company_name}}"
                ]
            },
            {
                persona: "IT Director / CTO",
                title_patterns: ["CTO", "VP Engineering", "IT Director", "Director of Technology", "Head of IT"],
                priorities: ["Integration simplicity", "Security & compliance", "System reliability", "API access"],
                messaging_angle: "No-engineering-required setup + enterprise security + API flexibility",
                cadence: [
                    { day: 1, channel: "Email", action: "Technical overview: architecture, integrations, security posture" },
                    { day: 4, channel: "LinkedIn", action: "Share security whitepaper or technical blog post" },
                    { day: 7, channel: "Email", action: "Integration specifics for their stack (CRM, calendar, telephony)" },
                    { day: 11, channel: "Email", action: "Security pack: SOC 2, DPA, subprocessor list, pentest summary" },
                    { day: 15, channel: "Phone", action: "Offer 30-min technical deep dive with our Solution Engineer" },
                    { day: 20, channel: "Email", action: "API documentation + sandbox access for technical evaluation" }
                ],
                subject_lines: [
                    "SmartFlow security & compliance overview for {{company_name}}",
                    "API-first voice AI — integrates with your existing stack",
                    "Technical deep dive: how {{peer_company}} integrated in 3 days"
                ]
            },
            {
                persona: "Business Owner / Founder",
                title_patterns: ["CEO", "Founder", "Owner", "President", "Managing Director"],
                priorities: ["Revenue growth", "Customer satisfaction", "Work-life balance", "Competitive edge"],
                messaging_angle: "Never miss a customer call again — AI answers 24/7 while you focus on growth",
                cadence: [
                    { day: 1, channel: "Email", action: "Personal pain: 'How many calls did you miss last week?'" },
                    { day: 3, channel: "LinkedIn", action: "Connection request — reference their business specifically" },
                    { day: 6, channel: "Email", action: "Case study from their exact industry/size" },
                    { day: 9, channel: "Email", action: "Quick math: missed calls → missed revenue" },
                    { day: 12, channel: "Phone", action: "Brief call — 'Just 60 seconds to see if this fits'" },
                    { day: 16, channel: "Email", action: "Free trial invitation (100 min, no credit card)" },
                    { day: 21, channel: "Email", action: "Breakup: 'Closing the loop — here if you need us'" }
                ],
                subject_lines: [
                    "Quick question about {{company_name}}'s phone lines",
                    "How {{similar_company}} answers 100% of calls with zero staff",
                    "60 seconds to never miss a customer call again"
                ]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // MULTI-THREADING STRATEGY
    // ═══════════════════════════════════════════════════
    multi_threading: {
        title: "Multi-Threading — Engaging Multiple Stakeholders",
        principle: "Every enterprise deal needs ≥3 threads to be safe. Single-threaded deals fail at 70% rate.",
        threads: [
            {
                role: "Champion",
                typical_title: "Operations Manager, Call Center Supervisor",
                engagement: "The internal advocate who sees daily pain. Feed them data and tools to sell internally.",
                assets: ["ROI calculator (customized)", "Internal presentation template", "Call recording demos", "Competitor comparison (confidential)"],
                cadence: "Weekly 1:1, Slack/Teams access, first to see new features"
            },
            {
                role: "Economic Buyer",
                typical_title: "VP Operations, COO, CFO",
                engagement: "Cares about ROI, risk, and strategic fit. Needs business case, not features.",
                assets: ["Executive summary (1-pager)", "Custom ROI model", "Risk mitigation plan (POC structure)", "Reference calls with peers"],
                cadence: "Monthly or milestone-based (POC results, business review)"
            },
            {
                role: "Technical Evaluator",
                typical_title: "IT Director, CTO, Security Lead",
                engagement: "Will gate the deal on security, integration, and compliance. Proactively satisfy.",
                assets: ["Security whitepaper", "SOC 2 readiness report", "DPA + subprocessor list", "API docs + sandbox", "Architecture diagram"],
                cadence: "Ad-hoc — respond within 4 hours to any technical question"
            },
            {
                role: "End User",
                typical_title: "Call Center Agent, Receptionist, Office Manager",
                engagement: "Will use the product daily. Must not feel threatened — position as 'AI handles the boring calls.'",
                assets: ["Dashboard demo", "Training guide (15 min)", "FAQ: 'What happens to my job?' → 'You focus on complex, rewarding work'"],
                cadence: "Include in POC demos, collect feedback during shadow mode"
            },
            {
                role: "Legal/Procurement",
                typical_title: "General Counsel, Procurement Manager",
                engagement: "Last-mile blocker. Have all documents ready before they ask.",
                assets: ["MSA redline-ready template", "DPA with SCCs", "Insurance certificate", "BAA (if healthcare)", "Subprocessor list"],
                cadence: "Reactive — package everything for one-shot review"
            }
        ],
        coverage_matrix: `
| Thread | Identified | Engaged | Positive | Risk |
|--------|-----------|---------|----------|------|
| Champion | ✅ Required | ✅ Required | ✅ Required | ❌ Deal fails without |
| Economic Buyer | ✅ Required | ✅ Required | ⬜ Target | ⚠️ Need by Day 10 |
| Technical | ✅ Required | ✅ Required | ⬜ Target | ⚠️ Can block at Gate |
| End User | ⬜ Target | ⬜ Target | ⬜ Nice to have | Low risk |
| Legal | ⬜ Target | ⬜ Before close | ⬜ Before close | ⚠️ Can delay 2-4wk |
`
    },

    // ═══════════════════════════════════════════════════
    // DEAL PROGRESSION STAGES
    // ═══════════════════════════════════════════════════
    deal_stages: {
        stages: [
            {
                stage: "S1 — Prospecting",
                probability: "10%",
                entry_criteria: "ICP score ≥ 60, contact identified",
                activities: ["Initial outreach", "Research company/contacts", "Personalize messaging"],
                exit_criteria: "Meeting booked",
                avg_time: "7-14 days"
            },
            {
                stage: "S2 — Discovery",
                probability: "20%",
                entry_criteria: "Meeting held, pain confirmed",
                activities: ["Discovery call (MEDDICC qualification)", "Understand current state, pain, impact", "Identify champion and economic buyer"],
                exit_criteria: "Pain quantified, champion identified, next meeting scheduled",
                avg_time: "3-7 days"
            },
            {
                stage: "S3 — Solution Presented",
                probability: "40%",
                entry_criteria: "Solution demo completed, ROI shared",
                activities: ["Custom demo for their use case", "ROI model presented", "Security whitepaper sent", "Objections handled"],
                exit_criteria: "Positive feedback, EB engaged (or meeting scheduled), POC discussion started",
                avg_time: "5-10 days"
            },
            {
                stage: "S4 — POC / Evaluation",
                probability: "60%",
                entry_criteria: "POC agreement signed",
                activities: ["14-day POC execution", "Daily standups, weekly stakeholder reviews", "Success metrics tracking"],
                exit_criteria: "POC success criteria met (≥4/6 metrics hit target)",
                avg_time: "14-21 days"
            },
            {
                stage: "S5 — Negotiation",
                probability: "80%",
                entry_criteria: "POC passed, commercial proposal sent",
                activities: ["Pricing negotiation", "Legal/procurement review", "Contract redlines", "Final stakeholder sign-off"],
                exit_criteria: "Terms agreed, contract sent for signature",
                avg_time: "7-21 days"
            },
            {
                stage: "S6 — Closed Won",
                probability: "100%",
                entry_criteria: "Contract signed, payment processed",
                activities: ["Hand off to Customer Success", "Enterprise onboarding kick-off", "Production go-live"],
                exit_criteria: "Customer live in production",
                avg_time: "1-3 days"
            }
        ],
        qualification_framework: {
            name: "MEDDICC",
            criteria: {
                M: { name: "Metrics", question: "What measurable outcome are they trying to achieve?", required: "S2" },
                E: { name: "Economic Buyer", question: "Who has budget authority and final sign-off?", required: "S3" },
                D1: { name: "Decision Criteria", question: "How will they evaluate solutions?", required: "S3" },
                D2: { name: "Decision Process", question: "What's the buying process and timeline?", required: "S3" },
                I: { name: "Identify Pain", question: "What specific pain does this solve?", required: "S2" },
                C1: { name: "Champion", question: "Who inside will sell for us when we're not in the room?", required: "S2" },
                C2: { name: "Competition", question: "Who else are they evaluating?", required: "S3" }
            }
        }
    }
};

module.exports = ABM_PLAYBOOKS;
