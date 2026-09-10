/**
 * ── A staged entry is one plan with a cumulative target, not a habit of buying
 *    more when it falls ─────────────────────────────────────────────────────
 *
 * The plan this module reads has four properties and each of them is there because
 * of a way staged entry goes wrong:
 *
 *   `cumulativeTargetWeight`  the total the position may ever reach. Stages move
 *                             towards it; they do not each ask for a size of their own.
 *   `stages[].toWeight`       **cumulative**, not an increment. A stage says where the
 *                             position should be, and what to propose is the difference
 *                             between that and where it already is — which is what makes
 *                             a re-run cost nothing.
 *   `stages[].conditions`     what has to be re-checked. A stage whose only condition is
 *                             a lower price is averaging down with a schedule attached,
 *                             and it is refused here rather than argued about later.
 *   `stages[].expiresAt`      when the stage stops being a plan and becomes a stale
 *                             instruction nobody reviewed.
 *
 * ⛔ **The re-run is the whole point.** The same stage, evaluated twice against a book
 * that already reflects the first evaluation, yields an increment of zero the second
 * time — because the arithmetic subtracts what is held *and what is already proposed
 * and not yet filled*. A plan whose stages were increments would double the position
 * on any run the host repeated after a failure, and the host repeats runs after
 * failures.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/sizing.mjs`'s `entryTranchePlan` and
 * `schedule.mjs`'s `trancheIntent`** — the idea of a plan carrying its originating
 * decision id, the expiry, and a wake per stage. The ratios that package's ancestor
 * used (40/35/25), its price and time fallbacks, and its lens vocabulary were
 * deliberately not copied: #256 names those as the thing not to carry over.
 */

