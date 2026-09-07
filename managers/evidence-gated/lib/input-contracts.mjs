import { diagnostic, readCashByCurrency, MARKET_CURRENCIES, MANAGER_ID } from './diagnostics.mjs'
import { MACRO_INDICATORS } from './evidence.mjs'

export const PAPER_SETUP_COHORTS = {
  thesis_call: 'llm-research', thesis_watch: 'llm-research', thesis_rejected: 'llm-research',
  rs_leader_pullback: 'mechanical-baseline', rs_breakout: 'mechanical-baseline',
  mean_reversion: 'mechanical-baseline', trend_pullback: 'mechanical-baseline',
}

export const INPUT_VOCABULARY = {
  sentinelKinds: ['price_below', 'price_above', 'metric', 'time'],
  sentinelOperators: ['above', 'below'],
  /**
   * ⚠️ The keys `thesisSentinel` joins evidence to invalidations by, in the
   * order it tries them (#181). Published because the contract said only
   * `invalidations: "array"`, `evidence: "array"` — so the join was a shape a
   * caller had to guess, and the code answered a wrong guess with a borrowed
   * row rather than a refusal. A rule that joins by none of these is
   * `unevaluated`; it is never `met`.
   */
  sentinelJoinKeys: ['evidenceId', 'invalidationId', 'metric'],
  /**
   * ⚠️ **Two market vocabularies, and publishing one of them was a trap** (#146).
   * `markets` is the MIC list — the venues this manager contributes to, and the
   * spelling the host's own tools take. It is **not** what `researchUniverse`,
   * `fundamentalsPlan`, `radarCandidates` or `radarFeedDiagnosis` accept: those
   * take the sleeve, `'kr'` or `'us'`. With only the MIC list published, a
   * caller reading this object had exactly one market vocabulary to reach for
   * and it was the wrong one — the same shape as the guessed-shape failure #158
   * is named after, one field down. Both are published now, each said to be
   * what it is.
   */
  markets: ['XKRX', 'XNAS', 'XNYS'],
  researchMarkets: ['kr', 'us'],
  marketToResearchMarket: { XKRX: 'kr', XNAS: 'us', XNYS: 'us' },
  cacheStates: ['fresh', 'stale', 'never-fetched', 'refresh-failed'],
  cacheDocuments: { 'open-dart': ['filings', 'financials'], 'sec-edgar': ['companyfacts'] },
  /**
   * ⚠️ The two vocabularies #160 turns on. `scenarioCases` is the table this
   * methodology derives a fair value from — there is no multiple and no
   * discount rate published here because the methodology names none — and
   * `instrumentClasses` is the distinction that decides whether an open
   * valuation gap is unfetched or unfillable.
   */
  scenarioCases: ['bear', 'base', 'bull'],
  filingFacts: ['revenue', 'operatingIncome', 'operatingIncomeYoy', 'marginDeltaYoy'],
  instrumentClasses: ['single-name-filer', 'non-filer-instrument', 'unknown'],
  memoryRuleKeys: ['failures/repeated-patterns', 'run/theme-radar-last'],
  /**
   * ⚠️ Whose word an Evidence row is (#692). `aumos` is a row this host obtained
   * and signed for; `manager` is one filed through `observation_file`, which is
   * the **only** route a web reading has into the record and therefore the only
   * route `consensusRefs` — the 20% lane's one web-only requirement — can be
   * met by. `ungraded` is a cited row whose markers were not carried back, and
   * `uncited` is a figure with no evidence row behind it at all.
   */
  attestationGrades: ['aumos', 'manager', 'ungraded', 'uncited'],
  /**
   * ⚠️ **The closed vocabulary `validateMacro` keys every row by, published
   * because it was the one closed list this object did not carry** (#177).
   * The field is `indicator` — not `metric` — and the values are kebab-case.
   * A run that wrote `{ metric: 'policyRate' }` was answered `indicator: null`
   * / `indicator-unknown` and `macroLaneAvailable: false`, which reads as *the
   * macro lane is empty* rather than *this call was spelled in a vocabulary
   * this operation does not have*. Projected from `evidence.mjs`, never copied.
   */
  macroIndicators: [...MACRO_INDICATORS],
  /**
   * ⚠️ **The manager id `specialistBudget` accepts, which is a literal and not
   * an instance id** (#177). One run passed its own `inst_…` — the id every
   * other surface of the host addresses this manager by — and got
   * `manager_id_unknown` / `blocked` against a contract that said only
   * `managerId: "string"`. There has been exactly one since 2026-08-27; the
   * market roles are flows of it, which is what `dispatchableFlows` lists.
   */
  managerIds: [MANAGER_ID],
  managerObservationKind: 'observation',
  managerObservationSource: 'manager:web-research',
  observationExcerptLimit: 64_000,
  paperSetups: Object.keys(PAPER_SETUP_COHORTS),
}

/**
 * ── Every operation's input shape is published (issue #158) ────────────────
 *
 * `inputContracts` published **eleven** operations. `PROMPT.md` calls far more
 * of them by name, and the shape of everything else had to be guessed. Two
 * flows of the 2026-09-06 run hit the same wall independently: the orchestrator
 * spent **five** round trips on `nextReviewSequence` — `{sessions:[…]}`,
 * `{market,closeAt}`, `{krSession,usSession}`, a vendor calendar, `{sessions:{kr,us}}`
 * — every one answered `next_market_session_missing` at a `path` of `sessions`,
 * a key the operation does not have; and `kr-sleeve` gave up on
 * `nextMarketReview` and did the arithmetic by hand off a calendar Evidence.
 *
 * ⚠️ **This is the cause side of this package's dominant failure pattern.**
 * `failures/repeated-patterns` records seven cases of *"a wrong input is not
 * refused and comes back looking like a pass"*; #147 fixed instances of it.
 * An unpublished shape is what manufactures them: a caller who cannot read the
 * contract guesses, and a guess that lands in an unread key is answered with a
 * confident number computed from defaults.
 *
 * ⛔ **There was no principle behind the eleven.** They are the operations #147
 * happened to reach, nothing more. The principle is stated here instead: every
 * registered operation has an entry, every entry names its keys **and their
 * types**, and the entry says what happens to a key that is not in it.
 *
 * Three modes, because the operations genuinely differ:
 *
 * | mode | an unknown key is | why |
 * |---|---|---|
 * | `strict` | `input_shape_invalid` / `blocked` | the operation is a gate: a key it does not read is a question it was not asked, and the answer would be about something else |
 * | `named` | `input_key_unread` / `unevaluated` | the shape is published and the extra key is reported rather than refused — the answer stands, and the caller is told which part of the call was not read |
 * | `open` | nothing | the input **is** a record from somewhere else — a vendor payload, a thesis, a consensus observation — and its own fields are not this package's to enumerate |
 *
 * ⚠️ **Types are checked in every mode**, which is the other half of #158: a
 * declared key holding the wrong kind of value is `input_shape_invalid`, so a
 * shape mismatch is a refusal with a sentence rather than whatever exception
 * the arithmetic happened to raise three frames down. `coverage` handed an
 * array of objects used to answer `operation_failed` with a raw
 * `TypeError: object is not iterable`; `sleeveNav`, `opportunityUniverse`,
 * `promotionGate`, `lensEnvelope` and `validateAdjustment` all had the same
 * leak on their own keys.
 */
const ANY = 'any'
const ARRAY = 'array'
const ARRAY_OF_ARRAYS = 'array-of-arrays'
const OBJECT = 'object'
const NUMBER = 'number'
const STRING = 'string'
const BOOLEAN = 'boolean'

