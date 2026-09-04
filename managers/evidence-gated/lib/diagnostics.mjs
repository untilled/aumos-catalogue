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
