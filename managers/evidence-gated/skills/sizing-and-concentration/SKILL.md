---
name: sizing-and-concentration
description: Convert an evidence-qualified view into non-negative target weights under mandate, concentration, maturity and watch-hygiene constraints.
---

# Sizing and concentration

Sizing comes after evidence and challenge. Never use size to repair a failed research gate.

## Order of constraints

1. Apply `mandate.constraints`: allowed asset classes/markets, excluded symbols, leverage/shorting,
   cash floor and position limits. Cash is part of total portfolio value.
2. Compute current and proposed position, sector, theme and factor weights using total portfolio
   value as the denominator. Only actual holdings consume exposure; a Thesis, WATCH or paper
   candidate does not. A factor is a shared loss path that crosses sectors — declare it on the row as
   `factors` so a cross-sector complex cannot pass under a sector cap. An axis whose cap is not
   configured comes back unevaluated, never as a pass.
3. Apply the stricter of Mandate and configured concentration thresholds. If classification is
   uncertain, use the more conservative applicable bucket and disclose it.
3b. Apply portfolio heat — total loss if every stop fired at once, capped at
   `concentration.portfolioHeat`. Weight caps do not measure it: two books with identical weights
   have different heat when their stops sit in different places. Declare `stopLossPct` and `core` on
   each row; core DCA and parked liquidity carry no stop and are excluded, and a non-core row with no
   declared stop is unevaluated rather than zero risk. Over the cap, a run that adds new non-core risk
   is blocked while a book already over on its holdings alone warns — the same grandfathering the
   weight caps use.
4. Apply evidence maturity. `insufficient` and `observing` lenses are capped at
   `experimentalPositionCeiling`; `reviewable` is still not promoted and cannot expand solely because
   its sample threshold was reached.
5. Compare with cash and benchmark alternatives. A target is the desired portfolio weight, not an
   order quantity, and it is never negative.

A cap breach blocks the proposed target; do not silently clamp and pretend the smaller number was the
investment conclusion. Recalculate and explain the target that you actually endorse, or WAIT.

## Pacing is a warning and stays one

Call `newSinglePacing` whenever a run proposes a new non-core single name. Three patterns say the
book is adding single names faster than it is learning from them: two or more in one session, another
one while the previous new single is still unverified, and one on the day the sizing policy changed.
None of them is evidence that this candidate is wrong, so none of them blocks — they are what the run
says out loud before the investor approves it. They relax to advisory once the book has
`reviewReadyClosedOutcomes` closed outcomes to learn from.

## Action mapping

- `BUY`: one not-held or zero-weight asset passes every entry gate; include one `target`.
- `SELL`: the thesis is invalidated; include one `target` of type `exit`.
- `RESIZE`: the thesis remains but current weight is wrong; include one `target`, up or down.
- `REBALANCE`: at least two target weights are needed to repair portfolio shape; use `targets`.
- `WAIT`: evidence supports no current change, or required evidence makes the judgement unavailable.
- `WATCH`: a future condition, not today's allocation, is the primary result.

## Watch and plan hygiene

Every revisit promise must be machine-evaluable and include subject, source/observable, operator,
threshold or event, expiry and reason. At registration, compare it with current retained evidence. A
condition already true is invalid: evaluate it now or choose the actual unresolved condition. Use a
date anchor for a scheduled filing/event. Only use a metric the named source/company really reports.
The trigger must be reachable within the lens that created it.

Expiry defaults to `watchExpiryDays`, and `validateWatch` applies it: an absent `expiresAt` is
derived from `asOf` and returned as `expiresAt` with `expirySource: 'default'`, an expiry already
past blocks as `watch_expired`, and an `at-time` trigger later than its own expiry blocks as
`watch_expiry_before_trigger` because it can never fire. On expiry, force review; do not silently
renew. A plan is a precommitment to reconsider, not permission to trade.

A `weight-drift` WATCH is checked for already-met on the same terms as a price WATCH, so it carries
`threshold` (the drift that fires it) and `baselineWeight` (the weight it was registered against).
Without the baseline the condition is unevaluated rather than assumed unresolved.

## Compact worked examples

| finding | action/shape |
|---|---|
| Fresh evidence, intact thesis, correct 6% weight | `WAIT`, no target; explain positive no-change judgement |
| Mean-reversion candidate still falling; three-day basing not yet observed | `WATCH` for basing with expiry; no target |
| Cleared US thesis, promoted lens, 5% desired weight under all caps | `BUY` with single `target.targetWeight = 0.05` |
| Thesis invalidation met in a held name | `SELL` with one `exit` target and Thesis update |
| Intact thesis but drifted from desired 7% to 12% | `RESIZE` with single target weight `0.07` |
| Two correlated holdings breach theme cap and cash must rise | `REBALANCE` with multiple non-negative `targets` |

When OpenDART is unavailable, a new Korean single-name fundamental BUY remains unable-to-judge
`WAIT` even if the price example looks attractive. When only evidence maturity is low but every
research input is complete, a controlled experiment may use at most the configured ceiling.