/**
 * The nested shapes a caller cannot see from the top-level key list — and the
 * two that cost a run each.
 *
 * ⛔ `config.schedule` is the one #91 is named after, arriving from the caller's
 * side. The close buffers live under `config.schedule`; passed at the top of
 * `config` they are not read and the package's own 30/45 run instead. The
 * install screen said the number was the investor's, and on the book that
 * measured this the investor's values *were* 30 and 45, so nothing about the
 * answer looked wrong.
 *
 * ⚠️ `researchActivity[]` is #157's: `succeeded` reads as a count beside
 * `attempts` and was a boolean.
 */
export const NESTED_CONTRACTS = {
  coverage: {
    'scannerUniverses[]': 'An array of symbol strings — one array per scanner, all of them over the SAME market. Two markets are two calls: universes that share no symbol are not the same denominator, and comparing them raises universe_drift on a difference that was never drift.',
  },
  harnessAudit: {
    'researchActivity[]': { source: STRING, granted: BOOLEAN, attempts: NUMBER, succeeded: 'boolean-or-count' },
    universe: { scannerUniverses: ARRAY_OF_ARRAYS, extensions: ARRAY, screenedUniverseCount: NUMBER },
    'positions[].origin': { decisionId: STRING, asOf: STRING },
    totalDecisions: 'history.totalDecisions — how many judgements this book has sealed at or before asOf. Greater than the number of decisions passed means the older part of the journal was not supplied. ⛔ Absent means the host did not say; it is never zero and never a statement that the window is whole, and a holding whose explanation may sit outside an unmeasured window is not an unexplained holding.',
  },
  refutedMemoryRules: {
    patterns: 'The whole value read from `failures/repeated-patterns` — an array of rows, or the stored object holding them under `patterns`/`rows`/`entries`/`failures`. Read under a key that is not there, a carried rule reads as absent and stays uncorrected.',
    memory: 'An object keyed by stable memory key — { "run/theme-radar-last": <whatever was read> } — for the refuted rules filed somewhere other than `failures/repeated-patterns`. ⚠️ A false durable claim is not only ever a failure pattern (#160); the value may be prose and fields rather than a row list, and is matched either way.',
  },
  thesisValuation: {
    'scenarios.<bear|base|bull>': { probability: NUMBER, target: NUMBER, return: NUMBER, drivers: ARRAY },
    'scenarios.<case>.drivers[]': 'Either a filing-fact name — revenue, operatingIncome, operatingIncomeYoy, marginDeltaYoy — or { metric, evidenceId }. ⛔ Any other name is reported unmatched rather than read as something else; this package has no valuation method of its own to fall back on.',
    'filings[]': 'The `filings` array `radarCandidates` builds for this symbol, unchanged: { periodEnd, availableAt, revenue, operatingIncome, operatingIncomeYoy, marginDeltaYoy, currency, sourceType }.',
  },
  thesisGapSources: {
    gaps: 'The `gaps` array `validateThesis` returned, verbatim.',
    mapping: 'The `mapCorporationCodes` answer — { registrySize, mapped[], unmapped[] } — which is what decides whether this symbol has a filer at all. ⛔ Without it the instrument stays unclassified rather than assumed.',
    feed: 'The `radarCandidates` answer, for `fedCount`: whether the statements were actually read.',
  },
  thesisSentinel: {
    'invalidations[]': `{ id, kind, level | operator+level | at, evidenceId }. kind is one of ${['price_below', 'price_above', 'metric', 'time'].join(', ')}; a metric rule also carries metric and operator. ⚠️ id is kept verbatim and is what an evidence row addresses; without one the answer names the rule by position as rule-<index> and says so.`,
    'evidence[]': 'The observation a rule is judged against: { id, value | availableAt, metric, invalidationId }. ⚠️ A row is joined to a rule by one of three keys and never by position — rule.evidenceId → this row\'s id, this row\'s invalidationId → rule.id, or, for a metric rule, this row\'s metric → rule.metric. A rule that joins to nothing, or to more than one row under the same key, answers unevaluated; it is never met, so an invalidation nobody supplied evidence for cannot become a threatened verdict.',
    'priorVerdicts[]': { asOf: STRING, verdict: STRING },
    /**
     * ⚠️ The threshold field is `level` and the observation field is `value`
     * (#177). Both near-misses are refused by name rather than read as absent.
     */
    fieldNames: 'The threshold a rule compares against is `level` — never `threshold` — and a time rule\'s instant is `at`. On the evidence row the reading is `value` and its instant is `availableAt` — never `observed` / `observedAt`. ⛔ Written under the near-miss spelling the rule joined, found its evidence, and came back `unevaluated` with "Rule and evidence are not comparable": a real observation past a real level, reported as a rule nobody could judge. Those four spellings are input_shape_invalid, because reading them as absent is how a breach becomes a shrug.',
  },
  /**
   * ⚠️ `observations: "array"` was the whole published shape and the row is
   * keyed by a closed vocabulary under a field named `indicator` (#177).
   */
  validateMacro: {
    'observations[]': { indicator: STRING, value: NUMBER, observedAt: STRING, sourceUrl: STRING, sourceTier: STRING },
    indicator: `The field is \`indicator\` and its value is one of ${MACRO_INDICATORS.join(', ')} — also published as inputContracts.vocabulary.macroIndicators. ⛔ \`metric\` is the consensus-evidence vocabulary and is refused here by name: written under it every row is unusable, officialCount is 0 and macroLaneAvailable comes back false, which reads as a macro lane with nothing in it rather than a call this operation could not read.`,
    sourceTier: 'official — the publisher of record — or anything else, which is retained with its provenance gap named rather than dropped. Absent reads as aggregator.',
  },
  /**
   * ⚠️ `currency` and the currency `marketValue` is counted in are two facts,
   * and reading one key as both is what put dollars in the won bucket (#177).
   */
  sleeveNav: {
    'cash[]': { currency: STRING, amount: NUMBER },
    'positions[]': { symbol: STRING, currency: STRING, marketValue: NUMBER, valueCurrency: STRING },
    valueCurrency: 'The unit `marketValue` is counted in, when it is not the currency the asset quotes in. `portfolio_read` marks every position in the book\'s base currency, so a KRW listing on a USD book arrives as a **dollar** figure — pass `valueCurrency: "USD"` and it is converted into the sleeve at `fx.USDKRW`. ⛔ Absent it reads as the position\'s own `currency`, which is right on a single-currency book and was silently wrong by the rate itself (1,338.848×) on the book that measured this: krwSleeveNav 11,119,948.16 against 17,430,791.23, status ok, no diagnostic. `marketValueBasis` in the answer says which reading was taken.',
    positionCurrency: 'Always the currency the asset **quotes** in — it is what puts the row in the KR or the US sleeve — and never the currency the book keeps score in. A row key ending in `Currency` that is neither of these two is input_shape_invalid rather than ignored, because a unit read as nothing is added at face value.',
  },
  laneCoverage: {
    'activity.<source>': { attempts: NUMBER, succeeded: 'boolean-or-count' },
    'sources.<source>': { status: STRING },
  },
  nextReviewSequence: {
    'krSessions[]': { isOpen: BOOLEAN, date: STRING, closeLocal: STRING, timeZone: STRING },
    'usSessions[]': { isOpen: BOOLEAN, date: STRING, closeLocal: STRING, timeZone: STRING },
    globalReview: { date: STRING, time: STRING, timeZone: STRING },
    'config.schedule': { krCloseBufferMinutes: NUMBER, usCloseBufferMinutes: NUMBER },
    buffers: { kr: NUMBER, us: NUMBER },
  },
  nextMarketReview: {
    'sessions[]': { isOpen: BOOLEAN, date: STRING, closeLocal: STRING, timeZone: STRING },
  },
  /**
   * ⚠️ `bars: "array"` was the whole published shape, and the vendor payload is
   * an array (#180). A run that passed the Toss candle rows through unchanged —
   * `closePrice` and friends, every value a **string** — satisfied the contract
   * as published and got a hard `stop` off moving averages that were all `null`.
   * The row shape is the part that had to be said.
   */
  trendState: {
    'bars[]': { date: STRING, open: NUMBER, high: NUMBER, low: NUMBER, close: NUMBER, volume: NUMBER },
    barShape: 'One row per session, oldest or newest first — this sorts. The instant may be given as `date`, `timestamp` or `time`; the four prices are named `open`/`high`/`low`/`close` and must be finite **numbers**, not strings. ⛔ A vendor payload is not this shape: Toss candles carry `openPrice`/`highPrice`/`lowPrice`/`closePrice` as strings and are refused row by row as `bar_value_invalid`, exactly as `indicators` refuses them. One unreadable row and the answer is `state: "insufficient_data"` — this gate stops capital deployment and does not average over the rows it happened to parse.',
  },
  experimentalCeiling: {
    experimentalPositionFloor: 'An object keyed by venue currency — { KRW: 300000, USD: 200 } — never a bare amount; the currency of the position being sized selects the row.',
    fx: { USDKRW: NUMBER },
  },
  /**
   * ⚠️ The budget was published as three weights and answered `withinBriefBudget`
   * over a book whose dollars did not exist (#174).
   */
  specialistBudget: {
    sleeveCashByCurrency: 'This book\'s cash stated per currency — { KRW: 11115231, USD: 294.02 }, or the { currency, amount } rows `portfolio.cashByCurrency` carries. ⛔ Never the aggregate `portfolio.cash`: on the book that measured this it read USD 8,596.10 and 96.6% of it was won. A bare amount is input_shape_invalid, and a currency with no row is read as zero of it rather than as unknown.',
    fx: { USDKRW: NUMBER },
    sleeveCurrency: `Not an input. The sleeve is paid in the currency its market quotes — ${Object.entries(MARKET_CURRENCIES).map(([market, currency]) => `${market} → ${currency}`).join(', ')} — derived from \`market\` and never declared, because a run that could name it could name the wrong one. ⛔ It is neither mandate.constraints.baseCurrency nor portfolio.baseCurrency: those two may disagree and both be right, and neither says what a US buy settles in.`,
    managerId: `The literal id this package publishes — \`${MANAGER_ID}\`, also in inputContracts.vocabulary.managerIds — and **not** the instance id the host addresses this manager by. An \`inst_…\` is manager_id_unknown / blocked, which is the whole answer refused; \`managerId: "string"\` was all the contract said, and \`skills/deterministic-metrics\` named only the retired pre-2026-08-27 package ids as rejected. ⚠️ It defaults to the published id, so the safe call omits it. The market roles are **flows** of this one manager — \`flow\` carries them — not ids of their own.`,
    budget: 'The budget itself stays a plain weight and carries no currency: one FX rate scales a ratio\'s numerator and denominator alike, so a ratio has none. What has a currency is the cash that pays for it — which is why the shortfall is reported in the sleeve currency while `sleeveBudgetWeight` is not.',
  },
  exitDiscipline: {
    registration: { stopPct: NUMBER, stopPrice: NUMBER, reviewBy: STRING },
  },
  /**
   * ⚠️ `caps` was the whole published nesting, and the row shape is what the
   * caps are applied *to* (#173). A run that wrote `sectors` was told nothing.
   */
  concentration: {
    caps: { position: NUMBER, sector: NUMBER, theme: NUMBER, factor: NUMBER, portfolioHeat: NUMBER },
    'positions[]': { symbol: STRING, weight: NUMBER, core: BOOLEAN, parkedLiquidity: BOOLEAN, stopLossPct: NUMBER, sector: STRING, themes: ARRAY, factors: ARRAY },
    'proposed[]': 'The same row shape as positions[]. ⚠️ A row for a symbol the book already holds is the target state for that symbol and replaces the holding; it does not stack on it.',
    rowShape: 'The three label axes are not spelled alike and the difference is read: sector is a single string — a listing has one — while themes and factors are arrays, because a name sits on several shared loss paths. ⛔ sectors (plural), theme (singular) and factor (singular) are refused as input_shape_invalid rather than ignored; before #173 the plural sectors was read by nothing, the sector axis accumulated empty, and its cap applied to no weight while the answer stayed status: ok. ⚠️ A row that carries no label on an axis whose cap is declared is reported as concentration_labels_unstated / unevaluated: unlabelled is not under the cap.',
  },
  crossCheckPrice: {
    config: { priceConflictTolerance: NUMBER },
  },
  fundamentalsPlan: {
    'symbols[]': 'A roster symbol string, or a researchUniverse row — { symbol, sector }. The whole array from researchUniverse.data.symbols is what this expects.',
    'corporationCodes[]': { symbol: STRING, corporationCode: STRING, vendorId: STRING },
    'cache.<cacheKey>': `The source_cache_read answer for that call: { state, documents | cached, observedAt }. The field is state, not status, and it is one of ${['fresh', 'stale', 'never-fetched', 'refresh-failed'].join(', ')}. An absent entry is reported as unreported rather than assumed empty.`,
  },
  mapCorporationCodes: {
    registryRows: 'parseDartCorpCodes output — the array, or the { rows } wrapper. KR only.',
    filingRows: 'normalizeDartFilings output; the list.json route carries corp_code and stock_code on the same row and is the fallback when the ZIP cannot be decompressed.',
    tickerRows: 'The company_tickers.json body — the object keyed by index, or its values as an array. US only; it is what supplies the CIK the cache route wants.',
  },
  radarCandidates: {
    'financials.<symbol>': 'normalizeDartFinancials output for that symbol. KR.',
    'facts.<symbol>': 'normalizeSecFacts output for that symbol. US.',
    'documents.<symbol>': 'The CachedDocument array from source_cache_read — { publishedAt, version, normalized: { period, currency, metrics } }. When present it is preferred over the raw vendor rows, because it is what the host already dated.',
    'prices.<symbol>': { status: STRING, close: NUMBER, ma50: NUMBER, ma200: NUMBER, offHigh200: NUMBER, rs20VsBenchmarkPct: NUMBER },
  },
  radarFeedDiagnosis: {
    plan: 'The whole fundamentalsPlan data object; its requests carry the cache states this reads.',
    mapping: 'The whole mapCorporationCodes data object. ⚠️ null means the join was never attempted, which is a different finding from a join that returned nothing.',
    'responses[]': { step: STRING, symbol: STRING, feedFailure: STRING, classification: STRING, usable: BOOLEAN },
    candidates: 'The whole radarCandidates data object — the `candidates` rows included, not only `fedCount`. ⚠️ They are the denominator: without them coverage falls back to the roster, and one fed name out of eighty-three reported as `fed` is what #178 measured. ⛔ A reading that can count neither answers `candidateCount: null` rather than assuming it was whole.',
    lanes: 'upsideRadar.data.lanes, so the reading can say fed-and-empty rather than starved.',
  },
  /**
   * ⚠️ `observations: "array"` and `claims: "array"` was the whole published
   * shape, and both rows are receipts whose fields this gate reads one by one
   * (#176). The measured cost: a receipt filed as the manager's word, cited by
   * its id, came back `strongestClaimAttestation: "ungraded"` with `status:
   * "ok"` — and that grade is the input to the main lane's disclosure.
   */
  observationLedger: {
    'observations[]': { evidenceId: STRING, evidenceKind: STRING, evidenceSource: STRING, url: STRING, title: STRING, publishedAt: STRING, contentHash: STRING, excerptChars: NUMBER },
    'claims[]': { claim: STRING, value: ANY, usedFor: STRING, evidenceId: STRING },
    receipt: 'One row per `observation_file` call, **as that tool answered it** — the id, the markers (`evidenceKind: "observation"`, `evidenceSource: "manager:web-research"`), `url`, `title`, `publishedAt`, `contentHash` and `excerptChars`. ⚠️ The tool returns the hash and this package cannot recompute it, so the value has to be **kept from the call and passed back here**; without it the row is `observation_hash_missing` — a receipt nothing can be compared against — and that finding is about the hash alone, never about the grade.',
    grade: 'Not something a claim states. A claim carries `evidenceId`, and the grade travels from the observation filed under that id — `claims[].gradeFrom` says `observation` when it did. ⛔ A claim naming an id no row in `observations` carries is `claim_grade_unstated` rather than a quiet `ungraded`: «this run filed no receipt under that id» and «the receipt has no markers» are different facts, and the main lane\'s `main_lane_rests_on_manager_attestation` disclosure is built on the answer. Carrying `evidenceKind`/`evidenceSource` onto the claim answers it too, and a claim that contradicts the receipt it cites is reported and read at the weaker grade.',
  },
}

