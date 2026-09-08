/**
 * ── One boundary where a representation becomes the internal type (#212 ⑥) ──
 *
 * Five facts arrived here in two spellings each, and each spelling was detected
 * **inside the function that needed it**:
 *
 * | fact | the two representations | where the branch was |
 * |---|---|---|
 * | a market | `kr`/`us` and the MIC `XKRX`/`XNAS`/`XNYS` | `research-state.mjs`, `catalysts.mjs`, `fundamentals-feed.mjs` (four copies of one refusal) |
 * | an amount | a number of major units and AMP's `Money` (`minorUnits` + optional `exponent`) | `methodology.mjs` `moneyToMajor`, reached from `normalizeWatch` |
 * | cash per currency | `[{ currency, amount }]` rows and `{ KRW, USD }` | `diagnostics.mjs` `readCashByCurrency`, called from `sizing.mjs` |
 * | a trigger | `price_below` and `price-below`; `price`/`level`/`beyond` and `threshold` | `methodology.mjs` (three sites), `sizing.mjs` (two), `coverage.mjs` (two) |
 * | a memory value | a bare row array and the §1 envelope holding the rows under `patterns`/`rows`/`entries`/`failures` | `memory-rules.mjs` `rowsOf` |
 *
 * ⛔ **A leaf may not detect a spelling any more.** Every function below is
 * named by the operation that needs it, in that operation's own row in
 * `operations.mjs` — the `canonical` member, beside `shape`. A leaf receives one
 * representation and reads it; the verifier asserts the aliases are gone from
 * the leaf modules **by name**, the way `assertRegistered` refuses a half-wired
 * row.
 *
 * ⚠️ **Converting is not deciding.** These functions change how a value is
 * spelled and never what it means: no rounding to a currency's minor unit, no
 * currency substituted for another, no instant moved. A value in a shape no
 * table below recognises is **left exactly as it arrived**, so the refusal that
 * already existed — `input-shapes.mjs`, or the leaf's own gate — is the thing
 * that answers it. That is why this pass runs *before* `validateInput` and adds
 * nothing to the type check: it hands the validator the canonical spelling and
 * the validator is the only gate.
 *
 * ⚠️ **Diagnostics keep their old bytes.** `trigger_kind_alias`,
 * `watch_field_alias` and `watch_price_uncountable` were raised by
 * `normalizeWatch` and `validateThesis`; they are raised here, with the same
 * code, severity, message, path and details. What moved is where the branch
 * lives, not what a caller is told.
 */
import { diagnostic, finite } from './diagnostics.mjs'
import { INPUT_VOCABULARY, TRIGGER_ALIASES } from './vocabulary.mjs'

/**
 * ── The path spec, and why it is a spec rather than a per-operation function ──
 *
 * A row names `'thesis.invalidationTriggers[].kind'` and this walks it. Three
 * segment forms: a key, `[]` for every element of an array, and `{}` for every
 * own value of an object (which is the shape `refutedMemoryRules`' `memory` is —
 * keyed by a stable memory key nothing here enumerates).
 *
 * ⚠️ **The spec is also the diagnostic path.** `invalidationTriggers[].kind`
 * navigated at index 0 renders `invalidationTriggers[0].kind`, which is the
 * path the chain emitted. ⛔ No `input.` prefix: these are the leaf-relative
 * paths, because these diagnostics were the leaves'.
 */
const parse = (path) =>
  path.split('.').flatMap((raw) => {
    if (raw.endsWith('[]')) return [{ key: raw.slice(0, -2) }, { each: 'array' }]
    if (raw.endsWith('{}')) return [{ key: raw.slice(0, -2) }, { each: 'object' }]
    return [{ key: raw }]
  })

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function walk(value, segments, transform, path, diagnostics) {
  if (!segments.length) {
    const answer = transform(value, path)
    diagnostics.push(...(answer?.diagnostics ?? []))
    return answer && 'value' in answer ? answer.value : value
  }
  const [head, ...rest] = segments
  if (head.each === 'array') {
    if (!Array.isArray(value)) return value
    let moved = false
    const next = value.map((row, index) => {
      const replaced = walk(row, rest, transform, `${path}[${index}]`, diagnostics)
      if (replaced !== row) moved = true
      return replaced
    })
    return moved ? next : value
  }
  if (head.each === 'object') {
    if (!isRecord(value)) return value
    let moved = false
    const next = {}
    for (const [key, row] of Object.entries(value)) {
      const replaced = walk(row, rest, transform, `${path}[${JSON.stringify(key)}]`, diagnostics)
      if (replaced !== row) moved = true
      next[key] = replaced
    }
    return moved ? next : value
  }
  if (!isRecord(value) || !Object.hasOwn(value, head.key)) return value
  const replaced = walk(value[head.key], rest, transform, path ? `${path}.${head.key}` : head.key, diagnostics)
  if (replaced === value[head.key]) return value
  return { ...value, [head.key]: replaced }
}

