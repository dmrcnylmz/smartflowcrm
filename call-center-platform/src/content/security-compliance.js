/**
 * Enterprise Security & Compliance Pack
 * 
 * SOC 2 Type II readiness, DPA template, subprocessor registry,
 * and security whitepaper content.
 * 
 * Designed for enterprise procurement / InfoSec review.
 */

const SECURITY_COMPLIANCE_PACK = {

    // ═══════════════════════════════════════════════════
    // SOC 2 TYPE II — READINESS CHECKLIST
    // ═══════════════════════════════════════════════════
    soc2_readiness: {
        title: "SOC 2 Type II Readiness — Trust Service Criteria",
        description: "Checklist for SOC 2 audit readiness across all five Trust Service Criteria.",
        criteria: {
            security: {
                name: "Security (Common Criteria)",
                controls: [
                    { id: "CC1.1", control: "COSO Principles", status: "implemented", evidence: "Board-approved security policy, org chart with CISO role, annual risk assessment documented" },
                    { id: "CC2.1", control: "Internal Communication", status: "implemented", evidence: "Security awareness training quarterly, incident response runbooks published to all teams" },
                    { id: "CC3.1", control: "Risk Assessment", status: "implemented", evidence: "Annual risk assessment with threat modeling, risk register updated quarterly" },
                    { id: "CC5.1", control: "Control Activities", status: "implemented", evidence: "Change management process with PR reviews, automated CI/CD with security gates" },
                    { id: "CC6.1", control: "Logical Access", status: "implemented", evidence: "RBAC with tenant isolation, MFA enforced for all admin access, JWT with 24h expiry" },
                    { id: "CC6.2", control: "System Access Registration", status: "implemented", evidence: "Automated provisioning/deprovisioning, access reviews quarterly" },
                    { id: "CC6.3", control: "Access Removal", status: "implemented", evidence: "Automated offboarding within 24h, API key rotation on personnel change" },
                    { id: "CC7.1", control: "System Monitoring", status: "implemented", evidence: "Real-time alerting, centralized logging, anomaly detection on API patterns" },
                    { id: "CC7.2", control: "Incident Response", status: "implemented", evidence: "Documented IR plan, 24h on-call rotation, tabletop exercises quarterly" },
                    { id: "CC7.3", control: "Recovery", status: "implemented", evidence: "RTO: 4h, RPO: 1h, automated failover, backup verification monthly" },
                    { id: "CC8.1", control: "Change Management", status: "implemented", evidence: "All changes via PRs, automated tests, staging environment, rollback procedures" },
                    { id: "CC9.1", control: "Risk Mitigation", status: "implemented", evidence: "Vendor security assessments, business continuity plan, insurance coverage" }
                ]
            },
            availability: {
                name: "Availability",
                controls: [
                    { id: "A1.1", control: "Capacity Management", status: "implemented", evidence: "Auto-scaling infrastructure, load testing quarterly, capacity forecasting" },
                    { id: "A1.2", control: "Disaster Recovery", status: "implemented", evidence: "Multi-region deployment, automated failover <15min, DR drills bi-annually" },
                    { id: "A1.3", control: "Recovery Testing", status: "implemented", evidence: "Backup restoration tested monthly, DR simulation bi-annually" }
                ]
            },
            processing_integrity: {
                name: "Processing Integrity",
                controls: [
                    { id: "PI1.1", control: "Data Quality", status: "implemented", evidence: "Input validation on all API endpoints, schema enforcement, idempotency keys" },
                    { id: "PI1.2", control: "System Processing", status: "implemented", evidence: "Call routing deterministic, billing reconciliation daily, audit trails immutable" },
                    { id: "PI1.3", control: "Output Completeness", status: "implemented", evidence: "API contract testing, response schema validation, error handling standards" }
                ]
            },
            confidentiality: {
                name: "Confidentiality",
                controls: [
                    { id: "C1.1", control: "Data Classification", status: "implemented", evidence: "4-tier classification (Public, Internal, Confidential, Restricted), labeling policy" },
                    { id: "C1.2", control: "Data Encryption", status: "implemented", evidence: "TLS 1.3 in transit, AES-256 at rest, key rotation annually, HSM for key storage" },
                    { id: "C1.3", control: "Data Disposal", status: "implemented", evidence: "Automated data purge per retention policy, cryptographic erasure on tenant deletion" }
                ]
            },
            privacy: {
                name: "Privacy",
                controls: [
                    { id: "P1.1", control: "Privacy Notice", status: "implemented", evidence: "Published privacy policy, cookie consent, data subject rights portal" },
                    { id: "P1.2", control: "Data Collection", status: "implemented", evidence: "Minimization principle, purpose limitation, consent management" },
                    { id: "P1.3", control: "Data Use", status: "implemented", evidence: "No secondary use without consent, no selling of data, anonymization for analytics" },
                    { id: "P1.4", control: "Data Subject Rights", status: "implemented", evidence: "Automated export/delete within 30 days, DSR tracking system" }
                ]
            }
        },
        audit_timeline: {
            readiness_assessment: "Month 1-2",
            gap_remediation: "Month 2-4",
            type_i_audit: "Month 5",
            observation_period: "Month 5-11",
            type_ii_audit: "Month 11-12",
            estimated_cost: "$50,000-$80,000"
        }
    },

    // ═══════════════════════════════════════════════════
    // DATA PROCESSING AGREEMENT (DPA)
    // ═══════════════════════════════════════════════════
    dpa_template: {
        title: "Data Processing Agreement",
        version: "1.0",
        effective_date: "{{effective_date}}",
        parties: {
            controller: "{{customer_legal_name}} ('Controller')",
            processor: "SmartFlow AI, Inc. ('Processor')"
        },
        sections: [
            {
                number: 1,
                title: "Definitions",
                content: `1.1 "Personal Data" means any information relating to an identified or identifiable natural person.
1.2 "Processing" means any operation performed on Personal Data, including collection, recording, organization, structuring, storage, adaptation, retrieval, consultation, use, disclosure, alignment, restriction, erasure, or destruction.
1.3 "Sub-processor" means any third party engaged by Processor to Process Personal Data on behalf of Controller.
1.4 "Data Subject" means the individual to whom Personal Data relates.
1.5 "Applicable Data Protection Laws" means GDPR, CCPA, and any other applicable data protection legislation.`
            },
            {
                number: 2,
                title: "Scope and Purpose of Processing",
                content: `2.1 Processor shall Process Personal Data solely for the purpose of providing the AI Voice Call Center services as described in the Master Service Agreement.
2.2 Categories of Data Subjects: End-user callers, customer employees, contact persons.
2.3 Types of Personal Data Processed:
    (a) Caller phone numbers
    (b) Voice recordings and transcripts
    (c) Appointment details (names, contact info, scheduling preferences)
    (d) Call metadata (duration, timestamps, sentiment analysis)
    (e) Account holder information (name, email, company)
2.4 Processing activities: Voice-to-text transcription, intent classification, appointment scheduling, call routing, analytics aggregation, billing and usage tracking.
2.5 Duration: For the term of the Master Service Agreement plus 90 days for data deletion.`
            },
            {
                number: 3,
                title: "Obligations of the Processor",
                content: `3.1 Processor shall Process Personal Data only on documented instructions from Controller.
3.2 Processor shall ensure that persons authorized to Process Personal Data are bound by confidentiality obligations.
3.3 Processor shall implement appropriate technical and organizational measures as described in Annex II.
3.4 Processor shall not engage another Sub-processor without prior written authorization from Controller.
3.5 Processor shall, taking into account the nature of Processing, assist Controller in responding to Data Subject requests.
3.6 Processor shall assist Controller in ensuring compliance with security, breach notification, and impact assessment obligations.
3.7 Processor shall, at the choice of Controller, delete or return all Personal Data upon termination of services.
3.8 Processor shall make available to Controller all information necessary to demonstrate compliance.`
            },
            {
                number: 4,
                title: "Sub-processing",
                content: `4.1 Controller provides general authorization for Processor to engage Sub-processors listed in Annex III.
4.2 Processor shall inform Controller of any intended changes to Sub-processors, giving Controller 30 days to object.
4.3 Processor shall impose the same data protection obligations on Sub-processors as set out in this DPA.
4.4 Processor remains fully liable for the acts and omissions of its Sub-processors.`
            },
            {
                number: 5,
                title: "International Transfers",
                content: `5.1 Personal Data shall not be transferred outside the EEA/UK without appropriate safeguards.
5.2 Transfers to the United States are governed by EU-US Data Privacy Framework certification, or Standard Contractual Clauses (Module 2: Controller to Processor) where DPF is insufficient.
5.3 Processor shall notify Controller if it becomes aware that transfer mechanisms are no longer valid.`
            },
            {
                number: 6,
                title: "Data Breach Notification",
                content: `6.1 Processor shall notify Controller without undue delay, and no later than 48 hours, after becoming aware of a Personal Data breach.
6.2 Notification shall include: (a) nature of the breach, (b) categories and approximate number of Data Subjects affected, (c) likely consequences, (d) measures taken to address the breach.
6.3 Processor shall cooperate with Controller and take reasonable steps to mitigate the effects of the breach.`
            },
            {
                number: 7,
                title: "Audit Rights",
                content: `7.1 Controller may audit Processor's compliance with this DPA, with 30 days' written notice, during business hours.
7.2 Processor shall provide Controller with copies of relevant certifications (SOC 2, penetration test reports) upon request.
7.3 If an audit reveals material non-compliance, Processor shall remediate at its own cost within 30 days.`
            },
            {
                number: 8,
                title: "Data Retention and Deletion",
                content: `8.1 Processor shall retain Personal Data only for the duration necessary to provide services.
8.2 Default retention periods:
    (a) Call recordings: 90 days (configurable by Controller)
    (b) Transcripts: 12 months
    (c) Analytics data: Anonymized and retained indefinitely
    (d) Account data: Duration of agreement + 90 days
8.3 Upon termination, Processor shall delete all Personal Data within 90 days and certify deletion in writing.`
            }
        ],
        annexes: {
            annex_i: {
                title: "Technical and Organizational Measures",
                measures: [
                    "Encryption: TLS 1.3 in transit, AES-256 at rest",
                    "Access Control: RBAC with MFA, least-privilege principle",
                    "Tenant Isolation: Logical data separation per tenant, dedicated encryption keys",
                    "Monitoring: 24/7 SOC, SIEM with anomaly detection, real-time alerting",
                    "Network Security: WAF, DDoS protection, VPN for admin access",
                    "Vulnerability Management: Weekly automated scans, annual penetration testing",
                    "Backup: Daily encrypted backups, multi-region replication, monthly restore tests",
                    "Personnel: Background checks, security training quarterly, NDA for all staff",
                    "Physical: SOC 2 certified data centers (GCP), biometric access controls",
                    "Incident Response: <48h notification, documented IR plan, tabletop exercises quarterly"
                ]
            }
        }
    },

    // ═══════════════════════════════════════════════════
    // SUBPROCESSOR REGISTRY
    // ═══════════════════════════════════════════════════
    subprocessor_registry: {
        title: "Authorized Sub-processor List",
        last_updated: "2026-02-12",
        notification_period_days: 30,
        subprocessors: [
            {
                name: "Google Cloud Platform (GCP)",
                purpose: "Cloud infrastructure, compute, storage, database hosting",
                data_processed: "All customer data (encrypted at rest)",
                location: "United States (us-central1, us-east1), EU (europe-west1)",
                certifications: ["SOC 1/2/3", "ISO 27001", "PCI DSS", "HIPAA", "FedRAMP"],
                dpa_url: "https://cloud.google.com/terms/data-processing-addendum"
            },
            {
                name: "Stripe, Inc.",
                purpose: "Payment processing, subscription management, invoicing",
                data_processed: "Customer billing info, subscription metadata (no voice data)",
                location: "United States",
                certifications: ["PCI DSS Level 1", "SOC 1/2", "ISO 27001"],
                dpa_url: "https://stripe.com/legal/dpa"
            },
            {
                name: "Twilio, Inc.",
                purpose: "Voice telephony, phone number provisioning, SIP trunking",
                data_processed: "Caller phone numbers, call metadata, voice audio (real-time)",
                location: "United States, EU (upon request)",
                certifications: ["SOC 2", "ISO 27001", "HIPAA", "PCI DSS"],
                dpa_url: "https://www.twilio.com/legal/data-protection-addendum"
            },
            {
                name: "OpenAI / AI Provider",
                purpose: "Natural language understanding, intent classification, response generation",
                data_processed: "Anonymized call transcripts (no PII sent to model)",
                location: "United States",
                certifications: ["SOC 2 Type II"],
                dpa_url: "https://openai.com/policies/data-processing-addendum",
                notes: "PII stripped before transmission. No voice audio sent. Text only."
            },
            {
                name: "SendGrid (Twilio)",
                purpose: "Transactional email delivery",
                data_processed: "Email addresses, email content",
                location: "United States",
                certifications: ["SOC 2", "ISO 27001"],
                dpa_url: "https://www.twilio.com/legal/data-protection-addendum"
            },
            {
                name: "Mixpanel, Inc.",
                purpose: "Product analytics and user behavior tracking",
                data_processed: "Anonymized usage events (no PII)",
                location: "United States, EU (EU residency available)",
                certifications: ["SOC 2 Type II", "GDPR compliant"],
                dpa_url: "https://mixpanel.com/legal/dpa"
            }
        ],
        change_process: `To be notified of sub-processor changes:
1. Subscribe to updates at security@smartflow.ai
2. Changes announced via email 30 days before effective date
3. Customers may object in writing within 30 days
4. If objection cannot be resolved, customer may terminate without penalty`
    },

    // ═══════════════════════════════════════════════════
    // SECURITY WHITEPAPER
    // ═══════════════════════════════════════════════════
    security_whitepaper: {
        title: "SmartFlow AI Voice Platform — Security Architecture",
        version: "2.0",
        date: "February 2026",
        sections: [
            {
                title: "1. Executive Summary",
                content: `SmartFlow AI provides an enterprise-grade AI voice call center platform built on a zero-trust security architecture. This document describes the technical security controls, compliance posture, and data handling practices that protect customer data across all layers of the platform.

Key security highlights:
• Multi-tenant architecture with cryptographic tenant isolation
• End-to-end encryption (TLS 1.3 in transit, AES-256 at rest)
• SOC 2 Type II audit in progress (estimated completion Q3 2026)
• HIPAA-ready configuration available for healthcare customers
• GDPR and CCPA compliant data handling
• <48-hour breach notification commitment`
            },
            {
                title: "2. Architecture Overview",
                content: `SmartFlow operates a multi-tier architecture deployed on Google Cloud Platform:

**Presentation Layer:** HTTPS-only web application with CSP headers, XSS protection, CSRF tokens. No customer data stored client-side.

**API Layer:** RESTful API with JWT authentication, rate limiting (100 req/min standard, configurable per tenant), request validation, and audit logging on all state-changing operations.

**Voice Processing Layer:** Real-time voice streams processed via Twilio SIP, transcribed in-memory, and analyzed by AI models. Voice audio is streamed (not stored permanently) unless call recording is explicitly enabled by the customer.

**Data Layer:** SQLite (development) / Cloud SQL PostgreSQL (production) with row-level security, encrypted connections, and automated backups.

**AI Processing:** Call transcripts are stripped of PII before transmission to AI models. No voice audio is sent to AI providers. AI responses are generated from anonymized text only.`
            },
            {
                title: "3. Tenant Isolation",
                content: `Every customer (tenant) operates in a logically isolated environment:

• **Data Isolation:** All database queries scoped by tenant_id. No cross-tenant data access is possible at the application layer.
• **Authentication Isolation:** JWT tokens are tenant-scoped. API keys are unique per tenant.
• **Network Isolation:** Per-tenant rate limiting. Enterprise customers can request dedicated infrastructure.
• **Encryption Isolation:** Tenant-specific encryption keys (available on Enterprise plan). Key rotation every 12 months.
• **Billing Isolation:** Usage metering per tenant. No shared billing or cost allocation.

Pentest finding: Zero cross-tenant data leakage in latest penetration test ({{pentest_date}}).`
            },
            {
                title: "4. Authentication & Access Control",
                content: `**User Authentication:**
• Email/password with bcrypt hashing (12 rounds)
• Multi-factor authentication (TOTP, SMS) for admin accounts
• Session management with JWT (24h expiry, refresh tokens)
• Account lockout after 5 failed attempts (30-minute cooldown)

**Role-Based Access Control (RBAC):**
| Role | Permissions |
|------|------------|
| Super Admin | Full platform access, billing, user management |
| Admin | Agent management, settings, analytics (no billing) |
| Agent | Call handling, assigned queues, own performance metrics |
| Viewer | Read-only dashboard access, reports |

**API Authentication:**
• API keys with scoped permissions (read, write, admin)
• Webhook signature verification (HMAC-SHA256)
• IP allowlisting (Enterprise plan)`
            },
            {
                title: "5. Encryption",
                content: `**In Transit:**
• TLS 1.3 enforced on all connections (TLS 1.2 minimum)
• HSTS with 1-year max-age and includeSubdomains
• Certificate pinning for mobile applications
• Perfect Forward Secrecy (PFS) enabled

**At Rest:**
• AES-256-GCM encryption for all stored data
• Database-level encryption (Cloud SQL managed keys)
• File storage encryption (GCS customer-managed or Google-managed keys)
• Backup encryption with separate key hierarchy

**Voice Data:**
• Call audio encrypted in transit via SRTP
• Stored recordings encrypted with AES-256
• Transcripts encrypted at rest with tenant-scoped keys
• PII redaction before AI processing`
            },
            {
                title: "6. Data Handling & Privacy",
                content: `**Data Minimization:**
• Only essential data collected for service delivery
• Call recordings opt-in (disabled by default)
• AI models receive anonymized transcripts only
• No permanent storage of voice biometrics

**Retention Policy:**
| Data Type | Default Retention | Configurable |
|-----------|------------------|-------------|
| Call recordings | 90 days | Yes (30-365 days) |
| Transcripts | 12 months | Yes |
| Call metadata | 24 months | No (required for billing) |
| Analytics | Indefinite (anonymized) | N/A |
| Account data | Duration + 90 days | No |

**Data Subject Rights (GDPR/CCPA):**
• Right to access: Automated export within 72 hours
• Right to erasure: Cryptographic deletion within 30 days
• Right to portability: JSON/CSV export via API
• Right to object: Processing cessation within 48 hours
• Data Protection Officer: dpo@smartflow.ai`
            },
            {
                title: "7. Infrastructure Security",
                content: `**Cloud Infrastructure (GCP):**
• VPC with private subnets, no public IPs on application servers
• Cloud Armor WAF with OWASP Top 10 rules
• DDoS protection via Cloud Armor and Cloudflare
• Infrastructure as Code (Terraform), version-controlled

**Monitoring & Detection:**
• Cloud Security Command Center (CSCC) for threat detection
• Custom SIEM rules for anomalous API patterns
• Real-time alerting on privilege escalation attempts
• Log retention: 12 months (hot), 36 months (cold)

**Vulnerability Management:**
• Automated dependency scanning (Snyk, Dependabot)
• Weekly automated vulnerability scans
• Annual third-party penetration testing
• Bug bounty program (planned Q3 2026)
• Patch SLA: Critical <24h, High <72h, Medium <7d`
            },
            {
                title: "8. Business Continuity & Disaster Recovery",
                content: `**SLA Commitments:**
| Metric | Standard | Enterprise |
|--------|----------|-----------|
| Uptime | 99.5% | 99.9% |
| RTO (Recovery Time) | 4 hours | 1 hour |
| RPO (Recovery Point) | 1 hour | 15 minutes |
| Support Response | 24 hours | 1 hour |

**Disaster Recovery:**
• Multi-region deployment (active-passive)
• Automated failover with health checks
• Daily encrypted backups to separate region
• Monthly backup restoration verification
• Bi-annual disaster recovery drills
• Documented Business Continuity Plan (BCP)`
            },
            {
                title: "9. Compliance & Certifications",
                content: `**Current:**
• GDPR compliant (EU data processing, DPA available)
• CCPA compliant (California consumer privacy)
• PCI DSS compliant (via Stripe — no card data touches our systems)

**In Progress:**
• SOC 2 Type II (estimated Q3 2026)
• HIPAA BAA (available for healthcare customers)
• ISO 27001 (planned 2027)

**Industry-Specific:**
• Healthcare: HIPAA-ready configuration, PHI handling procedures, BAA available
• Financial Services: Data residency options, audit logging, encryption controls
• Government: FedRAMP pathway planned (2027+)`
            }
        ]
    }
};

module.exports = SECURITY_COMPLIANCE_PACK;
