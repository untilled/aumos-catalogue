---
name: position-research
description: Sell-side watch on what is already held — price rules and fundamental invalidation running in parallel, with no buy-side proposal allowed.
---

# Position research

The gap this closes was the largest one in the methodology being ported: exit was watched by price
rules alone, so a thesis that broke on fundamentals while the price sat above its stop had nothing
looking at it until the next scheduled review. Losses that were legible in a filing were discovered
by the tape weeks later.

Two lanes run in parallel on every non-core single-name holding. **Neither overrides the other.**
Core ETF and parked liquidity are not in scope; their rules are allocation and liquidity rules.

| lane | who runs it | what it reads |
|---|---|---|
| price | `exitCheck` | stop, trim ladder, target, trailing stop, time stop |
| fundamental | you, then `thesisSentinel` | news, filings, results against the thesis's own invalidation conditions and catalysts |

## The one direction

⛔ **This skill only ever argues for selling, trimming or reviewing.** It never proposes adding to a
position. A layer that looks closely at what you own and is allowed to recommend more of it will
find reasons, and the reasons will be the ones you already believed. Buy-side work has its own
entrance: `theme-radar` for where an idea comes from, `candidate-research` for whether it survives.

⚠️ **That includes the next rung of an entry already planned.** `exitCheck` reads a trim ladder here
and there is now a counterpart on the way in — `entryTranchePlan`, in `candidate-research` — but it
is *there* and not here on purpose. A layer looking at what you own must not be the layer that
decides to own more of it, even when the plan to own more was written down first.

## When to run it

- Every `PORTFOLIO_REVIEW`, over every non-core holding.
- Every `ASSET_REVIEW` and `THESIS_REVIEW` on a held name.
- On any `EVENT_REVIEW` whose event touches a holding — a result, a filing, a corporate action.
- Whenever `exitCheck` returns `trim_approach`: a ladder set weeks ago may be stale by the time
  price reaches it, so re-validate the rung's premise *before* it fires rather than after.

## The sentinel and its escalation

Call `thesisSentinel` with the thesis's invalidation triggers, the evidence ids that bear on them,
and the prior verdicts. It returns `intact`, `watch` or `threatened`.

Keep `threatened` narrow. It means an adverse fact that bears directly on a named invalidation
condition — not a bad week, not a downgrade, not a soft tone on a call. A sentinel that cries
`threatened` weekly is one nobody reads, and the watch is worth exactly what its precision is worth.

**Three consecutive `threatened` verdicts force a decision.** `thesisSentinel` returns
`escalationRequired` and `exitCheck` blocks on it: this run must produce an explicit resize, an
exit, or a stated deadline with the date on it. Carrying the same warning forward a fourth time is
not patience, it is a decision to do nothing made without saying so.

## What a finding is, and is not

Every `exitCheck` verdict — `SELL`, `TRIM`, `REVIEW` — is a **candidate**. It is an input to a
proposal the investor still approves one order at a time. Nothing in this layer sizes, sells or
bypasses that approval.

An exit ladder that this work says is wrong is changed the way every other rule is: as a rule
proposal, with the reasoning and the evidence ids, awaiting approval. Never as a quiet edit to the
level while the position is open.

## Recording it

The verdict, the reasoning and the evidence ids go into the Thesis revision, not into private
memory. Whether the sentinel's warnings actually preceded the drawdowns is a question that can only
be answered from a record kept before the answer was known — so keep the record either way, and let
`outcome-calibration` score it.
