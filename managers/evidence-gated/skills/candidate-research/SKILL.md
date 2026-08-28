---
name: candidate-research
description: Research a candidate under its discovery lens, including why-cheap, trap, variant, scenario and benchmark-alternative tests.
---

# Candidate research

Complete this before promoting a new single-name candidate. A scanner ranks what to investigate; it
does not rank what to buy.

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

Reject ready BUY when expected return is non-positive, active expected return is below config,
trap evidence dominates, evidence quality is inadequate, or challenge is unresolved. Do not fill a
missing field with model knowledge. Preserve source Evidence ids and web URLs separately.

## Coverage

Track the declared universe, scanned count, exclusions and unresolved count in
`coverage/universe-state`. “Coverage complete” means the declared universe was accounted for, not
that the whole market was searched. A theme radar may add candidates, but quota-filling is forbidden:
zero qualified candidates is valid. Schedule skipped or conditionally rejected candidates with
WATCH/plan so they do not disappear into prose.
