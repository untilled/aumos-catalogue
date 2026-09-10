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
 * ⚠️ **The concentration fold runs twice, on purpose.** The first pass proposes
 * nothing and asks what the account permits this name to *be*; that ceiling goes into
 * the sizing. The second pass asks whether the increment that came out still fits once
 * it is added to everything already held and already proposed. One pass would either
 * size against a stale ceiling or check a number it had itself produced.
 *
 * ── Two weights, and they are not interchangeable (finding ③) ──────────────
 *
 *   `targetTotalWeight`  what this name should **be** — the risk budget and every cap
 *                        applied to the final holding;
 *   `incrementWeight`    what this run proposes **adding** — the target minus what the
 *                        account already holds and has already proposed.
 *
 * One field carried both meanings until a book holding 4% of the name returned a
 * `targetWeight` of 5.33% that was then *added* to the 4%. Read as a total it collided
 * with a trim target; read as an increment it blew the risk budget. They are two
 * fields now and every answer carries both.
 *
 * ── An input that is absent is not an input that passed ───────────────────
 *
 * ⛔ Three of the four findings on this file's first version were one defect: a book
 * that was never read became empty lists, a cap that was never stated became no
 * constraint, a limit that was declared was never looked at — and each of those read
 * as *permission* at the point where a position gets proposed. Every mandatory input
 * is now checked for presence, an unverified one yields `unevaluated`, and a `BUY`
 * requires the concentration answer to be **explicitly** `true`.
 */

export { finite, round, diagnostic, isBlocked, isUnevaluated } from './numbers.mjs'
export { THRESHOLDS } from './thresholds.mjs'
export { returnComposition } from './return-composition.mjs'
export { capitalHeadroom } from './capital-headroom.mjs'
export { classifyCase, REQUIRED_OUTPUTS, ROUTES } from './classify.mjs'
export { lossToInvalidation, targetWeight } from './sizing.mjs'
export { stagedIncrement } from './staged-plan.mjs'
export { concentration } from './concentration.mjs'

