import { diagnostic } from './diagnostics.mjs'
import { METHODOLOGY } from './constants.mjs'
import { WATCH_TRIGGER_KINDS, normalizeWatch } from './methodology.mjs'

/**
 * Coverage over a universe, and the answer when there was no universe.
 *
 * The discovery machinery was ported and the universe it sweeps was not: the
 * two files that held it (`screen_universe.json`, `universe_extensions.json`)
 * are `AR` in the migration matrix, and nothing took the job over. So a real
 * run called this with `scannerUniverses: []` and `extensions: []` and was
 * answered `complete: true`, `uncovered: []`, no diagnostics — on a denominator
 * made **entirely of the book's own holdings**
 * (`run_ba37a8f6907a49c3a805a4ce3ee10ec6`, measured 2026-09-04). "Coverage
 * complete" was reporting a pass over the empty set.
 *
 * The two counts are therefore separate, because they answer different
 * questions and only one of them can be zero without the result being a lie:
 *
 * - `screenedUniverseCount` — what the run **declared**: the scanner universes
 *   plus the theme-radar extensions. Holdings are not a declaration; they are
 *   the book, and they arrive whether or not anybody screened anything.
 * - `declaredUniverseCount` — the denominator every disposition is counted
 *   against, which is that set plus the holdings.
 *
 * ⚠️ **`complete` is `null` rather than `false` when nothing was screened.**
 * `false` would say the run looked and found gaps; the truth is that it never
 * asked, which is the same distinction `evaluateWatch` keeps as `unevaluable`
 * two functions down. `uncovered: []` beside a `false` reads as "no misses" and
 * would carry the original error into its own fix.
 *
 * ⚠️ **`unevaluated`, not `blocked`.** What is missing is an input, and the
 * package's own idiom for a missing input is `unevaluated` (`missing()` in
 * `diagnostics.mjs`); the named precedent — `watch_cadence_unavailable` — is
 * that severity too. Blocking would also stop the run that has no universe yet
 * *and nothing to buy with it*: the sell-side watch, the exit lanes and the
 * existing-position review all run on the book alone, and `PROMPT.md` is
 * explicit that a blocked pre-flight never blocks the direction that reduces
 * risk. What had to stop was the **claim**, and the claim is `complete`.
 *
 * Declaring the universe is `skills/candidate-research/SKILL.md`'s procedure;
 * the route it is procured over is `skills/data-source-contract/SKILL.md`'s.
 * This function only refuses to pretend it happened.
 */
export function coverageState({ scannerUniverses = [], extensions = [], holdings = [], dispositions = [], asOf }) {
  const diagnostics = []
  const universeSets = scannerUniverses.map((rows) => new Set(rows))
  const screened = new Set([...extensions, ...universeSets.flatMap((set) => [...set])])
  const union = new Set([...screened, ...holdings])
  if (!screened.size) {
    diagnostics.push(diagnostic(
      'universe_undeclared',
      'unevaluated',
      'No universe was declared, so coverage has nothing to be complete over; procure the listing for this run before reading a coverage verdict',
      'scannerUniverses',
      { holdingsCount: new Set(holdings).size, extensionsCount: new Set(extensions).size },
    ))
  }
  if (universeSets.length > 1) {
    const [first, ...rest] = universeSets
    const drift = rest.some((set) => [...new Set([...first, ...set])].some((symbol) => first.has(symbol) !== set.has(symbol)))
    if (drift) diagnostics.push(diagnostic('universe_drift', 'blocked', 'Scanner universes differ; union is used but drift must be resolved', 'scannerUniverses'))
  }
  const held = new Set(holdings)
  const bySymbol = new Map(dispositions.map((row) => [row.symbol, row]))
  const uncovered = []
  for (const symbol of [...union].sort()) {
    if (held.has(symbol)) continue
    const disposition = bySymbol.get(symbol)
    if (!disposition) {
      uncovered.push(symbol)
      continue
    }
    if (disposition.revisitAt && Date.parse(disposition.revisitAt) <= Date.parse(asOf)) uncovered.push(symbol)
  }
  if (uncovered.length) diagnostics.push(diagnostic('coverage_incomplete', 'blocked', 'Every declared-universe candidate needs a current disposition', 'dispositions', { uncovered }))
  return {
    data: {
      declaredUniverseCount: union.size,
      screenedUniverseCount: screened.size,
      dispositionCount: bySymbol.size,
      uncovered,
      complete: screened.size ? uncovered.length === 0 : null,
    },
    diagnostics,
  }
}

