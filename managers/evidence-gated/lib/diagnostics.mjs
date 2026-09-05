import { METHODOLOGY } from './constants.mjs'

export const RULE_VERSION = 'ega-1.0.0'

/**
 * The one manager id this package publishes.
 *
 * It was three (`evidence-gated-kr`, `-us`, `-global`) until 2026-08-27; the
 * market roles are now subagent flows of a single manager, so anything that
 * used to key behaviour off a package id keys it off `MANAGER_ID` plus a flow.
 */
export const MANAGER_ID = 'evidence-gated'

/**
 * The flows this manager dispatches, and the markets each sleeve owns.
 *
 * One vocabulary, here, because three things key off it and they were keying
 * off three copies: `sizing.mjs` owns lane enforcement, `schedule.mjs` mints the
 * per-market reviews, and `PROMPT.md` dispatches. A flow name added to one and
 * not the others is a wake nothing answers — which is the failure #87 records,
 * one layer down.
 */
export const SLEEVE_FLOW_MARKETS = { 'kr-sleeve': ['XKRX'], 'us-sleeve': ['XNAS', 'XNYS'] }
export const ALLOCATOR_FLOW = 'allocate'
export const DISPATCHABLE_FLOWS = [...Object.keys(SLEEVE_FLOW_MARKETS), ALLOCATOR_FLOW]

export function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function round(value, digits = 8) {
  if (!finite(value)) return null
  const scale = 10 ** digits
  return Math.round((value + Number.EPSILON) * scale) / scale
}

export function diagnostic(code, severity, message, path, details = {}) {
  return { code, severity, message, ...(path ? { path } : {}), details }
}

/**
 * ── The general rule: a carried collection is never smaller on the way out ──
 *
 * ⚠️ **Two operations lost a run's durable state the same way, and neither
 * said anything.** (#136, #137) `signalPaper` read `state.openWindows` while
 * `PROMPT.md` §5 read as though the windows arrived at the top level, and
 * `reconcileArmedReviews` read `previous.armed` while §4 named neither
 * parameter — so both were handed the collection under a key they do not read,
 * both saw an empty carry, and both returned a `nextState` that was the erasure
 * of it. Then both prompts say to write that `nextState` back **verbatim**, so
 * the erasure is committed by a run following canon exactly.
 *
 * Making the two functions read their input correctly is not the whole fix,
 * because the *next* caller who gets the shape wrong is told nothing again. So
 * the invariant is stated once, here, and both sites assert it: **whatever went
 * in comes back out, minus only what this run can name a reason for.** A
 * `nextState` that is silently smaller than the collection it was built from is
 * a loss of record, and a loss of record is `blocked` — not `unevaluated`,
 * because there is no reading of it under which writing that state is correct.
 *
 * `accountedFor` is the reasons: a matured paper window, a review whose instant
 * has passed. Anything else that went missing is the bug this catches.
 *
 * ⛔ It does not catch the misplaced *input* — nothing here can see a key that
 * was never read. Each caller rejects the shapes it knows are wrong; this
 * catches the loss whatever caused it.
 */
export function stateLoss({ code, path, before = [], after = [], accountedFor = [], message }) {
  const kept = new Set(after)
  const excused = new Set(accountedFor)
  const lost = [...new Set(before)].filter((id) => id !== null && id !== undefined && !kept.has(id) && !excused.has(id))
  if (!lost.length) return null
  return diagnostic(code, 'blocked', message, path, { lost, carriedIn: before.length, carriedOut: after.length })
}

export function missing(code, path, message = `Required value is missing: ${path}`) {
  return diagnostic(code, 'unevaluated', message, path)
}

export function result(operation, asOf, data, diagnostics = [], meta = {}) {
  const status = diagnostics.some((item) => item.severity === 'blocked')
    ? 'blocked'
    : diagnostics.some((item) => item.severity === 'unevaluated')
      ? 'unevaluated'
      : 'ok'
  return {
    spec: 'EvidenceGatedMetrics/1',
    ruleVersion: RULE_VERSION,
    operation,
    asOf,
    status,
    data,
    diagnostics,
    meta,
  }
}

export function requireInstant(value, path, diagnostics) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    diagnostics.push(missing('instant_missing_or_invalid', path))
    return null
  }
  return value
}

export function requireArray(value, path, diagnostics) {
  if (!Array.isArray(value)) {
    diagnostics.push(missing('array_missing_or_invalid', path))
    return []
  }
  return value
}

export function requireNumber(value, path, diagnostics, { minimum, maximum } = {}) {
  if (!finite(value)) {
    diagnostics.push(missing('number_missing_or_invalid', path))
    return null
  }
  if (minimum !== undefined && value < minimum) {
    diagnostics.push(diagnostic('number_below_minimum', 'blocked', `${path} is below ${minimum}`, path, { value, minimum }))
    return null
  }
  if (maximum !== undefined && value > maximum) {
    diagnostics.push(diagnostic('number_above_maximum', 'blocked', `${path} is above ${maximum}`, path, { value, maximum }))
    return null
  }
  return value
}

/**
 * Grandfathering, read from one place rather than hardcoded twice.
 *
 * `config.grandfather` was declared in `config.schema.json`, shown to the
 * investor, recorded as ported in `MIGRATION.md` — and read by nothing. Two
 * places carried their own copy of the idea instead: `portfolioHeat` warned on
 * a book already over its cap, and `harnessAudit` did the opposite and turned
 * an inherited position into a blocker.
 *
 * The concept is one sentence and it belongs in one place: **existing exposure
 * is carried and new exposure is not.** `concentration` reads it for the weight
 * caps and `harnessAudit` reads it for positions no decision explains, so the
 * two can never disagree about the tolerance.
 *
 * ⚠️ **It stopped being a setting in #133.** *"Should an inherited breach be
 * carried or forced out today?"* is a claim this methodology makes — the whole
 * argument for it is written in `concentration`, and an investor was being
 * asked to overrule that argument from an install screen with nothing beside it
 * to reason from. `METHODOLOGY.grandfather` is the answer now. The argument
 * still takes an override so the blunt reading stays reachable from the
 * verifier; ⛔ no flow skill names it, and a run passes none.
 */
export const GRANDFATHER_DEFAULTS = METHODOLOGY.grandfather

export function grandfatherPolicy(config = {}) {
  const declared = config?.grandfather ?? {}
  return {
    enabled: typeof declared.enabled === 'boolean' ? declared.enabled : GRANDFATHER_DEFAULTS.enabled,
    blocksNewNonCoreWhenBreached:
      typeof declared.blocksNewNonCoreWhenBreached === 'boolean'
        ? declared.blocksNewNonCoreWhenBreached
        : GRANDFATHER_DEFAULTS.blocksNewNonCoreWhenBreached,
  }
}
