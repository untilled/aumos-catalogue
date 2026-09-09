/**
 * ── The prices this methodology already worked to, as a stated field (#756) ──
 *
 * Two numbers this package computes every run had nowhere to go. `exitDiscipline`
 * derives a stop distance from the Mandate's `maxDrawdown` and turns it into a
 * `stopLevel`; `entryTranchePlan` holds a ladder whose rungs are prices. Both
 * left the run only one way to say them out loud: a `price-below` watch and an
 * opaque `intent` string. So the host received a level and could not tell an
 * entry from a stop — `untilled/aumos#756` opens with exactly that, and
 * `untilled/aumos#758` answered it with `DecisionProposal.priceLevels`, where
 * `purpose` is **stated and never inferred**.
 *
 * ⛔ **A level is not an order and this file cannot make one.** There is no
 * quantity here, no side, no venue, no time-in-force — AMP has no slot for any
 * of them beside a level, and `containsExecutionIntent` scans for them. Writing
 * a price down arms nothing: `armedKey` links a level to a watch this same
 * proposal already carries, and a level with no `armedKey` is recorded and
 * watched by nothing. That is the normal case and the point of the issue.
 *
 * ── Why the pair is built here rather than copied by the run ───────────────
 *
 * The host checks a link rather than trusting it: a linked watch must name the
 * same asset and a price the level contains (`priceLevelLinkProblems`, five
 * codes). A run that wrote the watch's `Money` in one place and the level's in
 * another would be answering the same question twice, and the two answers drift
 * on the first rounding disagreement — which is the shape this repository has
 * measured often enough to have a name for. So `stopRegistration` returns the
 * watch **and** the level from one call, holding **one** `Money` object, and the
 * `key` that joins them is minted here. ⚠️ The run copies the pair; it never
 * assembles it.
 *
 * ── Major units in, `Money` out, and nothing rounded to a cent ─────────────
 *
 * This package counts in major units everywhere (`canonical-input.mjs` converts
 * an inbound `Money` on the way in and says so). This is the one place the
 * conversion runs the other way, and it is the direction where precision is
 * actually at stake: a stop is a **rate**, not a book amount, and
 * `untilled/aumos#581` separated the two for this reason. `exponent` is chosen
 * to represent the number that was computed — never the currency's minor unit
 * when that would lose a digit — and it is omitted when the two agree, which is
 * the normal form the host writes.
 *
 * ⛔ **A value that will not fit is refused, not rounded.** AMP's ceiling is 12
 * decimals; below that there is no exponent that survives the round trip, and
 * quietly rounding a level is quietly moving the price the investor is shown.
 *
 * ── The currency comes from the market, as it does everywhere here ─────────
 *
 * `MARKET_CURRENCIES` already owns this answer and already cites the host's own
 * rule (`untilled/aumos#689`): a level belongs to the currency the asset is
 * quoted in, and a run that could name the funding currency itself could name
 * the wrong one. ⛔ Not `mandate.constraints.baseCurrency` and not
 * `portfolio.baseCurrency` — those two may disagree and both be right.
 */
import { CURRENCY_MINOR_DIGITS } from './canonical-input.mjs'
import { MARKET_CURRENCIES, diagnostic, finite } from './diagnostics.mjs'

/** AMP's three, verbatim. `purpose` is stated; nothing here derives it. */
export const PRICE_LEVEL_PURPOSES = Object.freeze(['entry', 'stop', 'take-profit'])

/** AMP's ceiling on `Money.exponent`. A level needing more decimals is refused. */
export const PRICE_LEVEL_MAX_EXPONENT = 12

/** AMP's ceiling on `watches[].key` / `priceLevels[].armedKey`. */
export const ARMED_KEY_MAX_LENGTH = 128

/**
 * The host's own defect and link vocabularies, spelled the host's way.
 *
 * ⚠️ **Two vocabularies meet here and neither is translated.** This package's
 * diagnostics are snake case and the host's codes are kebab case, so the
 * diagnostic is ours (`price_level_defective`) and `details.defects` carries
 * the host's spellings — the ones a reviewer will read in `untilled/aumos`
 * beside `priceLevelDefects` and `priceLevelLinkProblems`. Inventing a second
 * spelling for the same finding is how the two stop being comparable.
 */
