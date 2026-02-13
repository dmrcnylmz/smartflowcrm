/**
 * Outbound Email Sequences — SMB + Enterprise
 * 
 * Production-ready email templates for:
 * 1. SMB outbound cold sequence (5 emails)
 * 2. Enterprise outbound sequence (4 emails)
 * 3. Trial nurture/conversion sequence (Day 0-3)
 * 4. Post-trial re-engagement (2 emails)
 * 
 * All pricing in minutes. Trial = 3 days, 100 minutes.
 */

const EMAIL_SEQUENCES = {

    // ═══════════════════════════════════════════════════
    // 1. SMB OUTBOUND — Cold to Demo (5 emails, 14 days)
    // ═══════════════════════════════════════════════════
    smb_outbound: {
        name: "SMB Cold Outbound",
        target: "Owners/managers at businesses with 5-50 employees",
        goal: "Self-serve signup → trial activation",
        emails: [
            {
                id: "smb_01_opener",
                day: 0,
                subject: "Quick question about {{company_name}}'s phone lines",
                body: `Hi {{first_name}},

I noticed {{company_name}} gets a lot of customer calls — do you ever miss any after hours or when your team is busy?

We built an AI that answers your phone 24/7, sounds completely human, and books appointments directly into your calendar. It handles everything from FAQs to complaints.

The setup takes 60 seconds and you get 100 free minutes to test it.

Would it be worth 60 seconds to see if it works for {{company_name}}?

{{signature}}

P.S. — Here's a 30-second demo of a real AI call: {{demo_link}}`,
                send_time: "Tue-Thu, 9:30am local",
                expected_open_rate: "28-35%",
                expected_reply_rate: "3-5%"
            },
            {
                id: "smb_02_value",
                day: 3,
                subject: "The $3,200/month question",
                body: `{{first_name}},

Quick math on missed calls:

- Average business misses 40% of incoming calls
- Each missed call = ~$80 in lost revenue (appointments, sales, referrals)
- At just 10 missed calls/week, that's $3,200/month walking out the door

Our AI answers every call in under 1 second. No hold music. No voicemail. No missed revenue.

One of our customers (a dental practice similar to yours) went from missing 40% to answering 100% — their bookings doubled in 30 days.

Try it free: {{signup_link}} (100 minutes, no credit card)

{{signature}}`,
                send_time: "Tue-Thu, 10:00am local"
            },
            {
                id: "smb_03_case_study",
                day: 6,
                subject: "How {{similar_company}} handles 200 calls/week with zero staff",
                body: `{{first_name}},

{{similar_company}} (a {{industry}} business like yours) was spending $4,500/month on a receptionist who still couldn't cover evenings and weekends.

They switched to our AI call agent:
✓ 100% of calls answered, 24/7
✓ 80% resolved without human handoff
✓ Total cost: $149/month (2,000 minutes included)
✓ Setup time: 8 minutes

The AI handles appointment booking, FAQs, and complaint logging. When something needs a human, it transfers seamlessly.

See their results: {{case_study_link}}

Or just try it yourself: {{signup_link}}

{{signature}}`,
                send_time: "Mon/Wed, 10:00am local"
            },
            {
                id: "smb_04_objection",
                day: 10,
                subject: "\"Won't customers hate talking to AI?\"",
                body: `{{first_name}},

Fair question — it's the first thing everyone asks.

Here's what actually happens: 94% of callers don't realize they're talking to AI until we tell them.

The voice is natural, it handles interruptions, pauses appropriately, and adapts its tone. It sounds like a well-trained receptionist, not a chatbot.

But don't take my word for it — call this number and try it yourself:

📞 {{demo_phone_number}}

That's our demo AI agent. It'll book you a fake appointment in about 90 seconds.

If it passes your test, try it on your real calls for free: {{signup_link}}

{{signature}}`,
                send_time: "Tue-Thu, 9:00am local"
            },
            {
                id: "smb_05_breakup",
                day: 14,
                subject: "Closing the loop on this",
                body: `{{first_name}},

Last note from me — I don't want to be the AI company that spams you.

If now isn't the right time, I totally get it. But in case it's helpful:

→ 60-second setup, no technical skills needed
→ 100 free minutes (enough for ~25 test calls)
→ No credit card, no contract
→ Cancel with one click

If you ever want to try it: {{signup_link}}

Either way, wishing {{company_name}} all the best.

{{signature}}`,
                send_time: "Fri, 11:00am local"
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // 2. ENTERPRISE OUTBOUND (4 emails, 21 days)
    // ═══════════════════════════════════════════════════
    enterprise_outbound: {
        name: "Enterprise Outbound",
        target: "VP Operations / CX Directors at 200+ employee companies",
        goal: "Book a demo call → custom pilot proposal",
        emails: [
            {
                id: "ent_01_executive",
                day: 0,
                subject: "Reducing {{company_name}}'s call center COGS by 55%",
                body: `{{first_name}},

Quick context: we help companies like {{peer_company}} reduce call center operating costs by 50-70% while improving answer rates to 100%.

Our AI voice agents handle Tier 1 calls end-to-end — appointments, FAQs, status inquiries, complaint intake — at $0.02/minute COGS vs. $0.25+/minute for human agents.

For a team handling {{estimated_volume}} calls/month, that could mean \${{estimated_savings}}/year in savings without any reduction in service quality.

Worth a 20-minute conversation to see if the math works for {{company_name}}?

I can share a custom ROI analysis based on your current volume.

{{signature}}`,
                send_time: "Tue-Wed, 8:00am local"
            },
            {
                id: "ent_02_roi",
                day: 5,
                subject: "ROI model for {{company_name}}'s call operations",
                body: `{{first_name}},

I put together a rough ROI estimate for {{company_name}} based on your industry's average call patterns:

| Metric | Current (est.) | With AI |
|--------|---------------|---------|
| Monthly call volume | {{estimated_volume}} | {{estimated_volume}} |
| Cost per handled minute | $0.25-0.40 | $0.05 |
| After-hours coverage | Limited | 24/7 |
| Average answer time | 15-30 sec | <1 sec |
| Estimated monthly cost | \${{current_cost}} | \${{ai_cost}} |

That's a potential savings of \${{monthly_savings}}/month — \${{annual_savings}}/year.

These numbers are based on our Enterprise plan ($499/month, 10,000 minutes included, $0.05/min overage). Higher volumes get custom pricing.

Happy to walk through a model specific to your team. 20 minutes — I'll do most of the talking.

{{calendar_link}}

{{signature}}`,
                send_time: "Mon-Wed, 8:30am local"
            },
            {
                id: "ent_03_pilot",
                day: 12,
                subject: "2-week pilot proposal for {{company_name}}",
                body: `{{first_name}},

Instead of a big commitment, here's what our enterprise clients usually do:

**2-Week Pilot Program:**
1. We configure AI agents for your top 3 call types
2. Run parallel with your existing team (shadow mode)
3. Compare: resolution rate, handle time, customer satisfaction
4. Full analytics dashboard shared daily

No disruption to your current operations. Zero risk.

At the end of 2 weeks, you'll have hard data showing exactly how AI performs vs. your current setup.

If the numbers work, we build a custom rollout plan. If they don't, you've lost nothing.

Interested? Pick a time: {{calendar_link}}

{{signature}}`,
                send_time: "Tue-Thu, 9:00am local"
            },
            {
                id: "ent_04_champion",
                day: 21,
                subject: "Internal champion kit for {{company_name}}",
                body: `{{first_name}},

I know buying decisions at organizations like {{company_name}} involve multiple stakeholders. If this is something you'd like to explore but need to build internal support, I've put together a champion kit:

📊 ROI calculator (customizable to your numbers)
📋 Security & compliance overview (SOC 2, HIPAA-ready)
🎧 Demo recording of a real AI call
📈 Case study: Similar enterprise reduced costs by 55%

I can send these over, or if you'd prefer, I'm happy to do a 20-minute briefing for your team.

Either way — no pressure. Just wanted to arm you with the materials if you need them.

{{signature}}`,
                send_time: "Wed, 9:00am local"
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // 3. TRIAL NURTURE — Day 0, 1, 2, 3 (conversion focus)
    // ═══════════════════════════════════════════════════
    trial_nurture: {
        name: "Trial Conversion Sequence",
        target: "New trial signups",
        goal: "Trial → paid conversion within 3 days",
        emails: [
            {
                id: "trial_00_welcome",
                day: 0,
                trigger: "signup_completed",
                subject: "Welcome to SmartFlow! Your AI agent is ready 🎙️",
                body: `Hi {{first_name}},

You're in! Here's what you have:

✅ **100 free minutes** — enough for ~25 AI calls
✅ **3-day trial** — all features unlocked
✅ **Your setup link:** {{setup_wizard_link}}

**Get your first call in 60 seconds:**
1. Click the link above
2. Tell your agent about your business (2 minutes)
3. Make a test call to hear it live

Your AI agent is standing by. Let's go.

— The SmartFlow Team

P.S. — Need help? Reply to this email and a real human will answer within 1 hour.`,
                send_time: "Immediately on signup"
            },
            {
                id: "trial_01_day1",
                day: 1,
                trigger: "time_based",
                subject: "{{first_name}}, did you make your first test call?",
                body: `Hi {{first_name}},

Quick check-in — have you had a chance to make your first test call?

{{#if has_made_call}}
Nice! You've already used {{minutes_used}} of your 100 free minutes. Here's what your AI handled so far:
- {{call_count}} calls answered
- Average call: {{avg_duration}} minutes

To get even more out of your trial, try customizing your agent's greeting and knowledge base: {{agent_config_link}}
{{else}}
Getting started is easy:

📞 **Option 1:** Call your AI number directly: {{ai_phone_number}}
🖥️ **Option 2:** Initiate a test call from your dashboard: {{dashboard_link}}

It takes literally 30 seconds. Your agent already knows the basics — just call and chat.
{{/if}}

**Reminder:** Your trial expires in {{hours_remaining}} hours. Make those 100 minutes count!

— SmartFlow Team`,
                send_time: "24 hours after signup"
            },
            {
                id: "trial_02_day2",
                day: 2,
                trigger: "time_based",
                subject: "⏰ 24 hours left — here's what you'd lose",
                body: `{{first_name}},

Your trial expires tomorrow. Here's what goes away:

❌ AI answering your calls 24/7
❌ Automatic appointment booking
❌ Call recordings and transcripts
❌ Real-time analytics dashboard

Here's what staying costs:

**Starter: $49/month** — 500 minutes included
That's $0.10/minute, compared to $0.30+/minute for a human receptionist.

{{#if minutes_used > 0}}
You've already used {{minutes_used}} minutes. At that pace, you'd use about {{projected_monthly}} minutes/month — the Starter plan would save you ~\${{projected_savings}}/month vs. a part-time receptionist.
{{/if}}

👉 **Upgrade now and keep your AI agent running:** {{upgrade_link}}

No contract. Cancel anytime. Upgrade takes 30 seconds.

— SmartFlow Team`,
                send_time: "48 hours after signup"
            },
            {
                id: "trial_03_expiring",
                day: 3,
                trigger: "trial_expiring",
                subject: "Your AI agent goes offline tonight",
                body: `{{first_name}},

This is it — your trial expires in {{hours_remaining}} hours.

After that, your AI agent stops answering calls and your number goes inactive.

**Here's the good news:** upgrading takes 30 seconds and your agent keeps running with zero downtime.

| Plan | Price | Minutes | Best For |
|------|-------|---------|----------|
| Starter | $49/mo | 500 min | Small teams |
| Pro | $149/mo | 2,000 min | Growing businesses |
| Enterprise | $499/mo | 10,000 min | High-volume teams |

👉 {{upgrade_link}}

**If now isn't the right time**, no worries. Your configuration is saved for 30 days — you can reactivate anytime.

— SmartFlow Team`,
                send_time: "3 hours before trial expiry"
            }
        ]
    },

    // ═══════════════════════════════════════════════════
    // 4. POST-TRIAL RE-ENGAGEMENT (2 emails)
    // ═══════════════════════════════════════════════════
    post_trial_reengagement: {
        name: "Post-Trial Re-Engagement",
        target: "Trial users who didn't convert",
        goal: "Re-activate lapsed trials",
        emails: [
            {
                id: "reeng_01_day7",
                day: 7,
                trigger: "trial_expired_no_conversion",
                subject: "We saved your AI agent",
                body: `Hi {{first_name}},

Your trial ended {{days_since}} days ago, but we saved your entire setup:
- Your AI agent configuration ✅
- Your call history and recordings ✅
- Your phone number (reserved for 30 days) ✅

One click and you're back online: {{reactivate_link}}

If budget was the issue — we get it. Reply to this email and I'll see what I can do.

— {{rep_name}}, SmartFlow`,
                send_time: "7 days after trial expiry"
            },
            {
                id: "reeng_02_day21",
                day: 21,
                trigger: "trial_expired_no_conversion",
                subject: "Last call before we release your number",
                body: `{{first_name}},

Heads up — we're releasing your reserved phone number and AI agent configuration in 7 days.

{{#if minutes_used > 0}}
During your trial, your AI handled {{call_count}} calls in {{minutes_used}} minutes. That's {{call_count}} customers who would've gotten voicemail.
{{/if}}

If you want to keep everything: {{reactivate_link}}

After that, you'd need to set up from scratch (takes 5 min, but still).

No hard feelings either way. Thanks for trying SmartFlow.

— {{rep_name}}`,
                send_time: "21 days after trial expiry"
            }
        ]
    }
};

module.exports = EMAIL_SEQUENCES;
