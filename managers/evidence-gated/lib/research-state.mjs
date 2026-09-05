import kr from '../data/opportunity-universe.kr.json' with { type: 'json' }
import us from '../data/opportunity-universe.us.json' with { type: 'json' }
import { diagnostic } from './diagnostics.mjs'

// A bounded research index, never a copy of provider responses or a portfolio.
export function researchUniverse({ market, extensions = [], asOf } = {}) {
  const seed = market === 'kr' ? kr : market === 'us' ? us : null
  if (!seed) return { data: null, diagnostics: [diagnostic('research_market_invalid', 'blocked', 'Expected kr or us', 'market')] }
  const visible = Date.parse(asOf) >= Date.parse(seed.updated ?? seed.updated_at)
  if (!visible) return { data: null, diagnostics: [diagnostic('research_universe_post_as_of', 'unevaluated', 'The curated snapshot did not yet exist at asOf', 'asOf')] }
  const rows = new Map(seed.symbols.map((row) => [row.symbol, { ...row, market }]))
  const diagnostics = []
  for (const row of extensions) {
    if (!row?.symbol || row.market !== market || !row.evidenceIds?.length || !Number.isFinite(Date.parse(row.observedAt)) || Date.parse(row.observedAt) > Date.parse(asOf)) {
      diagnostics.push(diagnostic('research_extension_invalid', 'blocked', 'Extensions require market, symbol, observedAt and evidenceIds available at asOf', 'extensions'))
      continue
    }
    if (!rows.has(row.symbol)) rows.set(row.symbol, { symbol: row.symbol, market, sector: row.sector ?? null })
  }
  return { data: { market, symbols: [...rows.values()], snapshotDate: seed.updated ?? seed.updated_at, sourceCommit: '7702b19a04678b833c90ba1f6323e74232795155', scope: 'curated-research-not-whole-market', requiresCurrentEligibilityCheck: true }, diagnostics }
}

export function researchState({ previous = null, observations = [], asOf } = {}) {
  const diagnostics = []
  if (previous !== null && (previous.schemaVersion !== 1 || !Array.isArray(previous.rows) || !Number.isFinite(Date.parse(previous.updatedAsOf)) || Date.parse(previous.updatedAsOf) > Date.parse(asOf))) return { data: null, diagnostics: [diagnostic('research_state_invalid', 'blocked', 'Read a valid point-in-time research index before updating it', 'previous')] }
  const rows = new Map()
  for (const row of [...(previous?.rows ?? []), ...observations]) {
    if (typeof row?.symbol !== 'string' || row.symbol.length > 32 || (row?.sector != null && (typeof row.sector !== 'string' || row.sector.length > 80)) || row?.evidenceIds?.some?.((id) => typeof id !== 'string' || !id || id.length > 128)) {
      diagnostics.push(diagnostic('research_observation_invalid', 'blocked', 'Research identifiers and sector labels must be compact strings, not source text', 'observations'))
      continue
    }
    if (!row?.symbol || !['kr', 'us'].includes(row.market) || !Number.isFinite(Date.parse(row.observedAt)) || Date.parse(row.observedAt) > Date.parse(asOf) || !Array.isArray(row.evidenceIds) || !row.evidenceIds.length || row.evidenceIds.some((id) => typeof id !== 'string')) {
      diagnostics.push(diagnostic('research_observation_invalid', 'blocked', 'Research index rows require symbol, market, observedAt and actual evidenceIds', 'observations'))
      continue
    }
    const key = `${row.market}:${row.symbol}`
    const old = rows.get(key)
    if (old && Date.parse(old.observedAt) > Date.parse(row.observedAt)) continue
    rows.set(key, { symbol: row.symbol, market: row.market, observedAt: row.observedAt, evidenceIds: row.evidenceIds.slice(0, 8), sector: row.sector ?? old?.sector ?? null, extension: row.extension === true || old?.extension === true })
  }
  if (rows.size > 200) diagnostics.push(diagnostic('research_state_capacity', 'blocked', 'Research index exceeds 200 names; explicitly review removals rather than silently evicting history', 'observations'))
  if (new TextEncoder().encode(JSON.stringify([...rows.values()])).length > 60000) diagnostics.push(diagnostic('research_state_capacity', 'blocked', 'Research index exceeds its 60 KB payload budget; retain the previous revision and review its scope', 'observations'))
  return { data: { nextState: diagnostics.length ? null : { schemaVersion: 1, updatedAsOf: asOf, rows: [...rows.values()] }, fundamentalCache: 'host-source-storage-required' }, diagnostics }
}