export const PRICE_LEVEL_DEFECTS = Object.freeze([
  'non-positive-price',
  'band-currency-mismatch',
  'band-inverted',
  'asset-currency-mismatch',
])

export const PRICE_LEVEL_LINK_PROBLEMS = Object.freeze([
  'duplicate-armed-key',
  'dangling-armed-key',
  'armed-not-a-price-watch',
  'armed-asset-mismatch',
  'armed-price-mismatch',
])

/** The trigger kinds a level may be linked to. The host reads no other. */
const PRICE_TRIGGER_KINDS = new Set(['price-below', 'price-above'])

/**
 * A watch row's price trigger, in AMP's spelling, from either spelling.
 *
 * ⚠️ **This package writes a watch flat and AMP nests it, and both are read.**
 * `validateWatch` and `watchesToRegister` speak `{ kind, threshold }` at the top
 * level; `WatchProposal` speaks `{ intent, trigger: { kind, asset, price } }`.
 * A run assembling the proposal translates one into the other, so a link check
 * that only understood AMP's shape would report `armed-not-a-price-watch`
 * against this package's **own** rows — measured: `exitDiscipline`'s pair failed
 * its own fold on the first attempt.
 *
 * ⛔ It reads and never rewrites: `priceLevelSet` returns the levels, not the
 * watches, so nothing here decides what the proposal's `watches` look like.
 * That translation stays the run's, exactly as `watchesToRegister` always was.
 */
function armedTrigger(row) {
  if (row?.trigger !== null && typeof row?.trigger === 'object') return row.trigger
  if (!PRICE_TRIGGER_KINDS.has(row?.kind)) return row?.kind === undefined ? null : { kind: row.kind }
  const asset = row?.asset ?? null
  const price = isMoney(row?.price)
    ? row.price
    : priceLevelMoney(row?.threshold, assetCurrency(asset)).money
  return { kind: row.kind, ...(asset ? { asset } : {}), ...(price ? { price } : {}) }
}

/**
 * The smallest exponent that represents `amount` exactly, or `null`.
 *
 * ⚠️ Float noise is why the comparison has a tolerance and why the tolerance is
 * relative: `94.123456 * 1e6` is `94123456.00000001`, and an absolute epsilon
 * that accepts that also accepts a genuine 13th decimal on a large number.
 */
function exactExponent(amount) {
  for (let exponent = 0; exponent <= PRICE_LEVEL_MAX_EXPONENT; exponent += 1) {
    const scaled = amount * 10 ** exponent
    if (!Number.isFinite(scaled)) return null
    const tolerance = Math.max(1e-9, Math.abs(scaled) * 1e-12)
    if (Math.abs(scaled - Math.round(scaled)) <= tolerance) return exponent
  }
  return null
}

/**
 * A number of major units as AMP's `Money`, or `null` with the reason.
 *
 * `{ money }` on success; `{ reason }` on refusal, where the reason is a code
 * this package's callers turn into a diagnostic. ⛔ Never a rounded answer and
 * never a substituted currency — the two silent failures `moneyAmount` refuses
 * on the way in, refused the same way on the way out.
 */
export function priceLevelMoney(amount, currency) {
  if (!finite(amount)) return { money: null, reason: 'amount-unread' }
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return { money: null, reason: 'currency-unread' }
  const minorDigits = CURRENCY_MINOR_DIGITS[currency]
  if (!Number.isFinite(minorDigits)) return { money: null, reason: 'currency-uncountable' }
  const exact = exactExponent(amount)
  if (exact === null) return { money: null, reason: 'unrepresentable' }
  const exponent = Math.max(minorDigits, exact)
  const minorUnits = Math.round(amount * 10 ** exponent)
  if (!Number.isSafeInteger(minorUnits)) return { money: null, reason: 'unrepresentable' }
  return {
    /**
     * ⚠️ `exponent` omitted when it equals the currency's own minor unit. That
     * is the host's normal form (`untilled/aumos#581`), and a `Money` written
     * the long way is a different set of bytes for the same value — which is
     * one canonical JSON away from a different Decision hash.
     */
    money: { currency, minorUnits, ...(exponent === minorDigits ? {} : { exponent }) },
    reason: null,
  }
}

/** The currency an asset is quoted in, derived from its market and never declared. */
export function assetCurrency(asset) {
  if (typeof asset?.currency === 'string') return asset.currency
  return MARKET_CURRENCIES[asset?.market] ?? null
}

