/**
 * The four words this package is allowed to fail in, and the arithmetic
 * helpers everything else here shares.
 *
 * ── Why the vocabulary is a table and not a string ─────────────────────────
 *
 * #256 asks for four states to stay apart — `data_missing`,
 * `research_incomplete`, `thesis_refuted`, `risk_limit_exceeded` — and #254
 * already owns the reason: **absence is not refutation.** A run that could not
 * read a filing and a run that read one saying the opposite of the thesis are
 * two different findings, and the only thing that has ever kept them apart is
 * somebody remembering which word to type. So they are a closed set with a
 * `lane` on each, and `isRefutation()` is a lookup rather than a judgement.
 *
 * ⛔ **Nothing here may add a cause at run time.** A code that is not in
 * `CAUSE_CODES` is refused by `cause()`, because a vocabulary that grows when a
 * caller is in a hurry is a vocabulary a ledger cannot group by.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/diagnostics.mjs`** — `round`,
 * `finite` and the `{code, severity, message, path, details}` record shape are
 * that file's, taken because they are arithmetic and a record shape rather than
 * policy. What is *not* taken is its cause registry: that one is keyed to
 * evidence-gated's own lanes and gates, and this package's four are #256's.
 */

const DIGITS = 8

export const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/** Half-up to eight places, so a weight compared against a fixture is stable. */
export function round(value, digits = DIGITS) {
  if (!finite(value)) return null
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

export const SEVERITIES = Object.freeze(['blocked', 'unevaluated', 'note'])

/**
 * The closed vocabulary, with the lane that decides what a reader may conclude
 * from it.
 *
 * | lane | what it means | what it may **not** be read as |
 * |---|---|---|
 * | `absence` | the run did not get to an answer | evidence against the thesis |
 * | `refutation` | the run got an answer and it contradicts the thesis | a reason to look again later |
 * | `limit` | the thesis stands and the size does not | a refutation |
 */
export const CAUSE_CODES = Object.freeze({
  data_missing: { lane: 'absence', severity: 'blocked' },
  research_incomplete: { lane: 'absence', severity: 'unevaluated' },
  thesis_refuted: { lane: 'refutation', severity: 'blocked' },
  risk_limit_exceeded: { lane: 'limit', severity: 'blocked' },
})

export const CAUSE_LANES = Object.freeze(['absence', 'refutation', 'limit'])

/** True only for lane `refutation`. Read where a run is about to close a position. */
export function isRefutation(code) {
  return CAUSE_CODES[code]?.lane === 'refutation'
}

/**
 * One of the four, with the sentence that says which fact produced it.
 *
 * `path` names the input the finding is about, so a reader can go and look at
 * the same number rather than at a summary of it.
 */
export function cause(code, message, path, details = {}) {
  const registered = CAUSE_CODES[code]
  if (registered === undefined) {
    throw new Error(
      `${code} is not one of the four causes this package may report — ` +
        `${Object.keys(CAUSE_CODES).join(', ')}. A fifth word is a ledger column nobody can group by`,
    )
  }
  return {
    code,
    lane: registered.lane,
    severity: registered.severity,
    message,
    ...(path ? { path } : {}),
    details,
  }
}

/** A finding that is not one of the four: a mechanical defect in an input. */
export function diagnostic(code, severity, message, path, details = {}) {
  if (!SEVERITIES.includes(severity)) throw new Error(`unknown severity ${severity}`)
  return { code, severity, message, ...(path ? { path } : {}), details }
}

export const blocked = (rows) => rows.some((row) => row.severity === 'blocked')

/** RFC 3339 in, epoch milliseconds out. A number is already an instant. */
export function instantOf(value) {
  if (finite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const DAY_MS = 86_400_000
