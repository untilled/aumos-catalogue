import { diagnostic, finite, round } from './diagnostics.mjs'
import { INPUT_VOCABULARY } from './input-contracts.mjs'
import { METHODOLOGY } from './constants.mjs'

/**
 * ── Declared thresholds, and the drift they exist to catch (issue #70 §12) ─
 *
 * The numbers a methodology is made of lived in `data/*.json` in the original —
 * lens envelopes, entry gates, exit rules, policy hurdles — and the migration
 * matrix inventoried only `bin/`. So the executables were ported with their
 * dispositions recorded and **the contract files every one of them reads were
 * out of scope**: not ported, and not recorded as unported either.
 *
 * This module is where the declared numbers live now.
 *
 * ── One source, not two ────────────────────────────────────────────────────
 *
 * The original declared the lens envelopes in `lens_definitions.json` as a
 * deliberate **copy** of the scanner's hardcoded constants, and ran a
 * `--check-drift` pass that blocked with `LENS_DRIFT` when the two disagreed.
 * That is the right shape for a Python tree where the scanner cannot import the
 * declaration.
 *
 * Here it can, so the declaration below is the only copy and `scanners.mjs`
 * reads it. Drift between two copies is not prevented, it is made impossible —
 * a strictly better outcome than detecting it. What the verifier keeps is the
 * property the drift check was protecting: the scanner's behaviour is tested at
 * the declared boundaries, so a constant edited into the code without the
 * declaration moving fails immediately.
 */
export const LENS_ENVELOPES = {
  'mean-reversion': {
    label: 'Deep dislocation',
    firesWhen: 'at-least-two-signals',
    signals: {
      rsiOversold: { metric: 'rsi14', op: 'lt', value: 30 },
      nearLow: { metric: 'aboveLow200', op: 'lte', value: 0.05 },
      ma200Discount: { metric: 'ma200Distance', op: 'lte', value: -0.1 },
      ma60Discount: { metric: 'ma60Distance', op: 'lte', value: -0.07 },
      volumeCapitulation: { metric: 'volumeSpikeStabilized', op: 'eq', value: true },
    },
    /**
     * Depth has no floor here, so any drawdown-based revisit trigger is
     * reachable: the lens keeps producing candidates however far price falls.
     */
    reachable: { offHigh200: { min: -1, max: 0 }, rsi14: { min: 0, max: 100 } },
  },
  'trend-pullback': {
    label: 'Shallow pullback inside an intact uptrend',
    firesWhen: 'all-conditions',
    checks: {
      uptrend: { description: 'close above MA200 and MA50 above MA200' },
      pullback: { metric: 'offHigh200', min: -0.2, max: -0.05 },
      healthyRsi: { metric: 'rsi14', min: 35, max: 55 },
      notExtended: { metric: 'ma200Distance', op: 'lte', value: 0.4 },
    },
    /**
     * ⚠️ The shallowness is the definition, not a shortcoming — so "revisit at
     * 20% off the high" names the point where this lens *stops producing
     * candidates*. A trigger there is unreachable and never comes back through
     * this lens, which is why reachability is judged rather than described.
     */
    reachable: { offHigh200: { min: -0.2, max: -0.05 }, rsi14: { min: 35, max: 55 }, ma200Distance: { min: 0, max: 0.4 } },
  },
  'quality-pullback': {
    label: 'Quality marked down while the trend holds',
    firesWhen: 'all-conditions',
    checks: {
      aboveMa200: { description: 'close above MA200' },
      deepPullback: { metric: 'offHigh200', min: -0.35, max: -0.15 },
      rsiBand: { metric: 'rsi14', min: 30, max: 50 },
    },
    reachable: { offHigh200: { min: -0.35, max: -0.15 }, rsi14: { min: 30, max: 50 } },
  },
}

/**
 * Is this revisit trigger reachable inside the lens that created it?
 *
 * `sizing-and-concentration` and `candidate-research` both say the trigger must
 * be reachable, and neither could check it. A trigger outside its lens's
 * envelope is a promise the book will never keep: the condition can only become
 * true somewhere the lens no longer looks.
 */