/**
 * How much discovery capacity this run actually had — and the answer when it
 * had none.
 *
 * ── The run that measured zero (issue #140) ───────────────────────────────
 *
 * This book woke six times and never once proposed a name it found itself. The
 * three holdings are all inherited; the manager had been a sell-side watcher
 * and an allocation calculator, and no output said so. The mechanism is that
 * discovery runs on **two** branches and both of them can be dark on the same
 * day:
 *
 * - **forward research** — `themeRadarDue` answers `due: false` for two days
 *   out of every three, which is the interval working as designed;
 * - **the mechanical sweep** — it needs a declared universe, and on a run that
 *   declared none `coverage` answers `universe_undeclared` with
 *   `complete: null`.
 *
 * Each half is individually correct and nothing anywhere added them up. The run
 * ended as a `WAIT` indistinguishable from the `WAIT` that means *evidence was
 * adequate and no change is needed* — which is the distinction `PROMPT.md`
 * invariant 5 spends a paragraph on, collapsing here on the one axis nobody
 * applied it to. So this counts the lanes, because *both lanes were shut* is a
 * fact about the run and not a mood.
 *
 * ⚠️ **A lane nobody asked about is not a lane that was open.** An absent input
 * is `unstated` rather than `open`: the failing run's whole shape was a
 * question never put, and defaulting the unasked half to open would reproduce
 * it. It is not `dark` either — that would claim a radar this call never saw
 * was not due.
 *
 * ⛔ **Never `blocked`, on any path.** The book whose universe is undeclared is
 * exactly the book that still has to be watched on the sell side: `exitCheck`,
 * `thesisSentinel` and the existing-position review all run on holdings alone,
 * and `PROMPT.md` is explicit that a blocked pre-flight never blocks the
 * direction that reduces risk. Zero discovery is a **report**, not a stop.
 *
 * ⚠️ **The one exception is the undisclosed claim, and it is not the run being
 * blocked — it is the proposal.** Pass this run's `DecisionProposal.uncertainty`
 * and a dark run that does not carry the fact is `blocked`: what is refused is
 * a proposal that had zero discovery capacity and does not say so, which is the
 * output the investor cannot tell from a considered no-change. The marker is
 * the code `discovery_lane_dark` **verbatim** in one `uncertainty` entry —
 * a token rather than a phrase, because the prose around it is written in the
 * invocation's `language` and a matcher looking for English words would pass
 * every Korean run for the wrong reason. It is the same round trip
 * `entryTranchePlan`'s `intent` makes for the same purpose.
 *
 * Omitting `uncertainty` leaves the disclosure unjudged rather than passed:
 * a call made before the proposal exists has nothing to read.
 */
