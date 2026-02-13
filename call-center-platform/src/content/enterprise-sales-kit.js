/**
 * Enterprise Sales Kit
 * 
 * 1. 15-slide pitch deck outline
 * 2. One-pager / leave-behind
 * 3. ROI calculator logic + templates
 * 4. Competitive battlecards
 * 
 * All pricing in minutes. Tokens are internal only.
 */

const ENTERPRISE_SALES_KIT = {

    // ═══════════════════════════════════════════════════
    // 1. PITCH DECK — 15-slide outline
    // ═══════════════════════════════════════════════════
    pitch_deck: {
        title: "SmartFlow AI — Enterprise Pitch Deck",
        duration: "20 minutes",
        slides: [
            {
                number: 1,
                title: "Title Slide",
                headline: "SmartFlow AI Voice Platform",
                subtext: "Answer every customer call. 24/7. At 90% less cost.",
                visuals: "Logo, clean dark background, trust badges (SOC 2, HIPAA-ready)",
                speaker_notes: "Quick intro — we help enterprises replace tier-1 call center operations with AI voice agents."
            },
            {
                number: 2,
                title: "The Problem",
                headline: "Your call center is a cost center that's failing your customers",
                bullets: [
                    "62% of calls go unanswered after hours",
                    "$25-40/hour per agent, plus training & turnover (avg 30-45% annually)",
                    "Hold times averaging 4+ minutes drive 34% caller abandonment",
                    "Inconsistent quality across agents, shifts, and locations"
                ],
                visuals: "Split screen: frustrated customer on hold → missed revenue chart",
                speaker_notes: "Anchor on cost. Enterprise buyers think in COGS reduction."
            },
            {
                number: 3,
                title: "The Cost of Inaction",
                headline: "${{annual_cost}} per year in call center COGS",
                bullets: [
                    "{{agent_count}} agents × $35/hr avg × 2,080 hrs = ${{annual_labor}}",
                    "Add 30% for benefits, training, management = ${{total_cost}}",
                    "Plus: missed calls = missed revenue (est. $80 per missed call)",
                    "And: inconsistent CX = higher churn"
                ],
                visuals: "Cost breakdown waterfall chart (customized per prospect)",
                speaker_notes: "Use their actual numbers if available. Otherwise use industry benchmarks."
            },
            {
                number: 4,
                title: "Introducing SmartFlow",
                headline: "AI agents that sound human, resolve issues, and never take a break",
                bullets: [
                    "Natural voice conversations — 94% of callers don't detect AI",
                    "Handles: appointments, FAQs, complaints, transfers, follow-ups",
                    "Answers in <1 second, 24/7/365",
                    "Seamless human handoff when needed"
                ],
                visuals: "Live demo audio clip or waveform visualization",
                speaker_notes: "If possible, play a 30-second demo call. Impact is immediate."
            },
            {
                number: 5,
                title: "How It Works",
                headline: "Three layers, one platform",
                content: "Voice Processing → AI Understanding → Action Engine",
                bullets: [
                    "Layer 1: Real-time voice capture and transcription",
                    "Layer 2: Intent classification, sentiment analysis, context",
                    "Layer 3: Appointment booking, CRM updates, transfers, SMS"
                ],
                visuals: "Simple 3-layer architecture diagram — no tokens, no model names",
                speaker_notes: "Keep technical but not deep. Focus on outcomes, not architecture."
            },
            {
                number: 6,
                title: "Customer Results",
                headline: "Proven at scale — across industries",
                case_studies: [
                    { company: "Regional Healthcare System", result: "100% answer rate, 2x appointment bookings, 55% cost reduction" },
                    { company: "Property Management Group", result: "80% of calls auto-resolved, 3,200 hours/year saved" },
                    { company: "National Auto Service Chain", result: "90% COGS reduction, 4.8/5.0 caller satisfaction" }
                ],
                visuals: "Before/after metrics with company logos",
                speaker_notes: "Choose the case study closest to their industry."
            },
            {
                number: 7,
                title: "Platform Capabilities",
                headline: "Everything you need. Nothing you don't.",
                features: [
                    "Natural multi-language voice (EN, ES, FR, DE)",
                    "Calendar integrations (Google, Outlook, Calendly)",
                    "CRM sync (Salesforce, HubSpot, custom API)",
                    "Compliance controls (call recording, consent, data residency)",
                    "Real-time analytics dashboard",
                    "White-label ready"
                ],
                visuals: "Feature grid with checkmarks",
                speaker_notes: "Emphasize whatever is most relevant to their use case."
            },
            {
                number: 8,
                title: "Security & Compliance",
                headline: "Enterprise-grade by design",
                bullets: [
                    "SOC 2 Type II (in progress, est. Q3 2026)",
                    "HIPAA BAA available for healthcare",
                    "GDPR/CCPA compliant, DPA provided",
                    "Tenant isolation with dedicated encryption keys",
                    "99.9% uptime SLA, <1h RTO (Enterprise)"
                ],
                visuals: "Certification badges + architecture trust diagram",
                speaker_notes: "Have the security whitepaper ready to send. InfoSec will ask for it."
            },
            {
                number: 9,
                title: "Integration Architecture",
                headline: "Plugs into your existing stack",
                integrations: [
                    "Telephony: SIP trunking, number porting, call forwarding",
                    "CRM: Salesforce, HubSpot, Zoho, custom webhook",
                    "Calendar: Google Calendar, Microsoft Outlook, Calendly",
                    "Ticketing: Zendesk, Freshdesk, ServiceNow",
                    "Custom: REST API, webhooks, SSO (SAML/OIDC)"
                ],
                visuals: "Hub-and-spoke diagram with SmartFlow at center",
                speaker_notes: "Ask what tools they use today. Show the specific integration."
            },
            {
                number: 10,
                title: "White-Label Option",
                headline: "Your brand. Our AI.",
                bullets: [
                    "Custom branding on all surfaces (dashboard, emails, portal)",
                    "Custom domain and SSL",
                    "Agent persona matches your brand voice",
                    "Your customers never see 'SmartFlow'",
                    "Available on Enterprise plan and partner program"
                ],
                visuals: "Side-by-side: SmartFlow branded vs white-labeled version",
                speaker_notes: "Relevant for resellers, agencies, and multi-brand enterprises."
            },
            {
                number: 11,
                title: "ROI Analysis",
                headline: "The math works — here's your custom model",
                content: "{{custom_roi_table}}",
                formula: "Annual Savings = (Current COGS - SmartFlow Cost) × 12",
                visuals: "Customized ROI table (see ROI calculator)",
                speaker_notes: "Use their actual call volume. If unknown, use industry averages and note it."
            },
            {
                number: 12,
                title: "Pricing",
                headline: "Simple, transparent, minute-based pricing",
                plans: {
                    starter: { price: "$49/mo", minutes: 500, overage: "$0.12/min" },
                    pro: { price: "$149/mo", minutes: 2000, overage: "$0.08/min" },
                    enterprise: { price: "$499/mo", minutes: 10000, overage: "$0.05/min" },
                    custom: { price: "Custom", minutes: "Unlimited", overage: "Volume-based" }
                },
                note: "Annual billing saves 20%. Custom pricing for 50,000+ minutes/month.",
                speaker_notes: "Don't lead with price. If they ask early, say 'typically 70-90% less than current costs, let me show you the math.' Then flip to the ROI slide."
            },
            {
                number: 13,
                title: "Implementation",
                headline: "Live in days, not months",
                timeline: [
                    { phase: "Day 1-2", activity: "Kick-off, configure AI agents, connect phone system" },
                    { phase: "Day 3-7", activity: "Shadow mode (AI + human in parallel), fine-tune" },
                    { phase: "Day 8-12", activity: "Gradual rollout, monitor KPIs" },
                    { phase: "Day 13-14", activity: "Full deployment, handover to CS team" }
                ],
                visuals: "Implementation timeline with milestones",
                speaker_notes: "Enterprise buyers worry about implementation risk. Show it's low-risk."
            },
            {
                number: 14,
                title: "POC Proposal",
                headline: "Prove it in 14 days. Zero risk.",
                bullets: [
                    "2-week proof of concept on your top 3 call types",
                    "Shadow mode — run alongside your existing team",
                    "Daily analytics reports comparing AI vs. human performance",
                    "No commitment beyond the POC",
                    "Dedicated solution engineer for setup and support"
                ],
                visuals: "POC timeline graphic",
                speaker_notes: "Always close with a POC. It's the lowest-friction next step."
            },
            {
                number: 15,
                title: "Next Steps",
                headline: "Let's find out if SmartFlow works for {{company_name}}",
                cta_options: [
                    "Schedule a 14-day POC (recommended)",
                    "Request a custom ROI analysis",
                    "Connect with our security team for InfoSec review",
                    "Try a live demo right now"
                ],
                visuals: "Clean slide with 4 CTA buttons + contact info",
                speaker_notes: "Guide them to the POC. If they're not ready, offer the custom ROI analysis as a homework assignment."
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // 2. ONE-PAGER / LEAVE-BEHIND
    // ═══════════════════════════════════════════════════
    one_pager: {
        title: "SmartFlow AI Voice Platform — Enterprise Overview",
        format: "Single-page PDF, front and back",
        front: {
            headline: "Answer every customer call with AI. 24/7. At 90% less cost.",
            value_props: [
                { icon: "zap", title: "Live in 60 seconds", text: "No engineering needed. Configure in plain English, connect your phones, go live." },
                { icon: "clock", title: "24/7/365 coverage", text: "Never miss a call again. AI answers instantly, day or night." },
                { icon: "trending-down", title: "90% cost reduction", text: "Replace $35/hr agents with AI at $0.05/minute." },
                { icon: "thumbs-up", title: "94% indistinguishable", text: "Callers can't tell the difference. Natural voice, real conversations." }
            ],
            capabilities_grid: {
                "Appointment Booking": "Books directly into your calendar system",
                "FAQ Handling": "Answers from your knowledge base instantly",
                "Complaint Intake": "Logs details, sentiment, severity — routes to right team",
                "Smart Transfers": "Detects when human is needed, transfers with full context",
                "Multi-Language": "English, Spanish, French, German — auto-detects",
                "Analytics": "Real-time dashboard, call recordings, transcripts"
            }
        },
        back: {
            roi_snapshot: {
                title: "Typical ROI: payback in <30 days",
                comparison: {
                    traditional: { label: "3 Full-Time Agents", cost_monthly: "$17,500", coverage: "8am-6pm M-F", quality: "Varies" },
                    smartflow: { label: "SmartFlow Enterprise", cost_monthly: "$499", coverage: "24/7/365", quality: "Consistent" }
                },
                savings: "$204,000/year"
            },
            security_badges: ["SOC 2 (in progress)", "HIPAA Ready", "GDPR Compliant", "99.9% SLA"],
            pricing_summary: "Plans from $49/month. Enterprise custom pricing available. Minute-based billing — pay for what you use.",
            cta: {
                primary: "Start a 14-day POC → smartflow.ai/enterprise",
                secondary: "Questions? enterprise@smartflow.ai | +1-888-SMART-AI"
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // 3. ROI CALCULATOR
    // ═══════════════════════════════════════════════════
    roi_calculator: {
        title: "Enterprise ROI Calculator",
        description: "Input prospect's current metrics, output savings analysis",
        inputs: [
            { field: "monthly_call_volume", label: "Monthly inbound calls", type: "number", default: 5000 },
            { field: "avg_call_duration_min", label: "Avg call duration (minutes)", type: "number", default: 3.5 },
            { field: "current_agents", label: "Current call center agents", type: "number", default: 10 },
            { field: "avg_hourly_cost", label: "Avg fully-loaded agent cost ($/hr)", type: "number", default: 35 },
            { field: "hours_per_week", label: "Agent hours per week", type: "number", default: 40 },
            { field: "after_hours_coverage", label: "After-hours coverage exists?", type: "boolean", default: false },
            { field: "annual_turnover_pct", label: "Annual agent turnover (%)", type: "number", default: 35 },
            { field: "training_cost_per_agent", label: "Training cost per new agent ($)", type: "number", default: 3000 },
            { field: "missed_call_pct", label: "Current missed call rate (%)", type: "number", default: 25 },
            { field: "revenue_per_call", label: "Avg revenue opportunity per call ($)", type: "number", default: 80 }
        ],
        calculate: (inputs) => {
            const i = inputs;
            const monthlyMinutes = i.monthly_call_volume * i.avg_call_duration_min;

            // Current costs
            const monthlyLaborCost = i.current_agents * i.avg_hourly_cost * i.hours_per_week * 4.33;
            const annualLaborCost = monthlyLaborCost * 12;
            const annualTurnoverCost = i.current_agents * (i.annual_turnover_pct / 100) * i.training_cost_per_agent;
            const annualMissedRevenue = i.monthly_call_volume * (i.missed_call_pct / 100) * i.revenue_per_call * 12;
            const totalCurrentCost = annualLaborCost + annualTurnoverCost;

            // SmartFlow cost
            let smartflowPlan, smartflowBase, includedMinutes, overageRate;
            if (monthlyMinutes <= 500) {
                smartflowPlan = 'Starter'; smartflowBase = 49; includedMinutes = 500; overageRate = 0.12;
            } else if (monthlyMinutes <= 2000) {
                smartflowPlan = 'Pro'; smartflowBase = 149; includedMinutes = 2000; overageRate = 0.08;
            } else if (monthlyMinutes <= 10000) {
                smartflowPlan = 'Enterprise'; smartflowBase = 499; includedMinutes = 10000; overageRate = 0.05;
            } else {
                smartflowPlan = 'Custom'; smartflowBase = 499; includedMinutes = 10000;
                overageRate = monthlyMinutes > 50000 ? 0.03 : 0.04;
            }

            const overageMinutes = Math.max(0, monthlyMinutes - includedMinutes);
            const monthlySmartflowCost = smartflowBase + (overageMinutes * overageRate);
            const annualSmartflowCost = monthlySmartflowCost * 12;

            // AI resolution assumption: 75-80% auto-resolved
            const aiResolutionRate = 0.78;
            const humanAgentsNeeded = Math.ceil(i.current_agents * (1 - aiResolutionRate));
            const reducedLaborCost = humanAgentsNeeded * i.avg_hourly_cost * i.hours_per_week * 4.33 * 12;

            // Savings
            const annualSavings = totalCurrentCost - annualSmartflowCost - reducedLaborCost;
            const recoveredRevenue = annualMissedRevenue * 0.85; // 85% of previously missed calls now answered
            const totalImpact = annualSavings + recoveredRevenue;
            const paybackDays = Math.ceil((monthlySmartflowCost / (annualSavings / 365)));
            const roi_pct = Math.round((annualSavings / annualSmartflowCost) * 100);

            return {
                current_state: {
                    monthly_minutes: monthlyMinutes,
                    monthly_labor_cost: Math.round(monthlyLaborCost),
                    annual_labor_cost: Math.round(annualLaborCost),
                    annual_turnover_cost: Math.round(annualTurnoverCost),
                    annual_missed_revenue: Math.round(annualMissedRevenue),
                    total_annual_cost: Math.round(totalCurrentCost),
                    cost_per_minute: Number((monthlyLaborCost / monthlyMinutes).toFixed(2))
                },
                smartflow_state: {
                    recommended_plan: smartflowPlan,
                    monthly_base: smartflowBase,
                    included_minutes: includedMinutes,
                    overage_minutes: overageMinutes,
                    overage_rate: overageRate,
                    monthly_total: Math.round(monthlySmartflowCost),
                    annual_total: Math.round(annualSmartflowCost),
                    cost_per_minute: Number((monthlySmartflowCost / monthlyMinutes).toFixed(3)),
                    ai_resolution_rate: `${aiResolutionRate * 100}%`,
                    human_agents_still_needed: humanAgentsNeeded,
                    reduced_labor_annual: Math.round(reducedLaborCost)
                },
                impact: {
                    annual_cost_savings: Math.round(annualSavings),
                    annual_recovered_revenue: Math.round(recoveredRevenue),
                    total_annual_impact: Math.round(totalImpact),
                    cost_reduction_pct: Math.round((1 - (annualSmartflowCost + reducedLaborCost) / totalCurrentCost) * 100),
                    roi_percentage: roi_pct,
                    payback_days: paybackDays,
                    agents_freed: i.current_agents - humanAgentsNeeded,
                    coverage_improvement: i.after_hours_coverage ? "Maintained" : "Added 24/7 (was business hours only)"
                }
            };
        }
    },

    // ═══════════════════════════════════════════════════
    // 4. COMPETITIVE BATTLECARDS
    // ═══════════════════════════════════════════════════
    battlecards: {
        description: "Use during competitive deals. Focus on disqualifiers and unique value.",
        competitors: [
            {
                name: "Traditional Call Centers (Teleperformance, Concentrix, etc.)",
                their_pitch: "Human agents provide empathy and complex problem-solving",
                weaknesses: [
                    "Cost: $25-40/hr per agent fully loaded",
                    "Availability: Limited to staffed hours, expensive for 24/7",
                    "Quality: Inconsistent across agents, shifts, and sites",
                    "Scale: Adding capacity takes weeks (hiring + training)",
                    "Turnover: 30-45% annual attrition = constant re-training"
                ],
                our_advantage: [
                    "90% cost reduction ($0.05/min vs $0.30+/min)",
                    "24/7/365 — no staffing gaps, no overtime",
                    "100% consistent quality on every call",
                    "Instant scale — handle 1 or 1,000 simultaneous calls",
                    "Zero turnover — AI doesn't quit"
                ],
                killer_question: "What's your annual agent turnover rate, and how much does each replacement cost you in hiring and training?",
                landmine: "Ask about their COGS per handled minute — it's always 5-10x ours."
            },
            {
                name: "IVR Systems (Genesys, Five9, NICE)",
                their_pitch: "Proven enterprise telephony with automation capabilities",
                weaknesses: [
                    "UX: Menu trees frustrate callers (press 1, press 2...)",
                    "Resolution: Low first-call resolution — most calls still route to human",
                    "NLU: Limited natural language — callers must use exact phrases",
                    "Setup: 3-6 month implementation cycles",
                    "Cost: $150-300/agent/month plus telephony + professional services"
                ],
                our_advantage: [
                    "No menu trees — natural conversation from second one",
                    "78% auto-resolution vs <30% for IVR",
                    "Setup in days, not months",
                    "No per-seat licensing — pay per minute used",
                    "AI improves over time with zero retraining cost"
                ],
                killer_question: "What percentage of calls actually resolve in your IVR without reaching an agent?",
                landmine: "Ask callers to rate IVR satisfaction — it's universally hated."
            },
            {
                name: "Chatbot Platforms (Intercom, Drift, Ada)",
                their_pitch: "AI-powered customer support at scale",
                weaknesses: [
                    "Channel: Text-only — can't handle phone calls",
                    "Demographics: Older customers and urgent issues go to phone",
                    "Complexity: Complex conversations fail in text",
                    "Volume: Phone calls represent 60-70% of support contacts for most businesses",
                    "Integration: Separate system from voice — no unified view"
                ],
                our_advantage: [
                    "Voice-first — handles the 60%+ of contacts that are phone calls",
                    "All demographics — phone is universal, chat is generational",
                    "Natural conversation — handles interruptions, tone, urgency",
                    "Unified analytics — voice + actions in one dashboard",
                    "Complementary — SmartFlow handles calls, their chatbot handles text"
                ],
                killer_question: "What percentage of your customer contacts are phone calls vs. text/chat?",
                landmine: "Position as complementary, not competitive. Cover the channel they can't."
            },
            {
                name: "Competing AI Voice (Bland.ai, Synthflow, Vapi)",
                their_pitch: "AI voice agents with developer-first APIs",
                weaknesses: [
                    "Developer-required: Need engineering to build and maintain",
                    "No business logic: Raw API — you build everything yourself",
                    "No dashboard: Limited analytics and management tools",
                    "Compliance: Limited enterprise security features",
                    "Support: Self-serve only, no customer success team"
                ],
                our_advantage: [
                    "No-code setup — configure in plain English, live in 60 seconds",
                    "Built-in business logic: appointments, complaints, transfers, CRM sync",
                    "Enterprise dashboard with real-time analytics",
                    "SOC 2 (in progress), HIPAA-ready, DPA, SLA guarantee",
                    "Dedicated customer success + solution engineering",
                    "White-label ready for multi-brand enterprises"
                ],
                killer_question: "Do you have engineering resources dedicated to building and maintaining voice AI infrastructure?",
                landmine: "Ask for their SOC 2 report, DPA, and SLA. Most don't have them."
            }
        ],
        objection_handling: [
            {
                objection: "AI can't handle our complex calls",
                response: "You're right — and we don't try to. SmartFlow handles tier-1 calls (appointments, FAQs, intake) which are 70-80% of volume. Complex calls transfer seamlessly to your team with full context. The result: your humans focus on what humans do best.",
                proof_point: "Our average auto-resolution rate is 78%. The remaining 22% are transferred with transcript, sentiment, and caller intent — your agents spend less time per complex call too."
            },
            {
                objection: "Our customers won't want to talk to AI",
                response: "94% of callers in our network don't realize they're speaking with AI. The voice is natural, it handles interruptions and pauses, and adapts its tone. But more importantly — they definitely don't want to be on hold for 5 minutes or get voicemail.",
                proof_point: "Average caller satisfaction across our platform is 4.7/5.0, compared to industry average of 3.8/5.0 for traditional call centers."
            },
            {
                objection: "We're locked into a contract with our current vendor",
                response: "We can run alongside your existing system in shadow mode — no disruption, no contract conflict. When your contract is up, you'll have real performance data to make the case. We also offer a 14-day free POC.",
                proof_point: "Many of our enterprise customers ran a 2-week parallel trial before switching."
            },
            {
                objection: "What about data security and compliance?",
                response: "We're SOC 2 audit-in-progress (completion Q3 2026), HIPAA-ready with BAA available, GDPR/CCPA compliant, and provide a full DPA and sub-processor registry. I can connect you with our security team today.",
                proof_point: "Full security whitepaper available. Annual third-party penetration testing. No PII sent to AI models."
            },
            {
                objection: "It's too expensive for the volume we handle",
                response: "Let's run the numbers. Our Enterprise plan is $499/month for 10,000 minutes. A single full-time agent costs $6,000+/month. Even if AI handles just 50% of your calls, the savings are substantial. Here's a custom ROI model...",
                proof_point: "Average customer sees ROI in under 30 days. Cost per handled minute: $0.05 vs. $0.30+ for human agents."
            },
            {
                objection: "We tried AI before and it didn't work",
                response: "Most previous 'AI' was really IVR with NLU slapped on top. SmartFlow is fundamentally different — it's a conversational AI that handles natural language, interruptions, and multi-turn dialog. The best way to see the difference: call our demo line right now.",
                proof_point: "Play a demo call recording. Let them experience the difference firsthand."
            }
        ]
    }
};

module.exports = ENTERPRISE_SALES_KIT;