/**
 * A normalizer: the paths it applies to, and the one conversion it performs.
 * ⛔ It never sees the operation name — that is the whole point of the row
 * naming it, and a conversion that had to know which operation asked for it
 * would be the chain this file replaces.
 */
const at = (transform) => (...paths) => {
  const specs = paths.map(parse)
  return (input) => {
    const diagnostics = []
    let value = input
    for (const segments of specs) value = walk(value, segments, transform, '', diagnostics)
    return { input: value, diagnostics }
  }
}

/** Two conversions on one operation: run both, in order, report both. */
export const all = (...normalizers) => (input) => {
  const diagnostics = []
  let value = input
  for (const normalizer of normalizers) {
    const answer = normalizer(value)
    value = answer.input
    diagnostics.push(...answer.diagnostics)
  }
  return { input: value, diagnostics }
}

/**
 * ── ⑴ A market: the MIC and the sleeve are one fact (#146, #571) ───────────
 *
 * `INPUT_VOCABULARY` publishes both vocabularies and says which operations take
 * which — because publishing one of them was a trap: a caller reading the object
 * had exactly one market vocabulary to reach for and it was the wrong one. Four
 * leaves then refused the MIC with the same sentence written four times
 * (*"Expected kr or us … and never a MIC"*), and the run that guessed wrong had
 * its whole calculation refused.
 *
 * ⚠️ **The MIC is the host's spelling and it is not ambiguous** — aumos#571 made
 * `MarketCode` always an exchange, so `XNAS` and `XNYS` are two boards of one
 * sleeve and the mapping is total in that direction. ⛔ The reverse is not a
 * function and is not attempted: `us` names two boards, so nothing here turns a
 * sleeve into a MIC. The internal type is the **sleeve**, which is what every
 * one of these operations already read.
 *
 * ⛔ A value that is neither is untouched, so `research_market_invalid`,
 * `catalyst_market_invalid` and `feed_market_invalid` still answer it.
 */
export const researchMarket = at((value, path) => {
  if (typeof value !== 'string') return null
  const sleeve = INPUT_VOCABULARY.marketToResearchMarket[value]
  if (sleeve === undefined) return null
  return {
    value: sleeve,
    diagnostics: [diagnostic(
      'market_spelling_alias',
      'info',
      `The internal spelling here is the sleeve — ${INPUT_VOCABULARY.researchMarkets.join(' or ')} — and the MIC the host's own tools take is read and converted. ⛔ The conversion is one-way: a sleeve names two boards, so nothing turns ${sleeve} back into a MIC`,
      path,
      { given: value, canonical: sleeve },
    )],
  }
})

/**
 * ── ⑵ An amount: `Money` and a number of major units (aumos#581) ───────────
 *
 * Everything in this package is a number of major units, and AMP's `Money` is
 * an integer count of **minor** units with an optional `exponent` whose absence
 * means the currency's own minor unit. A run writes the `Money` because that is
 * the shape a `DecisionProposal` is accepted in — there is no other — and then
 * hands the same object here.
 *
 * ⚠️ **`exponent` is consulted first and the table second**, which is the order
 * aumos#581 states: the field says what the count is a count of, and the
 * currency's minor unit is only the default for its absence.
 *
 * ⛔ A currency this package does not count in returns `null` rather than
 * guessing two decimals: a wrong exponent is a threshold off by a factor of a
 * hundred, and that is a stop that fires early or never.
 */
export const CURRENCY_MINOR_DIGITS = Object.freeze({ KRW: 0, USD: 2 })

export function moneyToMajor(value) {
  if (finite(value)) return value
  if (!isRecord(value) || !Number.isFinite(value.minorUnits)) return null
  const digits = Number.isFinite(value.exponent) ? value.exponent : CURRENCY_MINOR_DIGITS[value.currency]
  return Number.isFinite(digits) ? value.minorUnits / 10 ** digits : null
}

/**
 * A `Money` where this package counts a number. ⛔ Anything else is untouched —
 * an observation envelope is not a `Money`, and the shape check that refuses it
 * by name is the one that answers it.
 *
 * ⚠️ It says so, for the same reason the other four do: a conversion nobody is
 * told about is a value that means two things to two readers. ⛔ The currency is
 * carried in the report and never applied — this converts the count, and which
 * currency a level belongs to is the asset's (aumos#689).
 */
