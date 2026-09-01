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
3a. Pass current holdings as `positions` and this run's targets as `proposed`. ⚠️ **`proposed` is
   the target state for the symbols it names, not an increment**: a row for a symbol already held
   *replaces* that holding, and a symbol nobody names keeps the weight it has. That is how a TRIM
   or RESIZE is expressed — `{ held 0.25 } → { proposed 0.15 }` is a reduction, and summing the two
   into 0.40 would refuse it as though it were a purchase. Separate the breach the book **arrived
   with** from the breach this run would create, and pass `config` so `grandfather` is read. Existing exposure above a cap is carried: forcing an immediate
   sale to satisfy a cap that was raised, or a position that grew into one, is a trade the cap never
   asked for, and the breach resolves through trims and growth in the rest of the book. What is
   refused is the **addition** — `blocksNewNonCoreWhenBreached`. ⛔ Never refuse the reduction. A
   TRIM or exit of a position over its cap moves the book toward the cap, and blocking it was the
   inversion #109 recorded: the audit's answer to an over-cap position was *do not plan*.
3b. Apply portfolio heat — total loss if every stop fired at once, capped at
   `concentration.portfolioHeat`. Weight caps do not measure it: two books with identical weights
   have different heat when their stops sit in different places. Declare `stopLossPct` and `core` on
   each row; core DCA and parked liquidity carry no stop and are excluded, and a non-core row with no
   declared stop is unevaluated rather than zero risk. Over the cap, a run that adds new non-core risk
   is blocked while a book already over on its holdings alone warns — the same `config.grandfather`
   reading the weight caps use, from the same place.
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

## When a WATCH can be evaluated, and what a met one is worth

`evaluateWatch` scores a standing WATCH, and the cadence is **derived from the kind** rather than
declared on the watch — a declared field would be a second place for the answer to live, and the
first one to go wrong.

| kind | cadence | needs | because |
|---|---|---|---|
| `price-below` · `price-above` | `intraday` | a last price | a level is touched or it is not, and a live price answers that |
| `at-time` | `clock` | nothing | an instant is an instant whatever the session is doing |
| `weight-drift` | `intraday` | a last price | Aumos's Wake Engine fires a drift trigger off a live quote, on the same tick as the price triggers — an evaluator that refused that reading would refuse every drift wake it was sent |

Five statuses, and the last two are the ones that were missing:

- **`met`** — the condition is true.
- **`near`** — within the configured band (`watchNear`: 3% of a price level, 80% of a drift
  threshold, 7 days of an instant). A level approached is a person's cue to prepare; a two-state
  check only ever says "too late" or "nothing".
- **`not-met`** — evaluated, and the condition is not true.
- **`blocked`** — met or near, with a standing earnings or cluster block. ⛔ **A block never
  lowers `not-met`.** The report still has to say the level is not there; "blocked" and "nowhere
  near" are different facts about the same day.
- **`unevaluable`** — this run did not have the observation the condition needs. ⛔ **Never
  report it as `not-met`.** That is the difference between "the basing did not confirm" and "I
  never looked", and collapsing them is how a run claims a check it did not run.

⚠️ **A met WATCH read off a live price is not a number to act on.** `confirmationPending` is
returned true whenever the `met` came off a live reading. For a price watch what is still owed is
entry quality — basing, `no_new_low`, the MA200 state — which is `entryQualityGate`'s and needs a
bar that has closed. For a drift watch it is the weight itself, which moves for the rest of the
session. A run woken by a touched level goes and looks; it does not treat the touch as the
confirmation.

⚠️ **`unevaluable` is still reachable, and it is where the honesty lives.** It fires when the run
has no usable reading at all — a price watch with no quote, a drift watch on a machine with no
market credentials. Aumos's own Wake Engine draws the same line: with no quote it reports the
trigger `unevaluated` rather than "not fired", because those are different facts and the second
one is a lie.

**One alert per session.** `alertRequired` is false when the watch's `sessionKey` is already in
`alertedSessionKeys`. The same level brushed four times in one session is one thing worth waking
a person for.

Those keys live in `run/watch-alerts`, and `watchAlertState` folds a run's results into the next
revision of it. Read the key, pass its `alerted` list as `alertedSessionKeys`, then hand back the
`sessionKey`s that did alert; write `nextState` only when it returns `changed: true`. ⚠️ **It holds
one session and no history** — when the session date rolls the list is replaced, because a key that
accumulated every alert ever raised would be the ledger `memory-contract` forbids, growing without
bound for a fact that stops mattering at the closing bell.

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
