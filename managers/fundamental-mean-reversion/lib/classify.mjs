/**
 * The one function that says which case this is, in a fixed order.
 *
 * ── Why the order is the design ────────────────────────────────────────────
 *
 * Every failure this package guards against is a case answered by the wrong
 * branch: an artefact read as a fall, an absence read as a refutation, a broken
 * low read as patience, a structurally damaged business read as an oversold one.
 * A model asked to weigh those together will weigh them differently on the day
 * it wants the trade. So they are not weighed — they are asked in an order, and
 * the first one that answers wins:
 *
 *   ⑴ can the series be read at all?          → `data-missing` / `price-artifact-suspected`
 *   ⑵ does this fund already hold it?          → the review branch, which may not answer WAIT
 *   ⑶ is this even the kind of fall we trade?  → `uptrend-pullback…` / `out-of-scope`
 *   ⑷ is the business damaged?                 → `structural-earnings-damage`
 *   ⑸ has the fall stabilised?                 → `falling-knife` / `stabilization-unconfirmed`
 *   ⑹ is the thesis actually finished?         → `research-incomplete`
 *   ⑺ does the book have room?                 → `risk-limit-exceeded`
 *   ⑻ otherwise                                → `mean-reversion-candidate`
 *
 * ⚠️ **⑴ before ⑶ is the #248 ordering and it is load-bearing.** A series that
 * steps by a factor produces a drawdown that passes ⑶ easily; asking ⑶ first
 * would classify the artefact as an opportunity and then look for a business
 * reason for a fall that never happened.
 *
 * ⚠️ **⑷ before ⑸ is deliberate too.** A business with permanent earnings damage
 * stabilises like any other — at a price that is now correct. Reaching the
 * stabilisation branch first would produce a technically perfect entry into a
 * value that is gone.
 *
 * ⛔ **Absence is never refutation** (#254, and this package changes none of its
 * policy). `structural-earnings-damage` is reached **only** with evidence ids
 * behind it; the same claim with nothing behind it is `research-incomplete`.
 */
import { DIAGNOSIS_CODES, OUTCOMES, OUTCOME_WEIGHT_ROLES, VERDICT_ACTIONS, diagnostic, finite, round } from './core.mjs'
import { adjustmentBasis, discoveryState, normalizeBars, technicalState } from './prices.mjs'
import { stabilisation as stabilisationTest } from './stabilisation.mjs'

/** The damage findings the business half of the thesis may reach. */
export const DAMAGE_KINDS = Object.freeze({
  intact: 'the earning power the price fell away from is still there',
  'one-off-impairment': 'a charge that hits the reported figure once and not the cash the business earns',
  'investment-phase': 'spending that suppresses reported profit while the revenue it is buying is still ahead',
  'operating-deterioration': 'the operating business earns less than it did, and not because of one charge',
  'monetisation-failure': 'the spending happened and the revenue it was for did not arrive',
  unknown: 'not yet established',
})

/** The two findings that refute this methodology's thesis rather than delay it. */
const REFUTING_DAMAGE = new Set(['operating-deterioration', 'monetisation-failure'])

/**
 * #259's 필수 산출물, as a checklist the run can be held to. Present/absent only
 * — nothing here judges whether a paragraph is any good, and pretending
 * otherwise would report a pass it did not establish.
 */
export function requiredOutputs(input = {}, computed = {}) {
  const { business = {}, research = {}, sizing = null } = input
  const filled = (value) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0)
  return {
    fallDecomposition: filled(research.fallCauses),
    businessIntactEvidence: filled(business.evidenceIds),
    /**
     * ⚠️ These two were hardcoded `true` on the argument that they are always
     * computed. A checklist entry that cannot be `false` checks nothing, and
     * both *can* be absent — a refused series produces no technical state and no
     * stabilisation reading at all.
     */
    technicalState: filled(computed.technical),
    stabilisationObservation: filled(computed.stabilisation),
    targetDerivation: filled(research.targetBasis),
    refutationConditions: filled(research.invalidationPrice) && filled(research.invalidationConditions),
    maximumWait: finite(research.maxWaitDays),
    /**
     * ⚠️ `null` — «not applicable yet» — when no sizing was reached or the
     * sizing was refused. `false` here would report a missing output for a
     * position the book had no room for, which is a finding about the book
     * dressed as unfinished research (#254's distinction, one branch over).
     */
    cumulativeStagedTarget: sizing && sizing.status !== 'refused' ? finite(sizing.plannedTotalWeight) : null,
    targetWeightAndDownside: sizing && sizing.status !== 'refused' ? finite(sizing.targetTotalWeight ?? sizing.targetWeight) && finite(sizing.downsideValue) : null,
    reviewAndEvidenceIds: filled(research.reviewAt) && filled(research.evidenceIds),
  }
}

