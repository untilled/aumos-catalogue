/**
 * ── One definition per operation (issue #212 ③) ────────────────────────────
 *
 * The same fact about an operation used to be written in four places, and the
 * four could disagree without anything saying so:
 *
 * | what | where it was written |
 * |---|---|
 * | that the operation exists, and what runs it | `index.mjs`, the `operations` map |
 * | its mode, its keys and their types | `input-contracts.mjs`, `INPUT_CONTRACTS` |
 * | the nested shapes it refuses | `input-contracts.mjs`, `NESTED_CONTRACTS` and a chain of `if (operation === '…')` |
 * | what it decides, for the model that calls it | `skills/deterministic-metrics/SKILL.md`, a hand-written table |
 *
 * ⚠️ **All four are projections of this table now.** `index.mjs` maps `run`,
 * `input-contracts.mjs` projects `mode` / `keys` / `nested` and dispatches
 * `shape`, and `tools/generate-evidence-gated-operations.mjs` renders
 * `describe` into the skill — with a `--check` mode the allocator verifier
 * runs, so the skill cannot drift from this file by one character.
 *
 * ⛔ **A row is not optional in any of the four.** `assertRegistered` below
 * refuses a row with no `run`, no `describe`, no `group` or no `mode` at module
 * load, by name — because the failure this replaces was silent: an operation
 * could be registered and undocumented, or documented and unregistered, and
 * the only way to find out was to call it wrong and read the diagnostic.
 *
 * ⛔ **`group` is the only grouping.** The rows carried `// ── Sizing ──`
 * style section labels when this table lived in `input-contracts.mjs`, and
 * they are gone: the labels were a second sectioning that had already drifted
 * from the skill's — «Coverage, discovery and watches» held rows the document
 * files under two different headings — and a comment that says where an
 * operation is documented, next to a member that decides it, is the shape this
 * issue is about. Rows are in the order the skill renders them; each states its
 * own group on its second line.
 *
 * ── Which operations the model is shown (issue #212 ③, second half) ────────
 *
 * `surface` splits the table in two, and the split is **measured rather than
 * chosen**. An operation is `internal` when both of these hold:
 *
 *  ⑴ another registered operation's implementation already calls it, so a run
 *    that calls it directly is re-assembling by hand an answer a task-unit
 *    operation returns whole — `subsumedBy` names that operation and
 *    `subsumedAt` names the call site; and
 *  ⑵ no flow skill and no section of `PROMPT.md` names it, so nothing tells a
 *    run to reach for it.
 *
 * ⛔ **Internal does not mean removed.** Every one of them still runs, still
 * validates its input, and still answers exactly what it answered before: the
 * issue asks for the existing functions to be *kept* behind a task-unit API,
 * and a run that already calls one is not broken. What changes is the discovery
 * surface — `operation_unknown` lists the published ones and says how many are
 * internal, `inputContracts` returns the published contracts under `contracts`
 * and the rest under `internalContracts`, and the skill table names the
 * published ones. A menu of 107 entries, eight of which are steps of other
 * entries, is a menu that invites a run to assemble a calculation this package
 * already assembles.
 */
import { researchUniverse, researchState } from './research-state.mjs'
import { normalizeBars, indicatorPacket } from './indicators.mjs'
import { scanSymbol, relativeStrength, opportunityMetrics, opportunityUniverse, candidateQueue, trendState, blendedSectorStrength, sectorSeries, entryQualityGate, sectorStrength, regimeTag } from './scanners.mjs'
import { sleeveNav, targetWeight, minimumExecutableWeight, effectivePositionCap, effectiveCashFloor, singleNameBudget, legacySizeSuggestion, concentration, mandateExecution, specialistBudget, globalAllocation, newSinglePacing, entryTranchePlan } from './sizing.mjs'
import { proposalDisclosure } from './proposal.mjs'
import { priceLevelSet } from './price-levels.mjs'
import { executionRecord } from './execution-record.mjs'
import { coverageState, discoveryCapacity, validateWatch, evaluateWatch, watchAlertState } from './coverage.mjs'
import { validateConsensus, researchGate, crossCheckPrice, validateMacroObservations } from './evidence.mjs'
import { observationLedger } from './observation.mjs'
import { calibrationSummary, closedOutcomeSamples, independentDateClusters, brierScore, benjaminiHochberg, promotionGate, quintileSpread, bootstrapClusterCi } from './calibration.mjs'
import { decomposition, timeWeightedReturn, moneyWeightedReturn, portfolioMetrics } from './attribution.mjs'
import { netReturnBreakdown, outcomeClassification, forwardOutcome, earningsActual } from './outcomes.mjs'
import { trendGateForward, dcaMultiplierBacktest, oversoldStrata } from './backtest.mjs'
import { validateThesis, variantViewCheck, thesisSentinel, upsideRadar, validateMemory, migrationMap, exitCheck } from './methodology.mjs'
import { candidateCompletion } from './completion.mjs'
import { filterPointInTime, normalizeSecFacts, normalizeDartFilings, parseDartCorpCodes, normalizeDartFinancials, normalizeSecSubmissions, laneCoverage, validateAdjustment } from './source-parsers.mjs'
import { fundamentalsPlan, mapCorporationCodes, dartVendorStatus, radarCandidates, radarFeedDiagnosis } from './fundamentals-feed.mjs'
import { catalystRegister, catalystCadence, CATALYST_DATE_ESTIMATED } from './catalysts.mjs'
import { thesisValuation, thesisGapSources } from './valuation.mjs'
import { harnessAudit, lessonAudit } from './audit.mjs'
import { lensEnvelope, clusterBlock, timeStopPolicy, exitDiscipline, ruleVersions, policyLint } from './envelopes.mjs'
import { signalPaper, paperAdmission, shadowTrack, baselineTrack, verdictReport, controlArmLane } from './learning.mjs'
import { refutedMemoryRules } from './memory-rules.mjs'
import { zonedDateTimeToUtc, nextMarketReview, earningsCheckpoint, boundedRetry, classifyScheduledWake, scheduleDrift, deduplicateObservations, themeRadarDue, dislocationSignal, nextReviewSequence, resolveWakeFlow, resolveTrancheWake, reconcileArmedReviews } from './schedule.mjs'
import { MARKET_CURRENCIES, MANAGER_ID } from './diagnostics.mjs'
import { MACRO_INDICATORS } from './evidence.mjs'
import { ANY, ARRAY, ARRAY_OF_ARRAYS, OBJECT, NUMBER, STRING, BOOLEAN, INPUT_VOCABULARY, PAPER_SETUP_COHORTS } from './vocabulary.mjs'
import { armedRecord, both, labelAxes, laneRows, macroRows, paperState, scalarPrice, scheduleBuffers, sentinelRules, sessionRows, sleeveCash, sleeveRows } from './input-shapes.mjs'
import { all, cashByCurrency, memoryRows, moneyAmount, researchMarket, triggerKind, watchFields } from './canonical-input.mjs'

/**
 * The sections the skill's operation table is rendered into, in this order.
 * ⚠️ `group` on a row is the only thing that decides where an operation is
 * documented. Before this the sectioning was hand-maintained, and
 * `inputContracts` — the call a run makes *before* composing anything — sat at
 * the bottom of «Sizing, concentration and budgets».
 */
export const GROUPS = [
  { id: 'contracts', heading: 'Reading the contract before composing a call' },
  { id: 'scanners', heading: 'Scanners and lenses — what to look at' },
  { id: 'sizing', heading: 'Sizing, concentration and budgets' },
  { id: 'evidence', heading: 'Evidence admission and research gates' },
  { id: 'watch', heading: 'Position watch and outcomes' },
  { id: 'calibration', heading: 'Calibration, promotion and attribution' },
  { id: 'learning', heading: 'The learning loop — paper samples, kept apart from real ones' },
  { id: 'backtests', heading: 'Mechanical backtests — baselines, not signals' },
  { id: 'sources', heading: 'Point-in-time source parsing' },
  {
    id: 'feeding',
    heading: 'The fundamental feeding path',
    note: 'The one line `upsideRadar` was missing (#146). The order is the fix: nothing can\nbe addressed to a filer until the registry supplies the id the roster does not\ncarry, and the 2026-09-06 run never asked for it.',
  },
  { id: 'schedule', heading: 'Schedule and wake' },
  { id: 'envelopes', heading: 'Declared thresholds — the numbers, and the drift they catch' },
  { id: 'preflight', heading: 'Pre-flight — asked before planning, not after proposing' },
  { id: 'memory', heading: 'Memory and migration' },
]

const GROUP_IDS = new Set(GROUPS.map((group) => group.id))