export const moneyAmount = at((value, path) => {
  if (finite(value) || !isRecord(value) || !Number.isFinite(value.minorUnits)) return null
  const amount = moneyToMajor(value)
  if (amount === null) return null
  return {
    value: amount,
    diagnostics: [diagnostic(
      'money_spelling_alias',
      'info',
      'This package counts a number of major units; AMP’s `Money` — an integer count of minor units, whose absent `exponent` means the currency’s own minor unit — is read and converted. ⛔ Nothing is rounded and no currency is substituted',
      path,
      { currency: value.currency ?? null, minorUnits: value.minorUnits, amount },
    )],
  }
})

/**
 * ── ⑶ Cash per currency: rows and an object (#174) ─────────────────────────
 *
 * `portfolio_read` carries `cashByCurrency` as `{ currency, amount }` rows,
 * `sleeveNav` was written against those rows, and this package's other
 * per-currency input — `minimumExecutablePosition` — is an object keyed by
 * currency. The internal type is the **object**, because that is what every
 * reader actually asks of it (*"how much of this one currency"*) and the rows
 * answer it only after being summed.
 *
 * ⛔ It does not convert between currencies and it does not total across them.
 * Adding two currencies is what produced the number nobody could spend: on the
 * book that found #174, the aggregate read USD 8,596.10 and 96.6% of it was won.
 *
 * ⛔ A bare amount, and a row missing either half, is **left as it arrived** —
 * the refusal that names it is `input-shapes.mjs`' `sleeveCash` for the
 * operation that has one and the leaf's own `cash_row_unevaluated` for the
 * operation that does not. Converting a shape and refusing one are two jobs and
 * this is the first.
 */
export function readCashByCurrency(value) {
  if (value === undefined || value === null) return { totals: null, rejection: null }
  const bare = 'Cash is stated per currency — { KRW: 11115231, USD: 294.02 }, or the { currency, amount } rows the invocation carries under portfolio.cashByCurrency. ⛔ A bare amount names no currency, and an aggregate across currencies is the one number a sleeve cannot be paid in'
  if (Array.isArray(value)) {
    const totals = {}
    for (const row of value) {
      if (typeof row?.currency !== 'string' || !row.currency || !finite(row?.amount)) {
        return { totals: null, rejection: 'Each cash row is { currency, amount } with a currency code and a finite amount' }
      }
      totals[row.currency] = (totals[row.currency] ?? 0) + row.amount
    }
    return { totals, rejection: null }
  }
  if (typeof value !== 'object') return { totals: null, rejection: bare }
  const totals = {}
  for (const [currency, amount] of Object.entries(value)) {
    if (!finite(amount)) return { totals: null, rejection: `Cash is keyed by currency code with a finite amount; ${currency} carries something else` }
    totals[currency] = amount
  }
  return { totals, rejection: null }
}

export const cashByCurrency = at((value) => {
  if (!Array.isArray(value)) return null
  const { totals } = readCashByCurrency(value)
  return totals === null ? null : { value: totals }
})

/**
 * ── ⑷ A trigger: one vocabulary, and the fields AMP writes it in (§25) ─────
 *
 * `validateThesis` accepted `price_below` and `validateWatch` accepted
 * `price-below`, for the same condition, and no skill listed either set. The
 * spelling is kebab-case everywhere now, matching the `unit` and `lens`
 * vocabularies; the snake_case forms are still read so no recorded thesis
 * becomes unreadable, and reading one raises an `info` saying which is canonical.
 *
 * ⛔ `thesisSentinel`'s `invalidations[].kind` is **not** on this table and no
 * row names this normalizer for it: that operation's vocabulary is genuinely
 * snake_case (`INPUT_VOCABULARY.sentinelKinds`), and folding it would silently
 * change which rules a sentinel verdict is computed from.
 *
 * ⚠️ **The alias table itself is in `vocabulary.mjs`** — the leaf-side module —
 * because `INPUT_VOCABULARY` publishes it (`triggerKindAliases`, so a caller
 * reads which two spellings exist rather than discovering the second from a
 * refusal, aumos#618), and a vocabulary that imported this module while this
 * module imported it back would be a cycle evaluated in whichever order the
 * first caller happened to load.
 */
export function normalizeTriggerKind(kind) {
  return TRIGGER_ALIASES[kind] ?? kind
}

export const triggerKind = at((value, path) => {
  const canonical = normalizeTriggerKind(value)
  if (canonical === value) return null
  return {
    value: canonical,
    diagnostics: [diagnostic('trigger_kind_alias', 'info', 'The canonical spelling is kebab-case; the underscore form is accepted and normalized', path, { given: value, canonical })],
  }
})

