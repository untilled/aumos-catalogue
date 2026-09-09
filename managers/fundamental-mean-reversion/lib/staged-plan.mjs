/**
 * The staged plan, as a ledger rather than as a habit.
 *
 * ── Why a re-run is the dangerous case ─────────────────────────────────────
 *
 * A staged entry is a plan with a cumulative target, stage conditions, an expiry
 * and the id of the decision that opened it (#256). The failure it exists to
 * prevent is not a bad stage — it is the **second** good one: a run that wakes,
 * re-reads the same conditions, finds them still true, and adds again. Nothing
 * about that run looks wrong from inside it. What makes it wrong is a fact only
 * the ledger holds, so the ledger is what is consulted, and a stage is
 * identified by its `stageId` rather than by its conditions.
 *
 * ⛔ **No stage fires on price or elapsed time alone.** #259 forbids an
 * automatic add on a price or time condition during a fall, and this is where
 * that becomes checkable: a stage whose only satisfied conditions are of kind
 * `price` or `elapsed-time` is refused by name. Averaging down on a falling
 * price is the behaviour that turns a mean-reversion thesis into an unbounded
 * one, and it always arrives dressed as a rule that was written in advance.
 *
 * ⚠️ **Nothing here places or reports a fill.** Aumos Portfolio owns holdings
 * and executions; this ledger owns *what this manager has already proposed under
 * this plan*, which is instance-private aggregate state and the only part of the
 * story the host does not already hold.
 */
import { diagnostic, finite, round } from './core.mjs'

/** The condition kinds a stage may name, and which of them can carry a stage on their own. */
export const CONDITION_KINDS = Object.freeze({
  price: false,
  'elapsed-time': false,
  'stabilisation-held': true,
  'thesis-evidence': true,
  'earnings-confirmation': true,
  'target-reached': true,
})

/** What the plan has already committed, and what is left of its cumulative target. */
export function stagedPlanState(plan, asOf) {
  const stages = Array.isArray(plan?.stages) ? plan.stages : []
  const filled = Array.isArray(plan?.filled) ? plan.filled : []
  const filledIds = new Set(filled.map((row) => row.stageId))
  const committedWeight = round(filled.reduce((total, row) => total + (finite(row.weight) ? row.weight : 0), 0))
  const expiresAt = Date.parse(plan?.expiresAt)
  const now = Date.parse(asOf)
  return {
    planId: plan?.planId ?? null,
    decisionId: plan?.decisionId ?? null,
    symbol: plan?.symbol ?? null,
    plannedTotalWeight: plan?.plannedTotalWeight ?? null,
    stages: stages.map((stage) => ({ ...stage, filled: filledIds.has(stage.stageId) })),
    committedWeight,
    remainingWeight: finite(plan?.plannedTotalWeight) ? round(plan.plannedTotalWeight - committedWeight) : null,
    expired: Number.isFinite(expiresAt) && Number.isFinite(now) ? now > expiresAt : null,
    nextStage: stages.find((stage) => !filledIds.has(stage.stageId))?.stageId ?? null,
  }
}

/**
 * Record one stage against the plan, or refuse and say which rule refused it.
 *
 * `input`:
 *   `plan`      the ledger as it was last written
 *   `stageId`   the stage this run believes is due
 *   `asOf`      the invocation's instant
 *   `satisfied` the condition kinds this run observed to be true, as names
 *   `gate`      `{ thesisIntact, stabilisationOutcome, lossBudgetRemaining }`
 *
 * Returns `{ status, plan: nextPlan, ... }`. ⚠️ On a refusal the plan comes back
 * **unchanged rather than absent**, so a run that writes the answer back
 * verbatim — which is what every prompt here tells it to do — cannot erase its
 * own ledger by being refused.
 */
