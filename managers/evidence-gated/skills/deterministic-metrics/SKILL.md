---
name: deterministic-metrics
description: Run versioned scanner, sizing, coverage, evidence, calibration, attribution, source parsing and scheduling calculations without free-form arithmetic.
---

# Deterministic metrics

In an Aumos run, call `mcp__evidence-gated-metrics__calculate` whenever a supported quantitative
result affects a Decision. It exposes the same deterministic core without interactive Bash approval.
Do not recalculate the same algorithm in prose.

The executable below is the equivalent operator/CI interface, not the in-run interface.

```sh
printf '%s' "$INPUT_JSON" | node "${CLAUDE_PLUGIN_ROOT}/bin/evidence-gated-metrics"
```

Both interfaces accept one object with `operation`, invocation `asOf`, and `input`. Neither reads a
file, environment credential, network, database or package-external path. The executable writes
exactly one JSON document to stdout. Exit code `2` means the result contains a blocking diagnostic;
the JSON remains the canonical explanation.

## The operations

All 64, by name. An `operation_unknown` diagnostic also lists them, but discovering an API by
calling it wrong is not a discovery path — every flow skill tells you not to go looking, so the
names have to be here. A name absent from this table is a name you cannot call.

### Scanners and lenses — what to look at

| operation | what it decides |
|---|---|
| `indicators` | normalized bars → the indicator packet every other scanner reads |
| `scan` | one symbol → its lenses, five-axis signals and `discoveryScore` |
| `relativeStrength` | asset vs benchmark excess return over each period |
| `opportunityMetrics` | the five oversold axes for one candidate |
| `opportunityUniverse` | the declared universe, with held and pending excluded |
| `trendState` | core ETF trend gate: `full` / `half` / `small_or_wait` / `stop` |
| `blendedSectorStrength` | one sector's weighted RS against one benchmark |
| `sectorStrength` | L1: lane ranking, rank moves, regime, `researchQueue`, bot baselines |
| `entryQualityGate` | `falling_knife` blocks; eq-v2 and `no_new_low` dual lenses |
| `upsideRadar` | fundamental/event lanes — research priority, never an order |

### Sizing, concentration and budgets

| operation | what it decides |
|---|---|
| `sleeveNav` | KRW/USD/SGOV net asset value and the FX that joins them |
| `targetWeight` | desired portfolio weight under maturity and caps |
| `legacySizeSuggestion` | the ported Kelly-gated heuristic and its mode label |
| `concentration` | position/sector/theme/factor caps and portfolio heat |
| `newSinglePacing` | three approved pacing warnings; never blocks |
| `specialistBudget` | a sleeve flow inside its Brief budget and market lane |
| `globalAllocation` | the one cross-market denominator; refuses double-spend |

### Evidence admission and research gates

| operation | what it decides |
|---|---|
| `validateConsensus` | a quoted figure is dated, sourced, typed and unit-bearing |
| `crossCheckPrice` | vendor vs web price; conflict retained, never averaged |
| `validateMacro` | macro observations are dated and tiered; there is no macro score |
| `researchGate` | lens, why-cheap, traps, variant view, scenarios, active-return gate |
| `validateThesis` | the thesis metadata contract; `complete` with gaps is refused |
| `laneCoverage` | which lane a missing source closes, and what it degrades to |
| `validateAdjustment` | split/dividend adjustment conflicts between vendors |
| `coverage` | every declared-universe candidate has a current disposition |
| `validateWatch` | kind, futurity, already-met, expiry and reachability |

### Position watch and outcomes

| operation | what it decides |
|---|---|
| `thesisSentinel` | `intact` / `watch` / `threatened`, and the escalation it forces |
| `exitCheck` | L2.5: price and fundamental lanes → SELL / TRIM / REVIEW |
| `netReturnBreakdown` | fill-based gross, net-local and net-KRW return |
| `outcomeClassification` | the computed failure axis and the judged one |
| `forwardOutcome` | d5/d20/d60 forward return, excess and MFE/MAE |
| `earningsActual` | a released result against consensus and guidance |

### Calibration, promotion and attribution

| operation | what it decides |
|---|---|
| `calibration` | per-lens sample, cluster and maturity summary |
| `clusters` | independent date clusters under the five-day transitive rule |
| `brier` | categorical Brier score for declared probabilities |
| `bhFdr` | Benjamini–Hochberg false-discovery control across lenses |
| `quintileSpread` | top-minus-bottom quintile spread |
| `bootstrapClusterCi` | cluster bootstrap interval (`mulberry32-v1` when seeded) |
| `promotionGate` | every promotion condition, and which one is missing |
| `attribution` | core beta, non-core, selection, cash and FX — additive |
| `twr` | time-weighted return across flows |
| `mwr` | money-weighted return, annualized |
| `portfolioMetrics` | drawdown, turnover and the rest of the book-level readings |

### Mechanical backtests — baselines, not signals