/**
 * An expiry as AMP's `Instant`, or `null`.
 *
 * ⚠️ **AMP has no date-only instant and this package counts in calendar days.**
 * `instantSchema`'s pattern requires a time and a zone, so `2026-09-27` — which
 * is what the exit window is expressed in here, and what `watchesToRegister`
 * has always carried — is not a value the wire accepts. Expanding it to the
 * **start** of that day is the reading that cannot claim more than the package
 * meant: a level that stops standing earlier stops making a claim, and the one
 * boundary that matters was already avoided upstream (the window is the day
 * *after* the time stop, so start-of-day is still past it).
 *
 * ⛔ Anything that is neither an instant nor a calendar day is dropped rather
 * than guessed — an unparseable expiry silently becomes «stands until replaced»,
 * which is the field's own documented meaning for absence.
 */
export function priceLevelExpiry(value) {
  if (typeof value !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))) return `${value}T00:00:00Z`
  return null
}

const isMoney = (value) => value !== null
  && typeof value === 'object'
  && typeof value.currency === 'string'
  && Number.isInteger(value.minorUnits)

const moneyExponent = (money) => (Number.isFinite(money?.exponent)
  ? money.exponent
  : CURRENCY_MINOR_DIGITS[money?.currency])

/** A `Money` back in major units, for comparison only. `null` when uncountable. */
export function moneyMajor(money) {
  if (!isMoney(money)) return null
  const digits = moneyExponent(money)
  return Number.isFinite(digits) ? money.minorUnits / 10 ** digits : null
}

/**
 * Two `Money` compared at the finer of the two units, the way the host does
 * (`compareMoney`, `untilled/aumos#581`). ⛔ Never `minorUnits` raw: a
 * threshold written in cents and a price written to seven places compare
 * backwards that way, and that is the defect that made `price-below` always
 * fire.
 */
export function sameMoney(left, right) {
  if (!isMoney(left) || !isMoney(right) || left.currency !== right.currency) return false
  const a = moneyMajor(left)
  const b = moneyMajor(right)
  if (a === null || b === null) return false
  return Math.abs(a - b) <= Math.max(1e-12, Math.abs(a) * 1e-12)
}

/** Whether a level's own price region holds `money`. A point holds one price. */
export function priceLevelContains(level, money) {
  if (level?.price?.kind === 'point') return sameMoney(level.price.value, money)
  if (level?.price?.kind !== 'band') return false
  const low = moneyMajor(level.price.low)
  const high = moneyMajor(level.price.high)
  const value = moneyMajor(money)
  if (low === null || high === null || value === null) return false
  if (level.price.low.currency !== money?.currency || level.price.high.currency !== money?.currency) return false
  return value >= low - 1e-12 && value <= high + 1e-12
}

const sameAsset = (left, right) => ['class', 'symbol', 'market', 'currency']
  .every((field) => (left?.[field] ?? null) === (right?.[field] ?? null))

/**
 * One level's own defects, in the host's spellings.
 *
 * ⛔ **«a stop is below the entry» is not here and must not be.** The host
 * refused to write that rule and gave the reason: it is false for a short, for
 * a hedge leg and for a staged entry band, and neither the host nor this
 * operation knows the strategy or the position's direction. What is checked is
 * what is checkable without knowing either.
 */
export function priceLevelDefects(level) {
  const defects = []
  const price = level?.price
  const currency = assetCurrency(level?.asset)
  if (price?.kind === 'point') {
    const major = moneyMajor(price.value)
    if (major === null || major <= 0) defects.push('non-positive-price')
    if (currency !== null && isMoney(price.value) && price.value.currency !== currency) defects.push('asset-currency-mismatch')
  } else if (price?.kind === 'band') {
    const low = moneyMajor(price.low)
    const high = moneyMajor(price.high)
    if (low === null || low <= 0 || high === null || high <= 0) defects.push('non-positive-price')
    if (isMoney(price.low) && isMoney(price.high) && price.low.currency !== price.high.currency) defects.push('band-currency-mismatch')
    if (low !== null && high !== null && low > high) defects.push('band-inverted')
    if (currency !== null && isMoney(price.low) && price.low.currency !== currency) defects.push('asset-currency-mismatch')
  }
  return defects
}

