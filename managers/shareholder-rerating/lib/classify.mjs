/**
 * ── What kind of case is this, and which of four answers is it ─────────────
 *
 * A high yield, a low PBR and a deep drawdown are the three things that make a
 * company *look* like this methodology's subject, and each of them is also what a
 * dividend trap, a one-off gain and an under-capitalised balance sheet look like.
 * This module is the part of the package that has to tell them apart, and it is code
 * rather than prose because the completion condition is that the four cases reach
 * **different** answers and a fixture can only assert that against a label.
 *
 * ⛔ **The four outcome codes stay four things (#254).**
 *
 *   `data_missing`        the input needed to decide never arrived. Not a finding.
 *   `research_incomplete` the inputs are there and this run has not finished the work.
 *   `thesis_refuted`      something was measured and it says the claim is wrong.
 *   `risk_limit_exceeded` the claim may be right and the book cannot carry it.
 *
 * The one this module exists to protect is the first. A company nobody filed a
 * quarterly for is not a company whose capital deteriorated, and recording it as one
 * puts a refutation in the ledger that no evidence stands behind — which then reads,
 * for every later run, as a company this desk has already looked at and rejected.
 *
 * ── The order the tests run in, and why it is that order ───────────────────
 *
 *   1  capital        can the programme be paid at all
 *   2  earnings       is the profit it is paid out of the kind that comes back
 *   3  yield          is the yield a statement about the payout or about the price
 *   4  policy         has the promise itself been reduced
 *   5  execution      is the promise being kept
 *   6  valuation      is the discount this thesis exists to close still there
 *
 * Each answers a question the next one presupposes. There is no point measuring the
 * execution rate of a programme funded out of capital the issuer does not have, and
 * a run that reported `announced-not-executed` there would have named the symptom and
 * missed the cause.
 */

