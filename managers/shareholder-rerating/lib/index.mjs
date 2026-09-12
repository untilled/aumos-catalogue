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

export { finite, round, diagnostic, instantOf, isBlocked, isUnevaluated } from './numbers.mjs'
export { THRESHOLDS, SIZING_POLICY } from './thresholds.mjs'
export { returnComposition } from './return-composition.mjs'
export { capitalHeadroom, ISSUER_KINDS } from './capital-headroom.mjs'
export { classifyCase, REQUIRED_OUTPUTS, ROUTES } from './classify.mjs'
export { lossToInvalidation, targetWeight } from './sizing.mjs'
export { sizingPolicy } from './policy.mjs'
export { stagedIncrement } from './staged-plan.mjs'
export { concentration, heldAttribution } from './concentration.mjs'

/**
 * ── The discovery half (#305) ──────────────────────────────────────────────
 *
 * Everything above answers a question about one company that is already in front of
 * the run. These four answer the step before that: which names this run looked at,
 * what it carries between runs, which return programme each announcement and each
 * receipt belongs to, and whose word a web reading is.
 *
 * ⛔ They are deliberately **not** folded into `evaluateCase`. That function is one
 * company's arithmetic and a discovery sweep is the run's, and a single entry point
 * over both would make a run that never swept anything indistinguishable from one that
 * swept and found nothing — which is the exact defect #305 exists to refuse.
 */
export { discoveryRun, screenCandidate, LANE_STATUSES, DISCOVERY_STATUSES, REQUIRED_LANES, OPTIONAL_LANES, CURSOR_KIND, CANDIDATE_AXES, DISCOVERY_DEFAULTS } from './discovery.mjs'
export { candidateLedger, CANDIDATE_STATES, CANDIDATE_TRANSITIONS, CANDIDATE_CAPS, CANDIDATE_SCHEMA_VERSION, FORBIDDEN_KEYS, STRATEGY } from './candidate-memory.mjs'
export { returnProgramme, programmeKey, ANNOUNCED_KINDS, PROGRAMME_SCHEMA_VERSION } from './programme.mjs'
export {
  attestationOf,
  attestationAnswers,
  attestationCounts,
  weakerAttestation,
  strongestAttestation,
  webReadingRecord,
  ATTESTATION_GRADES,
  WEB_READING_SOURCE_TYPES,
  MANAGER_ATTESTED_SOURCE_PREFIX,
  MANAGER_OBSERVATION_KIND,
  MANAGER_OBSERVATION_SOURCE,
  OBSERVATION_EXCERPT_LIMIT,
  OBSERVATION_READING_LIMIT,
} from './attestation.mjs'