| operation | what it decides |
|---|---|
| `trendGateForward` | forward returns by trend-gate state |
| `dcaMultiplierBacktest` | the DCA multiplier's realized effect |
| `oversoldStrata` | forward outcomes stratified by oversold depth |

### Point-in-time source parsing

| operation | what it decides |
|---|---|
| `filterPointInTime` | drops rows that were not public at `asOf` |
| `normalizeSecFacts` | SEC company facts with their availability dates |
| `normalizeSecSubmissions` | SEC submissions index |
| `normalizeDartFilings` | OpenDART receipts — the receipt is when a fact became public |
| `normalizeDartFinancials` | OpenDART statements |
| `parseDartCorpCodes` | the OpenDART corp-code registry |

### Schedule and wake

| operation | what it decides |
|---|---|
| `zonedDateTimeToUtc` | a local date/time in an IANA zone → one instant |
| `nextMarketReview` | the next real open session close plus buffer |
| `nextReviewSequence` | the three flows' reviews in order, owned by one manager |
| `earningsCheckpoint` | BMO/AMC/date-only → an at-time checkpoint |
| `boundedRetry` | the bounded retry after a wake found nothing published |
| `classifyScheduledWake` | why this run woke |
| `scheduleDrift` | late, missing, duplicated and outage-shaped fires |
| `deduplicateObservations` | the same observation arriving twice |
| `themeRadarDue` | whether the forward-research interval has elapsed |

### Memory and migration

| operation | what it decides |
|---|---|
| `validateMemory` | the memory value contract; refuses copied source prose |
| `visibleMemoryRevision` | the revision a run at this `asOf` may read |
| `migrationMap` | a legacy record → its canonical Aumos owner |

A `check` in `tools/verify-evidence-gated-allocator.mjs` fails when this table and the registered
operations disagree in either direction, so a new operation is unusable until it is named here.

## Inputs that are not guessable from the operation name

Most operations take the object their subject implies. These do not, and calling them without the
named field is the difference between a gate that runs and a gate that blocks or silently defaults.

| operation | field | why it is required |
|---|---|---|
| `specialistBudget` | `flow` — `kr-sleeve` or `us-sleeve` | Market lanes belong to flows, not to the manager id. `managerId` defaults to this package's own id and is rejected if it names a retired pre-2026-08-27 package. |
| `concentration` | `caps.factor`, and `factors` on each row | The factor axis is a shared loss path across sectors. An unconfigured cap comes back `concentration_cap_missing` / `unevaluated`, which is not a pass. |
| `validateWatch` | `config.watchExpiryDays`; `expiresAt` on the watch; `threshold` and `baselineWeight` on a `weight-drift` watch | Expiry is enforced, not described. Omitting `expiresAt` derives one from `asOf` and reports `expirySource: 'default'`; omitting the drift baseline leaves the already-met check unevaluated. |
| `sectorStrength` | `benchmarkBars`, each sector's own `bars`, `previousRanks` from the last run | Without the benchmark the lane is unread, not neutral. Without `previousRanks` the rank-move trigger cannot fire — a rank with no history is a number, not a change. |
| `exitCheck` | `price`, `rules`, `thesis`, and the `sentinel` verdict | The two lanes are independent inputs: a missing price unreads the price lane and the fundamental lane still runs. Omitting `sentinel` silently drops the fundamental verdict and its escalation. |
| `entryQualityGate` | `bars` with `high`/`low`/`open`/`close`, and the candidate's `lenses` | The gate reads both dual lenses. Without `lenses` the mean-reversion-only restriction cannot fire; without intraday `high`/`low` the no-new-low lens falls back to closes and cannot disagree with itself. |
| `concentration` | `caps.portfolioHeat`, and `stopLossPct` + `core` on each row | Heat is loss-if-every-stop-fires, which weights do not measure. A non-core row with no stop is unevaluated, not zero. |
| `newSinglePacing` | `proposedNewSingles`, `priorNewSingles` with `verified`, `sizingPolicyUpdatedAt`, `closedOutcomeCount` | Every field is a separate approved warning; omitting one silently drops that warning rather than failing. |
| `outcomeClassification` | `executionAttributableToDecision` when the fill differed from the plan; `judgedFailures` for the judged axis | Without the flag a poor fill is an observation, not a methodology failure — which is the reading `outcome-calibration` mandates. An unrecognised judged reason is refused, never absorbed. |
| `crossCheckPrice` | `config.priceConflictTolerance` | The 5% the documents call configured. Passing `tolerance` directly still overrides it. |

Bootstrap output uses the package-owned `mulberry32-v1` PRNG when `seed` is supplied. This is an
explicit Node-port reproducibility rule: changing the PRNG is a methodology-version change, not a
formatting refactor.

Every output carries `spec`, `ruleVersion`, `operation`, `asOf`, status, structured data and
diagnostics. Preserve `missing` and `unevaluated`; never coerce them to zero or false. Cite the
calculation output Evidence id in the proposal. Human prose may explain the result but may not replace
or contradict it.
