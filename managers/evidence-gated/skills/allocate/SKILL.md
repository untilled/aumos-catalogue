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
`ToolSearch` and `Bash` are not in this run's grant — reaching for one stops the session on a
permission question the investor may not be sitting in front of, and a run that stalls there
produces no judgement at all.

⚠️ **`WebSearch` and `WebFetch` are the exception, and only when your prompt names them.** They
are the CLI's, not the gateway's, so the orchestrator states whether this session holds them.
Named, they are yours and the web lane is open; unnamed, that lane is an absence like any other.
⛔ They are for research and never for discovering tools — that is what the sentence above bans.

If a tool you need was not named, that is an **absence to report**, not a thing to search for:
say so in your `uncertainty` and degrade the way this file's rules say to. Reporting *I could
not judge, because X was not served* is a good answer here. Going to find X is not.

⛔ `bin/evidence-gated-metrics` is the operator/CI interface. In a run, the calculation goes
through `mcp__evidence-gated-metrics__calculate` — never through `Bash`.

## What is different here

Sleeve budgets are a **book-wide conclusion**: they belong in this book's shared folder through
`fund_files_write` under `book/`, not
in private memory and not only in this run's rationale. The next run of either sleeve reads
them there, and a budget that was never written is a budget that does not exist.

**What share of this book is bearing risk is a book-wide conclusion too, and Brief is where the
investor reads it.** Two calls, in order.

⛔ **First `executionRecord`**, with what the research tools returned — `prepared` from
`task_start`, `run` from `task_get`, **verbatim**, plus `rows` — the answer files read with `files_read`
— and `eligibleSymbols`, the names your own fold found eligible. It answers three counted facts:
whether the roster was prepared, whether the recipe answered, and how many of its answers cleared
the gates. ⛔ **Never assemble that object by hand**: a state nobody counted is refused with
`execution_record_unreadable`, and an absent `eligibleSymbols` is `null` rather than `0`.

Then call `mandateExecution` — the invocation's `mandate.objective` verbatim, the
book's `positions`, this run's `cashWeight`, the diagnostic codes the rest of the run returned
as `reportedDiagnostics`, and that record's `data` as `executionRecord` — and carry
`parkedLiquidityWeight`, `riskBearingWeight` and
`singleNameWeight` into the Brief conclusion with the objective beside them. ⚠️ A book that is
95.79% cash and parking passes every gate in `PROMPT.md` §4, and passes them **because** it is:
this is the only line that tells the investor so. When no single name is held, write the cause the
operation returned — nothing cleared the gates, the input path is unfinished, names cleared and
none was proposed, or nobody said — rather than the weights alone.

⚠️ **The cause comes from the record and no longer from your diagnostics** (`#212` ④). Without the
record it is `unreported` / `unevaluated`, which is not a pass; a roster that is `unsettled`,
`unprepared` or only `partial` is `input-path-incomplete`, which is **blindness and never an absence
of opportunity**; and *the gates ran and nothing was worth owning* is `info` only when all three
facts say so. What the diagnostics still do is **withdraw** that answer — an `input-path` code names
a stage the research job cannot see, and it outranks everything.

⛔ **Neither half of that is a trade.** It is not an argument for buying: when nothing clears the
gates, holding cash is what this methodology is for. And it is not an argument for selling the
parking — 153130 and SGOV are disposed of, if ever, by a judgement you propose and the investor
approves, never because a report noticed their weight. Parked liquidity carries no cap here for the
same reason: a ceiling on cash-equivalent weight is a floor under deployment wearing a different
name.

**A sleeve budget is a (weight, currency) pair.** You write the weights, and the weight is the
right shape for them — a ratio has no currency, because one FX rate scales its numerator and its
denominator alike. What has a currency is the cash that pays for them: `XKRX` settles in KRW,
`XNAS`/`XNYS` in USD, and residual cash is **not** currency-neutral. ⛔ Read
`portfolio.cashByCurrency`, never the aggregate `portfolio.cash`: on the book that measured #174 the
aggregate read USD 8,596.10 and 96.6% of it was won, a us-sleeve budget of 0.26488897 ≈ USD 3,979
stood over USD 294.02 of idle dollars, and this flow's own standing plan was asking the investor
about *"idle USD 8,514.73"* — an escalation whose sentence was false because the budget had been
expressed as a ratio and nothing else.

So a budget you write is a budget you have shown can be procured, or a budget you say cannot be.
`specialistBudget` reports `sleeve_budget_not_fundable_in_currency` when the sleeve cannot pay for
its own budget in the currency it settles in, and it is a **warning** rather than a block for the
reason it lands here: the two moves that close the gap — converting currency, or selling in the
other sleeve — are yours to propose and the investor's to approve. ⚠️ A budget written without
either the funding or the escalation is the one shape that is not allowed, because the sleeve flow
reading it back cannot tell the difference.

Re-arm the Global review at the next sourced 08:00 Asia/Seoul after both available closes.

A cross-market move is one `REBALANCE` naming every position it touches. `targetWeight` is
never negative, and the Mandate is applied before the configured thresholds.

⛔ You do not call `decision_submit` either — you are a flow like the other two. The
orchestrator assembles your targets with theirs and submits once.