/** `key: type` for every registered operation, with the mode that governs the rest. */
export const INPUT_CONTRACTS = {
  // ── Scanners and lenses ────────────────────────────────────────────────
  indicators: { mode: 'named', keys: { bars: ARRAY } },
  scan: { mode: 'named', keys: { symbol: STRING, market: STRING, bars: ARRAY, held: BOOLEAN, pending: BOOLEAN } },
  relativeStrength: { mode: 'named', keys: { assetBars: ARRAY, benchmarkBars: ARRAY, periods: ARRAY } },
  opportunityMetrics: { mode: 'named', keys: { symbol: STRING, market: STRING, sector: STRING, bars: ARRAY, held: BOOLEAN, pending: BOOLEAN } },
  opportunityUniverse: { mode: 'named', keys: { rows: ARRAY } },
  trendState: { mode: 'named', keys: { symbol: STRING, bars: ARRAY } },
  blendedSectorStrength: { mode: 'named', keys: { assetBars: ARRAY, benchmarkBars: ARRAY, weights: ARRAY } },
  sectorStrength: { mode: 'named', keys: { benchmarkBars: ARRAY, sectors: ARRAY, previousRanks: OBJECT, lane: STRING, weights: ARRAY } },
  regimeTag: { mode: 'named', keys: { asserted: STRING, mechanical: ANY, briefRevisionId: STRING, assertedAt: STRING, recorded: ANY } },
  entryQualityGate: { mode: 'strict', keys: { bars: ARRAY, lenses: ARRAY, noNewLow: OBJECT } },
  upsideRadar: { mode: 'named', keys: { candidates: ARRAY, feed: OBJECT } },
  variantViewCheck: { mode: 'named', keys: { thesis: OBJECT, challengeVerdict: STRING, evidenceSamples: ARRAY } },

  // ── Sizing, concentration and budgets ──────────────────────────────────
  sleeveNav: { mode: 'named', keys: { cash: ARRAY, positions: ARRAY, fx: OBJECT } },
  targetWeight: {
    mode: 'named',
    keys: {
      expectedActiveReturn: NUMBER, downsideReturn: NUMBER, conviction: NUMBER, mandatePositionCap: NUMBER,
      sectorHeadroom: NUMBER, themeHeadroom: NUMBER, maturityStatus: STRING, researchGate: STRING, challengeVerdict: STRING,
      lane: STRING, thesis: OBJECT, evidenceSamples: ARRAY, promotion: OBJECT, uncertainty: ARRAY, effectiveConstraints: ARRAY, risks: ARRAY,
      experimentalPositionCeiling: NUMBER, experimentalPositionCeilingMax: NUMBER, experimentalPositionFloor: OBJECT,
      positionCurrency: STRING, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
  },
  experimentalCeiling: {
    mode: 'strict',
    keys: {
      experimentalPositionCeiling: NUMBER, experimentalPositionCeilingMax: NUMBER, experimentalPositionFloor: OBJECT,
      positionCurrency: STRING, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
  },
  effectivePositionCap: {
    mode: 'named',
    keys: {
      mandatePositionCap: NUMBER, maturityStatus: STRING, lane: STRING, thesis: OBJECT, challengeVerdict: STRING,
      evidenceSamples: ARRAY, promotion: OBJECT, uncertainty: ARRAY, effectiveConstraints: ARRAY,
      /** `risks` is what the approval screen renders, so it is where the attestation disclosure lands (#692). */
      risks: ARRAY,
      experimentalPositionCeiling: NUMBER, experimentalPositionCeilingMax: NUMBER, experimentalPositionFloor: OBJECT,
      positionCurrency: STRING, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
  },
  effectiveCashFloor: { mode: 'named', keys: { mandateCashFloor: NUMBER, methodologyCashFloors: ARRAY, effectiveConstraints: ARRAY, projectedCashWeight: NUMBER, cashWeight: NUMBER } },
  singleNameBudget: { mode: 'named', keys: { mandateCashFloor: NUMBER, mandatePositionCap: NUMBER, positions: ARRAY, proposed: ARRAY, controlArmWeight: NUMBER } },
  legacySizeSuggestion: { mode: 'named', keys: { riskRewardRatio: NUMBER, capWeight: NUMBER, minimumCalibrationSamples: NUMBER, calibrationSamples: NUMBER, winProbability: NUMBER, kellyFraction: NUMBER, stopDistance: NUMBER, fullCapAtRiskReward: NUMBER, expectedValue: NUMBER } },
  concentration: { mode: 'strict', keys: { positions: ARRAY, proposed: ARRAY, caps: OBJECT, config: OBJECT } },
  mandateExecution: { mode: 'strict', keys: { mandateObjective: STRING, positions: ARRAY, proposed: ARRAY, cashWeight: NUMBER, reportedDiagnostics: ARRAY } },
  newSinglePacing: { mode: 'named', keys: { proposedNewSingles: ARRAY, priorNewSingles: ARRAY, sizingPolicyUpdatedAt: STRING, closedOutcomeCount: NUMBER, reviewReadyClosedOutcomes: NUMBER } },
  entryTranchePlan: { mode: 'named', keys: { symbol: STRING, lens: STRING, maturity: STRING, price: NUMBER, plannedTotalWeight: NUMBER, tranches: ARRAY, execution: OBJECT } },
  /**
   * ⚠️ The four keys after `emergencyExit` are the procurement side (#174). A
   * budget is a ratio and has no currency; paying for it is an amount and has
   * one, and without these the answer is a claim about a budget nobody has
   * shown can be bought.
   */
  specialistBudget: {
    mode: 'strict',
    keys: {
      managerId: STRING, flow: STRING, market: STRING,
      currentSleeveWeight: NUMBER, sleeveBudgetWeight: NUMBER, requestedTargetWeight: NUMBER, emergencyExit: BOOLEAN,
      sleeveCashByCurrency: ANY, portfolioNav: NUMBER, portfolioNavCurrency: STRING, fx: OBJECT,
    },
  },
  globalAllocation: { mode: 'strict', keys: { targets: ARRAY, availableWeight: NUMBER, currentWeights: OBJECT } },

  // ── Coverage, discovery and watches ────────────────────────────────────
  coverage: { mode: 'strict', keys: { scannerUniverses: ARRAY_OF_ARRAYS, extensions: ARRAY, holdings: ARRAY, dispositions: ARRAY } },
  discoveryCapacity: { mode: 'strict', keys: { radar: OBJECT, coverage: OBJECT, uncertainty: ARRAY } },
  validateWatch: { mode: 'named', keys: { watch: OBJECT, current: ANY, config: OBJECT } },
  evaluateWatch: { mode: 'named', keys: { watch: OBJECT, observation: OBJECT, blocks: ARRAY, alertedSessionKeys: ARRAY, config: OBJECT } },
  watchAlertState: { mode: 'named', keys: { previous: OBJECT, sessionDate: STRING, alerting: ARRAY } },

  // ── Evidence admission ─────────────────────────────────────────────────
  validateConsensus: { mode: 'open', keys: { metric: STRING, value: ANY, unit: STRING, period: STRING, sourceUrl: STRING, publishedAt: STRING, capturedAt: STRING, type: STRING, currency: STRING } },
  researchGate: { mode: 'open', keys: { lens: STRING, priceDeclineReason: ANY, opportunityCase: ANY, trapRisks: ANY, variantView: ANY, benchmarkAlternative: ANY, scenarios: ANY, minimumExpectedActiveReturn: NUMBER, challengeVerdict: STRING, sourceFresh: BOOLEAN, sourceConflict: BOOLEAN } },
  crossCheckPrice: { mode: 'named', keys: { tossPrice: NUMBER, webPrice: NUMBER, tolerance: NUMBER, config: OBJECT } },
  validateMacro: { mode: 'named', keys: { observations: ARRAY, webAvailable: BOOLEAN } },
  /**
   * `strict`, and for the reason the mode exists: this is a gate on whether the
   * run cited what it read, so a key it does not read is a question it was not
   * asked — and the answer would be about something else. (#692)
   */
  observationLedger: { mode: 'strict', keys: { observations: ARRAY, citedEvidenceIds: ARRAY, claims: ARRAY } },

  // ── Calibration, promotion and attribution ─────────────────────────────
  calibration: { mode: 'named', keys: { samples: ARRAY, minimumSamples: NUMBER, minimumClusters: NUMBER } },
  closedOutcomeSamples: { mode: 'named', keys: { outcomes: ARRAY, lens: STRING } },
  clusters: { mode: 'named', keys: { dates: ARRAY, gapDays: NUMBER } },
  brier: { mode: 'named', keys: { probabilities: ARRAY, outcomeIndex: NUMBER } },
  bhFdr: { mode: 'named', keys: { rows: ARRAY, alpha: NUMBER } },
  quintileSpread: { mode: 'named', keys: { values: ARRAY } },
  bootstrapClusterCi: { mode: 'named', keys: { clusterValues: OBJECT, options: OBJECT } },
  promotionGate: { mode: 'named', keys: { rows: ARRAY, horizon: STRING, seed: NUMBER, resamples: NUMBER, thresholds: OBJECT } },
  attribution: { mode: 'named', keys: { totalReturn: NUMBER, coreWeight: NUMBER, coreReturn: NUMBER, noncoreReturn: NUMBER, noncoreBenchmarkReturn: NUMBER } },
  twr: { mode: 'named', keys: { dailyValues: ARRAY, flows: OBJECT } },
  mwr: { mode: 'named', keys: { datedCashflows: ARRAY, endingValue: NUMBER, endingDate: STRING, options: OBJECT } },
  portfolioMetrics: { mode: 'named', keys: { equity: ARRAY, trades: ARRAY, exposures: ARRAY } },
  netReturnBreakdown: { mode: 'named', keys: { entry: OBJECT, exit: OBJECT, currency: STRING } },
  outcomeClassification: { mode: 'open', keys: { thesisCompliance: ANY, riskCompliance: ANY, executionQuality: ANY, executionAttributableToDecision: BOOLEAN, judgedFailures: ARRAY, grossReturnPct: NUMBER, activeReturnPct: NUMBER, benchmarkReturnPct: NUMBER } },
  forwardOutcome: { mode: 'named', keys: { bars: ARRAY, benchmarkBars: ARRAY, sectorBars: ARRAY, signalAt: STRING, horizons: ARRAY } },
  earningsActual: { mode: 'named', keys: { preview: OBJECT, actual: OBJECT, filing: OBJECT } },

  // ── Mechanical backtests ───────────────────────────────────────────────
  trendGateForward: { mode: 'named', keys: { series: ARRAY, horizons: ARRAY, warmup: NUMBER } },
  dcaMultiplierBacktest: { mode: 'named', keys: { series: ARRAY, annualCashCarryPct: NUMBER, warmup: NUMBER } },
  oversoldStrata: { mode: 'named', keys: { assets: ARRAY, benchmarks: OBJECT, horizons: ARRAY } },

  // ── The learning loop ──────────────────────────────────────────────────
  signalPaper: { mode: 'strict', keys: { rows: ARRAY, state: OBJECT, admissions: ARRAY, horizons: ARRAY, openWindows: ANY, closed: ANY, schemaVersion: ANY, updatedAsOf: ANY, maturedThisRun: ANY } },
  paperAdmission: { mode: 'strict', keys: { setup: STRING, challengeVerdict: STRING, thesis: OBJECT, priceHistoryLatestDate: STRING } },
  shadowTrack: { mode: 'named', keys: { shadowReturnPct: NUMBER, realReturnPct: NUMBER, windowDays: NUMBER, thresholds: OBJECT } },
  baselineTrack: { mode: 'named', keys: { portfolioReturnPct: NUMBER, baselines: ARRAY } },
  controlArmLane: { mode: 'named', keys: { positions: ARRAY, proposed: ARRAY, experimentTotalRemainingWeight: NUMBER } },
  verdictReport: { mode: 'named', keys: { paper: OBJECT, cohort: STRING, shadow: OBJECT, baseline: OBJECT, closedOutcomeCount: NUMBER, thresholds: OBJECT } },

  // ── Declared thresholds and envelopes ──────────────────────────────────
  lensEnvelope: { mode: 'named', keys: { lens: STRING, triggers: ARRAY } },
  clusterBlock: { mode: 'named', keys: { clusters: ARRAY, intent: STRING } },
  timeStopPolicy: { mode: 'named', keys: { positions: ARRAY } },
  exitDiscipline: {
    mode: 'strict',
    keys: {
      symbol: STRING, lane: STRING, entryDate: STRING, tradingDaysHeld: NUMBER, entryPrice: NUMBER, price: NUMBER,
      positionWeight: NUMBER, mandateMaxDrawdown: NUMBER, heldPortfolioHeat: NUMBER, registration: OBJECT,
      entryProposed: BOOLEAN, proposedExits: ARRAY,
    },
  },
  ruleVersions: { mode: 'named', keys: { registry: OBJECT, rows: ARRAY, axis: STRING } },
  policyLint: { mode: 'named', keys: { current: OBJECT, proposed: OBJECT, provenance: OBJECT } },

  // ── Pre-flight ─────────────────────────────────────────────────────────
  harnessAudit: { mode: 'strict', keys: { positions: ARRAY, watches: ARRAY, theses: ARRAY, decisions: ARRAY, universe: OBJECT, researchActivity: ARRAY, gateStaleDays: NUMBER, managedSince: STRING, totalDecisions: NUMBER, config: OBJECT } },
  lessonAudit: { mode: 'named', keys: { proposals: ARRAY, staleDays: NUMBER } },

  // ── Methodology ────────────────────────────────────────────────────────
  validateThesis: { mode: 'open', keys: { evidenceStatus: STRING, variantView: ANY, consensusRefs: ARRAY, catalysts: ARRAY, invalidationTriggers: ARRAY, expectedUpsidePct: NUMBER, fairValueRange: ANY } },
  thesisSentinel: { mode: 'strict', keys: { invalidations: ARRAY, evidence: ARRAY, priorVerdicts: ARRAY } },
  exitCheck: { mode: 'strict', keys: { symbol: STRING, price: NUMBER, rules: OBJECT, thesis: OBJECT, sentinel: ANY } },
  validateMemory: { mode: 'named', keys: { value: ANY, expectedSchemaVersion: NUMBER } },
  visibleMemoryRevision: { mode: 'named', keys: { revisions: ARRAY, instanceId: STRING, model: STRING, key: STRING } },
  migrationMap: { mode: 'named', keys: { records: ARRAY, cutoverAt: STRING, schemaVersion: NUMBER } },

  // ── Point-in-time source parsing ───────────────────────────────────────
  filterPointInTime: { mode: 'named', keys: { rows: ARRAY, timestampField: STRING, freshnessHours: NUMBER } },
  normalizeSecFacts: { mode: 'open', keys: {} },
  normalizeDartFilings: { mode: 'open', keys: {} },
  parseDartCorpCodes: { mode: 'named', keys: { xml: STRING } },
  normalizeDartFinancials: { mode: 'open', keys: {} },
  normalizeSecSubmissions: { mode: 'open', keys: {} },
  laneCoverage: { mode: 'strict', keys: { lane: STRING, sources: OBJECT, intent: STRING, activity: OBJECT } },
  validateAdjustment: { mode: 'named', keys: { series: ARRAY, corporateActions: ARRAY } },

  // ── The fundamental feeding path (#146) ────────────────────────────────
  fundamentalsPlan: { mode: 'strict', keys: { market: STRING, symbols: ARRAY, corporationCodes: ARRAY, cache: OBJECT, businessYear: ANY, reportCode: ANY, freshForSeconds: NUMBER } },
  mapCorporationCodes: { mode: 'strict', keys: { market: STRING, symbols: ARRAY, registryRows: ANY, filingRows: ANY, tickerRows: ANY } },
  dartVendorStatus: { mode: 'named', keys: { payload: OBJECT, path: STRING } },
  radarCandidates: { mode: 'strict', keys: { market: STRING, symbols: ARRAY, financials: OBJECT, facts: OBJECT, documents: OBJECT, prices: OBJECT, events: OBJECT, catalysts: OBJECT, valuations: OBJECT } },
  radarFeedDiagnosis: { mode: 'strict', keys: { market: STRING, symbols: ARRAY, plan: OBJECT, mapping: OBJECT, responses: ARRAY, candidates: OBJECT, lanes: OBJECT } },

  // ── The valuation end of the same wiring (#160) ────────────────────────
  thesisValuation: { mode: 'strict', keys: { asset: STRING, market: STRING, price: NUMBER, currency: STRING, scenarios: OBJECT, filings: ARRAY } },
  thesisGapSources: { mode: 'strict', keys: { asset: STRING, market: STRING, gaps: ARRAY, mapping: OBJECT, instrumentType: STRING, feed: OBJECT, filings: ARRAY } },

  // ── Schedule and wake ──────────────────────────────────────────────────
  zonedDateTimeToUtc: { mode: 'named', keys: { date: STRING, time: STRING, timeZone: STRING } },
  nextMarketReview: { mode: 'strict', keys: { sessions: ARRAY, bufferMinutes: NUMBER } },
  earningsCheckpoint: { mode: 'named', keys: { observation: OBJECT, marketSession: OBJECT, config: OBJECT } },
  boundedRetry: { mode: 'named', keys: { checkpointAt: STRING, attempt: NUMBER, announcedReplacementAt: STRING, config: OBJECT } },
  classifyScheduledWake: { mode: 'named', keys: { watchId: STRING, summary: STRING, scheduledAt: STRING, asOf: STRING, consumedWatchIds: ARRAY, sourceStatus: STRING, releaseFound: BOOLEAN } },
  scheduleDrift: { mode: 'named', keys: { previous: OBJECT, current: OBJECT } },
  deduplicateObservations: { mode: 'named', keys: { rows: ARRAY } },
  themeRadarDue: { mode: 'named', keys: { lastRunAt: STRING, intervalDays: NUMBER, dislocation: BOOLEAN } },
  nextReviewSequence: { mode: 'strict', keys: { krSessions: ARRAY, usSessions: ARRAY, globalReview: OBJECT, buffers: OBJECT, config: OBJECT } },
  resolveWakeFlow: { mode: 'named', keys: { summary: STRING, intent: STRING, watchId: STRING } },
  resolveTrancheWake: { mode: 'named', keys: { summary: STRING, intent: STRING, watchId: STRING } },
  reconcileArmedReviews: { mode: 'strict', keys: { previous: OBJECT, sequence: ARRAY, armed: ANY, journalArmed: ANY } },

  // ── State the run carries ──────────────────────────────────────────────
  researchState: { mode: 'strict', keys: { previous: OBJECT, observations: ARRAY } },
  researchUniverse: { mode: 'strict', keys: { market: STRING, extensions: ARRAY } },
  refutedMemoryRules: { mode: 'strict', keys: { patterns: ANY, memory: OBJECT } },
  inputContracts: { mode: 'named', keys: {} },
}

/**
 * The key list, kept as its own export because `inputContracts` published it
 * under this name and a run may still read it that way.
 */
export const INPUT_KEYS = Object.fromEntries(
  Object.entries(INPUT_CONTRACTS).map(([operation, contract]) => [operation, Object.keys(contract.keys)]),
)

/** Which operations refuse an unknown key outright, published so a caller can tell. */
export const GUARDED_OPERATIONS = Object.entries(INPUT_CONTRACTS)
  .filter(([, contract]) => contract.mode === 'strict')
  .map(([operation]) => operation)
  .sort()

/** Where "expected an object" is not enough of an answer for the caller who got it wrong. */
const KEY_MESSAGES = {
  'experimentalCeiling.experimentalPositionFloor': 'The minimum executable amount is declared per venue currency — { KRW: 300000, USD: 200 } — because what makes an order unexecutable is a fact about the exchange; a bare amount names no venue and is not read',
  'effectivePositionCap.experimentalPositionFloor': 'The minimum executable amount is declared per venue currency — { KRW: 300000, USD: 200 }; a bare amount names no venue and is not read',
  'targetWeight.experimentalPositionFloor': 'The minimum executable amount is declared per venue currency — { KRW: 300000, USD: 200 }; a bare amount names no venue and is not read',
}

const TYPE_LABELS = {
  [ARRAY]: 'an array',
  [ARRAY_OF_ARRAYS]: 'an array of arrays',
  [OBJECT]: 'an object',
  [NUMBER]: 'a finite number',
  [STRING]: 'a string',
  [BOOLEAN]: 'a boolean',
}

function typeMatches(type, value) {
  switch (type) {
    case ARRAY: return Array.isArray(value)
    case ARRAY_OF_ARRAYS: return Array.isArray(value) && value.every((row) => Array.isArray(row))
    case OBJECT: return typeof value === 'object' && !Array.isArray(value)
    case NUMBER: return typeof value === 'number' && Number.isFinite(value)
    case STRING: return typeof value === 'string'
    case BOOLEAN: return typeof value === 'boolean'
    default: return true
  }
}

/**
 * `succeeded`, which is a boolean and reads as a count (issue #157).
 *
 * `PROMPT.md` §2b writes `attempts` and `succeeded` side by side, so a run
 * writes `succeeded: 3` for three usable responses out of ten attempts — and
 * `succeeded !== true` then reported three lanes that all answered as
 * `lane_query_failed`. A controlled run of the `kr-sleeve` flow measured it
 * exactly: integers gave three `lane_query_failed` and a `warningCount` of 6,
 * the boolean gave no diagnostics and a `warningCount` of 3, and every other
 * byte of the call was identical.
 *
 * ⛔ The integer is the better input and it is accepted, rather than the
 * document being narrowed to the boolean: *"three of ten"* is a fact worth
 * carrying and the boolean throws it away. What the integer must not do is
 * collapse the pair §2b exists to separate — **`0` successes over `n` attempts
 * is `lane_query_failed`, and no attempt at all is `lane_not_queried`** — so
 * `attempts` decides which of those two fires and `succeeded` never does.
 *
 * A count above `attempts` is refused rather than clamped: it is the one shape
 * that cannot be either fact, and clamping it would invent the reading.
 */
export function laneOutcome(row) {
  const attempts = Number.isInteger(row?.attempts) && row.attempts >= 0 ? row.attempts : null
  const raw = row?.succeeded
  if (raw === true) return { succeeded: true, successCount: null, attempts, coherent: true }
  if (raw === false) return { succeeded: false, successCount: 0, attempts, coherent: true }
  if (Number.isInteger(raw) && raw >= 0) {
    return { succeeded: raw > 0, successCount: raw, attempts, coherent: attempts === null || raw <= attempts }
  }
  return { succeeded: null, successCount: null, attempts, coherent: true }
}

/** The message a lane row's `succeeded` is refused with, or `null` when it is readable. */
export function laneOutcomeRejection(row) {
  const raw = row?.succeeded
  if (raw === undefined || raw === null || typeof raw === 'boolean') return null
  if (!Number.isInteger(raw) || raw < 0) return 'Expected a boolean — did this route yield any usable response — or a whole count of the responses that were usable'
  const { attempts, coherent } = laneOutcome(row)
  if (!coherent) return `More successes (${raw}) than attempts (${attempts}); a count of usable responses cannot exceed the number of queries that produced them`
  return null
}

export function validateInput(operation, input, asOf = undefined) {
  const diagnostics = []
  const reject = (path, message) => diagnostics.push(diagnostic('input_shape_invalid', 'blocked', message, path))
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reject('input', 'Operation input must be an object')
    return diagnostics
  }
  const contract = INPUT_CONTRACTS[operation]
  if (!contract) return diagnostics
  const declared = contract.keys

  /**
   * ⚠️ `asOf` is the invocation's and it sits beside `input`, not inside it. A
   * copy that agrees is accepted in every operation because runs write it and
   * it costs nothing; a copy that **disagrees** is refused rather than silently
   * losing to the envelope, which is the same substitution this whole file
   * exists to stop.
   */
  if (input.asOf !== undefined && asOf !== undefined && input.asOf !== asOf) {
    reject('input.asOf', `asOf belongs to the invocation, beside input rather than inside it; this call carries two (${asOf} and ${input.asOf}) and the invocation's is the one that runs`)
  }

  for (const key of Object.keys(input)) {
    if (key === 'asOf' || Object.hasOwn(declared, key)) continue
    const published = Object.keys(declared)
    if (contract.mode === 'strict') {
      reject(`input.${key}`, `Unknown input key for ${operation}; supported: ${published.join(', ')}`)
    } else if (contract.mode === 'named') {
      diagnostics.push(diagnostic(
        'input_key_unread',
        'unevaluated',
        `${operation} does not read this key, so whatever it carried was not part of this answer; call inputContracts for the published shape`,
        `input.${key}`,
        { operation, supported: published },
      ))
    }
  }

  for (const [key, type] of Object.entries(declared)) {
    const value = input[key]
    if (value === undefined || value === null || type === ANY) continue
    if (typeMatches(type, value)) continue
    reject(`input.${key}`, KEY_MESSAGES[`${operation}.${key}`] ?? `Expected ${TYPE_LABELS[type] ?? type}${type === ARRAY_OF_ARRAYS ? ' — one array of symbols per scanner over the same market' : ''}`)
  }

  diagnostics.push(...nestedShape(operation, input))
  return diagnostics
}

/**
 * The checks that are about a nested value rather than a top-level key. Each
 * one is a shape a real run actually sent.
 */
function nestedShape(operation, input) {
  const diagnostics = []
  const reject = (path, message, details = {}) => diagnostics.push(diagnostic('input_shape_invalid', 'blocked', message, path, details))

  if (operation === 'signalPaper' && input.state) {
    for (const key of Object.keys(input.state)) if (!['schemaVersion', 'updatedAsOf', 'closed', 'openWindows', 'maturedThisRun'].includes(key)) reject(`input.state.${key}`, 'Unknown paper state field; retain the previous record')
    if (input.state.openWindows !== undefined && !Array.isArray(input.state.openWindows)) reject('input.state.openWindows', 'Expected an array')
    if (input.state.closed !== undefined && (!input.state.closed || typeof input.state.closed !== 'object' || Array.isArray(input.state.closed))) reject('input.state.closed', 'Expected an object')
  }
  if (operation === 'reconcileArmedReviews' && input.previous && !Array.isArray(input.previous.armed)) reject('input.previous.armed', 'Expected the complete stored record with an armed array')
  /**
   * ── The threshold is `level` and the reading is `value` (#177) ───────────
   *
   * A rule written `{ kind: 'price_below', threshold: 100 }` against evidence
   * written `{ observed: 80, observedAt: … }` joins, finds its row, and comes
   * back `unevaluated` — *"Rule and evidence are not comparable"* — because
   * `finite(rule.level)` and `finite(observation.value)` are both false. A
   * price 20% through a registered invalidation is reported as a rule nobody
   * could judge, and the sentinel verdict is `watch` rather than `threatened`.
   *
   * ⛔ **Refused rather than aliased**, the direction #173 took next door: the
   * two spellings both alive would leave nothing to say which one a run meant,
   * and this operation's whole output is a verdict about whether a thesis is
   * still standing.
   */
  if (operation === 'thesisSentinel' && Array.isArray(input.invalidations)) input.invalidations.forEach((row, i) => {
    if (!INPUT_VOCABULARY.sentinelKinds.includes(row?.kind)) reject(`input.invalidations[${i}].kind`, `Expected ${INPUT_VOCABULARY.sentinelKinds.join(', ')}`)
    if (row?.kind === 'metric' && !INPUT_VOCABULARY.sentinelOperators.includes(row.operator)) reject(`input.invalidations[${i}].operator`, 'Expected above or below')
    if (row?.threshold !== undefined) reject(`input.invalidations[${i}].threshold`, 'Use level: the number a price_below, price_above or metric rule is compared against. A time rule\'s instant is `at`. ⛔ threshold is read by nothing, and a rule written under it joins its evidence and answers unevaluated — a breach reported as a rule nobody could judge')
  })
  if (operation === 'thesisSentinel' && Array.isArray(input.evidence)) input.evidence.forEach((row, i) => {
    if (row?.observed !== undefined) reject(`input.evidence[${i}].observed`, 'Use value: the observation this rule is judged against. ⛔ observed is read by nothing and the rule comes back unevaluated rather than met')
    if (row?.observedAt !== undefined) reject(`input.evidence[${i}].observedAt`, 'Use availableAt: when this observation became available, which is what a time rule\'s `at` is compared with. ⛔ observedAt is read by nothing')
  })
  /**
   * ── The macro vocabulary, and the field it is keyed by (#177) ────────────
   *
   * `metric` is the consensus-evidence spelling one operation over, and a macro
   * row written under it is unusable: `officialCount` 0 and
   * `macroLaneAvailable: false`, which is this operation's way of saying *the
   * policy lane is blocked* — a verdict about the world, produced by a call it
   * could not read. The vocabulary is published as
   * `inputContracts.vocabulary.macroIndicators`; the spelling is refused here.
   */
  if (operation === 'validateMacro' && Array.isArray(input.observations)) input.observations.forEach((row, i) => {
    if (row?.metric !== undefined && row?.indicator === undefined) {
      reject(`input.observations[${i}].metric`, `Use indicator, whose values are kebab-case and closed: ${MACRO_INDICATORS.join(', ')}. ⛔ metric is the consensus-evidence field and is read by nothing here; written under it every row is unusable and macroLaneAvailable comes back false, which reads as an empty macro lane rather than an unreadable call`, { supported: [...MACRO_INDICATORS] })
    }
  })
  /**
   * ── A unit read as nothing is added at face value (#177) ─────────────────
   *
   * `valueCurrency` — the unit `portfolio_read` marks a position in — sat in a
   * row of a `named` operation, where an unknown key at the top is reported and
   * one inside a row is not seen at all. Dollars went into the won bucket:
   * `krwSleeveNav` 11,119,948.16 against 17,430,791.23, `status: ok`. The key
   * is read now, and any **other** currency-named key on the row is refused
   * rather than dropped, because dropping one is what this cost.
   */
  if (operation === 'sleeveNav' && Array.isArray(input.positions)) input.positions.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    for (const key of Object.keys(row)) {
      if (key === 'currency' || key === 'valueCurrency' || !/[Cc]urrency$/.test(key)) continue
      reject(`input.positions[${i}].${key}`, 'A position row states two currencies and no others: `currency`, the currency the asset quotes in and the sleeve it belongs to, and `valueCurrency`, the unit `marketValue` is counted in. ⛔ Any other currency key is not read, and an unread unit is a number added at face value', { key })
    }
  })
  /**
   * ── The three label axes are one rule, and only one of them was written (#173) ──
   *
   * `theme` in the singular was refused here from #147; `sectors` in the plural
   * was **read by nothing and refused by nothing**, so a row labelled
   * `sectors: ["kr-broad-equity"]` came back with `exposures.sector: {}`, no
   * diagnostic, and `status: ok`. The sector cap was not applied and the answer
   * did not say so — a breach on a book whose sectors are all spelled that way
   * passes as a clean axis.
   *
   * ⛔ **Refused rather than normalised**, which is the direction the singular
   * `theme` next to it already took and the one this package keeps choosing: a
   * caller who wrote the wrong spelling wrote it in `researchUniverse`'s output
   * shape too, and quietly reading their plural would leave the two spellings
   * both alive with nothing to say which the run meant. The refusal names the
   * spelling that is read.
   *
   * ⚠️ The table is the whole point. `sector` is singular because a listing has
   * one; `themes` and `factors` are arrays because a name sits on several loss
   * paths. Writing that asymmetry out three times is how one of the three came
   * to be unguarded.
   */
  if (operation === 'concentration') for (const key of ['positions', 'proposed']) {
    if (Array.isArray(input[key])) input[key].forEach((row, i) => {
      for (const [singular, plural] of [['sector', 'sectors'], ['theme', 'themes'], ['factor', 'factors']]) {
        const isArrayAxis = singular !== 'sector'
        const read = isArrayAxis ? plural : singular
        const wrong = isArrayAxis ? singular : plural
        if (row?.[wrong] !== undefined) {
          reject(`input.${key}[${i}].${wrong}`, isArrayAxis
            ? `Use ${plural}: an array of ${singular} names`
            : 'Use sector: a single sector name string. A listing has one sector, and the plural is read by nothing — passed here the sector axis is accumulated empty and its cap applies to no weight')
        }
        if (row?.[read] === undefined) continue
        if (isArrayAxis && !Array.isArray(row[read])) reject(`input.${key}[${i}].${read}`, `Expected an array of ${singular} names`)
        if (!isArrayAxis && typeof row[read] !== 'string') reject(`input.${key}[${i}].${read}`, 'Expected a single sector name string')
      }
    })
  }
  /**
   * ⛔ The aggregate is the shape that hid #174, so the bare amount is refused
   * by name rather than read as the sleeve's own currency.
   */
  if (operation === 'specialistBudget') {
    const { rejection } = readCashByCurrency(input.sleeveCashByCurrency)
    if (rejection) reject('input.sleeveCashByCurrency', rejection)
  }
  if (operation === 'exitCheck' && input.price !== undefined && input.price !== null && (typeof input.price !== 'number' || !Number.isFinite(input.price))) reject('input.price', 'Expected a finite scalar price; pass the observation value, not its envelope')

  /**
   * ⛔ The close buffers live under `config.schedule`, and a caller who puts
   * them at the top of `config` is answered by the package's own 30/45. That is
   * #91's defect — *the number on the install screen governed nothing* — coming
   * back from the caller's side, and it is silent whenever the investor's
   * values happen to match the defaults, which is exactly the book that
   * measured it.
   */
  if (operation === 'nextReviewSequence' && input.config && typeof input.config === 'object') {
    const misplaced = ['krCloseBufferMinutes', 'usCloseBufferMinutes'].filter((key) => input.config[key] !== undefined)
    if (misplaced.length) {
      reject('input.config.schedule', 'The close buffers are read from config.schedule, not from the top of config; passed here they are not read and the package substitutes its own 30/45 for the investor\'s numbers', { misplaced })
    }
  }
  for (const key of ['krSessions', 'usSessions', 'sessions']) {
    if ((operation !== 'nextReviewSequence' && operation !== 'nextMarketReview') || !Array.isArray(input[key])) continue
    input[key].forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        reject(`input.${key}[${index}]`, 'Expected a session object: { isOpen, date, closeLocal, timeZone }')
        return
      }
      const unknown = Object.keys(row).filter((name) => !['isOpen', 'date', 'closeLocal', 'timeZone'].includes(name))
      if (unknown.length && row.closeLocal === undefined) {
        reject(`input.${key}[${index}]`, 'A market session is { isOpen, date, closeLocal: "15:30", timeZone: "Asia/Seoul" }; a vendor calendar row is not read as one', { unknown })
      }
    })
  }

  for (const [operationName, path] of [['harnessAudit', 'researchActivity'], ['laneCoverage', 'activity']]) {
    if (operation !== operationName) continue
    const rows = operation === 'harnessAudit'
      ? (Array.isArray(input.researchActivity) ? input.researchActivity.map((row, index) => [`${path}[${index}]`, row]) : [])
      : (input.activity && typeof input.activity === 'object' && !Array.isArray(input.activity) ? Object.entries(input.activity).map(([source, row]) => [`${path}.${source}`, row]) : [])
    for (const [at, row] of rows) {
      const rejection = laneOutcomeRejection(row)
      if (rejection) reject(`input.${at}.succeeded`, rejection)
      if (row?.attempts !== undefined && row?.attempts !== null && (!Number.isInteger(row.attempts) || row.attempts < 0)) {
        reject(`input.${at}.attempts`, 'Expected a whole count of queries this route was actually sent')
      }
    }
  }
  return diagnostics
}