import { diagnostic, finite, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'
import { returnComposition } from './return-composition.mjs'
import { capitalHeadroom } from './capital-headroom.mjs'
import { classifyCase } from './classify.mjs'
import { lossToInvalidation, targetWeight } from './sizing.mjs'
import { sizingPolicy } from './policy.mjs'
import { concentration, heldAttribution } from './concentration.mjs'

/**
 * @param {object} input  one candidate, as the run has assembled it
 * @returns {{data: object, diagnostics: object[]}}
 */
export function evaluateCase(input = {}) {
  const composition = returnComposition(input.valuation ?? {})
  /**
   * ⚠️ **Two words that both look like «sector», and they answer to different people
   * (#269).** `input.issuerKind` is 기업 분석용 업종 — bank, insurer, broker, operating
   * company — and this package decides it from filings, because it selects which
   * capital arithmetic is even meaningful. `input.sector` is the fund's
   * risk-management sector, the host's consistent classification of the whole account,
   * and this package only ever reads it: it is what a Mandate's sector ceiling is
   * measured over, down in `concentration`. `sectorKind` is the retired name of the
   * first and is still read so an older caller gets a diagnostic rather than a throw.
   */
  const capital = capitalHeadroom({
    issuerKind: input.issuerKind ?? input.sectorKind,
    classification: input.classification,
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
    /**
     * ⛔ **The one weight the host may be handed (#817).** «The whole position
     * should be this» — every holding of this name that is *not* this manager's,
     * plus what this manager means to hold after the run. `null` where this run
     * proposes no order, because a weight is an instruction and there is none.
     */
    hostTargetWeight: null,
    heldWeight: null,
    /** Holdings of this name assigned to this manager. ⚠️ The number every reduction here is measured against (#819). */
    ownHeldWeight: null,
    /** Holdings of this name that are not this manager's — another manager's, and every unattributed one. */
    otherHeldWeight: null,
    /**
     * ⛔ **The weight no `position-weight` total handed to the host may go below
     * (#819).** The host executes against the whole position and reads no
     * attribution while doing it, so a target under this number sells a holding
     * this run does not run. Closing this desk's position out **is** this number;
     * an `exit` — a real `0` — is right only when it is `0`.
     */
    hostTargetWeightFloor: null,
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
     * ── The routes that propose a **sale**, and whose position they are about (#819) ──
     *
     * ⛔ **`heldWeight` is the whole position and this branch used to judge on
     * it.** `trim-or-exit-review` and `reject` reached `RESIZE` the moment the
     * account held **anything** of the name, whoever it belonged to — so a 6%
     * holding bought by hand in a broker app, or one whose approval never named
     * a manager, came back from this package as a reduction and the host sold
     * it. Measured against the real host, all three of these routes answered
     * identically on this desk's position, on another manager's and on an
     * unattributed one.
     *
     * ⚠️ **`untilled/aumos#817` fixed the same sentence one branch over.**
     * `position_above_target`, inside the buy path, already tests `ownHeld` and
     * records `excess_is_not_this_managers_to_reduce`. These routes return
     * before that branch is ever reached, so the sentence had to be said again
     * here.
     *
     * ⚠️ **The classification is about the company and stands whether or not the
     * book was read; the action is about the account and does not.** A `rerated`
     * name with an unreadable book is still `rerated`, and this run still
     * proposes nothing.
     *
     * ⛔ **This is not «nobody may touch an unattributed position»**
     * (`untilled/aumos#782`). A buy into one still leaves here as a buy, and the
     * moment the investor assigns the position on the approval screen
     * (`untilled/aumos#785`) `otherHeld` is 0 and every reduction works exactly
     * as it did.
     */
    const attribution = heldAttribution({
      holdings: bookReadable ? input.book.holdings : null,
      symbol: input.symbol,
      strategy: input.strategy,
    })
    base.ownHeldWeight = attribution.ownHeld
    base.otherHeldWeight = attribution.otherHeld
    base.hostTargetWeightFloor = attribution.otherHeld
    base.proposedAction = bookReadable ? actionFor(classified.data.route, attribution.ownHeld) : 'WAIT'
    if (!bookReadable) base.outcomeCode = 'data_missing'
    /**
     * ⚠️ **A run that did not name itself is not a run that owns nothing — but it
     * is a run that cannot prove it owns anything.** `strategy` is what the
     * holding's own `strategy` is compared against, so without it every row
     * lands in `otherHeld` and no reduction can leave. That is a defect in the
     * call rather than a finding about the book, and it is reported as one.
     */
    if (bookReadable && attribution.held > 0 && input.strategy === undefined) {
      diagnostics.push(
        diagnostic(
          'run_did_not_name_its_strategy',
          'unevaluated',
          'This account holds the name and this run did not say which manager instance it is, so no holding here can be matched to it and no reduction can be attributed. Pass `strategy`: guessing from cost and quantity is what `aumos-catalogue#268` §1 forbids, and assuming the position is this desk\'s is the assumption that sells somebody else\'s.',
          'strategy',
          { held: attribution.held },
        ),
      )
    }
    if (bookReadable && attribution.otherHeld > 0) {
      diagnostics.push(
        attribution.ownHeld > 0
          ? diagnostic(
              'reduction_is_bounded_by_anothers_holding',
              'info',
              `${attribution.otherHeld} of this ${attribution.held} position is another manager's or nobody's. The reduction this run proposes is against its own ${attribution.ownHeld} and no further, expressed as a total weight at or above ${attribution.otherHeld} — never as an exit, which is a real 0 and would liquidate their holding with this desk's.`,
              'book.holdings',
              { held: attribution.held, ownHeld: attribution.ownHeld, otherHeld: attribution.otherHeld, hostTargetWeightFloor: attribution.otherHeld },
            )
          : diagnostic(
              'reduction_is_not_this_managers_to_make',
              'info',
              `This name is ${attribution.held} of the account and none of it is assigned to this manager, so there is nothing here for this run to reduce. The finding about the company stands; the order does not follow from it, because the shares are somebody else's or nobody's and this package is not what makes that decision.`,
              'book.holdings',
              { held: attribution.held, ownHeld: attribution.ownHeld, otherHeld: attribution.otherHeld },
            ),
      )
    }
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
  /**
   * ── The Mandate travels with the caps (`untilled/aumos#838`) ──────────────
   *
   * ⚠️ **`maxPositionWeight` and `cashFloor` are the account's two declared
   * ceilings and this package reads neither under those names.** Handing the
   * Mandate down beside `caps` is what lets `mandate.mjs` fill them in where the
   * caller stated none — a run given the Mandate exactly as it arrives used to
   * report `position_cap_not_stated` and wait. ⛔ `mandate.caps` still wins
   * wherever it states something.
   */
  const account = { holdings: book.holdings, openProposals: book.openProposals, caps: { mandate, ...(mandate.caps ?? {}) }, strategy: input.strategy }

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
  base.ownHeldWeight = exposure.data.ownHeld
  base.otherHeldWeight = exposure.data.otherHeld
  /** ⚠️ #819: the same floor the review routes publish, on the path that sizes as well. */
  base.hostTargetWeightFloor = exposure.data.otherHeld
  base.projectedExposure = exposure.data.projectedExposure
  base.projectedGrossExposure = exposure.data.projectedGrossExposure
  base.maxTotalWeightBinding = exposure.data.maxTotalWeightBinding

  /**
   * ── The two numbers the Mandate cannot carry (`untilled/aumos#841`) ───────
   *
   * ⚠️ **`riskBudgetWeight` and `minimumExecutableWeight` have no producer in this
   * host at all**, so reading them off the Mandate meant every run handed the
   * investor's own Mandate sized nothing and waited. `policy.mjs` answers both from
   * this package's pre-registration once the Mandate has actually been read, and
   * answers neither when no Mandate arrived. ⛔ Stated still wins over both.
   */
  const policy = sizingPolicy({ mandate, book, config: input.config })
  diagnostics.push(...policy.diagnostics)

  const sized = targetWeight({
    riskBudgetWeight: policy.riskBudgetWeight ?? undefined,
    lossFraction: loss.data.lossFraction,
    mandatePositionCap: mandate.mandatePositionCap,
    mandate,
    accountNameLimit: exposure.data.maxTotalWeightForName ?? undefined,
    /** ⚠️ #833: the ceilings that name *this position*, which is what a sale is sized by. */
    accountNameLimitForReduction: exposure.data.reductionNameLimit ?? undefined,
    minimumExecutableWeight: policy.minimumExecutableWeight ?? undefined,
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

  /**
   * ── The reduction question, asked before the ceilings that only bound additions (#833) ──
   *
   * ⛔ **Both refusals below are about a purchase, and until #833 they answered
   * first.** A target the venue cannot express and a target of zero are reasons
   * not to *buy*; a book already above what this desk should hold is a reason to
   * *sell*, and the two refusals deleted that order on their way past. Measured:
   * a 6% position wholly this desk's went nowhere at all once another desk's
   * names filled the sector to within one venue-minimum of its ceiling.
   *
   * ⚠️ **The question is asked against `reduceTargetTotalWeight`, and asked
   * once.** On an account with nothing else in the bucket that is the same
   * number as `targetTotalWeight` and this block is entered on exactly the same
   * rows as before.
   */
  const reduceTarget = sized.data.reduceTargetTotalWeight
  const entryTarget = sized.data.targetTotalWeight
  const reduces = finite(reduceTarget) && reduceTarget - exposure.data.existingExposure < -THRESHOLDS.weightTolerance

  if (!reduces) {
    if (!finite(entryTarget)) {
      const unexecutable = sized.diagnostics.some((row) => row.code === 'minimum_executable_not_met')
      /**
       * ⚠️ **An invalidation price that arrived and is unusable is not an absence** (#254,
       * #271 ③.5). `invalidation_price_missing` is `data_missing` — nothing to divide by.
       * `invalidation_above_entry` and `invalidation_price_not_positive` are a level
       * somebody wrote and nobody can trade at, and the work of writing the real one is
       * this run's: `research_incomplete`, so the next run resumes at that section
       * instead of waiting for a field that will never arrive.
       */
      const invalidationUnusable = loss.diagnostics.some((row) => row.severity === 'blocked')
      return wait(base, diagnostics, unexecutable ? 'position_not_executable' : invalidationUnusable ? 'research_incomplete' : 'data_missing')
    }
    if (entryTarget <= 0) {
      return wait(base, diagnostics, 'risk_limit_exceeded')
    }
  }

  // ── the total, minus what the account already carries ────────────────────
  const increment = (reduces ? reduceTarget : entryTarget) - exposure.data.existingExposure

  if (reduces) {
    base.targetTotalWeight = reduceTarget
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
    /**
     * ⛔ **«The account is above it» is a reduction question about *this desk's*
     * holding, and #817 is where that sentence stops being ambiguous.** The
     * comment below already said it about pending proposals — an excess made of
     * somebody else's unapproved proposal is theirs to withdraw. The same
     * sentence has to hold for a **holding**: a 6% position assigned to nobody,
     * on a run this package sizes at 5%, used to reach `RESIZE` and hand the
     * host a target that sold a third of a position no judgement on this fund
     * ever asked to reduce. So the test is `ownHeld`, not the whole position.
     *
     * ⚠️ **This is not «nobody may touch an unattributed position».** That is the
     * state `untilled/aumos#782` undid and `untilled/aumos#786` was explicitly
     * kept away from. This desk may still *buy* into an unattributed name — the
     * BUY path below adds to `otherHeld` rather than replacing it — and once the
     * investor assigns the position on the approval screen (`untilled/aumos#785`)
     * every reduction here works exactly as it did. What it may not do is shrink
     * a position nobody made it responsible for.
     */
    const ownHeld = exposure.data.ownHeld ?? 0
    base.proposedAction = ownHeld > reduceTarget + THRESHOLDS.weightTolerance ? 'RESIZE' : 'WAIT'
    base.hostTargetWeight = base.proposedAction === 'RESIZE' ? round(exposure.data.otherHeld + reduceTarget) : null
    if (ownHeld < heldWeight - THRESHOLDS.weightTolerance) {
      diagnostics.push(
        diagnostic(
          'excess_is_not_this_managers_to_reduce',
          'info',
          `${round(exposure.data.otherHeld)} of this name is held by another manager or by nobody at all, and this run is not responsible for it. The reduction this package proposes is against its own ${round(ownHeld)} and no further: a target weight covering the whole position would sell somebody else's holding, and the host executes it against the whole position.`,
          'book.holdings',
          { held: round(heldWeight), ownHeld: round(ownHeld), otherHeld: round(exposure.data.otherHeld), targetTotalWeight: reduceTarget },
        ),
      )
    }
    diagnostics.push(
      diagnostic(
        'position_above_target_weight',
        'warn',
        `This name is already ${round(exposure.data.existingExposure)} of the account and the arithmetic sizes it at ${round(reduceTarget)}. Adding to it because the thesis is intact would be sizing the increment and not the position.`,
        'book',
        { existingExposure: exposure.data.existingExposure, targetTotalWeight: reduceTarget, heldWeight },
      ),
    )
    diagnostics.push(...roomNotFolded({ reduceTarget, entryTarget, exposure, hostTargetWeight: base.hostTargetWeight }))
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
        { existingExposure: exposure.data.existingExposure, targetTotalWeight: entryTarget },
      ),
    )
    diagnostics.push(...roomNotFolded({ reduceTarget, entryTarget, exposure, hostTargetWeight: null }))
    return wait(base, diagnostics, 'position_at_target')
  }

  base.incrementWeight = round(increment)

  /**
   * The venue minimum applies to the **order**, which is the increment. A target that
   * clears it can still be reached by an addition that does not.
   */
  if (increment + 1e-12 < policy.minimumExecutableWeight) {
    diagnostics.push(
      diagnostic(
        'increment_below_minimum_executable',
        'blocked',
        'The addition this stage asks for is below the smallest order this venue can express. It waits for the target to move away from the holding rather than being rounded up to something nothing calculated.',
        'minimumExecutableWeight',
        { incrementWeight: round(increment), minimumExecutableWeight: round(policy.minimumExecutableWeight) },
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

  /**
   * ── The weight that leaves this package, and it is not `targetTotalWeight` (#817) ──
   *
   *     hostTargetWeight = otherHeld + (ownHeld + incrementWeight)
   *                      = held + incrementWeight
   *
   * ⛔ **`incrementWeight` is what this run adds and the host takes no
   * increments.** `decision_submit` carries a `position-weight` *total*, and
   * `rebalanceShadowBook` executes it against the whole position without reading
   * whose it is (`untilled/aumos#815`). So the total has to be assembled here,
   * and it is assembled out of the part of the position this run is not
   * entitled to move plus the part it is.
   *
   * ⚠️ **Holdings, never `existingExposure`.** The second folds in every open
   * proposal, and an open proposal is not a position: buying up to somebody
   * else's unfilled total would be this run executing their unapproved
   * judgement. That is the second answer to «how much did this judgement ask
   * for» that `untilled/aumos#781` refused.
   *
   * ⚠️ **Nothing here widens what this package may hold.** The increment already
   * passed both concentration passes; what is added is what the account already
   * has and this run is leaving alone.
   */
  base.hostTargetWeight = round(exposure.data.otherHeld + (exposure.data.ownHeld ?? 0) + increment)

  base.proposedAction = 'BUY'
  return { data: base, diagnostics }
}

/** Every way this run declines to propose, in one place, so none of them forgets a field. */
/**
 * ── What the account's leftover room would have made this run do (#833) ─────
 *
 * ⛔ **A control nobody can measure is a restatement.** This package now sizes a
 * sale by the ceilings that name the position and not by what a sector or the
 * whole book has left after other names, and the order that difference deletes
 * has to be reported next to the one that goes out — `untilled/aumos#782`'s
 * sentence about reductions is only checkable if both numbers are on the page.
 *
 * ⚠️ **It says nothing when the two folds agree**, which is every account with
 * nothing else in the bucket, and it says nothing on a purchase: an addition is
 * bounded by the account's room, that is #813, and the entry fold reports it as
 * `maxTotalWeightBinding` all by itself.
 *
 * ⚠️ **Two states reach it and they are one sentence.** The account is above what
 * it has room for, and this run is either reducing its own holding by a
 * different number than the room would have named, or is not reducing at all —
 * the ceiling made this name's room zero and a liquidation is not what follows
 * from that. `hostTargetWeight` is what leaves; `hostTargetWeightIfRoomFolded`
 * is what used to.
 */
function roomNotFolded({ reduceTarget, entryTarget, exposure, hostTargetWeight }) {
  if (!finite(reduceTarget) && !finite(entryTarget)) return []
  if (finite(reduceTarget) && finite(entryTarget) && reduceTarget === entryTarget) return []
  const otherHeld = exposure.data.otherHeld ?? 0
  const ownHeld = exposure.data.ownHeld ?? 0
  const wouldHave =
    finite(entryTarget) && ownHeld > entryTarget + THRESHOLDS.weightTolerance ? round(otherHeld + entryTarget) : null
  /** Whose names fill the bucket that produced the remainder, read off the axis that bound it. */
  const bucket =
    exposure.data.maxTotalWeightBinding === 'accountGrossCap'
      ? round((exposure.data.grossExposure ?? 0) - exposure.data.existingExposure)
      : exposure.data.maxTotalWeightBinding === 'accountSectorCap'
        ? round((exposure.data.sectorExposure ?? 0) - exposure.data.existingExposure)
        : null
  const insteadOf =
    wouldHave === null
      ? 'the reduction that remainder would have named'
      : ownHeld > 0 && wouldHave <= otherHeld + THRESHOLDS.weightTolerance
        ? `${wouldHave}, which is this desk's share of it reduced to nothing`
        : String(wouldHave)
  return [
    diagnostic(
      'reduction_is_not_sized_by_the_accounts_remaining_room',
      'info',
      `Every declared axis folded together leaves this name ${finite(entryTarget) ? round(entryTarget) : 'nothing'} of the account${bucket === null ? '' : `, because ${bucket} of the bucket ${exposure.data.maxTotalWeightBinding} measures is other names`}. That is the ceiling on what may be **added** here and it is not a size for a position that is already held: a sector or gross limit states no division of itself between the names under it, so reading its remainder as this position's target hands the whole adjustment to whichever name was evaluated last. This reduction is measured against ${finite(reduceTarget) ? round(reduceTarget) : 'nothing'} — ${exposure.data.reductionNameLimitBinding ?? 'the ceilings that name this position'} and the risk arithmetic — so the host is handed ${hostTargetWeight === null ? 'no weight at all' : hostTargetWeight} and not ${insteadOf}. The excess the account really is carrying stands, and the axis that names it says so.`,
      'book',
      {
        reduceTargetTotalWeight: finite(reduceTarget) ? reduceTarget : null,
        entryTargetTotalWeight: finite(entryTarget) ? entryTarget : null,
        maxTotalWeightBinding: exposure.data.maxTotalWeightBinding,
        reductionNameLimitBinding: exposure.data.reductionNameLimitBinding,
        ownHeld,
        otherHeld,
        hostTargetWeight,
        hostTargetWeightIfRoomFolded: wouldHave,
      },
    ),
  ]
}

function wait(base, diagnostics, outcomeCode) {
  base.route = 'wait'
  base.outcomeCode = outcomeCode
  base.proposedAction = 'WAIT'
  if (base.incrementWeight === null) base.incrementWeight = 0
  return { data: base, diagnostics }
}

/**
 * Which action a route reaches, and it depends on whether **this manager** already
 * holds it.
 *
 * ⚠️ **A refuted thesis on a name nobody owns is a `WAIT`, not a `SELL`.** There is
 * nothing to sell, and a package that returned `SELL` on every rejection would fill an
 * investor's approval queue with orders against positions that do not exist.
 *
 * ⛔ **And «nobody owns» means «this desk does not own», not «the account holds
 * none» (#819).** The parameter was the whole position, so a holding assigned to
 * another manager — or to nobody at all, which is every share bought by hand in a
 * broker app — reached `RESIZE` here and the host sold it. It is `ownHeld` now, and
 * `hostTargetWeightFloor` carries what is left alone.
 *
 * ⛔ **`RESIZE` and not `EXIT`, and the difference is deliberate.** A re-rated name and
 * a retreating policy are reasons to stage a position down against a fair value, which
 * is a size. Full liquidation belongs to a hard risk breach, and that judgement — what
 * counts as one, and on what evidence — is prose in `PROMPT.md` rather than a branch
 * here, because the arithmetic cannot tell a breach from a bad week.
 */
function actionFor(route, ownHeldWeight = 0) {
  if (route === 'watch') return 'WATCH'
  if (route === 'trim-or-exit-review' || route === 'reject') return ownHeldWeight > 0 ? 'RESIZE' : 'WAIT'
  return 'WAIT'
}