export function applyStage(input = {}) {
  const diagnostics = []
  const { plan, stageId, asOf, satisfied = [], gate = {} } = input
  const state = stagedPlanState(plan, asOf)
  const refuse = (code, message, path, details) => {
    diagnostics.push(diagnostic(code, 'blocked', message, path, details))
    return { status: 'refused', code, plan, state, diagnostics }
  }

  const stage = (Array.isArray(plan?.stages) ? plan.stages : []).find((row) => row.stageId === stageId)
  if (!stage) return refuse('stage_unknown', 'This plan has no stage with that id, and a stage that is not in the plan is not a stage of it', 'stageId', { stageId, stages: state.stages.map((row) => row.stageId) })

  if (state.stages.find((row) => row.stageId === stageId)?.filled) {
    return refuse(
      'stage_already_filled',
      'This stage is already in the ledger. A re-run that finds the same conditions still true is the ordinary case and it is not a second stage — the plan\'s cumulative target has not moved',
      'stageId',
      { stageId, committedWeight: state.committedWeight, plannedTotalWeight: state.plannedTotalWeight },
    )
  }
  if (state.expired === true) {
    return refuse('plan_expired', 'The plan\'s expiry has passed. An expired plan is re-judged in the open rather than continued quietly', 'plan.expiresAt', { expiresAt: plan?.expiresAt, asOf })
  }
  /**
   * ⛔ **An unreadable expiry is not the absence of one.** `state.expired` is
   * `null` when `expiresAt` does not parse, and only `=== true` refused — so a
   * plan with a missing or malformed expiry never expired, which is a standing
   * instruction to buy that outlives the reason it was written.
   */
  if (state.expired !== false) {
    return refuse(
      'plan_expiry_unstated',
      'The plan\'s expiry could not be read as an instant. A ladder with no readable expiry never expires, and every stage under it would keep firing after the thesis it belongs to has stopped being re-judged',
      'plan.expiresAt',
      { expiresAt: plan?.expiresAt ?? null, asOf },
    )
  }
  /**
   * ⛔ **And an unstated cumulative target is not an unlimited one.** The
   * ceiling check below was guarded by `finite(plannedTotalWeight) && …`, so a
   * plan that never stated its total skipped the comparison entirely and could
   * add for as long as it had stages.
   */
  if (!finite(state.plannedTotalWeight) || state.plannedTotalWeight <= 0) {
    return refuse(
      'staged_total_unstated',
      'The plan does not state a positive cumulative target weight, so there is no ceiling for a stage to be checked against. A staged entry is one decision with a total, not a decision to keep buying',
      'plan.plannedTotalWeight',
      { plannedTotalWeight: state.plannedTotalWeight },
    )
  }

  const kind = stage.kind ?? 'add'
  const satisfiedKinds = satisfied.filter((name) => Object.hasOwn(CONDITION_KINDS, name))
  const unknown = satisfied.filter((name) => !Object.hasOwn(CONDITION_KINDS, name))
  if (unknown.length > 0) {
    diagnostics.push(diagnostic('stage_condition_unknown', 'info', 'A condition kind this package does not read was ignored', 'satisfied', { unknown }))
  }
  if (satisfiedKinds.length === 0) {
    return refuse('stage_conditions_unmet', 'No condition of this stage was observed to be true', 'satisfied', { stageId })
  }
  const carrying = satisfiedKinds.filter((name) => CONDITION_KINDS[name])
  if (carrying.length === 0) {
    return refuse(
      'stage_condition_price_or_time_only',
      'The only conditions satisfied are a price level or an elapsed period. A staged add during a fall needs the thesis and the stabilisation to still hold; adding because the price fell further is averaging into a thesis that is losing, not executing a plan',
      'satisfied',
      { stageId, satisfied: satisfiedKinds },
    )
  }

  if (kind === 'add') {
    if (gate.thesisIntact !== true) {
      return refuse('stage_thesis_not_confirmed', 'A stage adds only while the thesis holds, and this run did not confirm it', 'gate.thesisIntact', { stageId })
    }
    if (gate.stabilisationOutcome !== 'confirmed') {
      return refuse('stage_stabilisation_not_holding', 'A stage adds only while the stabilisation that opened the entry still holds', 'gate.stabilisationOutcome', { stageId, stabilisationOutcome: gate.stabilisationOutcome ?? null })
    }
    if (!finite(gate.lossBudgetRemaining) || gate.lossBudgetRemaining <= 0) {
      return refuse('risk_limit_exceeded', 'The remaining loss budget does not cover this stage', 'gate.lossBudgetRemaining', { stageId, lossBudgetRemaining: gate.lossBudgetRemaining ?? null })
    }
    /**
     * ⛔ **A stage with no readable weight used to add nothing and pass.** It
     * then went into `filled` as a recorded rung, so the plan had spent a stage
     * and committed no exposure — and the *next* run's ceiling check was
     * measured against a total that was missing it.
     */
    if (!finite(stage.weight) || stage.weight <= 0) {
      return refuse(
        'stage_weight_unstated',
        'This stage does not state a positive weight, so what it would add to the plan is unknown. A rung that commits an unknown amount cannot be checked against the cumulative target',
        'stage.weight',
        { stageId, weight: stage.weight ?? null },
      )
    }
    const wouldCommit = round(state.committedWeight + stage.weight)
    if (wouldCommit > round(state.plannedTotalWeight + 1e-9)) {
      return refuse('staged_total_exceeded', 'This stage would take the plan past its cumulative target weight', 'plan.plannedTotalWeight', { wouldCommit, plannedTotalWeight: state.plannedTotalWeight })
    }
  }

  if (kind === 'trim' && !satisfiedKinds.includes('target-reached')) {
    return refuse('trim_condition_unmet', 'A staged trim is taken on reaching the recovery target, and this run did not observe it', 'satisfied', { stageId })
  }

  const nextPlan = {
    ...plan,
    filled: [...(Array.isArray(plan?.filled) ? plan.filled : []), { stageId, kind, weight: stage.weight ?? null, filledAt: asOf, satisfied: satisfiedKinds }],
  }
  return { status: 'ok', code: null, stageId, kind, plan: nextPlan, state: stagedPlanState(nextPlan, asOf), diagnostics }
}
