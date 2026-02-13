#!/usr/bin/env python3
"""
Monte Carlo Cost Simulator — AI Voice Call Center SaaS
======================================================

Runs 10,000+ iterations to project COGS, revenue, and margin
under realistic call distributions.

All customer-facing outputs are in MINUTES only.
Token/character metrics are internal COGS components.

Usage:
    python3 monte_carlo_simulator.py [--iterations 10000] [--plan starter]

Output:
    - Per-call COGS distribution (P5, P25, P50, P75, P95)
    - Monthly revenue/margin projections by plan
    - Break-even analysis
    - Investor-ready summary JSON
"""

import random
import math
import json
import argparse
import statistics
from dataclasses import dataclass, field, asdict
from typing import List, Dict

# ═══════════════════════════════════════════════════════════
# PROVIDER RATES (Feb 2026 — synced with Node.js service)
# ═══════════════════════════════════════════════════════════

PROVIDER_RATES = {
    "twilio": {
        "inbound_per_min": 0.0085,
        "outbound_per_min": 0.014,
    },
    "deepgram": {
        "stt_per_second": 0.0002,      # Nova-2
    },
    "elevenlabs": {
        "tts_per_character": 0.00003,  # Turbo v2.5
    },
    "openai": {
        "input_per_token": 0.00000015,  # GPT-4o-mini $0.15/1M
        "output_per_token": 0.0000006,  # GPT-4o-mini $0.60/1M
    },
    "self_hosted": {
        "stt_per_second": 0.00005,
        "tts_per_character": 0.000005,
        "input_per_token": 0.00000005,
        "output_per_token": 0.0000002,
    },
}

# ═══════════════════════════════════════════════════════════
# PLANS — Customer sees ONLY these fields
# ═══════════════════════════════════════════════════════════

PLANS = {
    "free_trial":  {"fee": 0,   "included_min": 100,   "overage_rate": 0.00, "max_agents": 2},
    "starter":     {"fee": 49,  "included_min": 500,   "overage_rate": 0.12, "max_agents": 5},
    "pro":         {"fee": 149, "included_min": 2000,  "overage_rate": 0.08, "max_agents": 20},
    "enterprise":  {"fee": 499, "included_min": 10000, "overage_rate": 0.05, "max_agents": 100},
}

# ═══════════════════════════════════════════════════════════
# CALL DISTRIBUTIONS — Realistic scenarios
# ═══════════════════════════════════════════════════════════

# Call duration in seconds: lognormal distribution
# μ=5.1, σ=0.6 → median ~164s (2.7 min), mean ~180s (3 min), tail to 600s
CALL_DURATION_MU = 5.1
CALL_DURATION_SIGMA = 0.6

# Talk ratio: what fraction of call has active speech
# Beta(4, 2) → mean 0.67, range 0.3-0.95
TALK_RATIO_ALPHA = 4
TALK_RATIO_BETA = 2

# STT ratio: fraction of speech that is customer talking (STT input)
STT_RATIO_MEAN = 0.50
STT_RATIO_STD = 0.10

# TTS: characters per second of AI speech
TTS_CHARS_PER_SEC = 15

# LLM: tokens per call turn
LLM_TURNS_MU = 3.5       # avg turns per call
LLM_TURNS_SIGMA = 1.5
LLM_INPUT_PER_TURN = 350  # tokens (context + prompt)
LLM_OUTPUT_PER_TURN = 120 # tokens (response)

# Call type distribution
CALL_TYPE_DIST = {
    "simple_faq":    0.30,   # 1-2 min, 1-2 turns
    "appointment":   0.25,   # 2-3 min, 3-4 turns
    "complaint":     0.15,   # 3-5 min, 4-6 turns
    "order_status":  0.15,   # 1-2 min, 2-3 turns
    "escalation":    0.10,   # 2-4 min, 2-3 turns (AI + handoff)
    "complex":       0.05,   # 5-8 min, 6-10 turns
}

CALL_TYPE_PARAMS = {
    "simple_faq":   {"dur_mu": 4.6, "dur_sigma": 0.3, "turns_mu": 1.5, "turns_sigma": 0.5},
    "appointment":  {"dur_mu": 5.0, "dur_sigma": 0.4, "turns_mu": 3.5, "turns_sigma": 1.0},
    "complaint":    {"dur_mu": 5.4, "dur_sigma": 0.5, "turns_mu": 5.0, "turns_sigma": 1.5},
    "order_status": {"dur_mu": 4.5, "dur_sigma": 0.3, "turns_mu": 2.5, "turns_sigma": 0.8},
    "escalation":   {"dur_mu": 5.1, "dur_sigma": 0.5, "turns_mu": 2.5, "turns_sigma": 1.0},
    "complex":      {"dur_mu": 5.8, "dur_sigma": 0.4, "turns_mu": 8.0, "turns_sigma": 2.0},
}