export function lensEnvelope({ lens, triggers = [] } = {}) {
  const diagnostics = []
  const envelope = LENS_ENVELOPES[lens]
  if (!envelope) {
    diagnostics.push(diagnostic('lens_envelope_unknown', 'unevaluated', 'No numeric envelope is declared for this lens; reachability cannot be judged', 'lens', { lens: lens ?? null, declared: Object.keys(LENS_ENVELOPES) }))
    return { data: { lens: lens ?? null, envelope: null, triggers: [] }, diagnostics }
  }
  const judged = []
  for (const [index, trigger] of triggers.entries()) {
    const bound = envelope.reachable[trigger?.metric]
    if (!bound) {
      judged.push({ ...trigger, reachable: null, reason: 'metric-not-in-declared-envelope' })
      diagnostics.push(diagnostic('trigger_metric_undeclared', 'unevaluated', 'This lens declares no range for that metric, so reachability is unknown rather than assumed', `triggers[${index}].metric`, { metric: trigger?.metric ?? null }))
      continue
    }
    if (!finite(trigger?.level)) {
      judged.push({ ...trigger, reachable: null, reason: 'level-missing' })
      diagnostics.push(diagnostic('trigger_level_missing', 'blocked', 'A revisit trigger needs a numeric level', `triggers[${index}].level`))
      continue
    }
    const reachable = trigger.level >= bound.min && trigger.level <= bound.max
    judged.push({ ...trigger, reachable, bound, reason: reachable ? 'inside-the-envelope' : 'outside-the-lens-that-created-it' })
    if (!reachable) {
      diagnostics.push(diagnostic('trigger_unreachable', 'blocked', 'The trigger sits where this lens stops producing candidates; the book would never come back through it', `triggers[${index}].level`, { metric: trigger.metric, level: trigger.level, bound }))
    }
  }
  return { data: { lens, envelope, triggers: judged, allReachable: judged.every((row) => row.reachable !== false) }, diagnostics }
}

/**
 * A correlated event cluster, and the promotion that waits for it.
 *
 * A binary event that decides a thesis is not risk to size around, it is risk
 * to wait out — and when several holdings share one event, sizing each on its
 * own merits concentrates the book into a single print without anyone deciding
 * to. The original registered the block on the gate itself and set its end date
 * by a stated rule: **the day after the last print**, not the day of it.
 *
 * The scope is narrow on purpose: it blocks promotion to order-ready, and
 * leaves WATCH, paper registration and post-cluster entry alone. A block that
 * stopped the research would lose the window it exists to protect.
 */
export function clusterBlock({ clusters = [], intent = 'promote-to-ready', asOf } = {}) {
  const diagnostics = []
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : null
  const active = []
  for (const [index, cluster] of clusters.entries()) {
    const prints = (cluster?.prints ?? []).map((row) => String(row?.at ?? row).slice(0, 10)).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row)).sort()
    const declared = cluster?.blockUntil ? String(cluster.blockUntil).slice(0, 10) : null
    /**
     * The end date is derived from the prints rather than trusted, because a
     * copied date is the failure the original recorded: a block whose window
     * had been pasted from a sibling gate ended a day before its own last
     * print.
     */
    const derived = prints.length ? new Date(Date.parse(prints.at(-1)) + 86_400_000).toISOString().slice(0, 10) : null
    if (declared && derived && declared !== derived) {
      diagnostics.push(diagnostic('cluster_block_until_mismatch', 'blocked', 'The block ends on a date other than the day after its own last print; a window copied from another cluster ends early', `clusters[${index}].blockUntil`, { declared, derived, lastPrint: prints.at(-1) }))
    }
    const until = derived ?? declared
    if (!until) {
      diagnostics.push(diagnostic('cluster_block_undated', 'unevaluated', 'A cluster with neither prints nor an end date cannot be waited out', `clusters[${index}]`))
      continue
    }
    if (today && today < until) active.push({ name: cluster?.name ?? null, blockUntil: until, prints, reason: cluster?.reason ?? null })
  }
  const blocksThisIntent = intent === 'promote-to-ready'
  if (active.length && blocksThisIntent) {
    diagnostics.push(diagnostic('cluster_block_active', 'blocked', 'A correlated event cluster decides this thesis before the market does; promotion waits for the print rather than sizing around it', 'clusters', { active: active.map((row) => row.name), until: active.map((row) => row.blockUntil).sort().at(-1) }))
  } else if (active.length) {
    diagnostics.push(diagnostic('cluster_block_scope', 'info', 'A cluster is active but this intent is outside its scope; research, WATCH and paper registration continue', 'intent', { intent, active: active.map((row) => row.name) }))
  }
  return { data: { active, blocked: Boolean(active.length && blocksThisIntent), intent, scope: 'promotion-to-order-ready-only', clearAfter: active.map((row) => row.blockUntil).sort().at(-1) ?? null }, diagnostics }
}

