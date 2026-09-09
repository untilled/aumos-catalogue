---
name: sizing-and-concentration
description: Convert an evidence-qualified view into non-negative target weights under mandate, concentration, maturity and watch-hygiene constraints.
---

# Sizing and concentration

Sizing comes after evidence and challenge. Never use size to repair a failed research gate.

## Order of constraints

1. Apply `mandate.constraints`: allowed asset classes/markets, excluded symbols, leverage/shorting,
   cash floor and position limits. Cash is part of total portfolio value. ⚠️ **Two of the caps this
   skill applies come from here and from nowhere else** — `maxPositionWeight` is the position cap
   (`caps.position`, and `mandatePositionCap` on `targetWeight`) and `maxDrawdown` is the portfolio
   heat cap (`caps.portfolioHeat`). Configuration used to carry a second copy of each under its own
   name, at its own number, and the run had no way to tell which of the two was the real limit.
   ⛔ A constraint the Mandate leaves unset is `unevaluated`, not unlimited: report it.
2. Compute current and proposed position, sector, theme and factor weights using total portfolio
   value as the denominator. Only actual holdings consume exposure; a Thesis, WATCH or paper
   candidate does not. A factor is a shared loss path that crosses sectors — declare it on the row as
   `factors` so a cross-sector complex cannot pass under a sector cap. An axis whose cap nobody
   declared — in the Mandate or in configuration — comes back unevaluated, never as a pass.
   ⚠️ **A denomination is not a loss path.** The currency a name is quoted in, its venue and that
   venue's country are not factors; labelling one turns this cap into a country allocation decision
   the Mandate never made. A label at twice its cap comes back
   `concentration_factor_label_unexamined` — a question to answer in the report, never a block.
   ⚠️ **The three axes are not spelled alike, and the difference is read.** `sector` is a single
   string — a listing has one — while `themes` and `factors` are arrays, because a name sits on
   several shared loss paths. `sectors`, `theme` and `factor` are refused as `input_shape_invalid`;
   before #173 the plural `sectors` was read by nothing, the sector axis accumulated **empty**, and
   its cap was compared against no weight while the answer stayed `status: ok`.
   ⚠️ **And a cap over unlabelled rows is not a cap that passed.** A row carrying no label on an
   axis whose cap is declared comes back `concentration_labels_unstated` / `unevaluated`, naming the
   symbols and their weight: an empty axis map is *nobody said what this is*, which is a different
   fact from *measured and under the cap* and used to look identical to it.
3. Apply the configured sector, theme and factor caps on top of the Mandate's. Configuration may
   be stricter than the Mandate and never looser. If classification is uncertain, use the more
   conservative applicable bucket and disclose it. ⚠️ **Declare `parkedLiquidity: true` on a row
   held as a cash equivalent, and it leaves these three axes** — a parking symbol is held to be
   *out* of the market, so it is on no shared loss path and spends none of a sector, theme or
   factor budget. `concentration` names what it excluded in `parkedLiquidityExcluded`.
   ⛔ **It does not leave the position axis, and no classification ever will.** `maxPositionWeight`
   is the Mandate's, the Kernel refuses a proposal over it, and this package can only be stricter
   than the Mandate — a parking symbol above it is a breach, grandfathered and reported like any
   other. A run that read a liquidity label as permission to size past that cap is what
   `skills/us-sleeve` records: parked liquidity is a classification, never an exemption from an
   investor declaration.
3a. Pass current holdings as `positions` and this run's targets as `proposed`. ⚠️ **`proposed` is
   the target state for the symbols it names, not an increment**: a row for a symbol already held
   *replaces* that holding, and a symbol nobody names keeps the weight it has. That is how a TRIM
   or RESIZE is expressed — `{ held 0.25 } → { proposed 0.15 }` is a reduction, and summing the two
   into 0.40 would refuse it as though it were a purchase. Separate the breach the book **arrived
   with** from the breach this run would create. Existing exposure above a cap is carried: forcing an immediate
   sale to satisfy a cap that was raised, or a position that grew into one, is a trade the cap never
   asked for, and the breach resolves through trims and growth in the rest of the book. What is
   refused is the **addition**. ⛔ That tolerance is a package rule, not a setting — there is
   nothing to pass and nothing to switch off. ⛔ Never refuse the reduction. A
   TRIM or exit of a position over its cap moves the book toward the cap, and blocking it was the
   inversion #109 recorded: the audit's answer to an over-cap position was *do not plan*.