/**
 * The five link problems, computed over the proposal's own rows.
 *
 * ⚠️ **The host reports these and does not refuse them on the run path.** A
 * proposal is sealed verbatim, so a level whose link did not resolve is
 * recorded with the link unresolved and the run is told afterwards
 * (`priceLevelDiagnostics`). Afterwards is too late to fix it, so the same
 * question is asked here — before `decision_submit` — where the answer is still
 * actionable.
 */
export function priceLevelLinkProblems({ priceLevels = [], watches = [], plans = [] } = {}) {
  const problems = []
  const armed = [...(Array.isArray(watches) ? watches : []), ...(Array.isArray(plans) ? plans : [])]
  /**
   * ⚠️ **`watches` then `plans`, concatenated, and the host does the same.** A
   * key claimed on both sides is a duplicate rather than a precedence rule —
   * `armedProposals` deliberately has no winner, because the thing to do about
   * two rows with one address is rename one.
   */
  const seen = new Map()
  const duplicated = new Set()
  for (const [index, row] of armed.entries()) {
    const key = row?.key
    if (typeof key !== 'string' || key === '') continue
    if (seen.has(key)) {
      duplicated.add(key)
      problems.push({ code: 'duplicate-armed-key', key, path: `armed[${index}].key` })
      continue
    }
    seen.set(key, row)
  }
  for (const [index, level] of (Array.isArray(priceLevels) ? priceLevels : []).entries()) {
    const key = level?.armedKey
    if (typeof key !== 'string' || key === '') continue
    const path = `priceLevels[${index}].armedKey`
    /**
     * ⚠️ A level pointing at a duplicated key is **not** reported again, the
     * way the host does not report it: the finding is the duplicate, and
     * judging the level against whichever row happened to be read first would
     * name the wrong row as the thing to fix.
     */
    if (duplicated.has(key)) continue
    const row = seen.get(key)
    if (row === undefined) {
      problems.push({ code: 'dangling-armed-key', key, path })
      continue
    }
    const trigger = armedTrigger(row)
    if (!PRICE_TRIGGER_KINDS.has(trigger?.kind)) {
      problems.push({ code: 'armed-not-a-price-watch', key, path, kind: trigger?.kind ?? null })
      continue
    }
    /**
     * ⛔ `trigger.asset` and never `subject`. A price trigger carries its own
     * asset and the host compares that one; falling back to `subject` would
     * pass a pair the host then reports as `armed-asset-mismatch`.
     */
    if (!sameAsset(trigger.asset ?? null, level.asset ?? null)) {
      problems.push({ code: 'armed-asset-mismatch', key, path })
      continue
    }
    if (!priceLevelContains(level, trigger.price ?? null)) {
      problems.push({ code: 'armed-price-mismatch', key, path })
    }
  }
  return problems
}

/**
 * One level, built or refused.
 *
 * `{ level, diagnostics }`. A level that could not be built is `null` and the
 * diagnostics say which half was missing — ⛔ never a level with a guessed
 * price and never one with a placeholder reason. `reason` is the manager's own
 * words and the host carries it verbatim to the person whose money this is; a
 * string that restates the field name is worse than an honest refusal, because
 * it reaches that person looking like an argument.
 */
