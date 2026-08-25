import { diagnostic } from './diagnostics.mjs'

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

export function validateWatch(watch, current, asOf) {
  const diagnostics = []
  const supported = new Set(['at-time', 'price-below', 'price-above', 'weight-drift'])
  if (!supported.has(watch?.kind)) diagnostics.push(diagnostic('watch_kind_unsupported', 'blocked', 'Use at-time, price or weight-drift; event producers are not assumed', 'watch.kind'))
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
  if (watch?.observablePublished === false) diagnostics.push(diagnostic('watch_observable_unpublished', 'blocked', 'WATCH uses a KPI the company/source does not publish', 'watch.observable'))
  return { data: { valid: diagnostics.every((item) => item.severity !== 'blocked') }, diagnostics }
}
