/**
 * ── The nested shape checks, one function per shape (issue #212 ③) ─────────
 *
 * These were a chain of `if (operation === '…')` inside `validateInput`: a
 * per-operation table written in a second place, keyed by a string the
 * registry and the contract each spelled out again. Every branch is a named
 * function here, and the operation that needs it **names it in its own
 * definition row** — `operations.mjs`, the `shape` member.
 *
 * ⛔ **No `operation === ` test is left in this package's input path.** A shape
 * check reaches an operation because that operation's row asked for it, which
 * is the whole point: the chain could grow a branch for an operation that had
 * been renamed, or lose one, and nothing would say so.
 *
 * ⚠️ Every code, severity, message and `details` object below is the byte the
 * chain emitted. What moved is where the operation name comes from — it is
 * passed in, so `details.operation` still reads the same.
 */
import { diagnostic, readCashByCurrency } from './diagnostics.mjs'
import { MACRO_INDICATORS } from './evidence.mjs'
import { INPUT_VOCABULARY, PAPER_STATE_MEMBERS, MEMORY_ENVELOPE_FIELDS, laneOutcomeRejection } from './vocabulary.mjs'

/** The collector every shape check writes into, and the `reject` the chain had. */
const collect = (body) => (input, operation) => {
  const diagnostics = []
  const reject = (path, message, details = {}) => diagnostics.push(diagnostic('input_shape_invalid', 'blocked', message, path, details))
  body({ input, operation, diagnostics, reject })
  return diagnostics
}

/** Two shapes on one operation: run both, report both. */
export const both = (...checks) => (input, operation) => checks.flatMap((check) => check(input, operation))

/** The five members `signalPaper` reads, and the seven §1 envelope fields it carries and ignores. */
export const paperState = collect(({ input, operation, diagnostics, reject }) => {
  if (!input.state) return
  for (const key of Object.keys(input.state)) {
    if (PAPER_STATE_MEMBERS.includes(key)) continue
    if (MEMORY_ENVELOPE_FIELDS.includes(key)) {
      diagnostics.push(diagnostic(
        'input_state_envelope_ignored',
        'info',
        'This is one of the envelope fields PROMPT.md §1 asks of a memory value, and `signalPaper` does not read it: the paper record may be passed back exactly as it was stored. It took no part in this answer, and the `nextState` returned here does not carry it back — that value is the five published members and nothing else, so a key stored wrapped comes back unwrapped',
        `input.state.${key}`,
        { operation, members: PAPER_STATE_MEMBERS },
      ))
      continue
    }
    reject(`input.state.${key}`, `Unknown paper state field; retain the previous record. ⛔ It is not one of the §1 envelope fields either — those are carried and ignored — so this reads as a misspelled member, and a misspelled ${PAPER_STATE_MEMBERS.join('/')} is a track this operation cannot see`, { operation, members: PAPER_STATE_MEMBERS, envelopeFields: MEMORY_ENVELOPE_FIELDS })
  }
  if (input.state.openWindows !== undefined && !Array.isArray(input.state.openWindows)) reject('input.state.openWindows', 'Expected an array')
  if (input.state.closed !== undefined && (!input.state.closed || typeof input.state.closed !== 'object' || Array.isArray(input.state.closed))) reject('input.state.closed', 'Expected an object')
})

