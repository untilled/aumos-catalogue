---
name: candidate-research
description: Research a candidate under its discovery lens, including why-cheap, trap, variant, scenario and benchmark-alternative tests.
---

# Candidate research

Complete this before promoting a new single-name candidate. A scanner ranks what to investigate; it
does not rank what to buy.

## What a thesis has to carry

`validateThesis` enforces this; the fields are named here so the contract is readable before it is
refused. Six are required outright — a thesis missing one is not a thesis:

`thesisId` · `asset` · `createdAt` · `coreClaim` · `horizonEnd` · `evidenceStatus`

Six more decide whether it is **complete**. Each is a way of being wrong on the record:

| gap field | what its absence hides |
|---|---|
| `variantView` | that the claim is the consensus, in which case the price already has it |
| `consensusRefs` | what you are differing *from* — each ref dated, sourced, and captured after it was published |
| `catalysts` | when the claim gets tested, as a window rather than a hope |
| `invalidationTriggers` | what would make you drop it, decided before you are attached to it, each with a `checkBy` |
| `expectedUpsidePct` | the number you can be wrong about |
| `fairValueRange` | the low and the high, so the upside has something under it |

⛔ Declaring `evidenceStatus: 'complete'` with any gap open is refused as `thesis_false_complete`.
`incomplete` with gaps is fine and normal — the gaps are returned and stay visible. The refusal is
for claiming to have finished the work while the record shows otherwise, which is the one state that
would let an unfinished thesis be counted as a finished one.

## Trigger vocabulary — one spelling, two sets

Kebab-case everywhere, as in the `unit` and `lens` vocabularies. Underscore forms are accepted and
normalized so no recorded thesis becomes unreadable, and using one says so.

| | accepted kinds |
|---|---|
| thesis invalidation (`validateThesis`) | `price-below` · `price-above` · `metric` · `at-time` |
| WATCH (`validateWatch`) | `at-time` · `price-below` · `price-above` · `weight-drift` |

`at-time` is shared. It used to be spelled `time` on the thesis side and `at-time` on the WATCH
side, which made one condition look like two; `time` is still accepted and normalized.

The remaining difference is deliberate:

- **`metric` is a thesis invalidation and not a WATCH.** A WATCH has to be evaluable by the wake
  engine from published data; a thesis metric may need a filing that a person reads.
- **`weight-drift` is a WATCH and not a thesis invalidation.** Drifting past a weight says something
  about the portfolio, not about the claim.

An event kind exists in neither: a producer-less `event: earnings` is refused in both places, because
nothing publishes the fact that it happened at the moment it happens.

## Lens-specific reading

### Mean reversion

Deep oversold, moving-average discount or low proximity measures dislocation depth, not confidence.
Require a separate stabilization state such as basing, capitulation plus reversal, or another
predeclared price-quality condition. Ask whether earnings power or the balance sheet structurally
changed. A falling knife does not become safer because its score rose — and it does not need you to
agree, because `entryQualityGate` blocks it. That gate also refuses a mean-reversion candidate with
no `trend-pullback` beside it unless its state is a confirmed `basing` or `pullback_in_uptrend`;
`neutral` is not a pass. Read the two dual-lens readings it returns rather than the verdict alone:
`eqV1WouldPassBasing` says the window reading disagrees with the last 60 bars, and
`noNewLow.lensDisagreement` says an intraday spike low may be masking closes that are still setting
fresh lows. Either one is a hand re-check, not a number to average away.

### Quality pullback

A quality name above its MA200, 15–35% off its high, RSI 30–50. This is the band the other two
lenses drop: `trend-pullback` stops at -20%, and a name above its MA200 rarely carries the two
oversold signals `mean-reversion` needs. The question is whether the markdown is a price the business
does not deserve — a variant view on quality, not on trend shallowness or on dislocation depth. It is
a separate lens rather than a widened `trend-pullback` band because those are different claims, and
its calibration samples accrue under `calibration/quality-pullback` so neither sample is retagged.

### Trend pullback

This lens intentionally finds shallow weakness inside an uptrend. Judge trend integrity, relative
strength, business quality, catalyst, valuation and active edge. Do not reject it merely because the
drawdown is not deep enough for mean reversion. A revisit trigger must remain reachable within this
lens rather than pointing to the level where it stops qualifying.

### Core DCA

Broad ETFs are cash-allocation decisions. Do not fabricate a single-name variant view — there is no
variant view to have about owning the index, and inventing one is how a cash decision gets recorded
as a stock pick.

Five conditions, all of them numbers rather than intentions:

| | |
|---|---|
| cash threshold | the first tranche executes only when cash and short bonds are at least `coreDca.minimumCashWeightForFirstTranche` of the book. Deploying from a thin cash position turns the reserve into the tranche |
| tranche plan | T1/T2/T3 each with its size and its date-or-price condition. "We will add on weakness" is not a tranche |
| reserve floor | the arithmetic showing `coreDca.reserveFloorWeight` still stands **after** the tranche, not before it |
| stop conditions | four, named: a market break, a better opportunity, the cash floor breached, a hedge gate firing |
| classification | recorded as cash deployment. **It does not count as a ready single-name BUY** — pooling the two makes the single-name sample look larger than it is |