export function discoveryCapacity({ radar = null, coverage = null, uncertainty = null } = {}) {
  const diagnostics = []
  const laneOf = (value) => (value === null ? 'unstated' : value ? 'open' : 'dark')
  const radarDue = typeof radar?.due === 'boolean' ? radar.due : null
  const screened = Number.isFinite(coverage?.screenedUniverseCount) ? coverage.screenedUniverseCount : null
  const lanes = {
    forwardResearch: laneOf(radarDue),
    mechanicalSweep: laneOf(screened === null ? null : screened > 0),
  }
  const values = Object.values(lanes)
  const openLaneCount = values.filter((lane) => lane === 'open').length
  const unstated = Object.entries(lanes).filter(([, lane]) => lane === 'unstated').map(([name]) => name)
  const dark = values.every((lane) => lane === 'dark')
  const capacity = openLaneCount === 2 ? 'full' : openLaneCount === 1 ? 'partial' : dark ? 'none' : 'unknown'
  if (unstated.length) {
    diagnostics.push(diagnostic(
      'discovery_lane_unstated',
      'unevaluated',
      'A discovery lane nobody asked about is not a lane that was open; pass themeRadarDue as `radar` and the coverage answer as `coverage`',
      unstated.includes('forwardResearch') ? 'radar' : 'coverage',
      { unstated },
    ))
  }
  if (dark) {
    diagnostics.push(diagnostic(
      'discovery_lane_dark',
      'unevaluated',
      'Both discovery branches were shut on this run — the radar was not due and no universe was declared — so this run’s discovery capacity was zero; report it as cannot-adjudicate rather than as a no-change with adequate evidence',
      'radar',
      { radarReason: radar?.reason ?? null, screenedUniverseCount: screened },
    ))
  } else if (openLaneCount === 1) {
    diagnostics.push(diagnostic(
      'discovery_lane_single',
      'info',
      'One discovery branch carried this run alone; the branches reinforce each other and neither replaces the other',
      'radar',
      { open: Object.entries(lanes).filter(([, lane]) => lane === 'open').map(([name]) => name) },
    ))
  }
  const disclosed = Array.isArray(uncertainty)
    ? uncertainty.some((entry) => typeof entry === 'string' && entry.includes('discovery_lane_dark'))
    : null
  if (dark && disclosed === false) {
    diagnostics.push(diagnostic(
      'discovery_lane_dark_undisclosed',
      'blocked',
      'This run found nothing because it looked nowhere, and its proposal does not say so; carry the code `discovery_lane_dark` verbatim in one `uncertainty` entry',
      'uncertainty',
      { entries: uncertainty.length },
    ))
  }
  return {
    data: {
      lanes,
      openLaneCount,
      capacity,
      dark,
      mustReport: dark,
      disclosed,
      waitCharacter: dark ? 'cannot-adjudicate' : null,
      meaning: 'zero discovery capacity is reported and never blocks; what is blocked is a proposal that had none and does not say so',
    },
    diagnostics,
  }
}

/**
 * A revisit promise is only a precommitment if it can expire.
 *
 * `sizing-and-concentration` states the contract in prose — every WATCH carries
 * subject, observable, operator, threshold or event, expiry and reason; expiry
 * defaults to `watchExpiryDays`; on expiry the promise forces a review rather
 * than renewing itself. An unexpiring WATCH is a disposition that never comes
 * back, which is how a candidate leaves the coverage denominator without anyone
 * deciding it should.
 */