export function buildPriceLevel({
  purpose = null,
  asset = null,
  point = null,
  low = null,
  high = null,
  reason = null,
  thesisRefs = null,
  expiresAt = null,
  armedKey = null,
  path = 'priceLevels',
} = {}) {
  const diagnostics = []
  const refuse = (code, message, at = path, details = {}) => {
    diagnostics.push(diagnostic(code, 'blocked', message, at, details))
    return { level: null, diagnostics }
  }
  if (!PRICE_LEVEL_PURPOSES.includes(purpose)) {
    return refuse('price_level_purpose_unstated', 'A level states what the price is for; Aumos infers a purpose from nothing — not from price-below versus price-above, not from whether the position is held', `${path}.purpose`, { purpose, supported: [...PRICE_LEVEL_PURPOSES] })
  }
  if (typeof asset?.symbol !== 'string' || asset.symbol === '' || typeof asset?.class !== 'string') {
    return refuse('price_level_asset_incomplete', 'A level names the asset in full; the same symbol is two assets on two boards and a level filed against a bare symbol cannot be matched to a holding without guessing', `${path}.asset`, { asset })
  }
  const currency = assetCurrency(asset)
  if (currency === null) {
    return refuse('price_level_currency_unknown', 'The currency a level belongs to is the one the asset is quoted in, derived from its market; this market is not one this package holds a currency for', `${path}.asset.market`, { market: asset?.market ?? null, supported: Object.keys(MARKET_CURRENCIES) })
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    return refuse('price_level_reason_missing', 'A level carries why this price, in the manager\'s own words; it is read beside the number by the investor and a blank one reaches them looking like an argument', `${path}.reason`, {})
  }
  const banded = point === null
  if (banded && (!finite(low) || !finite(high))) {
    return refuse('price_level_price_unread', 'A level is a point price or a band with both ends; neither was given', `${path}.price`, { point, low, high })
  }
  const amounts = banded ? [low, high] : [point]
  const monies = []
  for (const amount of amounts) {
    const { money, reason: why } = priceLevelMoney(amount, currency)
    if (money === null) {
      return refuse(
        why === 'unrepresentable' ? 'price_level_unrepresentable' : 'price_level_price_unread',
        why === 'unrepresentable'
          ? 'This price needs more than the twelve decimals AMP carries, and it is refused rather than rounded — rounding a level moves the price the investor is shown'
          : 'A level price is a finite number of major units in a currency this package counts in',
        `${path}.price`,
        { amount, currency, cause: why },
      )
    }
    monies.push(money)
  }
  const expiry = priceLevelExpiry(expiresAt)
  const level = {
    purpose,
    asset: { class: asset.class, symbol: asset.symbol, ...(asset.market ? { market: asset.market } : {}), currency },
    price: banded ? { kind: 'band', low: monies[0], high: monies[1] } : { kind: 'point', value: monies[0] },
    reason: reason.trim(),
    ...(Array.isArray(thesisRefs) && thesisRefs.length ? { thesisRefs: thesisRefs.filter((ref) => typeof ref === 'string' && ref !== '') } : {}),
    ...(expiry === null ? {} : { expiresAt: expiry }),
    ...(typeof armedKey === 'string' && armedKey !== '' ? { armedKey: armedKey.slice(0, ARMED_KEY_MAX_LENGTH) } : {}),
  }
  const defects = priceLevelDefects(level)
  if (defects.length) {
    return refuse('price_level_defective', 'This level would be recorded as it is written and the host checks these four; an inverted band or a non-positive price is a line nobody can read', `${path}.price`, { defects })
  }
  return { level, diagnostics }
}

/** The marker that opens the `intent` of a stop this package registers. */
export const STOP_INTENT_PREFIX = 'exit-discipline'

/**
 * ── The `intent` a stop is armed with, and why the package writes it (#244) ─
 *
 * A promise is folded into the one already standing by comparing `kind`,
 * `subject`, **`intent`** and `trigger` as the bytes the manager wrote
 * (`untilled/aumos#704`), and the host ⛔ interprets none of them — that
 * strictness is the ruling, not an oversight. Reviews and tranches survived it
 * because their intents are minted here (`marketReviewIntent`,
 * `trancheIntent`) and armed verbatim. A stop had **nothing to copy**: the row
 * carried this package's `reason` and no `intent` at all, so the sentence was
 * the run's to compose, and a run composes it afresh every time.
 *
 * Measured in the owner's book, 2026-09-09: the same SGOV stop re-armed with a
 * byte-identical trigger and 162 characters of prose grown to 231, the new
 * sentence *naming the plan id the fold was meant to retire*. The explanation
 * of the fold prevented the fold, and `price-below` is not folded at firing
 * time either (#590, #593 and #624 all key on `at-time`), so what was left
 * standing was two live watches that open two wakes on one breach.
 *
 * ⛔ **So nothing about *this judgement* may enter it.** Not the plan being
 * replaced, not the price restated in words, not the arithmetic that produced
 * the level, not what the last close was. All of that is real and belongs to
 * `priceLevels[].reason` and `rationale`, which are read by the person whose
 * money this is and are not part of any identity. What is left is what the
 * condition *is*, which is the only thing that can be said the same way twice.
 *
 * ⛔ **And no number and no instant.** The price and the asset are already in
 * the trigger the host compares beside this string; a second spelling of either
 * is a second thing that has to agree, which is the other half of this same
 * issue. ⚠️ `marketReviewIntent` does carry its instant and that is not a
 * counter-example: `resolveWakeFlow` reads it back out of a fired event to tell
 * a late fire from a stale one. Nothing reads a stop's marker, so it carries
 * nothing it does not need.
 *
 * ⚠️ **English, like the other two markers, and deliberately not the run's
 * language.** The language a run writes prose in is the app's setting and is a
 * term of §24's fingerprint; an intent that followed it would split every fold
 * on this book the day the investor changed it.
 *
 * ⚠️ **The symbol alone, matching `armedKey`.** The board is in `trigger.asset`
 * and in `subject`, both of which the fold compares, so a marker qualified by
 * market would separate nothing the host does not already separate.
 */
