import kr from '../data/opportunity-universe.kr.json' with { type: 'json' }
import us from '../data/opportunity-universe.us.json' with { type: 'json' }
import { diagnostic } from './diagnostics.mjs'

// A bounded research index, never a copy of provider responses or a portfolio.
export function researchUniverse({ market, extensions = [], asOf } = {}) {
  const seed = market === 'kr' ? kr : market === 'us' ? us : null
  if (!seed) return { data: null, diagnostics: [diagnostic('research_market_invalid', 'blocked', 'Expected kr or us — the sleeve. ⚠️ The MIC (XKRX/XNAS/XNYS) is read too and converted at the one input boundary (#212 ⑥), so a value refused here is neither spelling', 'market')] }
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

/**
 * ── What a stored `coverage/research-index` may look like (issue #222) ──────
 *
 * This operation is the **writer** of that key, and it used to refuse the value
 * actually stored there. Four things were required of `previous` at once —
 * `schemaVersion === 1`, an array `rows`, a parseable `updatedAsOf`, and that
 * instant not after `asOf` — and every run up to 0.4.60 hand-wrote the key with
 * descriptive fields (`extensions`, `universeProvenance`, `usMapping`, …) and no
 * `rows` at all. So the key was **self-locked**: the first malformed write made
 * it permanently unreadable by its own owner, and the checkpoint
 * `hooks/guard-budget.mjs` and `PROMPT.md` §Orchestration prescribe for a run
 * that stopped at a limit could not be produced.
 *
 * ⚠️ **A missing shape is not a point-in-time failure, and they are separated
 * here.** Two of the four checks were about the operation's own bookkeeping and
 * two are about correctness:
 *
 * | check | now | why |
 * |---|---|---|
 * | `rows` is not an array | **degraded** — read as an empty index | `rows` is this operation's own field. Absent means «nothing carried forward», which is exactly `[]`; the answer is then built from `observations` alone. It carries *less* history, never wrong history, and it is the one degradation that unlocks the key |
 * | `schemaVersion` absent | **degraded** | the pre-#222 hand-written blobs have none. There is nothing to misread: without `rows` there is nothing to carry |
 * | `schemaVersion` present and not `1` | **still refused** | a writer this code does not know. Its rows may be shaped in a way this code would misread or silently drop, and dropping history is the failure this whole file exists to avoid |
 * | `updatedAsOf` absent or unparseable | **degraded** | nothing reads it. Every row carries its own `observedAt` and is checked against `asOf` one by one below, so this field cannot make a row unsafe |
 * | `updatedAsOf` parses and is **after** `asOf` | **still refused** | this is the real point-in-time signal and the per-row check does not catch it: an index written by a later run can hold only past-dated rows and still leak that run's judgement backwards. ⛔ It cannot lock the key either — this operation writes `updatedAsOf: asOf`, so a forward run never reads its own future, and a replay reading an earlier pin is a refusal that is *right* |
 *
 * ⛔ **The degradations are silent in `diagnostics` on purpose.** `nextState` is
 * `null` whenever any diagnostic is present, so a diagnostic here would refuse
 * by another name and leave the key locked exactly as before. What the caller
 * is told instead is in the answer: `previousRead` says which of the readings
 * was taken, and `previousExtraKeys` names the descriptive siblings that were
 * seen and not carried.
 *
 * ⚠️ **Sibling fields may sit beside `rows` and are the caller's to keep.** They
 * are reported by **name only** and never copied into `nextState`: the 60 KB
 * budget below measures `rows`, and carrying arbitrary caller fields through
 * would be a hole in it — and in the rule that this key is a roster, not a
 * source cache. A run that wants its prose keeps writing it beside `nextState`.
 */
export function researchState({ previous = null, observations = [], asOf } = {}) {
  const diagnostics = []
  const storedVersion = previous?.schemaVersion
  const storedAt = Date.parse(previous?.updatedAsOf)
  if (previous !== null && ((storedVersion != null && storedVersion !== 1) || (Number.isFinite(storedAt) && storedAt > Date.parse(asOf)))) return { data: null, diagnostics: [diagnostic('research_state_invalid', 'blocked', 'Read a valid point-in-time research index before updating it: `schemaVersion`, when present, must be 1, and `updatedAsOf`, when it parses, must not be after asOf. ⚠️ A stored value with no `rows` is not refused — it reads as an empty index', 'previous')] }
  const carried = Array.isArray(previous?.rows) ? previous.rows : []
  const previousRead = previous === null ? 'absent' : Array.isArray(previous.rows) ? 'rows' : 'no-rows'
  const previousExtraKeys = previous === null ? [] : Object.keys(previous).filter((key) => !['schemaVersion', 'updatedAsOf', 'rows'].includes(key)).sort().slice(0, 32)
  const rows = new Map()
  for (const row of [...carried, ...observations]) {
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
  return { data: { nextState: diagnostics.length ? null : { schemaVersion: 1, updatedAsOf: asOf, rows: [...rows.values()] }, previousRead, previousExtraKeys, fundamentalCache: 'host-source-storage-required' }, diagnostics }
}