import { diagnostic, finite, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'
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
    /** What this name should **be**. A total. */
    targetTotalWeight: null,
    /** What this run proposes adding. `targetTotalWeight` minus what the account already carries. */
    incrementWeight: null,
    heldWeight: null,
    existingExposure: null,
    projectedExposure: null,
    projectedGrossExposure: null,
    /** Which declared axis capped the total: the name, the sector or the whole book. */
    maxTotalWeightBinding: null,
    proposedAction: null,
    details: classified.data.details,
  }

  /**
   * ⛔ **The account was read, or it was not, and the two are different states.**
   * `input.book.holdings` and `input.book.openProposals` must both be lists. A missing
   * book used to become two empty arrays somewhere downstream, which reads as an empty
   * account — and an empty account is the most permissive state there is, so the run
   * that had never seen the book was the run that proposed most freely.
   */
  const bookReadable = Array.isArray(input.book?.holdings) && Array.isArray(input.book?.openProposals)
  if (!bookReadable) {
    diagnostics.push(
      diagnostic(
        'account_state_unreadable',
        'unevaluated',
        'This run did not read the account: `book.holdings` and `book.openProposals` are both required lists and at least one is absent. An account that could not be read is not an empty one, and nothing is proposed against it.',
        'book',
      ),
    )
  }
  const heldWeight = bookReadable
    ? input.book.holdings
        .filter((row) => row?.symbol === input.symbol && finite(row?.weight))
        .reduce((most, row) => Math.max(most, row.weight), 0)
    : null
  base.heldWeight = heldWeight

  if (classified.data.route !== 'buy-path') {
    /**
     * ⚠️ The **classification** is about the company and stands whether or not the book
     * was read; the **action** is about the account and does not. A `rerated` name with
     * an unreadable book is still `rerated`, and this run still proposes nothing.
     */
    base.proposedAction = bookReadable ? actionFor(classified.data.route, heldWeight) : 'WAIT'
    if (!bookReadable) base.outcomeCode = 'data_missing'
    return { data: base, diagnostics }
  }
  if (!bookReadable) return wait(base, diagnostics, 'data_missing')

  const loss = lossToInvalidation({
    entryPrice: input.valuation?.price,
    invalidationPrice: input.invalidationPrice,
    dividendBeforeInvalidation: input.dividendBeforeInvalidation,
  })
  diagnostics.push(...loss.diagnostics)
  base.lossFraction = loss.data.lossFraction

  const mandate = input.mandate ?? {}
  const book = input.book
  const account = { holdings: book.holdings, openProposals: book.openProposals, caps: mandate.caps, strategy: input.strategy }

  /**
   * Pass one asks what the account permits this name to **be** — nothing is proposed
   * yet, so `weight: 0`. `maxTotalWeightForName` is every declared axis folded into one
   * ceiling on the final holding: the single-name cap, what the sector ceiling leaves
   * once the rest of the sector is counted, and what the gross ceiling leaves once the
   * rest of the book is.
   */
  const exposure = concentration({ proposed: { symbol: input.symbol, sector: input.sector, weight: 0 }, ...account })
  diagnostics.push(...exposure.diagnostics)
  base.existingExposure = exposure.data.existingExposure
  base.projectedExposure = exposure.data.projectedExposure
  base.projectedGrossExposure = exposure.data.projectedGrossExposure
  base.maxTotalWeightBinding = exposure.data.maxTotalWeightBinding

  const sized = targetWeight({
    riskBudgetWeight: mandate.riskBudgetWeight,
    lossFraction: loss.data.lossFraction,
    mandatePositionCap: mandate.mandatePositionCap,
    accountNameLimit: exposure.data.maxTotalWeightForName ?? undefined,
    minimumExecutableWeight: mandate.minimumExecutableWeight,
  })
  diagnostics.push(...sized.diagnostics)
  base.targetTotalWeight = sized.data.targetTotalWeight

  /**
   * ⛔ **`withinLimits === true` or there is no BUY.** `false` is a full book and
   * `null` is a book this run could not adjudicate, and neither is permission. The
   * earlier version refused only on `false`, so every unevaluated concentration answer
   * passed straight through into a proposal.
   */
  if (exposure.data.withinLimits !== true) {
    return wait(base, diagnostics, exposure.data.withinLimits === false ? 'risk_limit_exceeded' : 'data_missing')
  }

  if (!finite(sized.data.targetTotalWeight)) {
    const unexecutable = sized.diagnostics.some((row) => row.code === 'minimum_executable_not_met')
    return wait(base, diagnostics, unexecutable ? 'position_not_executable' : 'data_missing')
  }
  if (sized.data.targetTotalWeight <= 0) {
    return wait(base, diagnostics, 'risk_limit_exceeded')
  }

  // ── the total, minus what the account already carries ────────────────────
  const increment = sized.data.targetTotalWeight - exposure.data.existingExposure

  if (increment < -THRESHOLDS.weightTolerance) {
    /**
     * ⚠️ **Already above target, which had no defined behaviour before.** The account
     * carries more of this name than the risk budget and the caps say it should. That
     * is a reduction question, not a purchase one — and this manager proposes a
     * reduction only against what is actually held: an excess made of somebody else's
     * unapproved proposal is theirs to withdraw, not this package's to trim.
     */
    base.incrementWeight = 0
    base.route = 'trim-or-exit-review'
    base.outcomeCode = 'position_above_target'
    base.proposedAction = heldWeight > sized.data.targetTotalWeight + THRESHOLDS.weightTolerance ? 'RESIZE' : 'WAIT'
    diagnostics.push(
      diagnostic(
        'position_above_target_weight',
        'warn',
        `This name is already ${round(exposure.data.existingExposure)} of the account and the arithmetic sizes it at ${round(sized.data.targetTotalWeight)}. Adding to it because the thesis is intact would be sizing the increment and not the position.`,
        'book',
        { existingExposure: exposure.data.existingExposure, targetTotalWeight: sized.data.targetTotalWeight, heldWeight },
      ),
    )
    return { data: base, diagnostics }
  }

  if (increment <= THRESHOLDS.weightTolerance) {
    base.incrementWeight = 0
    diagnostics.push(
      diagnostic(
        'position_at_target_weight',
        'info',
        'What the account holds plus what it has already proposed is at the target weight. There is nothing to add, and nothing is wrong.',
        'book',
        { existingExposure: exposure.data.existingExposure, targetTotalWeight: sized.data.targetTotalWeight },
      ),
    )
    return wait(base, diagnostics, 'position_at_target')
  }

  base.incrementWeight = round(increment)

  /**
   * The venue minimum applies to the **order**, which is the increment. A target that
   * clears it can still be reached by an addition that does not.
   */
  if (increment + 1e-12 < mandate.minimumExecutableWeight) {
    diagnostics.push(
      diagnostic(
        'increment_below_minimum_executable',
        'blocked',
        'The addition this stage asks for is below the smallest order this venue can express. It waits for the target to move away from the holding rather than being rounded up to something nothing calculated.',
        'mandate.minimumExecutableWeight',
        { incrementWeight: round(increment), minimumExecutableWeight: round(mandate.minimumExecutableWeight) },
      ),
    )
    return wait(base, diagnostics, 'position_not_executable')
  }

  // Pass two: the increment, against every axis again.
  const confirm = concentration({ proposed: { symbol: input.symbol, sector: input.sector, weight: increment }, ...account })
  diagnostics.push(...confirm.diagnostics)
  base.projectedExposure = confirm.data.projectedExposure
  base.projectedGrossExposure = confirm.data.projectedGrossExposure

  if (confirm.data.withinLimits !== true) {
    return wait(base, diagnostics, confirm.data.withinLimits === false ? 'risk_limit_exceeded' : 'data_missing')
  }

  base.proposedAction = 'BUY'
  return { data: base, diagnostics }
}

/** Every way this run declines to propose, in one place, so none of them forgets a field. */
function wait(base, diagnostics, outcomeCode) {
  base.route = 'wait'
  base.outcomeCode = outcomeCode
  base.proposedAction = 'WAIT'
  if (base.incrementWeight === null) base.incrementWeight = 0
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
