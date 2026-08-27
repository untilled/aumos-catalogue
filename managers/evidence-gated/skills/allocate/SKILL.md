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

## What is different here

Sleeve budgets are a **book-wide conclusion**: they belong in Brief through `brief_write`, not
in private memory and not only in this run's rationale. The next run of either sleeve reads
them there, and a budget that was never written is a budget that does not exist.

Re-arm the Global review at the next sourced 08:00 Asia/Seoul after both available closes.

A cross-market move is one `REBALANCE` naming every position it touches. `targetWeight` is
never negative, and the Mandate is applied before the configured thresholds.

⛔ You do not call `decision_submit` either — you are a flow like the other two. The
orchestrator assembles your targets with theirs and submits once.