export const OPERATIONS = {
  indicators: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { bars: ARRAY },
    describe: 'normalized bars → the indicator packet every other scanner reads',
    run(input, asOf) {
      const normalized = normalizeBars(input?.bars, asOf)
      return { data: { bars: normalized.bars, indicators: indicatorPacket(normalized.bars) }, diagnostics: normalized.diagnostics }
    },
  },
  scan: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { symbol: STRING, market: STRING, bars: ARRAY, held: BOOLEAN, pending: BOOLEAN },
    describe: 'one symbol → its lenses, five-axis signals and `discoveryScore`',
    run(input, asOf) {
      const normalized = normalizeBars(input?.bars, asOf)
      const scanned = scanSymbol({ ...input, bars: normalized.bars })
      return { data: scanned.candidate, diagnostics: [...normalized.diagnostics, ...scanned.diagnostics] }
    },
  },
  relativeStrength: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { assetBars: ARRAY, benchmarkBars: ARRAY, periods: ARRAY },
    describe: 'asset vs benchmark excess return over each period',
    run(input) { return { data: relativeStrength(input?.assetBars ?? [], input?.benchmarkBars ?? [], input?.periods), diagnostics: [] } },
  },
  opportunityMetrics: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { symbol: STRING, market: STRING, sector: STRING, bars: ARRAY, held: BOOLEAN, pending: BOOLEAN },
    describe: 'the five oversold axes for one candidate',
    /**
     * ⚠️ **Normalized like `scan` and for the same two reasons (#224).** This
     * was the one bar operation that took `bars` raw: post-`asOf` rows were
     * never dropped here, and the newest-bar age check had nowhere to run. The
     * shape is copied from `scan` verbatim rather than paraphrased, so the four
     * bar operations answer the bar contract with one rule instead of two.
     */
    run(input, asOf) {
      const normalized = normalizeBars(input?.bars, asOf)
      const measured = opportunityMetrics({ ...input, bars: normalized.bars })
      return { data: measured.data, diagnostics: [...normalized.diagnostics, ...measured.diagnostics] }
    },
  },
  opportunityUniverse: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { rows: ARRAY },
    describe: 'the declared universe, with held and pending excluded',
    run: opportunityUniverse,
  },
  candidateQueue: {
    group: 'scanners',
    surface: 'published',
    mode: 'strict', keys: { rows: ARRAY, perLens: NUMBER },
    nested: {
      rows: 'The `scan` answers you read back from the sweep\'s answer files — one row per name, carrying `lenses`, `eligibleForNewResearch` and `indicators`. ⛔ Not the `opportunityMetrics` rows: those are the five oversold axes and `opportunityUniverse` folds them. A row this operation cannot read is counted in `counts.rows` and queued nowhere.',
      perLens: 'How many candidates of **each** lens this run carries to a completed record; the default is 1, and it is the number #243 asks for rather than a ceiling on research. ⛔ There is no argument for «the top N of the roster»: three lenses rank on three different measurements and putting them on one scale is the defect (#242).',
    },
    describe: 'the research order **per lens** — each lens ranked by its own measurement, so no one score orders three of them — and which candidates this run therefore owes a completed record for',
    run: candidateQueue,
  },
  trendState: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { symbol: STRING, bars: ARRAY },
    /**
     * ⚠️ `bars: "array"` was the whole published shape, and the vendor payload is
     * an array (#180). A run that passed the Toss candle rows through unchanged —
     * `closePrice` and friends, every value a **string** — satisfied the contract
     * as published and got a hard `stop` off moving averages that were all `null`.
     * The row shape is the part that had to be said.
     */
    nested: {
      'bars[]': { date: STRING, open: NUMBER, high: NUMBER, low: NUMBER, close: NUMBER, volume: NUMBER },
      barShape: 'One row per session, oldest or newest first — this sorts. The instant may be given as `date`, `timestamp` or `time`; the four prices are named `open`/`high`/`low`/`close` and must be finite **numbers**, not strings. ⛔ A vendor payload is not this shape: Toss candles carry `openPrice`/`highPrice`/`lowPrice`/`closePrice` as strings and are refused row by row as `bar_value_invalid`, exactly as `indicators` refuses them. One unreadable row and the answer is `state: "insufficient_data"` — this gate stops capital deployment and does not average over the rows it happened to parse.',
    },
    describe: 'core ETF trend gate: `full` / `half` / `small_or_wait` / `stop` — over bars validated by the same rule `indicators` applies, so an unreadable row is `state: "insufficient_data"` and never a guidance. ⚠️ Bars are `{date, open, high, low, close, volume}` with **numeric** prices; a vendor candle payload (`closePrice` as a string) is refused row by row',
    run: (input, asOf) => trendState({ ...input, asOf }),
  },
  blendedSectorStrength: {
    group: 'scanners',
    surface: 'internal',
    subsumedBy: 'sectorStrength',
    /**
     * ⚠️ **The step both of them are** (#247). `sectorStrength` folds a lane out
     * of reduced rows and this operation folds one pair out of bars, and since
     * the bars are reduced through the same `sectorSeries`, the excess itself is
     * computed in one place. That place is what the fold calls.
     */
    subsumedAt: 'scanners.mjs sectorStrength() → blendedFromSeries()',
    mode: 'named', keys: { assetBars: ARRAY, benchmarkBars: ARRAY, weights: ARRAY },
    describe: 'one sector\'s weighted RS against one benchmark',
    run: (input) => blendedSectorStrength(input?.assetBars ?? [], input?.benchmarkBars ?? [], input?.weights),
  },
  sectorSeries: {
    group: 'scanners',
    surface: 'internal',
    subsumedBy: 'sectorStrength',
    subsumedAt: 'scanners.mjs sectorStrength() → sectorSeries()',
    mode: 'named', keys: { symbol: STRING, market: STRING, sector: STRING, bars: ARRAY, periods: ARRAY },
    /**
     * ⛔ **Internal because a manager able to call it would have to hand it
     * bars** — the relay #247 exists to delete. `recipes/sector-series.mjs` is
     * how it is reached in a run: the host holds the series, spawns one process
     * per symbol, and the row that comes back carries no bars at all.
     */
    describe: 'one symbol\'s series reduced to what the lane fold reads — the weighted horizons\' returns, three moving averages, the last close and the two highs the bot baseline compares against',
    run: (input, asOf) => {
      const normalized = normalizeBars(input?.bars, asOf)
      const reduced = sectorSeries({ ...input, bars: normalized.bars })
      return { data: reduced.data, diagnostics: [...normalized.diagnostics, ...reduced.diagnostics] }
    },
  },
  sectorStrength: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { benchmarkBars: ARRAY, benchmark: OBJECT, sectors: ARRAY, previousRanks: OBJECT, lane: STRING, weights: ARRAY },
    /**
     * ⚠️ **`benchmark` and `sectors[].series` are the bar-free spelling** (#247).
     * A lane's series live in the host and a recipe process is one symbol, so
     * what a flow holds is a page of reduced rows read back out of the sweep's
     * answer files — never a roster of bars typed back as arguments, which both
     * `PROMPT.md` §The delegation budget and `skills/orchestrate/SKILL.md`
     * refuse. `benchmarkBars` and `sectors[].bars` still answer, and reach the
     * same numbers, because bars are reduced through the same function.
     */
    nested: {
      'sectors[]': { name: STRING, etf: STRING, risk: STRING, series: OBJECT, bars: ARRAY, leaders: ARRAY },
      seriesShape: 'A reduced row from the `sector-series` recipe, read back with `files_read` from `<outputPath>/<itemId>.json` as `data`: `{ closeCount, close, maxClose, maxClose60, ma20, ma50, ma200, returns }`, with `returns` keyed by horizon as a **string** (`"60"`). ⛔ Never assembled by hand and never a bar array — `sectors[].bars` is the second spelling and exists for a single hand-collected series and for fixtures. A row reduced under weights other than this call\'s is missing those horizons and says so as `sector_series_period_unreduced` rather than scoring them as zero.',
    },
    describe: 'L1: lane ranking, rank moves, regime, `researchQueue`, bot baselines — over the reduced rows the `sector-series` recipe wrote (`benchmark`, `sectors[].series`, `leaders[].series`), so the lane\'s bars never leave the host',
    run: (input, asOf) => sectorStrength({ ...input, asOf }),
  },
  regimeTag: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { asserted: STRING, mechanical: ANY, briefRevisionId: STRING, assertedAt: STRING, recorded: ANY },
    describe: 'a Brief regime call, canonicalized, attributed, and compared with the sector reading',
    run: (input, asOf) => regimeTag({ ...input, asOf }),
  },
  entryQualityGate: {
    group: 'scanners',
    surface: 'published',
    mode: 'strict', keys: { bars: ARRAY, lenses: ARRAY, noNewLow: OBJECT },
    describe: '`falling_knife` blocks; eq-v2 and `no_new_low` dual lenses',
    run: entryQualityGate,
  },
  upsideRadar: {
    group: 'scanners',
    surface: 'published',
    mode: 'named', keys: { candidates: ARRAY, feed: OBJECT },
    describe: 'the three fundamental/event lanes, with every exclusion explained and starvation reported, and — given `feed` — the stage that starved it. ⛔ The `valuation` axis on each row is **reported and gates nothing** (`gates: false`, and `reportedNotGatedAxes` once on the answer): no lane screens on price-to-book',
    run: (input, asOf) => upsideRadar({ ...input, asOf }),
  },
  variantViewCheck: {
    group: 'scanners',
    surface: 'published',
    canonical: triggerKind('thesis.invalidationTriggers[].kind'),
    mode: 'named', keys: { thesis: OBJECT, challengeVerdict: STRING, evidenceSamples: ARRAY },
    describe: 'whether a candidate\'s variant view is established — a complete thesis, a dated consensus citation and a cleared challenge — and therefore which lane may size it, plus **whose word** each accepted consensus row is: Aumos obtained it, the manager filed it, or nothing in the record stands behind it',
    run: (input, asOf) => variantViewCheck({ ...input, asOf }),
  },
  sleeveNav: {
    group: 'sizing',
    surface: 'published',
    canonical: cashByCurrency('cash'),
    mode: 'named', keys: { cash: ANY, positions: ARRAY, fx: OBJECT },
    /**
     * ⚠️ `currency` and the currency `marketValue` is counted in are two facts,
     * and reading one key as both is what put dollars in the won bucket (#177).
     */
    nested: {
      cash: 'Per currency, in either representation: the object — { KRW: 11115231, USD: 294.02 } — or the { currency, amount } rows `portfolio.cashByCurrency` carries, which are folded onto it at the one input boundary (#212 ⑥). ⛔ Never an aggregate across currencies, and a row missing either half is reported as `cash_row_unevaluated` rather than added at face value.',
      'cash[]': { currency: STRING, amount: NUMBER },
      'positions[]': { symbol: STRING, currency: STRING, marketValue: NUMBER, valueCurrency: STRING },
      valueCurrency: 'The unit `marketValue` is counted in, when it is not the currency the asset quotes in. `portfolio_read` marks every position in the book\'s base currency, so a KRW listing on a USD book arrives as a **dollar** figure — pass `valueCurrency: "USD"` and it is converted into the sleeve at `fx.USDKRW`. ⛔ Absent it reads as the position\'s own `currency`, which is right on a single-currency book and was silently wrong by the rate itself (1,338.848×) on the book that measured this: krwSleeveNav 11,119,948.16 against 17,430,791.23, status ok, no diagnostic. `marketValueBasis` in the answer says which reading was taken.',
      positionCurrency: 'Always the currency the asset **quotes** in — it is what puts the row in the KR or the US sleeve — and never the currency the book keeps score in. A row key ending in `Currency` that is neither of these two is input_shape_invalid rather than ignored, because a unit read as nothing is added at face value.',
    },
    shape: both(sleeveRows, sleeveCash('cash')),
    describe: 'KRW/USD/SGOV net asset value and the FX that joins them',
    run: sleeveNav,
  },
  targetWeight: {
    group: 'sizing',
    surface: 'published',
    canonical: triggerKind('thesis.invalidationTriggers[].kind'),
    mode: 'named',
    keys: {
      expectedActiveReturn: NUMBER, downsideReturn: NUMBER, conviction: NUMBER, mandatePositionCap: NUMBER,
      sectorHeadroom: NUMBER, themeHeadroom: NUMBER, maturityStatus: STRING, researchGate: STRING, challengeVerdict: STRING,
      /** ⛔ No `uncertainty` / `risks` / `effectiveConstraints`: this weight is a function of numbers alone (#212 ②). */
      lane: STRING, thesis: OBJECT, evidenceSamples: ARRAY, promotion: OBJECT,
      /** The risk budget under the Mandate's cap (#226). */
      mandateMaxDrawdown: NUMBER, heldPortfolioHeat: NUMBER, stopLossPct: NUMBER,
      minimumExecutablePosition: OBJECT, experimentalPositionFloor: OBJECT,
      positionCurrency: STRING, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
    describe: 'the weight the quarter-Kelly arithmetic asks for, under the Mandate\'s cap and the risk budget beneath it',
    run: (input, asOf) => targetWeight({ ...input, asOf }),
  },
  /**
   * ⚠️ **This was `experimentalCeiling` until #226.** It answered the ratio, the
   * bound the venue amount could lift it to, and the amount itself; the first
   * two were the maturity lane and are gone, so what is left is the amount and
   * the operation is named for it.
   */
  minimumExecutableWeight: {
    group: 'sizing',
    surface: 'published',
    mode: 'strict',
    keys: {
      minimumExecutablePosition: OBJECT, experimentalPositionFloor: OBJECT,
      positionCurrency: STRING, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
    nested: {
      minimumExecutablePosition: 'An object keyed by venue currency — { KRW: 300000, USD: 200 } — never a bare amount; the currency of the position being sized selects the row.',
      experimentalPositionFloor: 'The pre-#226 spelling of `minimumExecutablePosition`; it is still read, and a run that uses it is told the key was renamed.',
      fx: { USDKRW: NUMBER },
    },
    describe: 'the smallest position worth opening in this venue, as a weight of this book — ⛔ a floor that refuses, never a target that lifts',
    run: minimumExecutableWeight,
  },
  /**
   * ⚠️ **`uncertainty`, `risks` and `effectiveConstraints` are gone from this
   * contract (#212 ②).** They were how the arithmetic read the proposal's
   * prose, and a `blocked` raised from a substring reached `targetWeight`,
   * which returns `null` for any `blocked` — so a rewritten sentence changed a
   * weight. This operation names the obligation (`data.disclosures`);
   * `proposalDisclosure` judges it. Handing them here is now `input_key_unread`,
   * which is the true answer: nothing reads them.
   */
  effectivePositionCap: {
    group: 'sizing',
    surface: 'published',
    canonical: triggerKind('thesis.invalidationTriggers[].kind'),
    mode: 'named',
    keys: {
      mandatePositionCap: NUMBER, maturityStatus: STRING, lane: STRING, thesis: OBJECT, challengeVerdict: STRING,
      evidenceSamples: ARRAY, promotion: OBJECT,
      mandateMaxDrawdown: NUMBER, heldPortfolioHeat: NUMBER, stopLossPct: NUMBER,
      minimumExecutablePosition: OBJECT, experimentalPositionFloor: OBJECT,
      positionCurrency: STRING, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
    describe: 'the cap the investor declared against the cap that actually binds, the risk budget beneath it, whether a checked variant view lets a position exist at all, and the venue minimum compared against the cap',
    run: (input, asOf) => effectivePositionCap({ ...input, asOf }),
  },
  /** The assembled proposal, and the obligations the sizing handed over. (#212 ②) */
  proposalDisclosure: {
    group: 'sizing',
    surface: 'published',
    mode: 'strict', keys: { disclosures: ARRAY, proposal: OBJECT },
    describe: 'whether the assembled proposal carries the disclosures its own sizing said it owes — the reduced cap, the manager-attested main lane — and, when it does not, which half is silent',
    run: proposalDisclosure,
  },
  /**
   * ── The one place the standing set is assembled (#756) ───────────────────
   *
   * `priceLevels` **replaces**: the host's own words are that *"a list you send
   * replaces every level you had standing on this book, so one you drop is
   * released and `[]` releases them all"*. So the field is not «what this run
   * computed» — it is every level this manager still stands behind on this
   * book, and a run that submits only its own fresh arithmetic silently
   * releases the rest. That is the obligation `standingPlans` carries for
   * promises (`untilled/aumos#690`, `#704`) and it fails the same way.
   *
   * ⚠️ **Which is why folding it is an operation and not a sentence.** Three
   * flows return levels — `exitDiscipline` per holding, `entryTranchePlan` per
   * ladder — and the orchestrator has to hand over one set. Doing that in prose
   * is how the erasure #136 and #137 measured happened twice: a collection
   * carried under a key nobody read came back empty and the run wrote the
   * erasure down while following canon exactly.
   *
   * ⛔ **Absent stays absent.** `levels: null` answers `intent: 'unstated'` and
   * never `[]` — «I said nothing about levels» and «I release them all» are
   * opposite statements, and this is the one field of the proposal where an
   * empty array and an absent field differ.
   */
  priceLevels: {
    group: 'sizing',
    surface: 'published',
    mode: 'strict', keys: { levels: ARRAY, watches: ARRAY, plans: ARRAY },
    nested: {
      levels: { purpose: STRING, asset: OBJECT, price: OBJECT, point: NUMBER, low: NUMBER, high: NUMBER, reason: STRING, thesisRefs: ARRAY, expiresAt: STRING, armedKey: STRING },
    },
    describe: 'the complete `priceLevels` set this proposal will carry, built or checked row by row, with the `armedKey` links to its own watches verified the way the host verifies them — a level Aumos would refuse, refused here where it can still be fixed',
    run: (input) => priceLevelSet({
      levels: input?.levels === undefined ? null : input.levels,
      watches: input?.watches ?? [],
      plans: input?.plans ?? [],
    }),
  },
  effectiveCashFloor: {
    group: 'sizing',
    surface: 'published',
    mode: 'named', keys: { mandateCashFloor: NUMBER, methodologyCashFloors: ARRAY, effectiveConstraints: ARRAY, projectedCashWeight: NUMBER, cashWeight: NUMBER, portfolioNav: NUMBER, portfolioNavCurrency: STRING },
    describe: 'the cash floor the investor declared against the one that binds, and whether the plan still clears it *after* it executes',
    run: effectiveCashFloor,
  },
  singleNameBudget: {
    group: 'sizing',
    surface: 'published',
    mode: 'named', keys: { mandateCashFloor: NUMBER, mandatePositionCap: NUMBER, positions: ARRAY, proposed: ARRAY },
    describe: 'what the Mandate\'s own two numbers leave the single-name lanes to hold — `cashFloor` sets the range, `maxPositionWeight` the per name — and what is left of it',
    run: singleNameBudget,
  },
  legacySizeSuggestion: {
    group: 'sizing',
    surface: 'published',
    mode: 'named', keys: { riskRewardRatio: NUMBER, capWeight: NUMBER, minimumCalibrationSamples: NUMBER, calibrationSamples: NUMBER, winProbability: NUMBER, kellyFraction: NUMBER, stopDistance: NUMBER, fullCapAtRiskReward: NUMBER, expectedValue: NUMBER },
    describe: 'the ported Kelly-gated heuristic and its mode label',
    run: legacySizeSuggestion,
  },
  concentration: {
    group: 'sizing',
    surface: 'published',
    /** ⚠️ `portfolioNav` is read for one thing only: turning `unlockDelta`'s weight into the amount an order would be placed for (#230). */
    mode: 'strict', keys: { positions: ARRAY, proposed: ARRAY, caps: OBJECT, config: OBJECT, portfolioNav: NUMBER, portfolioNavCurrency: STRING },
    /**
     * ⚠️ `caps` was the whole published nesting, and the row shape is what the
     * caps are applied *to* (#173). A run that wrote `sectors` was told nothing.
     */
    nested: {
      caps: { position: NUMBER, sector: NUMBER, theme: NUMBER, factor: NUMBER, portfolioHeat: NUMBER },
      'positions[]': { symbol: STRING, weight: NUMBER, core: BOOLEAN, parkedLiquidity: BOOLEAN, stopLossPct: NUMBER, sector: STRING, themes: ARRAY, factors: ARRAY },
      'proposed[]': 'The same row shape as positions[]. ⚠️ A row for a symbol the book already holds is the target state for that symbol and replaces the holding; it does not stack on it.',
      capsPlacement: 'All five caps go in `caps` and nowhere else: `position` and `portfolioHeat` are the Mandate\'s `maxPositionWeight` and `maxDrawdown`, and `sector`, `theme` and `factor` are the investor\'s, declared at `config.concentration.{sector,theme,factor}` in this package\'s own settings — which the caller reads out and passes **as caps**. ⚠️ Passing them in `config` instead is concentration_caps_misplaced / blocked (#251 ①), and it is blocked because the alternative reads as a pass: an unread cap leaves its axis accumulated into `exposures` and compared against nothing, so `breaches` comes back empty for it and three unmeasured axes look measured and clear. Both wrong places are named — `config.<axis>` at the top, and `config.concentration.<axis>` handed straight through from the settings block. ⛔ An axis with no cap anywhere is the older, narrower concentration_cap_missing / unevaluated, which is also not a pass; `data.unmeasuredAxes` names either case.',
      rowShape: 'The three label axes are not spelled alike and the difference is read: sector is a single string — a listing has one — while themes and factors are arrays, because a name sits on several shared loss paths. ⛔ sectors (plural), theme (singular) and factor (singular) are refused as input_shape_invalid rather than ignored; before #173 the plural sectors was read by nothing, the sector axis accumulated empty, and its cap applied to no weight while the answer stayed status: ok. ⚠️ A row that carries no label on an axis whose cap is declared is reported as concentration_labels_unstated / unevaluated: unlabelled is not under the cap.',
    },
    shape: labelAxes,
    describe: 'position/sector/theme/factor caps and portfolio heat',
    run: concentration,
  },
  /**
   * ⚠️ **`started` and `run` are the two task tools' answers, handed back
   * verbatim; `rows` is what the answers themselves say** (#212 ④,
   * `untilled/aumos#743` §B). The host counts items — `total`, `pending`,
   * `done`, `failed` — and stopped counting *how many had anything to read*,
   * which was always a judgement about documents. That one is derived here from
   * `rows`, the recipe answers this run read back out of its own folder with
   * `files_read`, each carrying `sourced`. ⚠️ Absent `rows` is allowed and is a
   * fact: the run has not measured its preparation, and the record says
   * `unsettled` rather than guessing. `eligibleSymbols` is the one number that
   * is this package's rather than the host's — the names this run's own fold
   * found eligible, from which the count is derived. ⛔ An absent list is `null`
   * and not `0`.
   */
  executionRecord: {
    group: 'sizing',
    surface: 'published',
    mode: 'strict', keys: { started: OBJECT, run: OBJECT, rows: ARRAY, eligibleSymbols: ARRAY },
    nested: {
      'rows[]': 'One recipe answer as `files_read` returned it. Two fields are read: **`sourced`** — a boolean, whether this fund held anything readable for the name — and whether the recipe arrived at anything, which **`data` non-null** states and which a plain boolean **`evaluated`** also states. ⚠️ Until #251 ③ only `data` was read, so a caller who wrote `evaluated: true` on every row came back `counts.evaluated: 0` and `candidateEvaluation: "none"` with no diagnostic — a record reading «25 names eligible» beside «nothing was evaluated». ⛔ A row saying neither is a third answer and never a `false`: it is research_record_unreadable / unevaluated, and `counts.evaluationUnstated` counts it. When both are present `data` decides, because it is the field the recipe itself writes, and the disagreement is reported.',
    },
    describe: 'what this run\'s data preparation actually did — the host\'s own item counts from the task run, set beside what the recipe answers themselves report about how many names this fund held anything readable for, and how many of the answers cleared the gates. ⛔ Reads no diagnostic',
    run: executionRecord,
  },
  /**
   * ⚠️ **`executionRecord` is what decides the cause now** (#212 ④).
   * `reportedDiagnostics` stays and still says *why* — an `input-path` code
   * names a stage that lost an input the research job cannot see — but it no
   * longer grants the positive answer. Omitting the record is `unreported`, not
   * a pass.
   */
  mandateExecution: {
    group: 'sizing',
    surface: 'published',
    mode: 'strict', keys: { mandateObjective: STRING, positions: ARRAY, proposed: ARRAY, cashWeight: NUMBER, reportedDiagnostics: ARRAY, executionRecord: OBJECT },
    describe: 'the share of the book that is cash, parked and risk-bearing, set beside the Mandate\'s declared `objective` — and, when no single name is held at all, whether that is a run that found nothing worth owning or one whose gates never received their inputs',
    run: mandateExecution,
  },
  newSinglePacing: {
    group: 'sizing',
    surface: 'published',
    mode: 'named', keys: { proposedNewSingles: ARRAY, priorNewSingles: ARRAY, sizingPolicyUpdatedAt: STRING, closedOutcomeCount: NUMBER, reviewReadyClosedOutcomes: NUMBER },
    describe: 'three approved pacing warnings; never blocks',
    run: (input, asOf) => newSinglePacing({ ...input, asOf }),
  },
  entryTranchePlan: {
    group: 'sizing',
    surface: 'published',
    canonical: all(triggerKind('tranches[].condition.kind'), moneyAmount('price')),
    mode: 'named', keys: { symbol: STRING, asset: OBJECT, lens: STRING, maturity: STRING, price: NUMBER, plannedTotalWeight: NUMBER, tranches: ARRAY, execution: OBJECT },
    nested: {
      asset: { class: STRING, symbol: STRING, market: STRING, currency: STRING },
    },
    describe: 'a single name\'s T1/T2/T3 ladder: which rung is due, which is within 5%, which lapsed with the plan unfinished, and the `entry` price level each unfilled priced rung states — and that the whole plan is one sample',
    run: (input, asOf) => entryTranchePlan({ ...input, asOf }),
  },
  /**
   * ⚠️ The four keys after `emergencyExit` are the procurement side (#174). A
   * budget is a ratio and has no currency; paying for it is an amount and has
   * one, and without these the answer is a claim about a budget nobody has
   * shown can be bought.
   */
  specialistBudget: {
    group: 'sizing',
    surface: 'published',
    canonical: all(cashByCurrency('sleeveCashByCurrency'), cashByCurrency('sleeveParkedLiquidity')),
    mode: 'strict',
    /**
     * ⚠️ `requestedTargetWeight` stays **declared and refused** (#251 ④). The
     * key is `requestedSleeveTotalWeight`; the retired spelling is kept in the
     * contract only so that a call carrying it gets the sentence that says what
     * the number means, rather than the generic unknown-key refusal — and it is
     * never read as the new one, because the reversed answer was the defect.
     */
    keys: {
      managerId: STRING, flow: STRING, market: STRING,
      currentSleeveWeight: NUMBER, sleeveBudgetWeight: NUMBER, requestedSleeveTotalWeight: NUMBER, requestedTargetWeight: NUMBER, emergencyExit: BOOLEAN,
      sleeveCashByCurrency: ANY, sleeveParkedLiquidity: ANY, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
    /**
     * ⚠️ The budget was published as three weights and answered `withinBriefBudget`
     * over a book whose dollars did not exist (#174).
     */
    nested: {
      sleeveCashByCurrency: 'This book\'s cash stated per currency — { KRW: 11115231, USD: 294.02 }, or the { currency, amount } rows `portfolio.cashByCurrency` carries. ⛔ Never the aggregate `portfolio.cash`: on the book that measured this it read USD 8,596.10 and 96.6% of it was won. A bare amount is input_shape_invalid, and a currency with no row is read as zero of it rather than as unknown.',
      sleeveParkedLiquidity: 'The market value of this book\'s parked liquidity — short-duration and T-bill holdings, the rows carrying `parkedLiquidity: true` — stated per currency in the same two representations as `sleeveCashByCurrency`. ⚠️ It is **in the funding numerator**: money the sleeve already holds in its own currency is money the budget can be paid with, and before #250 there was nowhere to write it, so a sleeve fundable entirely out of its own parking reported `budgetFundableInSleeveCurrency: false` on every run with a «shortfall» equal to that parking. ⚠️ **Reported apart from the cash all the same** — `fundableFromCash` and `fundableFromParking`, because spending parking is a sale and a sale is a proposal the investor approves; read `fundingRoute` for which act pays. ⛔ Optional, and absent is `{}` rather than a missing key: a book that parks nothing is the ordinary book.',
      fundingRoute: 'Not an input. Which act pays for the budget, so that a reader does not have to compare a shortfall against a parked market value by hand — `cash` (idle in the sleeve\'s own currency, or nothing to procure at all), `sell-parking-same-currency`, `fx-conversion`, `cross-market-sale`. The last two are the allocate flow\'s judgement and the investor\'s approval, and this names them rather than choosing.',
      requestedSleeveTotalWeight: 'The weight the **sleeve** is to stand at once the order fills — a total, never the increment being added. ⚠️ A sleeve at 0.31471199 taking on a new 3% name states **0.34471199**; stating `0.03` asks for the sleeve to be cut to three per cent, and until #251 that call came back `increaseWeight: −0.28471199` and `allowed: true` with no diagnostic. It was measured twice in one run, by the us-sleeve flow and by allocate independently. ⛔ The old name `requestedTargetWeight` is refused as sleeve_requested_weight_renamed / blocked and is never read as this key.',
      fx: { USDKRW: NUMBER },
      sleeveCurrency: `Not an input. The sleeve is paid in the currency its market quotes — ${Object.entries(MARKET_CURRENCIES).map(([market, currency]) => `${market} → ${currency}`).join(', ')} — derived from \`market\` and never declared, because a run that could name it could name the wrong one. ⛔ It is neither mandate.constraints.baseCurrency nor portfolio.baseCurrency: those two may disagree and both be right, and neither says what a US buy settles in.`,
      managerId: `The literal id this package publishes — \`${MANAGER_ID}\`, also in inputContracts.vocabulary.managerIds — and **not** the instance id the host addresses this manager by. An \`inst_…\` is manager_id_unknown / blocked, which is the whole answer refused; \`managerId: "string"\` was all the contract said, and \`skills/deterministic-metrics\` named only the retired pre-2026-08-27 package ids as rejected. ⚠️ It defaults to the published id, so the safe call omits it. The market roles are **flows** of this one manager — \`flow\` carries them — not ids of their own.`,
      budget: 'The budget itself stays a plain weight and carries no currency: one FX rate scales a ratio\'s numerator and denominator alike, so a ratio has none. What has a currency is the cash that pays for it — which is why the shortfall is reported in the sleeve currency while `sleeveBudgetWeight` is not.',
    },
    shape: both(sleeveCash('sleeveCashByCurrency'), sleeveCash('sleeveParkedLiquidity')),
    describe: 'a sleeve flow inside its Brief budget and market lane, and whether that budget can be paid for in the currency the sleeve settles in',
    run: specialistBudget,
  },
  globalAllocation: {
    group: 'sizing',
    surface: 'published',
    mode: 'strict', keys: { targets: ARRAY, availableWeight: NUMBER, currentWeights: OBJECT },
    describe: 'the one cross-market denominator; refuses double-spend',
    run: globalAllocation,
  },
  coverage: {
    group: 'evidence',
    surface: 'published',
    mode: 'strict', keys: { scannerUniverses: ARRAY_OF_ARRAYS, extensions: ARRAY, holdings: ARRAY, dispositions: ARRAY },
    nested: {
      'scannerUniverses[]': 'An array of symbol strings — one array per scanner, all of them over the SAME market. Two markets are two calls: universes that share no symbol are not the same denominator, and comparing them raises universe_drift on a difference that was never drift.',
    },
    describe: 'every declared-universe candidate has a current disposition',
    run: (input, asOf) => coverageState({ ...input, asOf }),
  },
  discoveryCapacity: {
    group: 'preflight',
    surface: 'published',
    mode: 'strict', keys: { radar: OBJECT, coverage: OBJECT, uncertainty: ARRAY, boundary: OBJECT },
    nested: {
      boundary: 'What `run/theme-radar-last` held under `boundary` — the running count of consecutive runs in which the declared universe gained no extension (#227). The answer returns `nextBoundary` to write back, so the count is this operation\u2019s arithmetic and never a run\u2019s. Absent reads as a fresh streak, which is the right reading for a book that has never counted.',
    },
    describe: 'which discovery branches were open this run — whether both were shut, which is a report and never a stop, and how long the declared boundary has stood still',
    run: (input, asOf) => discoveryCapacity({ ...input, asOf }),
  },
  validateWatch: {
    group: 'evidence',
    surface: 'published',
    canonical: all(triggerKind('watch.kind'), watchFields('watch'), moneyAmount('current.price')),
    mode: 'named', keys: { watch: OBJECT, current: ANY, config: OBJECT },
    describe: 'kind, futurity, already-met, expiry and reachability',
    run: (input, asOf) => validateWatch(input?.watch, input?.current, asOf, input?.config),
  },
  evaluateWatch: {
    group: 'evidence',
    surface: 'published',
    canonical: all(triggerKind('watch.kind'), watchFields('watch')),
    mode: 'named', keys: { watch: OBJECT, observation: OBJECT, blocks: ARRAY, alertedSessionKeys: ARRAY, config: OBJECT },
    describe: 'a standing WATCH scored met / near / not-met / blocked / unevaluable, with the cadence its kind requires',
    run: (input, asOf) => evaluateWatch({ ...input, asOf }),
  },
  watchAlertState: {
    group: 'evidence',
    surface: 'published',
    mode: 'named', keys: { previous: OBJECT, sessionDate: STRING, alerting: ARRAY },
    describe: 'one session\'s already-alerted WATCH keys, replaced when the session rolls',
    run: (input, asOf) => watchAlertState({ ...input, asOf }),
  },
  validateConsensus: {
    group: 'evidence',
    surface: 'published',
    mode: 'open', keys: { metric: STRING, value: ANY, unit: STRING, period: STRING, sourceUrl: STRING, publishedAt: STRING, capturedAt: STRING, type: STRING, currency: STRING },
    describe: 'a quoted figure is dated, sourced, typed and unit-bearing',
    run: (input, asOf) => validateConsensus(input, asOf),
  },
  researchGate: {
    group: 'evidence',
    surface: 'published',
    mode: 'open', keys: { lens: STRING, priceDeclineReason: ANY, opportunityCase: ANY, trapRisks: ANY, variantView: ANY, benchmarkAlternative: ANY, scenarios: ANY, minimumExpectedActiveReturn: NUMBER, challengeVerdict: STRING, sourceFresh: BOOLEAN, sourceConflict: BOOLEAN },
    describe: 'lens, why-cheap, traps, variant view, scenarios, active-return gate',
    run: researchGate,
  },
  crossCheckPrice: {
    group: 'evidence',
    surface: 'published',
    mode: 'named', keys: { tossPrice: NUMBER, webPrice: NUMBER, tolerance: NUMBER, config: OBJECT },
    nested: {
      config: { priceConflictTolerance: NUMBER },
    },
    describe: 'vendor vs web price; conflict retained, never averaged',
    run: crossCheckPrice,
  },
  validateMacro: {
    group: 'evidence',
    surface: 'published',
    mode: 'named', keys: { observations: ARRAY, webAvailable: BOOLEAN },
    /**
     * ⚠️ `observations: "array"` was the whole published shape and the row is
     * keyed by a closed vocabulary under a field named `indicator` (#177).
     */
    nested: {
      'observations[]': { indicator: STRING, value: NUMBER, observedAt: STRING, sourceUrl: STRING, sourceTier: STRING },
      indicator: `The field is \`indicator\` and its value is one of ${MACRO_INDICATORS.join(', ')} — also published as inputContracts.vocabulary.macroIndicators. ⛔ \`metric\` is the consensus-evidence vocabulary and is refused here by name: written under it every row is unusable, officialCount is 0 and macroLaneAvailable comes back false, which reads as a macro lane with nothing in it rather than a call this operation could not read.`,
      sourceTier: 'official — the publisher of record — or anything else, which is retained with its provenance gap named rather than dropped. Absent reads as aggregator.',
    },
    shape: macroRows,
    describe: 'macro observations are dated and tiered; there is no macro score',
    run: (input, asOf) => validateMacroObservations({ ...input, asOf }),
  },
  /**
   * `strict`, and for the reason the mode exists: this is a gate on whether the
   * run cited what it read, so a key it does not read is a question it was not
   * asked — and the answer would be about something else. (#692)
   */
  observationLedger: {
    group: 'evidence',
    surface: 'published',
    mode: 'strict', keys: { observations: ARRAY, citedEvidenceIds: ARRAY, claims: ARRAY },
    /**
     * ⚠️ `observations: "array"` and `claims: "array"` was the whole published
     * shape, and both rows are receipts whose fields this gate reads one by one
     * (#176). The measured cost: a receipt filed as the manager's word, cited by
     * its id, came back `strongestClaimAttestation: "ungraded"` with `status:
     * "ok"` — and that grade is the input to the main lane's disclosure.
     */
    nested: {
      'observations[]': { evidenceId: STRING, evidenceKind: STRING, evidenceSource: STRING, url: STRING, title: STRING, publishedAt: STRING, contentHash: STRING, excerptChars: NUMBER },
      'claims[]': { claim: STRING, value: ANY, usedFor: STRING, evidenceId: STRING },
      receipt: 'One row per `observation_file` call, **as that tool answered it** — the id, the markers (`evidenceKind: "observation"`, `evidenceSource: "manager:web-research"`), `url`, `title`, `publishedAt`, `contentHash` and `excerptChars`. ⚠️ The tool returns the hash and this package cannot recompute it, so the value has to be **kept from the call and passed back here**; without it the row is `observation_hash_missing` — a receipt nothing can be compared against — and that finding is about the hash alone, never about the grade.',
      grade: 'Not something a claim states. A claim carries `evidenceId`, and the grade travels from the observation filed under that id — `claims[].gradeFrom` says `observation` when it did. ⛔ A claim naming an id no row in `observations` carries is `claim_grade_unstated` rather than a quiet `ungraded`: «this run filed no receipt under that id» and «the receipt has no markers» are different facts, and the main lane\'s `main_lane_rests_on_manager_attestation` disclosure is built on the answer. Carrying `evidenceKind`/`evidenceSource` onto the claim answers it too, and a claim that contradicts the receipt it cites is reported and read at the weaker grade.',
    },
    describe: 'of what this run read on the web and filed with `observation_file`, which readings the proposal actually cites — and, for each value used in judgement, whether any submitted evidence id supports it',
    run: (input, asOf) => observationLedger({ ...input, asOf }),
  },
  calibration: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { samples: ARRAY, minimumSamples: NUMBER, minimumClusters: NUMBER },
    describe: 'per-lens sample, cluster and maturity summary',
    run: calibrationSummary,
  },
  closedOutcomeSamples: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { outcomes: ARRAY, lens: STRING },
    describe: 'closed real decisions turned into the calibration samples that move lens maturity — and which axis they reach, which they do not',
    run: (input, asOf) => closedOutcomeSamples({ ...input, asOf }),
  },
  clusters: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { dates: ARRAY, gapDays: NUMBER },
    describe: 'independent date clusters under the five-day transitive rule',
    run: (input) => ({ data: { clusters: independentDateClusters(input?.dates, input?.gapDays) }, diagnostics: [] }),
  },
  brier: {
    group: 'calibration',
    surface: 'internal',
    subsumedBy: 'calibration',
    subsumedAt: 'calibration.mjs calibrationSummary() → brierScore()',
    mode: 'named', keys: { probabilities: ARRAY, outcomeIndex: NUMBER },
    describe: 'categorical Brier score for declared probabilities',
    run: (input) => ({ data: { score: brierScore(input?.probabilities, input?.outcomeIndex) }, diagnostics: [] }),
  },
  bhFdr: {
    group: 'calibration',
    surface: 'internal',
    subsumedBy: 'promotionGate',
    subsumedAt: 'calibration.mjs promotionGate() → benjaminiHochberg()',
    mode: 'named', keys: { rows: ARRAY, alpha: NUMBER },
    describe: 'Benjamini–Hochberg false-discovery control across lenses',
    run: (input) => ({ data: { rows: benjaminiHochberg(input?.rows ?? [], input?.alpha) }, diagnostics: [] }),
  },
  quintileSpread: {
    group: 'calibration',
    surface: 'internal',
    subsumedBy: 'promotionGate',
    subsumedAt: 'calibration.mjs promotionGate() → quintileSpread()',
    mode: 'named', keys: { values: ARRAY },
    describe: 'top-minus-bottom quintile spread',
    run: (input) => ({ data: { summary: quintileSpread(input?.values) }, diagnostics: [] }),
  },
  bootstrapClusterCi: {
    group: 'calibration',
    surface: 'internal',
    subsumedBy: 'promotionGate',
    subsumedAt: 'calibration.mjs promotionGate() → bootstrapClusterCi()',
    mode: 'named', keys: { clusterValues: OBJECT, options: OBJECT },
    describe: 'cluster bootstrap interval (`mulberry32-v1` when seeded)',
    run: (input) => ({ data: { interval: bootstrapClusterCi(input?.clusterValues, input?.options) }, diagnostics: [] }),
  },
  promotionGate: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { rows: ARRAY, horizon: STRING, seed: NUMBER, resamples: NUMBER, thresholds: OBJECT },
    describe: 'every promotion condition, and which one is missing',
    run: promotionGate,
  },
  attribution: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { totalReturn: NUMBER, coreWeight: NUMBER, coreReturn: NUMBER, noncoreReturn: NUMBER, noncoreBenchmarkReturn: NUMBER },
    describe: 'core beta, non-core, selection, cash and FX — additive',
    run: decomposition,
  },
  twr: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { dailyValues: ARRAY, flows: OBJECT },
    describe: 'time-weighted return across flows',
    run: (input) => ({ data: { return: timeWeightedReturn(input?.dailyValues, input?.flows) }, diagnostics: [] }),
  },
  mwr: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { datedCashflows: ARRAY, endingValue: NUMBER, endingDate: STRING, options: OBJECT },
    describe: 'money-weighted return, annualized',
    run: (input) => ({ data: { return: moneyWeightedReturn(input?.datedCashflows, input?.endingValue, input?.endingDate, input?.options) }, diagnostics: [] }),
  },
  portfolioMetrics: {
    group: 'calibration',
    surface: 'published',
    mode: 'named', keys: { equity: ARRAY, trades: ARRAY, exposures: ARRAY },
    describe: 'drawdown, turnover and the rest of the book-level readings',
    run: portfolioMetrics,
  },
  netReturnBreakdown: {
    group: 'watch',
    surface: 'published',
    mode: 'named', keys: { entry: OBJECT, exit: OBJECT, currency: STRING },
    describe: 'fill-based gross, net-local and net-KRW return',
    run: netReturnBreakdown,
  },
  outcomeClassification: {
    group: 'watch',
    surface: 'published',
    mode: 'open', keys: { thesisCompliance: ANY, riskCompliance: ANY, executionQuality: ANY, executionAttributableToDecision: BOOLEAN, judgedFailures: ARRAY, grossReturnPct: NUMBER, activeReturnPct: NUMBER, benchmarkReturnPct: NUMBER },
    describe: 'the computed failure axis and the judged one',
    run: outcomeClassification,
  },
  forwardOutcome: {
    group: 'watch',
    surface: 'internal',
    subsumedBy: 'signalPaper',
    subsumedAt: 'learning.mjs signalPaper() → forwardOutcome()',
    mode: 'named', keys: { bars: ARRAY, benchmarkBars: ARRAY, sectorBars: ARRAY, signalAt: STRING, horizons: ARRAY },
    describe: 'd5/d20/d60 forward return, excess and MFE/MAE',
    run: forwardOutcome,
  },
  earningsActual: {
    group: 'watch',
    surface: 'published',
    mode: 'named', keys: { preview: OBJECT, actual: OBJECT, filing: OBJECT },
    describe: 'a released result against consensus and guidance',
    run: earningsActual,
  },
  trendGateForward: {
    group: 'backtests',
    surface: 'published',
    mode: 'named', keys: { series: ARRAY, horizons: ARRAY, warmup: NUMBER },
    describe: 'forward returns by trend-gate state',
    run: trendGateForward,
  },
  dcaMultiplierBacktest: {
    group: 'backtests',
    surface: 'published',
    mode: 'named', keys: { series: ARRAY, annualCashCarryPct: NUMBER, warmup: NUMBER },
    describe: 'the DCA multiplier\'s realized effect',
    run: dcaMultiplierBacktest,
  },
  oversoldStrata: {
    group: 'backtests',
    surface: 'published',
    mode: 'named', keys: { assets: ARRAY, benchmarks: OBJECT, horizons: ARRAY },
    describe: 'forward outcomes stratified by oversold depth',
    run: oversoldStrata,
  },
  signalPaper: {
    group: 'learning',
    surface: 'published',
    mode: 'strict', keys: { rows: ARRAY, state: OBJECT, admissions: ARRAY, horizons: ARRAY, openWindows: ANY, closed: ANY, schemaVersion: ANY, updatedAsOf: ANY, maturedThisRun: ANY },
    /**
     * ── `rows: "array"` was the whole published shape of the only path to the
     * promotion gate (#183) ────────────────────────────────────────────────────
     *
     * A run finds the row shape by being refused three times: `{symbol, date,
     * close}` → `paper_row_metadata_missing` ×23, plus `signalAt` →
     * `paper_setup_unknown` ×23, plus `setup`/`ruleVersion` → processed. Every
     * refusal is `blocked` and none of them is wrong, which is why this is a
     * documentation defect and not a silent one — but `signalPaper` is called on
     * **every** wake and the run that spends its calls guessing is the run that
     * reports `paper_windows_unscored`, whose wording is *this run skipped the
     * windows* rather than *this run fetched bars and could not name the shape*.
     *
     * ⚠️ **What is published here is what the code refuses, and no more.** Four
     * fields are required — `symbol`, `signalAt`, `setup`, `ruleVersion` — and
     * `cohort` and `benchmark`, which the run that filed this issue added on its
     * third attempt, are read by nothing on a row: the cohort is derived from the
     * setup and the benchmark is a **series**, `benchmarkBars`. Publishing them
     * as required because a passing call happened to carry them would be the
     * mirror of the defect this file exists to stop.
     */
    nested: {
      'rows[]': { symbol: STRING, signalAt: STRING, setup: STRING, ruleVersion: STRING, bars: ARRAY, benchmarkBars: ARRAY, sectorBars: ARRAY },
      rowShape: `One row per **carried window**, not per bar: \`symbol\` and \`signalAt\` are copied from the \`state.openWindows\` entry the row is scoring, \`setup\` is one of ${Object.keys(PAPER_SETUP_COHORTS).join(', ')} — also inputContracts.vocabulary.paperSetups — and \`ruleVersion\` is the version the window was judged under, refused when absent or null so that rows from two versions are never pooled. The price history goes in \`bars\`, the benchmark's in \`benchmarkBars\` and the sector's in \`sectorBars\`. ⛔ A bar-shaped row — \`date\` and \`close\` at the top of the row — carries no window: \`date\` and \`close\` are read by nothing here, and so are \`cohort\` (derived from \`setup\`) and \`benchmark\` (the series is \`benchmarkBars\`). ⚠️ Absent \`benchmarkBars\` the row scores no excess and drops out of the aggregate rather than counting as zero.`,
      'rows[].bars[]': { timestamp: STRING, close: NUMBER, high: NUMBER, low: NUMBER },
      barShape: 'The instant is `timestamp` — ⛔ **not** `date` or `time`, which `indicators` and `trendState` do accept — and `close` must be a finite number. A row of bars written under `date` yields no usable bar at all, and the answer is `forward_base_missing` / `unevaluated` on a path of `bars`: *a last close before signalAt and later bars are required*, which reads as a window the calendar has not reached yet rather than a series this operation could not parse. `high` and `low` are optional and fall back to `close` for the excursion.',
      state: 'The whole value read from `learning/paper-cohorts`. Five members are read — { schemaVersion, updatedAsOf, closed, openWindows, maturedThisRun } — and the envelope fields PROMPT.md §1 asks of a memory value are carried without being read: each one is named back as `input_state_envelope_ignored` / `info` so that «not there» and «there and not read» stay different facts, and the `nextState` returned is the five members alone, so a record stored wrapped comes back unwrapped. ⛔ Any **other** unknown field is still `input_shape_invalid` / `blocked` — outside the envelope an unrecognised key reads as a misspelled member, and a misspelled `openWindows` is a track this operation cannot see. ⛔ Its `openWindows` passed at the **top level** is `paper_state_misplaced`: read there the track is invisible and the `nextState` this would return is the erasure of it.',
      'admissions[]': { symbol: STRING, setup: STRING, ruleVersion: STRING, signalAt: STRING, benchmark: ANY },
    },
    shape: paperState,
    describe: 'forward scoring of the paper log, aggregated per setup and per cohort',
    run: (input, asOf) => signalPaper({ ...input, asOf }),
  },
  paperAdmission: {
    group: 'learning',
    surface: 'published',
    mode: 'strict', keys: { setup: STRING, challengeVerdict: STRING, thesis: OBJECT, priceHistoryLatestDate: STRING },
    describe: 'promote / watch / rejected, and refuses a promote on stale price history',
    run: (input, asOf) => paperAdmission({ ...input, asOf }),
  },
  shadowTrack: {
    group: 'learning',
    surface: 'published',
    mode: 'named', keys: { shadowReturnPct: NUMBER, realReturnPct: NUMBER, windowDays: NUMBER, thresholds: OBJECT },
    describe: 'same decisions at unconstrained size — is the cap what costs return?',
    run: shadowTrack,
  },
  baselineTrack: {
    group: 'learning',
    surface: 'published',
    mode: 'named', keys: { portfolioReturnPct: NUMBER, baselines: ARRAY },
    describe: 'what buying the index and waiting would have returned',
    run: baselineTrack,
  },
  controlArmLane: {
    group: 'learning',
    surface: 'published',
    mode: 'named', keys: { positions: ARRAY, proposed: ARRAY },
    describe: 'the lens lane whose product is closed outcomes — its exit registration and concurrency bound, and the prohibition on expanding it on its own result. ⛔ Its size caps were removed in #226',
    run: controlArmLane,
  },
  verdictReport: {
    group: 'learning',
    surface: 'published',
    mode: 'named', keys: { paper: OBJECT, cohort: STRING, shadow: OBJECT, baseline: OBJECT, closedOutcomeCount: NUMBER, thresholds: OBJECT },
    describe: 'the §6 verdict against pre-registered criteria, and the proposals it raises',
    run: (input, asOf) => verdictReport({ ...input, asOf }),
  },
  lensEnvelope: {
    group: 'envelopes',
    surface: 'published',
    mode: 'named', keys: { lens: STRING, triggers: ARRAY },
    describe: 'the numeric envelope each lens can produce, and whether a revisit trigger is reachable inside it',
    run: lensEnvelope,
  },
  clusterBlock: {
    group: 'envelopes',
    surface: 'published',
    mode: 'named', keys: { clusters: ARRAY, intent: STRING },
    describe: 'whether a correlated event cluster holds promotion, and when it clears',
    run: (input, asOf) => clusterBlock({ ...input, asOf }),
  },
  timeStopPolicy: {
    group: 'envelopes',
    surface: 'published',
    mode: 'named', keys: { positions: ARRAY },
    describe: 'review date reached with the catalyst unrealized and the benchmark ahead → exit candidate',
    run: (input, asOf) => timeStopPolicy({ ...input, asOf }),
  },
  exitDiscipline: {
    group: 'learning',
    surface: 'published',
    mode: 'strict',
    keys: {
      symbol: STRING, asset: OBJECT, lane: STRING, entryDate: STRING, tradingDaysHeld: NUMBER, entryPrice: NUMBER, price: NUMBER,
      positionWeight: NUMBER, mandateMaxDrawdown: NUMBER, heldPortfolioHeat: NUMBER, registration: OBJECT,
      entryProposed: BOOLEAN, proposedExits: ARRAY,
    },
    nested: {
      registration: { stopPct: NUMBER, stopPrice: NUMBER, reviewBy: STRING },
      asset: { class: STRING, symbol: STRING, market: STRING, currency: STRING },
    },
    describe: 'the unconditional time stop and the stop distance this position may carry, the two WATCH rows an entry registers, and the `stop` price level the price-below row is watching',
    run: (input, asOf) => exitDiscipline({ ...input, asOf }),
  },
  ruleVersions: {
    group: 'envelopes',
    surface: 'published',
    mode: 'named', keys: { registry: OBJECT, rows: ARRAY, axis: STRING },
    describe: 'the eleven versioned axes, what is current, and whether these rows may be pooled',
    run: ruleVersions,
  },
  policyLint: {
    group: 'envelopes',
    surface: 'published',
    mode: 'named', keys: { current: OBJECT, proposed: OBJECT, provenance: OBJECT },
    describe: 'whether a configuration change is stricter, who approved it, and whether it may move at all',
    run: policyLint,
  },
  harnessAudit: {
    group: 'preflight',
    surface: 'published',
    mode: 'strict', keys: { positions: ARRAY, watches: ARRAY, theses: ARRAY, decisions: ARRAY, universe: OBJECT, researchActivity: ARRAY, gateStaleDays: NUMBER, managedSince: STRING, totalDecisions: NUMBER, config: OBJECT },
    nested: {
      'researchActivity[]': { source: STRING, granted: BOOLEAN, attempts: NUMBER, succeeded: 'boolean-or-count' },
      universe: { scannerUniverses: ARRAY_OF_ARRAYS, extensions: ARRAY, screenedUniverseCount: NUMBER },
      'positions[].origin': { decisionId: STRING, asOf: STRING },
      totalDecisions: 'history.totalDecisions — how many judgements this book has sealed at or before asOf. Greater than the number of decisions passed means the older part of the journal was not supplied. ⛔ Absent means the host did not say; it is never zero and never a statement that the window is whole, and a holding whose explanation may sit outside an unmeasured window is not an unexplained holding.',
    },
    shape: laneRows('researchActivity'),
    describe: 'orphaned WATCHes, mismatched positions, stale gates, order-ready decisions with no exit; and, as warnings, the holdings no decision explains — read from `positions[].origin` over the whole journal, not from the decision window — and a discovery universe nobody declared',
    run: (input, asOf) => harnessAudit({ ...input, asOf }),
  },
  lessonAudit: {
    group: 'preflight',
    surface: 'published',
    mode: 'named', keys: { proposals: ARRAY, staleDays: NUMBER },
    describe: 'what is already waiting for the investor, so this run does not propose it again',
    run: (input, asOf) => lessonAudit({ ...input, asOf }),
  },
  candidateCompletion: {
    group: 'evidence',
    surface: 'published',
    mode: 'strict', keys: { owesDocument: ARRAY, records: ARRAY },
    nested: {
      owesDocument: '`candidateQueue`\'s `owesDocument` rows, handed over unchanged — `{ symbol, market, lens, position }`. It is the list this run said it would carry, so the stage is checked against the run\'s own declaration and not against a number this operation chose.',
      records: 'One row per completed candidate record: `{ symbol, market, lens, thesis, challengeVerdict, verdict }`. `thesis` is the document itself — the same object `variantViewCheck` and `validateThesis` take, which this calls rather than reimplements. ⚠️ `verdict` is what **you** concluded and is carried verbatim: a decline is an outcome of the stage and never a failure of it. ⛔ A record for a name that was not carried is not an error and is simply not read; a carried name with no record is `candidate_completion_absent`.',
    },
    describe: 'whether the completion stage ran — for each candidate this run said it would carry, is there a record, and what `variantViewCheck` made of it. ⛔ Not a fifth gate: «judged and declined» and «no document was ever written» are two different states of this book and this is what tells them apart',
    run: (input, asOf) => candidateCompletion({ ...input, asOf }),
  },
  validateThesis: {
    group: 'evidence',
    surface: 'published',
    canonical: triggerKind('invalidationTriggers[].kind'),
    mode: 'open', keys: { evidenceStatus: STRING, variantView: ANY, consensusRefs: ARRAY, catalysts: ARRAY, invalidationTriggers: ARRAY, expectedUpsidePct: NUMBER, fairValueRange: ANY },
    describe: 'the thesis metadata contract; `complete` with gaps is refused',
    run: validateThesis,
  },
  thesisSentinel: {
    group: 'watch',
    surface: 'published',
    mode: 'strict', keys: { invalidations: ARRAY, evidence: ARRAY, priorVerdicts: ARRAY },
    nested: {
      'invalidations[]': `{ id, kind, level | operator+level | at, evidenceId }. kind is one of ${['price_below', 'price_above', 'metric', 'time'].join(', ')}; a metric rule also carries metric and operator. ⚠️ id is kept verbatim and is what an evidence row addresses; without one the answer names the rule by position as rule-<index> and says so.`,
      'evidence[]': 'The observation a rule is judged against: { id, value | availableAt, metric, invalidationId }. ⚠️ A row is joined to a rule by one of three keys and never by position — rule.evidenceId → this row\'s id, this row\'s invalidationId → rule.id, or, for a metric rule, this row\'s metric → rule.metric. A rule that joins to nothing, or to more than one row under the same key, answers unevaluated; it is never met, so an invalidation nobody supplied evidence for cannot become a threatened verdict.',
      'priorVerdicts[]': { asOf: STRING, verdict: STRING },
      /**
       * ⚠️ The threshold field is `level` and the observation field is `value`
       * (#177). Both near-misses are refused by name rather than read as absent.
       */
      fieldNames: 'The threshold a rule compares against is `level` — never `threshold` — and a time rule\'s instant is `at`. On the evidence row the reading is `value` and its instant is `availableAt` — never `observed` / `observedAt`. ⛔ Written under the near-miss spelling the rule joined, found its evidence, and came back `unevaluated` with "Rule and evidence are not comparable": a real observation past a real level, reported as a rule nobody could judge. Those four spellings are input_shape_invalid, because reading them as absent is how a breach becomes a shrug.',
    },
    shape: sentinelRules,
    describe: '`intact` / `watch` / `threatened`, and the escalation it forces',
    run: thesisSentinel,
  },
  exitCheck: {
    group: 'watch',
    surface: 'published',
    canonical: all(triggerKind('thesis.invalidationTriggers[].kind'), moneyAmount('price')),
    mode: 'strict', keys: { symbol: STRING, price: NUMBER, rules: OBJECT, thesis: OBJECT, sentinel: ANY },
    shape: scalarPrice,
    describe: 'L2.5: price and fundamental lanes → SELL / TRIM / REVIEW',
    run: (input, asOf) => exitCheck({ ...input, asOf }),
  },
  validateMemory: {
    group: 'memory',
    surface: 'published',
    mode: 'named', keys: { value: ANY, expectedSchemaVersion: NUMBER },
    describe: 'the memory value contract; refuses copied source prose',
    run: (input, asOf) => validateMemory({ ...input, asOf }),
  },
  migrationMap: {
    group: 'memory',
    surface: 'published',
    mode: 'named', keys: { records: ARRAY, cutoverAt: STRING, schemaVersion: NUMBER },
    describe: 'a legacy record → its canonical Aumos owner',
    run: migrationMap,
  },
  filterPointInTime: {
    group: 'sources',
    surface: 'published',
    mode: 'named', keys: { rows: ARRAY, timestampField: STRING, freshnessHours: NUMBER },
    describe: 'drops rows that were not public at `asOf`',
    run: (input, asOf) => filterPointInTime(input?.rows, { ...input, asOf }),
  },
  normalizeSecFacts: {
    group: 'sources',
    surface: 'published',
    mode: 'open', keys: {},
    describe: 'SEC company facts with their availability dates',
    run: (input, asOf) => normalizeSecFacts(input, asOf),
  },
  normalizeDartFilings: {
    group: 'sources',
    surface: 'published',
    mode: 'open', keys: {},
    describe: 'OpenDART receipts — the receipt is when a fact became public',
    run: (input, asOf) => normalizeDartFilings(input, asOf),
  },
  parseDartCorpCodes: {
    group: 'sources',
    surface: 'published',
    mode: 'named', keys: { xml: STRING },
    describe: 'the OpenDART corp-code registry',
    run: (input) => parseDartCorpCodes(input?.xml),
  },
  normalizeDartFinancials: {
    group: 'sources',
    surface: 'published',
    mode: 'open', keys: {},
    describe: 'OpenDART statements',
    run: (input, asOf) => normalizeDartFinancials(input, asOf),
  },
  normalizeSecSubmissions: {
    group: 'sources',
    surface: 'published',
    mode: 'open', keys: {},
    describe: 'SEC submissions index',
    run: (input, asOf) => normalizeSecSubmissions(input, asOf),
  },
  laneCoverage: {
    group: 'evidence',
    surface: 'published',
    mode: 'strict', keys: { lane: STRING, sources: OBJECT, intent: STRING, activity: OBJECT },
    nested: {
      'activity.<source>': { attempts: NUMBER, succeeded: 'boolean-or-count' },
      'sources.<source>': { status: STRING },
    },
    shape: laneRows('activity'),
    describe: 'which lane a missing source closes, and what it degrades to',
    run: laneCoverage,
  },
  validateAdjustment: {
    group: 'evidence',
    surface: 'published',
    mode: 'named', keys: { series: ARRAY, corporateActions: ARRAY },
    describe: 'split/dividend adjustment conflicts between vendors',
    run: (input) => validateAdjustment(input?.series, input?.corporateActions),
  },
  fundamentalsPlan: {
    group: 'feeding',
    surface: 'published',
    canonical: researchMarket('market'),
    mode: 'strict', keys: { market: STRING, symbols: ARRAY, corporationCodes: ARRAY, cache: OBJECT, businessYear: ANY, reportCode: ANY, freshForSeconds: NUMBER },
    nested: {
      'symbols[]': 'A roster symbol string, or a researchUniverse row — { symbol, sector }. The whole array from researchUniverse.data.symbols is what this expects.',
      'corporationCodes[]': { symbol: STRING, corporationCode: STRING, vendorId: STRING },
      'cache.<cacheKey>': `The source_cache_read answer for that call: { state, documents | cached, observedAt }. The field is state, not status, and it is one of ${['fresh', 'stale', 'never-fetched', 'refresh-failed'].join(', ')}. An absent entry is reported as unreported rather than assumed empty.`,
    },
    describe: 'the ordered source calls that feed the branch, each with its host cache state — and whether that state means *read it*, *refresh it* or *the refresh failed*',
    run: (input, asOf) => fundamentalsPlan({ ...input, asOf }),
  },
  mapCorporationCodes: {
    group: 'feeding',
    surface: 'published',
    canonical: researchMarket('market'),
    mode: 'strict', keys: { market: STRING, symbols: ARRAY, registryRows: ANY, filingRows: ANY, tickerRows: ANY },
    nested: {
      registryRows: 'parseDartCorpCodes output — the array, or the { rows } wrapper. KR only.',
      filingRows: 'normalizeDartFilings output; the list.json route carries corp_code and stock_code on the same row and is the fallback when the ZIP cannot be decompressed.',
      tickerRows: 'The company_tickers.json body — the object keyed by index, or its values as an array. US only; it is what supplies the CIK the cache route wants.',
    },
    describe: 'roster symbol → the vendor\'s own filer id (OpenDART `corp_code`, SEC CIK); reports unmapped names one by one',
    run: (input, asOf) => mapCorporationCodes({ ...input, asOf }),
  },
  dartVendorStatus: {
    group: 'feeding',
    surface: 'published',
    mode: 'named', keys: { payload: OBJECT, path: STRING },
    describe: 'which OpenDART status arrived on an HTTP 200 — ⛔ `013` (matched nothing) and `020` (quota; **we were not allowed to look**) are never the same finding',
    run: (input) => dartVendorStatus(input),
  },
  radarCandidates: {
    group: 'feeding',
    surface: 'published',
    canonical: researchMarket('market'),
    mode: 'strict', keys: { market: STRING, symbols: ARRAY, financials: OBJECT, facts: OBJECT, documents: OBJECT, prices: OBJECT, events: OBJECT, catalysts: OBJECT, valuations: OBJECT },
    nested: {
      'financials.<symbol>': 'normalizeDartFinancials output for that symbol. KR.',
      'facts.<symbol>': 'normalizeSecFacts output for that symbol. US.',
      'documents.<symbol>': 'The CachedDocument array from source_cache_read — { publishedAt, version, normalized: { period, currency, metrics } }. When present it is preferred over the raw vendor rows, because it is what the host already dated.',
      'prices.<symbol>': { status: STRING, close: NUMBER, ma50: NUMBER, ma200: NUMBER, offHigh200: NUMBER, rs20VsBenchmarkPct: NUMBER },
      'valuations.<symbol>': '{ shares, equity, debt } from the same filing, which upsideRadar turns into the priceToBook and debtToEquity on its valuation axis. ⛔ That axis is **reported and gates nothing** — every row says so as `gates: false`, and the answer repeats it once in `reportedNotGatedAxes`. No registered lane screens on price-to-book, `eligible` and the rank do not read it, and supplying it changes no verdict; it is context for the thesis a surfaced name goes on to get, and valuation as a *judgement* is `thesisValuation` (#170).',
    },
    describe: 'vendor rows or cached normalized documents → `upsideRadar` candidates, with every unfed name still returned and counted',
    run: (input, asOf) => radarCandidates({ ...input, asOf }),
  },
  radarFeedDiagnosis: {
    group: 'feeding',
    surface: 'published',
    canonical: researchMarket('market'),
    mode: 'strict', keys: { market: STRING, symbols: ARRAY, plan: OBJECT, mapping: OBJECT, responses: ARRAY, candidates: OBJECT, catalysts: OBJECT, lanes: OBJECT },
    nested: {
      plan: 'The whole fundamentalsPlan data object; its requests carry the cache states this reads.',
      mapping: 'The whole mapCorporationCodes data object. ⚠️ null means the join was never attempted, which is a different finding from a join that returned nothing.',
      'responses[]': { step: STRING, symbol: STRING, feedFailure: STRING, classification: STRING, usable: BOOLEAN },
      candidates: 'The whole radarCandidates data object — the `candidates` rows included, not only `fedCount`. ⚠️ They are the denominator: without them coverage falls back to the roster, and one fed name out of eighty-three reported as `fed` is what #178 measured. ⛔ A reading that can count neither answers `candidateCount: null` rather than assuming it was whole.',
      catalysts: 'The whole `catalystRegister` data object. ⚠️ Two of the three lanes read the catalyst axis, and this is what splits `never-fed` into **`never-fed-no-catalyst-producer`** (nobody produced it) and **`never-fed-catalyst-producer-empty`** (it ran and registered nothing) — two facts with opposite fixes that were one word until #228. ⛔ Absent, the reading says `producer: "absent"` and raises `catalyst_producer_absent` rather than assuming either.',
      lanes: 'upsideRadar.data.lanes, so the reading can say fed-and-empty rather than starved.',
    },
    describe: 'which stage lost the input — registry, mapping, request, response, normalization — so a starved lane names its cause instead of repeating *unfed*; and, given the register, whether a starved catalyst lane had **no producer** or a producer that **answered nothing**',
    run: (input, asOf) => radarFeedDiagnosis({ ...input, asOf }),
  },
  catalystCadence: {
    group: 'feeding',
    surface: 'published',
    canonical: researchMarket('market'),
    mode: 'strict', keys: { market: STRING, documents: OBJECT, evidence: OBJECT, roster: ARRAY, horizonDays: NUMBER },
    nested: {
      'documents.<symbol>': 'The same CachedDocument array `radarCandidates` is given — { publishedAt, version, normalized: { period, currency, metrics } }. ⚠️ One map, passed to both, so the two operations cannot disagree about what this branch read.',
      evidence: 'documentKey → the Aumos evidence id(s) that document was filed under. ⚠️ **The CachedDocument shape this package has measured carries none**, so the join comes from `evidence_search` and arrives here; `HOST-FOLLOWUPS.md` records the debt. ⛔ A document with no id derives no window — the discipline that refuses an uncited catalyst is not relaxed for a derived one, it is repointed at the basis.',
      roster: 'The same `symbols` argument `radarCandidates` and `catalystRegister` are given; the coverage denominator.',
      horizonDays: 'How far ahead a derived window may open and still be worth registering. Defaults to the 60 days `upsideRadar` reads, and a window past it is counted rather than returned.',
    },
    describe: `the cadence stage the axis never had (#228): cached filings in, **estimated** disclosure windows out. The period-end→published lag is **measured from this book's own cache at run time** and reported with its count — ⛔ the ported-from harness's KR 45 / US 30 are the precedent for the method and are never a fallback; under the floor it refuses to estimate. Every row carries \`dateSource: "${CATALYST_DATE_ESTIMATED}"\` and the past filings' evidence ids. ⛔ It derives **no** event record: a cadence says when a filer will probably speak, never what it said`,
    run: (input, asOf) => catalystCadence({ ...input, asOf }),
  },
  catalystRegister: {
    group: 'feeding',
    surface: 'published',
    canonical: researchMarket('market'),
    mode: 'strict', keys: { market: STRING, previous: OBJECT, catalysts: ARRAY, estimated: ARRAY, events: ARRAY, roster: ARRAY },
    /**
     * ⚠️ Both row shapes are published because both were **absent inputs**, not
     * wrong ones (#169): a caller that has never sent a catalyst has no wrong
     * spelling to learn from, and `catalysts: "array"` is the shape a guess is
     * built on.
     */
    nested: {
      'catalysts[]': { symbol: STRING, market: STRING, event: STRING, windowStart: STRING, windowEnd: STRING, observedAt: STRING, evidenceIds: ARRAY },
      /**
       * ⚠️ **Field by field, and with `catalystCadence`'s own output names
       * (#249).** This entry was one paragraph of prose while `catalysts[]` one
       * line up was a field table — *"a separate argument on purpose"* was said
       * and the shape of the argument was not — and that asymmetry is what a
       * flow measured: three shapes tried for one derived window on
       * `run_bb689b6199084b04afd8b0e1d1528cda`, none of them the right one, and
       * the only one that registered recorded a projection as a confirmed date.
       * A caller that has never sent an estimate has no wrong spelling to learn
       * from, which is #169's own reason for publishing `catalysts[]`, and it
       * applies here one argument over.
       *
       * ⚠️ **The names are 1:1 with what `catalystCadence` answers**, so the
       * rows pass straight through — `registerAs.estimated` is that array under
       * this argument's name, and a run that hands it over composes nothing.
       */
      'estimated[]': { symbol: STRING, market: STRING, event: STRING, windowStart: STRING, windowEnd: STRING, observedAt: STRING, dateSource: STRING, cadenceBasis: OBJECT, evidenceIds: ARRAY },
      'estimated[].cadenceBasis': { medianLagDays: NUMBER, leadDays: NUMBER, basisFilings: NUMBER, basisSymbols: NUMBER, periodGapDays: NUMBER, nextPeriodEnd: STRING, measuredFrom: STRING },
      estimatedRowShape: `The \`estimated\` rows \`catalystCadence\` answered, verbatim — hand over \`registerAs.estimated\` and change nothing. \`dateSource\` is the literal \`"${CATALYST_DATE_ESTIMATED}"\`, the only value this argument accepts, and \`cadenceBasis\` is required: \`medianLagDays\` and a \`basisFilings\` above zero are the two an estimate cannot be read without, and the rest are carried when they were measured. \`windowStart\`/\`windowEnd\`/\`observedAt\` are RFC 3339 here, as they are on \`catalysts[]\`; ⚠️ the \`…EpochMs\` numbers are what \`previous\` carries and what \`nextState\` writes back, and either spelling is read. ⛔ **A separate argument on purpose**: an estimate and a reading are different claims, and an estimate arriving on \`catalysts\` — or on this one without saying it is an estimate — is \`catalyst_estimate_unmarked\` and blocked. ⛔ **And the same window may not arrive on both arrays**: the fold keeps the confirmed copy under a \`(market, symbol, event)\` key, so a projection sent twice registers once as a date somebody read — the third shape #249 measured, and the one that used to get through. Neither array's discipline is weakened; what an estimated row cites is the past filings its cadence was measured over.`,
      'events[]': { symbol: STRING, market: STRING, announcedAt: STRING, sue: NUMBER, day1ExcessPct: NUMBER, preAnnouncementClose: NUMBER, guidanceSurprise: NUMBER, evidenceIds: ARRAY },
      evidenceIds: 'Required on every row of both arrays, and this is the whole discipline of the operation: a catalyst window nobody can go and check is not a registered catalyst, it is a claim. File the reading with `observation_file` and put the returned id here — the same route `consensusRefs` takes.',
      previous: 'The whole value read from `state/research/catalyst-window.json` — { schemaVersion: 1, updatedAsOf, rows[] }. ⚠️ Its rows carry `windowStartEpochMs` / `windowEndEpochMs` as **numbers**: a catalyst window ends after `asOf` by construction, and `memory_read` refused a payload carrying a later **string** timestamp. That guard does not reach a file (`untilled/aumos#743`), and the encoding stays anyway as this package\'s own canon — every reader here expects it. Persist `nextState` verbatim; do not rewrite the instants as RFC 3339.',
      roster: 'The same `symbols` argument `radarCandidates` is given — the denominator the coverage counts are taken against, so the two operations cannot disagree about who was in the sweep. Absent, the counts are zero and no unresearched finding is raised: a denominator nobody declared is not evidence that nothing was missed.',
    },
    describe: 'the catalyst and event axis, which had **no producer at all** until #169: researched windows and event records in — each carrying the `evidenceIds` the reading was filed under — the two maps `radarCandidates` takes out, plus the bounded `research/catalyst-window` revision they are carried in. ⛔ It counts the names nobody researched separately from the names researched with nothing scheduled',
    run: (input, asOf) => catalystRegister({ ...input, asOf }),
  },
  thesisValuation: {
    group: 'feeding',
    surface: 'published',
    mode: 'strict', keys: { asset: STRING, market: STRING, price: NUMBER, currency: STRING, scenarios: OBJECT, filings: ARRAY },
    nested: {
      'scenarios.<bear|base|bull>': { probability: NUMBER, target: NUMBER, return: NUMBER, drivers: ARRAY },
      'scenarios.<case>.drivers[]': 'Either a filing-fact name — revenue, operatingIncome, operatingIncomeYoy, marginDeltaYoy — or { metric, evidenceId }. ⛔ Any other name is reported unmatched rather than read as something else; this package has no valuation method of its own to fall back on. ⚠️ **The second form is how a filed consensus reading becomes a driver, and it always has been** (#229): { metric: "analystTargetMean", evidenceId } for the id `observation_file` returned is accepted here, the id travels onto the returned driver row, and the targets still produce `fairValueRange`, `expectedUpsidePct` and `thesisFields`. ⛔ What it does **not** do is make the case `grounded`: that word means a filing fact this run could read off the statements, an analyst target is not one, and the case is reported `scenario_driver_ungrounded` / `unevaluated` rather than refused. ⚠️ So a fair value here does not have to be a DCF — it has to say where it came from, and an uncited band says nothing. Cite both where both exist; that is the only combination that is grounded and cited at once.',
      'filings[]': 'The `filings` array `radarCandidates` builds for this symbol, unchanged: { periodEnd, availableAt, revenue, operatingIncome, operatingIncomeYoy, marginDeltaYoy, currency, sourceType }.',
    },
    describe: '`fairValueRange` and `expectedUpsidePct` out of the bear/base/bull table, with each case\'s target tied to the filing facts under it — ⛔ this package publishes no multiple and no discount rate of its own',
    run: (input, asOf) => thesisValuation({ ...input, asOf }),
  },
  thesisGapSources: {
    group: 'feeding',
    surface: 'published',
    mode: 'strict', keys: { asset: STRING, market: STRING, gaps: ARRAY, mapping: OBJECT, instrumentType: STRING, feed: OBJECT, filings: ARRAY },
    nested: {
      gaps: 'The `gaps` array `validateThesis` returned, verbatim.',
      mapping: 'The `mapCorporationCodes` answer — { registrySize, mapped[], unmapped[] } — which is what decides whether this symbol has a filer at all. ⛔ Without it the instrument stays unclassified rather than assumed.',
      feed: 'The `radarCandidates` answer, for `fedCount`: whether the statements were actually read.',
    },
    describe: 'for each `validateThesis` gap: which source fills it, and whether that source **does not exist for this instrument** or **exists and was never called** — the two the same `gaps` list has been hiding',
    run: (input, asOf) => thesisGapSources({ ...input, asOf }),
  },
  zonedDateTimeToUtc: {
    group: 'schedule',
    surface: 'internal',
    subsumedBy: 'nextReviewSequence',
    subsumedAt: 'schedule.mjs nextReviewSequence() → zonedDateTimeToUtc()',
    mode: 'named', keys: { date: STRING, time: STRING, timeZone: STRING },
    describe: 'a local date/time in an IANA zone → one instant',
    run: (input) => ({ data: { instant: zonedDateTimeToUtc(input?.date, input?.time, input?.timeZone) }, diagnostics: [] }),
  },
  nextMarketReview: {
    group: 'schedule',
    surface: 'internal',
    subsumedBy: 'nextReviewSequence',
    subsumedAt: 'schedule.mjs nextReviewSequence() → nextMarketReview()',
    mode: 'strict', keys: { sessions: ARRAY, bufferMinutes: NUMBER },
    nested: {
      'sessions[]': { isOpen: BOOLEAN, date: STRING, closeLocal: STRING, timeZone: STRING },
    },
    shape: sessionRows,
    describe: 'the next real open session close plus buffer',
    run: (input, asOf) => nextMarketReview({ ...input, asOf }),
  },
  earningsCheckpoint: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { observation: OBJECT, marketSession: OBJECT, config: OBJECT },
    describe: 'BMO/AMC/date-only → an at-time checkpoint',
    run: (input, asOf) => earningsCheckpoint(input?.observation, input?.marketSession, { ...input?.config, asOf }),
  },
  boundedRetry: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { checkpointAt: STRING, attempt: NUMBER, announcedReplacementAt: STRING, config: OBJECT },
    describe: 'the bounded retry after a wake found nothing published',
    run: (input, asOf) => boundedRetry({ ...input, asOf }, input?.config),
  },
  classifyScheduledWake: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { watchId: STRING, summary: STRING, armed: ARRAY, scheduledAt: STRING, asOf: STRING, consumedWatchIds: ARRAY, sourceStatus: STRING, releaseFound: BOOLEAN },
    describe: 'why this run woke',
    run: classifyScheduledWake,
  },
  scheduleDrift: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { previous: OBJECT, current: OBJECT },
    describe: 'late, missing, duplicated and outage-shaped fires',
    run: (input, asOf) => scheduleDrift({ ...input, asOf }),
  },
  deduplicateObservations: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { rows: ARRAY },
    describe: 'the same observation arriving twice',
    run: deduplicateObservations,
  },
  themeRadarDue: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { lastThesisCallAt: STRING, lastRunAt: STRING, intervalDays: NUMBER, dislocation: BOOLEAN },
    nested: {
      lastThesisCallAt: 'When this radar last produced a `thesis_call` — the clock the interval is measured on, and the one the source methodology names (#227). ⛔ Not when it last ran: a run that looked and found nothing would then lock the next three days, which is the inverse of the design. `null` is a value and says the radar has run and produced none, which is due; omitting it on a record that carries `lastRunAt` is the pre-0.6.0 shape and answers `theme_radar_clock_unstated` / `unevaluated`, also due.',
      lastRunAt: 'When the radar last ran. It is an observation and decides nothing — it comes back as `runAgeDays` so a radar that has run six times and produced nothing stays distinguishable from one that has never run.',
      dislocation: 'True runs the radar regardless of staleness — the source runs it in dislocation weeks because they are the richest thesis environment. ⚠️ Its producer is `dislocationSignal`, over what `validateMacro` returned; ⛔ it is never a run’s own adjective.',
    },
    describe: 'whether the forward-research interval has elapsed — measured from the last `thesis_call`, not the last run',
    run: (input, asOf) => themeRadarDue({ ...input, asOf }),
  },
  dislocationSignal: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { macro: OBJECT, regime: ANY, lookbackDays: NUMBER },
    nested: {
      macro: 'What `validateMacro` returned. Its `retained` rows are read, and only two indicators of them — `index-level` for the move and `vix` for the spike. ⛔ A bare array of observations is not read: the rows this judges on are the dated, tiered ones that operation kept.',
      regime: 'What `regimeTag` returned, or its `regime` string. It is carried and never decisive: a `risk-off` regime can stand for months and this answers a question about weeks.',
    },
    describe: 'whether this is a dislocation week — the producer `themeRadarDue`’s `dislocation` argument never had',
    run: (input, asOf) => dislocationSignal({ ...input, asOf }),
  },
  nextReviewSequence: {
    group: 'schedule',
    surface: 'published',
    mode: 'strict', keys: { krSessions: ARRAY, usSessions: ARRAY, globalReview: OBJECT, buffers: OBJECT, config: OBJECT },
    nested: {
      'krSessions[]': { isOpen: BOOLEAN, date: STRING, closeLocal: STRING, timeZone: STRING },
      'usSessions[]': { isOpen: BOOLEAN, date: STRING, closeLocal: STRING, timeZone: STRING },
      globalReview: { date: STRING, time: STRING, timeZone: STRING },
      'config.schedule': { krCloseBufferMinutes: NUMBER, usCloseBufferMinutes: NUMBER },
      buffers: { kr: NUMBER, us: NUMBER },
    },
    shape: both(scheduleBuffers, sessionRows),
    describe: 'the three flows\' reviews in order, owned by one manager, each with the `intent` it must be armed with and the `{ cron, timeZone }` `rule` that goes beside `at` on the trigger. The rule draws the calendar forward and wakes nothing; `at` is still the whole schedule, and a review whose buffer crosses local midnight returns `rule: null`',
    run: (input, asOf) => nextReviewSequence({ ...input, asOf }),
  },
  /**
   * ⚠️ **`armed` is the host's answer to *which promise opened this run*, and
   * it is the primary channel** (#212 ⑤): the `armed` entries of
   * `history.recentDecisions`, flattened, exactly as the host wrote them. Only
   * the pair `fate: 'fired'` / `review: 'this-run'` is read (aumos#622), so an
   * empty array is never a statement about arming — it falls through to the
   * legacy prose adapter, by name.
   *
   * ⛔ **`watchId` is gone from this operation.** It is Aumos's opaque
   * `eventId` and no version of this package ever wrote a marker into one, so
   * scanning it for the flow was a promise nothing could keep; a call that
   * still passes it is answered `input_key_unread`, which says exactly that.
   * ⚠️ `resolveTrancheWake` still declares it — a different marker on a
   * different question — and is not this item's subject.
   */
  resolveWakeFlow: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { armed: ARRAY, summary: STRING, intent: STRING },
    describe: 'which flow opened this run, from the host\'s own record: hand it `armed` — the `armed` entries of `history.recentDecisions`, flattened — and the entry the host marked `fate: \'fired\'` / `review: \'this-run\'` answers with the flow, the `planId` and the instant the host recorded. `basis` says which channel answered. ⛔ An empty `armed` is not a failed arm: it means the host attributed nothing, and the flow falls back to the event `summary` through the legacy adapter. Every silence and every fallback is named, whether or not a flow comes back: `wake_attribution_unreadable` when no `armed` was handed over (yours to fix, by passing it), `wake_flow_unattributed` when it was handed over and named nothing of yours, and `wake_flow_recovered_from_prose` when the legacy adapter then answered. `null` for a wake this manager did not arm, and `null` with `wake_flow_ambiguous` when the host folded two flows into one wake',
    run: resolveWakeFlow,
  },
  resolveTrancheWake: {
    group: 'schedule',
    surface: 'published',
    mode: 'named', keys: { summary: STRING, intent: STRING, watchId: STRING },
    describe: 'whether a fired plan\'s event summary is a rung of an unfinished staged entry, and which one',
    run: resolveTrancheWake,
  },
  /**
   * ⚠️ `standingPlans` is a **report-only** key (#201): the invocation's answer
   * to what stood at `asOf` (aumos#690), read into `standingArms` as a floor
   * and into nothing else. It is published here because this operation is
   * `strict` — before it was declared, a run that followed §4 and handed the
   * field over had the whole calculation refused as an unknown key, while a run
   * that did not could report no floor at all. ⛔ Absent is not `[]`: absent is
   * unreadable, `[]` is a floor of zero.
   *
   * ⛔ **Two of the five keys are refused, and the contract says so before the
   * call (#136).** `armed` and `journalArmed` are declared for the same reason
   * `standingPlans` is — `strict` answers an undeclared key as an unknown one,
   * and these two have a named diagnostic that says where the value actually
   * belongs. What was missing is that the contract read as five accepted keys,
   * so the only place either was called refused was `schedule.mjs`, after the
   * call. The `nested` notes below are that sentence moved in front of it,
   * which is where `minimumExecutableWeight` already puts
   * `experimentalPositionFloor`.
   */
  reconcileArmedReviews: {
    group: 'schedule',
    surface: 'published',
    mode: 'strict', keys: { previous: OBJECT, sequence: ARRAY, standingPlans: ARRAY, armed: ANY, journalArmed: ANY },
    nested: {
      armed: '⛔ **A refused key**, declared so that passing it is named rather than dropped: it is `armed_state_misplaced` / blocked, and a run that writes the null `nextState` back erases the record. The standing arms arrive as `previous` — the whole value read from `run/armed-reviews` — and read at the top level they are invisible, so every standing review is re-armed.',
      journalArmed: '⛔ **A refused key** on the same terms: it is `armed_journal_not_a_receipt` / blocked. `decisions[].armed` is past tense — what became of what was armed — and is not an input to this operation at all. What stood at `asOf` is `invocation.standingPlans`, which is the separate `standingPlans` key beside this one.',
    },
    shape: armedRecord,
    describe: 'the reviews to arm — every one of them, because the published rule is to re-arm at every judgement and nothing this operation is handed could suppress one anyway — plus which of them this instance has already promised at this instant, and which flow it promised at a **different** instant, which is the one duplicate the host does not fold — reported with that older promise\'s `planId` where `standingPlans` names it, and with which silence it is where it does not. Hand it the invocation\'s `standingPlans` and it also reports `standingArms: { atLeast }`, the floor of what stood at `asOf` — report-only, and absent from it means unreadable while `[]` means a floor of zero',
    run: (input, asOf) => reconcileArmedReviews({ ...input, asOf }),
  },
  /**
   * ⚠️ `observations: "array"` was the whole published shape, and every row is
   * refused unless it carries **four** fields (#222). A run that omitted
   * `observedAt` was answered `research_observation_invalid` / blocked with no
   * way to read what was missing from the contract, and spent a round trip on
   * it. The `previous` sentence is the other half of the same issue: the value
   * this operation *writes* to `coverage/research-index` was not readable back
   * as `previous`, and the key was self-locked by its first malformed write.
   */
  researchState: {
    group: 'sizing',
    surface: 'published',
    canonical: researchMarket('observations[].market', 'previous.rows[].market'),
    mode: 'strict', keys: { previous: OBJECT, observations: ARRAY },
    nested: {
      'observations[]': { symbol: STRING, market: STRING, observedAt: STRING, evidenceIds: ARRAY, sector: STRING, extension: BOOLEAN },
      observationRow: 'Four fields are **required** and a row missing any one of them is `research_observation_invalid` / blocked rather than dropped: `symbol` (a compact identifier, ≤ 32 chars), `market` (`kr` or `us` — also published as inputContracts.vocabulary.researchMarkets, and the MIC is folded onto it at the one input boundary), `observedAt` (parseable and **not after** `asOf`) and a **non-empty** `evidenceIds` array of strings. `sector` (≤ 80 chars) and `extension` are optional and are the only other fields kept; anything else on the row is dropped, so a reason written onto a row is a reason silently lost.',
      previous: 'The whole value read from `coverage/research-index`, handed back unchanged. ⚠️ A stored value with **no `rows`** is not refused — it reads as an empty index, and the answer says so in `previousRead` (`absent` / `rows` / `no-rows`). Descriptive fields written beside `rows` by earlier runs are permitted, are reported by name in `previousExtraKeys`, and are **not** carried into `nextState` — a run that wants them keeps writing them itself. ⛔ Two things are still refused: a `schemaVersion` that is present and is not `1` (an unknown writer, whose rows this code may misread), and an `updatedAsOf` that parses and is **after** `asOf` (an index written by a later run, which the per-row date check cannot catch).',
    },
    describe: 'bounded research roster and Evidence references; no source payload cache. Rows require symbol, market, observedAt and non-empty evidenceIds. `previous` is the stored value as read — one with no `rows` is an empty index, not a refusal',
    run: (input, asOf) => researchState({ ...input, asOf }),
  },
  researchUniverse: {
    group: 'sizing',
    surface: 'published',
    canonical: researchMarket('market', 'extensions[].market'),
    mode: 'strict', keys: { market: STRING, extensions: ARRAY },
    describe: 'pinned KR/US curated roster plus dated, evidenced extensions; current eligibility must be checked',
    run: (input, asOf) => researchUniverse({ ...input, asOf }),
  },
  refutedMemoryRules: {
    group: 'preflight',
    surface: 'published',
    canonical: memoryRows('patterns', 'memory{}'),
    mode: 'strict', keys: { patterns: ANY, memory: OBJECT },
    nested: {
      patterns: 'The whole value read from `failures/repeated-patterns` — an array of rows, or the stored object holding them under `patterns`/`rows`/`entries`/`failures`. Read under a key that is not there, a carried rule reads as absent and stays uncorrected.',
      memory: 'An object keyed by stable memory key — { "run/theme-radar-last": <whatever was read> } — for the refuted rules filed somewhere other than `failures/repeated-patterns`. ⚠️ A false durable claim is not only ever a failure pattern (#160); the value may be prose and fields rather than a row list, and is matched either way.',
    },
    describe: 'which rows of `failures/repeated-patterns` this package has since refuted, and the retraction to write in their place',
    run: (input, asOf) => refutedMemoryRules({ ...input, asOf }),
  },
  /**
   * ⚠️ **The one call a run makes before composing any other** (#158), and
   * since #212 ③ it answers in two halves: `contracts` is the task-unit
   * surface, `internalContracts` the steps of those. ⛔ Both are projected from
   * `OPERATIONS` in this file — there is no second table to fall out of step
   * with the registry, which is what #158's «eleven of them» was.
   */
  inputContracts: {
    group: 'contracts',
    surface: 'published',
    mode: 'named', keys: {},
    describe: 'every operation\'s input keys and their types, which of them are guarded, the nested shapes, and the evaluator vocabulary',
    run: () => ({
      data: {
        keys: INPUT_KEYS,
        contracts: INPUT_CONTRACTS,
        nested: NESTED_CONTRACTS,
        guarded: GUARDED_OPERATIONS,
        operationCount: Object.keys(INPUT_CONTRACTS).length,
        internalContracts: INTERNAL_INPUT_CONTRACTS,
        vocabulary: INPUT_VOCABULARY,
      },
      diagnostics: [],
    }),
  },
}