/**
 * The time stop, in full (approved 2026-07-08).
 *
 * `exitCheck` already raises a `time_stop` when the review date arrives and the
 * position never got above entry, which is the narrow price proxy the exit
 * rules could compute. The approved rule is a different and better test: at the
 * review date, a single name whose **catalyst never happened** and which
 * **trailed its benchmark over the same period** is promoted to an exit
 * candidate rather than having its review date pushed out.
 *
 * Both halves matter. Trailing the benchmark while the catalyst is still ahead
 * is a thesis that has not been tested yet. A catalyst that passed without
 * effect while the position still beat its benchmark is a thesis that was wrong
 * about the mechanism and right about the asset. Only both together say the
 * position had its window and did not use it.
 *
 * Core ETFs and parked liquidity are out of scope: their reason for being held
 * is allocation, and no catalyst was ever claimed for them.
 */
export function timeStopPolicy({ positions = [], asOf } = {}) {
  const diagnostics = []
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : null
  const verdicts = []
  for (const [index, position] of positions.entries()) {
    const at = `positions[${index}]`
    if (position?.core === true || position?.parkedLiquidity === true) {
      verdicts.push({ symbol: position?.symbol ?? null, verdict: 'out-of-scope', reason: 'allocation-holding-claims-no-catalyst' })
      continue
    }
    const due = position?.reviewBy ? String(position.reviewBy).slice(0, 10) : null
    if (!due || !today || today < due) {
      verdicts.push({ symbol: position?.symbol ?? null, verdict: 'not-due', reviewBy: due })
      continue
    }
    const catalystRealized = position?.catalystRealized
    const excessPct = finite(position?.returnSinceEntryPct) && finite(position?.benchmarkReturnSinceEntryPct)
      ? round(position.returnSinceEntryPct - position.benchmarkReturnSinceEntryPct, 3)
      : null
    if (catalystRealized === undefined || catalystRealized === null || excessPct === null) {
      verdicts.push({ symbol: position?.symbol ?? null, verdict: 'unevaluated', reviewBy: due, catalystRealized: catalystRealized ?? null, excessPct })
      diagnostics.push(diagnostic('time_stop_unevaluated', 'unevaluated', 'The review date arrived but the catalyst outcome or the benchmark comparison is missing; the promotion is unresolved rather than declined', at, { symbol: position?.symbol ?? null }))
      continue
    }
    if (catalystRealized === false && excessPct < 0) {
      verdicts.push({ symbol: position.symbol, verdict: 'exit-candidate', reviewBy: due, catalystRealized, excessPct })
      diagnostics.push(diagnostic('time_stop_exit_candidate', 'unevaluated', 'The review date arrived with the catalyst unrealized and the position behind its benchmark; the review date is not extended', at, { symbol: position.symbol, excessPct }))
    } else {
      verdicts.push({
        symbol: position.symbol,
        verdict: 'review',
        reviewBy: due,
        catalystRealized,
        excessPct,
        reason: catalystRealized ? 'catalyst-happened-so-the-thesis-was-tested' : 'still-ahead-of-the-benchmark',
      })
    }
  }
  return { data: { verdicts, exitCandidates: verdicts.filter((row) => row.verdict === 'exit-candidate').map((row) => row.symbol) }, diagnostics }
}

