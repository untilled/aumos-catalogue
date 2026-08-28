export const RULE_VERSION = 'ega-1.0.0'

/**
 * The one manager id this package publishes.
 *
 * It was three (`evidence-gated-kr`, `-us`, `-global`) until 2026-08-27; the
 * market roles are now subagent flows of a single manager, so anything that
 * used to key behaviour off a package id keys it off `MANAGER_ID` plus a flow.
 */
export const MANAGER_ID = 'evidence-gated'

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