@dataclass
class CallSimResult:
    """Result of simulating a single call."""
    call_type: str
    duration_sec: float
    duration_min: float
    stt_sec: float
    tts_chars: int
    llm_input_tokens: int
    llm_output_tokens: int
    cogs_twilio: float
    cogs_stt: float
    cogs_tts: float
    cogs_llm: float
    cogs_total: float
    cogs_per_min: float


@dataclass
class MonthlyProjection:
    """Monthly revenue/cost projection for a plan."""
    plan: str
    monthly_calls: int
    total_minutes: float
    included_minutes: int
    overage_minutes: float
    subscription_fee: float
    overage_revenue: float
    total_revenue: float
    total_cogs: float
    gross_margin: float
    margin_pct: float
    cogs_per_call: float
    cogs_per_min: float


def simulate_call(direction="inbound", self_hosted=False) -> CallSimResult:
    """Simulate a single call with realistic distributions."""
    # Pick call type
    r = random.random()
    cumulative = 0
    call_type = "simple_faq"
    for ct, prob in CALL_TYPE_DIST.items():
        cumulative += prob
        if r <= cumulative:
            call_type = ct
            break

    params = CALL_TYPE_PARAMS[call_type]

    # Duration (lognormal)
    duration_sec = min(random.lognormvariate(params["dur_mu"], params["dur_sigma"]), 900)  # cap 15 min
    duration_min = duration_sec / 60

    # Talk ratio (beta distribution)
    talk_ratio = min(max(random.betavariate(TALK_RATIO_ALPHA, TALK_RATIO_BETA), 0.2), 0.95)
    active_speech_sec = duration_sec * talk_ratio

    # STT seconds (customer speech)
    stt_ratio = max(0.2, min(0.8, random.gauss(STT_RATIO_MEAN, STT_RATIO_STD)))
    stt_sec = active_speech_sec * stt_ratio

    # TTS (AI speech)
    ai_speech_sec = active_speech_sec * (1 - stt_ratio)
    tts_chars = int(ai_speech_sec * TTS_CHARS_PER_SEC)

    # LLM turns
    turns = max(1, int(random.gauss(params["turns_mu"], params["turns_sigma"])))
    llm_input = turns * LLM_INPUT_PER_TURN + 500  # +500 for system prompt
    llm_output = turns * LLM_OUTPUT_PER_TURN

    # ─── COGS Calculation ─────────────────
    rates = PROVIDER_RATES

    # Twilio
    twilio_rate = rates["twilio"]["outbound_per_min"] if direction == "outbound" else rates["twilio"]["inbound_per_min"]
    cogs_twilio = duration_min * twilio_rate

    # STT
    if self_hosted:
        cogs_stt = stt_sec * rates["self_hosted"]["stt_per_second"]
    else:
        cogs_stt = stt_sec * rates["deepgram"]["stt_per_second"]

    # TTS
    if self_hosted:
        cogs_tts = tts_chars * rates["self_hosted"]["tts_per_character"]
    else:
        cogs_tts = tts_chars * rates["elevenlabs"]["tts_per_character"]

    # LLM
    if self_hosted:
        cogs_llm = (llm_input * rates["self_hosted"]["input_per_token"] +
                     llm_output * rates["self_hosted"]["output_per_token"])
    else:
        cogs_llm = (llm_input * rates["openai"]["input_per_token"] +
                     llm_output * rates["openai"]["output_per_token"])

    cogs_total = cogs_twilio + cogs_stt + cogs_tts + cogs_llm
    cogs_per_min = cogs_total / duration_min if duration_min > 0 else 0

    return CallSimResult(
        call_type=call_type,
        duration_sec=round(duration_sec, 1),
        duration_min=round(duration_min, 3),
        stt_sec=round(stt_sec, 1),
        tts_chars=tts_chars,
        llm_input_tokens=llm_input,
        llm_output_tokens=llm_output,
        cogs_twilio=round(cogs_twilio, 6),
        cogs_stt=round(cogs_stt, 6),
        cogs_tts=round(cogs_tts, 6),
        cogs_llm=round(cogs_llm, 6),
        cogs_total=round(cogs_total, 6),
        cogs_per_min=round(cogs_per_min, 6),
    )