import { diagnostic, finite, isBlocked, isUnevaluated, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'

/**
 * The nine things #257 says a completed run produces, plus the Evidence references.
 * A run missing any of them is `research_incomplete` — which is a statement about the
 * run and never about the company.
 */
export const REQUIRED_OUTPUTS = [
  'valuationBasis',
  'returnPolicyEvidence',
  'returnComposition',
  'contraryEvidence',
  'catalystCalendar',
  'invalidationConditions',
  'stagedPlan',
  'targetWeightRisk',
  'nextReview',
  'evidenceRefs',
]

/** Refusals that are about how the run read the company, not about the company. */
const SECTOR_MISMATCH = new Set(['bank_metric_out_of_sector', 'industrial_metric_out_of_sector'])

/** Case label → the route a run takes when it reaches it. */
export const ROUTES = {
  'shareholder-rerating': 'buy-path',
  rerated: 'trim-or-exit-review',
  'return-policy-retreat': 'trim-or-exit-review',
  'announced-not-executed': 'watch',
  'dividend-trap': 'reject',
  'one-off-earnings': 'reject',
  'capital-inadequate': 'reject',
  'data-missing': 'wait',
  'research-incomplete': 'wait',
}

/**
 * @param {object} input
 * @param {object} input.capital       the `{ data, diagnostics }` from `capitalHeadroom`
 * @param {object} input.composition   the `{ data, diagnostics }` from `returnComposition`
 * @param {object} [input.programme]   `{ announcedAmount, executedAmount, windowDays, elapsedDays, policyRatio, priorPolicyRatio }`
 * @param {object} [input.earnings]    `{ pretaxProfit, nonRecurringPretaxGain, dps, eps, recurringEps }`
 * @param {object} [input.yieldContext] `{ dividendYield, sectorMedianDividendYield }`
 * @param {string[]} [input.completedOutputs] which of `REQUIRED_OUTPUTS` this run produced
 */
export function classifyCase(input = {}) {
  const diagnostics = []
  const capital = input.capital ?? { data: {}, diagnostics: [] }
  const composition = input.composition ?? { data: {}, diagnostics: [] }
  const upstream = [...(capital.diagnostics ?? []), ...(composition.diagnostics ?? [])]

  // ── 1. capital ───────────────────────────────────────────────────────────
  if (isBlocked(capital.diagnostics ?? [])) {
    const because = (capital.diagnostics ?? []).filter((row) => row.severity === 'blocked').map((row) => row.code)
    /**
     * ⚠️ **A metric asked of the wrong sector is this run's mistake and not the
     * company's.** Filing it as `capital-inadequate` would put a refutation in the
     * ledger whose evidence is that somebody read a bank ratio off an industrial.
     */
    if (because.every((code) => SECTOR_MISMATCH.has(code))) {
      return verdict('research-incomplete', 'research_incomplete', diagnostics, upstream, { because })
    }
    return verdict('capital-inadequate', 'thesis_refuted', diagnostics, upstream, { because })
  }
  if (isBlocked(composition.diagnostics ?? [])) {
    // A refused composition is an arithmetic refusal — a double count — and it is
    // neither a company finding nor an absence. The run fixes its own sum.
    return verdict('research-incomplete', 'research_incomplete', diagnostics, upstream, {
      because: (composition.diagnostics ?? []).filter((row) => row.severity === 'blocked').map((row) => row.code),
    })
  }

  // ── 2. earnings quality ──────────────────────────────────────────────────
  const earnings = input.earnings ?? {}
  const reportedPayout = payout(earnings.dps, earnings.eps)
  const recurringPayout = payout(earnings.dps, earnings.recurringEps)
  const nonRecurringShare =
    finite(earnings.nonRecurringPretaxGain) && finite(earnings.pretaxProfit) && earnings.pretaxProfit !== 0
      ? Math.abs(earnings.nonRecurringPretaxGain) / earnings.pretaxProfit
      : null

  /**
   * ⚠️ **The flip is the finding and the share is the corroboration.** A payout that
   * is comfortable on reported earnings and above 1 on recurring earnings is a payout
   * funded by something that happened once — and that reading needs no threshold at
   * all, which is why it is first.
   */
  if (finite(reportedPayout) && finite(recurringPayout) && recurringPayout > 1 && reportedPayout <= 1) {
    diagnostics.push(
      diagnostic(
        'payout_rests_on_non_recurring_profit',
        'blocked',
        'The payout is comfortable against reported earnings and above 1 against recurring earnings. What is being distributed happened once, and the yield being quoted is next year\'s cut.',
        'earnings.recurringEps',
        { reportedPayout: round(reportedPayout), recurringPayout: round(recurringPayout) },
      ),
    )
    return verdict('one-off-earnings', 'thesis_refuted', diagnostics, upstream, {
      reportedPayout: round(reportedPayout),
      recurringPayout: round(recurringPayout),
      nonRecurringShare: finite(nonRecurringShare) ? round(nonRecurringShare) : null,
    })
  }
  if (finite(nonRecurringShare) && nonRecurringShare >= THRESHOLDS.nonRecurringShare) {
    diagnostics.push(
      diagnostic(
        'non_recurring_share_material',
        'blocked',
        `Non-recurring items are ${(nonRecurringShare * 100).toFixed(1)}% of pre-tax profit, at or above the ${THRESHOLDS.nonRecurringShare * 100}% share at which the sustainability question is decided by whether they come back. They do not.`,
        'earnings.nonRecurringPretaxGain',
        { nonRecurringShare: round(nonRecurringShare), floor: THRESHOLDS.nonRecurringShare },
      ),
    )
    return verdict('one-off-earnings', 'thesis_refuted', diagnostics, upstream, {
      nonRecurringShare: round(nonRecurringShare),
    })
  }

  // ── 3. the yield, read against its own sector ────────────────────────────
  const context = input.yieldContext ?? {}
  const relativeYield =
    finite(context.dividendYield) && finite(context.sectorMedianDividendYield) && context.sectorMedianDividendYield > 0
      ? context.dividendYield / context.sectorMedianDividendYield
      : null
  if (finite(relativeYield) && relativeYield >= THRESHOLDS.relativeYieldTrap) {
    const unsustainable = finite(reportedPayout) && reportedPayout > 1
    const cutting = context.dividendGuidanceFalling === true
    if (unsustainable || cutting) {
      diagnostics.push(
        diagnostic(
          'yield_is_about_the_price',
          'blocked',
          `The yield is ${round(relativeYield)}× the sector's own median and ${unsustainable ? 'the payout ratio is above 1' : 'the issuer has guided the payment lower'}. That is a price falling towards a payment that is about to be cut, not a return programme.`,
          'yieldContext.dividendYield',
          { relativeYield: round(relativeYield), reportedPayout: round(reportedPayout), multiple: THRESHOLDS.relativeYieldTrap },
        ),
      )
      return verdict('dividend-trap', 'thesis_refuted', diagnostics, upstream, { relativeYield: round(relativeYield) })
    }
    diagnostics.push(
      diagnostic(
        'yield_far_above_sector_median',
        'warn',
        `The yield is ${round(relativeYield)}× the sector median and the payout is covered. That is the shape this methodology is looking for and it is also the shape of a trap, so the contrary evidence section owes this number an answer.`,
        'yieldContext.dividendYield',
        { relativeYield: round(relativeYield) },
      ),
    )
  }

  // ── 4. has the promise itself been reduced ───────────────────────────────
  const programme = input.programme ?? {}
  if (finite(programme.policyRatio) && finite(programme.priorPolicyRatio) && programme.policyRatio < programme.priorPolicyRatio) {
    diagnostics.push(
      diagnostic(
        'return_policy_retreated',
        'blocked',
        'The issuer\'s stated return ratio is below the one it previously stated. The thesis rested on the policy, so a smaller policy is a changed thesis and not a cheaper entry.',
        'programme.policyRatio',
        { policyRatio: round(programme.policyRatio), priorPolicyRatio: round(programme.priorPolicyRatio) },
      ),
    )
    return verdict('return-policy-retreat', 'thesis_refuted', diagnostics, upstream, {
      policyRatio: round(programme.policyRatio),
      priorPolicyRatio: round(programme.priorPolicyRatio),
    })
  }

  // ── 5. is the promise being kept ─────────────────────────────────────────
  const execution = executionPace(programme, diagnostics)
  if (execution.behind) {
    return verdict('announced-not-executed', 'thesis_refuted', diagnostics, upstream, execution.details)
  }

  // ── 6. is the discount this thesis exists to close still there ───────────
  const discount = composition.data?.discountToBase
  if (finite(discount) && discount <= 0) {
    diagnostics.push(
      diagnostic(
        'discount_closed',
        'info',
        'The price is at or above the base-case fair value. There is no discount left for this methodology to be paid for closing — which is the successful end of a thesis and the beginning of a staged exit, not a failure.',
        'composition.discountToBase',
        { discountToBase: round(discount) },
      ),
    )
    return verdict('rerated', 'thesis_intact', diagnostics, upstream, { discountToBase: round(discount) })
  }

  /**
   * ── The tests that must have **run** before this case can be accepted ────
   *
   * Every test above refuses when it finds something. None of them refused, and for
   * three of them that could mean *the input was never there* — a missing sector
   * median silently skips the trap test, missing recurring earnings silently skips the
   * flip, a missing programme silently skips the whole question of whether anything is
   * being returned at all. Skipping a test is not passing it, and a positive
   * classification reached that way is this desk's own name on a company it did not
   * examine. (Same defect class as findings ①②④ on `index.mjs`.)
   */
  for (const [path, ran, message] of [
    [
      'earnings',
      finite(reportedPayout) && finite(recurringPayout),
      'The payout on reported and on recurring earnings is what separates a sustainable return from a one-off, and one of dps, eps or recurringEps is absent.',
    ],
    [
      'earnings.nonRecurringPretaxGain',
      finite(nonRecurringShare),
      'The share of pre-tax profit that is non-recurring was not computable, so the corroborating half of the earnings-quality test did not run.',
    ],
    [
      'yieldContext',
      finite(relativeYield),
      'The yield could not be read against its own sector, so the dividend-trap test did not run. An absolute yield is not a substitute: it compares a bank against a shipbuilder.',
    ],
    [
      'programme',
      finite(programme.policyRatio) || finite(programme.executedAmount),
      'Neither a stated return ratio nor an executed amount is present, so nothing here shows a return programme exists — which is the mechanism this whole methodology rests on.',
    ],
  ]) {
    if (ran) continue
    diagnostics.push(diagnostic('classification_input_missing', 'unevaluated', message, path))
  }

  // ── the absences, only now that nothing has been measured against ────────
  if (!finite(discount) || isUnevaluated(upstream) || isUnevaluated(diagnostics)) {
    diagnostics.push(
      diagnostic(
        'data_missing',
        'unevaluated',
        'Nothing above refuted this case and the inputs needed to accept it are not all here. This is an absence and is recorded as one: it is not evidence of deterioration and must not be filed as a refutation.',
        'input',
        {
          unevaluated: [...upstream, ...diagnostics]
            .filter((row) => row.severity === 'unevaluated')
            .map((row) => row.code),
        },
      ),
    )
    return verdict('data-missing', 'data_missing', diagnostics, upstream, {})
  }

  const completed = new Set(input.completedOutputs ?? [])
  const missingOutputs = REQUIRED_OUTPUTS.filter((name) => !completed.has(name))
  if (missingOutputs.length > 0) {
    diagnostics.push(
      diagnostic(
        'research_incomplete',
        'unevaluated',
        `This case survives every test and the run has not finished it: ${missingOutputs.join(', ')} ${missingOutputs.length === 1 ? 'is' : 'are'} not written. An unfinished thesis is not a rejected one, and the next run is told where it stopped.`,
        'completedOutputs',
        { missing: missingOutputs },
      ),
    )
    return verdict('research-incomplete', 'research_incomplete', diagnostics, upstream, { missing: missingOutputs })
  }

  return verdict('shareholder-rerating', 'thesis_intact', diagnostics, upstream, {
    discountToBase: round(discount),
    relativeYield: finite(relativeYield) ? round(relativeYield) : null,
    executionPace: execution.details.pace ?? null,
  })
}

/**
 * How far through its own window the programme is, and how much of it is done.
 *
 *   executionRate = executedAmount / announcedAmount
 *   elapsedShare  = min(1, elapsedDays / windowDays)
 *   pace          = executionRate / elapsedShare
 *
 * ⚠️ Before `executionObservableElapsed` of the window has run, a low pace is
 * arithmetic and not a fact — a programme three days into a year has bought nothing
 * and is not behind. That case is `unevaluated`, and the run comes back at the next
 * progress disclosure rather than recording a shortfall it cannot yet see.
 */
function executionPace(programme, diagnostics) {
  const { announcedAmount, executedAmount, windowDays, elapsedDays } = programme
  if (!finite(announcedAmount) || announcedAmount <= 0) {
    return { behind: false, details: {} }
  }
  if (!finite(executedAmount) || !finite(windowDays) || !finite(elapsedDays) || windowDays <= 0) {
    diagnostics.push(
      diagnostic(
        'execution_progress_unknown',
        'unevaluated',
        'A programme was announced and how much of it has been executed is not readable. Announced is a sentence and executed is a transaction; without the second, this run cannot say the policy is being kept.',
        'programme.executedAmount',
      ),
    )
    return { behind: false, details: {} }
  }
  const executionRate = executedAmount / announcedAmount
  const elapsedShare = Math.min(1, Math.max(0, elapsedDays / windowDays))
  if (elapsedShare < THRESHOLDS.executionObservableElapsed) {
    diagnostics.push(
      diagnostic(
        'execution_not_yet_observable',
        'unevaluated',
        `Only ${(elapsedShare * 100).toFixed(1)}% of the programme's own window has run, below the ${THRESHOLDS.executionObservableElapsed * 100}% at which Korean progress disclosure makes the pace a filed fact. Nothing is concluded from it.`,
        'programme.elapsedDays',
        { executionRate: round(executionRate), elapsedShare: round(elapsedShare) },
      ),
    )
    return { behind: false, details: { executionRate: round(executionRate), elapsedShare: round(elapsedShare) } }
  }
  const pace = executionRate / elapsedShare
  const details = { executionRate: round(executionRate), elapsedShare: round(elapsedShare), pace: round(pace), floor: THRESHOLDS.executionPaceFloor }
  if (pace < THRESHOLDS.executionPaceFloor) {
    diagnostics.push(
      diagnostic(
        'programme_announced_not_executed',
        'blocked',
        `${(executionRate * 100).toFixed(1)}% of the programme is done with ${(elapsedShare * 100).toFixed(1)}% of its window gone — a pace of ${round(pace)} against its own straight-line schedule, below ${THRESHOLDS.executionPaceFloor}. The announcement is the evidence for the announcement and nothing else.`,
        'programme.executedAmount',
        details,
      ),
    )
    return { behind: true, details }
  }
  diagnostics.push(
    diagnostic(
      'programme_being_executed',
      'info',
      `The programme is running at ${round(pace)}× its own straight-line schedule. This is the evidence the entry rule asks for: a policy that is being executed rather than one that has been announced.`,
      'programme.executedAmount',
      details,
    ),
  )
  return { behind: false, details }
}

function payout(dps, eps) {
  return finite(dps) && finite(eps) && eps > 0 ? dps / eps : null
}

function verdict(caseLabel, outcomeCode, diagnostics, upstream, details) {
  return {
    data: {
      case: caseLabel,
      route: ROUTES[caseLabel],
      outcomeCode,
      details,
    },
    diagnostics: [...upstream, ...diagnostics],
  }
}
