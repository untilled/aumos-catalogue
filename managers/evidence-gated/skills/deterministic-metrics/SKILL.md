---
name: deterministic-metrics
description: Run versioned scanner, sizing, coverage, evidence, calibration, attribution, source parsing and scheduling calculations without free-form arithmetic.
---

# Deterministic metrics

Call `inputContracts` to read input keys, their **types**, and operation-specific vocabulary before
composing calls. ⚠️ **Every registered operation is published there, not a subset** — it returns
`contracts` (key → type, plus the mode that governs an unknown key), `nested` for the shapes a key
list cannot show (`config.schedule`, `researchActivity[]`, `scannerUniverses[][]`), and `guarded`,
the operations that refuse an unknown key outright. Until #158 it published eleven of them and the
rest had to be guessed; a guess that lands in a key nothing reads is answered with a number
computed from defaults, which is this package's most-recorded failure. A `strict` operation blocks
an unknown key, a `named` one answers and reports it as `input_key_unread`, and an `open` one takes
a record from somewhere else and enumerates nothing. A declared key holding the wrong type is
`input_shape_invalid` in every mode — never a raw exception. `thesisSentinel` uses snake_case
`price_below`, `price_above`, `metric`, `time`; thesis/WATCH triggers have a different wire shape.
`concentration` accepts `themes: []`, `exitCheck` accepts a scalar `price`, and `globalAllocation`
accepts `targets: [{key, weight}]`. Empty sentinel rules yield `unevaluated`, never `intact`.
A blocked stateful calculation returns no writable `nextState`; retain the old memory revision.

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

All 95, by name. An `operation_unknown` diagnostic also lists them, but discovering an API by
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
| `regimeTag` | a Brief regime call, canonicalized, attributed, and compared with the sector reading |
| `entryQualityGate` | `falling_knife` blocks; eq-v2 and `no_new_low` dual lenses |
| `upsideRadar` | the three fundamental/event lanes, with every exclusion explained and starvation reported |
| `variantViewCheck` | whether a candidate's variant view is established — a complete thesis, a dated consensus citation and a cleared challenge — and therefore which lane may size it |

### Sizing, concentration and budgets

| operation | what it decides |
|---|---|
| `sleeveNav` | KRW/USD/SGOV net asset value and the FX that joins them |
| `targetWeight` | desired portfolio weight under maturity and caps |
| `experimentalCeiling` | the ceiling an unpromoted lens is held to — the ratio or the venue's minimum executable amount, whichever is larger, bounded |
| `effectivePositionCap` | the cap the investor declared against the cap that actually binds, what reduced it, and what lifts it — plus the venue floor that sits above the control arm's single-name cell |
| `effectiveCashFloor` | the cash floor the investor declared against the one that binds, and whether the plan still clears it *after* it executes |
| `singleNameBudget` | what the Mandate's own two numbers leave the single-name lanes to hold — `cashFloor` sets the range, `maxPositionWeight` the per name — and what is left of it |
| `inputContracts` | every operation's input keys and their types, which of them are guarded, the nested shapes, and the evaluator vocabulary |
| `researchUniverse` | pinned KR/US curated roster plus dated, evidenced extensions; current eligibility must be checked |
| `researchState` | bounded research roster and Evidence references; no source payload cache |
| `legacySizeSuggestion` | the ported Kelly-gated heuristic and its mode label |
| `concentration` | position/sector/theme/factor caps and portfolio heat |
| `newSinglePacing` | three approved pacing warnings; never blocks |
| `entryTranchePlan` | a single name's T1/T2/T3 ladder: which rung is due, which is within 5%, which lapsed with the plan unfinished — and that the whole plan is one sample |
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
| `evaluateWatch` | a standing WATCH scored met / near / not-met / blocked / unevaluable, with the cadence its kind requires |
| `watchAlertState` | one session's already-alerted WATCH keys, replaced when the session rolls |

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
| `closedOutcomeSamples` | closed real decisions turned into the calibration samples that move lens maturity — and which axis they reach, which they do not |
| `attribution` | core beta, non-core, selection, cash and FX — additive |
| `twr` | time-weighted return across flows |
| `mwr` | money-weighted return, annualized |
| `portfolioMetrics` | drawdown, turnover and the rest of the book-level readings |