3b. Apply portfolio heat — total loss if every stop fired at once, capped at the Mandate's
   `maxDrawdown`. Weight caps do not measure it: two books with identical weights
   have different heat when their stops sit in different places. Declare `stopLossPct`, `core` and
   `parkedLiquidity` on each row; core DCA and parked liquidity carry no stop and are excluded — the
   flag has to be on the row, or the parking symbol comes back `portfolio_heat_stop_missing` every
   run for a stop it can never have — and a non-core row with no declared stop is unevaluated rather
   than zero risk. Over the cap, a run that adds new non-core risk
   is blocked while a book already over on its holdings alone warns — the same grandfathering
   reading the weight caps use, from the same place.

3c. **Say what the exclusion did not remove.** ⚠️ **Excluded means the row spends no budget; it
   never means the row is not there.** `concentration` and `singleNameBudget` now return
   `parkedLiquidityWeight`, `coreWeight`, `singleNameWeight` and `riskBearingWeight` beside their
   verdicts, and `mandateExecution` sets that split next to the Mandate's declared `objective`,
   carried verbatim and never parsed. A book at 57.25% cash and 38.54% parked with no single name
   held passes every axis in this section, and `heldSingleNameWeight: 0` is read as headroom rather
   than as an unexecuted mandate. When the lane is empty the operation says which it is —
   `no-candidate-cleared-the-gates` (`info`: nothing cleared the gates, and buying anyway is what
   this whole skill refuses), `input-path-incomplete` or `unreported` (`unevaluated`, which is not
   a pass) — and the cause goes in `uncertainty`. ⛔ It is a report and not a cap: parked liquidity
   has no ceiling here, because a ceiling on cash-equivalent weight is a floor under deployment by
   another name. ⛔ And it is not a sell signal.