export function stopIntent(symbol) {
  return `${STOP_INTENT_PREFIX}:hard-stop:${symbol} — the registered stop under this position; the price it watches and the asset it is about are the trigger's, and the arithmetic behind the level is the level's reason`
}

/**
 * The `intent` the unconditional time stop is armed with.
 *
 * ⚠️ **Here rather than beside the row it goes on.** The two stops are one
 * vocabulary and a second file holding half of it is a second place for the
 * marker to drift — which is the shape of the defect this whole note is about.
 *
 * ⛔ The instant is the trigger's, for the reason `stopIntent` gives, and the
 * time stop needs it stated even less: `at` is the entire condition.
 */
export function timeStopIntent(symbol) {
  return `${STOP_INTENT_PREFIX}:time-stop:${symbol} — the unconditional time stop this position was entered under; the instant it comes due is the trigger's own`
}

/**
 * The pair an entry's stop owes: the `price-below` watch, and the `stop` level
 * that names what that watch is watching.
 *
 * ⚠️ **One `Money`, two rows.** The watch and the level hold the identical
 * object, so `armed-price-mismatch` is not a defect this package can produce by
 * rounding differently in two places — it is unreachable by construction, and
 * `priceLevelLinkProblems` is what proves that rather than what prevents it.
 *
 * ⚠️ **`threshold` stays beside `price`.** `validateWatch` reads major units and
 * the host reads `Money`; dropping the major-units field would break this
 * package's own watch validation, and the two cannot disagree because both are
 * derived from `stopLevel` here.
 *
 * ⚠️ **The watch keeps the calendar day and the level carries an instant.** The
 * exit window is a day here and `validateWatch` reads it that way, while AMP's
 * `Instant` has no date-only form — so the level is expanded (see
 * `priceLevelExpiry`) and the watch is not. ⛔ The run still expands the watch's
 * own `expiresAt` when it writes the `WatchProposal`; that translation was
 * always the run's, and rewriting the row here would be this file deciding what
 * the proposal's `watches` look like.
 */
export function stopRegistration({
  symbol = null,
  asset = null,
  stopLevel = null,
  reason = null,
  expiresAt = null,
  thesisRefs = null,
  key = null,
} = {}) {
  const armedKey = typeof key === 'string' && key !== '' ? key : `stop:${symbol ?? asset?.symbol ?? 'unknown'}`
  const built = buildPriceLevel({
    purpose: 'stop',
    asset,
    point: stopLevel,
    reason,
    thesisRefs,
    ...(expiresAt ? { expiresAt } : {}),
    armedKey,
    path: 'priceLevels[stop]',
  })
  if (built.level === null) return { watch: null, level: null, diagnostics: built.diagnostics }
  return {
    watch: {
      kind: 'price-below',
      threshold: stopLevel,
      price: built.level.price.value,
      asset: built.level.asset,
      /**
       * ⚠️ **All four fields the host's fold reads, built here (#244).** The
       * row already held one `Money`; what it did not hold was the other three
       * things `samePromise` compares, so a run had to compose `intent`,
       * `subject` and the nested `trigger` for itself — and a stop re-armed by
       * a second run composed them differently. `subject` and `trigger.asset`
       * are the level's own `asset`, `trigger.price` is the level's own
       * `Money`, and `intent` is a function of the symbol. ⛔ The run copies
       * these; it does not build them.
       */
      subject: built.level.asset,
      intent: stopIntent(symbol ?? asset?.symbol ?? null),
      trigger: { kind: 'price-below', asset: built.level.asset, price: built.level.price.value },
      expiresAt,
      reason: 'exit-discipline-hard-stop',
      key: armedKey,
    },
    level: built.level,
    diagnostics: built.diagnostics,
  }
}