`monthlyTrancheMaxWeight` paces the deployment and `catchUpMonthlyMaxWeight` is the ceiling while
catching up on a schedule that fell behind. Catching up accelerates placement; it never raises the
target.

## Staged entry on a single name

⚠️ **The classification row above is right and this section does not weaken it.** A `core-dca`
tranche is a cash deployment and never a single-name sample. What the split lost is that the ported
methodology staged *single names* too, and that lane came across without the device.

**And the reason was never size.** The NAVER thesis wrote its own down: technically oversold was
confirmed, the earnings and multiple case was not, so the name was carried as a limited staged
candidate on a three-tranche plan rather than as high conviction. Not going in at once is what that
methodology *did* about a claim it had not finished verifying — so the requirement follows the
evidence, not the weight. A 1% position split three ways is still a staged entry.

Call `entryTranchePlan`. It holds the same shape the Core DCA row states, addressed to one name:

| | |
|---|---|
| plan | T1/T2/T3, each with its size and its `immediate`, `at-time`, `price-below` or `price-above` condition. **"We will add on weakness" is not a tranche** — the same discriminant, on this side of the line |
| when it is required | an `insufficient` or `observing` lens enters in stages. `reviewable` and `promoted` may enter at once; an unstated maturity leaves the requirement unjudged and says so |
| the sizes | they add up to the position the plan says it is building, or the plan is describing two different positions |
| the rungs | a tranche within 5% of its level raises `tranche_approach` — the entry-side counterpart of `exitCheck`'s `trim_approach`, and re-read before it fires for the same reason |
| when half of it lapses | an expired condition on an unfilled tranche is `tranche_plan_incomplete` and **blocks**. Half an entry plan is a position nobody decided the size of; this run re-arms, resizes or abandons the remainder in words |
| classification | one single-name sample **per plan, never one per tranche**. `sampleCount` is 1 whether the name was entered in one step or three, and `countsAsCashDeployment` is false |

⛔ `entryTranchePlan` refuses a `core-dca` lens outright. The two lanes are kept apart in code, not
only in this table: pooled the other way — three tranches counted as three samples — a staged entry
would manufacture the "repeated runs on one still-open idea" `evidence-gates` forbids, out of the
very risk control that exists because the evidence is thin.

**Arm each unfilled tranche with the `intent` the call returns**, verbatim. It carries the same kind
of marker `nextReviewSequence` puts on a review, for the same reason: a manager cannot choose a plan
id and cannot read a WATCH back, so `intent` is the only field that survives the round trip. Armed as
a bare `price-below`, T2 is indistinguishable from any other revisit promise and the run it wakes is
never told it is standing in the middle of an entry plan. `resolveTrancheWake` reads the marker out
of the fired plan's event summary.

⛔ The plan lives in the Thesis, not in private memory. It is one document because the decision was
one decision; a ladder in a memory key would be a second copy of what the Thesis already owns.

## Candidate record

Write the following in reasoning and, when a durable asset claim is created, its Thesis:

1. **Business and lens** — what earns money, discovery lens and why this lens applies.
2. **Why cheap/down** — macro, sector and company-specific causes, separated; label temporary versus
   structural and cite point-in-time Evidence.
3. **Opportunity and trap** — the mechanism for recovery and the strongest path to permanent
   impairment.
4. **Variant view** — exactly how the view differs from consensus; if it does not, prefer the
   benchmark. Include `what would prove us wrong` as an observable condition with a horizon.
5. **Scenarios** — bear/base/bull probabilities totaling 100, target/return and factual drivers.
   Compute probability-weighted return only when inputs exist.
6. **Benchmark alternative** — market/sector/broad ETF, its expected return basis and why the single
   name earns its extra idiosyncratic risk. Active expected return is candidate minus benchmark.
7. **Catalyst and event risk** — dates known at `asOf`, next review and data that must arrive first.
8. **Exit logic** — thesis invalidation, price risk boundary, review horizon and trim conditions.
9. **Entry plan** — the tranche ladder from `entryTranchePlan`, each rung with its size, its
   condition and its expiry, written before the first tranche rather than after it. One plan is one
   sample.

Reject ready BUY when expected return is non-positive, active expected return is below config,
trap evidence dominates, evidence quality is inadequate, or challenge is unresolved. Do not fill a
missing field with model knowledge. Preserve source Evidence ids and web URLs separately.

## Coverage

Track the declared universe, scanned count, exclusions and unresolved count in
`coverage/universe-state`. “Coverage complete” means the declared universe was accounted for, not
that the whole market was searched. A theme radar may add candidates, but quota-filling is forbidden:
zero qualified candidates is valid. Schedule skipped or conditionally rejected candidates with
WATCH/plan so they do not disappear into prose.
