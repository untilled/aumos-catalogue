/**
 * ── The vocabulary and the value readers, on the leaf side (issue #212 ③) ──
 *
 * These moved out of `input-contracts.mjs` so that the single operation
 * definition can live in `operations.mjs` and import the leaf modules for its
 * `run` members. Five leaves read from here — `audit`, `envelopes`,
 * `learning`, `methodology` and `source-parsers` — and if this table stayed
 * next to the definition that reads them, `operations.mjs` would import them
 * and they would import it back.
 *
 * ⚠️ **Nothing here is a second copy.** `input-contracts.mjs` re-exports every
 * name below, so a caller that reached for it there still finds it, and the
 * only definition is this one.
 */
import { MANAGER_ID } from './diagnostics.mjs'
import { MACRO_INDICATORS } from './evidence.mjs'
import { CATALYST_MEMORY_KEY } from './catalysts.mjs'

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
   * ⚠️ The two windows `upsideRadar` reads, published because they were the
   * unwritten half of an input nothing produced (#169). A catalyst is counted
   * when its window overlaps the next 60 days; an event when it was announced
   * inside the last 30. `catalystRegister` returns both as `horizonDays` and
   * `eventLookbackDays` so a caller reads them off the answer rather than this
   * table's copy.
   */
  catalystHorizonDays: 60,
  eventLookbackDays: 30,
  catalystMemoryKey: CATALYST_MEMORY_KEY,
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

/** The declared type of an input key. Checked in every mode — see `operations.mjs`. */
export const ANY = 'any'
export const ARRAY = 'array'
export const ARRAY_OF_ARRAYS = 'array-of-arrays'
export const OBJECT = 'object'
export const NUMBER = 'number'
export const STRING = 'string'
export const BOOLEAN = 'boolean'

/** Where "expected an object" is not enough of an answer for the caller who got it wrong. */
export const KEY_MESSAGES = {
  'experimentalCeiling.experimentalPositionFloor': 'The minimum executable amount is declared per venue currency — { KRW: 300000, USD: 200 } — because what makes an order unexecutable is a fact about the exchange; a bare amount names no venue and is not read',
  'effectivePositionCap.experimentalPositionFloor': 'The minimum executable amount is declared per venue currency — { KRW: 300000, USD: 200 }; a bare amount names no venue and is not read',
  'targetWeight.experimentalPositionFloor': 'The minimum executable amount is declared per venue currency — { KRW: 300000, USD: 200 }; a bare amount names no venue and is not read',
}

export const TYPE_LABELS = {
  [ARRAY]: 'an array',
  [ARRAY_OF_ARRAYS]: 'an array of arrays',
  [OBJECT]: 'an object',
  [NUMBER]: 'a finite number',
  [STRING]: 'a string',
  [BOOLEAN]: 'a boolean',
}

export function typeMatches(type, value) {
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

/** The members `signalPaper` reads out of the carried paper record. */
export const PAPER_STATE_MEMBERS = Object.freeze(['schemaVersion', 'updatedAsOf', 'closed', 'openWindows', 'maturedThisRun'])

/**
 * ── The envelope `PROMPT.md` §1 asks of a memory value, ignored here (#204) ──
 *
 * §1 requires every accepted memory value to be an object carrying referenced
 * decision and evidence ids, a sample count, an independent date-cluster count,
 * computable metrics, missing fields and a status — beside `schemaVersion` and
 * `updatedAsOf`, which the paper record carries anyway. Until 0.4.49 `state`
 * refused all seven, one `input_shape_invalid` / `blocked` per key: a run that
 * followed §1 got `data: null`, no `nextState`, and §5 step 4 held the prior
 * revision — the paper track standing still once per wake on the only path to
 * the 30-sample gate. #172 could not fix that in code because the same question
 * had two published answers: `reconcileArmedReviews`' `previous`,
 * `refutedMemoryRules`' `patterns` and `watchAlertState`' `previous` all take
 * the stored record whole and let the extra fields through. #199 wrote the
 * asymmetry into two documents rather than erasing it; #204 is the owner's
 * decision to erase it, on the loose side, because three of the four keys were
 * already there.
 *
 * ⚠️ **Ignored is not accepted-and-carried-back.** The risk #199 named when it
 * declined this branch is real — «wrapped in, wrapped out» would contradict the
 * rule that `nextState` is written back verbatim — and it is answered by
 * structure rather than by refusal: `signalPaper` builds `nextState` as a
 * literal of the five members above, so no field read here can travel into the
 * value the next run stores. The ignoring lives on the reading side only.
 *
 * ⚠️ **Ignored is said out loud, by key name.** «that key was not there» and
 * «that key was carried and not read» are different facts, and a run that
 * cannot tell them apart cannot tell whether its own memory shape is the one
 * this package wants. ⛔ The value is never carried out — the name is the whole
 * report, the rule this package already follows for `paper_row_metadata_missing`.
 *
 * ⛔ **Only this list is ignored, and every other unknown key stays `blocked`.**
 * The envelope is a shape *this package's own §1 asks for*; an unrecognised key
 * is more likely a misspelled member, and a misspelled member is the #137
 * erasure — `openWindow` for `openWindows` reads as a track with no windows and
 * the `nextState` it returns deletes it. Widening past the envelope would buy
 * nothing the issue asked for and reopen the one failure this operation was
 * hardened against.
 *
 * ⛔ **Not registered in `CAUSE_CODE_REGISTRY`.** That table is
 * `mandateExecution`'s vocabulary for *«why does this book hold no single
 * name?»*, and its three lanes are a stage that lost an input, an answer that
 * refuses both conclusions, and a gate that ran. An ignored envelope field is
 * none of them: nothing was lost, nothing is unresolved, no gate ran. Filing it
 * there would let an accepted shape count as a cause of an empty book.
 */
export const MEMORY_ENVELOPE_FIELDS = Object.freeze([
  'decisionIds', 'evidenceIds', 'sampleCount', 'independentDateClusterCount', 'computableMetrics', 'missingFields', 'status',
])