/**
 * ── The exit discipline, which is unconditional (issue #153) ──────────────
 *
 * The source methodology wrote this rule down with its reason attached:
 * *"무기한 보유는 청산 증거를 만들지 못해 레인 목적과 충돌한다."* A position
 * held indefinitely produces no closed outcome, every maturity axis in this
 * package is waiting for closed outcomes, and the port arrived with **zero** of
 * them. The buying side came across and the selling discipline did not.
 *
 * ⚠️ **What did come across is conditional, and that is the defect.** Two
 * operations already look at a review date and neither one closes anything:
 *
 * | operation | asks | fires when | severity |
 * |---|---|---|---|
 * | `exitCheck` `time_stop` | did the thesis have its window? | the **review date** arrived *and* price never got above entry | a candidate |
 * | `timeStopPolicy` | was the thesis tested? | the **review date** arrived *and* the catalyst never happened *and* it trailed its benchmark | `unevaluated` |
 * | `exitDiscipline` `time_stop_reached` | has the holding period run out? | **40 trading days since entry**, and nothing else | the exit is due |
 *
 * ⛔ **The boundary is the input each one reads, and the ordering follows from
 * it.** The first two read a `reviewBy` a run had to have written, and both ask
 * a question *about the thesis*; a position nobody wrote a review date for is
 * invisible to both, which is exactly how a book reaches zero closed outcomes
 * while two time-stop operations report nothing wrong. This one reads the entry
 * date, which every position has, and asks nothing about the thesis at all.
 * **Where more than one fires, this one answers**: the other two argue about
 * whether to extend a review, and an exit that is already due is not a review
 * to extend. They keep their own outputs — a thesis that failed its catalyst
 * test is still worth recording as that — but they never postpone this.
 *
 * ── The stop distance is not the source's, except in the lane it was set for ─
 *
 * The source's −8% was computed against a **1%** cell: *"종목당 1% × −8% = 계좌
 * −0.08%. 6종목 전부 손절해도 계좌 −0.48%."* #153 opened a lane where one name
 * may be 20% of the book, and −8% there is −1.6% of the account on a single
 * position — six of them would be −9.6%, which is above every heat cap this
 * package has ever been given. Carrying the number across unchanged would be
 * carrying its arithmetic and not its meaning.
 *
 * So the main lane **derives** the distance from the axis the investor declared:
 * `portfolioHeat` is `Σ weight × stopLossPct` against the Mandate's
 * `maxDrawdown`, so the widest stop a position of weight *w* may carry is
 * `(maxDrawdown − heat already held) / w`. ⛔ The source's −8% remains the
 * ceiling on the answer: the derivation only ever tightens, and a value with an
 * approval history is the widest thing this package proposes.
 *
 * ⚠️ **The investor has not declared `maxDrawdown`, and no number is invented
 * for it.** With nothing to derive from, the distance comes back `null` and
 * `hard_stop_unevaluated` says which declaration would resolve it — the shape
 * `cash_floor_unevaluated` uses, and the shape this package uses for every cap
 * nobody has set. The control arm is unaffected: its cell is 1% and the source's
 * −8% is valid there, so that lane is fully judged today. ⚠️ **Two lanes holding
 * two different stop distances is the correct state**, not an inconsistency —
 * the number is a function of position size, and the two lanes are sized by
 * different things on purpose.
 *
 * ── Registration, which is the part that must not be prose ────────────────
 *
 * The source's own words: *"각 진입 시 data/exit_rules.json에 stop·review_by를
 * 기입한다 — exit-check가 그때부터 감시한다. 산문 약속으로 두지 않는다."* This
 * package has no such file and cannot write one: it holds `thesis:read` and no
 * `thesis:write`, and the runtime maps that grant to an empty tool list. What it
 * does have is the proposal: a WATCH leaves in a `DecisionProposal`, and the
 * Wake Engine evaluates it from then on. So `watchesToRegister` returns the two
 * rows an entry owes — a `price-below` at the stop level and an `at-time` at the
 * time stop — in `validateWatch`'s own vocabulary, to be copied into the same
 * proposal as the BUY. An entry proposed without them is `exit_rules_unregistered`
 * / `blocked`: the discipline is registered at entry or the entry is refused,
 * which is what the source meant by not leaving it in prose.
 *
 * ⚠️ **The read-back is still missing and is the host's** — a manager can arm a
 * WATCH and cannot read one back, which `HOST-FOLLOWUPS.md` already records
 * under #97. This operation therefore re-derives the discipline from the entry
 * date every run rather than trusting that a WATCH armed weeks ago still stands.
 */
const TRADING_DAY_MS = 86_400_000

function weekdaysBetween(fromDay, toDay) {
  let cursor = Date.parse(fromDay)
  const end = Date.parse(toDay)
  if (!Number.isFinite(cursor) || !Number.isFinite(end)) return null
  let days = 0
  while (cursor < end) {
    cursor += TRADING_DAY_MS
    const weekday = new Date(cursor).getUTCDay()
    if (weekday >= 1 && weekday <= 5) days += 1
  }
  return days
}

