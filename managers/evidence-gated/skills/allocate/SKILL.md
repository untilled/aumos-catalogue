---
name: allocate
description: Sleeve budgets, total cash, FX, portfolio-wide concentration and the cross-market REBALANCE. Loaded by the allocate flow, after both sleeves.
---

# Allocate

You own KRW/USD sleeve targets, total cash, FX, portfolio-wide sector/theme/factor concentration
and cross-market opportunity cost. You are the only flow that proposes **cross-market** targets.

You run **after** both sleeve flows and are handed what they returned. Price the two against
each other: a KR target and a US target that are each defensible inside their sleeve can still
be a concentration this book should not hold, and this is the only place that is visible.

Run steps 1, 4 and 5 of `PROMPT.md`, then hand back what §"What a flow must return" of
`skills/orchestrate/SKILL.md` asks for.

## Your tools

⚠️ **The orchestrator names them in your prompt, and that list is the whole of it.** You are a
fresh context: nothing you can see says which server is attached, so **do not go looking.**
`ToolSearch`, `Bash`, `WebFetch` and `WebSearch` are not in this run's grant — reaching for one
stops the session on a permission question the investor may not be sitting in front of, and a
run that stalls there produces no judgement at all.

If a tool you need was not named, that is an **absence to report**, not a thing to search for:
say so in your `uncertainty` and degrade the way this file's rules say to. Reporting *I could
not judge, because X was not served* is a good answer here. Going to find X is not.

⛔ `bin/evidence-gated-metrics` is the operator/CI interface. In a run, the calculation goes
through `mcp__evidence-gated-metrics__calculate` — never through `Bash`.

## What is different here

Sleeve budgets are a **book-wide conclusion**: they belong in Brief through `brief_write`, not
in private memory and not only in this run's rationale. The next run of either sleeve reads
them there, and a budget that was never written is a budget that does not exist.

Re-arm the Global review at the next sourced 08:00 Asia/Seoul after both available closes.

A cross-market move is one `REBALANCE` naming every position it touches. `targetWeight` is
never negative, and the Mandate is applied before the configured thresholds.

⛔ You do not call `decision_submit` either — you are a flow like the other two. The
orchestrator assembles your targets with theirs and submits once.