def run_simulation(iterations: int = 10000, self_hosted: bool = False) -> Dict:
    """Run Monte Carlo simulation."""
    results: List[CallSimResult] = []

    for _ in range(iterations):
        direction = "outbound" if random.random() < 0.15 else "inbound"  # 85% inbound
        results.append(simulate_call(direction=direction, self_hosted=self_hosted))

    # ─── Statistics ───────────────────────
    cogs_list = [r.cogs_total for r in results]
    cogs_per_min_list = [r.cogs_per_min for r in results]
    duration_list = [r.duration_min for r in results]

    cogs_list.sort()
    cogs_per_min_list.sort()

    def percentile(lst, p):
        idx = int(len(lst) * p / 100)
        return round(lst[min(idx, len(lst) - 1)], 6)

    cogs_stats = {
        "mean": round(statistics.mean(cogs_list), 6),
        "median": round(statistics.median(cogs_list), 6),
        "stdev": round(statistics.stdev(cogs_list), 6),
        "p5": percentile(cogs_list, 5),
        "p25": percentile(cogs_list, 25),
        "p50": percentile(cogs_list, 50),
        "p75": percentile(cogs_list, 75),
        "p95": percentile(cogs_list, 95),
        "p99": percentile(cogs_list, 99),
        "min": round(min(cogs_list), 6),
        "max": round(max(cogs_list), 6),
    }

    cogs_per_min_stats = {
        "mean": round(statistics.mean(cogs_per_min_list), 6),
        "median": round(statistics.median(cogs_per_min_list), 6),
        "p5": percentile(cogs_per_min_list, 5),
        "p95": percentile(cogs_per_min_list, 95),
    }

    duration_stats = {
        "mean_min": round(statistics.mean(duration_list), 2),
        "median_min": round(statistics.median(duration_list), 2),
        "stdev_min": round(statistics.stdev(duration_list), 2),
    }

    # COGS composition
    avg_twilio = round(statistics.mean([r.cogs_twilio for r in results]), 6)
    avg_stt = round(statistics.mean([r.cogs_stt for r in results]), 6)
    avg_tts = round(statistics.mean([r.cogs_tts for r in results]), 6)
    avg_llm = round(statistics.mean([r.cogs_llm for r in results]), 6)
    avg_total = avg_twilio + avg_stt + avg_tts + avg_llm

    cogs_composition = {
        "twilio_pct": round(avg_twilio / avg_total * 100, 1) if avg_total > 0 else 0,
        "stt_pct": round(avg_stt / avg_total * 100, 1) if avg_total > 0 else 0,
        "tts_pct": round(avg_tts / avg_total * 100, 1) if avg_total > 0 else 0,
        "llm_pct": round(avg_llm / avg_total * 100, 1) if avg_total > 0 else 0,
    }

    # Call type distribution (actual)
    type_counts = {}
    for r in results:
        type_counts[r.call_type] = type_counts.get(r.call_type, 0) + 1
    type_dist = {k: round(v / iterations * 100, 1) for k, v in type_counts.items()}

    # ─── Monthly Projections ──────────────
    monthly_scenarios = [
        ("starter", 200),
        ("starter", 500),
        ("pro", 1500),
        ("pro", 3000),
        ("enterprise", 8000),
        ("enterprise", 15000),
    ]

    projections = []
    for plan_name, monthly_calls in monthly_scenarios:
        plan = PLANS[plan_name]
        
        # Sample calls from our simulation
        sample = random.choices(results, k=monthly_calls)
        total_minutes = sum(r.duration_min for r in sample)
        total_cogs = sum(r.cogs_total for r in sample)

        overage_min = max(0, total_minutes - plan["included_min"])
        overage_rev = overage_min * plan["overage_rate"]
        total_rev = plan["fee"] + overage_rev
        margin = total_rev - total_cogs
        margin_pct = (margin / total_rev * 100) if total_rev > 0 else 0

        projections.append(MonthlyProjection(
            plan=plan_name,
            monthly_calls=monthly_calls,
            total_minutes=round(total_minutes, 1),
            included_minutes=plan["included_min"],
            overage_minutes=round(overage_min, 1),
            subscription_fee=plan["fee"],
            overage_revenue=round(overage_rev, 2),
            total_revenue=round(total_rev, 2),
            total_cogs=round(total_cogs, 2),
            gross_margin=round(margin, 2),
            margin_pct=round(margin_pct, 1),
            cogs_per_call=round(total_cogs / monthly_calls, 4),
            cogs_per_min=round(total_cogs / total_minutes, 4) if total_minutes > 0 else 0,
        ))

    # ─── Break-Even Analysis ─────────────
    avg_cogs_per_min = cogs_per_min_stats["mean"]
    breakeven = {}
    for plan_name, plan in PLANS.items():
        if plan["fee"] > 0:
            # Break-even = subscription fee / (revenue_per_min - cogs_per_min)
            # Within included minutes, revenue_per_min = fee / included_min
            rev_per_min_included = plan["fee"] / plan["included_min"]
            net_per_min = rev_per_min_included - avg_cogs_per_min
            if net_per_min > 0:
                be_calls = math.ceil(plan["included_min"] / duration_stats["mean_min"])
                breakeven[plan_name] = {
                    "fee": plan["fee"],
                    "revenue_per_included_min": round(rev_per_min_included, 4),
                    "cogs_per_min": round(avg_cogs_per_min, 4),
                    "net_per_min": round(net_per_min, 4),
                    "margin_on_included": round(net_per_min / rev_per_min_included * 100, 1),
                    "overage_margin": round((plan["overage_rate"] - avg_cogs_per_min) / plan["overage_rate"] * 100, 1) if plan["overage_rate"] > 0 else 0,
                }

    return {
        "iterations": iterations,
        "self_hosted": self_hosted,
        "cogs_per_call": cogs_stats,
        "cogs_per_minute": cogs_per_min_stats,
        "duration": duration_stats,
        "cogs_composition": cogs_composition,
        "call_type_distribution": type_dist,
        "monthly_projections": [asdict(p) for p in projections],
        "breakeven_analysis": breakeven,
    }


