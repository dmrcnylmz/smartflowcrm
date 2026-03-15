# AI-Powered Outbound Calling: Regulatory Feasibility Analysis

**Date:** March 2026
**Purpose:** Determine where SmartFlow CRM can operate outbound AI calling with minimal legal risk.

---

## Table of Contents

1. [Turkey (TR) — Primary Market](#1-turkey-tr--primary-market)
2. [United States (US)](#2-united-states-us)
3. [United Kingdom (UK)](#3-united-kingdom-uk)
4. [Germany (DE)](#4-germany-de)
5. [France (FR)](#5-france-fr)
6. [Safe Use Cases Across Jurisdictions](#6-safe-use-cases-across-jurisdictions)
7. [Go-to-Market Strategy Recommendation](#7-go-to-market-strategy-recommendation)
8. [Implementation Checklist](#8-implementation-checklist)

---

## 1. Turkey (TR) — Primary Market

### Legal Framework

- **Law 6563** (E-Commerce Law) + Regulation on Commercial Communication and Commercial Electronic Messages
- **İYS** (İleti Yönetim Sistemi) — centralized consent management platform
- **KVKK** (Personal Data Protection Law No. 6698)
- **BTK** (Information and Communication Technologies Authority)

### Can we do outbound AI calls to existing customers who gave consent?

**YES, with İYS registration.** Consent must be registered in İYS within 3 business days of collection. Unregistered consents are treated as invalid. The consent can be obtained via electronic means (including a checkbox in the SaaS platform), but must be specific to the communication channel (calls).

### What does İYS require for CALLS specifically?

Phone calls are treated identically to SMS and email under İYS. All are "commercial electronic messages" requiring:

- Prior consent registered in İYS
- Trade name stated at the beginning of the call
- Sending hours: 08:00-21:00 Turkey Time (UTC+3)
- Opt-out processed within 3 business days
- Records kept for 3 years

### Appointment reminders vs marketing calls?

**Critical distinction exists.** Purely transactional/service notifications are EXEMPT from İYS consent when:

1. There is an ongoing subscription, membership, or service agreement
2. The message relates to: debt collection, payment reminders, information updates, purchase/delivery notifications, or similar operational matters
3. The message does NOT promote additional goods or services

**Example:** "Your appointment is Tuesday at 3 PM" = EXEMPT
**Example:** "Your appointment is Tuesday at 3 PM. Check out our new service!" = REQUIRES İYS CONSENT

Birthday greetings, holiday messages, and satisfaction surveys are interpreted as commercial (promotional intent) and require consent.

### Calling customers with active service agreements?

**YES, for service-related notifications without İYS consent.** As long as the call relates to the existing service (reminders, updates, delivery, collection) and contains no promotional content, prior approval is not required. This is a significant safe harbor for SmartFlow CRM's use case.

### B2B outbound in Turkey?

**FAVORABLE.** Merchants and craftsmen (esnaf/tacir) are exempt from the prior consent requirement. However:

- They must still be registered in İYS
- They retain the right to opt out
- Opt-out must be honored within 3 business days

This means B2B outbound to businesses is legally viable on an opt-out basis rather than opt-in.

### BTK enforcement for small SaaS companies?

**Enforcement is real and increasing.** The KVKK issued over TRY 500 million in fines in 2024. The 2025 law expanded BTK's sanctioning powers. Individual violations can result in fines up to TRY 71,880. KVKK fines range from TRY 256,357 to TRY 17,092,242. The "we're a small business" exemption mindset has been explicitly ended by 2025 regulatory changes. Foreign entities are also required to register with İYS.

### Turkey Risk Assessment: MEDIUM-LOW (for consented/transactional calls)

**Actionable for SmartFlow CRM:**
- Transactional calls (reminders, payment notifications) to existing customers: **GO** (no İYS consent needed)
- B2B outbound to merchants: **GO** (opt-out model, register in İYS)
- Marketing calls with İYS-registered consent: **GO** (follow all rules)
- Cold calling without consent: **NO-GO**

---

## 2. United States (US)

### Legal Framework

- **TCPA** (Telephone Consumer Protection Act, 47 U.S.C. § 227)
- **FCC** Declaratory Ruling on AI voices (February 2024)
- **TSR** (Telemarketing Sales Rule, FTC)
- **State mini-TCPA laws** (Florida, Maryland, Oklahoma, etc.)

### AI calls with Prior Express Written Consent (PEWC)?

**YES, AI calls are legal with proper consent.** The FCC confirmed in February 2024 that AI-generated voices are "artificial or prerecorded voices" under the TCPA. This means all existing TCPA consent rules apply to AI calls.

**Major development (February 2026):** The Fifth Circuit ruled that the TCPA does not require prior express *written* consent for telemarketing calls — oral consent may suffice. This applies in Texas, Louisiana, Mississippi. The FCC's one-to-one consent rule was also vacated by the Eleventh Circuit. The regulatory environment is becoming MORE permissive, not less.

### Informational vs telemarketing calls under TCPA?

**Two-tier consent system:**

| Call Type | Consent Standard | Examples |
|-----------|-----------------|----------|
| **Informational/Transactional** | Prior Express Consent (PEC) — verbal/implied OK | Appointment reminders, delivery notifications, account alerts, payment reminders |
| **Telemarketing/Marketing** | Prior Express Written Consent (PEWC) — written/electronic signature | Sales calls, promotions, upselling |

PEC can be satisfied by the customer voluntarily providing their phone number. PEWC requires a clear written disclosure and signature (electronic signature via checkbox is acceptable).

### Appointment reminders, payment reminders, delivery notifications?

**These are INFORMATIONAL calls — lower consent bar.** They require only Prior Express Consent, which can be obtained by the customer providing their phone number when signing up for the service. No written consent is needed.

Healthcare appointment reminders have an additional HIPAA exemption making them even safer.

Key protections:
- Even if a consumer revokes consent for marketing calls, informational calls can continue unless separately revoked
- The FCC is actively considering narrowing the "global revocation" rule to protect beneficial informational calls
- Frequency limits and reasonable timing are still expected

### B2B outbound?

**CAUTION.** Common misconception that B2B is fully exempt. Reality:
- B2B calls ARE exempt from DNC list requirements (FTC TSR)
- B2B calls to cell phones with an ATDS still require consent under TCPA
- Mixed-use phones (personal cell used for business) are treated as residential
- After Facebook v. Duguid (2021), the ATDS definition is narrower — systems that dial from preset lists (not random/sequential generators) may not qualify as ATDS

**Practical approach:** If calling business landlines from a preset list (not ATDS), B2B marketing is relatively safe. If calling cell phones with any automated system, get consent.

### Consent via SaaS platform checkbox?

**YES, this can work for PEWC** if the disclosure:
- Clearly identifies the caller
- States that consent is for automated/prerecorded calls
- Is "clear and conspicuous"
- The consumer takes an affirmative action (checking a box — not pre-checked)
- Consent is not a condition of purchase

### FCC Proposed AI-Specific Rules (Expected 2026)

The FCC has proposed but not yet finalized:
- Mandatory disclosure that a call is AI-generated
- Explicit consent for AI-generated content specifically
- These rules are coming but not yet enforceable

### US Risk Assessment: LOW (for informational calls with consent)

**Actionable for SmartFlow CRM:**
- Informational calls (reminders, notifications) with PEC: **GO** — safest use case
- Marketing calls with PEWC (checkbox consent in platform): **GO** with proper consent flow
- B2B to landlines: **GO** (exempt from DNC)
- B2B to cell phones with ATDS: **CAUTION** (consent needed)
- Cold calling without consent: **NO-GO**
- Plan for AI disclosure requirements (coming 2026)

---

## 3. United Kingdom (UK)

### Legal Framework

- **PECR** (Privacy and Electronic Communications Regulations 2003)
- **UK GDPR** (retained EU law)
- **Data (Use and Access) Act 2025** (Royal Assent June 19, 2025 — increases penalties)
- **ICO** enforcement
- **TPS/CTPS** (Telephone Preference Service / Corporate TPS)

### Automated AI calls with consent?

**YES, but consent must be specific to automated calls.** PECR Regulation 19 requires that automated marketing calls (including AI) have specific prior consent. General marketing consent or consent for live calls is NOT sufficient — the consent must specifically cover automated/AI calls.

### Appointment reminders and service calls?

**EXEMPT from PECR marketing rules.** Non-marketing service messages are explicitly outside PECR's scope:

> "Routine customer service messages do not count as direct marketing — correspondence with customers to provide information they need about a current contract or past purchase (e.g., information about service interruptions, delivery arrangements, product safety, changes to terms and conditions, or tariffs)."

This means appointment reminders, delivery updates, payment notifications, and service follow-ups are NOT subject to PECR automated calling consent — as long as they contain no promotional content. General branding/logos in these messages do not count as marketing.

**However:** UK GDPR still applies to personal data processing. You need a lawful basis (legitimate interest or contractual necessity) for the data processing involved.

### B2B outbound calling?

**More relaxed for LIVE calls, same for automated:**

| Type | B2C | B2B (Corporate Subscribers) |
|------|-----|---------------------------|
| Automated marketing calls | Specific consent required | Specific consent required (same rules) |
| Live marketing calls | Allowed unless on TPS or objected | Allowed unless on CTPS or objected |
| Service/transactional calls | Exempt from PECR marketing rules | Exempt from PECR marketing rules |

The UK government considered tightening B2B rules but decided against it due to economic concerns.

### Key 2025 Change: Increased Penalties

The Data (Use and Access) Act 2025 raised PECR maximum fines from GBP 500,000 to GBP 17.5 million or 4% of global turnover. This significantly increases the stakes for non-compliance.

### UK Risk Assessment: LOW (for service calls), MEDIUM (for automated marketing)

**Actionable for SmartFlow CRM:**
- Service/transactional calls (reminders, notifications): **GO** — exempt from PECR marketing rules
- Automated marketing with specific consent: **GO** with proper consent mechanism
- Live B2B marketing calls (not on CTPS): **GO**
- Automated B2B marketing calls: **CAUTION** — same consent as B2C
- Any call with promotional content mixed into service messages: **REQUIRES** specific automated call consent

---

## 4. Germany (DE)

### Legal Framework

- **UWG §7** (Unfair Competition Act — Gesetz gegen den unlauteren Wettbewerb)
- **UWG §7a** (consent documentation, since October 2021)
- **GDPR** (directly applicable)
- **EU AI Act Art. 50** (from August 2026)

### B2B outbound with "presumed consent" for AI calls?

**POTENTIALLY VIABLE.** German law treats interactive AI voicebots differently from traditional robocalls:

- Traditional robocalls (prerecorded messages): Always require express consent, even B2B
- Interactive AI voicebots (real-time dialog): Legal analysis suggests they should be treated like human agent calls under UWG §7(2) No. 1

If the AI voicebot communicates in real-time dialog (which SmartFlow's voice pipeline does), it can be treated as equivalent to a human call. For B2B, this means **presumed consent (mutmaßliche Einwilligung)** may suffice.

**Requirements for presumed consent:**
- The product/service must closely relate to the recipient's business needs
- There should be an existing relationship or concrete indication of interest
- A mere industry match is NOT enough
- Publishing a phone number in directories does NOT constitute presumed consent

### Service/transactional calls exempt from UWG §7?

**YES.** UWG §7 restricts "advertising" (Werbung) calls specifically. Purely transactional calls that serve contract fulfillment are exempt:
- Appointment reminders (for booked services)
- Payment reminders
- Delivery notifications
- Service status updates

**BUT:** "Advertising" is interpreted very broadly — event information in order confirmations, reminders of available services, satisfaction surveys, and almost any customer contact beyond mere contract fulfillment can be classified as advertising.

### Calling EXISTING customers with a contract?

For transactional/service purposes: **YES, exempt.**
For marketing/cross-selling: **Express consent required** (B2C) or presumed consent with concrete basis (B2B).

### Documentation Requirements (§7a UWG)

Consent records must be kept for **5 years** from collection and from each use. Failure to document consent is independently punishable with fines up to EUR 50,000.

### EU AI Act Disclosure (August 2026)

From August 2, 2026, Art. 50 of the EU AI Act requires:
- Clear disclosure that the caller is an AI system (not a human)
- Audible disclaimers for audio/voice AI content
- Machine-readable marking of synthetic audio

SmartFlow must implement an AI disclosure at the start of every outbound call by August 2026.

### Germany Risk Assessment: MEDIUM

**Actionable for SmartFlow CRM:**
- Transactional calls to existing customers: **GO** — exempt from §7 UWG
- B2B with interactive AI voicebot + concrete business relationship: **GO** (presumed consent argument is strong)
- B2C marketing with express consent: **GO** with proper documentation
- B2B cold calling without relationship: **HIGH RISK** — presumed consent bar is very high
- Implement AI disclosure before August 2026

---

## 5. France (FR)

### Legal Framework

- **Consumer Code** (Code de la consommation)
- **Bloctel** (national do-not-call list — active until August 10, 2026)
- **Law of June 30, 2025** (transition to opt-in regime)
- **GDPR** (directly applicable)
- **CNIL** enforcement

### What can we do NOW (before August 2026)?

**Current regime (until August 10, 2026):**
- B2C cold calling is allowed IF:
  - Numbers are checked against Bloctel
  - Calls are Monday-Friday, 10:00-13:00 and 14:00-20:00
  - Max 4 contacts per month per consumer per organization
  - Consumer refusal during a call = 60-day no-contact period
- Pre-recorded/automated calls require explicit consent
- Energy renovation, housing adaptation, and CPF training sectors are already banned

### After August 11, 2026?

**Fundamental shift to OPT-IN:**
- ALL commercial calling to consumers requires prior "free, specific, informed, unambiguous, and revocable" consent
- Bloctel will be discontinued
- Consent must be verifiable and documented
- Contracts must include explicit provision about marketing calls

### Transactional/service calls exempt from Bloctel?

**YES.** Calls relating to a contract in progress are exempt from Bloctel restrictions. This exemption will SURVIVE the August 2026 transition to opt-in:
- Appointment reminders for booked services
- Payment reminders for existing contracts
- Delivery/service notifications
- Contract-related follow-ups

### B2B outbound?

**FAVORABLE.** B2B calls are NOT subject to:
- Bloctel restrictions
- Hour/frequency limitations for B2C
- The new opt-in consent requirement (post-August 2026)

B2B calling continues under GDPR legitimate interest framework. The CNIL applies a purpose-based test: the call must relate to the recipient's professional activity. Calling an accountant to sell swimming pools = B2C; calling an accountant to sell accounting software = B2B.

### France Risk Assessment: LOW-MEDIUM

**Actionable for SmartFlow CRM:**
- Transactional calls to existing customers: **GO** — exempt now and post-August 2026
- B2B outbound related to recipient's profession: **GO** — exempt from Bloctel and opt-in rules
- B2C marketing (before Aug 2026): **POSSIBLE** with Bloctel checking, hour/frequency compliance
- B2C marketing (after Aug 2026): **ONLY** with explicit opt-in consent
- AI disclosure: Implement before August 2026 (EU AI Act Art. 50)

---

## 6. Safe Use Cases Across Jurisdictions

### Tier 1: SAFE EVERYWHERE (with existing customer relationship)

| Use Case | TR | US | UK | DE | FR |
|----------|----|----|----|----|-----|
| Appointment reminders | SAFE (exempt) | SAFE (PEC) | SAFE (exempt) | SAFE (exempt) | SAFE (exempt) |
| Payment/collection reminders | SAFE (exempt) | SAFE (PEC) | SAFE (exempt) | SAFE (exempt) | SAFE (exempt) |
| Delivery/shipping notifications | SAFE (exempt) | SAFE (PEC) | SAFE (exempt) | SAFE (exempt) | SAFE (exempt) |
| Service status updates | SAFE (exempt) | SAFE (PEC) | SAFE (exempt) | SAFE (exempt) | SAFE (exempt) |

**These are the safest outbound use cases.** They are transactional/service-related, require only an existing customer relationship (no additional marketing consent), and are exempt from most marketing-specific regulations across all target markets.

### Tier 2: SAFE WITH CONSENT

| Use Case | TR | US | UK | DE | FR |
|----------|----|----|----|----|-----|
| Post-service follow-up | Consent needed | PEC OK | Depends on content | Depends on content | Exempt if contract-related |
| Survey/feedback calls | Consent needed | PEC OK | Depends on content | Consent needed | Exempt if contract-related |
| Existing customer upsell | İYS consent | PEWC needed | Specific automated consent | Express consent (B2C) | Consent needed (post-Aug 2026) |

**Key insight:** Post-service follow-up and surveys sit in a gray zone. Turkey and Germany classify satisfaction surveys as commercial. The US treats them as informational (lower consent). France exempts contract-related calls. UK depends on whether content is promotional.

### Tier 3: REQUIRES FULL MARKETING CONSENT

| Use Case | TR | US | UK | DE | FR |
|----------|----|----|----|----|-----|
| Marketing to new leads | İYS consent | PEWC | Specific automated consent | Express consent (B2C) | Opt-in (post-Aug 2026) |
| Cold outbound to consumers | NO-GO | NO-GO (without PEWC) | NO-GO (automated) | NO-GO | NO-GO (post-Aug 2026) |

### B2B Advantage Across Markets

| Market | B2B Treatment |
|--------|--------------|
| **Turkey** | Merchants/craftsmen exempt from consent (opt-out model) |
| **US** | Exempt from DNC; ATDS rules still apply to cell phones |
| **UK** | Live calls OK (check CTPS); automated calls still need consent |
| **Germany** | Presumed consent sufficient for interactive AI voicebots |
| **France** | Exempt from Bloctel and opt-in rules; GDPR legitimate interest |

---

## 7. Go-to-Market Strategy Recommendation

### Phase 1: Launch with Transactional Calls (Immediate — Q2 2026)

**Countries:** All five markets simultaneously
**Use cases:**
- Appointment reminders
- Payment reminders
- Delivery/service notifications
- Service status updates

**Why first:** These are exempt from marketing consent requirements in every target market. Only an existing customer/service relationship is needed. This is the lowest-risk, highest-value starting point.

**Consent mechanism:** Customer provides phone number when booking/purchasing through the SaaS platform. No additional marketing consent required.

**Positioning:** "Smart Customer Engagement" — not outbound marketing, but automated service notifications that improve customer experience.

### Phase 2: B2B Outbound (Q3 2026)

**Countries:** Turkey, France, Germany (in order of ease)
**Use cases:**
- Service-related outbound to business customers
- B2B outbound calling for products related to the recipient's business

**Why second:** B2B has favorable treatment across markets:
- Turkey: Merchant/craftsman exemption (opt-out only)
- France: Exempt from Bloctel and consumer restrictions
- Germany: Presumed consent for interactive AI voicebots with business relevance

**Consent mechanism:** Opt-out model (TR), legitimate interest (FR, DE). Document the business relationship and relevance.

### Phase 3: Consented Marketing (Q4 2026)

**Countries:** US first (most favorable), then UK, Turkey
**Use cases:**
- Customer re-engagement with consent
- Upselling to existing customers who opted in
- Follow-up on expressed interest

**Why third:** Requires building consent infrastructure:
- US: PEWC checkbox in platform (most straightforward)
- UK: Specific "automated call" consent
- Turkey: İYS registration and consent management

**Consent mechanism:** In-app consent flow:
1. Clear disclosure: "We may contact you via automated/AI-powered calls for [specific purposes]"
2. Affirmative checkbox (not pre-checked)
3. Not a condition of purchase/service
4. Easy revocation mechanism
5. Store consent with timestamp and method

### Phase 4: Scale with Full Compliance (2027)

**Add:** Survey/feedback calls, lead nurturing, expanded B2B prospecting
**Requires:** Full EU AI Act Article 50 compliance (AI disclosure at call start), mature consent management, analytics on opt-out rates

### Countries to AVOID for cold outbound

- **Germany (B2C):** Extremely strict, broad interpretation of "advertising," EUR 300,000 fines per violation
- **France (B2C, post-Aug 2026):** Full opt-in required, Bloctel enforcement is active
- **Any market without consent:** Risk is never worth it

### How to Position Outbound Calling

**DO say:**
- "Automated customer engagement"
- "Smart appointment reminders"
- "AI-powered service notifications"
- "Proactive customer communication"

**DO NOT say:**
- "Cold calling"
- "Telemarketing"
- "Robocalling"
- "Outbound sales dialer"

---

## 8. Implementation Checklist

### Technical Requirements

- [ ] AI disclosure at call start ("This is an automated call from [Business Name]") — required in all markets, mandatory under EU AI Act from August 2026
- [ ] Opt-out mechanism in every call ("Press 1 or say 'stop' to opt out")
- [ ] Consent management system integrated with İYS API (Turkey)
- [ ] Call time restrictions engine (Turkey: 08:00-21:00; France B2C: Mon-Fri 10:00-13:00, 14:00-20:00)
- [ ] Frequency limiting (France: max 4 contacts/month/consumer)
- [ ] Consent audit trail with timestamps (Germany: 5-year retention; Turkey: 3-year retention)
- [ ] DNC/TPS/CTPS/Bloctel list checking integration
- [ ] Call recording/logging for compliance evidence
- [ ] Per-tenant, per-country compliance rule engine

### Legal/Administrative Requirements

- [ ] İYS registration (Turkey) — including apostilled documents for foreign entities
- [ ] ICO registration (UK) if processing UK personal data
- [ ] CNIL compliance documentation (France)
- [ ] Privacy policy updates covering outbound calling
- [ ] Terms of service updates with consent language
- [ ] Data Processing Agreements with telephony providers

### Consent Flow Design

```
[Customer signs up / books service]
        |
        v
[Provide phone number] --> Sufficient for Tier 1 (transactional calls)
        |
        v
[Optional: Marketing consent checkbox]
  "I agree to receive automated/AI-powered calls from [Business]
   about [specific topics]. I can opt out at any time."
        |
        v
[Store: consent type, timestamp, method, IP, country]
        |
        v
[Sync to İYS (Turkey) within 3 business days]
```

---

## Legal References

### Turkey
- Law No. 6563 (E-Commerce Law)
- Regulation on Commercial Communication and Commercial Electronic Messages (amended Jan 4, 2020)
- KVKK (Law No. 6698)
- Electronic Communications Law No. 5809

### United States
- TCPA, 47 U.S.C. § 227
- FCC Declaratory Ruling on AI Voices (Feb 8, 2024)
- Facebook v. Duguid, 141 S. Ct. 1163 (2021)
- Fifth Circuit PEWC ruling (Feb 2026)
- FCC NPRM on AI-Generated Calls (Aug 2024)

### United Kingdom
- PECR 2003 (Regulations 19 and 21)
- UK GDPR
- Data (Use and Access) Act 2025

### Germany
- UWG §7, §7a (Unfair Competition Act)
- GDPR
- EU AI Act, Article 50

### France
- Code de la consommation
- Law of June 30, 2025 (opt-in transition)
- Bloctel regulations
- GDPR

### EU-wide
- EU AI Act (Regulation 2024/1689), Article 50 — effective August 2, 2026

---

## Disclaimer

This analysis is for business planning purposes and does not constitute legal advice. Regulations in this space are evolving rapidly. Consult qualified legal counsel in each jurisdiction before launching outbound calling services.

---

## Sources

- [Turkey İYS FAQ — İTMAT Global](https://www.itimatglobal.com/en/what-is-iys-message-management-system-what-are-the-frequently-asked-questions-about-iys/)
- [Turkey Electronic Commercial Messages FAQ — BTS Legal](https://www.bts-legal.com/insights/publications/electronic-commercial-messages-in-turkey-faqs-on-registration-requirement-before-the-commercial-electronic-message-management-system-for-non-resident-service-providers/)
- [Turkey İYS System — Ozbek Attorney Partnership](https://www.ozbek.av.tr/publications/turkey-s-new-commercial-electronic-message-management-system/)
- [Turkey İYS — Mondaq](https://www.mondaq.com/turkey/contracts-and-commercial-law/982314/opening-the-black-box-facts-about-turkeys-new-electronic-messages-management-system)
- [Turkey Commercial Electronic Messages — CMS LawNow](https://cms-lawnow.com/en/ealerts/2021/01/turkey-introduces-commercial-electronic-communication-management-system)
- [Turkey Direct Marketing — DLA Piper](https://www.dlapiperdataprotection.com/?t=electronic-marketing&c=TR)
- [KVKK 2025 SME Exemptions — Cebeci Law](https://cebecihukuk.com/en/announcement/kvkk-2025-regulation-new-exemption-rules-affecting-smes-and-small-businesses)
- [FCC AI Voice Declaratory Ruling](https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices)
- [TCPA 2025 Updates — Kixie](https://www.kixie.com/sales-blog/ai-powered-robocalls-in-2025-a-guide-to-the-new-rules/)
- [Fifth Circuit PEWC Ruling — Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/03/tcpa-reset-fifth-circuit-rejects-prior-express-written-consent-rule)
- [FCC Consent Revocation Rules — Nixon Peabody](https://www.nixonpeabody.com/insights/alerts/2025/04/11/fcc-partially-delays-new-tcpa-consent-revocation-rules)
- [FCC One-to-One Consent — Consumer Financial Services Law Monitor](https://www.consumerfinancialserviceslawmonitor.com/2025/09/fccs-final-rule-on-consent-kills-one-to-one-consent-requirement/)
- [TCPA B2B Risks — DNC.com](https://www.dnc.com/dnc-tcpa-guides-and-checklists/risks-b2b-under-tcpa)
- [UK PECR Guide — ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/)
- [UK PECR Telephone Marketing — ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/telephone-marketing/)
- [UK AI Cold Calling Laws — Compare Telemarketing](https://comparetelemarketing.co.uk/telemarketing-insigh/laws-surrounding-ai-cold-calling-in-the-uk-2025/)
- [UK AI Voice Agents — DialShark](https://dialshark.ai/blog/ai-voice-agents/are-ai-voice-agents-legal-for-cold-calling-in-the-uk-pecr-ico-explained/)
- [UK Data (Use and Access) Act — Blake Morgan](https://www.blakemorgan.co.uk/data-use-and-access-act-2025-privacy-and-electronic-communications-regulations/)
- [Germany Outbound Regulations — TALK-Q](https://talk-q.com/outbound-call-regulations-in-germany)
- [Germany AI Voicebots B2B — PayTechLaw](https://paytechlaw.com/en/call-center-use-of-voicebots-b2b-direct-marketing/)
- [Germany Cold Calling 2025 — Marken.Legal](https://marken.legal/en/cold-calling-prohibited/)
- [Germany B2B Cold Calling — Messor](https://messor.fr/en/growth-haking-en/cold-calling-b2b-germany)
- [Cold Calling Laws Europe 2026 — Dealfront](https://www.dealfront.com/blog/essential-guide-to-cold-calling-and-emailing/)
- [France Outbound Regulations — TALK-Q](https://talk-q.com/outbound-call-regulations-in-france)
- [France Opt-In Law 2026 — Nixxis](https://www.nixxis.com/cold-calling-what-the-august-11-2026-law-will-change-for-call-centers/)
- [France Telemarketing Ban — Fieldfisher](https://www.fieldfisher.com/en/insights/france-bans-telemarketing-without-consent)
- [France B2B Telemarketing — HUHU.fr](https://num.huhu.fr/en/knowledge/regulations/b2b-telemarketing-different-rules)
- [France Bloctel 2025 Changes — HUHU.fr](https://num.huhu.fr/en/knowledge/regulations/bloctel-2025-what-changes-for-businesses)
- [EU AI Act Article 50 — Official](https://artificialintelligenceact.eu/article/50/)
- [EU AI Act Transparency Code of Practice — Ashurst](https://www.ashurst.com/en/insights/transparency-of-ai-generated-content-the-eu-first-draft-code-of-practice/)
