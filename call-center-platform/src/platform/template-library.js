/**
 * Vertical AI Template Library
 * 
 * Template schema, 8 industry verticals with deep configs,
 * customization API, and template marketplace integration.
 */

const TEMPLATE_LIBRARY = {

    // ═══════════════════════════════════════════════════
    // TEMPLATE SCHEMA
    // ═══════════════════════════════════════════════════
    template_schema: {
        spec_version: "1.0",
        description: "A template is a pre-configured AI agent + workflows + integrations bundle for a specific industry vertical.",
        schema: {
            id: { type: "string", format: "tmpl_{{vertical}}_{{variant}}", example: "tmpl_healthcare_dental" },
            name: { type: "string", description: "Display name", example: "Dental Practice Receptionist" },
            version: { type: "semver", example: "1.2.0" },
            vertical: { type: "string", enum: ["healthcare", "real_estate", "automotive", "legal", "insurance", "hospitality", "home_services", "professional_services"] },
            description: { type: "string", max: 300 },
            long_description: { type: "markdown" },
            thumbnail: { type: "url", description: "Preview image (512×512)" },
            author: { type: "string", description: "SmartFlow or third-party developer" },
            pricing: { type: "string", enum: ["free", "pro_required", "enterprise_required", "paid"] },
            tags: { type: "array", example: ["dental", "appointments", "reminders", "multi-language"] },
            popularity: { type: "object", properties: { installs: "number", rating: "number (1-5)", reviews: "number" } },
            components: {
                agent_config: {
                    greeting: "string",
                    persona: "string",
                    language: "string[]",
                    capabilities: "string[]",
                    knowledge_base: "Array of Q&A pairs or document references",
                    transfer_triggers: "string[]",
                    business_hours: "object",
                    voicemail_message: "string"
                },
                workflows: "Array of workflow definitions (see workflow-builder schema)",
                integrations: "Array of required/optional plugin IDs",
                sample_data: {
                    faq_entries: "Pre-loaded FAQ items",
                    appointment_types: "Pre-configured appointment categories",
                    custom_intents: "Industry-specific intents beyond defaults"
                },
                dashboard_config: {
                    widgets: "Pre-configured dashboard widgets for the vertical",
                    kpis: "Key metrics to track for this industry"
                }
            },
            customization: {
                required_fields: "Fields the user MUST fill in (company name, phone, hours)",
                optional_fields: "Fields the user CAN customize (greeting, persona tone)",
                locked_fields: "Fields that cannot be changed (core AI logic)"
            },
            metadata: {
                created_at: "ISO 8601",
                updated_at: "ISO 8601",
                compatible_plans: ["starter", "pro", "enterprise"],
                estimated_setup_time: "string (e.g., '5 minutes')"
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // 8 INDUSTRY VERTICALS
    // ═══════════════════════════════════════════════════
    verticals: [
        {
            vertical: "healthcare",
            templates: [
                {
                    id: "tmpl_healthcare_dental",
                    name: "Dental Practice Receptionist",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        greeting: "Thank you for calling {{practice_name}}. How can I help you today?",
                        persona: "Warm, professional, calm. Uses simple language. HIPAA-aware responses.",
                        capabilities: ["appointment_booking", "appointment_rescheduling", "insurance_verification_intake", "office_hours_info", "emergency_routing", "new_patient_intake"],
                        transfer_triggers: ["dental emergency", "severe pain", "billing dispute", "insurance claim issue", "speak to dentist"],
                        knowledge_base: [
                            { q: "Do you accept my insurance?", a: "We accept most major dental insurance plans including Delta Dental, Cigna, Aetna, and MetLife. I can verify your specific coverage — may I have your insurance ID?" },
                            { q: "What are your hours?", a: "We're open {{hours}}. For dental emergencies outside office hours, please call our emergency line at {{emergency_number}}." },
                            { q: "How much does a cleaning cost?", a: "A routine cleaning and exam is typically ${{cleaning_price}} without insurance. With insurance, your copay depends on your plan. Shall I schedule a visit?" }
                        ],
                        appointment_types: [
                            { name: "New Patient Exam", duration: 60, buffer: 15 },
                            { name: "Routine Cleaning", duration: 45, buffer: 10 },
                            { name: "Emergency Visit", duration: 30, buffer: 5 },
                            { name: "Cosmetic Consultation", duration: 30, buffer: 10 }
                        ]
                    },
                    workflows: [
                        { name: "New Patient Welcome", trigger: "appointment.created (type=new_patient)", actions: "Send welcome email → SMS confirmation → Pre-visit forms link" },
                        { name: "Appointment Reminder", trigger: "schedule (24h before appointment)", actions: "SMS reminder → Confirm/reschedule option" },
                        { name: "Insurance Verification", trigger: "appointment.created", actions: "Queue insurance check → Update patient record → Notify front desk" }
                    ],
                    integrations: ["google_calendar", "dentrix_connector", "sms_reminders"],
                    kpis: ["appointments_booked", "no_show_rate", "new_patient_conversion", "insurance_verification_rate"]
                },
                {
                    id: "tmpl_healthcare_clinic",
                    name: "Medical Clinic Receptionist",
                    pricing: "free",
                    setup_time: "10 minutes",
                    agent: {
                        greeting: "Thank you for calling {{clinic_name}}. This is our AI assistant. How may I help you?",
                        persona: "Professional, empathetic, HIPAA-compliant. Never gives medical advice.",
                        capabilities: ["appointment_booking", "prescription_refill_request", "lab_results_callback", "provider_availability", "new_patient_registration", "insurance_intake"],
                        transfer_triggers: ["medical emergency", "chest pain", "difficulty breathing", "speak to nurse", "medication question", "lab results"]
                    }
                }
            ]
        },
        {
            vertical: "real_estate",
            templates: [
                {
                    id: "tmpl_realestate_property_mgmt",
                    name: "Property Management Office",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        greeting: "Thank you for calling {{company_name}} Property Management. How may I assist you?",
                        persona: "Helpful, efficient, solution-oriented. Understands urgency of maintenance issues.",
                        capabilities: ["maintenance_request", "rent_payment_info", "leasing_inquiry", "showing_scheduling", "emergency_maintenance", "move_in_out_scheduling"],
                        transfer_triggers: ["flooding", "fire", "gas leak", "lockout", "legal question", "eviction"],
                        knowledge_base: [
                            { q: "How do I submit a maintenance request?", a: "I can submit a maintenance request for you right now. Can you describe the issue and tell me which unit you're in?" },
                            { q: "When is rent due?", a: "Rent is due on the {{rent_due_day}} of each month. A late fee of ${{late_fee}} applies after the {{grace_period_day}}." }
                        ]
                    },
                    workflows: [
                        { name: "Emergency Maintenance", trigger: "call.completed (intent=emergency_maintenance)", actions: "Create urgent ticket → Notify on-call tech → SMS tenant confirmation" },
                        { name: "Showing Scheduler", trigger: "call.completed (intent=leasing_inquiry)", actions: "Check availability → Book showing → Send confirmation with property details" }
                    ]
                },
                {
                    id: "tmpl_realestate_agent",
                    name: "Real Estate Agent Assistant",
                    pricing: "pro_required",
                    setup_time: "10 minutes",
                    agent: {
                        greeting: "Hi, you've reached {{agent_name}}'s office. I'm their AI assistant. How can I help?",
                        persona: "Friendly, knowledgeable about real estate, qualification-focused.",
                        capabilities: ["buyer_qualification", "showing_scheduling", "listing_info", "offer_status", "market_question_routing"]
                    }
                }
            ]
        },
        {
            vertical: "automotive",
            templates: [
                {
                    id: "tmpl_auto_service",
                    name: "Auto Service Center",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        greeting: "Thank you for calling {{shop_name}}. How can we help with your vehicle today?",
                        persona: "Knowledgeable, trustworthy, no-pressure. Uses plain language (not jargon).",
                        capabilities: ["service_appointment", "estimate_request", "vehicle_status_check", "recall_info", "hours_and_directions", "parts_availability"],
                        transfer_triggers: ["tow truck needed", "accident", "warranty claim dispute", "speak to mechanic"],
                        appointment_types: [
                            { name: "Oil Change", duration: 30, buffer: 10 },
                            { name: "Tire Rotation", duration: 45, buffer: 10 },
                            { name: "Full Inspection", duration: 120, buffer: 15 },
                            { name: "Diagnostic", duration: 60, buffer: 15 }
                        ]
                    }
                },
                {
                    id: "tmpl_auto_dealership",
                    name: "Car Dealership BDC",
                    pricing: "pro_required",
                    setup_time: "10 minutes",
                    agent: {
                        persona: "Enthusiastic, helpful, non-aggressive. Focus on getting the appointment.",
                        capabilities: ["test_drive_scheduling", "inventory_inquiry", "trade_in_estimate", "financing_info", "service_scheduling"]
                    }
                }
            ]
        },
        {
            vertical: "legal",
            templates: [
                {
                    id: "tmpl_legal_intake",
                    name: "Legal Intake Receptionist",
                    pricing: "pro_required",
                    setup_time: "10 minutes",
                    agent: {
                        greeting: "Thank you for calling the Law Office of {{firm_name}}. How may I assist you today?",
                        persona: "Professional, discreet, empathetic. Attorney-client privilege aware. Never gives legal advice.",
                        capabilities: ["consultation_scheduling", "case_type_classification", "conflict_check_intake", "document_request_routing", "case_status_inquiry"],
                        transfer_triggers: ["emergency protective order", "in custody", "court deadline today", "speak to attorney", "opposing counsel"],
                        case_types: [
                            { name: "Personal Injury", intake_fields: ["incident_date", "injury_type", "at_fault_party", "insurance_info"] },
                            { name: "Family Law", intake_fields: ["case_type", "children_involved", "urgency", "opposing_party"] },
                            { name: "Criminal Defense", intake_fields: ["charge_type", "court_date", "in_custody", "bail_status"] },
                            { name: "Business Law", intake_fields: ["entity_type", "issue_type", "timeline", "amount_at_stake"] }
                        ]
                    }
                }
            ]
        },
        {
            vertical: "insurance",
            templates: [
                {
                    id: "tmpl_insurance_agency",
                    name: "Insurance Agency Receptionist",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        persona: "Trustworthy, patient, thorough. Collects complete information on first call.",
                        capabilities: ["quote_inquiry", "claim_reporting", "policy_change_request", "payment_info", "coverage_question", "agent_scheduling"],
                        transfer_triggers: ["active claim emergency", "coverage dispute", "cancel policy", "speak to agent"]
                    }
                }
            ]
        },
        {
            vertical: "hospitality",
            templates: [
                {
                    id: "tmpl_hospitality_hotel",
                    name: "Hotel Front Desk",
                    pricing: "pro_required",
                    setup_time: "10 minutes",
                    agent: {
                        persona: "Warm, welcoming, accommodation-focused. Upsell-aware but not pushy.",
                        capabilities: ["reservation_booking", "reservation_modification", "amenity_info", "local_recommendations", "complaint_handling", "loyalty_program"]
                    }
                },
                {
                    id: "tmpl_hospitality_restaurant",
                    name: "Restaurant Host",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        persona: "Upbeat, efficient. Manages waitlist expectations well.",
                        capabilities: ["reservation_booking", "menu_info", "dietary_accommodations", "event_booking", "hours_and_location", "takeout_ordering"]
                    }
                }
            ]
        },
        {
            vertical: "home_services",
            templates: [
                {
                    id: "tmpl_homeservices_hvac",
                    name: "HVAC / Plumbing / Electrical",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        persona: "Helpful, calm, triage-oriented. Understands urgency levels.",
                        capabilities: ["service_scheduling", "emergency_dispatch", "estimate_request", "maintenance_plan_info", "warranty_check", "area_coverage_check"],
                        transfer_triggers: ["gas leak", "flooding", "no heat in winter", "electrical fire smell"],
                        service_types: [
                            { name: "Emergency Service", priority: "immediate", surcharge: true },
                            { name: "Same-Day Service", priority: "high", surcharge: false },
                            { name: "Scheduled Service", priority: "normal", surcharge: false },
                            { name: "Maintenance Plan", priority: "low", surcharge: false }
                        ]
                    }
                }
            ]
        },
        {
            vertical: "professional_services",
            templates: [
                {
                    id: "tmpl_profservices_accounting",
                    name: "Accounting / CPA Firm",
                    pricing: "free",
                    setup_time: "5 minutes",
                    agent: {
                        persona: "Professional, detail-oriented. Understands seasonal urgency (tax season).",
                        capabilities: ["appointment_scheduling", "document_drop_off_scheduling", "tax_prep_status", "service_pricing_info", "new_client_intake"],
                        transfer_triggers: ["IRS audit", "tax lien", "payroll emergency", "speak to CPA"]
                    }
                },
                {
                    id: "tmpl_profservices_consulting",
                    name: "Consulting Firm Intake",
                    pricing: "pro_required",
                    setup_time: "10 minutes",
                    agent: {
                        persona: "Polished, inquisitive, qualification-focused.",
                        capabilities: ["discovery_call_scheduling", "service_overview", "case_study_sharing", "pricing_framework", "team_bio_info"]
                    }
                }
            ]
        }
    ],

    // ═══════════════════════════════════════════════════
    // CUSTOMIZATION API
    // ═══════════════════════════════════════════════════
    customization_api: {
        endpoints: [
            { method: "GET", path: "/templates", description: "Browse all templates (filter by vertical, pricing, tags)", auth: "optional" },
            { method: "GET", path: "/templates/:templateId", description: "Full template detail with components", auth: "optional" },
            { method: "POST", path: "/templates/:templateId/apply", description: "Apply template to create a new agent with customization", auth: "bearer" },
            { method: "POST", path: "/templates/:templateId/preview", description: "Preview agent without creating — test call simulation", auth: "bearer" },
            { method: "GET", path: "/templates/:templateId/customization-fields", description: "Get required and optional customization fields", auth: "optional" },
            { method: "POST", path: "/templates/publish", description: "Publish a custom template to marketplace", auth: "developer_token" }
        ],
        apply_payload: {
            template_id: "tmpl_healthcare_dental",
            customization: {
                company_name: "Bright Dental Group",
                phone_number: "+15551234567",
                business_hours: { mon_fri: "8:00-17:00", sat: "9:00-13:00" },
                greeting: "Thank you for calling Bright Dental! I'm here to help.",
                appointment_types: "Override or extend defaults",
                knowledge_base_additions: [
                    { q: "Do you offer Invisalign?", a: "Yes! We're a certified Invisalign provider. Consultations are complimentary." }
                ],
                calendar_integration: { provider: "google", calendar_id: "primary" },
                language: ["en-US", "es-US"]
            }
        },
        response: {
            agent_id: "agent_{{uuid}}",
            template_used: "tmpl_healthcare_dental",
            customizations_applied: 8,
            status: "active",
            test_number: "+15559876543"
        }
    },

    // ═══════════════════════════════════════════════════
    // TEMPLATE MARKETPLACE INTEGRATION
    // ═══════════════════════════════════════════════════
    marketplace_integration: {
        description: "Third-party developers can create and sell industry templates.",
        developer_flow: [
            "Register as SmartFlow developer",
            "Use template schema to define agent, workflows, integrations, and sample data",
            "Test template in sandbox with apply endpoint",
            "Submit via developer portal with screenshots and demo recording",
            "SmartFlow reviews (SLA: 5 business days)",
            "Published to marketplace under 'Community Templates' section"
        ],
        revenue_model: {
            free: "0% commission — developer builds for ecosystem growth or lead generation",
            paid: "70% to developer, 30% to SmartFlow (same as plugin marketplace)",
            pricing_options: [
                "One-time purchase (e.g., $29 for Real Estate Pro template)",
                "Monthly subscription (e.g., $9/mo for ongoing updates + support)",
                "Bundled with plan requirement (e.g., free but requires Pro plan)"
            ]
        },
        quality_standards: [
            "Template must include ≥5 knowledge base entries",
            "Template must include ≥1 workflow",
            "Template must have customization fields (not hardcoded)",
            "Template must include testing instructions",
            "Template description must specify which plan is required"
        ]
    }
};

module.exports = TEMPLATE_LIBRARY;
