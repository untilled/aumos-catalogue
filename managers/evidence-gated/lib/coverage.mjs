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
