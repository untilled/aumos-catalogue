import { INTENTS, METHODOLOGY } from './constants.mjs'
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
  const ledger = catalystLedger({ previous: input.register?.catalysts ?? null, rows: input.catalysts ?? [], transitions: input.transitions ?? [], asOf: input.asOf, config })
  const recovery = recoveryComparison({ indicators: input.indicators ?? [], asOf: input.asOf })
  const survivability = financialSurvivability({ ...(input.financials ?? {}), config })
  const classification = caseClassification({
    ...(input.case ?? {}),
    improvingChannelCount: recovery.data.improvingChannelCount ?? 0,
    cashFlowLinked: recovery.data.cashFlowLinked === true,
  })
  const concentration = accountConcentration({
    positions: input.book?.positions ?? [],
    proposals: input.book?.proposals ?? [],
    caps: input.book?.caps ?? {},
    strategy: input.strategy ?? 'catalyst-turnaround',
  })
  const invalidation = lossToInvalidation({ price: input.price?.last, invalidationPrice: input.price?.invalidationPrice })
  const headroom = concentration.data.headroom[input.symbol] ?? concentration.data.unusedHeadroom
  const sizing = targetWeight({
    expectedActiveReturn: input.sizing?.expectedActiveReturn,
    stopDistance: invalidation.data.stopDistance,
    conviction: input.sizing?.conviction,
    mandatePositionCap: input.sizing?.mandatePositionCap ?? null,
    accountHeadroom: headroom,
    config,
  })
  const plan = input.plan ? stagedPlan({ previous: input.register?.plan ?? null, plan: input.plan, price: input.price?.last, asOf: input.asOf }) : null
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

  const context = {
    classification: classification.data.classification,
    qualifiesAsPosition: classification.data.qualifiesAsPosition,
    improvingChannels: recovery.data.improvingChannels ?? [],
    meetsChannelFloor: recovery.data.meetsChannelFloor === true,
    cashFlowLinked: recovery.data.cashFlowLinked === true,
    survivable: survivability.data.survivable,
    catalyst: summary,
    priceProgress: progress,
    targetWeight: sizing.data.targetWeight,
    accountHeadroom: headroom,
    stagedAddition: plan?.data.addedThisRun ?? null,
    scores: scores.data,
    stabilisation: input.price?.stabilised ?? null,
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
      if (finite(plan?.data.addedThisRun) && plan.data.addedThisRun > 0) {
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
    if (survivability.data.survivable === false) {
      return { intent: 'research-watch', review: review('survivability-fails', { kind: 'post-close-risk', reason: 'The recovery may be real and the company does not reach it unaided' }) }
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
    return {
      intent: 'enter-staged',
      review: review('staged-entry-armed', { at: windowEnd, kind: 'catalyst-window', reason: `Entering in stages toward ${sizing.data.targetWeight} of the book, reviewed at the catalyst window end` }),
    }
  }

  const outcome = decide()
  if (!INTENTS.includes(outcome.intent)) throw new Error(`${outcome.intent} is not a registered intent`)

  return {
    data: {
      symbol: input.symbol ?? null,
      market: input.market ?? null,
      held,
      intent: outcome.intent,
      review: outcome.review,
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
