import { INTENTS, INTENT_WEIGHT_ROLES, METHODOLOGY } from './constants.mjs'
import { DAY_MS, blocked, cause, diagnostic, finite, instantOf, round } from './diagnostics.mjs'
import { catalystLedger } from './ledger.mjs'
import { caseClassification } from './classify.mjs'
import { financialSurvivability, recoveryComparison } from './recovery.mjs'
import { accountConcentration, lossToInvalidation, targetWeight } from './sizing.mjs'
import { stagedPlan } from './staging.mjs'
import { scoreboards } from './scoreboard.mjs'

/**
 * ── The ladder ────────────────────────────────────────────────────────────
 *
 * One run, one answer, and the order the questions are asked in is the
 * methodology. It is written as a ladder rather than a score because the
 * findings are not commensurable: a cancelled catalyst and a thin cash position
 * are not two negative points to be added, they are two different decisions,
 * and a weighted score would turn either of them into «slightly smaller».
 *
 * ⛔ **The ladder is fixed and a fixture asserts each rung.** #258 asks that
 * catalyst realisation, one delay, repeated delay, cancellation, a reversing
 * recovery indicator and a deteriorating refinancing each produce a *different*
 * judgement and a *different* review — «a package where every case ends in WAIT
 * is not a success» is the exact failure this replaces.
 *
 * ⚠️ **Nothing here reads a share price as a reason to hold.** Price enters in
 * two places only: the distance to the price invalidation, which sizes, and the
 * progress toward the target, which trims. A price that rose while a catalyst
 * slipped is not an argument, and the ladder never asks it for one.
 */

const REVIEW_KINDS = Object.freeze(['post-close-risk', 'catalyst-window', 'earnings', 'deadline-adjudication'])

function review(name, { at = null, kind = 'post-close-risk', reason, benchmarkComparisonRequired = false } = {}) {
  if (!REVIEW_KINDS.includes(kind)) throw new Error(`unknown review kind ${kind}`)
  return { name, kind, atEpochMs: at, reason, benchmarkComparisonRequired }
}

function priceProgress({ entryPrice, price, targetPrice }) {
  if (![entryPrice, price, targetPrice].every(finite)) return null
  if (targetPrice === entryPrice) return null
  return round((price - entryPrice) / (targetPrice - entryPrice))
}

