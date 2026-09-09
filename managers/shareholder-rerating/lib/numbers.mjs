/**
 * The helpers every other module in this directory needs, and nothing else.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/diagnostics.mjs`** — `finite`,
 * `round` and the `{ code, severity, message, path, details }` diagnostic row are
 * that module's shapes, copied because this package may not import across package
 * directories: the published artifact is a path→contents map rooted at
 * `managers/shareholder-rerating/`, and a relative path leaving it does not survive
 * publication. What was left behind is everything policy-shaped in that file — the
 * KRW/USD sleeve table, `convertCurrency`, `grandfatherPolicy`, the cause-code
 * registry — because those are the evidence-gated methodology's decisions and not
 * this one's.
 *
 * ⛔ **`severity` is a closed vocabulary here and it is four words**, because the
 * distinction #254 asked for is a severity distinction and nothing else in this
 * package can make it:
 *
 *   `blocked`      the finding refuses the path. Something was measured and it says no.
 *   `unevaluated`  the input needed to decide was not there. **This is not a refusal**,
 *                  and a caller that turns one into a refusal has recorded an absence
 *                  as evidence of deterioration.
 *   `warn`         it does not refuse, and the run has to say it out loud.
 *   `info`         true, reported, and it changes nothing.
 */

/** A number that can be used in arithmetic — `NaN`, `null` and `"0.3"` are not. */
export function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Rounded to `digits` places, so a fixture can assert an exact value.
 *
 * 8 places by default: portfolio weights are compared against a 1e-6 tolerance
 * two modules down, and rounding at the same order as the tolerance would make
 * the tolerance meaningless.
 */
export function round(value, digits = 8) {
  if (!finite(value)) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** One row of the answer's reasoning. `path` names the input that caused it. */
export function diagnostic(code, severity, message, path, details = {}) {
  return { code, severity, message, path, details }
}

/** Did anything in this list refuse? — `unevaluated` deliberately does not. */
export function isBlocked(diagnostics = []) {
  return diagnostics.some((row) => row.severity === 'blocked')
}

/** Was anything undecidable? The `data_missing` half of the #254 distinction. */
export function isUnevaluated(diagnostics = []) {
  return diagnostics.some((row) => row.severity === 'unevaluated')
}

/** Every value present and usable, or the names of the ones that are not. */
export function absentFields(object, names) {
  return names.filter((name) => !finite(object?.[name]))
}
