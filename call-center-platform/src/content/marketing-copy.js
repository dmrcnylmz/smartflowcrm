/**
 * Marketing Website Copy — AI Voice Call Center
 * 
 * Conversion-focused, self-serve-first landing page content.
 * All pricing in minutes. Trial = 3 days, 100 minutes, no credit card.
 * 
 * Export each section as a content object for CMS or static rendering.
 */

const MARKETING_COPY = {

    // ═══════════════════════════════════════════════════
    // HERO SECTION
    // ═══════════════════════════════════════════════════
    hero: {
        headline: "Your AI call center. Live in 60 seconds.",
        subheadline: "Answer every customer call with an AI agent that sounds human, resolves issues instantly, and costs 90% less than a traditional call center.",
        cta_primary: { text: "Start Free — 100 Minutes Free", url: "/signup" },
        cta_secondary: { text: "Watch 2-Min Demo", url: "#demo" },
        social_proof_bar: "Trusted by 200+ businesses  •  1M+ calls handled  •  4.9/5 customer satisfaction",
        trust_badges: ["SOC 2 Compliant", "HIPAA Ready", "99.9% Uptime SLA"],
    },

    // ═══════════════════════════════════════════════════
    // PROBLEM → SOLUTION
    // ═══════════════════════════════════════════════════
    problem_solution: {
        section_title: "Stop losing customers to voicemail",
        problems: [
            {
                icon: "phone-missed",
                stat: "62%",
                text: "of callers hang up if they hit hold or voicemail — and never call back."
            },
            {
                icon: "dollar-sign",
                stat: "$25-40/hr",
                text: "per agent, plus training, turnover, and management overhead."
            },
            {
                icon: "clock",
                stat: "9-5 only",
                text: "Customers call at 11pm. Your team answers at 9am Monday."
            }
        ],
        solution_headline: "One AI agent. Every call. 24/7.",
        solution_text: "Our AI answers in under 1 second, handles appointments, complaints, FAQs, transfers, and follow-ups — in natural conversation. No scripts. No hold music. No missed revenue."
    },

    // ═══════════════════════════════════════════════════
    // HOW IT WORKS
    // ═══════════════════════════════════════════════════
    how_it_works: {
        section_title: "Live in 3 steps. No engineering required.",
        steps: [
            {
                number: 1,
                title: "Sign up & get your number",
                description: "Create your account in 30 seconds. We provision a local or toll-free number instantly.",
                time: "30 sec"
            },
            {
                number: 2,
                title: "Configure your AI agent",
                description: "Tell your agent what your business does, how to handle calls, and where to book appointments. Plain English — no code.",
                time: "5 min"
            },
            {
                number: 3,
                title: "Forward your calls",
                description: "Point your existing business number to us, or use the new number directly. AI answers every call from here.",
                time: "1 min"
            }
        ],
        bottom_cta: { text: "Get Your AI Agent Now", url: "/signup" }
    },

    // ═══════════════════════════════════════════════════
    // FEATURE SHOWCASE
    // ═══════════════════════════════════════════════════
    features: {
        section_title: "Everything a call center needs. Nothing it doesn't.",
        categories: [
            {
                name: "AI Conversations",
                features: [
                    { title: "Natural voice", description: "Sounds human. Understands context, handles interruptions, adapts tone." },
                    { title: "Multi-language", description: "English, Spanish, French, German — auto-detects caller's language." },
                    { title: "Intent routing", description: "Appointment? Complaint? Transfer? AI routes in real-time without menu trees." },
                    { title: "Custom personas", description: "Set your agent's name, personality, and knowledge base." }
                ]
            },
            {
                name: "Business Operations",
                features: [
                    { title: "Appointment booking", description: "Connects to Google Calendar, Calendly, or your custom system." },
                    { title: "CRM integration", description: "Every call logged with transcript, sentiment, and follow-up actions." },
                    { title: "Smart transfers", description: "AI hands off to a human when it detects complexity or caller frustration." },
                    { title: "Post-call actions", description: "Auto-sends confirmation SMS, creates tickets, updates records." }
                ]
            },
            {
                name: "Analytics & Compliance",
                features: [
                    { title: "Live dashboard", description: "Call volume, resolution rate, avg handle time, sentiment — real-time." },
                    { title: "Call recordings", description: "Every call recorded and transcribed for compliance and coaching." },
                    { title: "Usage tracking", description: "Minutes used, minutes remaining, overage charges — all transparent." },
                    { title: "API access", description: "Full REST API for custom integrations (Pro & Enterprise)." }
                ]
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // PRICING
    // ═══════════════════════════════════════════════════
    pricing: {
        section_title: "Simple, transparent pricing",
        subtitle: "Pay for minutes, not seats. No hidden fees. No contracts.",
        trial_banner: {
            text: "Start free — 100 minutes, full features, no credit card",
            subtext: "3-day trial. Set up in 60 seconds."
        },
        plans: [
            {
                name: "Starter",
                price: "$49",
                period: "/month",
                annual_price: "$39/mo billed yearly",
                tagline: "For small businesses getting started",
                included_minutes: 500,
                overage: "$0.12/min",
                highlights: [
                    "500 minutes/month included",
                    "Up to 5 agents",
                    "3 concurrent calls",
                    "Call recording",
                    "Basic analytics",
                    "Email support"
                ],
                cta: "Start Free Trial",
                popular: false
            },
            {
                name: "Pro",
                price: "$149",
                period: "/month",
                annual_price: "$119/mo billed yearly",
                tagline: "For growing teams with higher volume",
                included_minutes: 2000,
                overage: "$0.08/min",
                highlights: [
                    "2,000 minutes/month included",
                    "Up to 20 agents",
                    "10 concurrent calls",
                    "Advanced analytics",
                    "API access",
                    "Priority support"
                ],
                cta: "Start Free Trial",
                popular: true
            },
            {
                name: "Enterprise",
                price: "$499",
                period: "/month",
                annual_price: "$399/mo billed yearly",
                tagline: "For organizations with complex needs",
                included_minutes: 10000,
                overage: "$0.05/min",
                highlights: [
                    "10,000 minutes/month included",
                    "Unlimited agents",
                    "50 concurrent calls",
                    "Custom integrations",
                    "SLA guarantee (99.9%)",
                    "Dedicated success manager"
                ],
                cta: "Start Free Trial",
                popular: false
            }
        ],
        faq_pricing: [
            { q: "What happens when I exceed my included minutes?", a: "Overage minutes are billed at the per-minute rate for your plan. You'll always see your usage in real-time on your dashboard — no surprises." },
            { q: "Can I change plans anytime?", a: "Yes. Upgrades are prorated immediately. Downgrades take effect at the next billing cycle." },
            { q: "What's included in the free trial?", a: "100 minutes, all features, 3 days. No credit card required. Set up in 60 seconds." },
            { q: "Do you offer annual discounts?", a: "Yes — save 20% with annual billing on any plan." }
        ]
    },

    // ═══════════════════════════════════════════════════
    // SOCIAL PROOF
    // ═══════════════════════════════════════════════════
    social_proof: {
        section_title: "Businesses like yours, answering every call",
        testimonials: [
            {
                quote: "We went from missing 40% of calls to answering 100%. Our appointment bookings doubled in the first month.",
                name: "Sarah Chen",
                title: "Owner, Bright Dental Group",
                industry: "Healthcare",
                metric: "2x appointments"
            },
            {
                quote: "The AI handles 80% of our calls end-to-end. My team focuses on complex cases instead of repeating the same answers.",
                name: "Marcus Johnson",
                title: "Operations Director, Metro Property Management",
                industry: "Real Estate",
                metric: "80% auto-resolved"
            },
            {
                quote: "We replaced a 3-person call center for a fraction of the cost. The quality of conversations actually went up.",
                name: "Diana Torres",
                title: "CEO, QuickServ Auto",
                industry: "Automotive",
                metric: "90% cost reduction"
            }
        ],
        logos_headline: "Trusted by teams at",
        case_study_cta: { text: "Read Customer Stories →", url: "/customers" }
    },

    // ═══════════════════════════════════════════════════
    // FAQ
    // ═══════════════════════════════════════════════════
    faq: {
        section_title: "Frequently asked questions",
        items: [
            { q: "Does the AI really sound human?", a: "Yes. We use state-of-the-art voice synthesis with natural pacing, breathing, and tone variation. Most callers don't realize they're speaking with AI." },
            { q: "Can I customize what the AI says?", a: "Absolutely. You define your agent's persona, knowledge base, and handling rules in plain English. No coding required." },
            { q: "What if the caller needs a human?", a: "The AI detects when a human is needed — complex issues, frustrated callers, or specific requests — and transfers seamlessly to your team." },
            { q: "How fast is setup?", a: "Under 60 seconds to your first test call. Full configuration with your business details takes about 5 minutes." },
            { q: "Is my data secure?", a: "SOC 2 compliant infrastructure. All calls encrypted in transit and at rest. HIPAA-ready for healthcare businesses." },
            { q: "Can I keep my existing phone number?", a: "Yes. Forward your current business number to us, or we'll provision a new local or toll-free number." },
            { q: "What integrations do you support?", a: "Google Calendar, Calendly, HubSpot, Salesforce, custom webhooks, and full REST API on Pro and Enterprise plans." },
            { q: "Is there a contract or commitment?", a: "No contracts. Month-to-month billing. Cancel anytime from your dashboard." }
        ]
    },

    // ═══════════════════════════════════════════════════
    // FINAL CTA
    // ═══════════════════════════════════════════════════
    final_cta: {
        headline: "Your customers are calling. Let AI answer.",
        subheadline: "100 free minutes. Full features. No credit card. Live in 60 seconds.",
        cta: { text: "Start Your Free Trial", url: "/signup" },
        guarantee: "No credit card required  •  Cancel anytime  •  Setup in 60 seconds"
    },

    // ═══════════════════════════════════════════════════
    // SEO METADATA
    // ═══════════════════════════════════════════════════
    seo: {
        title: "AI Voice Call Center — Answer Every Call, 24/7 | SmartFlow",
        description: "Replace your call center with AI that sounds human. Handles appointments, complaints, FAQs, and transfers. 100 free minutes. Setup in 60 seconds.",
        keywords: ["AI call center", "voice AI", "automated phone answering", "virtual receptionist", "AI phone agent", "call center automation"],
        og_title: "Your AI Call Center. Live in 60 Seconds.",
        og_description: "Answer every customer call with AI. 90% cheaper than traditional call centers. Start free — 100 minutes, no credit card."
    }
};

module.exports = MARKETING_COPY;