export function validateWatch(watch, current, asOf, config = {}) {
  // AMP's spelling of the level and the band is read here too, so a watch
  // written the only way a `DecisionProposal` accepts it is evaluable (see
  // `normalizeWatch`). The `info` lines it raises say which name is canonical.
  const normalized = normalizeWatch(watch)
  const diagnostics = [...normalized.diagnostics]
  watch = normalized.watch
  const kind = watch?.kind
  if (!WATCH_TRIGGER_KINDS.has(kind)) diagnostics.push(diagnostic('watch_kind_unsupported', 'blocked', 'Use at-time, price or weight-drift; event producers are not assumed', 'watch.kind', { supported: [...WATCH_TRIGGER_KINDS] }))
  if (watch?.kind === 'at-time') {
    if (!watch.at || !Number.isFinite(Date.parse(watch.at)) || Date.parse(watch.at) <= Date.parse(asOf)) {
      diagnostics.push(diagnostic('watch_not_future', 'blocked', 'at-time WATCH must be a valid future instant', 'watch.at'))
    }
  }
  if (watch?.kind === 'price-below' && Number.isFinite(current?.price) && current.price <= watch.threshold) {
    diagnostics.push(diagnostic('watch_already_met', 'blocked', 'price-below WATCH is already true', 'watch.threshold'))
  }
  if (watch?.kind === 'price-above' && Number.isFinite(current?.price) && current.price >= watch.threshold) {
    diagnostics.push(diagnostic('watch_already_met', 'blocked', 'price-above WATCH is already true', 'watch.threshold'))
  }
  /**
   * A drift WATCH is already-met on the same terms as a price WATCH: it names
   * the weight it was registered against and the drift that would make it fire,
   * so today's weight decides whether the condition is still unresolved.
   */
  if (watch?.kind === 'weight-drift') {
    if (!Number.isFinite(watch?.threshold) || watch.threshold <= 0) {
      diagnostics.push(diagnostic('watch_threshold_invalid', 'blocked', 'weight-drift WATCH needs a positive drift threshold', 'watch.threshold'))
    } else if (!Number.isFinite(watch?.baselineWeight) && !Number.isFinite(current?.baselineWeight)) {
      diagnostics.push(diagnostic('watch_baseline_missing', 'unevaluated', 'weight-drift WATCH cannot be checked without the weight it was registered against; AMP states none, so it comes from the book', 'watch.baselineWeight'))
    } else if (Number.isFinite(current?.weight) && Math.abs(current.weight - (Number.isFinite(watch?.baselineWeight) ? watch.baselineWeight : current.baselineWeight)) >= watch.threshold) {
      diagnostics.push(diagnostic('watch_already_met', 'blocked', 'weight-drift WATCH is already true', 'watch.threshold', { drift: Math.abs(current.weight - (Number.isFinite(watch?.baselineWeight) ? watch.baselineWeight : current.baselineWeight)) }))
    }
  }
  if (watch?.observablePublished === false) diagnostics.push(diagnostic('watch_observable_unpublished', 'blocked', 'WATCH uses a KPI the company/source does not publish', 'watch.observable'))

  const asOfInstant = Date.parse(asOf)
  const defaultDays = Number.isFinite(config?.watchExpiryDays) ? config.watchExpiryDays : METHODOLOGY.watchExpiryDays
  let expiresAt = watch?.expiresAt ?? null
  let expirySource = 'declared'
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    expiresAt = Number.isFinite(asOfInstant) ? new Date(asOfInstant + defaultDays * 86_400_000).toISOString() : null
    expirySource = 'default'
  } else if (!Number.isFinite(Date.parse(expiresAt))) {
    diagnostics.push(diagnostic('watch_expiry_invalid', 'blocked', 'WATCH expiry must be a valid instant', 'watch.expiresAt'))
    expiresAt = null
    expirySource = 'invalid'
  }
  const expiryInstant = expiresAt === null ? NaN : Date.parse(expiresAt)
  if (Number.isFinite(expiryInstant) && Number.isFinite(asOfInstant) && expiryInstant <= asOfInstant) {
    diagnostics.push(diagnostic('watch_expired', 'blocked', 'An expired WATCH forces review; it is not silently renewed', 'watch.expiresAt', { expiresAt, asOf }))
  }
  /**
   * An at-time trigger that fires after its own expiry is unreachable inside
   * the lens that created it, which the same skill section already forbids.
   */
  if (watch?.kind === 'at-time' && Number.isFinite(expiryInstant) && Number.isFinite(Date.parse(watch?.at)) && Date.parse(watch.at) > expiryInstant) {
    diagnostics.push(diagnostic('watch_expiry_before_trigger', 'blocked', 'WATCH expires before its own trigger date; the condition is unreachable', 'watch.expiresAt', { at: watch.at, expiresAt }))
  }

  return { data: { valid: diagnostics.every((item) => item.severity !== 'blocked'), expiresAt, expirySource }, diagnostics }
}

