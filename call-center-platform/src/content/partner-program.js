/**
 * Partner & Reseller Program Design
 * 
 * Tier structure, economics, white-label matrix,
 * onboarding flow, and revenue share model.
 */

const PARTNER_PROGRAM = {

    // ═══════════════════════════════════════════════════
    // PROGRAM OVERVIEW
    // ═══════════════════════════════════════════════════
    overview: {
        name: "SmartFlow AI Partner Program",
        tagline: "Resell, white-label, or refer — earn recurring revenue on every customer.",
        program_types: [
            { type: "Referral", description: "Send us leads, earn commission on closed deals" },
            { type: "Reseller", description: "Sell SmartFlow under joint branding, manage customer relationship" },
            { type: "White-Label", description: "Rebrand SmartFlow as your own product, full white-label" }
        ]
    },

    // ═══════════════════════════════════════════════════
    // TIER STRUCTURE
    // ═══════════════════════════════════════════════════
    tiers: [
        {
            name: "Registered",
            type: "Referral",
            requirements: {
                application: "Online form",
                certification: "None",
                minimum_revenue: "None",
                minimum_customers: 0
            },
            benefits: {
                revenue_share: "15% of first-year revenue per referred customer",
                commission_type: "One-time",
                support: "Self-serve partner portal, email support",
                training: "On-demand product training videos",
                marketing: "Co-branded referral link, basic collateral",
                dedicated_manager: false,
                deal_registration: true,
                lead_protection_days: 30
            },
            economics: {
                example: "Refer a Starter customer ($49/mo) → earn $88.20 (15% × $588 first-year)",
                avg_partner_revenue: "$1,500-$3,000/year"
            }
        },
        {
            name: "Silver",
            type: "Reseller",
            requirements: {
                application: "Application + interview",
                certification: "SmartFlow Sales Certification (4-hour online course)",
                minimum_revenue: "$500/month managed ARR",
                minimum_customers: 5
            },
            benefits: {
                revenue_share: "20% recurring (paid monthly)",
                commission_type: "Recurring (lifetime of customer)",
                support: "Priority email + chat, partner Slack channel",
                training: "Certification program, quarterly product briefings",
                marketing: "Co-branded collateral, joint case studies, partner badge",
                dedicated_manager: false,
                deal_registration: true,
                lead_protection_days: 60,
                wholesale_discount: "10% off list price for resale"
            },
            economics: {
                example: "Manage 10 Pro customers ($149/mo each) → earn $3,576/year recurring",
                avg_partner_revenue: "$5,000-$15,000/year"
            }
        },
        {
            name: "Gold",
            type: "Reseller + White-Label",
            requirements: {
                application: "Application + business review",
                certification: "SmartFlow Sales + Technical Certification (8 hours)",
                minimum_revenue: "$2,500/month managed ARR",
                minimum_customers: 20
            },
            benefits: {
                revenue_share: "25% recurring (paid monthly)",
                commission_type: "Recurring (lifetime of customer)",
                support: "Dedicated Partner Manager, phone support, escalation SLA",
                training: "Advanced certification, early access to features, advisory board seat",
                marketing: "Custom landing pages, joint webinars, conference co-sponsorship, MDF ($1K/quarter)",
                dedicated_manager: true,
                deal_registration: true,
                lead_protection_days: 90,
                wholesale_discount: "15% off list price for resale",
                white_label_available: true,
                white_label_fee: "$500/month platform fee"
            },
            economics: {
                example: "Manage 30 customers (mixed plans) at $150 avg/mo → earn $13,500/year recurring + white-label revenue",
                avg_partner_revenue: "$20,000-$60,000/year"
            }
        },
        {
            name: "Platinum",
            type: "Strategic White-Label",
            requirements: {
                application: "Executive sponsor + strategic alignment review",
                certification: "Full SmartFlow certification suite",
                minimum_revenue: "$10,000/month managed ARR",
                minimum_customers: 50
            },
            benefits: {
                revenue_share: "30% recurring (paid monthly)",
                commission_type: "Recurring (lifetime of customer)",
                support: "Named Solution Engineer, 24/7 support, custom SLA",
                training: "On-site training, custom playbooks, product roadmap input",
                marketing: "Joint GTM strategy, co-selling, event sponsorship, MDF ($5K/quarter)",
                dedicated_manager: true,
                deal_registration: true,
                lead_protection_days: 120,
                wholesale_discount: "20% off list price for resale",
                white_label_available: true,
                white_label_fee: "Waived (included in volume)",
                api_access: "Full API with custom endpoints",
                custom_features: "Feature requests prioritized"
            },
            economics: {
                example: "Manage 100+ customers at $200 avg/mo → earn $72,000/year recurring",
                avg_partner_revenue: "$50,000-$200,000/year"
            }
        }
    ],

    // ═══════════════════════════════════════════════════
    // WHITE-LABEL CAPABILITY MATRIX
    // ═══════════════════════════════════════════════════
    white_label: {
        title: "White-Label Capability Matrix",
        description: "What can be rebranded and customized per tier.",
        capabilities: [
            { capability: "Dashboard branding (logo, colors)", registered: false, silver: false, gold: true, platinum: true },
            { capability: "Custom domain (partner.yourcompany.com)", registered: false, silver: false, gold: true, platinum: true },
            { capability: "Custom SSL certificate", registered: false, silver: false, gold: true, platinum: true },
            { capability: "Email templates (from your domain)", registered: false, silver: false, gold: true, platinum: true },
            { capability: "AI agent persona (partner's brand voice)", registered: false, silver: false, gold: true, platinum: true },
            { capability: "Customer-facing portal (no SmartFlow mention)", registered: false, silver: false, gold: true, platinum: true },
            { capability: "API responses (white-labeled)", registered: false, silver: false, gold: false, platinum: true },
            { capability: "Custom billing portal", registered: false, silver: false, gold: false, platinum: true },
            { capability: "Admin dashboard (fully rebrandable)", registered: false, silver: false, gold: false, platinum: true },
            { capability: "Custom feature development", registered: false, silver: false, gold: false, platinum: true },
            { capability: "Sub-tenant management (partner manages their customers)", registered: false, silver: true, gold: true, platinum: true },
            { capability: "Partner analytics dashboard", registered: false, silver: true, gold: true, platinum: true },
            { capability: "Co-branded collateral", registered: true, silver: true, gold: true, platinum: true }
        ]
    },

    // ═══════════════════════════════════════════════════
    // PARTNER ONBOARDING FLOW
    // ═══════════════════════════════════════════════════
    onboarding: {
        title: "Partner Onboarding — 14-Day Activation",
        phases: [
            {
                phase: "Day 1-3: Application & Approval",
                steps: [
                    "Partner submits application with business profile and target market",
                    "SmartFlow partner team reviews (SLA: 48 hours)",
                    "Approval notification + welcome email with portal access",
                    "Partner Agreement signed (DocuSign)"
                ]
            },
            {
                phase: "Day 4-7: Training & Certification",
                steps: [
                    "Access online training portal (self-paced, 4-8 hours depending on tier)",
                    "Complete product demo: core features, pricing, common objections",
                    "Complete sales certification exam (80% pass rate required)",
                    "Technical certification for Gold+: integration setup, troubleshooting basics",
                    "Receive partner badge and co-branded materials"
                ]
            },
            {
                phase: "Day 8-10: Go-to-Market Prep",
                steps: [
                    "Set up partner portal with referral/deal registration links",
                    "Configure white-label settings (Gold+ tiers)",
                    "Create first 5 prospect targets with ICP scoring",
                    "Schedule kick-off call with Partner Manager (Silver+ tiers)",
                    "Receive sales playbook customized to partner's target market"
                ]
            },
            {
                phase: "Day 11-14: First Deal Support",
                steps: [
                    "Launch first outreach campaign (using provided templates)",
                    "Register first deal in partner portal",
                    "Joint call support available for first 3 prospect meetings",
                    "Commission tracking activated in partner dashboard",
                    "Monthly check-in cadence established"
                ]
            }
        ],
        success_metrics_30_day: [
            "Certification completed",
            "≥ 5 deals registered",
            "≥ 1 prospect meeting completed",
            "≥ 1 POC or trial initiated"
        ]
    },

    // ═══════════════════════════════════════════════════
    // REVENUE SHARE MODEL
    // ═══════════════════════════════════════════════════
    revenue_model: {
        title: "Partner Revenue Share — Detailed Economics",
        payout_schedule: "Monthly, NET 30, via ACH/wire transfer",
        minimum_payout: "$100 (rolls over if below threshold)",
        currency: "USD",
        models: {
            referral: {
                name: "Referral Commission",
                structure: "15% of first-year revenue",
                payout: "50% on close, 50% at 6-month retention mark",
                clawback: "If customer cancels within 90 days, second payout withheld",
                example_table: [
                    { plan: "Starter ($49/mo)", first_year: "$588", commission: "$88.20" },
                    { plan: "Pro ($149/mo)", first_year: "$1,788", commission: "$268.20" },
                    { plan: "Enterprise ($499/mo)", first_year: "$5,988", commission: "$898.20" },
                    { plan: "Custom ($2,000/mo)", first_year: "$24,000", commission: "$3,600.00" }
                ]
            },
            reseller: {
                name: "Reseller Recurring",
                structure: "20-30% of monthly recurring revenue (tier-dependent)",
                payout: "Monthly, based on paid invoices",
                clawback: "None — if customer doesn't pay, commission not earned that month",
                example_table: [
                    { tier: "Silver (20%)", customer_mrr: "$149", partner_monthly: "$29.80", partner_annual: "$357.60" },
                    { tier: "Gold (25%)", customer_mrr: "$149", partner_monthly: "$37.25", partner_annual: "$447.00" },
                    { tier: "Platinum (30%)", customer_mrr: "$149", partner_monthly: "$44.70", partner_annual: "$536.40" }
                ],
                note: "Overage revenue is included in commission calculation at the same rate."
            },
            white_label: {
                name: "White-Label Margin",
                structure: "Partner sets their own price above wholesale. Keep 100% of margin.",
                wholesale_pricing: [
                    { plan: "Starter", wholesale: "$39/mo (20% off)", partner_sells_at: "$59-79/mo", partner_keeps: "$20-40/mo" },
                    { plan: "Pro", wholesale: "$119/mo (20% off)", partner_sells_at: "$199-249/mo", partner_keeps: "$80-130/mo" },
                    { plan: "Enterprise", wholesale: "$399/mo (20% off)", partner_sells_at: "$699-999/mo", partner_keeps: "$300-600/mo" }
                ],
                note: "Plus 25-30% revenue share on wholesale price. White-label partners potentially earn 2-3x standard reseller."
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // IDEAL PARTNER PROFILES
    // ═══════════════════════════════════════════════════
    ideal_partners: [
        {
            type: "IT Managed Service Providers (MSPs)",
            why: "Already manage SMB tech stacks, trusted advisor role, recurring revenue model alignment",
            offer: "Add voice AI to service packages, upsell to existing clients",
            expected_tier: "Silver → Gold"
        },
        {
            type: "Telecom / VoIP Providers",
            why: "Own the phone channel, looking for AI value-add, existing telephony integration",
            offer: "White-label SmartFlow as 'AI Assistant' add-on to their voice packages",
            expected_tier: "Gold → Platinum"
        },
        {
            type: "CRM / SaaS Vendors",
            why: "Complementary product, want to offer voice channel, shared customer base",
            offer: "Integrate SmartFlow as embedded voice AI within their platform",
            expected_tier: "Gold → Platinum"
        },
        {
            type: "Marketing / Digital Agencies",
            why: "Manage client communications, want to offer next-gen tools, recurring revenue appeal",
            offer: "Bundle SmartFlow with marketing services (SEO + AI receptionist)",
            expected_tier: "Registered → Silver"
        },
        {
            type: "Industry Consultants",
            why: "Deep industry expertise, trusted by buyers, referral-ready",
            offer: "Referral fees on deals sourced from advisory relationships",
            expected_tier: "Registered"
        }
    ]
};

module.exports = PARTNER_PROGRAM;