/** The stored review record arrives whole, with its `armed` array. */
export const armedRecord = collect(({ input, operation, diagnostics, reject }) => {
  if (input.previous && !Array.isArray(input.previous.armed)) reject('input.previous.armed', 'Expected the complete stored record with an armed array')
})

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
export const sentinelRules = collect(({ input, operation, diagnostics, reject }) => {
  if (Array.isArray(input.invalidations)) input.invalidations.forEach((row, i) => {
    if (!INPUT_VOCABULARY.sentinelKinds.includes(row?.kind)) reject(`input.invalidations[${i}].kind`, `Expected ${INPUT_VOCABULARY.sentinelKinds.join(', ')}`)
    if (row?.kind === 'metric' && !INPUT_VOCABULARY.sentinelOperators.includes(row.operator)) reject(`input.invalidations[${i}].operator`, 'Expected above or below')
    if (row?.threshold !== undefined) reject(`input.invalidations[${i}].threshold`, 'Use level: the number a price_below, price_above or metric rule is compared against. A time rule\'s instant is `at`. ⛔ threshold is read by nothing, and a rule written under it joins its evidence and answers unevaluated — a breach reported as a rule nobody could judge')
  })
  if (Array.isArray(input.evidence)) input.evidence.forEach((row, i) => {
    if (row?.observed !== undefined) reject(`input.evidence[${i}].observed`, 'Use value: the observation this rule is judged against. ⛔ observed is read by nothing and the rule comes back unevaluated rather than met')
    if (row?.observedAt !== undefined) reject(`input.evidence[${i}].observedAt`, 'Use availableAt: when this observation became available, which is what a time rule\'s `at` is compared with. ⛔ observedAt is read by nothing')
  })
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
export const macroRows = collect(({ input, operation, diagnostics, reject }) => {
  if (Array.isArray(input.observations)) input.observations.forEach((row, i) => {
    if (row?.metric !== undefined && row?.indicator === undefined) {
      reject(`input.observations[${i}].metric`, `Use indicator, whose values are kebab-case and closed: ${MACRO_INDICATORS.join(', ')}. ⛔ metric is the consensus-evidence field and is read by nothing here; written under it every row is unusable and macroLaneAvailable comes back false, which reads as an empty macro lane rather than an unreadable call`, { supported: [...MACRO_INDICATORS] })
    }
  })
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
export const sleeveRows = collect(({ input, operation, diagnostics, reject }) => {
  if (Array.isArray(input.positions)) input.positions.forEach((row, i) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    for (const key of Object.keys(row)) {
      if (key === 'currency' || key === 'valueCurrency' || !/[Cc]urrency$/.test(key)) continue
      reject(`input.positions[${i}].${key}`, 'A position row states two currencies and no others: `currency`, the currency the asset quotes in and the sleeve it belongs to, and `valueCurrency`, the unit `marketValue` is counted in. ⛔ Any other currency key is not read, and an unread unit is a number added at face value', { key })
    }
  })
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
export const labelAxes = collect(({ input, operation, diagnostics, reject }) => {
  for (const key of ['positions', 'proposed']) {
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
})

/**
 * ⛔ The aggregate is the shape that hid #174, so the bare amount is refused
 * by name rather than read as the sleeve's own currency.
 */
export const sleeveCash = collect(({ input, operation, diagnostics, reject }) => {
  const { rejection } = readCashByCurrency(input.sleeveCashByCurrency)
  if (rejection) reject('input.sleeveCashByCurrency', rejection)
})

/** A price is the observation's value here, not the envelope it arrived in. */
export const scalarPrice = collect(({ input, operation, diagnostics, reject }) => {
  if (input.price !== undefined && input.price !== null && (typeof input.price !== 'number' || !Number.isFinite(input.price))) reject('input.price', 'Expected a finite scalar price; pass the observation value, not its envelope')
})

/**
 * ⛔ The close buffers live under `config.schedule`, and a caller who puts
 * them at the top of `config` is answered by the package's own 30/45. That is
 * #91's defect — *the number on the install screen governed nothing* — coming
 * back from the caller's side, and it is silent whenever the investor's
 * values happen to match the defaults, which is exactly the book that
 * measured it.
 */
export const scheduleBuffers = collect(({ input, operation, diagnostics, reject }) => {
  if (input.config && typeof input.config === 'object') {
    const misplaced = ['krCloseBufferMinutes', 'usCloseBufferMinutes'].filter((key) => input.config[key] !== undefined)
    if (misplaced.length) {
      reject('input.config.schedule', 'The close buffers are read from config.schedule, not from the top of config; passed here they are not read and the package substitutes its own 30/45 for the investor\'s numbers', { misplaced })
    }
  }
})

/**
 * A market session is four fields and a vendor calendar row is not one of
 * them. Named by both `nextReviewSequence` and `nextMarketReview`: one
 * implementation, two rows that ask for it — where the chain tested for the
 * two names inside a loop over three keys.
 */
export const sessionRows = collect(({ input, operation, diagnostics, reject }) => {
  for (const key of ['krSessions', 'usSessions', 'sessions']) {
    if (!Array.isArray(input[key])) continue
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
})

/**
 * `succeeded` on a lane row, for the two operations that carry lanes. The pair
 * differs in shape and not in rule — `harnessAudit` sends an array and
 * `laneCoverage` an object keyed by source — so the reader is a parameter and
 * the rule is written once.
 */
export const laneRows = (path) => collect(({ input, reject }) => {
  const rows = path === 'researchActivity'
    ? (Array.isArray(input.researchActivity) ? input.researchActivity.map((row, index) => [`${path}[${index}]`, row]) : [])
    : (input.activity && typeof input.activity === 'object' && !Array.isArray(input.activity) ? Object.entries(input.activity).map(([source, row]) => [`${path}.${source}`, row]) : [])
  for (const [at, row] of rows) {
    const rejection = laneOutcomeRejection(row)
    if (rejection) reject(`input.${at}.succeeded`, rejection)
    if (row?.attempts !== undefined && row?.attempts !== null && (!Number.isInteger(row.attempts) || row.attempts < 0)) {
      reject(`input.${at}.attempts`, 'Expected a whole count of queries this route was actually sent')
    }
  }
})
