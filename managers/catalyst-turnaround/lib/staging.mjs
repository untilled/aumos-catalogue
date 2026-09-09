import { cause, diagnostic, finite, instantOf, round } from './diagnostics.mjs'

/**
 * ── The staged plan, and the one thing it must never do twice ──────────────
 *
 * #256: «분할 진입/청산은 누적 목표 비중, 단계 조건, 만료, 원 결정 ID를 가진
 * 계획이다. 재실행 시 중복 증액하지 않으며 모든 단계에서 논거와 잔여 위험예산을
 * 다시 확인한다.» Four fields and two obligations, and the reason it is code is
 * the word **재실행**: a plan is read by a run that has read it before, and the
 * failure mode is not a wrong number but the *same right number added again*.
 *
 * The defence is that a stage is identified by `id` under an `originDecisionId`,
 * and what a run may add is `due − already filled` rather than `due`. Run the
 * same plan twice against the same register and the second run adds nothing;
 * that is the fixture, and it is the whole of what this module is for.
 *
 * ⛔ **The 40/35/25 split is not here and is not coming back.** #256 says not to
 * copy the harness's old ratios or its price-and-time fallbacks as a common
 * default. A plan states its own stage weights, and this module checks that they
 * add up to the position the plan says it is building — it does not know what a
 * first tranche should be.
 *
 * ⚠️ **Derived from `entryTranchePlan` in `managers/evidence-gated/lib/sizing.mjs`**:
 * the condition kinds (`immediate` / `at-time` / `price-below` / `price-above`),
 * the rule that only the first stage may be `immediate`, the sum check and the
 * lapsed-stage finding. Left behind: its lens/maturity gating, its lot-size
 * executability arithmetic and its core-DCA lane refusal, which are all
 * evidence-gated's own policy.
 */

const CONDITION_KINDS = Object.freeze(['immediate', 'at-time', 'price-below', 'price-above'])

function conditionDue(condition, { asOfInstant, price }) {
  const kind = condition?.kind
  if (kind === 'immediate') return { due: true, readable: true }
  if (kind === 'at-time') {
    const at = instantOf(condition?.at)
    if (at === null) return { due: false, readable: false }
    return { due: at <= asOfInstant, readable: true }
  }
  if (kind === 'price-below' || kind === 'price-above') {
    if (!finite(condition?.threshold) || !finite(price)) return { due: false, readable: false }
    return { due: kind === 'price-below' ? price <= condition.threshold : price >= condition.threshold, readable: true }
  }
  return { due: false, readable: false }
}