/**
 * ⛔ The four projections cannot be partial, so a row is checked here rather
 * than by whichever projection happens to read a missing member first. Thrown
 * at module load: an operation that cannot be documented, registered,
 * contracted and validated is not an operation this package can publish.
 */
export function assertRegistered(operations, groupIds = GROUP_IDS) {
  const MODES = new Set(['strict', 'named', 'open'])
  for (const [name, row] of Object.entries(operations)) {
    if (typeof row.run !== 'function') throw new Error(`${name}: no run — nothing would answer the call`)
    if (!MODES.has(row.mode)) throw new Error(`${name}: mode must be strict, named or open`)
    if (!row.keys || typeof row.keys !== 'object') throw new Error(`${name}: no keys — an unpublished shape is a guessed shape`)
    if (typeof row.describe !== 'string' || row.describe.trim() === '') throw new Error(`${name}: no describe — the skill table would carry a blank cell`)
    if (!groupIds.has(row.group)) throw new Error(`${name}: group ${row.group} is not one of ${[...groupIds].join(', ')}`)
    if (row.surface !== 'published' && row.surface !== 'internal') throw new Error(`${name}: surface must be published or internal`)
    if (row.surface === 'internal') {
      if (!operations[row.subsumedBy]) throw new Error(`${name}: subsumedBy ${row.subsumedBy} is not a registered operation`)
      if (operations[row.subsumedBy].surface !== 'published') throw new Error(`${name}: subsumedBy ${row.subsumedBy} is itself internal, so nothing published returns this answer`)
      if (typeof row.subsumedAt !== 'string' || row.subsumedAt.trim() === '') throw new Error(`${name}: subsumedAt must name the call site, so the claim stays measurable`)
    } else if (row.subsumedBy !== undefined) {
      throw new Error(`${name}: a published operation names no subsumedBy`)
    }
    if (row.shape !== undefined && typeof row.shape !== 'function') throw new Error(`${name}: shape must be a function`)
    if (row.canonical !== undefined && typeof row.canonical !== 'function') throw new Error(`${name}: canonical must be a function`)
  }
  return operations
}