export function exitDiscipline({
  symbol = null,
  lane = null,
  entryDate = null,
  tradingDaysHeld = null,
  entryPrice = null,
  price = null,
  positionWeight = null,
  mandateMaxDrawdown = null,
  heldPortfolioHeat = 0,
  registration = null,
  proposedExits = null,
  asOf = null,
} = {}) {
  const diagnostics = []
  const limitDays = METHODOLOGY.exitDiscipline.timeStopTradingDays
  const maximumStop = Math.abs(METHODOLOGY.exitDiscipline.maximumHardStopPct)
  const controlArm = lane === 'control-arm'

  /**
   * ⚠️ Trading days, counted as weekdays when the caller has no calendar to
   * hand. Holidays make the weekday count the **larger** of the two, so the
   * approximation reaches the limit a few sessions early rather than late — the
   * safe direction for a rule whose purpose is that positions close — and the
   * basis is named in the output rather than left to be assumed.
   */
  let heldDays = Number.isInteger(tradingDaysHeld) && tradingDaysHeld >= 0 ? tradingDaysHeld : null
  let basis = heldDays === null ? null : 'caller-trading-calendar'
  if (heldDays === null && typeof entryDate === 'string' && typeof asOf === 'string') {
    heldDays = weekdaysBetween(entryDate.slice(0, 10), asOf.slice(0, 10))
    basis = heldDays === null ? null : 'weekday-approximation'
  }
  if (heldDays === null) {
    diagnostics.push(diagnostic('exit_discipline_unevaluated', 'unevaluated', 'The holding period decides the time stop, and this run was given neither an entry date nor a trading-day count; the stop is unjudged rather than not reached', 'entryDate', { symbol, timeStopTradingDays: limitDays }))
  } else if (basis === 'weekday-approximation') {
    diagnostics.push(diagnostic('time_stop_basis_approximated', 'info', 'Trading days were counted as weekdays because no session calendar was supplied; holidays make this count the larger of the two, so the stop is reached no later than a true session count would reach it', 'tradingDaysHeld', { symbol, tradingDaysHeld: heldDays, basis }))
  }
  const timeStopReached = heldDays === null ? null : heldDays >= limitDays
  const dueAt = typeof entryDate === 'string' && Number.isFinite(Date.parse(entryDate.slice(0, 10)))
    ? new Date(Date.parse(entryDate.slice(0, 10)) + Math.ceil(limitDays / 5) * 7 * TRADING_DAY_MS).toISOString().slice(0, 10)
    : null
  if (timeStopReached) {
    diagnostics.push(diagnostic(
      'time_stop_reached',
      'unevaluated',
      'The holding period this lane allows has run out, so this position is closed regardless of how it is performing; the closed outcome is the product, a loss is a valid one, and this is not a review date to extend',
      'entryDate',
      { symbol, tradingDaysHeld: heldDays, timeStopTradingDays: limitDays, basis, lane },
    ))
  }

  /**
   * The stop distance. The control arm keeps the source's own number because
   * the source's own arithmetic still holds there; every other lane derives it
   * from the declared drawdown limit and can only come out tighter.
   */
  const heatHeadroom = finite(mandateMaxDrawdown) && finite(heldPortfolioHeat)
    ? Math.max(0, mandateMaxDrawdown - heldPortfolioHeat)
    : null
  let stopPct = null
  let stopSource = null
  let derivedCeiling = null
  if (controlArm) {
    stopPct = -maximumStop
    stopSource = 'control-arm-approved'
  } else if (heatHeadroom !== null && finite(positionWeight) && positionWeight > 0) {
    derivedCeiling = heatHeadroom / positionWeight
    stopPct = -Math.min(maximumStop, derivedCeiling)
    stopSource = derivedCeiling < maximumStop ? 'mandate-max-drawdown' : 'methodology-maximum'
  } else {
    diagnostics.push(diagnostic(
      'hard_stop_unevaluated',
      'unevaluated',
      "Outside the control arm the stop distance is derived from the Mandate's maxDrawdown against this position's weight, and one of them was not declared; no distance is invented for it, and the position is unjudged on this axis rather than unstopped",
      finite(mandateMaxDrawdown) ? 'positionWeight' : 'mandateMaxDrawdown',
      {
        symbol,
        lane,
        mandateMaxDrawdown: finite(mandateMaxDrawdown) ? round(mandateMaxDrawdown) : null,
        positionWeight: finite(positionWeight) ? round(positionWeight) : null,
        unlocksWith: finite(mandateMaxDrawdown) ? 'positionWeight' : 'mandate.constraints.maxDrawdown',
        maximumHardStopPct: METHODOLOGY.exitDiscipline.maximumHardStopPct,
      },
    ))
  }
  const stopLevel = stopPct !== null && finite(entryPrice) && entryPrice > 0 ? round(entryPrice * (1 + stopPct), 6) : null
  const hardStopBreached = stopLevel === null || !finite(price) ? null : price <= stopLevel
  if (hardStopBreached) {
    diagnostics.push(diagnostic(
      'hard_stop_breached',
      'unevaluated',
      'The close is at or below the stop this entry registered; the position is closed on the rule rather than re-argued',
      'price',
      { symbol, price: round(price, 6), stopLevel, stopPct: round(stopPct), entryPrice: round(entryPrice, 6), stopSource },
    ))
  }

  /**
   * The registration, judged on what it actually carries. ⛔ A registration
   * whose stop is wider than the derived bound is refused rather than reported:
   * it is a position whose own loss budget exceeds the one the Mandate declares
   * for the whole book, and accepting it would put the breach in the future
   * where `portfolioHeat` cannot see it until it fires.
   */
  const registeredStopPct = finite(registration?.stopPct)
    ? -Math.abs(registration.stopPct)
    : finite(registration?.stopPrice) && finite(entryPrice) && entryPrice > 0
      ? registration.stopPrice / entryPrice - 1
      : null
  const registeredReviewBy = typeof registration?.reviewBy === 'string' && Number.isFinite(Date.parse(registration.reviewBy)) ? registration.reviewBy.slice(0, 10) : null
  const missingRegistration = [
    ...(registeredStopPct === null ? ['stop'] : []),
    ...(registeredReviewBy === null ? ['reviewBy'] : []),
  ]
  if (registration !== null && missingRegistration.length) {
    diagnostics.push(diagnostic(
      'exit_rules_unregistered',
      'blocked',
      'An entry registers its stop and its review date before it is an entry; the closed outcome is what this discipline is for, and a promise to review later is the prose the source refused to accept',
      `registration.${missingRegistration[0]}`,
      { symbol, missing: missingRegistration, timeStopTradingDays: limitDays, dueAt },
    ))
  }
  if (registeredStopPct !== null && stopPct !== null && registeredStopPct < stopPct - 1e-12) {
    diagnostics.push(diagnostic(
      'hard_stop_exceeds_budget',
      'blocked',
      'The registered stop is further from the entry than this position may carry: at this weight the loss it permits is larger than the drawdown budget left for it, so the breach would be invisible to portfolioHeat until the day it fires',
      'registration.stopPct',
      { symbol, registeredStopPct: round(registeredStopPct), permittedStopPct: round(stopPct), positionWeight: finite(positionWeight) ? round(positionWeight) : null, heatHeadroom: heatHeadroom === null ? null : round(heatHeadroom), stopSource },
    ))
  }

  /**
   * The round trip, in the shape `position_cap_reduction_undisclosed` uses:
   * handed this run's exits, a due stop that the proposal does not act on is
   * `blocked`; not handed them, the question is unjudged rather than passed.
   */
  const due = timeStopReached === true || hardStopBreached === true
  const exitProposed = Array.isArray(proposedExits)
    ? proposedExits.some((row) => (typeof row === 'string' ? row : row?.symbol) === symbol)
    : null
  if (due && exitProposed === false) {
    diagnostics.push(diagnostic(
      'exit_due_unactioned',
      'blocked',
      'A stop this position is held to has been reached and this run proposes no exit for it; the discipline is what produces the closed outcomes every maturity axis here is waiting for, and a rule that is reported and not acted on is the prose it replaced',
      'proposedExits',
      { symbol, timeStopReached: timeStopReached === true, hardStopBreached: hardStopBreached === true },
    ))
  }

  /**
   * What the entry copies into its own proposal. Two rows, in `validateWatch`'s
   * vocabulary, because a WATCH is the only registration path this package has.
   */
  const watchesToRegister = []
  /**
   * ⚠️ Both rows outlive the time stop by one day rather than expiring on it. A
   * WATCH that expires at the instant it fires is a WATCH that may never fire,
   * and a day is the smallest unit this vocabulary has — it is the boundary
   * being avoided, not a grace period anybody chose.
   */
  const watchExpiry = dueAt === null ? null : new Date(Date.parse(dueAt) + TRADING_DAY_MS).toISOString().slice(0, 10)
  if (stopLevel !== null) watchesToRegister.push({ kind: 'price-below', threshold: stopLevel, expiresAt: watchExpiry, reason: 'exit-discipline-hard-stop' })
  if (dueAt !== null) watchesToRegister.push({ kind: 'at-time', at: dueAt, expiresAt: watchExpiry, reason: 'exit-discipline-time-stop' })

  return {
    data: {
      symbol,
      lane,
      timeStop: { tradingDaysHeld: heldDays, timeStopTradingDays: limitDays, reached: timeStopReached, basis, dueAt },
      hardStop: {
        stopPct: stopPct === null ? null : round(stopPct),
        stopLevel,
        breached: hardStopBreached,
        source: stopSource,
        maximumHardStopPct: METHODOLOGY.exitDiscipline.maximumHardStopPct,
        derivedCeilingPct: derivedCeiling === null ? null : round(-derivedCeiling),
        heatHeadroom: heatHeadroom === null ? null : round(heatHeadroom),
      },
      registration: { given: registration !== null, stopPct: registeredStopPct === null ? null : round(registeredStopPct), reviewBy: registeredReviewBy, missing: missingRegistration },
      watchesToRegister,
      exitDue: due,
      exitProposed,
      /** ⛔ A candidate for the one proposal the investor still approves, never an order. */
      candidateOnly: true,
      action: due ? 'SELL' : 'NONE',
      units: { stopPct: 'return-fraction', stopLevel: 'price-major-units', heatHeadroom: 'return-fraction' },
    },
    diagnostics,
  }
}

