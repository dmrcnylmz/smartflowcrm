/**
 * Deal Desk & Pricing Guardrails
 * 
 * Discount authority matrix, enterprise pricing tiers,
 * custom deal approval flow, and contract terms framework.
 */

const DEAL_DESK = {

    // ═══════════════════════════════════════════════════
    // STANDARD PRICING
    // ═══════════════════════════════════════════════════
    standard_pricing: {
        title: "Standard Plan Pricing — Do Not Discount Below Floor",
        plans: [
            {
                name: "Starter",
                list_monthly: 49,
                list_annual: 39,
                floor_monthly: 39,
                floor_annual: 29,
                included_minutes: 500,
                overage_rate: 0.12,
                overage_floor: 0.09,
                max_agents: 5,
                max_concurrent: 3
            },
            {
                name: "Pro",
                list_monthly: 149,
                list_annual: 119,
                floor_monthly: 119,
                floor_annual: 89,
                included_minutes: 2000,
                overage_rate: 0.08,
                overage_floor: 0.06,
                max_agents: 20,
                max_concurrent: 10
            },
            {
                name: "Enterprise",
                list_monthly: 499,
                list_annual: 399,
                floor_monthly: 399,
                floor_annual: 299,
                included_minutes: 10000,
                overage_rate: 0.05,
                overage_floor: 0.03,
                max_agents: -1,
                max_concurrent: 50
            }
        ],
        note: "Annual billing = 20% discount. This is the ONLY standard discount. Stack promotions are prohibited."
    },

    // ═══════════════════════════════════════════════════
    // ENTERPRISE CUSTOM PRICING TIERS
    // ═══════════════════════════════════════════════════
    enterprise_pricing: {
        title: "Enterprise Custom Pricing — Volume-Based",
        description: "For accounts exceeding 10,000 minutes/month. All quotes require Deal Desk approval.",
        tiers: [
            {
                name: "Enterprise Standard",
                monthly_minutes: "10,001 — 25,000",
                base_fee: "$499-999/mo",
                per_minute: "$0.04-0.05",
                committed: false,
                contract_term: "1 year",
                sla: "99.5%",
                support: "Priority email + chat"
            },
            {
                name: "Enterprise Plus",
                monthly_minutes: "25,001 — 50,000",
                base_fee: "$999-1,999/mo",
                per_minute: "$0.035-0.04",
                committed: true,
                contract_term: "1-2 years",
                sla: "99.9%",
                support: "Dedicated CSM + phone support"
            },
            {
                name: "Enterprise Premium",
                monthly_minutes: "50,001 — 150,000",
                base_fee: "$1,999-4,999/mo",
                per_minute: "$0.025-0.035",
                committed: true,
                contract_term: "2-3 years",
                sla: "99.95%",
                support: "Named SE + CSM, quarterly business reviews"
            },
            {
                name: "Strategic",
                monthly_minutes: "150,000+",
                base_fee: "Custom",
                per_minute: "$0.02-0.025",
                committed: true,
                contract_term: "3 years",
                sla: "99.99%",
                support: "Dedicated team, custom SLA, executive sponsor"
            }
        ],
        commitment_discounts: {
            "1_year": "Standard pricing",
            "2_year": "Additional 10% off per-minute rate",
            "3_year": "Additional 15% off per-minute rate + dedicated infrastructure"
        }
    },

    // ═══════════════════════════════════════════════════
    // DISCOUNT AUTHORITY MATRIX
    // ═══════════════════════════════════════════════════
    discount_authority: {
        title: "Discount Authority Matrix",
        description: "Who can approve what level of discount. Dollar thresholds are monthly values.",
        matrix: [
            {
                approver: "Account Executive (AE)",
                max_discount_pct: 10,
                max_deal_value_monthly: 499,
                can_approve: [
                    "Annual billing discount (standard 20%)",
                    "1 free month on annual commitment",
                    "Extended trial (up to 14 days)"
                ],
                cannot_approve: [
                    "Any discount below floor price",
                    "Custom SLA terms",
                    "Non-standard payment terms"
                ]
            },
            {
                approver: "Sales Manager",
                max_discount_pct: 20,
                max_deal_value_monthly: 1999,
                can_approve: [
                    "Everything AE can approve",
                    "Starter/Pro at floor price",
                    "2 free months on multi-year commitment",
                    "Custom overage rate (above overage floor)",
                    "Extended POC (up to 30 days)"
                ],
                cannot_approve: [
                    "Enterprise below floor price",
                    "Custom contractual terms",
                    "Non-standard SLA"
                ]
            },
            {
                approver: "VP Sales",
                max_discount_pct: 30,
                max_deal_value_monthly: 4999,
                can_approve: [
                    "Everything Sales Manager can approve",
                    "Enterprise at floor price",
                    "Custom minute bundles",
                    "Non-standard payment terms (NET 45)",
                    "Custom SLA (down to 99.9%)",
                    "White-label fee waiver"
                ],
                cannot_approve: [
                    "Below floor pricing on any plan",
                    "Custom legal terms (indemnification, liability caps)",
                    "Multi-year guarantees on pricing"
                ]
            },
            {
                approver: "CEO / Deal Desk Committee",
                max_discount_pct: 40,
                max_deal_value_monthly: "Unlimited",
                can_approve: [
                    "Any pricing structure",
                    "Below-floor pricing (documented justification required)",
                    "Custom legal terms",
                    "Multi-year price locks",
                    "Revenue share / usage-based custom models",
                    "Strategic deals with equity/partnership component"
                ],
                review_process: "Requires written business case with: (1) deal size, (2) strategic value, (3) competitive pressure, (4) expected LTV, (5) margin analysis"
            }
        ],
        rules: {
            never_allowed: [
                "Discounting to $0 (free tiers beyond trial are prohibited)",
                "Reducing overage rate below $0.02/min (below COGS)",
                "Lifetime deals or one-time payment for perpetual access",
                "Backdating discounts to previous billing periods",
                "Verbal pricing promises without Deal Desk approval"
            ],
            always_allowed: [
                "Standard annual billing discount (20%)",
                "3-day free trial (100 minutes, no credit card)",
                "14-day POC for qualified enterprise prospects",
                "Partner wholesale pricing (per partner agreement)"
            ]
        }
    },

    // ═══════════════════════════════════════════════════
    // CUSTOM DEAL APPROVAL FLOW
    // ═══════════════════════════════════════════════════
    approval_flow: {
        title: "Deal Desk Approval Process",
        steps: [
            {
                step: 1,
                action: "AE submits deal request in CRM",
                fields: [
                    "Customer name and ICP tier",
                    "Proposed plan and pricing",
                    "Discount requested (% and $)",
                    "Contract term (months)",
                    "Competitive situation",
                    "Champion and EB identified",
                    "Expected close date",
                    "Strategic justification (if non-standard)"
                ],
                sla: "Immediate (system routes to correct approver)"
            },
            {
                step: 2,
                action: "Auto-routing based on discount level",
                routing: {
                    "0-10% discount, ≤$499/mo": "Auto-approved (AE authority)",
                    "10-20% discount, ≤$1,999/mo": "Routed to Sales Manager",
                    "20-30% discount, ≤$4,999/mo": "Routed to VP Sales",
                    "30%+ discount or below-floor": "Routed to Deal Desk Committee"
                },
                sla: "Automatic"
            },
            {
                step: 3,
                action: "Approver reviews and decides",
                options: [
                    "Approve as submitted",
                    "Approve with modifications (counter-offer)",
                    "Reject with reason",
                    "Escalate to next level"
                ],
                sla: {
                    sales_manager: "4 business hours",
                    vp_sales: "1 business day",
                    deal_desk_committee: "2 business days"
                }
            },
            {
                step: 4,
                action: "AE communicates approved pricing to prospect",
                requirements: [
                    "Use Deal Desk-approved quote (PDF generated from system)",
                    "Quote valid for 30 days",
                    "Any modifications require re-approval",
                    "Quote must include standard terms reference"
                ]
            },
            {
                step: 5,
                action: "Contract execution",
                process: [
                    "Standard MSA: SmartFlow template (usually 2-3 day turnaround)",
                    "Custom terms: Legal review required (add 5-10 business days)",
                    "Security review: Provide whitepaper + DPA + subprocessors (pre-packaged)",
                    "Signature: DocuSign, countersigned by authorized SmartFlow signatory"
                ]
            }
        ],
        escalation: "Any deal not approved within SLA auto-escalates to next level. VP Sales has final authority on all deals under $5K/month."
    },

    // ═══════════════════════════════════════════════════
    // CONTRACT TERMS FRAMEWORK
    // ═══════════════════════════════════════════════════
    contract_terms: {
        title: "Standard Commercial Terms",
        terms: {
            contract_length: {
                standard: "Month-to-month (no commitment)",
                annual: "12 months (20% discount)",
                enterprise: "12-36 months (volume pricing)",
                auto_renewal: "Annual and multi-year contracts auto-renew for 1-year terms. 60-day written cancellation notice required."
            },
            payment: {
                method: "Credit card (self-serve), ACH / wire (enterprise)",
                frequency: "Monthly in advance (subscription) + monthly in arrears (overage)",
                terms: {
                    self_serve: "Due on billing date, auto-charged",
                    enterprise_standard: "NET 30",
                    enterprise_custom: "NET 45 (VP Sales approval)",
                    government: "NET 60 (Deal Desk approval)"
                },
                late_payment: "1.5% monthly interest after 30 days past due. Service suspension after 60 days."
            },
            sla: {
                starter: { uptime: "99.5%", support_response: "24 business hours", credit: "5% per 0.1% below SLA" },
                pro: { uptime: "99.5%", support_response: "8 business hours", credit: "5% per 0.1% below SLA" },
                enterprise: { uptime: "99.9%", support_response: "1 hour (critical), 4 hours (high)", credit: "10% per 0.1% below SLA, capped at 30% monthly fee" },
                custom: { uptime: "Up to 99.99%", support_response: "Negotiable", credit: "Negotiable (Deal Desk)" }
            },
            liability: {
                standard: "Aggregate liability capped at 12 months of fees paid",
                enterprise: "Negotiable up to 24 months (VP Sales approval)",
                excluded: "Indirect, consequential, punitive damages excluded",
                indemnification: "SmartFlow indemnifies for IP infringement, data breaches caused by SmartFlow negligence"
            },
            data: {
                ownership: "Customer owns all customer data. SmartFlow has limited license to process for service delivery.",
                portability: "JSON/CSV export available at any time via API",
                retention_post_termination: "90 days, then cryptographic deletion with written certification",
                dpa: "Standard DPA included. Custom DPA available (Legal review required)."
            },
            termination: {
                month_to_month: "Cancel anytime, effective end of current billing period",
                annual: "60-day written notice before renewal date",
                for_cause: "Either party, 30-day cure period for material breach",
                convenience_enterprise: "Allowed with payment of remaining commitment (or 3 months, whichever is less)"
            }
        },
        non_negotiable: [
            "SmartFlow retains right to anonymized, aggregated analytics for product improvement",
            "Customer must comply with applicable laws regarding call recording consent",
            "SmartFlow may update pricing with 90 days notice (annual contracts locked for term)",
            "Governing law: State of Delaware, USA (standard) or customer's jurisdiction (enterprise negotiable)"
        ]
    }
};

module.exports = DEAL_DESK;