/**
 * ── The other half of the same inconsistency: the *fields* (2026-09-02) ────
 *
 * The second vocabulary is not a legacy of this package — it is **AMP's, the
 * published one**:
 *
 * | condition | `packages/amp` `planTriggerSchema` | this server |
 * |---|---|---|
 * | `price-below` / `price-above` | `price` (a `Money`) | `threshold` (a number) |
 * | `weight-drift` | `beyond` (a fraction) | `threshold` + `baselineWeight` |
 *
 * A manager writes the AMP shape because that is the shape a `DecisionProposal`
 * is accepted in. It then handed the same object here and was told the watch was
 * `unevaluable`, with the diagnostic naming `observation.weight` — **the one
 * field the caller supplied correctly** — so the run read it as a host defect.
 * Measured 2026-09-01 in a real session, twice: once on a stop level and once on
 * a drift band.
 *
 * ⚠️ **`baselineWeight` has no AMP counterpart and is not invented.** The kernel
 * evaluates `weight-drift` against the weight in the stored snapshot
 * (`wake/triggers.ts`), so the manager never states a baseline; defaulting it to
 * the observed weight is a drift of zero, a watch that never fires and never
 * says why.
 *
 * ⚠️ This runs on the whole watch rather than on one field, because the answer
 * is a fold of three of them onto a fourth — and it runs **after** `triggerKind`
 * in the composed pass, since which fold applies is decided by the canonical
 * kind.
 */
export const watchFields = at((watch, path) => {
  if (!isRecord(watch)) return null
  const kind = watch.kind
  const diagnostics = []
  const next = { ...watch }
  if ((kind === 'price-below' || kind === 'price-above') && !finite(next.threshold)) {
    const level = finite(next.level) ? next.level : moneyToMajor(next.price)
    if (finite(level)) {
      next.threshold = level
      if (next.price !== undefined) {
        diagnostics.push(diagnostic('watch_field_alias', 'info', 'A price WATCH may state its level as AMP’s `price` (a Money) or as `threshold` (a number); both are read', `${path}.price`, { threshold: level }))
      }
    } else if (next.price !== undefined) {
      diagnostics.push(diagnostic('watch_price_uncountable', 'unevaluated', 'A price WATCH states a Money this package does not count in; give `threshold` in major units', `${path}.price`, { currency: next.price?.currency ?? null, supported: Object.keys(CURRENCY_MINOR_DIGITS) }))
    }
  }
  if (kind === 'weight-drift' && !finite(next.threshold) && finite(next.beyond)) {
    next.threshold = next.beyond
    diagnostics.push(diagnostic('watch_field_alias', 'info', 'A drift WATCH may state its band as AMP’s `beyond` or as `threshold`; both are read', `${path}.beyond`, { threshold: next.beyond }))
  }
  return { value: next, diagnostics }
})

/**
 * ── ⑸ A memory value: the rows, and the envelope holding them (#156, #204) ──
 *
 * `PROMPT.md` §1 asks every accepted memory value to be an object carrying
 * referenced decision and evidence ids, a sample count, a cluster count,
 * computable metrics, missing fields and a status. So the rows a key holds
 * arrive either bare or wrapped, and `memory-rules.mjs` carried a table of the
 * four keys the wrapper might use — read under a key that is not there, a
 * carried rule reads as absent and stays uncorrected.
 *
 * The internal type is the **row array**. ⛔ A value that is neither an array
 * nor an envelope around one is untouched: `run/theme-radar-last`'s shape is
 * prose and fields rather than rules, and the false claim sits inside it either
 * way — that reading belongs to the leaf, which matches it as one value.
 *
 * ⛔ Nothing is added, dropped or reordered. The envelope's other fields are
 * left behind because the rows are what the caller asked about; a value read
 * this way is never written back — `refutedMemoryRules` returns retractions,
 * not a replacement record.
 */
export const MEMORY_ROW_FIELDS = Object.freeze(['patterns', 'rows', 'entries', 'failures'])

export const memoryRows = at((value) => {
  if (Array.isArray(value) || !isRecord(value)) return null
  for (const field of MEMORY_ROW_FIELDS) {
    if (Array.isArray(value[field])) return { value: value[field] }
  }
  return null
})

/**
 * The one entrance. `operation` selects the row and the row names its
 * conversions; an operation that names none is handed back the input it arrived
 * with, unchanged and with no diagnostics.
 */
export function canonicalizeInput(row, input) {
  if (!row?.canonical || !isRecord(input)) return { input, diagnostics: [] }
  return row.canonical(input)
}