import { diagnostic, finite, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'

/** Condition kinds that are about the price and nothing else. */
const PRICE_ONLY = new Set(['price-below', 'price-above', 'drawdown'])

/**
 * @param {object} input
 * @param {object} input.plan     `{ planId, decisionId, symbol, cumulativeTargetWeight, stages }`
 * @param {string} input.stageId  the stage this run is evaluating
 * @param {string} [input.asOf]   the invocation's instant, ISO-8601
 * @param {string[]} [input.executedStageIds] stages this plan has already put into the book
 * @param {object} input.book     `{ heldWeight, openProposalWeight }`
 * @param {object} input.recheck  `{ thesisIntact, discountToBase, riskBudgetRemaining, lossFraction }`
 */
export function stagedIncrement(input = {}) {
  const diagnostics = []
  const plan = input.plan ?? {}
  const stage = (plan.stages ?? []).find((row) => row?.stageId === input.stageId)

  if (stage === undefined || !finite(stage.toWeight)) {
    diagnostics.push(
      diagnostic('stage_not_in_plan', 'unevaluated', 'This run was asked for a stage the plan does not carry, or one with no cumulative weight on it.', 'stageId', { stageId: input.stageId ?? null }),
    )
    return { data: emptyAnswer(plan, input.stageId), diagnostics }
  }
  if (!finite(plan.cumulativeTargetWeight)) {
    diagnostics.push(
      diagnostic('plan_has_no_cumulative_target', 'unevaluated', 'A staged plan is a route to one total weight, and this plan does not say what that total is.', 'plan.cumulativeTargetWeight'),
    )
    return { data: emptyAnswer(plan, input.stageId), diagnostics }
  }

  /**
   * ⛔ **The book is read or the stage does not fire.** `heldWeight` and
   * `openProposalWeight` used to default to zero, and zero is precisely the state in
   * which a stage proposes its whole weight — so a failed account lookup turned into a
   * fresh purchase, and a repeated run turned into a doubled position. The two numbers
   * this arithmetic subtracts are the two it cannot assume.
   */
  const bookProblems = ['heldWeight', 'openProposalWeight'].filter((name) => !finite(input.book?.[name]))
  for (const name of bookProblems) {
    diagnostics.push(
      diagnostic(
        'account_state_unreadable',
        'unevaluated',
        `book.${name} is what this stage's increment is measured against, and it is not a number here. An account this run could not read is not an account holding nothing.`,
        `book.${name}`,
      ),
    )
  }
  const held = finite(input.book?.heldWeight) ? input.book.heldWeight : 0
  const open = finite(input.book?.openProposalWeight) ? input.book.openProposalWeight : 0
  const already = held + open

  // ── the stage has already happened ───────────────────────────────────────
  if ((input.executedStageIds ?? []).includes(stage.stageId)) {
    diagnostics.push(
      diagnostic(
        'stage_already_executed',
        'info',
        'This stage is in the plan\'s own ledger already. A run that proposed it again would add the same exposure a second time, which is what a repeated run after a failure looks like from the outside.',
        'executedStageIds',
        { stageId: stage.stageId, planId: plan.planId ?? null },
      ),
    )
    return { data: answer(plan, stage, { already, increment: 0, action: 'skip', reason: 'stage_already_executed' }), diagnostics }
  }

  // ── the stage has expired ────────────────────────────────────────────────
  if (typeof stage.expiresAt === 'string' && typeof input.asOf === 'string' && input.asOf > stage.expiresAt) {
    diagnostics.push(
      diagnostic(
        'stage_expired',
        'warn',
        'This stage\'s window closed before this run. A plan that keeps firing after its own expiry is an instruction nobody has reviewed since the day it was written.',
        'stage.expiresAt',
        { stageId: stage.stageId, expiresAt: stage.expiresAt, asOf: input.asOf },
      ),
    )
    return { data: answer(plan, stage, { already, increment: 0, action: 'skip', reason: 'stage_expired' }), diagnostics }
  }

  // ── the plan's own ceiling ───────────────────────────────────────────────
  if (stage.toWeight > plan.cumulativeTargetWeight + THRESHOLDS.weightTolerance) {
    diagnostics.push(
      diagnostic(
        'stage_above_cumulative_target',
        'blocked',
        'This stage would take the position past the plan\'s own total. The cumulative target is the size that was reasoned about; a stage above it is a second, unreasoned position.',
        'stage.toWeight',
        { stageId: stage.stageId, toWeight: round(stage.toWeight), cumulativeTargetWeight: round(plan.cumulativeTargetWeight) },
      ),
    )
  }

  // ── a stage that is only a lower price ───────────────────────────────────
  const conditions = stage.conditions ?? []
  const nonPrice = conditions.filter((row) => !PRICE_ONLY.has(row?.kind))
  if (conditions.length === 0 || nonPrice.length === 0) {
    diagnostics.push(
      diagnostic(
        'price_only_stage_condition',
        'blocked',
        'Every condition on this stage is about the price. Adding to a position because it fell is averaging down with a schedule attached; a stage has to re-check the thesis, the remaining discount and the risk budget before it asks for more of the book.',
        'stage.conditions',
        { stageId: stage.stageId, conditions: conditions.map((row) => row?.kind ?? null) },
      ),
    )
  }

  // ── the three re-checks, on this run's numbers ───────────────────────────
  const recheck = input.recheck ?? {}
  if (recheck.thesisIntact !== true) {
    diagnostics.push(
      diagnostic(
        'thesis_not_reaffirmed',
        'blocked',
        'The thesis was not re-affirmed on this run, so there is no stage to execute. A plan is a route to a size on the assumption that the reason is still there.',
        'recheck.thesisIntact',
        { stageId: stage.stageId },
      ),
    )
  }
  if (!finite(recheck.discountToBase)) {
    diagnostics.push(
      diagnostic('discount_not_measured', 'unevaluated', 'The remaining discount to the base case was not measured on this run, so the stage cannot be judged. This is an absence, not a refusal.', 'recheck.discountToBase'),
    )
  } else if (recheck.discountToBase <= 0) {
    diagnostics.push(
      diagnostic(
        'no_discount_headroom',
        'blocked',
        'There is no discount left to the base case, so there is nothing left for this stage to buy. The plan continues into the exit stages rather than the entry ones.',
        'recheck.discountToBase',
        { discountToBase: round(recheck.discountToBase) },
      ),
    )
  }

  /**
   * ⛔ **A comparison that could not be made is not a comparison that passed.** The
   * loss to invalidation and the remaining budget were optional, so a run that had
   * neither skipped the risk test in silence and proposed the stage anyway — the
   * quietest of the four ways this module used to say yes without checking.
   */
  for (const name of ['lossFraction', 'riskBudgetRemaining']) {
    if (finite(recheck[name])) continue
    diagnostics.push(
      diagnostic(
        'risk_recheck_unavailable',
        'unevaluated',
        `recheck.${name} is required to decide whether this stage fits the remaining risk budget. Without it the comparison cannot be made, and a comparison that cannot be made does not pass.`,
        `recheck.${name}`,
      ),
    )
  }

  const increment = stage.toWeight - already
  const requiredRisk = finite(recheck.lossFraction) ? Math.max(0, increment) * recheck.lossFraction : null
  if (finite(requiredRisk) && finite(recheck.riskBudgetRemaining) && requiredRisk > recheck.riskBudgetRemaining + THRESHOLDS.weightTolerance) {
    diagnostics.push(
      diagnostic(
        'risk_budget_exhausted',
        'blocked',
        `This stage would put ${round(requiredRisk)} of the book at risk to invalidation and ${round(recheck.riskBudgetRemaining)} of the budget is left. The stage waits for budget rather than being trimmed to fit, because a stage sized to what is left is a size nothing calculated.`,
        'recheck.riskBudgetRemaining',
        { stageId: stage.stageId, requiredRisk: round(requiredRisk), riskBudgetRemaining: round(recheck.riskBudgetRemaining), outcomeCode: 'risk_limit_exceeded' },
      ),
    )
  }

  const blocked = diagnostics.find((row) => row.severity === 'blocked')
  if (blocked !== undefined) {
    return { data: answer(plan, stage, { already, increment: 0, action: 'blocked', reason: blocked.code }), diagnostics }
  }
  /**
   * ⛔ **`unevaluated` halts too, and it did not used to.** Only a refusal stopped the
   * stage, so every input this run could not verify — the remaining discount, the risk
   * numbers, the account itself — left the increment standing. An unverified re-check
   * is an increment of zero and a finding of `data_missing`, never an addition.
   */
  const unverified = diagnostics.find((row) => row.severity === 'unevaluated')
  if (unverified !== undefined) {
    return { data: answer(plan, stage, { already, increment: 0, action: 'unevaluated', reason: unverified.code }), diagnostics }
  }

  // ── nothing left to add, which is the ordinary re-run ────────────────────
  if (increment <= THRESHOLDS.weightTolerance) {
    diagnostics.push(
      diagnostic(
        'stage_already_filled',
        'info',
        'What the book holds plus what is already proposed is at or above this stage\'s cumulative weight. There is nothing to add, and this is what a re-run of a stage that already went through looks like.',
        'book',
        { stageId: stage.stageId, heldWeight: round(held), openProposalWeight: round(open), toWeight: round(stage.toWeight) },
      ),
    )
    return { data: answer(plan, stage, { already, increment: 0, action: 'skip', reason: 'stage_already_filled' }), diagnostics }
  }

  return { data: answer(plan, stage, { already, increment, action: 'propose', reason: null }), diagnostics }
}

function answer(plan, stage, { already, increment, action, reason }) {
  return {
    planId: plan.planId ?? null,
    decisionId: plan.decisionId ?? null,
    symbol: plan.symbol ?? null,
    stageId: stage.stageId,
    /** Cumulative, because that is what the stage states. */
    stageTargetWeight: round(stage.toWeight),
    alreadyOnTheBook: round(already),
    /** What this run proposes, and it is a difference rather than a size. */
    increment: round(Math.max(0, increment)),
    cumulativeAfter: round(already + Math.max(0, action === 'propose' ? increment : 0)),
    action,
    reason,
    /** So a caller can group this the way the ledger groups it, without re-deriving it. */
    outcomeCode:
      action === 'unevaluated'
        ? 'data_missing'
        : reason === 'risk_budget_exhausted'
          ? 'risk_limit_exceeded'
          : action === 'blocked'
            ? 'thesis_refuted'
            : null,
    units: { stageTargetWeight: 'portfolio-weight', alreadyOnTheBook: 'portfolio-weight', increment: 'portfolio-weight' },
  }
}

function emptyAnswer(plan, stageId) {
  return {
    planId: plan?.planId ?? null,
    decisionId: plan?.decisionId ?? null,
    symbol: plan?.symbol ?? null,
    stageId: stageId ?? null,
    stageTargetWeight: null,
    alreadyOnTheBook: null,
    increment: null,
    cumulativeAfter: null,
    action: 'unevaluated',
    reason: null,
    units: { increment: 'portfolio-weight' },
  }
}