def print_report(result: Dict):
    """Print investor-ready report to stdout."""
    print("=" * 70)
    print("  MONTE CARLO COST SIMULATION — AI Voice Call Center")
    print(f"  Iterations: {result['iterations']:,}")
    print(f"  Infrastructure: {'Self-Hosted GPU' if result['self_hosted'] else 'Cloud APIs'}")
    print("=" * 70)

    print("\n📊 PER-CALL COGS DISTRIBUTION")
    print("-" * 40)
    cs = result["cogs_per_call"]
    print(f"  Mean:    ${cs['mean']:.4f}")
    print(f"  Median:  ${cs['median']:.4f}")
    print(f"  P5:      ${cs['p5']:.4f}")
    print(f"  P25:     ${cs['p25']:.4f}")
    print(f"  P75:     ${cs['p75']:.4f}")
    print(f"  P95:     ${cs['p95']:.4f}")
    print(f"  P99:     ${cs['p99']:.4f}")
    print(f"  StdDev:  ${cs['stdev']:.4f}")

    print("\n📊 COGS PER MINUTE")
    print("-" * 40)
    cm = result["cogs_per_minute"]
    print(f"  Mean:    ${cm['mean']:.4f}/min")
    print(f"  Median:  ${cm['median']:.4f}/min")
    print(f"  P5-P95:  ${cm['p5']:.4f} — ${cm['p95']:.4f}/min")

    print("\n📊 CALL DURATION")
    print("-" * 40)
    d = result["duration"]
    print(f"  Mean:    {d['mean_min']:.1f} min")
    print(f"  Median:  {d['median_min']:.1f} min")

    print("\n🔧 COGS COMPOSITION")
    print("-" * 40)
    cc = result["cogs_composition"]
    print(f"  Twilio (telephony):  {cc['twilio_pct']}%")
    print(f"  Deepgram (STT):      {cc['stt_pct']}%")
    print(f"  ElevenLabs (TTS):    {cc['tts_pct']}%")
    print(f"  OpenAI (LLM):        {cc['llm_pct']}%")

    print("\n💰 MONTHLY PROJECTIONS (Customer sees: fee + overage)")
    print("-" * 70)
    print(f"  {'Plan':<12} {'Calls':>7} {'Minutes':>8} {'Overage':>8} {'Revenue':>10} {'COGS':>8} {'Margin':>8}")
    print(f"  {'-'*12} {'-'*7} {'-'*8} {'-'*8} {'-'*10} {'-'*8} {'-'*8}")
    for p in result["monthly_projections"]:
        print(f"  {p['plan']:<12} {p['monthly_calls']:>7,} {p['total_minutes']:>7.0f}m "
              f"{p['overage_minutes']:>7.0f}m ${p['total_revenue']:>8,.0f} "
              f"${p['total_cogs']:>7,.0f} {p['margin_pct']:>6.1f}%")

    print("\n📈 BREAK-EVEN ANALYSIS")
    print("-" * 40)
    for plan, be in result["breakeven_analysis"].items():
        print(f"  {plan.upper()}")
        print(f"    Fee: ${be['fee']}/mo → ${be['revenue_per_included_min']:.3f}/included min")
        print(f"    COGS: ${be['cogs_per_min']:.4f}/min")
        print(f"    Included margin: {be['margin_on_included']:.1f}%")
        if be["overage_margin"] > 0:
            print(f"    Overage margin:  {be['overage_margin']:.1f}%")

    print("\n" + "=" * 70)
    print("  ✅ All customer metrics in MINUTES. No tokens exposed.")
    print("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Monte Carlo Cost Simulator")
    parser.add_argument("--iterations", type=int, default=10000, help="Number of iterations")
    parser.add_argument("--self-hosted", action="store_true", help="Use self-hosted rates")
    parser.add_argument("--json", action="store_true", help="Output JSON for programmatic use")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    args = parser.parse_args()

    random.seed(args.seed)
    result = run_simulation(iterations=args.iterations, self_hosted=args.self_hosted)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_report(result)