4. **A checked variant view is what makes a position possible — it is not what makes it large.**
   ⛔ **The maturity lane was removed on 2026-09-08 (#226)**: there is no experimental ceiling, no
   1% control-arm cell, and no size a failed evidence gate falls to. Call `variantViewCheck` — or
   pass the candidate's `thesis` and `challengeVerdict` straight to `effectivePositionCap`, which
   calls it — and it is satisfied only by checked inputs: a complete thesis carrying `variantView`,
   a dated and sourced `consensusRefs` row, and a cleared challenge. Satisfied, the Mandate's
   `maxPositionWeight`, the risk budget and every concentration cap are what bind. **Unsatisfied,
   there is no position**: `variant_view_required_for_position` / `blocked`, and `targetWeight`
   answers `null`. ⚠️ That is the resolution of the choice #226 left open — an evidence gate that
   sizes twenty times smaller is a dial, and the honest answer to *"we have not established this"*
   is not a smaller trade. ⛔ It is not a new bar either: `challengeCleared` is one of the four and
   has always been fatal on its own. ⚠️ Read `requirementReport` rather
   than `missing` alone (#160): `missing: ["thesisComplete"]` is what three-of-four looks like, and
   the two thesis fields usually holding it — `expectedUpsidePct`, `fairValueRange` — are derived by
   `thesisValuation` from the scenario table, so on a filer the shortfall is an unmade fetch and
   `thesisGapSources` says so. ⛔ `promotionGate` is not lowered — it reports a lens's record and
   gates no size (`promotion.gatesSize: false`) — and a thesis resting on the mechanical cohort is
   `control_arm_evidence_cited` / `blocked`. ⚠️ **And a position opened on a consensus row you
   filed yourself says so at the approval point** (#692):
   `observation_file` is the only route a web reading has into `evidenceIds`, the row is graded as
   your testimony, and `effectivePositionCap` returns `main_lane_rests_on_manager_attestation` on
   `disclosures`, with the source URLs. Carry that code verbatim in one `rationale.risks` entry and
   one `uncertainty` entry — `risks` because that is what the approval screen shows — and hand the
   assembled proposal to `proposalDisclosure` (step 4e), where a silent one is
   `main_lane_attestation_undisclosed` / `blocked`. ⛔ It reduces no cap and waives no requirement;
   it refuses opening the lane **quietly**. ⚠️ What total the
   single-name lanes may reach *together* is an open question this revision does not answer.
   ⛔ **Maturity caps nothing (#226).** `insufficient`, `observing` and `reviewable` are sized by
   the same arithmetic `promoted` is; the experimental ceiling and the control arm's 1% cell were
   removed on 2026-09-08 by the investor's decision, and the learning temperament moved to the Aumos
   decision ledger and its Forward Track Record. `maturityStatus` travels for attribution and
   `targetWeight` reads it for nothing.
   ⚠️ **What did not move is that a position has to be executable.** `minimumExecutablePosition` —
   the smallest position worth opening in **that venue's** currency — is what
   `minimumExecutableWeight` answers, because 1% of a 10,095,751 KRW book is 100,958 KRW, which is
   three shares of a 33,050 KRW name, and a three-share position cannot be scaled into, trimmed or
   made to express conviction. ⛔ **It refuses; it never lifts.** A weight below it comes back
   `minimum_executable_not_met` / `blocked` from `targetWeight` — do not round the position up to
   the minimum, because then the size measures the rounding and not the idea.
4a. **Say what the investor's declared cap became.** Call `effectivePositionCap` with
   `mandatePositionCap`, the candidate's `thesis` and `challengeVerdict`, the risk inputs
   (`mandateMaxDrawdown`, `heldPortfolioHeat`, this entry's `stopLossPct`) and the same NAV and
   `minimumExecutablePosition` inputs `minimumExecutableWeight` takes. ⛔ **Do not pass
   `uncertainty`, `risks` or `effectiveConstraints`** — they are not read here since #212 ② and a
   call carrying them answers `input_key_unread`. This operation is arithmetic; step 4e is what
   reads the proposal.
   It returns `declaredCap`, `effectiveCap`, which of the two limits bound — the Mandate, or the
   risk budget `(maxDrawdown − heldPortfolioHeat) / |stopLossPct|` beneath it — and `unlocksAt`.
   ⛔ **It also decides whether there is a position at all**: a candidate without a checked variant
   view is `variant_view_required_for_position` / `blocked`, not a smaller weight (#226).
   ⚠️ **This is the asymmetry #151 closed.** A cap nobody declared has been reported every run since
   the beginning as `concentration_cap_missing`; a cap somebody *did* declare and did not get was
   reported nowhere.
   ⛔ A proposal sized under a reduced cap carries the code `position_cap_reduced_below_declared`
   **verbatim** in one `uncertainty` entry **and** this operation's `effectiveConstraints` array
   copied into `DecisionProposal.effectiveConstraints` verbatim, or step 4e comes back
   `position_cap_reduction_undisclosed` / `blocked` — the proposal, never the run. The two halves
   have different readers: `uncertainty` is prose a person reads after the run, and
   `effectiveConstraints` is what the fund-settings screen draws beside the control the limit was
   typed into. ⚠️ `field` is the **host's** vocabulary — `maxPositionWeight`, `cashFloor`,
   `maxDrawdown` — and a methodology name like `controlArmLane` is refused by that schema; what
   bound goes in `reason`, which is where this package's own code belongs. `declared` echoes the
   Mandate value this invocation handed the run and is never a constant. ⛔ An entry is emitted
   only where `effective` differs from `declared`, and an empty array is a complete answer — but it
   is not a claim that nothing bound, because the host draws nothing for an absent row. ⛔ Nothing here raises a cap, and a run that reads it
   as licence to has read it backwards: the disclosure exists precisely so the small number can
   stand without being a secret.
   ⚠️ `minimum_executable_exceeds_cap` is the second thing it answers: the venue minimum above the
   cap that actually binds, which closes the book to every name at every price. The diagnostic
   carries the NAV that resolves it. ⛔ `experimental_floor_unreachable` and
   `experimental_floor_exceeds_cap` are gone with the band and the cell they measured (#226); read
   `minimum_executable_exceeds_cap` first and then #149's `experimental_ladder_unreachable`.
4b. **Check the cash the plan leaves, against the floor the investor declared.** Call
   `effectiveCashFloor` with `mandateCashFloor` — the Mandate's `cashFloor`; this package holds no
   copy of it since #153, when `coreDca.reserveFloorWeight` was removed for being a second,
   undisclosed answer to one axis — and `projectedCashWeight`, the cash weight **after** everything
   this run proposes. A plan under the floor is `cash_floor_breach` / `blocked`; an undeclared floor
   is `cash_floor_unevaluated`, which is the same *"nobody said"* the missing caps get and not a
   pass; a projection nobody computed is `cash_floor_projection_missing`, because a floor is
   breached after a plan executes rather than before it. If this methodology ever holds a floor
   above the declared one, the row is published with `field: 'cashFloor'` exactly as the position
   cap's is, and a proposal that does not carry it is `cash_floor_raise_undisclosed` / `blocked`.
   ⚠️ **A floor is not a target.** `cashFloor` 0.10 is permission to go there, never an instruction
   to fill to it; `headroomWeight` is what *may* be deployed.
4c. **The single-name total comes from the Mandate, not from this package.** Call
   `singleNameBudget` with `mandateCashFloor`, `mandatePositionCap`, the book's `positions` and
   this run's `proposed`. What `cashFloor` leaves is the range the single-name lanes may hold
   together, `maxPositionWeight` is the per-name limit inside it, and `concentration` decides the
   shape. ⚠️ The source's 28% single-name total is **not ported**: it was one piece of an allocation
   that also carried a 50% core ETF lane, and the investor answered #153 §3 with (a) — the cash that
   is left is carried by single names, with no parking sleeve standing in for the ETF lane. ⛔ Both
   Mandate numbers missing is `single_name_budget_unevaluated`, which is *"nobody said"* and not
   *"no limit"*; there is no package constant behind it to fall back on, and that is the point —
   after #133 and #153 no sizing constant here answers a question the investor is asked. ⚠️ **A
   budget is not a target.** `remainingWeight` is what the Mandate permits, never what the book
   should hold. ⛔ **The control arm has no budget of its own since #226** —
   `controlArmWeight`, `controlArmRemainingWeight` and `experimentTotalRemainingWeight` are gone
   with the 6% lane total they fed. Every single name, whichever lens found it, spends inside this
   one budget.
4d. **Every entry registers how it will be closed.** Call `exitDiscipline` for the candidate and
   copy `watchesToRegister` into the same proposal as the BUY; without a stop and a review date the
   entry is `exit_rules_unregistered` / `blocked`. The stop distance is the control arm's approved
   −8% in that lane and derived from the Mandate's `maxDrawdown` in every other, so a large position
   carries a tighter stop than a small one — the two lanes holding different numbers is the rule
   working, not an inconsistency. ⚠️ **That same stop is an input to sizing now (#226)**: hand it to
   `effectivePositionCap` as `stopLossPct` and the risk budget
   `(maxDrawdown − heldPortfolioHeat) / |stopLossPct|` is what holds the position under the
   Mandate's cap. `skills/evidence-gates` carries the rest. ⚠️ **Pass `asset` in
   full**: the same call returns `priceLevelsToRegister`, the stop as a `priceLevels` row with its
   purpose stated, and a level belongs to the currency its asset's market quotes.
4c-2. **When one limit is the only thing in the way, say what would open it (#230).** All three of
   `effectivePositionCap`, `effectiveCashFloor` and `concentration` return **`unlockDelta`**, and the
   source's condition is the whole of it — *«캡 상향을 제안하기 전에 이 캡을 올리면 실제로 몇 원이
   열리는가를 계산해 확인할 것 — 0원이면 제안하지 않는다»*. ⛔ **`null` is the ordinary answer and it
   means do not propose anything**: something else already refuses, the next limit binds level with
   this one, or nothing above it was measured. Do not compute the number yourself and do not argue
   past a `null` — that is 2026-07-27, where 162,357원 sat unused behind a pace limit and a guard and
   the cap was not what was in the way.
   The row names `screen`, `control`, `currentValue`, `proposedValue`, `opensWeight` and
   `opensAmount`. ⛔ **Copy `control`, never the schema field**: `maxDrawdown` is asked for as
   «포트폴리오 히트» and a run naming the field sends the investor looking for a box that is not
   there. ⚠️ Which control is named follows what binds — the risk budget answers on `maxDrawdown`,
   the Mandate cap on `maxPositionWeight`, the cash floor on `cashFloor` — and ⛔ sector, theme and
   factor caps get no row at all, because no screen asks the investor for one and `policyLint`
   refuses a run that loosens one. It goes in one `rationale.keyReasons` entry carrying
   `cap_raise_would_unlock` **verbatim**; `PROMPT.md` §4 has the sentence. ⚠️ **A proposal and never
   an edit** — nothing here changes a threshold, and a run that answers a binding limit by moving it
   is still `policy_auto_relax` / `blocked`.
4d′. **Then fold every level the run still stands behind — `priceLevels`.** One call for the whole
   book, and copy what it returns into the proposal. The field **replaces**, so a level left out is
   released: fold in the stops of holdings you only swept, not just the entry you are proposing.
   ⛔ Omitting the field and sending `[]` are opposite statements — the first keeps what stood, the
   second releases all of it. `PROMPT.md` §6 carries the rest.
4e. **Judge the disclosures once the proposal exists — `proposalDisclosure`.** Hand it the
   `disclosures` array 4a returned (or `targetWeight`'s, which is the same array) **verbatim** and
   the assembled `DecisionProposal`. It answers `disclosed` and, for each obligation, which fields
   are silent — and it is the only operation that emits
   `position_cap_reduction_undisclosed` / `main_lane_attestation_undisclosed` /
   `cap_raise_unlock_undisclosed`. ⚠️ **Absent is
   unjudged; empty is refused.** A proposal that does not exist yet has cleared nothing, and an
   empty array is a proposal that exists and says nothing.
   ⚠️ **Why this is a separate step at all.** Until #212 ② `effectivePositionCap` read the prose
   itself and pushed `blocked`, and `targetWeight` returns `null` for any `blocked` — so **rewording
   one `uncertainty` entry changed a position weight.** The obligation is unchanged and the codes are
   unchanged; what moved is that the size is now a function of the numbers alone.
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
the package's review-ready count of closed outcomes to learn from — ten.

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

Expiry defaults to thirty days, and `validateWatch` applies it: an absent `expiresAt` is
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
- **`near`** — within the declared band (3% of a price level, 80% of a drift
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
revision of it. Read the key, pass **the whole value as `previous`** and its `alerted` list as
`alertedSessionKeys`, then hand back the `sessionKey`s that did alert; write `nextState` only when
it returns `changed: true`. ⚠️ **The session is stored as a `session-YYYY-MM-DD` label, not as a
bare date** — `skills/memory-contract/SKILL.md` says why — so pass the session date and write back
what the function returns rather than assembling the value. ⚠️ **It holds
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
`WAIT` even if the price example looks attractive. ⛔ **Low evidence maturity caps nothing since
#226**: when every research input is complete the position is whatever the quarter-Kelly arithmetic
asks for, under the Mandate's cap and the risk budget beneath it — and never below the venue's
minimum executable amount, where it is refused rather than rounded up.