export function stagedPlan({ previous = null, plan = {}, price = null, asOf } = {}) {
  const diagnostics = []
  const causes = []
  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    diagnostics.push(diagnostic('as_of_unreadable', 'blocked', 'A staged plan is judged at asOf', 'asOf'))
    return { data: { addedThisRun: 0 }, diagnostics, causes }
  }

  for (const field of ['originDecisionId', 'symbol']) {
    if (typeof plan?.[field] !== 'string' || !plan[field]) {
      diagnostics.push(
        diagnostic('plan_field_missing', 'blocked', `A staged plan carries ${field}; without the originating decision id the stages belong to nothing and cannot be reconciled on the next run`, `plan.${field}`),
      )
    }
  }
  if (previous !== null && previous.originDecisionId !== plan.originDecisionId) {
    diagnostics.push(
      diagnostic('plan_origin_mismatch', 'blocked', 'The carried register belongs to a different decision. Reconciling two plans under one id is exactly how a filled stage becomes an unfilled one', 'plan.originDecisionId', {
        carried: previous.originDecisionId,
        plan: plan.originDecisionId,
      }),
    )
  }

  const cumulativeTarget = plan?.cumulativeTargetWeight
  if (!finite(cumulativeTarget) || cumulativeTarget <= 0) {
    diagnostics.push(diagnostic('plan_target_missing', 'blocked', 'A plan states the cumulative weight it is building toward', 'plan.cumulativeTargetWeight'))
  }

  const stages = Array.isArray(plan?.stages) ? plan.stages : []
  if (stages.length === 0) {
    diagnostics.push(diagnostic('plan_has_no_stages', 'blocked', 'A staged entry is a plan or it is not staged', 'plan.stages'))
  }

  const seen = new Set()
  let plannedSum = 0
  const rows = []
  for (const [index, stage] of stages.entries()) {
    const where = `plan.stages[${index}]`
    const id = stage?.id
    if (typeof id !== 'string' || !id) {
      diagnostics.push(diagnostic('stage_id_missing', 'blocked', 'A stage is identified by an id, which is the only thing that survives between runs', `${where}.id`))
      continue
    }
    if (seen.has(id)) {
      diagnostics.push(diagnostic('stage_id_duplicated', 'blocked', `Two stages share the id ${id}, so one of them can be filled and the other look unfilled forever`, `${where}.id`))
      continue
    }
    seen.add(id)
    if (!finite(stage?.weight) || stage.weight <= 0) {
      diagnostics.push(diagnostic('stage_weight_missing', 'blocked', 'A stage states the weight it puts to work', `${where}.weight`))
      continue
    }
    plannedSum += stage.weight
    const kind = stage?.condition?.kind
    if (!CONDITION_KINDS.includes(kind)) {
      diagnostics.push(
        diagnostic('stage_condition_missing', 'blocked', '"We will add on weakness" is not a stage. Each one carries a date or a price it waits for', `${where}.condition`, { supported: CONDITION_KINDS }),
      )
      continue
    }
    if (kind === 'immediate' && index !== 0) {
      diagnostics.push(diagnostic('stage_condition_missing', 'blocked', 'Only the first stage executes on the run that plans it', `${where}.condition`))
      continue
    }
    const expiresAt = instantOf(stage?.expiresAt)
    if (kind !== 'immediate' && expiresAt === null) {
      diagnostics.push(
        diagnostic('stage_expiry_missing', 'blocked', 'A stage that waits has an expiry, or the plan has no end and the position is being built by a rule nobody reviews', `${where}.expiresAt`),
      )
      continue
    }
    const { due, readable } = conditionDue(stage.condition, { asOfInstant, price })
    const lapsed = expiresAt !== null && expiresAt <= asOfInstant
    rows.push({ id, weight: stage.weight, kind, condition: stage.condition, expiresAtEpochMs: expiresAt, due: due && !lapsed, readable, lapsed })
  }

  if (finite(cumulativeTarget) && rows.length > 0 && Math.abs(plannedSum - cumulativeTarget) > 1e-9) {
    diagnostics.push(
      diagnostic('stage_sizes_do_not_sum', 'blocked', 'The stages add up to something other than the position the plan says it is building, so the plan is describing two different positions', 'plan.stages', {
        cumulativeTargetWeight: cumulativeTarget,
        stageSum: round(plannedSum),
      }),
    )
  }

  // ── the carried record: what has already gone in ─────────────────────────
  const carriedFilled = new Set(previous?.filledStageIds ?? [])
  const declaredFilled = new Set(stages.filter((stage) => stage?.filled === true).map((stage) => stage?.id))
  /**
   * ⛔ **Union, never intersection, and never the incoming list alone.** A plan
   * that comes back with `filled: false` on a stage the register says was filled
   * is the double-add, arriving as a restatement instead of as a second order.
   * The register wins and the run is told.
   */
  const dropped = [...carriedFilled].filter((id) => !declaredFilled.has(id))
  if (dropped.length > 0) {
    diagnostics.push(
      diagnostic('filled_stage_restated_as_unfilled', 'note', `The carried register says ${dropped.join(', ')} already went in and this run handed the plan back without them. The register wins; nothing here is added twice`, 'plan.stages', {
        dropped,
      }),
    )
  }
  const filled = new Set([...carriedFilled, ...declaredFilled])
  const filledWeight = round(rows.filter((row) => filled.has(row.id)).reduce((total, row) => total + row.weight, 0))

  const dueRows = rows.filter((row) => row.due && !filled.has(row.id))
  const lapsedRows = rows.filter((row) => row.lapsed && !filled.has(row.id))
  for (const row of lapsedRows) {
    diagnostics.push(
      diagnostic('stage_lapsed', 'note', `Stage ${row.id} expired with the plan unfinished. The remainder is re-armed, resized or abandoned in this run — leaving it is how a plan becomes a standing order`, `plan.stages[${row.id}]`, {
        weight: row.weight,
      }),
    )
  }

  /**
   * The second obligation. A stage is not a schedule the thesis is exempt from:
   * every one of them re-reads the argument and the remaining risk budget, and a
   * run that cannot say it did adds nothing.
   */
  let addedThisRun = round(dueRows.reduce((total, row) => total + row.weight, 0))
  if (addedThisRun > 0) {
    const rechecked = instantOf(plan?.thesisRecheckedAt)
    if (rechecked === null || rechecked > asOfInstant) {
      causes.push(cause('research_incomplete', 'A stage came due and this run has not re-read the thesis behind it. The stage waits; it does not execute on the strength of having been planned', 'plan.thesisRecheckedAt'))
      addedThisRun = 0
    } else if (!finite(plan?.remainingRiskBudget)) {
      causes.push(cause('research_incomplete', 'A stage came due and the remaining risk budget is unstated. Adding into an unknown budget is how a plan outgrows the account that approved it', 'plan.remainingRiskBudget'))
      addedThisRun = 0
    } else if (plan.remainingRiskBudget < addedThisRun) {
      causes.push(
        cause('risk_limit_exceeded', `This stage asks for ${addedThisRun} of the book and ${plan.remainingRiskBudget} is left in the budget. The stage is not shrunk to fit — a stage sized by what happens to be left is not the plan that was approved`, 'plan.remainingRiskBudget', {
          addedThisRun,
          remainingRiskBudget: plan.remainingRiskBudget,
        }),
      )
      addedThisRun = 0
    }
  }

  const cumulativeAfter = round(filledWeight + addedThisRun)
  if (finite(cumulativeTarget) && cumulativeAfter > cumulativeTarget + 1e-9) {
    diagnostics.push(
      diagnostic('staged_plan_would_double_add', 'blocked', `Filling the due stages takes this position to ${cumulativeAfter} against a cumulative target of ${cumulativeTarget}. Something has been counted twice, and it is refused here rather than reconciled afterwards from a fill report`, 'plan.stages', {
        filledWeight,
        addedThisRun,
        cumulativeTargetWeight: cumulativeTarget,
      }),
    )
    addedThisRun = 0
  }

  const nextRegister = {
    version: 1,
    originDecisionId: plan?.originDecisionId ?? null,
    symbol: plan?.symbol ?? null,
    updatedAtEpochMs: asOfInstant,
    cumulativeTargetWeight: finite(cumulativeTarget) ? cumulativeTarget : null,
    /** Everything already in, plus what this run is adding. This is the anti-double-add record. */
    filledStageIds: [...new Set([...filled, ...dueRows.filter(() => addedThisRun > 0).map((row) => row.id)])].sort(),
    filledWeight: round(filledWeight + addedThisRun),
    lapsedStageIds: lapsedRows.map((row) => row.id).sort(),
  }

  return {
    data: {
      stages: rows,
      /** Before this run, and after it. Two fields because the difference is the answer. */
      filledStageIdsBefore: [...filled].sort(),
      filledStageIds: nextRegister.filledStageIds,
      filledWeight,
      addedThisRun,
      cumulativeWeightAfter: round(filledWeight + addedThisRun),
      cumulativeTargetWeight: finite(cumulativeTarget) ? cumulativeTarget : null,
      pendingStageIds: rows.filter((row) => !filled.has(row.id) && !row.due && !row.lapsed).map((row) => row.id),
      lapsedStageIds: lapsedRows.map((row) => row.id),
      complete: finite(cumulativeTarget) && round(filledWeight + addedThisRun) >= cumulativeTarget - 1e-9,
      nextRegister,
      units: { addedThisRun: 'portfolio-weight', filledWeight: 'portfolio-weight' },
    },
    diagnostics,
    causes,
  }
}