export function runVerdict(input = {}) {
  const diagnostics = []
  const causes = []
  const config = { ...METHODOLOGY, ...(input.config ?? {}) }
  const asOfInstant = instantOf(input.asOf)
  if (asOfInstant === null) {
    return {
      data: { intent: 'wait-for-data', review: review('as-of-unreadable', { reason: 'Every judgement in this package is pinned to asOf and there is no default' }) },
      diagnostics: [diagnostic('as_of_unreadable', 'blocked', 'asOf did not parse', 'asOf')],
      causes: [cause('data_missing', 'This run has no asOf and therefore no point in time to judge at', 'asOf')],
    }
  }

  // ── the parts, each computed once ────────────────────────────────────────
  /**
   * ⛔ **Nothing on this line may use `??` to invent an input.** Each of the
   * coalescing defaults that used to be here turned an unread source into a
   * permissive one: an absent book became an empty book, an absent register
   * became a register with no delays in it, an absent cap became this package's
   * own ceiling. `undefined` is passed through deliberately so the module below
   * can tell «nobody read this» from «this was read and is empty».
   */
  const strategy = input.strategy ?? 'catalyst-turnaround'
  const ledger = catalystLedger({ previous: input.register?.catalysts, rows: input.catalysts ?? [], transitions: input.transitions ?? [], asOf: input.asOf, config })
  const recovery = recoveryComparison({ indicators: input.indicators ?? [], asOf: input.asOf })
  const survivability = financialSurvivability({ ...(input.financials ?? {}), config })
  const classification = caseClassification({
    ...(input.case ?? {}),
    improvingChannelCount: recovery.data.improvingChannelCount ?? 0,
    cashFlowLinked: recovery.data.cashFlowLinked === true,
  })
  const concentration = accountConcentration({
    positions: input.book?.positions,
    proposals: input.book?.proposals,
    caps: input.book?.caps ?? {},
    strategy,
    /**
     * ⚠️ **`input.sector` is the fund's risk-management sector and not this
     * package's view of the business (#269).** It is the host's classification of
     * the whole account, and it is the only one a Mandate's sector ceiling can be
     * measured over. Passing it is what lets a declared ceiling this run cannot
     * evaluate reach `mayIncrease` as `data_missing`.
     */
    candidate: { symbol: input.symbol ?? null, sector: input.sector ?? null },
  })
  const invalidation = lossToInvalidation({ price: input.price?.last, invalidationPrice: input.price?.invalidationPrice })
  /**
   * ⚠️ With the book unread there is no headroom number, and `undefined` is what
   * says so. It used to fall through `??` to `unusedHeadroom` — the full house
   * ceiling — which is how an account nobody could read authorised a full-sized
   * position.
   */
  const headroom = concentration.data.readable === true ? (concentration.data.headroom[input.symbol] ?? concentration.data.unusedHeadroom) : undefined
  const sizing = targetWeight({
    expectedActiveReturn: input.sizing?.expectedActiveReturn,
    stopDistance: invalidation.data.stopDistance,
    conviction: input.sizing?.conviction,
    mandatePositionCap: input.sizing?.mandatePositionCap,
    accountHeadroom: headroom,
    config,
  })
  const plan = input.plan ? stagedPlan({ previous: input.register?.plan, plan: input.plan, price: input.price?.last, asOf: input.asOf }) : null
  const scores = scoreboards({ catalysts: ledger.data.rows, price: input.scoring?.price ?? {}, benchmark: input.scoring?.benchmark ?? null })

  const parts = [ledger, recovery, survivability, classification, concentration, invalidation, sizing, scores, ...(plan ? [plan] : [])]
  for (const part of parts) {
    diagnostics.push(...(part.diagnostics ?? []))
    causes.push(...(part.causes ?? []))
  }

  const summary = ledger.data.summary ?? {}
  const held = input.held === true
  const progress = priceProgress({ entryPrice: input.price?.entryPrice, price: input.price?.last, targetPrice: input.price?.targetPrice })
  const nextWindowEnd = Math.min(...ledger.data.current.filter((row) => row.windowEndEpochMs !== null).map((row) => row.windowEndEpochMs), Number.POSITIVE_INFINITY)
  const windowEnd = Number.isFinite(nextWindowEnd) ? nextWindowEnd : null

  /**
   * ── What is held, split three ways, and the names say whose ──────────────
   *
   * `cumulativeTargetWeight` is «this desk's share should be this».
   * `incrementThisRun` is «buy this much more, now». What separates them is what
   * is held *already*, so it is read from the book rather than assumed to be zero
   * on the entry path.
   *
   * ⚠️ **This field was called `currentWeight` until `untilled/aumos#821`**, and
   * it never meant «what this position currently weighs» — it has always been
   * *this strategy's share of it*. Over a 6% holding assigned to nobody it
   * answered `0` while the account plainly held 6%, which is a true sentence
   * under one reading and a false one under the reading its name invited. The
   * whole-position number now exists beside it under its own name, and neither
   * has to be inferred from the other.
   */
  const ownHeldWeight = concentration.data.readable === true
    ? (concentration.data.ownHeld?.[input.symbol] ?? 0)
    : null

  /**
   * ⚠️ **What is held here and is not this desk's (#817).** Another manager's
   * holding of this name plus every unattributed one — holdings only, no open
   * proposals. `null` where the book was not read, because 0 would be a claim
   * about an account nobody saw.
   */
  const otherHeldWeight = concentration.data.readable === true
    ? (concentration.data.otherHeld?.[input.symbol] ?? 0)
    : null

  /**
   * ⚠️ **What the account holds in this name, whoever runs it
   * (`untilled/aumos#821`).** `ownHeldWeight + otherHeldWeight`, and the number
   * the host's `targetWeight` is differenced against when an order is formed —
   * so it is what «does this judgement increase the exposure?» has to be asked
   * of. `null` where the book was not read.
   */
  const positionWeight = concentration.data.readable === true
    ? (concentration.data.positionHeld?.[input.symbol] ?? 0)
    : null

  /**
   * ⛔ **The structural rule, stated once instead of at every rung.** A run
   * holding any `data_missing` may not increase an exposure — not by a staged
   * entry, not by a due stage, not by a resize upward. This is the single line
   * that would have refused all three of the failures found in #265, and it
   * exists because the alternative is remembering the check at each of nine
   * rungs. It never refutes anything: absence stays absence.
   */
  const unread = causes.filter((entry) => entry.code === 'data_missing')
  const mayIncrease = unread.length === 0

  const context = {
    classification: classification.data.classification,
    qualifiesAsPosition: classification.data.qualifiesAsPosition,
    improvingChannels: recovery.data.improvingChannels ?? [],
    meetsChannelFloor: recovery.data.meetsChannelFloor === true,
    cashFlowLinked: recovery.data.cashFlowLinked === true,
    survivable: survivability.data.survivable,
    catalyst: summary,
    priceProgress: progress,
    ownHeldWeight,
    otherHeldWeight,
    positionWeight,
    cumulativeTargetWeight: sizing.data.targetWeight ?? null,
    accountHeadroom: headroom ?? null,
    bookReadable: concentration.data.readable === true,
    sectorLimitState: concentration.data.sectorState ?? null,
    registerRead: summary.registerRead === true,
    delayCountKnown: summary.delayCountKnown === true,
    mayIncrease,
    unreadInputs: unread.map((entry) => entry.path ?? 'unknown'),
    stagedAddition: plan?.data.addedThisRun ?? null,
    scores: scores.data,
    /**
     * ⚠️ Read, not merely carried. It used to sit here unused — a declared input
     * the implementation never looked at, which is #265's fourth finding. It can
     * only ever **withhold**: `false` refuses an entry, and an absent reading is
     * uncertainty on a secondary datum (#256), never a qualification.
     */
    stabilised: input.price?.stabilised ?? null,
    stabilisationWindowDays: config.stabilisationWindowDays,
  }

  const decide = () => {
    // ── rung 0: the run cannot judge at all ────────────────────────────────
    if (blocked(diagnostics)) {
      causes.push(cause('data_missing', 'One or more inputs is malformed or missing, so this run cannot judge or size. Recorded as an absence — it says nothing about the thesis', 'inputs'))
      return {
        intent: 'wait-for-data',
        review: review('inputs-unreadable', { at: asOfInstant + DAY_MS, reason: 'Re-read the refused inputs on the next post-close review' }),
      }
    }

    if (held) {
      // ── rung 1: the event will not happen ───────────────────────────────
      if (summary.cancelled > 0) {
        causes.push(cause('thesis_refuted', 'The catalyst was cancelled, not postponed. There is no window left to wait for and the reason to hold has gone with it', 'catalysts'))
        return {
          intent: 'close-out',
          review: review('catalyst-cancelled', { at: asOfInstant, kind: 'deadline-adjudication', reason: 'A cancellation ends the thesis; what remains is an exit, not a wait', benchmarkComparisonRequired: true }),
        }
      }
      // ── rung 2: a declared business invalidation fired ──────────────────
      if ((recovery.data.reversedChannels ?? []).length > 0) {
        return {
          intent: 'reduce-on-invalidation',
          review: review('recovery-indicator-reversed', { at: asOfInstant, kind: 'earnings', reason: `${recovery.data.reversedChannels.join(', ')} moved the wrong way, and the thesis named that channel in advance as an invalidation condition`, benchmarkComparisonRequired: true }),
        }
      }
      // ── rung 3: the thesis stands and the balance sheet does not ────────
      if (survivability.data.survivable === false) {
        return {
          intent: 'resize-to-risk-limit',
          review: review('survivability-breach', { at: asOfInstant, kind: 'post-close-risk', reason: 'Runway or refinancing coverage fell through the floor. This is a size decision, not a verdict on the recovery', benchmarkComparisonRequired: false }),
        }
      }
      /**
       * ── rung 3a: the balance sheet was not read ──────────────────────────
       *
       * ⛔ `=== false` was the whole test and `null` walked past it. That is
       * #265's second finding exactly: only an explicit failure refused, so an
       * unadjudicable one passed. A held position with unread financials is
       * held unchanged and the gap is named — it is not resized, because
       * resizing on an absence would treat it as a breach.
       */
      if (survivability.data.survivable === null) {
        return {
          intent: 'hold',
          review: review('survivability-unread', { at: asOfInstant + DAY_MS, kind: 'post-close-risk', reason: `Survivability could not be judged: ${(survivability.data.unread ?? []).join(', ') || 'the financial inputs did not arrive'}. The position is unchanged and nothing is added` }),
        }
      }
      /**
       * ── rung 3b: the record this judgement would rest on was not read ────
       *
       * ⛔ Below every remaining rung sits a delay count, and without the
       * register there is not one. A third slip would read as a first and be
       * held through. So the position is left exactly as it is — no add, no
       * extension, no adjudication — and the run says which record it could not
       * read. It is not an exit: absence is not a refutation.
       */
      if (summary.registerRead !== true) {
        return {
          intent: 'hold',
          review: review('register-unread', { at: asOfInstant + DAY_MS, kind: 'post-close-risk', reason: 'The catalyst register did not arrive, so no delay count is known and no deadline may be extended on this run. Nothing is added and nothing is closed' }),
        }
      }
      // ── rung 4: the extensions have run out ─────────────────────────────
      if (summary.delayExhausted === true) {
        return {
          intent: 'exit-review',
          review: review('delay-exhausted', { at: asOfInstant, kind: 'deadline-adjudication', reason: `More than ${config.maxDelays} delays on one catalyst. The remaining question is whether this capital beats the benchmark alternative from here`, benchmarkComparisonRequired: true }),
        }
      }
      // ── rung 5: a deadline arrived and nobody called it ─────────────────
      if ((summary.dueForAdjudication ?? []).length > 0) {
        return {
          intent: 'exit-review',
          review: review('deadline-adjudication', { at: asOfInstant, kind: 'deadline-adjudication', reason: `The window on ${summary.dueForAdjudication.join(', ')} closed unadjudicated. Call it success, delay or failure before deciding anything else`, benchmarkComparisonRequired: true }),
        }
      }
      // ── rung 6: it worked, and the price says so ────────────────────────
      if (summary.realised > 0 && finite(progress) && progress >= config.trimPriceProgress) {
        return {
          intent: 'trim-into-realisation',
          review: review('post-realisation-trim', { at: input.nextEarningsAtEpochMs ?? null, kind: 'earnings', reason: `The confirming indicator arrived and ${round(progress * 100, 2)}% of the path to the target is in the price. The recovery is what was bought; the remainder is a different bet`, benchmarkComparisonRequired: true }),
        }
      }
      // ── rung 7: it slipped, inside the budget of slips ──────────────────
      if (summary.delayed > 0) {
        return {
          intent: 'hold-through-delay',
          review: review('delay-extended', { at: windowEnd, kind: 'catalyst-window', reason: 'The deadline moved on stated new evidence, with the remaining expected return and the additional downside written down. The next review is the new window end, not a rolling interval' }),
        }
      }
      // ── rung 8: a planned stage came due ────────────────────────────────
      // ⚠️ `mayIncrease` is the structural gate: a stage may not fire while any
      // declared input is unread, whichever rung failed to read it.
      if (mayIncrease && finite(plan?.data.addedThisRun) && plan.data.addedThisRun > 0) {
        return {
          intent: 'add-next-stage',
          review: review('stage-filled', { at: windowEnd, kind: 'catalyst-window', reason: `Stage conditions met; ${plan.data.addedThisRun} added against a cumulative target of ${plan.data.cumulativeTargetWeight}` }),
        }
      }
      return {
        intent: 'hold',
        review: review('scheduled-review', { at: windowEnd, kind: 'catalyst-window', reason: 'The catalyst is still ahead and nothing in the ledger changed' }),
      }
    }

    // ── the entry side ───────────────────────────────────────────────────
    if (!classification.data.qualifiesAsPosition) {
      return {
        intent: 'research-watch',
        review: review(classification.data.classification === 'research-candidate' ? 'earnings-path-untraced' : 'not-a-turnaround', {
          at: null,
          kind: 'catalyst-window',
          reason: classification.data.reason,
        }),
      }
    }
    if (summary.current === 0) {
      causes.push(cause('research_incomplete', `No registered catalyst has a window inside ${config.catalystHorizonDays} days of asOf, so there is nothing this hold could be scoped to`, 'catalysts'))
      return { intent: 'research-watch', review: review('no-window-in-horizon', { kind: 'catalyst-window', reason: 'Re-open when a window is registered inside the horizon' }) }
    }
    if (!context.meetsChannelFloor || !context.cashFlowLinked) {
      return {
        intent: 'research-watch',
        review: review('recovery-not-yet-a-path', { kind: 'earnings', reason: `${context.improvingChannels.length} improving channel(s) against the ${config.minImprovingChannels} this methodology asks for, cash-flow link ${context.cashFlowLinked ? 'present' : 'absent'}` }),
      }
    }
    /**
     * ⛔ **`=== true`, not `!== false`.** A purchase is authorised by a check
     * that ran and passed, never by one that could not be run. The unread case
     * is caught by `mayIncrease` below and reported as `data_missing`; this line
     * is here so that a future edit removing that gate still cannot buy on a
     * `null`.
     */
    if (survivability.data.survivable !== true) {
      return {
        intent: 'research-watch',
        review: review('survivability-fails', {
          kind: 'post-close-risk',
          reason: survivability.data.survivable === false
            ? 'The recovery may be real and the company does not reach it unaided'
            : `Survivability was not judged: ${(survivability.data.unread ?? []).join(', ') || 'the financial inputs did not arrive'}`,
        }),
      }
    }
    /**
     * Price stabilisation, finally read. It **withholds and never qualifies**:
     * an explicit `false` refuses the entry, and an absent reading is uncertainty
     * on a secondary datum rather than a gate — which is #256's own rule about
     * supporting data, and the reason the deepest fall is still never preferred.
     */
    if (input.price?.stabilised === false) {
      return {
        intent: 'research-watch',
        review: review('stabilisation-not-confirmed', { kind: 'catalyst-window', reason: `The price has not stabilised over the ${config.stabilisationWindowDays}-session window. This is a secondary confirmation: it can make this manager wait and it never makes it buy` }),
      }
    }
    if (input.price?.stabilised === null || input.price?.stabilised === undefined) {
      diagnostics.push(
        diagnostic('stabilisation_unread', 'unevaluated', `Price stabilisation over ${config.stabilisationWindowDays} sessions was not read. It is a secondary confirmation, so its absence is uncertainty on this judgement rather than a reason to refuse one`, 'price.stabilised'),
      )
    }
    /**
     * ⛔ The structural gate. Every unread cap, book or register lands here, in
     * one place, and the answer is a WAIT carrying the names of what was not
     * read — never a smaller position, and never a refutation.
     */
    if (!mayIncrease) {
      return {
        intent: 'wait-for-data',
        review: review('inputs-unread', { at: asOfInstant + DAY_MS, kind: 'post-close-risk', reason: `No position may be opened while ${unread.map((entry) => entry.path ?? 'an input').join(', ')} is unread. An unread limit is not an absent one` }),
      }
    }
    if (finite(headroom) && headroom <= 0) {
      return { intent: 'blocked-by-account-limit', review: review('account-limit-taken', { kind: 'post-close-risk', reason: 'Holdings and open proposals elsewhere already fill this name’s account limit' }) }
    }
    if (!finite(sizing.data.targetWeight) || sizing.data.targetWeight <= 0) {
      return {
        intent: 'research-watch',
        review: review('odds-not-worth-taking', { kind: 'catalyst-window', reason: 'At the stated expected return, invalidation distance and conviction the arithmetic sizes this at zero. That is an answer, not a rounding problem' }),
      }
    }
    /**
     * The case that had no defined behaviour: the book already holds at or above
     * what this run would target. The increment is zero and the honest answer is
     * that there is nothing to do — not a purchase of the full target again.
     */
    if (finite(ownHeldWeight) && ownHeldWeight >= sizing.data.targetWeight - 1e-9) {
      return {
        intent: 'hold',
        review: review('already-at-target', { at: windowEnd, kind: 'catalyst-window', reason: `The book already holds ${ownHeldWeight} of this desk's own against a cumulative target of ${sizing.data.targetWeight}. The increment is zero` }),
      }
    }
    return {
      intent: 'enter-staged',
      review: review('staged-entry-armed', { at: windowEnd, kind: 'catalyst-window', reason: `Entering in stages toward a cumulative ${sizing.data.targetWeight} of the book, reviewed at the catalyst window end` }),
    }
  }

  const outcome = decide()

  /**
   * ── A reduction of a position none of which is this desk's (#821) ─────────
   *
   * ⛔ **The rung above judged the *thesis*; this line asks whose *position* it
   * is.** They are two different questions and this package only ever asked the
   * first. A cancelled catalyst is still a cancelled catalyst over a holding
   * assigned to nobody — the review is right and stays armed — but «reduce it»
   * is not this desk's sentence to say about a position it does not run.
   *
   * ⚠️ **The word is withdrawn and the judgement is not.** `#278` settled this
   * next door in as many words: *the review runs; only the sale does not go
   * out.* Reporting it as `data_missing` instead would make every holding
   * bought by hand in a broker app un-reviewable, which is
   * `untilled/aumos#782`'s «safely do nothing» coming straight back. The book
   * was read and it said something definite.
   *
   * ⛔ **Only on an exactly-zero own share, and only with the book read.** A
   * desk holding *part* of the name still reduces its part — the clamp below is
   * what keeps that inside its own share — and an unread book cannot claim
   * anything about whose the position is.
   */
  if (held && concentration.data.readable === true && ownHeldWeight === 0) {
    const withdrawn = INTENT_WEIGHT_ROLES[outcome.intent] === 'reduce' || INTENT_WEIGHT_ROLES[outcome.intent] === 'close'
    diagnostics.push(
      diagnostic(
        'held_position_is_not_this_desks',
        'note',
        withdrawn
          ? `This run reached ${outcome.intent} over a position none of which is this desk's: ${otherHeldWeight} of the book is another manager's or assigned to nobody and none of it is this strategy's. The review stands and is armed; the reduction is not this desk's to make, so the intent is withdrawn to reduction-not-this-desks`
          : `This run judged a position none of which is this desk's: ${otherHeldWeight} of the book is another manager's or assigned to nobody. The judgement stands; nothing about this name moves on this desk's account`,
        'book.positions',
        { intentBeforeWithdrawal: outcome.intent, ownHeldWeight, otherHeldWeight, withdrawn },
      ),
    )
    if (withdrawn) outcome.intent = 'reduction-not-this-desks'
  }

  if (!INTENTS.includes(outcome.intent)) throw new Error(`${outcome.intent} is not a registered intent`)
  const weightRole = INTENT_WEIGHT_ROLES[outcome.intent]
  if (weightRole === undefined) throw new Error(`${outcome.intent} has no weight role, and a weight nobody assigned a role to is the defect #821 is`)

  /**
   * ── The two weights, resolved once, at the end ───────────────────────────
   *
   * Only three intents move money and each says exactly how much:
   *
   *   `enter-staged`     cumulative = the sized target; increment = the first
   *                      stage, or the whole gap when there is no plan
   *   `add-next-stage`   cumulative = the plan's own target; increment = the
   *                      stage that came due, and nothing else
   *   everything else    increment 0 — including every WAIT, WATCH and hold
   *
   * ⛔ A reduction is not expressed here as a negative increment. `trim-…`,
   * `reduce-…`, `resize-…` and `close-out` carry a **cumulative** target the
   * host reduces to, because «sell this much» and «hold this much afterwards»
   * are the same conflation one sign over.
   */
  const increases = weightRole === 'increase'
  const cumulative = outcome.intent === 'add-next-stage' ? plan?.data.cumulativeTargetWeight ?? null : sizing.data.targetWeight ?? null
  let increment = 0
  if (outcome.intent === 'add-next-stage') increment = plan.data.addedThisRun
  else if (outcome.intent === 'enter-staged') {
    const firstStage = plan?.data.addedThisRun
    increment = finite(firstStage) && firstStage > 0 ? firstStage : round(Math.max(0, (cumulative ?? 0) - (ownHeldWeight ?? 0)))
  }
  if (increment > 0 && !mayIncrease) throw new Error('an increment survived an unread input, which is the whole defect this gate exists for')

  /**
   * ── The third weight, and it is the only one the host may be handed (#817) ──
   *
   *     hostTargetWeight = otherHeldWeight + (this desk's share of the position)
   *
   * ⛔ **`cumulativeTargetWeight` is this strategy's share and the host's
   * `targetWeight` is the position.** `headroomForStrategy` above is «the
   * smaller of the two caps, less what every *other* strategy has», so what
   * comes out of `targetWeight` is what this desk may hold — not what the name
   * should be. The host's field is the other total: `rebalanceShadowBook` reads
   * a position's whole weight and never its attribution
   * (`untilled/aumos#815`), so handing over this desk's share is an instruction
   * to make the **whole** position that size.
   *
   * ⚠️ **The gap between the two is what somebody else holds, and it sells.** A
   * 6% holding assigned to nobody, sized here at 2%, handed over as `0.02` is a
   * sale of two thirds of a position no judgement on this fund ever asked to
   * reduce — from a run whose own intent is `enter-staged`.
   *
   * ⚠️ **Holdings are added and open proposals are not.** A pending proposal is
   * exposure for a *ceiling* and is not a position for an *order*; adding one
   * would buy another manager's unapproved judgement on their behalf.
   *
   * ⛔ **`close-out` reduces this desk's share to zero and no further.** Where
   * nobody else holds the name this is `0`, which is the host's `exit`. Where
   * somebody does, an `exit` would liquidate their position too, so the exit is
   * expressed as this weight instead.
   *
   * ── What this desk's share is *for this intent* (`untilled/aumos#821`) ─────
   *
   * ⛔ **`cumulative` is the weight a purchase would target, and #817 handed it
   * over on every intent that was not `close-out`.** On a purchase that is
   * right. On a **reduction** it is the wrong number in the wrong direction: a
   * trim, a reduction on an invalidation and a resize to a risk limit are
   * decisions about **this desk's own share**, and re-sizing that share from
   * the entry arithmetic can put it *above* what this desk holds — which,
   * added to somebody else's holding, leaves as a **purchase of their
   * position**. Over 6% assigned to nobody, that was `buy:16`, `buy:39` and
   * `buy:60`, the last of them doubling a position on a run whose stated cause
   * was `risk_limit_exceeded`.
   *
   * So the reduction target is clamped into this desk's own share:
   *
   *     reduce → min(cumulative, ownHeldWeight)
   *
   * ⚠️ **The clamp is a ceiling and never a floor.** A desk that runs the whole
   * position reduces exactly as it always did — `min` is the identity there
   * whenever the sizing asks for less than is held, which is what a reduction
   * *is*. Nothing here can turn a real reduction into a no-op, and
   * `untilled/aumos#782` is the reason that has to stay true.
   *
   * ⚠️ **And a standstill states the holding.** `hold`, `hold-through-delay`,
   * `exit-review`, the research watches and every WAIT asked the host for the
   * *entry* weight too — a `hold-through-delay` whose own prose is «nothing is
   * added» bought 2.3pp of a position it wholly ran, and `exit-review`, whose
   * entire content is «adjudicate before deciding anything else», handed over a
   * `0` and liquidated the name. A judgement that changes nothing says so with
   * the weight the account already holds.
   *
   * `null` where the book was not read or nothing was sized — an unread account
   * has no target, and a `0` here would be an order.
   */
  const ownTarget = weightRole === 'increase'
    ? cumulative
    : weightRole === 'close'
      ? 0
      : weightRole === 'reduce' && finite(cumulative) && finite(ownHeldWeight)
        ? round(Math.min(cumulative, ownHeldWeight))
        : ownHeldWeight
  const hostTargetWeight = finite(otherHeldWeight) && finite(ownTarget)
    ? round(otherHeldWeight + ownTarget)
    : null

  /**
   * ── The field that made all of this quiet (`untilled/aumos#821`) ──────────
   *
   * ⛔ **`increasesExposure` was `intent === 'enter-staged' || 'add-next-stage'`
   * — a restatement of the intent, not a measurement of it.** So a
   * `trim-into-realisation` that handed the host a weight 1.7pp above what the
   * account held answered `increasesExposure: false` in the same object, and
   * every reader — this package's own 111 checks included — was told the
   * opposite of what would leave for the exchange.
   *
   * Exposure is the account's exposure to the name, the host executes
   * `hostTargetWeight` against the whole position, so the only honest reading is
   * that number against what the position weighs now. The old sentence is still
   * worth saying and is now said under a name that is true of it:
   * `addsToThisDesksShare`.
   *
   * ⚠️ **`false` where nothing can be handed over.** A `null`
   * `hostTargetWeight` is «no target leaves this run», and no order can be
   * formed from it — so no exposure increases. That is a statement about this
   * run's output and not a guess about the account.
   */
  const exposureDirection = finite(hostTargetWeight) && finite(positionWeight)
    ? (hostTargetWeight > positionWeight + 1e-9 ? 'increase' : hostTargetWeight < positionWeight - 1e-9 ? 'reduce' : 'unchanged')
    : null

  return {
    data: {
      symbol: input.symbol ?? null,
      market: input.market ?? null,
      held,
      intent: outcome.intent,
      review: outcome.review,
      /** «This desk's share of the position should be this.» Null where this run sizes nothing. ⛔ Not the host's `targetWeight` — see `hostTargetWeight` (#817). */
      cumulativeTargetWeight: cumulative,
      /** «Buy this much more, now.» Zero on every intent that is not a purchase. */
      incrementThisRun: increment,
      /** Holdings of this name that **are** this desk's. ⚠️ Called `currentWeight` until #821, which is not what it means. */
      ownHeldWeight,
      /** Holdings of this name that are not this desk's — another manager's, and every unattributed one. */
      otherHeldWeight,
      /** What the account holds in this name, whoever runs it (#821). What `hostTargetWeight` is differenced against. */
      positionWeight,
      /** ⛔ «The whole position should be this.» The **only** number that may be handed to the host (#817). */
      hostTargetWeight,
      /** What this intent asks the **position** to do: `increase` · `reduce` · `close` · `standstill` (#821). */
      intentWeightRole: weightRole,
      /** ⚠️ **Measured, not restated** (#821): `hostTargetWeight` against `positionWeight`. `null` only where neither is known. */
      exposureDirection,
      /** Does what leaves this run make the account hold **more** of this name? Measured the same way. */
      increasesExposure: exposureDirection === 'increase',
      /** The old `increasesExposure`, under a name that is true of it: this run buys more for **this desk**. */
      addsToThisDesksShare: increases && increment > 0,
      weightMeanings: {
        cumulativeTargetWeight: 'this-strategys-share-of-the-position',
        incrementThisRun: 'weight-added-this-run',
        ownHeldWeight: 'this-strategys-held-share-of-the-position',
        positionWeight: 'whole-position-weight-as-held-now',
        hostTargetWeight: 'whole-position-weight-for-the-host',
      },
      context,
      ledger: ledger.data,
      recovery: recovery.data,
      survivability: survivability.data,
      classification: classification.data,
      concentration: concentration.data,
      sizing: sizing.data,
      staging: plan?.data ?? null,
      scores: scores.data,
      /** What this run wants written back, and nothing else. */
      nextRegister: { catalysts: ledger.data.nextRegister, plan: plan?.data.nextRegister ?? null },
    },
    diagnostics,
    causes,
  }
}