/**
 * The eleven versioned axes, as a registry rather than a field on a row.
 *
 * A rule version written only on the rows it produced cannot answer the two
 * questions it exists for: which version is current for an axis, and whether a
 * comparison is mixing versions. Declaring the axes makes both mechanical, and
 * makes the third rule enforceable — **a judgement definition changes by
 * incrementing its axis, never by re-tagging rows already recorded under the
 * old one.**
 */
const RULE_VERSION_AXES = [
  'signal_paper', 'exit_signal_paper', 'upside_radar', 'triage', 'exit_tracking',
  'promotion_gate', 'thesis_invalidation', 'entry_quality', 'benchmark_expectation',
  'lens_envelope', 'cluster_block',
]

export function ruleVersions({ registry = {}, rows = [], axis = null } = {}) {
  const diagnostics = []
  const declared = {}
  for (const name of RULE_VERSION_AXES) {
    const entry = registry[name]
    if (!entry?.version) {
      diagnostics.push(diagnostic('rule_axis_undeclared', 'unevaluated', 'A versioned axis has no current version declared; a comparison cannot know what it is comparing', `registry.${name}`))
      continue
    }
    declared[name] = { version: entry.version, since: entry.since ?? null, supersedes: entry.supersedes ?? null }
  }
  for (const name of Object.keys(registry)) {
    if (!RULE_VERSION_AXES.includes(name)) {
      diagnostics.push(diagnostic('rule_axis_unknown', 'blocked', 'A version axis outside the published set would version something nothing reads', `registry.${name}`, { axis: name, supported: RULE_VERSION_AXES })) 
    }
  }
  const versionsInRows = [...new Set(rows.map((row) => row?.ruleVersion).filter(Boolean))]
  if (versionsInRows.length > 1) {
    diagnostics.push(diagnostic('rule_versions_mixed', 'blocked', 'These rows were judged under different versions of the same axis and cannot be pooled; a definition change increments the axis, it does not re-tag what is already recorded', 'rows', { axis, versions: versionsInRows }))
  }
  const current = axis ? declared[axis]?.version ?? null : null
  const stale = current ? versionsInRows.filter((version) => version !== current) : []
  if (stale.length) {
    diagnostics.push(diagnostic('rule_version_superseded', 'unevaluated', 'Rows carry a superseded version of this axis; they stay valid on their own terms and are counted separately', 'rows', { axis, current, stale }))
  }
  return { data: { axes: RULE_VERSION_AXES, vocabulary: INPUT_VOCABULARY, declared, versionsInRows, current, stale, poolable: versionsInRows.length <= 1 }, diagnostics }
}