/**
 * The whole standing set, folded once and checked once.
 *
 * ⚠️ **The field replaces, it does not add** — the host's own words: *"a list
 * you send replaces every level you had standing on this book, so one you drop
 * is released and `[]` releases them all"*. So the set a run submits is every
 * level it still stands behind, not the ones this run happened to compute. That
 * is the same obligation `standingPlans` carries for promises
 * (`untilled/aumos#690`, `#704`) and it fails the same way: a run that submits
 * only what it recomputed silently releases the rest.
 *
 * ⛔ **Which is why omission is a case and not a mistake.** `null` in, `null`
 * out: a run that says nothing about levels leaves what was standing standing,
 * and this fold never turns that into `[]`. An empty array in is an explicit
 * release and is passed through as one.
 */
export function priceLevelSet({ levels = null, watches = [], plans = [] } = {}) {
  const diagnostics = []
  if (levels === null || levels === undefined) {
    return {
      data: {
        priceLevels: null,
        /** «said nothing» — the standing set is untouched. Not a release. */
        intent: 'unstated',
        count: null,
        byPurpose: null,
        linkProblems: [],
        candidateOnly: true,
      },
      diagnostics,
    }
  }
  if (!Array.isArray(levels)) {
    diagnostics.push(diagnostic('price_level_set_unreadable', 'blocked', 'The standing set is an array of levels, or it is absent; absence leaves what was standing standing and an empty array releases it, and those are three different statements', 'levels', { given: typeof levels }))
    return { data: { priceLevels: null, intent: null, count: null, byPurpose: null, linkProblems: [], candidateOnly: true }, diagnostics }
  }
  const kept = []
  for (const [index, row] of levels.entries()) {
    /**
     * A row that is already a built level passes through; anything else is
     * built here. ⚠️ Both paths end at `priceLevelDefects`, so a hand-written
     * level is judged exactly as a computed one is.
     */
    if (row?.price?.kind === 'point' || row?.price?.kind === 'band') {
      const defects = priceLevelDefects(row)
      if (defects.length) {
        diagnostics.push(diagnostic('price_level_defective', 'blocked', 'This level would be recorded as it is written and the host checks these four; an inverted band or a non-positive price is a line nobody can read', `levels[${index}].price`, { defects }))
        continue
      }
      if (!PRICE_LEVEL_PURPOSES.includes(row?.purpose)) {
        diagnostics.push(diagnostic('price_level_purpose_unstated', 'blocked', 'A level states what the price is for; Aumos infers a purpose from nothing', `levels[${index}].purpose`, { purpose: row?.purpose ?? null, supported: [...PRICE_LEVEL_PURPOSES] }))
        continue
      }
      if (typeof row?.reason !== 'string' || row.reason.trim() === '') {
        diagnostics.push(diagnostic('price_level_reason_missing', 'blocked', 'A level carries why this price, in the manager\'s own words', `levels[${index}].reason`, {}))
        continue
      }
      kept.push(row)
      continue
    }
    const built = buildPriceLevel({ ...row, path: `levels[${index}]` })
    diagnostics.push(...built.diagnostics)
    if (built.level !== null) kept.push(built.level)
  }
  const linkProblems = priceLevelLinkProblems({ priceLevels: kept, watches, plans })
  for (const problem of linkProblems) {
    diagnostics.push(diagnostic('price_level_link_unresolved', 'blocked', 'A level says it is the line a watch of this proposal watches, and the host checks that claim rather than trusting it — the watch has to be a price watch on the same asset at a price this level contains', problem.path ?? 'priceLevels', problem))
  }
  return {
    data: {
      priceLevels: kept,
      /** `stated` is a complete set; `released` is the explicit `[]`. */
      intent: kept.length === 0 ? 'released' : 'stated',
      count: kept.length,
      byPurpose: Object.fromEntries(PRICE_LEVEL_PURPOSES.map((purpose) => [purpose, kept.filter((row) => row.purpose === purpose).length])),
      linkProblems,
      /** ⛔ A field of one proposal the investor still approves, never an order. */
      candidateOnly: true,
    },
    diagnostics,
  }
}