/**
 * When each kind of WATCH can honestly be evaluated, and what that costs.
 *
 * The original harness answered this by shipping two scripts. `bin/gate-check`
 * ran every gate on completed daily bars; `bin/night-gate-check` ran during the
 * US session and evaluated **`price_at_or_below` only**, saying why in its own
 * docstring: *"`no_new_low`(basing) 게이트는 완성된 일봉이 필요하므로 야간에는
 * 평가하지 않는다."* The dividing line was never "is the market open" — it was
 * "does this condition need a bar that has closed".
 *
 * So the cadence is derived from the kind rather than declared on the watch. A
 * declared field would be a second place for the answer to live, and the first
 * one to go wrong: an author who writes `cadence: 'intraday'` on a drift watch
 * has not made it evaluable intraday.
 */
export const WATCH_EVALUATION = {
  'price-below': { cadence: 'intraday', observation: 'last-price' },
  'price-above': { cadence: 'intraday', observation: 'last-price' },
  /** A clock, not a bar. The instant is the instant whatever the session is doing. */
  'at-time': { cadence: 'clock', observation: 'clock' },
  /**
   * ⚠️ **Intraday, and this entry said `daily-close` until the runtime was
   * read.** The argument for the close was that weight is price × quantity over
   * the book, so an intraday drift reading is a reading of intraday noise. It is
   * a fair argument and it is not this package's to make: Aumos's Wake Engine
   * evaluates a `weight-drift` trigger on a live quote — re-pricing that one
   * position and folding the change into the book's own total — on the same
   * tick as the price triggers. A manager whose evaluator called that
   * `unevaluable` would refuse to score every drift wake it was ever sent.
   *
   * The noise is answered where it actually belongs, by `confirmationPending`:
   * a drift met on a live reading is a reason to look, and the RESIZE that may
   * follow is sized on a bar that has closed.
   */
  'weight-drift': { cadence: 'intraday', observation: 'last-price' },
}

/** What a run can see, and therefore which cadences it may evaluate. */
const OBSERVATION_SUPPORTS = {
  'last-price': new Set(['intraday', 'clock']),
  'completed-bar': new Set(['intraday', 'clock', 'daily-close']),
  clock: new Set(['clock']),
}

const NEAR_DEFAULTS = METHODOLOGY.watchNear

/**
 * Is this WATCH met, near, or neither — and was this run even able to ask?
 *
 * Four things here are the original's and each was lost in the port:
 *
 * 1. **`near`.** The original scored met / near / not_met, and `near` is what
 *    made the alert useful: a level approached is a person's cue to prepare,
 *    and a two-state check only ever says "too late" or "nothing".
 * 2. **The hard-block downgrade.** `active_block` lowered met *and* near to
 *    `blocked` when an earnings or cluster block was standing, and deliberately
 *    left `not_met` alone — *"so the report still says the level is not there."*
 *    A block is a reason not to act, never a reason to stop reporting.
 * 3. **`unevaluable` as its own answer.** A daily-close condition looked at
 *    from an intraday run is not `not-met`. Collapsing the two is how a run
 *    reports "the basing never confirmed" when what happened is that it never
 *    looked.
 * 4. **Session dedupe.** The same level brushed four times in one session is
 *    one thing worth waking a person for. `data/night_gate_state.json` held
 *    that; `alertedSessionKeys` is the same idea with the state outside.
 *
 * ⚠️ **A met WATCH read off a live price is not a number to act on.** It is
 * `confirmationPending`, which is the original's own words — *"게이트 충족은
 * 자동 발주가 아니라 '하네스 실행 요망' 신호다."* Entry quality still needs
 * `entryQualityGate` on a completed bar, and a drift still moves for the rest
 * of the session.
 */
