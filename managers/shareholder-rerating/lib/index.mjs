/**
 * ── The one entry point, and what it is for ────────────────────────────────
 *
 * Everything in this directory is arithmetic a run could do in prose and would
 * eventually do wrong: the two-leg total return, the capital or cash headroom the
 * programme is paid out of, the case label, the weight, the staged increment and the
 * account-wide concentration fold. `evaluateCase` runs them in the order the
 * methodology runs them and hands back one answer a fixture can assert against.
 *
 * ⛔ **This is not the methodology.** The judgement — why this company is discounted,
 * what evidence the cause is resolving, where this desk differs from the market, what
 * would refute it — is in `PROMPT.md` and the skills, and none of it is computable.
 * What is here is the part where being *checkably* right matters more than being
 * well argued, which is the part that decides how much of somebody's book moves.
 *
 * ⚠️ **The concentration fold runs twice, on purpose.** The first pass has nothing to
 * propose and asks only what headroom the account has left; that number becomes a cap
 * on the weight. The second pass asks whether the weight that came out still fits
 * once it is added to everything already held and already proposed. One pass would
 * either size against a stale headroom or check a weight it had itself produced.
 */

export { finite, round, diagnostic, isBlocked, isUnevaluated } from './numbers.mjs'
export { THRESHOLDS } from './thresholds.mjs'
export { returnComposition } from './return-composition.mjs'
export { capitalHeadroom } from './capital-headroom.mjs'
export { classifyCase, REQUIRED_OUTPUTS, ROUTES } from './classify.mjs'
export { lossToInvalidation, targetWeight } from './sizing.mjs'
export { stagedIncrement } from './staged-plan.mjs'
export { concentration } from './concentration.mjs'

import { finite } from './numbers.mjs'
import { returnComposition } from './return-composition.mjs'
import { capitalHeadroom } from './capital-headroom.mjs'
import { classifyCase } from './classify.mjs'
import { lossToInvalidation, targetWeight } from './sizing.mjs'
import { concentration } from './concentration.mjs'

/**
 * @param {object} input  one candidate, as the run has assembled it
 * @returns {{data: object, diagnostics: object[]}}
 */
export function evaluateCase(input = {}) {
  const composition = returnComposition(input.valuation ?? {})
  const capital = capitalHeadroom({
    sector: input.sectorKind,
    financial: input.financial,
    nonFinancial: input.nonFinancial,
  })
  const classified = classifyCase({
    capital,
    composition,
    programme: input.programme,
    earnings: input.earnings,
    yieldContext: input.yieldContext,
    completedOutputs: input.completedOutputs,
  })

  const diagnostics = [...classified.diagnostics]
  const base = {
    symbol: input.symbol ?? null,
    case: classified.data.case,
    route: classified.data.route,
    outcomeCode: classified.data.outcomeCode,
    totalReturn: composition.data.totalReturn,
    rerating: composition.data.rerating,
    investorCashReturn: composition.data.investorCashReturn,
    buybackYield: composition.data.buybackYield,
    returnHeadroomYield: capital.data.returnHeadroomYield ?? null,
    discountToBase: composition.data.discountToBase ?? null,
    lossFraction: null,
    targetWeight: null,
    projectedExposure: null,
    proposedAction: null,
    details: classified.data.details,
  }

  const heldWeight = (input.book?.holdings ?? [])
    .filter((row) => row?.symbol === input.symbol && finite(row?.weight))
    .reduce((most, row) => Math.max(most, row.weight), 0)

  if (classified.data.route !== 'buy-path') {
    base.heldWeight = heldWeight
    base.proposedAction = actionFor(classified.data.route, heldWeight)
    return { data: base, diagnostics }
  }
  base.heldWeight = heldWeight

  const loss = lossToInvalidation({
    entryPrice: input.valuation?.price,
    invalidationPrice: input.invalidationPrice,
    dividendBeforeInvalidation: input.dividendBeforeInvalidation,
  })
  diagnostics.push(...loss.diagnostics)
  base.lossFraction = loss.data.lossFraction

  const mandate = input.mandate ?? {}
  const book = input.book ?? {}
  const headroomPass = concentration({
    proposed: { symbol: input.symbol, sector: input.sector, weight: 0 },
    holdings: book.holdings,
    openProposals: book.openProposals,
    caps: mandate.caps,
    strategy: input.strategy,
  })
  diagnostics.push(...headroomPass.diagnostics)

  const sized = targetWeight({
    riskBudgetWeight: mandate.riskBudgetWeight,
    lossFraction: loss.data.lossFraction,
    mandatePositionCap: mandate.mandatePositionCap,
    sectorHeadroom: headroomPass.data.sectorHeadroom ?? undefined,
    accountHeadroom: headroomPass.data.symbolHeadroom ?? undefined,
    minimumExecutableWeight: mandate.minimumExecutableWeight,
  })
  diagnostics.push(...sized.diagnostics)
  base.targetWeight = sized.data.targetWeight

  if (!finite(sized.data.targetWeight) || sized.data.targetWeight <= 0) {
    /**
     * ⚠️ **Three ways to arrive at no position, and they are three codes.** The book
     * is full (`risk_limit_exceeded`), the venue cannot express the size the risk
     * arithmetic asked for (`position_not_executable`), or the Mandate never said what
     * the budget is (`data_missing`). Collapsing them would report a full book as a
     * missing input on the day the difference decides what a person does next.
     */
    const capExhausted =
      headroomPass.data.withinLimits === false ||
      (finite(headroomPass.data.symbolHeadroom) && headroomPass.data.symbolHeadroom <= 0)
    const unexecutable = sized.diagnostics.some((row) => row.code === 'minimum_executable_not_met')
    base.route = 'wait'
    base.outcomeCode = capExhausted ? 'risk_limit_exceeded' : unexecutable ? 'position_not_executable' : 'data_missing'
    base.proposedAction = 'WAIT'
    base.projectedExposure = headroomPass.data.projectedExposure
    return { data: base, diagnostics }
  }

  const confirm = concentration({
    proposed: { symbol: input.symbol, sector: input.sector, weight: sized.data.targetWeight },
    holdings: book.holdings,
    openProposals: book.openProposals,
    caps: mandate.caps,
    strategy: input.strategy,
  })
  diagnostics.push(...confirm.diagnostics)
  base.projectedExposure = confirm.data.projectedExposure

  if (confirm.data.withinLimits === false) {
    base.route = 'wait'
    base.outcomeCode = 'risk_limit_exceeded'
    base.proposedAction = 'WAIT'
    return { data: base, diagnostics }
  }

  base.proposedAction = 'BUY'
  return { data: base, diagnostics }
}

/**
 * Which action a route reaches, and it depends on whether the book already holds it.
 *
 * ⚠️ **A refuted thesis on a name nobody owns is a `WAIT`, not a `SELL`.** There is
 * nothing to sell, and a package that returned `SELL` on every rejection would fill an
 * investor's approval queue with orders against positions that do not exist.
 *
 * ⛔ **`RESIZE` and not `EXIT`, and the difference is deliberate.** A re-rated name and
 * a retreating policy are reasons to stage a position down against a fair value, which
 * is a size. Full liquidation belongs to a hard risk breach, and that judgement — what
 * counts as one, and on what evidence — is prose in `PROMPT.md` rather than a branch
 * here, because the arithmetic cannot tell a breach from a bad week.
 */
function actionFor(route, heldWeight = 0) {
  if (route === 'watch') return 'WATCH'
  if (route === 'trim-or-exit-review' || route === 'reject') return heldWeight > 0 ? 'RESIZE' : 'WAIT'
  return 'WAIT'
}
