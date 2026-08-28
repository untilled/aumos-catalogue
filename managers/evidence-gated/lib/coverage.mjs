import { diagnostic } from './diagnostics.mjs'
import { WATCH_TRIGGER_KINDS, normalizeTriggerKind } from './methodology.mjs'

export function coverageState({ scannerUniverses = [], extensions = [], holdings = [], dispositions = [], asOf }) {
  const diagnostics = []
  const universeSets = scannerUniverses.map((rows) => new Set(rows))
  const union = new Set([...extensions, ...holdings, ...universeSets.flatMap((set) => [...set])])
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
  return { data: { declaredUniverseCount: union.size, dispositionCount: bySymbol.size, uncovered, complete: uncovered.length === 0 }, diagnostics }
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
  const diagnostics = []
  const kind = normalizeTriggerKind(watch?.kind)
  if (kind !== watch?.kind) {
    diagnostics.push(diagnostic('trigger_kind_alias', 'info', 'The canonical spelling is kebab-case; the underscore form is accepted and normalized', 'watch.kind', { given: watch?.kind, canonical: kind }))
  }
  if (!WATCH_TRIGGER_KINDS.has(kind)) diagnostics.push(diagnostic('watch_kind_unsupported', 'blocked', 'Use at-time, price or weight-drift; event producers are not assumed', 'watch.kind', { supported: [...WATCH_TRIGGER_KINDS] }))
  watch = watch ? { ...watch, kind } : watch
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
    } else if (!Number.isFinite(watch?.baselineWeight)) {
      diagnostics.push(diagnostic('watch_baseline_missing', 'unevaluated', 'weight-drift WATCH cannot be checked without the weight it was registered against', 'watch.baselineWeight'))
    } else if (Number.isFinite(current?.weight) && Math.abs(current.weight - watch.baselineWeight) >= watch.threshold) {
      diagnostics.push(diagnostic('watch_already_met', 'blocked', 'weight-drift WATCH is already true', 'watch.threshold', { drift: Math.abs(current.weight - watch.baselineWeight) }))
    }
  }
  if (watch?.observablePublished === false) diagnostics.push(diagnostic('watch_observable_unpublished', 'blocked', 'WATCH uses a KPI the company/source does not publish', 'watch.observable'))

  const asOfInstant = Date.parse(asOf)
  const defaultDays = Number.isFinite(config?.watchExpiryDays) ? config.watchExpiryDays : 30
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

const NEAR_DEFAULTS = { priceRatio: 0.03, driftFraction: 0.8, timeDays: 7 }

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
  const diagnostics = []
  const kind = normalizeTriggerKind(watch?.kind)
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
    const level = watch?.threshold ?? watch?.level
    if (!Number.isFinite(price) || !Number.isFinite(level)) {
      diagnostics.push(diagnostic('watch_price_missing', 'unevaluated', 'A price WATCH needs an observed price and a numeric level', 'observation.price'))
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
    const { threshold, baselineWeight } = watch ?? {}
    if (!Number.isFinite(weight) || !Number.isFinite(threshold) || !Number.isFinite(baselineWeight)) {
      diagnostics.push(diagnostic('watch_drift_inputs_missing', 'unevaluated', 'A drift WATCH needs an observed weight, a threshold and the baseline it was registered against', 'observation.weight'))
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
export function watchAlertState({ previous = null, sessionDate, alerting = [], asOf } = {}) {
  const diagnostics = []
  if (typeof sessionDate !== 'string' || sessionDate.length === 0) {
    diagnostics.push(diagnostic('watch_alert_session_missing', 'unevaluated', 'A session date is what bounds this key; without one the alerts of two days would merge', 'sessionDate'))
    return { data: null, diagnostics }
  }
  const carried = previous?.sessionDate === sessionDate && Array.isArray(previous?.alerted) ? previous.alerted : []
  if (previous?.sessionDate !== undefined && previous.sessionDate !== sessionDate) {
    diagnostics.push(diagnostic('watch_alert_session_rolled', 'info', 'A new session replaces the previous session’s alerts rather than appending to them', 'sessionDate', { from: previous.sessionDate, to: sessionDate }))
  }
  const added = alerting.filter((key) => typeof key === 'string' && key.length > 0 && !carried.includes(key))
  const alerted = [...carried, ...new Set(added)].sort()
  const changed = alerted.length !== carried.length || previous?.sessionDate !== sessionDate
  return {
    data: {
      changed,
      alerted,
      newlyAlerted: [...new Set(added)].sort(),
      nextState: { schemaVersion: 1, updatedAsOf: asOf ?? null, sessionDate, alerted },
    },
    diagnostics,
  }
}
