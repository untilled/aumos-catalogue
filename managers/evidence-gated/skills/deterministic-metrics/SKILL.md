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

All 78, by name. An `operation_unknown` diagnostic also lists them, but discovering an API by
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
| `harnessAudit` | orphaned WATCHes, mismatched positions, stale gates, order-ready decisions with no exit; and, as warnings, the holdings no decision explains |
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

| operation | field | why it is required |
|---|---|---|
| `specialistBudget` | `flow` — `kr-sleeve` or `us-sleeve` | Market lanes belong to flows, not to the manager id. `managerId` defaults to this package's own id and is rejected if it names a retired pre-2026-08-27 package. |
| `concentration` | `caps.factor`, and `factors` on each row | The factor axis is a shared loss path across sectors. An unconfigured cap comes back `concentration_cap_missing` / `unevaluated`, which is not a pass. |
| `validateWatch` | `config.watchExpiryDays`; `expiresAt` on the watch; `threshold` and `baselineWeight` on a `weight-drift` watch | Expiry is enforced, not described. Omitting `expiresAt` derives one from `asOf` and reports `expirySource: 'default'`; omitting the drift baseline leaves the already-met check unevaluated. |
| `sectorStrength` | `benchmarkBars`, each sector's own `bars`, `previousRanks` from the last run | Without the benchmark the lane is unread, not neutral. Without `previousRanks` the rank-move trigger cannot fire — a rank with no history is a number, not a change. |
| `exitCheck` | `price`, `rules`, `thesis`, and the `sentinel` verdict | The two lanes are independent inputs: a missing price unreads the price lane and the fundamental lane still runs. Omitting `sentinel` silently drops the fundamental verdict and its escalation. |
| `entryQualityGate` | `bars` with `high`/`low`/`open`/`close`, and the candidate's `lenses` | The gate reads both dual lenses. Without `lenses` the mean-reversion-only restriction cannot fire; without intraday `high`/`low` the no-new-low lens falls back to closes and cannot disagree with itself. |
| `concentration` | `caps.portfolioHeat`, and `stopLossPct` + `core` on each row | Heat is loss-if-every-stop-fires, which weights do not measure. A non-core row with no stop is unevaluated, not zero. |
| `concentration` | `positions` separate from `proposed`, and `config` | The split is what tells a breach the book **arrived with** from one this run creates: only the second refuses. Without `config.grandfather` the tolerance the investor configured is not applied — and a breach that a trim would resolve used to block the trim. |
| `newSinglePacing` | `proposedNewSingles`, `priorNewSingles` with `verified`, `sizingPolicyUpdatedAt`, `closedOutcomeCount` | Every field is a separate approved warning; omitting one silently drops that warning rather than failing. |
| `signalPaper` | `ruleVersion` on every row, and `benchmarkBars` | A row with no rule version is refused: rows judged under different versions are reported together and never pooled. Without a benchmark a row scores no excess and drops out of the aggregate rather than counting as zero. |
| `paperAdmission` | `challengeVerdict`, and for a call `thesis.evidenceStatus` plus `priceHistoryLatestDate` | The verdict decides the setup, so a conditional verdict cannot be logged as a call. A promote on price history stale by more than two weekdays is refused. |
| `verdictReport` | `paper.d60` from `signalPaper.byCohort['llm-research']`, the `cohort` it came from, and optionally `shadow`, `baseline`, `closedOutcomeCount` | Thresholds may be passed **stricter only** — a looser one is refused, not honoured. Any cohort other than `llm-research` is refused outright: a control arm is measured, never promoted. |
| `upsideRadar` | `price.ma50`, `price.ma200`, `price.offHigh200` and `events` with `announcedAt`/`sue`/`preAnnouncementClose` | The three lanes read them. Without them a lane excludes every candidate and reports `starved`, which is a sourcing finding rather than an absence of opportunity. |
| `controlArmLane` | `exitRegistered: true` on every row, and `experimentTotalRemainingWeight` | The exit discipline is this lane's product, so an unregistered entry is refused. The lane spends inside the experimental total, not beside it. |
| `harnessAudit` | `decisions` with `orderReady`/`exitRegistered`/`quantity`, `theses`, `managedSince` (the invocation's `mandate.effectiveFrom`) and `config` | Without the decisions every held position reads as unexplained. Without the theses every WATCH on an unheld name reads as orphaned. Both are true findings on a real book and noise on a partial input. ⚠️ Without `managedSince` a position **inherited** at cold start cannot be told from one bought since, and every unexplained holding is carried — the safe direction, and reported as `audit_managed_since_missing` rather than guessed. `config.grandfather` decides whether new non-core exposure waits while an unexplained holding stands; nothing read it until #109, so the install screen governed nothing. |
| `lensEnvelope` | `triggers` as `{ metric, level }` using indicator names (`offHigh200`, `rsi14`, `ma200Distance`) | A metric the lens declares no range for is unevaluated, never assumed reachable. |
| `timeStopPolicy` | `catalystRealized`, `returnSinceEntryPct`, `benchmarkReturnSinceEntryPct`, and `core`/`parkedLiquidity` to exclude allocation holdings | Both halves are required: either one missing leaves the promotion unresolved rather than declined. |
| `clusterBlock` | `clusters[].prints` and the `intent` | The end date is derived from the last print rather than trusted — a window copied from a sibling cluster ends a day early. The block applies to promotion only. |
| `ruleVersions` | `registry` keyed by axis, and the `axis` these rows belong to | Without the axis the registry can say what is current but not whether these rows are stale. |
| `policyLint` | `provenance` keyed by the same dotted path as the config (`concentration.position`), carrying `approvedBy`/`immutable` | Value ranges belong to `config.schema.json`; this owns provenance, immutability and direction. A loosening is refused, not flagged. |
| `regimeTag` | `briefRevisionId`, and `mechanical` from `sectorStrength.regime` | The call is Brief's and must say which revision made it. Without the mechanical reading the disagreement cannot be stated — which is the whole reason to pass it. |
| `outcomeClassification` | `executionAttributableToDecision` when the fill differed from the plan; `judgedFailures` for the judged axis | Without the flag a poor fill is an observation, not a methodology failure — which is the reading `outcome-calibration` mandates. An unrecognised judged reason is refused, never absorbed. |
| `crossCheckPrice` | `config.priceConflictTolerance` | The 5% the documents call configured. Passing `tolerance` directly still overrides it. |
| `nextReviewSequence` | `config.schedule.krCloseBufferMinutes` and `usCloseBufferMinutes` | The buffers `PROMPT.md` calls configured. ⚠️ Nothing passed them until #91 and the two literals in the code were what ran, so a number on the install screen governed nothing. Passing `buffers.kr` / `buffers.us` directly still overrides. |

Bootstrap output uses the package-owned `mulberry32-v1` PRNG when `seed` is supplied. This is an
explicit Node-port reproducibility rule: changing the PRNG is a methodology-version change, not a
formatting refactor.

Every output carries `spec`, `ruleVersion`, `operation`, `asOf`, status, structured data and
diagnostics. Preserve `missing` and `unevaluated`; never coerce them to zero or false. Cite the
calculation output Evidence id in the proposal. Human prose may explain the result but may not replace
or contradict it.