export function evaluateWatch({ watch, observation = {}, blocks = [], alertedSessionKeys = [], asOf, config = {} } = {}) {
  const normalized = normalizeWatch(watch)
  const diagnostics = [...normalized.diagnostics]
  watch = normalized.watch
  const kind = watch?.kind
  const rule = WATCH_EVALUATION[kind]
  if (!rule) {
    diagnostics.push(diagnostic('watch_kind_unsupported', 'blocked', 'Use at-time, price or weight-drift; event producers are not assumed', 'watch.kind', { supported: Object.keys(WATCH_EVALUATION) }))
    return { data: null, diagnostics }
  }

  const observationKind = observation?.kind ?? null
  const supports = OBSERVATION_SUPPORTS[observationKind]
  if (!supports) {
    diagnostics.push(diagnostic('watch_observation_kind_unknown', 'unevaluated', 'An observation states what it is: last-price, completed-bar or clock', 'observation.kind', { given: observationKind, supported: Object.keys(OBSERVATION_SUPPORTS) }))
    return { data: { status: 'unevaluable', cadence: rule.cadence, needs: rule.observation, alertRequired: false }, diagnostics }
  }
  if (!supports.has(rule.cadence)) {
    diagnostics.push(diagnostic('watch_cadence_unavailable', 'unevaluated', 'This condition needs an observation this run does not have; not-met would be a claim it never checked', 'watch.kind', { kind, cadence: rule.cadence, needs: rule.observation, given: observationKind }))
    return { data: { status: 'unevaluable', cadence: rule.cadence, needs: rule.observation, alertRequired: false }, diagnostics }
  }

  const near = { ...NEAR_DEFAULTS, ...(config?.watchNear ?? {}) }
  let status = 'not-met'
  const details = {}

  if (kind === 'price-below' || kind === 'price-above') {
    const price = observation?.price
    const level = watch?.threshold
    if (!Number.isFinite(price) || !Number.isFinite(level)) {
      // The path names whichever half is actually absent. It said
      // `observation.price` unconditionally, so a run that observed a price and
      // stated its level as AMP's `price` was told to go and fetch the one thing
      // it had already supplied.
      const path = Number.isFinite(price) ? 'watch.threshold' : 'observation.price'
      diagnostics.push(diagnostic('watch_price_missing', 'unevaluated', 'A price WATCH needs an observed price and a numeric level', path, { observedPrice: Number.isFinite(price), level: Number.isFinite(level) }))
      return { data: { status: 'unevaluable', cadence: rule.cadence, needs: rule.observation, alertRequired: false }, diagnostics }
    }
    const met = kind === 'price-below' ? price <= level : price >= level
    const nearBound = kind === 'price-below' ? level * (1 + near.priceRatio) : level * (1 - near.priceRatio)
    const isNear = kind === 'price-below' ? price <= nearBound : price >= nearBound
    status = met ? 'met' : isNear ? 'near' : 'not-met'
    Object.assign(details, { price, level, nearBound })
  }

  if (kind === 'weight-drift') {
    const { weight } = observation
    const { threshold } = watch ?? {}
    // AMP states no baseline — the kernel measures drift against the weight in
    // the stored snapshot — so the caller's own book is the other place it can
    // come from. ⛔ Never defaulted to `weight`: a baseline equal to now is a
    // drift of zero, which is a watch that never fires and never says why.
    const baselineWeight = Number.isFinite(watch?.baselineWeight) ? watch.baselineWeight : observation?.baselineWeight
    if (!Number.isFinite(weight) || !Number.isFinite(threshold) || !Number.isFinite(baselineWeight)) {
      // Name the half that is missing. This said `observation.weight` however
      // the call came in, so a run that supplied the weight correctly and stated
      // its band as AMP's `beyond` was pointed at its own good input.
      const path = !Number.isFinite(weight)
        ? 'observation.weight'
        : Number.isFinite(threshold)
          ? 'watch.baselineWeight'
          : 'watch.threshold'
      diagnostics.push(diagnostic('watch_drift_inputs_missing', 'unevaluated', 'A drift WATCH needs an observed weight, a band (`threshold`, or AMP’s `beyond`) and the baseline it was registered against', path, { observedWeight: Number.isFinite(weight), threshold: Number.isFinite(threshold), baselineWeight: Number.isFinite(baselineWeight) }))
      return { data: { status: 'unevaluable', cadence: rule.cadence, needs: rule.observation, alertRequired: false }, diagnostics }
    }
    const drift = Math.abs(weight - baselineWeight)
    status = drift >= threshold ? 'met' : drift >= threshold * near.driftFraction ? 'near' : 'not-met'
    Object.assign(details, { drift, threshold, baselineWeight })
  }

  if (kind === 'at-time') {
    const at = Date.parse(watch?.at)
    const now = Date.parse(asOf)
    if (!Number.isFinite(at) || !Number.isFinite(now)) {
      diagnostics.push(diagnostic('watch_instant_missing', 'unevaluated', 'An at-time WATCH needs a valid instant and asOf', 'watch.at'))
      return { data: { status: 'unevaluable', cadence: rule.cadence, needs: rule.observation, alertRequired: false }, diagnostics }
    }
    const daysAway = (at - now) / 86_400_000
    status = daysAway <= 0 ? 'met' : daysAway <= near.timeDays ? 'near' : 'not-met'
    Object.assign(details, { at: watch.at, daysAway })
  }

  /**
   * A block lowers met and near, and leaves not-met where it is. Lowering
   * not-met would report a level as blocked when what is true is that the price
   * is nowhere near it, and those are different facts about the same day.
   */
  const standing = blocks.filter(Boolean)
  if (standing.length && (status === 'met' || status === 'near')) {
    diagnostics.push(diagnostic('watch_blocked', 'info', 'A standing block lowers a met or near WATCH; the level is still reported', 'blocks', { blocks: standing, downgradedFrom: status }))
    status = 'blocked'
  }

  const sessionKey = `${watch?.id ?? kind}|${observation?.sessionDate ?? 'no-session'}`
  const alreadyAlerted = alertedSessionKeys.includes(sessionKey)
  if (alreadyAlerted && status === 'met') {
    diagnostics.push(diagnostic('watch_alert_deduplicated', 'info', 'This WATCH already woke somebody in this session; brushing the level again is the same event', 'observation.sessionDate', { sessionKey }))
  }

  return {
    data: {
      status,
      cadence: rule.cadence,
      needs: rule.observation,
      observedWith: observationKind,
      /**
       * Met on a live reading is a reason to look, never a number to act on.
       *
       * For a price watch what is still owed is entry quality — basing,
       * `no_new_low`, the MA200 state — which `entryQualityGate` computes on a
       * closed bar. For a drift watch it is the weight itself, which moves for
       * the rest of the session. Both are the same sentence the original
       * harness wrote about its own night path: a met gate is a *"run the
       * harness"* signal, not an order.
       */
      confirmationPending: status === 'met' && observationKind === 'last-price' && rule.cadence === 'intraday',
      alertRequired: status === 'met' && !alreadyAlerted,
      sessionKey,
      ...details,
    },
    diagnostics,
  }
}

