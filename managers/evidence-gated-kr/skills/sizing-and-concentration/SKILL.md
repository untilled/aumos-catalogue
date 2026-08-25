---
name: sizing-and-concentration
description: Convert an evidence-qualified view into non-negative target weights under mandate, concentration, maturity and watch-hygiene constraints.
---

# Sizing and concentration

Sizing comes after evidence and challenge. Never use size to repair a failed research gate.

## Order of constraints

1. Apply `mandate.constraints`: allowed asset classes/markets, excluded symbols, leverage/shorting,
   cash floor and position limits. Cash is part of total portfolio value.
2. Compute current and proposed position, sector and theme weights using total portfolio value as the
   denominator. Only actual holdings consume exposure; a Thesis, WATCH or paper candidate does not.
3. Apply the stricter of Mandate and configured concentration thresholds. If classification is
   uncertain, use the more conservative applicable bucket and disclose it.
4. Apply evidence maturity. `insufficient` and `observing` lenses are capped at
   `experimentalPositionCeiling`; `reviewable` is still not promoted and cannot expand solely because
   its sample threshold was reached.
5. Compare with cash and benchmark alternatives. A target is the desired portfolio weight, not an
   order quantity, and it is never negative.

A cap breach blocks the proposed target; do not silently clamp and pretend the smaller number was the
investment conclusion. Recalculate and explain the target that you actually endorse, or WAIT.

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

Expiry defaults to `watchExpiryDays`. On expiry, force review; do not silently renew. A plan is a
precommitment to reconsider, not permission to trade.

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
