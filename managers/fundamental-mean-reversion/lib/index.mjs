/**
 * One entry point over this package's arithmetic.
 *
 *   execute({ operation, asOf, input }) → { status, operation, asOf, …, diagnostics }
 *
 * ── What belongs in here and what does not ────────────────────────────────
 *
 * The catalogue's default is prose, and this package keeps it: what a fall
 * means, whether a business is intact, which assumption the market
 * over-extrapolated and what the thesis is are all written in `PROMPT.md` and in
 * `skills/`. What is here is the small set of things #259 and #256 require to be
 * **checkably** right rather than model-judged — the price normalisation and the
 * state read from it, the stabilisation test, the target derivation, the sizing
 * arithmetic including the fact that a stop is not a fill, the staged ledger, and
 * the case classification the fixtures assert.
 *
 * ⚠️ **Every operation is pure.** No clock, no network, no filesystem, no
 * `process`. `asOf` is an argument because it is a fact about the invocation, and
 * a function that read the wall clock instead would produce a different answer on
 * a replay of the same day.
 *
 * **The protocol is not here.** How to answer in AMP/1 — which tool submits, what
 * a `DecisionProposal` looks like, which action takes which target — is published
 * by the Aumos MCP server from `initialize`, once per session, as
 * `decision_submit`'s own input schema.
 */
import { THRESHOLDS, diagnostic } from './core.mjs'
import { adjustmentBasis, discoveryState, normalizeBars, technicalState } from './prices.mjs'
import { stabilisation } from './stabilisation.mjs'
import { reversionTarget } from './reversion.mjs'
import { positionSizing } from './sizing.mjs'
import { applyStage, stagedPlanState } from './staged-plan.mjs'
import { classifyCase } from './classify.mjs'

export { THRESHOLDS, DIAGNOSIS_CODES, OUTCOMES, VERDICT_ACTIONS, diagnostic, finite, round } from './core.mjs'
export * from './prices.mjs'
export * from './stabilisation.mjs'
export * from './reversion.mjs'
export * from './sizing.mjs'
export * from './staged-plan.mjs'
export * from './classify.mjs'

export const OPERATIONS = Object.freeze([
  'priceState',
  'stabilisation',
  'reversionTarget',
  'positionSizing',
  'stagedPlan',
  'classifyCase',
])

export function execute(call = {}) {
  const { operation, asOf, input = {} } = call
  const wrap = (result) => ({ operation, asOf, status: result.status ?? 'ok', ...result })

  if (!OPERATIONS.includes(operation)) {
    return { operation: operation ?? null, asOf: asOf ?? null, status: 'refused', diagnostics: [diagnostic('operation_unknown', 'blocked', `This package publishes ${OPERATIONS.join(', ')} and nothing else`, 'operation', { operation: operation ?? null })] }
  }
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) {
    return { operation, asOf: asOf ?? null, status: 'refused', diagnostics: [diagnostic('as_of_missing', 'blocked', 'Every call carries the invocation\'s asOf verbatim. There is no default and a call without one is refused', 'asOf', { asOf: asOf ?? null })] }
  }

  if (operation === 'priceState') {
    const diagnostics = []
    const basis = adjustmentBasis(input.series ?? input, diagnostics)
    const normalised = normalizeBars(input.series?.rows ?? input.rows ?? input.bars, asOf)
    diagnostics.push(...normalised.diagnostics)
    const state = technicalState(normalised.bars)
    return wrap({
      status: diagnostics.some((row) => row.severity === 'blocked') ? 'refused' : 'ok',
      adjustmentBasis: basis,
      bars: normalised.bars.length,
      technical: state,
      discovery: discoveryState(state),
      thresholds: { discovery: THRESHOLDS.discovery, integrity: THRESHOLDS.integrity, history: THRESHOLDS.history },
      diagnostics,
    })
  }

  if (operation === 'stabilisation') {
    const diagnostics = []
    const normalised = normalizeBars(input.series?.rows ?? input.rows ?? input.bars, asOf)
    diagnostics.push(...normalised.diagnostics)
    const state = technicalState(normalised.bars)
    const result = stabilisation(normalised.bars, state)
    return wrap({ status: result.outcome === 'data-missing' ? 'refused' : 'ok', ...result, diagnostics: [...diagnostics, ...result.diagnostics] })
  }

  if (operation === 'reversionTarget') {
    const normalised = normalizeBars(input.series?.rows ?? input.rows ?? input.bars, asOf)
    const state = technicalState(normalised.bars)
    return wrap(reversionTarget({ ...input, bars: normalised.bars, state }))
  }

  if (operation === 'positionSizing') {
    const normalised = normalizeBars(input.series?.rows ?? input.rows ?? input.bars, asOf)
    return wrap(positionSizing({ ...input, bars: normalised.bars }))
  }

  if (operation === 'stagedPlan') {
    if (input.stageId === undefined || input.stageId === null) {
      return wrap({ status: 'ok', state: stagedPlanState(input.plan, asOf), diagnostics: [] })
    }
    return wrap(applyStage({ ...input, asOf }))
  }

  const classified = classifyCase({ ...input, asOf })
  return wrap({ status: classified.code === null ? 'ok' : 'refused', ...classified })
}