### The learning loop — paper samples, kept apart from real ones

| operation | what it decides |
|---|---|
| `paperAdmission` | promote / watch / rejected, and refuses a promote on stale price history |
| `signalPaper` | forward scoring of the paper log, aggregated per setup and per cohort |
| `shadowTrack` | same decisions at unconstrained size — is the cap what costs return? |
| `baselineTrack` | what buying the index and waiting would have returned |
| `verdictReport` | the §6 verdict against pre-registered criteria, and the proposals it raises |
| `controlArmLane` | the bounded lane whose product is closed outcomes, and which may never be expanded on its own result |
| `exitDiscipline` | the unconditional time stop and the stop distance this position may carry, and the two WATCH rows an entry registers |

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
| `nextReviewSequence` | the three flows' reviews in order, owned by one manager, each with the `intent` it must be armed with and the `{ cron, timeZone }` `rule` that goes beside `at` on the trigger. The rule draws the calendar forward and wakes nothing; `at` is still the whole schedule, and a review whose buffer crosses local midnight returns `rule: null` |
| `resolveWakeFlow` | which flow a fired plan's event summary was armed for — `null` for a wake this manager did not arm |
| `resolveTrancheWake` | whether a fired plan's event summary is a rung of an unfinished staged entry, and which one |
| `reconcileArmedReviews` | which of this run's reviews are not already armed, given what the last run wrote down |
| `earningsCheckpoint` | BMO/AMC/date-only → an at-time checkpoint |
| `boundedRetry` | the bounded retry after a wake found nothing published |
| `classifyScheduledWake` | why this run woke |
| `scheduleDrift` | late, missing, duplicated and outage-shaped fires |
| `deduplicateObservations` | the same observation arriving twice |
| `themeRadarDue` | whether the forward-research interval has elapsed |

### Declared thresholds — the numbers, and the drift they catch

| operation | what it decides |
|---|---|
| `lensEnvelope` | the numeric envelope each lens can produce, and whether a revisit trigger is reachable inside it |
| `clusterBlock` | whether a correlated event cluster holds promotion, and when it clears |
| `timeStopPolicy` | review date reached with the catalyst unrealized and the benchmark ahead → exit candidate |
| `ruleVersions` | the eleven versioned axes, what is current, and whether these rows may be pooled |
| `policyLint` | whether a configuration change is stricter, who approved it, and whether it may move at all |

### Pre-flight — asked before planning, not after proposing

| operation | what it decides |
|---|---|
| `harnessAudit` | orphaned WATCHes, mismatched positions, stale gates, order-ready decisions with no exit; and, as warnings, the holdings no decision explains and a discovery universe nobody declared |
| `discoveryCapacity` | which discovery branches were open this run — and whether both were shut, which is a report and never a stop |
| `lessonAudit` | what is already waiting for the investor, so this run does not propose it again |

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
⚠️ **This table is the prose reading of `inputContracts`, not a second source** — the machine-readable
shape of every operation is in that call, and it is the one to read when composing.