/**
 * `input`:
 *   `asOf`      the invocation's instant, verbatim
 *   `series`    `{ adjustment, corporateActions, corporateActionsComplete, rows }`
 *   `business`  `{ damage, evidenceIds }`
 *   `research`  `{ fallCauses, targetBasis, invalidationPrice, invalidationConditions,
 *                 maxWaitDays, reviewAt, evidenceIds, complete }`
 *   `position`  `{ held, weight }`
 *   `review`    `{ invalidationTriggered, deadlineElapsed, targetReached }`
 *   `sizing`    `positionSizing`'s answer, when one was computed
 */
export function classifyCase(input = {}) {
  const { asOf, series = {}, business = {}, research = {}, position = {}, review = {}, sizing = null } = input
  const diagnostics = []

  const basis = adjustmentBasis(series, diagnostics)
  const normalised = normalizeBars(series.rows ?? series.bars, asOf)
  diagnostics.push(...normalised.diagnostics)
  const state = technicalState(normalised.bars)
  const discovery = discoveryState(state)

  /**
   * ── Whose position is being reviewed, and what that costs a sale (#819) ───
   *
   * `untilled/aumos#817` put the write-direction conversion on the **buy** path
   * — `hostTargetWeight = otherHeldWeight + targetTotalWeight` — and the review
   * branch below never saw it. Measured against the real host, the three review
   * outcomes came back **identical** on a position this desk runs, on one
   * another manager runs, and on one assigned to nobody: no `sizing` on the
   * answer, so neither number crossed, and an `exit` over a 6% unattributed
   * holding was `sell:60` — the whole position, most of it somebody else's.
   *
   * The two numbers come from the same place the buy path takes them from,
   * `positionSizing`'s `exposure` — holdings only, never `otherWeight`, because
   * an unfilled proposal is not a position and the host executes positions.
   *
   * ⚠️ **`null` is «the account was not folded», and it is not zero.** A review
   * reached without a sizing answer has no attribution at all, and a `0` here
   * would read as «nobody else holds this», which is the permissive reading.
   */
  const heldExposure = sizing?.exposure ?? null
  const ownHeldWeight = finite(heldExposure?.ownHeldWeight) ? heldExposure.ownHeldWeight : null
  const otherHeldWeight = finite(heldExposure?.otherHeldWeight) ? heldExposure.otherHeldWeight : null
  /**
   * ⛔ **The weight no target handed to the host may go below.** The host
   * executes a `position-weight` total against the **whole** position and reads
   * no attribution while doing it (`untilled/aumos#815`), so a target below
   * `otherHeldWeight` sells a holding this desk does not run. Closing this
   * thesis out is this number exactly — and it is `0`, the host's `exit`, only
   * when nobody else holds the name. That is `catalyst-turnaround`'s rule
   * (`hostTargetWeight = otherHeld` on a `close-out`) said in the one form this
   * branch can say it: a floor rather than a target, because a re-adjudication
   * is not sized here.
   */
  const hostTargetWeightFloor = otherHeldWeight
  /** Held, and none of it this desk's: there is nothing here for this run to reduce. */
  const positionIsWhollyAnothers = ownHeldWeight === 0 && otherHeldWeight !== null && otherHeldWeight > 0
  /**
   * ⚠️ **What the account holds in this name, whoever runs it** — the quantity
   * the host's `position-weight` target is executed against
   * (`untilled/aumos#815`). `ownHeldWeight` is this desk's share of it and the
   * two must not be read for each other: on an unattributed 6% the first is 0
   * and the second is 0.06.
   */
  const positionWeight = ownHeldWeight === null || otherHeldWeight === null ? null : round(ownHeldWeight + otherHeldWeight)
  /**
   * ⛔ **The entry arithmetic, under a name that says so (#823).** Every ceiling
   * that produced it is «the cap less what other strategies hold», so it is what
   * this desk may *hold* — an answer to the buying question, computed before any
   * judgement was reached. `hostTargetWeightFor` below decides what each
   * judgement does with it, and no branch reads it directly.
   */
  const entryTargetTotalWeight = finite(sizing?.targetTotalWeight) ? sizing.targetTotalWeight : null

  /**
   * ── The one total this answer may hand the host, by what the outcome does (#823) ──
   *
   * `OUTCOME_WEIGHT_ROLES` is the table and `lib/core.mjs` carries the argument
   * for it. What matters here is that the number is chosen **after** the outcome
   * is known and never before, because the defect this closes was one number
   * computed without a judgement and then attached to any of them.
   *
   * ⚠️ **`null` is «the account was not folded», exactly as it is for the floor.**
   * A review reached with no sizing answer knows no attribution, and inventing a
   * `0` there would read as «nobody else holds this».
   */
  const hostTargetWeightFor = (role) => {
    if (ownHeldWeight === null || otherHeldWeight === null) return null
    if (role === 'standstill') return positionWeight
    if (entryTargetTotalWeight === null) return null
    if (role === 'increase') return round(otherHeldWeight + entryTargetTotalWeight)
    /** ⛔ A ceiling and never a floor: `min` cannot raise this desk's share, so a real reduction is untouched. */
    return round(otherHeldWeight + Math.min(entryTargetTotalWeight, ownHeldWeight))
  }

  /**
   * ⛔ **An `exit` is a real `0` and bypasses every weight computed above.** So
   * where somebody else holds part of the name it is not offered: `SELL` leaves
   * the list and the reduction has to be expressed as a `RESIZE` to a total at
   * or above the floor. Where **none** of the position is this desk's, neither
   * is offered — the review still happens and is still written down, and what
   * it leaves open is a `WATCH`.
   *
   * ⚠️ **This is not «nobody may touch an unattributed position»**
   * (`untilled/aumos#782`). The buy path adds to `otherHeldWeight` rather than
   * replacing it and still leaves as a buy; and where the position is this
   * desk's, `otherHeldWeight` is 0, nothing below fires, and every trim, resize
   * and exit this methodology ever made still leaves.
   */
  const actionsFor = (verdict) => {
    const published = VERDICT_ACTIONS[verdict]
    if (verdict !== 'TRIM' && verdict !== 'RE_ADJUDICATE') return published
    if (otherHeldWeight === null || otherHeldWeight <= 0) return published
    return Object.freeze(positionIsWhollyAnothers ? ['WATCH'] : published.filter((action) => action !== 'SELL'))
  }

  const answer = (outcome, verdict, code, extra = {}) => {
    if (!OUTCOMES.includes(outcome)) throw new Error(`unknown outcome ${outcome}`)
    if (code !== null && !DIAGNOSIS_CODES.includes(code)) throw new Error(`unknown diagnosis code ${code}`)
    /**
     * ⛔ **An outcome with no role throws.** A default would be a fourteenth
     * branch nobody wrote down, and «whatever the sizing answered» is the
     * default that #823 is about.
     */
    const weightRole = OUTCOME_WEIGHT_ROLES[outcome]
    if (weightRole === undefined) throw new Error(`no weight role for outcome ${outcome}`)
    const hostTargetWeight = hostTargetWeightFor(weightRole)
    /**
     * ⚠️ **Measured, not restated.** `catalyst-turnaround` carried an
     * `increasesExposure` that was the intent said a second time, and it read
     * `false` on an answer that bought. This is the comparison of the two
     * numbers this answer actually carries and nothing else, so a total that
     * disagrees with the judgement is visible in the answer itself.
     */
    const exposureDirection = hostTargetWeight === null || positionWeight === null
      ? null
      : hostTargetWeight > positionWeight ? 'increase' : hostTargetWeight < positionWeight ? 'reduce' : 'unchanged'
    /**
     * ⛔ **One field named `hostTargetWeight` in the whole answer, and it is the
     * role's.** The review branch carries the `sizing` answer (#819) and that
     * answer carries `positionSizing`'s entry-direction total under the same
     * name; two numbers with one name is how a reduction sent a purchase. The
     * entry arithmetic is not hidden — it stays on `targetTotalWeight`, under
     * the name that says whose share it is.
     */
    const carriedSizing = extra.sizing && typeof extra.sizing === 'object'
      ? { ...extra.sizing, hostTargetWeight, hostTargetWeightRole: weightRole }
      : extra.sizing
    if (carriedSizing && weightRole === 'reduce' && entryTargetTotalWeight !== null && ownHeldWeight !== null && entryTargetTotalWeight > ownHeldWeight) {
      diagnostics.push(diagnostic(
        'reduction_target_clamped_to_own_holding',
        'info',
        `This outcome reduces, and the entry arithmetic sized this thesis's share at ${entryTargetTotalWeight} against the ${ownHeldWeight} it holds. Sent as the position's total that is a purchase out of a judgement to reduce, so the total handed to the host is bounded by what this desk holds: ${hostTargetWeight}`,
        'sizing.targetTotalWeight',
        { outcome, weightRole, entryTargetTotalWeight, ownHeldWeight, otherHeldWeight, hostTargetWeight },
      ))
    }
    if (carriedSizing && weightRole === 'standstill' && hostTargetWeight !== null && entryTargetTotalWeight !== null && hostTargetWeight !== round(otherHeldWeight + entryTargetTotalWeight)) {
      diagnostics.push(diagnostic(
        'standstill_total_is_the_position_as_held',
        'info',
        `This outcome changes no position, so the total it hands the host is what the account holds in this name today (${hostTargetWeight}) and not the entry arithmetic's ${round(otherHeldWeight + entryTargetTotalWeight)}. A weight that moves the position is not a by-product of an answer that decided not to move it`,
        'sizing.hostTargetWeight',
        { outcome, weightRole, entryTargetTotalWeight, positionWeight, hostTargetWeight },
      ))
    }
    return {
      outcome,
      verdict,
      /**
       * The AMP actions this outcome leaves open. `RE_ADJUDICATE` leaves neither
       * WAIT nor WATCH — and where part of the position is not this desk's, it
       * no longer leaves `SELL` either (#819).
       */
      ampActions: actionsFor(verdict),
      /** Holdings of this name assigned to this manager. `null` where no sizing folded the book. */
      ownHeldWeight,
      /** Holdings of this name that are **not** this manager's — another's, and every unattributed one. */
      otherHeldWeight,
      /** What the account holds in this name whoever runs it — the quantity the host's target is executed against. */
      positionWeight,
      /** What this outcome asks the position to do: `increase`, `reduce` or `standstill` (#823). */
      weightRole,
      /**
       * ⛔ **The `position-weight` total this answer may hand the host**, chosen
       * by `weightRole` and never by the sizing alone. `null` where the account
       * was not folded.
       */
      hostTargetWeight,
      /** `hostTargetWeight` against `positionWeight`, recomputed rather than restated. */
      exposureDirection,
      /**
       * ⛔ **No `position-weight` total this run hands the host may be below
       * this (#819).** A close-out of this thesis *is* this number; `0` — the
       * host's `exit` — only when it is `0`.
       */
      hostTargetWeightFloor,
      /** One of #256's four, or `null` when the run reached a judgement of its own. */
      code,
      /**
       * ⚠️ `null` whenever the series could not be read: a lens assigned off a
       * drawdown taken over an unreadable history is the artefact naming the
       * methodology it belongs to.
       */
      lens: extra.lens !== undefined ? extra.lens : discovery?.researchOpen && !discovery?.uptrendPullback ? 'fundamental-mean-reversion' : null,
      adjustmentBasis: basis,
      technical: state,
      discovery,
      stabilisation: extra.stabilisation ?? null,
      requiredOutputs: requiredOutputs(input, { technical: state, stabilisation: extra.stabilisation ?? null }),
      diagnostics,
      ...extra,
      /** ⛔ After `extra`, because the sizing that leaves here is the role's and never the raw one (#823). */
      ...(extra.sizing === undefined ? {} : { sizing: carriedSizing }),
    }
  }

  // ⑴ ── can the series be read at all?
  const blocking = diagnostics.filter((row) => row.severity === 'blocked')
  if (!basis.usable || blocking.length > 0) {
    const artefact = blocking.some((row) => row.code === 'price_series_discontinuity_suspected')
    return answer(
      artefact ? 'price-artifact-suspected' : 'data-missing',
      'WATCH',
      'data_missing',
      { lens: null, blocking: blocking.map((row) => row.code) },
    )
  }

  const stabilisation = stabilisationTest(normalised.bars, state)
  diagnostics.push(...stabilisation.diagnostics)

  /**
   * ⛔ **A book that says this manager already holds the name, against a run
   * that did not say so.** `position.held` defaults to absent, and absent
   * skipped the whole review branch — so a run that failed to read its own
   * position went straight to the discovery path and proposed a *new* entry on
   * a thesis it never reviewed. The sizing answer knows better: it folds the
   * book and attributes exposure per strategy, so the contradiction is
   * detectable rather than having to be trusted.
   */
  const ownExposure = sizing?.exposure?.ownWeight ?? null
  if (position.held !== true && finite(ownExposure) && ownExposure > 0) {
    return answer('data-missing', 'WATCH', 'data_missing', {
      stabilisation,
      note: `The book attributes ${ownExposure} of exposure in this name to this strategy and the run did not report holding it. Until the two agree the review branch cannot run, and a new entry proposed over an unreviewed position is the review being skipped rather than passed`,
    })
  }

  // ⑵ ── this fund already holds it: the review branch.
  if (position.held === true) {
    /**
     * ⛔ **The door above locks one way, and this is the other (#819).** The
     * check before this branch catches «the book says this strategy holds it and
     * the run did not» and calls it missing data. The reverse — the run holds
     * it and the book attributes **none** of it here — is not missing data at
     * all: the book is explicit, and it says the position belongs to somebody
     * else or to nobody. Refusing it as `data_missing` would be this package
     * declining to review a thesis because of an assignment it does not own,
     * and a position bought by hand in a broker app would become one no manager
     * may ever look at — the state `untilled/aumos#782` undid.
     *
     * So the review runs and is written down. What changes is what leaves:
     * `SELL` is withdrawn, the floor carries the part of the position this run
     * is not entitled to move, and the reader is told which of the three states
     * the book put it in.
     */
    if (positionIsWhollyAnothers) {
      diagnostics.push(diagnostic(
        'reviewed_position_is_not_this_desks',
        'info',
        `The run reports holding this name and the book attributes none of the ${otherHeldWeight} it carries to this strategy — another manager's, or nobody's. The review still stands: it is a judgement about the thesis, and the book is what says whose position it is. What it may not do is end in a sale, because the only shares there are somebody else's`,
        'sizing.exposure',
        { ownHeldWeight, otherHeldWeight },
      ))
    } else if (otherHeldWeight !== null && otherHeldWeight > 0) {
      diagnostics.push(diagnostic(
        'reduction_is_bounded_by_anothers_holding',
        'info',
        `${otherHeldWeight} of this position is not this strategy's. A reduction is proposed as a total weight at or above that floor and never as an exit: an exit target is a real 0 and would liquidate their holding with this one`,
        'sizing.exposure',
        { ownHeldWeight, otherHeldWeight, hostTargetWeightFloor },
      ))
    } else if (otherHeldWeight === null) {
      diagnostics.push(diagnostic(
        'review_exposure_unread',
        'info',
        'This review was reached without a sizing answer, so the account was never folded and this run does not know which part of the position is its own. A reduction sent from here is sent against the whole position: hand `positionSizing`\'s answer in, or propose no weight',
        'sizing',
        { ownHeldWeight, otherHeldWeight },
      ))
    }
    /**
     * ⛔ **A held position with nothing said about its review is unadjudicated,
     * not clean.** Each flag was read as `=== true`, so an absent `review`
     * object meant «no invalidation, no target, no elapsed deadline» — three
     * passes nobody granted. At least one has to be an explicit boolean.
     */
    const stated = ['invalidationTriggered', 'deadlineElapsed', 'targetReached'].filter((name) => typeof review[name] === 'boolean')
    if (stated.length === 0) {
      return answer('data-missing', 'WATCH', 'data_missing', {
        stabilisation,
        note: 'This position is held and the run stated none of the three review conditions as a boolean. An unadjudicated review is missing data: it is not the same as a review that found nothing, and only the second of those may be followed by holding on',
      })
    }
    if (review.invalidationTriggered === true) {
      return answer('invalidated-re-adjudicate', 'RE_ADJUDICATE', 'thesis_refuted', {
        stabilisation,
        /** ⚠️ #819: the review branch carries the sizing so the two attribution numbers travel with the answer. */
        sizing,
        note: 'An invalidation condition the thesis named in advance has been met. The position is resized or closed, or the thesis is re-judged in writing; it is not reclassified as a longer-term holding so that the stop and the deadline stop applying',
      })
    }
    if (review.deadlineElapsed === true) {
      return answer('deadline-elapsed-re-adjudicate', 'RE_ADJUDICATE', null, {
        stabilisation,
        /** ⚠️ #819: the review branch carries the sizing so the two attribution numbers travel with the answer. */
        sizing,
        note: 'The maximum wait the thesis set has passed without the recovery. The absence of the move is not a refutation of the business claim, and it is also not a reason to keep waiting silently: the wait is re-judged and either restated with a new deadline or ended',
      })
    }
    if (review.targetReached === true) {
      return answer('target-reached-trim', 'TRIM', null, {
        stabilisation,
        /** ⚠️ #819: the review branch carries the sizing so the two attribution numbers travel with the answer. */
        sizing,
        note: 'The recovery target was reached. This methodology stages out rather than exiting on one print',
      })
    }
  }

  // ⑶ ── is this the kind of fall this methodology trades?
  if (discovery?.uptrendPullback) {
    return answer('uptrend-pullback-not-this-strategy', 'WAIT', null, {
      stabilisation,
      note: 'The price is above its 200-bar average and within 5% of its 120-bar one. That is a pullback inside an uptrend — a real trade, and not this one. Being below the 200-bar average is not an exclusion here; being above it is what says the price never left its normal range',
    })
  }
  if (!discovery?.researchOpen) {
    return answer('out-of-scope', 'WAIT', null, {
      stabilisation,
      note: 'The drawdown gate, or both corroborating readings, are unmet. This is a research-priority finding and not a judgement about the business',
    })
  }

  // ⑷ ── is the business damaged?
  const damage = business.damage ?? 'unknown'
  const evidenced = Array.isArray(business.evidenceIds) && business.evidenceIds.length > 0
  if (REFUTING_DAMAGE.has(damage)) {
    if (!evidenced) {
      return answer('research-incomplete', 'WATCH', 'research_incomplete', {
        stabilisation,
        note: `A finding of ${damage} was asserted with no evidence behind it. An unsupported claim of damage is missing research, not a refutation`,
      })
    }
    return answer('structural-earnings-damage', 'WAIT', 'thesis_refuted', {
      stabilisation,
      note: `${DAMAGE_KINDS[damage]}. The fall is not excessive relative to the damage, so there is no reversion for this methodology to take`,
    })
  }
  if (damage === 'unknown' || !Object.hasOwn(DAMAGE_KINDS, damage)) {
    return answer('research-incomplete', 'WATCH', 'research_incomplete', {
      stabilisation,
      note: 'Whether the fall is a temporary shock or permanent earnings damage has not been established. That is the question this methodology exists to answer and it is not skipped because the technical state is attractive',
    })
  }
  if (!evidenced) {
    return answer('research-incomplete', 'WATCH', 'research_incomplete', {
      stabilisation,
      note: 'The claim that the business is intact carries no evidence ids',
    })
  }

  // ⑸ ── has the fall stabilised?
  if (stabilisation.outcome === 'data-missing') {
    return answer('data-missing', 'WATCH', 'data_missing', { stabilisation })
  }
  if (stabilisation.outcome === 'falling-knife') {
    return answer('falling-knife', 'WATCH', null, {
      stabilisation,
      note: 'A new low is still being made. Oversold is not an entry and this is the case in which it is most tempting to treat it as one',
    })
  }
  if (stabilisation.outcome === 'stabilization-unconfirmed') {
    return answer('stabilization-unconfirmed', 'WATCH', null, {
      stabilisation,
      note: `The pre-registered stabilisation evidence is not there yet: ${(stabilisation.unmet ?? []).join(', ')}. This is a different state from a falling knife and from missing data, and it is not a reason to loosen a condition`,
    })
  }

  // ⑹ ── is the thesis actually finished?
  const outputs = requiredOutputs(input, { technical: state, stabilisation })
  const missingOutputs = Object.entries(outputs).filter(([, present]) => present === false).map(([name]) => name)
  if (research.complete === false || missingOutputs.length > 0) {
    return answer('research-incomplete', 'WATCH', 'research_incomplete', {
      stabilisation,
      missingOutputs,
      note: 'The priority candidate is carried to a finished thesis or it is left with a stated reason and a re-review condition. A shallow pass over several promising names is not a run of this methodology',
    })
  }

  // ⑺ ── does the book have room?
  if (sizing && sizing.status === 'refused') {
    if (sizing.code === 'risk_limit_exceeded') {
      return answer('risk-limit-exceeded', 'WAIT', 'risk_limit_exceeded', {
        stabilisation,
        note: 'The thesis is intact and the book has no room for it. That distinction is the whole of this branch',
      })
    }
    return answer('research-incomplete', 'WATCH', sizing.code ?? 'research_incomplete', { stabilisation, note: 'The position could not be sized' })
  }
  if (!sizing) {
    diagnostics.push(diagnostic('sizing_absent', 'info', 'No sizing was handed in, so the buy case is stated without a weight', 'sizing'))
    return answer('research-incomplete', 'WATCH', 'research_incomplete', { stabilisation, note: 'A buy case without a target weight and a downside figure is not a finished one' })
  }
  /**
   * ⛔ **A reading the sizing could not take may not authorise a buy.** A
   * `blocked` diagnostic already refuses inside `positionSizing`, but an
   * `unevaluated` one — a halt state nobody declared, say — travelled all the
   * way here on an `ok` answer and reached BUY. Only an explicitly passed check
   * authorises an entry; an unevaluated one is research that is not finished.
   */
  const unevaluated = (sizing.diagnostics ?? []).filter((row) => row.severity === 'unevaluated' || row.severity === 'blocked')
  if (unevaluated.length > 0) {
    return answer('research-incomplete', 'WATCH', 'research_incomplete', {
      stabilisation,
      sizing,
      unevaluatedSizing: unevaluated.map((row) => row.code),
      note: `The sizing carries reading(s) it could not evaluate — ${unevaluated.map((row) => row.code).join(', ')}. An unevaluated check is not a passed one, and the weight it produced rests on whichever value was assumed in its place`,
    })
  }
  /**
   * ⚠️ The already-complete position, as its own answer. It is neither a risk
   * limit nor a refutation: the thesis stands and there is nothing to buy.
   */
  if (sizing.atOrAboveTarget === true) {
    return answer('target-weight-already-held', 'WAIT', null, {
      stabilisation,
      sizing,
      note: `This thesis already holds its whole target weight of ${sizing.targetTotalWeight}, so the increment is zero. The position is complete rather than blocked, and saying so is what keeps a zero increment from reading as «no room»`,
    })
  }

  // ⑻ ── otherwise.
  return answer('mean-reversion-candidate', 'BUY', null, {
    stabilisation,
    sizing,
    note: 'A fall this methodology researches, a business whose earning power the evidence says is intact, the pre-registered stabilisation evidence present, a finished thesis and room in the book',
  })
}