/**
 * ── The part of a policy engine a schema cannot hold (issue #70 §2) ────────
 *
 * `MIGRATION.md` mapped `policy-lint` to `PX` with a golden `policy` fixture,
 * and there was no operation and no fixture — the matrix overclaimed. The
 * honest question was which half of `_policy.py` is genuinely missing.
 *
 * Most of it is not. The rule DSL evaluated conditions over a config, and
 * `config.schema.json` already bounds every value on both sides and refuses
 * unknown keys; the Mandate owns what the investor may set. A second condition
 * language over the same values would be a second source of truth.
 *
 * What a schema cannot express is **provenance**: who approved a value and
 * when, which values may not move at all, and which changes need approval
 * before they take effect. A range check cannot tell a tightening from a
 * loosening, and cannot tell either from a value the investor never approved.
 * So that is what this holds, and nothing else.
 *
 * ⛔ Loosening is refused rather than flagged. Every threshold here exists
 * because something went wrong once, and the moment to argue about one is
 * before it binds, not while it is refusing a trade.
 */
/**
 * ⚠️ **A direction is declared for every key `config.schema.json` still has,
 * and for no key it lost.** #133 moved nine of them into `METHODOLOGY` and two
 * into the Mandate; a direction left behind for one of those would be
 * `policy_provenance_orphan`'s sibling — a rule about a value no configuration
 * can carry. What a package constant needs is a version bump and a reviewer,
 * which is a stronger gate than this one, not a weaker one.
 */