assertRegistered(OPERATIONS)

const entries = Object.entries(OPERATIONS)

/** The operations the model is shown, in definition order. */
export const PUBLISHED_OPERATIONS = entries.filter(([, row]) => row.surface === 'published').map(([name]) => name)

/**
 * The steps of other operations. Callable, contracted and validated exactly as
 * before — simply not offered as something to assemble with.
 */
export const INTERNAL_OPERATIONS = entries.filter(([, row]) => row.surface === 'internal').map(([name]) => name)

/** Each internal operation with the published operation that already returns its answer. */
export const SUBSUMED_BY = Object.fromEntries(
  entries
    .filter(([, row]) => row.surface === 'internal')
    .map(([name, row]) => [name, { operation: row.subsumedBy, at: row.subsumedAt }]),
)

const contractOf = (row) => ({ mode: row.mode, keys: row.keys })

/** The published contracts — mode and key types — projected from the definition. */
export const INPUT_CONTRACTS = Object.fromEntries(
  entries.filter(([, row]) => row.surface === 'published').map(([name, row]) => [name, contractOf(row)]),
)

/** The same, for the operations that are steps of those. */
export const INTERNAL_INPUT_CONTRACTS = Object.fromEntries(
  entries.filter(([, row]) => row.surface === 'internal').map(([name, row]) => [name, contractOf(row)]),
)

/** Every contract, published or not: what `validateInput` reads. */
export const ALL_INPUT_CONTRACTS = Object.fromEntries(entries.map(([name, row]) => [name, contractOf(row)]))

/**
 * The key list, kept as its own export because `inputContracts` published it
 * under this name and a run may still read it that way.
 */
export const INPUT_KEYS = Object.fromEntries(
  Object.entries(INPUT_CONTRACTS).map(([operation, contract]) => [operation, Object.keys(contract.keys)]),
)

/** The nested shapes a key list cannot show. */
export const NESTED_CONTRACTS = Object.fromEntries(
  entries.filter(([, row]) => row.nested && row.surface === 'published').map(([name, row]) => [name, row.nested]),
)

/** Which operations refuse an unknown key outright, published so a caller can tell. */
export const GUARDED_OPERATIONS = Object.entries(INPUT_CONTRACTS)
  .filter(([, contract]) => contract.mode === 'strict')
  .map(([operation]) => operation)
  .sort()