/**
 * One alert per WATCH per session, with the state small enough to keep.
 *
 * `evaluateWatch` answers whether *this* reading should wake somebody, and it
 * needs to be told what already did. The original harness kept that in
 * `data/night_gate_state.json` — a per-night file whose only job was stopping
 * the same level from alerting four times as a price wobbled across it.
 *
 * ⚠️ **It holds one session and no history, deliberately.** A key that
 * accumulated every alert ever raised would be the ledger
 * `skills/memory-contract/SKILL.md` forbids, and it would grow without bound
 * for a fact that stops being interesting at the closing bell. When the session
 * date changes the list is replaced rather than appended to, so the key is
 * bounded by the number of watches armed on one day.
 *
 * `changed` is false when nothing new alerted, and a run that reads it writes no
 * revision — which is the same rule every other key here follows: a revision
 * records that an aggregate moved, not that a run happened.
 */
/**
 * The session this key is bounded by, written so it is not mistaken for an
 * instant.
 *
 * ⚠️ **A bare date is a timestamp to the host, and this key held one.** (#136)
 * `memory_read` refuses a result carrying a string later than `asOf`, and the
 * pattern it matches deliberately includes the date-only form — SEC's `filed`
 * is written that way and *"some time on the 5th"* really can be after an `asOf`
 * earlier in the 5th. So a date-only field is compared against the **end** of
 * that day, and a session label is refused on the day it names.
 *
 * That is not an edge case here: every session date this manager writes is on
 * or after `asOf`'s UTC date, because KST and ET are both ahead of UTC or the
 * session is today's. Measured against the host's own matcher — `allocate` at
 * 08:00 KST (`asOf` 23:00Z the previous day, session tomorrow's date),
 * `kr-sleeve` at 15:45 KST and `us-sleeve` at 16:00 ET (both today's date,
 * refused because the end of today is after `asOf`) — **all three flows are
 * refused.** The key survived only by never having been written.
 *
 * ⛔ The host is right and this is not a workaround of a bug. Nothing at the
 * gateway can tell a date that means *published some time that day* from a date
 * that means *the name of a session*; teaching it to would mean a second table
 * listing every manager's fields, which `untilled/aumos#658` rejects for that
 * reason.
 *
 * So the field stops being timestamp-shaped, because it was never a timestamp:
 * it answers *which session*, not *which instant*. `sessionKey` has had that
 * shape all along — `` `${id}|${date}` `` does not match the host's anchored
 * pattern — and this is the same move on the field beside it.
 *
 * ⛔ **Not epoch milliseconds.** That is right for `run/armed-reviews`, whose
 * `at` genuinely is an instant. A session label written as a number would claim
 * to be a moment it is not, and pick one of the day's 86,400,000 by fiat.
 *
 * ⚠️ **One run's dedupe is lost at the changeover, and it cannot be rescued.**
 * An entry written under the old shape is unreadable *by the read path* — it
 * never arrives, so there is nothing for a tolerant reader to be tolerant of,
 * and a legacy branch here would be a branch that cannot execute. `at` →
 * `atEpochMs` is the opposite case and does read both. The cost is one session
 * in which a level that brushes twice wakes somebody twice.
 */