const POLICY_DIRECTIONS = {
  minimumExpectedActiveReturn: 'higher-is-stricter',
  benchmarkHurdleAnnualPct: 'higher-is-stricter',
  /**
   * The floor raises the ceiling, so a larger floor is a looser manager and a
   * smaller one is a stricter manager — the opposite of what the word "floor"
   * suggests, which is exactly why it is declared rather than inferred. An
   * undeclared key is `policy_direction_undeclared`, and a value whose
   * direction nobody can name is one `policyLint` cannot refuse.
   */
  'experimentalPositionFloor.KRW': 'lower-is-stricter',
  'experimentalPositionFloor.USD': 'lower-is-stricter',
  priceConflictTolerance: 'lower-is-stricter',
  'concentration.sector': 'lower-is-stricter',
  'concentration.theme': 'lower-is-stricter',
  'concentration.factor': 'lower-is-stricter',
  'coreDca.minimumCashWeightForFirstTranche': 'higher-is-stricter',
  'coreDca.monthlyTrancheMaxWeight': 'lower-is-stricter',
  'coreDca.catchUpMonthlyMaxWeight': 'lower-is-stricter',
}

function flatten(node, prefix = '') {
  const out = {}
  for (const [key, value] of Object.entries(node ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(out, flatten(value, path))
    else out[path] = value
  }
  return out
}

export function policyLint({ current = {}, proposed = {}, provenance = {} } = {}) {
  const diagnostics = []
  const before = flatten(current)
  const after = flatten(proposed)
  const changes = []
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[path] === after[path]) continue
    const record = provenance[path] ?? {}
    const direction = POLICY_DIRECTIONS[path] ?? null
    let effect = 'unclassified'
    if (direction && finite(before[path]) && finite(after[path])) {
      const stricter = direction === 'higher-is-stricter' ? after[path] > before[path] : after[path] < before[path]
      effect = stricter ? 'stricter' : 'looser'
    }
    const change = { path, from: before[path] ?? null, to: after[path] ?? null, effect, immutable: record.immutable === true, approvedBy: record.approvedBy ?? null, approvedAt: record.approvedAt ?? null, sourceFile: record.sourceFile ?? null }
    changes.push(change)
    if (record.immutable === true) {
      diagnostics.push(diagnostic('policy_immutable_changed', 'blocked', 'This value is declared immutable; changing it is a package revision, not a configuration', path, change))
      continue
    }
    if (effect === 'looser') {
      diagnostics.push(diagnostic('policy_auto_relax', 'blocked', 'Configuration may make this manager stricter and never looser; the moment to argue about a threshold is before it binds, not while it is refusing a trade', path, change))
      continue
    }
    if (!record.approvedBy) {
      diagnostics.push(diagnostic('policy_requires_approval', 'unevaluated', 'A threshold change carries who approved it and when; an unattributed change is unresolved rather than applied', path, change))
    }
    if (effect === 'unclassified') {
      diagnostics.push(diagnostic('policy_direction_undeclared', 'unevaluated', 'No direction is declared for this key, so stricter cannot be told from looser', path, change))
    }
  }
  const missingProvenance = Object.keys(provenance).filter((path) => !(path in before) && !(path in after))
  for (const path of missingProvenance) {
    diagnostics.push(diagnostic('policy_provenance_orphan', 'unevaluated', 'Provenance is recorded for a key no configuration carries', `provenance.${path}`))
  }
  return {
    data: {
      changes,
      changeCount: changes.length,
      accepted: !diagnostics.some((row) => row.severity === 'blocked'),
      directions: POLICY_DIRECTIONS,
      note: 'value ranges belong to config.schema.json; this owns provenance, immutability and direction',
    },
    diagnostics,
  }
}