| operation | field | why it is required |
|---|---|---|
| `specialistBudget` | `flow` — `kr-sleeve` or `us-sleeve` — and the Brief budget as **`sleeveBudgetWeight`** | Market lanes belong to flows, not to the manager id. `managerId` defaults to this package's own id and is rejected if it names a retired pre-2026-08-27 package. ⚠️ The budget key has one spelling: `sleeveBudget`, `briefBudgetWeight` and `budgetWeight` are all refused rather than defaulted away, because a sleeve whose `withinBriefBudget` comes back `null` has not been checked against its budget at all. `sleeve_budget_missing` names the key it is still waiting for. |
| `coverage` | `scannerUniverses` as an **array of arrays** — one array of symbols per scanner, all over the **same market** | Two markets are two calls. Passed as two elements they share no symbol, so the drift check sees every symbol differ and answers `universe_markets_mixed` / `blocked`: the two lists were never one denominator, and a coverage verdict over their union answers a question nobody asked. Real drift — the same market, one scanner short a name — is still `universe_drift`. An array of `{scanner, symbols}` objects is `input_shape_invalid`. |
| `experimentalCeiling` | `experimentalPositionFloor` keyed **per venue currency** (`{ KRW: 300000, USD: 200 }`), `positionCurrency`, `portfolioNav` + `portfolioNavCurrency`, and the rate as **`fx.USDKRW`** | What makes an order unexecutable is a fact about the exchange, so the floor names a venue; a bare amount is refused rather than ignored, and `usdKrw` at the top level is not the rate this reads. Cross-currency legs need `fx.USDKRW` or the floor is `experimental_floor_unevaluated`. With no floor declared at all the answer is the ratio alone and says so — `binding: 'ratio'` beside a silent `floorAmount: null` was the KRW leg #158 measured. |
| `laneCoverage` · `harnessAudit` | `activity` / `researchActivity` rows as `{source, granted, attempts, succeeded}` | `succeeded` is *did this route yield any usable response* — a boolean, **or** the count of the responses that were usable, which is the better input and is accepted. `attempts` alone separates `lane_not_queried` (nobody asked) from `lane_query_failed` (asked, nothing usable), so `succeeded: 0` over `attempts: 3` is a failed lane and `attempts: 0` is an unasked one. A count above its own `attempts` is refused rather than clamped. Fewer successes than attempts is `lane_query_partial` / `info` — a note, never a warning. |
| `concentration` | `caps.factor`, and `factors` on each row | The factor axis is a shared loss path across sectors. An unconfigured cap comes back `concentration_cap_missing` / `unevaluated`, which is not a pass. ⚠️ The labels are the run's own and the package declares none, so a denomination — a currency of quotation, a venue, a listing country — can be written onto this axis and become a country allocation cap the Mandate never made. A single label at twice its cap comes back `concentration_factor_label_unexamined` / `unevaluated`, which asks about the label and blocks nothing. |
| `effectivePositionCap` | `mandatePositionCap`, `maturityStatus`, `lane`, the candidate's `thesis` + `challengeVerdict`, the NAV/floor inputs `experimentalCeiling` takes, and both `uncertainty` and `effectiveConstraints` once the proposal exists | Without the declared cap there is nothing to measure the reduction against and the answer is `concentration_inputs_missing`. Without `lane` the control arm's single-name cell is not applied, so a control-arm candidate reads as capped at the maturity ceiling when 1% is what will bind it. `maturityStatus` is the same vocabulary `targetWeight` uses, not `entryTranchePlan`'s `maturity`. ⚠️ Since #153 the maturity ceiling is the **control arm's**: `thesis` and `challengeVerdict` are what `variantViewCheck` reads, and without them the candidate has no established variant view and is held to the ceiling exactly as before — `lane: 'main'` without one comes back `main_lane_requires_variant_view` / `unevaluated` rather than opening anything. `uncertainty` and `effectiveConstraints` are what turn the disclosure into a check, and they are judged separately: omitted, each is unjudged; present and silent, each is `position_cap_reduction_undisclosed` / `blocked`. The returned `effectiveConstraints` array is copied into the proposal verbatim — the field names are the host's (`maxPositionWeight`, `cashFloor`, `maxDrawdown`), never this package's. Optional `promotion: {samples, regimes, clusters}` puts this run's progress toward the gate in the diagnostic and in `unlocks`. |
| `effectiveCashFloor` | `mandateCashFloor` — the Mandate's `cashFloor` — and `projectedCashWeight`, the cash weight **after** everything this run proposes | The floor is the investor's declaration and this package holds no copy of it since #153; an undeclared one is `cash_floor_unevaluated`, not "no floor". A floor is breached after a plan executes, so the current cash weight cannot answer it and its absence is `cash_floor_projection_missing` rather than a pass. ⛔ `cashFloor` is a floor and never a target: the returned `headroomWeight` is what *may* be deployed, not what should be. Pass `effectiveConstraints` once the proposal exists — a methodology floor above the declared one that the proposal does not carry is `cash_floor_raise_undisclosed` / `blocked`. |
| `variantViewCheck` | the candidate's `thesis` (with `variantView` and dated `consensusRefs`), `challengeVerdict`, and `evidenceSamples` when the thesis leans on this book's own paper record | Every requirement is checked rather than asserted, and anything unchecked falls to the control arm — there is no input that turns "not checked" into "checked". ⛔ A sample from any cohort other than `llm-research` is `control_arm_evidence_cited` / `blocked`: the control arm's own result is the baseline an edge claim clears, never the argument for one. |
| `singleNameBudget` | `mandateCashFloor`, `mandatePositionCap`, `positions` and this run's `proposed` | Both numbers are the investor's and this package ships no constant to fall back on, so a missing one is `single_name_budget_unevaluated` rather than an unlimited lane. The source's 28% total is **not ported** and its absence is a decision rather than an omission — see the operation's own note. ⚠️ `proposed` restates a held symbol rather than stacking on it, exactly as in `concentration`. `controlArmWeight` returns `controlArmRemainingWeight` for `controlArmLane`, because the control arm spends inside this budget rather than beside it. |
| `exitDiscipline` | `lane`, `entryDate` (or a `tradingDaysHeld` from a real session calendar), `entryPrice`, `price`, and for any lane but the control arm `positionWeight` + `mandateMaxDrawdown` + `heldPortfolioHeat` | The time stop is unconditional and reads the entry date, which every position has — without it the stop is `exit_discipline_unevaluated`, not "not reached". Outside the control arm the stop distance is **derived** from `maxDrawdown` against this position's weight and capped at the source's approved −8%; with `maxDrawdown` undeclared it is `hard_stop_unevaluated` and no distance is invented. ⚠️ **Say which call this is with `entryProposed`.** An entry registers its stop and its review date before it is an entry, so `entryProposed: true` without a complete `registration` — partial *or* absent — is `exit_rules_unregistered` / `blocked`. `entryProposed: false` is the every-run sweep over a holding whose registration this manager **cannot read back** (#97) and is not refused for it. Omitting the flag leaves the requirement `exit_registration_unjudged` / `unevaluated`: the rule was not applied, which is not the same as satisfied. A stop wider than the derived bound is `hard_stop_exceeds_budget` / `blocked`. Pass `proposedExits` once the proposal exists: a due stop this run does not act on is `exit_due_unactioned` / `blocked`. `watchesToRegister` is copied into the proposal verbatim — it is the only registration path this package has. |
| `closedOutcomeSamples` | `outcomes` carrying `closedAt`, `lens` and `activeReturnPct` (or the gross and benchmark returns it comes from) | A closed decision with no benchmark comparison is unmeasured, never a flat sample, and is dropped with `closed_outcome_sample_incomplete`. ⛔ These samples move lens maturity and **never** `promotionGate`, which counts matured paper windows; the boundary is reported every run as `closed_outcome_not_a_paper_sample` because pooling the two is silent until the gate opens on the wrong evidence. |
| `validateWatch` | `expiresAt` on the watch; `threshold` and `baselineWeight` on a `weight-drift` watch | Expiry is enforced, not described. Omitting `expiresAt` derives one thirty days out from `asOf` — the package's own expiry, not a setting — and reports `expirySource: 'default'`; omitting the drift baseline leaves the already-met check unevaluated. |
| `sectorStrength` | `benchmarkBars`, each sector's own `bars`, `previousRanks` from the last run | Without the benchmark the lane is unread, not neutral. Without `previousRanks` the rank-move trigger cannot fire — a rank with no history is a number, not a change. |
| `exitCheck` | `price`, `rules`, `thesis`, and the `sentinel` verdict | The two lanes are independent inputs: a missing price unreads the price lane and the fundamental lane still runs. Omitting `sentinel` silently drops the fundamental verdict and its escalation. |
| `entryQualityGate` | `bars` with `high`/`low`/`open`/`close`, and the candidate's `lenses` | The gate reads both dual lenses. Without `lenses` the mean-reversion-only restriction cannot fire; without intraday `high`/`low` the no-new-low lens falls back to closes and cannot disagree with itself. |
| `concentration` | `caps.portfolioHeat` — the Mandate's `maxDrawdown` — and `stopLossPct` + `core` + `parkedLiquidity` on each row | Heat is loss-if-every-stop-fires, which weights do not measure. A non-core row with no stop is unevaluated, not zero. ⚠️ `parkedLiquidity` carries no stop and is excluded from heat and from the sector, theme and factor axes — it is a cash equivalent, on no shared loss path — and is **not** excluded from `caps.position`, which is the Mandate's. Omitting the flag puts the parking symbol back on all four. A Mandate that declares no drawdown limit leaves it `unevaluated`, which is not a pass. |
| `concentration` | `caps.position` — the Mandate's `maxPositionWeight` — and `positions` separate from `proposed` | The split is what tells a breach the book **arrived with** from one this run creates: only the second refuses. ⚠️ `proposed` is the **target state** for the symbols it names — a row for a held symbol replaces that holding rather than adding to it, which is the only shape a TRIM has. Grandfathering is a package rule read from one place rather than a setting, so there is nothing to pass; a breach that a trim would resolve used to block the trim. |
| `newSinglePacing` | `proposedNewSingles`, `priorNewSingles` with `verified`, `sizingPolicyUpdatedAt`, `closedOutcomeCount` | Every field is a separate approved warning; omitting one silently drops that warning rather than failing. |
| `entryTranchePlan` | `lens`, `maturity`, `price`, and `expiresAt` on every unfilled tranche | The lens keeps the lanes apart — `core-dca` is refused rather than counted as a single name. The maturity decides whether staging is *required*; unstated leaves it unjudged rather than passed. Without `price` the price rungs are unread and dated rungs still run. Without `expiresAt` a tranche can never lapse, which is the state `tranche_plan_incomplete` exists to catch. |
| `signalPaper` | `ruleVersion` on every row, and `benchmarkBars` | A row with no rule version is refused: rows judged under different versions are reported together and never pooled. Without a benchmark a row scores no excess and drops out of the aggregate rather than counting as zero. |
| `paperAdmission` | `challengeVerdict`, and for a call `thesis.evidenceStatus` plus `priceHistoryLatestDate` | The verdict decides the setup, so a conditional verdict cannot be logged as a call. A promote on price history stale by more than two weekdays is refused. |
| `verdictReport` | `paper.d60` from `signalPaper.byCohort['llm-research']`, the `cohort` it came from, and optionally `shadow`, `baseline`, `closedOutcomeCount` | Thresholds may be passed **stricter only** — a looser one is refused, not honoured. Any cohort other than `llm-research` is refused outright: a control arm is measured, never promoted. |
| `upsideRadar` | `price.ma50`, `price.ma200`, `price.offHigh200` and `events` with `announcedAt`/`sue`/`preAnnouncementClose` | The three lanes read them. Without them a lane excludes every candidate and reports `starved`, which is a sourcing finding rather than an absence of opportunity. |
| `controlArmLane` | `exitRegistered: true` on every row, and `experimentTotalRemainingWeight` | The exit discipline is this lane's product, so an unregistered entry is refused. The lane spends inside the experimental total, not beside it. |
| `discoveryCapacity` | `radar` (what `themeRadarDue` returned) and `coverage` (what `coverage` returned), plus this run's `uncertainty` once the proposal exists | Each lane is judged from the operation that owns it, so nothing here is a second copy of either answer. ⚠️ An absent input is `unstated`, never `open`: the failure this exists for (#140) is a question never asked, and defaulting the unasked half to open would reproduce it. Without `uncertainty` the disclosure is unjudged rather than passed; with it, a dark run that does not carry `discovery_lane_dark` verbatim is `blocked` — the proposal, not the run. |
| `harnessAudit` | `decisions` with `orderReady`/`exitRegistered`/`quantity`, `theses`, `managedSince` (the invocation's `mandate.effectiveFrom`), `universe` | Without the decisions every held position reads as unexplained. Without the theses every WATCH on an unheld name reads as orphaned. Both are true findings on a real book and noise on a partial input. ⚠️ Without `managedSince` a position **inherited** at cold start cannot be told from one bought since, and every unexplained holding is carried — the safe direction, and reported as `audit_managed_since_missing` rather than guessed. Whether new non-core exposure waits while an unexplained holding stands is decided by the same package rule `concentration` reads; it was a config key nothing read until #109 and stopped being a setting in #133. ⚠️ Without `universe` — `{ scannerUniverses, extensions }`, or `coverage`'s own answer — this run cannot say whether a discovery denominator was standing, and an unasked question is not a yes: it is a **`warn`** either way and never a blocker, because a book with no universe still has a sell side to manage. |
| `lensEnvelope` | `triggers` as `{ metric, level }` using indicator names (`offHigh200`, `rsi14`, `ma200Distance`) | A metric the lens declares no range for is unevaluated, never assumed reachable. |
| `timeStopPolicy` | `catalystRealized`, `returnSinceEntryPct`, `benchmarkReturnSinceEntryPct`, and `core`/`parkedLiquidity` to exclude allocation holdings | Both halves are required: either one missing leaves the promotion unresolved rather than declined. |
| `clusterBlock` | `clusters[].prints` and the `intent` | The end date is derived from the last print rather than trusted — a window copied from a sibling cluster ends a day early. The block applies to promotion only. |
| `ruleVersions` | `registry` keyed by axis, and the `axis` these rows belong to | Without the axis the registry can say what is current but not whether these rows are stale. |
| `policyLint` | `provenance` keyed by the same dotted path as the config (`concentration.sector`), carrying `approvedBy`/`immutable` | Value ranges belong to `config.schema.json`; this owns provenance, immutability and direction. A loosening is refused, not flagged. |
| `regimeTag` | `briefRevisionId`, and `mechanical` from `sectorStrength.regime` | The call is Brief's and must say which revision made it. Without the mechanical reading the disagreement cannot be stated — which is the whole reason to pass it. |
| `outcomeClassification` | `executionAttributableToDecision` when the fill differed from the plan; `judgedFailures` for the judged axis | Without the flag a poor fill is an observation, not a methodology failure — which is the reading `outcome-calibration` mandates. An unrecognised judged reason is refused, never absorbed. |
| `crossCheckPrice` | `config.priceConflictTolerance` | The 5% the documents call configured. Passing `tolerance` directly still overrides it. |
| `nextReviewSequence` | `krSessions` / `usSessions` as `{isOpen, date, closeLocal: "15:30", timeZone: "Asia/Seoul"}` rows, and `config.schedule.krCloseBufferMinutes` / `usCloseBufferMinutes` | There is no `sessions` key: the two markets are two lists, and a diagnostic about an empty one now names `krSessions` or `usSessions` rather than a key the operation does not have. The buffers are the ones `PROMPT.md` calls configured. ⚠️ Nothing passed them until #91 and the two literals in the code were what ran, so a number on the install screen governed nothing. ⛔ **They are nested under `config.schedule`** — at the top of `config` they are refused rather than quietly replaced by the package's own 30/45, which is invisible on any book whose investor typed 30 and 45. Declared nowhere at all, the default still runs and says so as `schedule_buffer_defaulted` / `info`, with `bufferSource` in the answer. Passing `buffers.kr` / `buffers.us` directly still overrides. |

Bootstrap output uses the package-owned `mulberry32-v1` PRNG when `seed` is supplied. This is an
explicit Node-port reproducibility rule: changing the PRNG is a methodology-version change, not a
formatting refactor.

Every output carries `spec`, `ruleVersion`, `operation`, `asOf`, status, structured data and
diagnostics. Preserve `missing` and `unevaluated`; never coerce them to zero or false. Cite the
calculation output Evidence id in the proposal. Human prose may explain the result but may not replace
or contradict it.