const sessionLabel = (sessionDate) => `session-${sessionDate}`

export function watchAlertState({ previous = null, sessionDate, alerting = [], asOf } = {}) {
  const diagnostics = []
  if (typeof sessionDate !== 'string' || sessionDate.length === 0) {
    diagnostics.push(diagnostic('watch_alert_session_missing', 'unevaluated', 'A session date is what bounds this key; without one the alerts of two days would merge', 'sessionDate'))
    return { data: null, diagnostics }
  }
  const session = sessionLabel(sessionDate)
  const carried = previous?.session === session && Array.isArray(previous?.alerted) ? previous.alerted : []
  if (previous?.session !== undefined && previous.session !== session) {
    diagnostics.push(diagnostic('watch_alert_session_rolled', 'info', 'A new session replaces the previous session’s alerts rather than appending to them', 'sessionDate', { from: previous.session, to: session }))
  }
  const added = alerting.filter((key) => typeof key === 'string' && key.length > 0 && !carried.includes(key))
  const alerted = [...carried, ...new Set(added)].sort()
  const changed = alerted.length !== carried.length || previous?.session !== session
  return {
    data: {
      changed,
      alerted,
      newlyAlerted: [...new Set(added)].sort(),
      session,
      nextState: { schemaVersion: 2, updatedAsOf: asOf ?? null, session, alerted },
    },
    diagnostics,
  }
}
