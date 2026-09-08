import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── The line that was missing, written down (issue #146) ───────────────────
 *
 * The issue read the fundamental branch as *"permanently dead"* and named two
 * causes: an unported curated universe and an unported fundamentals cache. The
 * 2026-09-06 run disproved the first half of that and narrowed the second to a
 * single link.
 *
 * - ✅ `researchUniverse({market:'kr'})` answers **74** names and `{market:'us'}`
 *   **83**, at `snapshotDate 2026-07-24`. The roster is here.
 * - ✅ `open-dart` answers: `company.json?corp_code=00126380` → `stock_code
 *   005930`. The financial route is alive.
 * - ⛔ What is missing is the **join**: nothing mapped the 74 roster symbols to
 *   the `corp_code` every OpenDART financial route is keyed by. The route that
 *   supplies it — `/api/corpCode.xml` — is already on the allowlist and
 *   `parseDartCorpCodes` already reads it. It was simply never requested.
 *
 * ⇒ **KR is not a dead lane; it is an unfed one.** And US is the same lane with
 * a different registry, which is *not* what this comment used to say (#179):
 * it read *"US is easier still — companyfacts is keyed by the ticker, so there
 * is no mapping step at all"*, and that sentence was false. Measured
 * 2026-09-07: `GET /api/xbrl/companyfacts/INTC` → **404 `NoSuchKey`**;
 * `GET /api/xbrl/companyfacts/CIK0000050863.json` → **200, 4,311,809 bytes**.
 * The `{symbol}` in the allowlist is a **CIK file name**, never a ticker, so
 * `/files/company_tickers.json` is a precondition of the *vendor* route and not
 * only of the cache's `vendorId`. ⚠️ `cik_str` there is an unpadded integer
 * (`50863`); the ten-digit zero-pad is the caller's job.
 *
 * This module is that one line, made into operations a flow can be told to
 * call in order — and the two markets now have the same shape:
 *
 *   corpCode.xml       → `mapCorporationCodes` → fnlttSinglAcntAll ─┐
 *   company_tickers.json → `mapCorporationCodes` → companyfacts ────┴→ `radarCandidates` → `upsideRadar`
 *
 * ⚠️ **Nothing here stores anything.** `skills/memory-contract/SKILL.md`
 * forbids private memory from being a source cache in as many words, and the
 * storage the branch needs is the host's — which now exists, so
 * `fundamentalsPlan` is written against `source_cache_read` /
 * `source_cache_refresh` rather than against a re-fetch every run.
 */

/** Payload accessors that never invent a value. */
const rowsOf = (value) => (Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : [])

/**
 * ── OpenDART reports its own refusals on an HTTP 200 ───────────────────────
 *
 * ⛔ **`013` and `020` both arrive as a 200 carrying an empty list, and reading
 * them as the same thing makes the whole starvation diagnosis worthless.**
 * `013` is *we looked and the vendor holds no row*; `020` is *we were not
 * allowed to look*. A lane starved by the second one is a quota problem that
 * clears by itself tomorrow; a lane starved by the first is a fact about the
 * filer. `normalizeDartFilings` already blocks on both — correctly, neither is
 * an answer — but it blocks on them identically, and the branch this module
 * feeds has to tell them apart to say *why* it is starving.
 */
export const DART_STATUS_CLASSES = {
  '000': { classification: 'ok', feedFailure: null, retryable: false },
  '010': { classification: 'key-not-registered', feedFailure: 'credential-rejected', retryable: false },
  '011': { classification: 'key-unusable', feedFailure: 'credential-rejected', retryable: false },
  '012': { classification: 'access-denied', feedFailure: 'credential-rejected', retryable: false },
  '013': { classification: 'no-matching-row', feedFailure: 'vendor-holds-no-row', retryable: false },
  '014': { classification: 'file-absent', feedFailure: 'vendor-holds-no-row', retryable: false },
  '020': { classification: 'quota-exceeded', feedFailure: 'quota-exhausted', retryable: true },
  '021': { classification: 'rate-limited', feedFailure: 'quota-exhausted', retryable: true },
  '100': { classification: 'request-invalid', feedFailure: 'request-invalid', retryable: false },
  '101': { classification: 'unauthorized-access', feedFailure: 'credential-rejected', retryable: false },
  '800': { classification: 'service-maintenance', feedFailure: 'vendor-unavailable', retryable: true },
  '900': { classification: 'unknown-error', feedFailure: 'vendor-unavailable', retryable: true },
  '901': { classification: 'endpoint-deprecated', feedFailure: 'request-invalid', retryable: false },
}

const DART_FEED_DIAGNOSTICS = {
  'credential-rejected': ['dart_credential_rejected', 'blocked', 'OpenDART refused the key; this is an access failure and never a fact about the filer'],
  'vendor-holds-no-row': ['dart_query_matched_nothing', 'unevaluated', 'OpenDART matched no row for this query; the question was asked and answered with nothing, which is not the same as a refusal'],
  'quota-exhausted': ['dart_quota_exhausted', 'blocked', 'OpenDART refused on quota; we were not allowed to look, so nothing here is evidence of absence'],
  'request-invalid': ['dart_request_invalid', 'blocked', 'OpenDART rejected the request itself; vary one axis rather than recording a vendor outage'],
  'vendor-unavailable': ['dart_vendor_unavailable', 'unevaluated', 'OpenDART reported its own unavailability; retry is bounded and this is not an answer'],
}

export function dartVendorStatus({ payload, path = 'status' } = {}) {
  const diagnostics = []
  const status = payload?.status ?? null
  if (typeof status !== 'string') {
    diagnostics.push(diagnostic('dart_status_missing', 'unevaluated', 'OpenDART answers every call with a status field; without it the response cannot be read as success or refusal', path))
    return { data: { status: null, classification: 'unreadable', feedFailure: 'response-unreadable', retryable: false, usable: false }, diagnostics }
  }
  const known = DART_STATUS_CLASSES[status]
  if (!known) {
    diagnostics.push(diagnostic('dart_status_unknown', 'unevaluated', 'OpenDART returned a status this package has not measured; it is recorded rather than guessed at', path, { status, message: payload?.message ?? null }))
    return { data: { status, classification: 'unmeasured', feedFailure: 'response-unreadable', retryable: false, usable: false }, diagnostics }
  }
  if (known.feedFailure) {
    const [code, severity, message] = DART_FEED_DIAGNOSTICS[known.feedFailure]
    diagnostics.push(diagnostic(code, severity, message, path, { status, classification: known.classification, message: payload?.message ?? null, retryable: known.retryable }))
  }
  return { data: { status, ...known, usable: status === '000' }, diagnostics }
}

/**
 * ── Where the fetch comes from now (aumos#671, #683 · released 0.3.30) ─────
 *
 * `HOST-FOLLOWUPS.md` recorded fundamentals storage as the one item this
 * package could not build for itself. The host built it: `source_cache_read`
 * and `source_cache_refresh` answer with a **`state`** that separates the four
 * cases this branch otherwise has to guess between.
 *
 * | state | what it means | what this package does |
 * |---|---|---|
 * | `never-fetched` | nobody has ever asked — **blind, not empty** | refresh, and if that is impossible say *never fed* |
 * | `refresh-failed` | the attempt did not reach the vendor; `failure` says why and `cached` is what is still on hand | report the failure; the cache is not empty, it is behind |
 * | `stale` | the last success is outside the stated `freshFor` | refresh, then read |
 * | `fresh` | the last success is inside it | read it — **and an empty `documents` under `fresh` is the vendor having nothing, which is an answer** |
 *
 * ⚠️ The separation is the point, not the saved round trip. *Nothing is cached*
 * and *the refresh failed* both hand back no usable document and mean opposite
 * things; `fresh` with nothing in it means a third. `radarFeedDiagnosis` reads
 * exactly those distinctions back out, so a plan that collapses them starves
 * the diagnosis as surely as an unmade call starves the lane.
 *
 * ⛔ **`freshFor` has no default and this package does not invent one per call.**
 * The host refuses the call without it, deliberately — a default would be the
 * host setting this methodology's deadline. `FUNDAMENTALS_FRESH_FOR_SECONDS` is
 * the methodology's answer for a quarterly filing, stated once and overridable
 * by the caller, and every plan row carries the value it was planned with.
 */
export const CACHE_STATES = ['fresh', 'stale', 'never-fetched', 'refresh-failed']

/** Seven days: a periodic filing does not change inside one, and a run is daily. */
export const FUNDAMENTALS_FRESH_FOR_SECONDS = 7 * 24 * 60 * 60

const CACHE_ACTIONS = {
  fresh: 'read-cache',
  stale: 'refresh-then-read',
  'never-fetched': 'refresh-then-read',
  'refresh-failed': 'report-refresh-failure',
}

/**
 * `provider`/`document` pairs the host's collector actually routes.
 *
 * ⛔ **There is no cache document for `corpCode.xml`.** `source_cache_refresh`
 * is keyed by the filer — it *takes* the `vendorId` (`corp_code` for OpenDART,
 * CIK for SEC) rather than supplying it, and its own description says Aumos
 * does not resolve one. So the registry step stays a `source_request`, and it
 * stays first: the cache route cannot be addressed until the join exists. That
 * is the whole shape of this issue, restated by the host's own contract.
 */
export const CACHE_DOCUMENTS = {
  'open-dart': ['filings', 'financials'],
  'sec-edgar': ['companyfacts'],
}

const KR_SYMBOL = /^\d{6}$/
const MARKET_MIC = { kr: 'XKRX', us: 'XNAS' }

/**
 * The one place this package spells a `companyfacts` address (#179).
 *
 * ⚠️ It takes a CIK and never a ticker, and the file name carries the `CIK`
 * prefix, ten zero-padded digits and the `.json` suffix — all three, measured
 * 2026-09-07: `.../companyfacts/INTC` is a 404 `NoSuchKey`,
 * `.../companyfacts/CIK0000050863.json` is a 200.
 */
export const secFactsPath = (cik) => `/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`

function cacheEntry(cache, key) {
  const row = cache?.[key]
  if (row === undefined || row === null) return { state: null, reported: false }
  if (typeof row === 'string') return { state: CACHE_STATES.includes(row) ? row : null, reported: true, raw: row }
  return { state: CACHE_STATES.includes(row.state) ? row.state : null, reported: true, raw: row.state ?? null, observedAt: row.observedAt ?? null, documentCount: Array.isArray(row.documents) ? row.documents.length : Array.isArray(row.cached) ? row.cached.length : null }
}

/**
 * The ordered source calls that feed `upsideRadar`, with the cache state of
 * each one already read.
 *
 * ⛔ It plans and never fetches. The gateway call is the flow's, because only a
 * flow holds `source_request` / `source_cache_read`; what this returns is the
 * list of calls to make, **in the order that makes them answerable** — the
 * registry before the financials it keys, never the other way round. That order
 * is the fix: the 2026-09-06 run made the second call's worth of effort and
 * never made the first, so nothing it fetched could be addressed to a filer.
 */
export function fundamentalsPlan({ market, symbols = [], corporationCodes = [], cache = {}, businessYear = null, reportCode = null, freshForSeconds = FUNDAMENTALS_FRESH_FOR_SECONDS, asOf } = {}) {
  const diagnostics = []
  if (market !== 'kr' && market !== 'us') {
    return { data: null, diagnostics: [diagnostic('feed_market_invalid', 'blocked', 'Expected kr or us — the sleeve, the same argument researchUniverse takes. ⚠️ The MIC (XKRX/XNAS/XNYS) is read too and converted at the one input boundary (#212 ⑥), so a value refused here is neither spelling', 'market', { received: market ?? null })] }
  }
  const names = [...new Set(symbols.map((row) => (typeof row === 'string' ? row : row?.symbol)).filter((row) => typeof row === 'string' && row))]
  if (!names.length) diagnostics.push(diagnostic('feed_universe_empty', 'unevaluated', 'A roster is required before the branch can be fed; researchUniverse is what supplies it', 'symbols'))
  if (!finite(freshForSeconds) || freshForSeconds <= 0) {
    return { data: null, diagnostics: [diagnostic('cache_fresh_for_invalid', 'blocked', 'source_cache_read requires a positive freshFor in seconds and takes no default', 'freshForSeconds', { received: freshForSeconds ?? null })] }
  }
  const mic = MARKET_MIC[market]
  const requests = []
  const push = (row) => {
    if (row.tool === 'source_request') {
      requests.push({ ...row, cacheState: null, action: 'source-request' })
      return
    }
    const entry = cacheEntry(cache, row.cacheKey)
    if (!entry.reported) diagnostics.push(diagnostic('source_cache_unreported', 'unevaluated', 'No cache state was reported for this call, so a missing cache cannot be told from a failed refresh; call source_cache_read first', 'cache', { cacheKey: row.cacheKey }))
    else if (entry.state === null) diagnostics.push(diagnostic('source_cache_state_unknown', 'unevaluated', `Cache state must be one of ${CACHE_STATES.join(', ')} — the field is state, not status`, 'cache', { cacheKey: row.cacheKey, received: entry.raw ?? null }))
    else if (entry.state === 'refresh-failed') diagnostics.push(diagnostic('source_cache_refresh_failed', 'blocked', 'The host attempted a refresh and it did not reach the vendor; what is cached is behind rather than absent, and this is never an empty cache', 'cache', { cacheKey: row.cacheKey, cachedDocuments: entry.documentCount }))
    else if (entry.state === 'never-fetched') diagnostics.push(diagnostic('source_cache_never_fetched', 'unevaluated', 'Nothing has ever been collected for this filer, so this run is blind here rather than looking at an empty answer', 'cache', { cacheKey: row.cacheKey }))
    else if (entry.state === 'fresh' && entry.documentCount === 0) diagnostics.push(diagnostic('source_cache_fresh_and_empty', 'info', 'A fresh cache holding no document is the vendor having nothing for this filer; that is an answered question, not a gap', 'cache', { cacheKey: row.cacheKey }))
    requests.push({ ...row, cacheState: entry.state, cachedDocuments: entry.documentCount ?? null, action: entry.state ? CACHE_ACTIONS[entry.state] : 'refresh-then-read' })
  }

  const mapped = new Map()
  for (const row of corporationCodes) {
    const symbol = typeof row === 'string' ? null : row?.symbol ?? row?.stockCode ?? null
    const code = typeof row === 'string' ? row : row?.corporationCode ?? row?.cik ?? row?.vendorId ?? null
    if (!symbol || code === null || code === undefined) continue
    if (market === 'us') {
      /**
       * ⚠️ The pad is applied here as well as in `mapCorporationCodes`, because
       * `corporationCodes` is an argument and a flow may hand over the vendor's
       * own unpadded `cik_str`. An id that is not a CIK at all is left out of
       * the map rather than pasted into an address — it then appears by name in
       * `corp_code_mapping_pending` below, which is the whole point.
       */
      const digits = String(code)
      if (/^\d{1,10}$/.test(digits)) mapped.set(symbol, digits.padStart(10, '0'))
      continue
    }
    mapped.set(symbol, code)
  }

  if (market === 'kr') {
    /**
     * ⚠️ The registry is step one and it was the missing step. Every OpenDART
     * route — the cache's `vendorId` included — is keyed by `corp_code`; the
     * roster is keyed by the six-digit listing symbol; nothing joined them.
     */
    push({ step: 'corp-code-registry', tool: 'source_request', source: 'open-dart', path: '/api/corpCode.xml', query: {}, symbol: null, responseIsZip: true, parseWith: 'parseDartCorpCodes', fallback: { path: '/api/list.json', parseWith: 'normalizeDartFilings', reads: ['corp_code', 'stock_code'] } })
    const unmapped = names.filter((symbol) => !mapped.has(symbol))
    if (unmapped.length) diagnostics.push(diagnostic('corp_code_mapping_pending', 'unevaluated', 'These roster symbols have no corp_code yet, so no call for them can be addressed — neither the vendor route nor the cache, which takes the same id', 'corporationCodes', { unmapped: unmapped.slice(0, 20), unmappedCount: unmapped.length, of: names.length }))
    if (mapped.size && (!businessYear || !reportCode)) diagnostics.push(diagnostic('dart_report_period_unset', 'unevaluated', 'The financials document requires a year and a report code by name; without both the host refuses the refresh rather than answering broadly', 'businessYear', { businessYear, reportCode }))
    for (const symbol of names) {
      const vendorId = mapped.get(symbol)
      if (!vendorId) continue
      const parameters = { ...(businessYear ? { year: String(businessYear) } : {}), ...(reportCode ? { reportCode: String(reportCode) } : {}) }
      push({ step: 'financials', tool: 'source_cache_read', source: 'open-dart', document: 'financials', market: mic, symbol, vendorId, parameters, freshForSeconds, cacheKey: `open-dart:financials:${symbol}`, refreshWith: 'source_cache_refresh', parseWith: 'normalizeDartFinancials' })
      push({ step: 'filings', tool: 'source_cache_read', source: 'open-dart', document: 'filings', market: mic, symbol, vendorId, parameters: {}, freshForSeconds, cacheKey: `open-dart:filings:${symbol}`, refreshWith: 'source_cache_refresh', parseWith: 'normalizeDartFilings' })
    }
  } else {
    /**
     * ⚠️ **The registry is step one here too, and it used to not be** (#179).
     * This branch addressed the vendor as `/api/xbrl/companyfacts/${symbol}`
     * with the roster ticker in it, on the strength of the comment above — and
     * that address answers 404 for every one of the 83 names. It is the same
     * shape as the KR defect this module was written for: the roster carries a
     * listing symbol, every route is keyed by the vendor's own filer id, and
     * nothing joined them. SEC's id is the CIK and `/files/company_tickers.json`
     * is where it comes from, for the **vendor** route as much as for the
     * cache's `vendorId`.
     *
     * ⛔ A name with no CIK is not planned on either route. There is no address
     * to plan — and a request built out of a ticker is not a lower-quality
     * attempt, it is a 404 that reads as *"the vendor holds nothing for this
     * filer"*. It is reported by name instead, exactly as KR reports its own.
     */
    const unresolved = names.filter((symbol) => !mapped.has(symbol))
    if (unresolved.length) {
      push({ step: 'ticker-registry', tool: 'source_request', source: 'sec-edgar', path: '/files/company_tickers.json', query: {}, symbol: null, parseWith: 'raw-json', reads: ['ticker', 'cik_str'], resolves: unresolved.length })
      diagnostics.push(diagnostic('corp_code_mapping_pending', 'unevaluated', 'These roster symbols have no CIK yet, so no call for them can be addressed — neither the vendor route, whose companyfacts file name is the CIK, nor the cache, which takes the same id', 'corporationCodes', { unmapped: unresolved.slice(0, 20), unmappedCount: unresolved.length, of: names.length, vendorIdKind: 'cik' }))
    }
    for (const symbol of names) {
      const vendorId = mapped.get(symbol) ?? null
      if (!vendorId) continue
      push({ step: 'facts', tool: 'source_cache_read', source: 'sec-edgar', document: 'companyfacts', market: mic, symbol, vendorId, parameters: {}, freshForSeconds, path: null, vendorPath: secFactsPath(vendorId), cacheKey: `sec-edgar:companyfacts:${symbol}`, refreshWith: 'source_cache_refresh', parseWith: 'normalizeSecFacts' })
    }
  }

  const byAction = {}
  for (const row of requests) byAction[row.action] = (byAction[row.action] ?? 0) + 1
  return {
    data: {
      market,
      symbolCount: names.length,
      requests,
      byAction,
      readsCache: requests.filter((row) => row.action === 'read-cache').length,
      refetches: requests.filter((row) => row.action === 'refresh-then-read').length,
      cacheTools: { read: 'source_cache_read', refresh: 'source_cache_refresh', documents: CACHE_DOCUMENTS },
      freshForSeconds,
      /**
       * The host trims every cached observation and attempt at invocation asOf
       * before the gateway process sees it. The package filters again anyway —
       * `filterPointInTime` and each normalizer — because a boundary enforced
       * in one place only is a boundary one refactor away from being gone.
       */
      pointInTime: { boundedAt: asOf ?? null, hostTrims: true, filterAgain: true },
    },
    diagnostics,
  }
}

/**
 * The join the branch was missing: roster symbol → the vendor's own filer id.
 *
 * ⛔ **This one function is the whole of what #146 turned out to be.** The
 * roster is here, the routes are open, the parsers exist — and every one of
 * those routes is keyed by an id the roster does not carry. KR's is OpenDART's
 * eight-digit `corp_code`; the host cache's `vendorId` is the same id for KR
 * and the SEC CIK for US.
 *
 * Two routes supply the KR side and both are accepted, because `corpCode.xml`
 * answers with a ZIP the gateway relays as sent and a run may only be holding
 * the `list.json` rows instead — `skills/data-source-contract/SKILL.md` says
 * so. What is refused is a mapping with no source at all.
 */
export function mapCorporationCodes({ market = 'kr', symbols = [], registryRows = [], filingRows = [], tickerRows = [], asOf } = {}) {
  const diagnostics = []
  if (market !== 'kr' && market !== 'us') {
    return { data: null, diagnostics: [diagnostic('feed_market_invalid', 'blocked', 'Expected kr or us — the sleeve, the same argument researchUniverse takes. ⚠️ The MIC (XKRX/XNAS/XNYS) is read too and converted at the one input boundary (#212 ⑥), so a value refused here is neither spelling', 'market', { received: market ?? null })] }
  }
  const names = [...new Set(symbols.map((row) => (typeof row === 'string' ? row : row?.symbol)).filter((row) => typeof row === 'string' && row))]
  const index = new Map()
  const record = (symbol, vendorId, name, source) => {
    if (typeof symbol !== 'string' || !symbol) return
    if (market === 'kr' ? !KR_SYMBOL.test(symbol) || !/^\d{8}$/.test(vendorId ?? '') : !/^\d{1,10}$/.test(String(vendorId ?? ''))) return
    const id = market === 'kr' ? vendorId : String(vendorId).padStart(10, '0')
    if (!index.has(symbol)) index.set(symbol, { vendorId: id, ...(market === 'kr' ? { corporationCode: id } : { cik: id }), corporationName: name ?? null, mappedFrom: source })
  }
  if (market === 'kr') {
    for (const row of rowsOf(registryRows)) record(row?.stockCode, row?.corporationCode, row?.corporationName, 'corp-code-registry')
    for (const row of rowsOf(filingRows)) record(row?.stockCode, row?.corporationCode, row?.corporationName, 'filing-list')
  } else {
    /** `company_tickers.json` is an object of rows, so its values are the roster. */
    const rows = Array.isArray(tickerRows) ? tickerRows : Object.values(tickerRows ?? {})
    for (const row of rows) record(row?.ticker ?? row?.symbol, row?.cik_str ?? row?.cik, row?.title ?? row?.name, 'sec-ticker-registry')
  }
  const registrySize = index.size
  if (!registrySize) {
    diagnostics.push(diagnostic('corp_code_registry_absent', 'unevaluated', market === 'kr'
      ? 'No corp_code registry rows were supplied, so no KR symbol can be addressed; this is an unrequested registry, never an absence of filers'
      : 'No SEC ticker rows were supplied, so no CIK is known; every companyfacts address is the CIK file name, so neither the vendor route nor the cache can be addressed — this is an unrequested registry, never an absence of filers', market === 'kr' ? 'registryRows' : 'tickerRows'))
  }
  const mapped = []
  const unmapped = []
  for (const symbol of names) {
    const row = index.get(symbol)
    if (row) mapped.push({ symbol, market, ...row })
    else unmapped.push(symbol)
  }
  if (registrySize && unmapped.length) {
    diagnostics.push(diagnostic(
      mapped.length ? 'corp_code_unmapped_symbols' : 'corp_code_mapping_empty',
      mapped.length ? 'info' : 'unevaluated',
      mapped.length
        ? 'The registry was read and these roster symbols were not in it; each is a name the branch cannot address, reported one by one rather than folded into a total'
        : 'The registry was read and matched none of the roster; the join failed rather than the vendor',
      'symbols',
      { unmapped: unmapped.slice(0, 20), unmappedCount: unmapped.length, of: names.length, registrySize },
    ))
  }
  return {
    data: { market, mapped, unmapped, registrySize, requested: names.length, coverage: names.length ? round(mapped.length / names.length, 4) : null, asOf: asOf ?? null },
    diagnostics,
  }
}

/** OpenDART account ids, by what they mean rather than by which taxonomy spelled them. */
const DART_OPERATING_INCOME = new Set(['dart_OperatingIncomeLoss', 'ifrs-full_ProfitLossFromOperatingActivities', 'ifrs_ProfitLossFromOperatingActivities'])
const DART_REVENUE = new Set(['ifrs-full_Revenue', 'ifrs_Revenue', 'ifrs-full_RevenueFromContractsWithCustomers'])
const SEC_OPERATING_INCOME = ['OperatingIncomeLoss']
const SEC_REVENUE = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet']

/**
 * `reprt_code` → the calendar quarter end it reports.
 *
 * ⚠️ It is an assumption and it is labelled one. OpenDART reports a business
 * year and a report code, not a period end, and a filer on a non-calendar
 * fiscal year does not land on these dates. `upsideRadar` reads `periodEnd`
 * only to bound the filing lag, so the assumption is bounded too — but a
 * candidate carrying it says so in `periodEndBasis`.
 */
const DART_REPORT_PERIOD_END = { 11013: '03-31', 11012: '06-30', 11014: '09-30', 11011: '12-31' }

function yoyPercent(current, prior) {
  if (!finite(current) || !finite(prior) || prior === 0) return null
  return round(((current - prior) / Math.abs(prior)) * 100, 4)
}

function krFilings(rows, diagnostics) {
  const groups = new Map()
  for (const row of rows) {
    const key = `${row.corporationCode}|${row.businessYear}|${row.reportCode}|${row.statementScope ?? 'unknown'}`
    const group = groups.get(key) ?? { corporationCode: row.corporationCode, businessYear: row.businessYear, reportCode: row.reportCode, statementScope: row.statementScope ?? null, availableAt: row.availableAt, receiptNumber: row.receiptNumber, currency: row.currency ?? 'KRW' }
    if (Date.parse(row.availableAt) > Date.parse(group.availableAt)) group.availableAt = row.availableAt
    if (DART_OPERATING_INCOME.has(row.accountId)) {
      group.operatingIncome = row.currentAmount
      group.priorOperatingIncome = row.priorAmount ?? null
    }
    if (DART_REVENUE.has(row.accountId)) {
      group.revenue = row.currentAmount
      group.priorRevenue = row.priorAmount ?? null
    }
    groups.set(key, group)
  }
  const filings = []
  for (const group of groups.values()) {
    const suffix = DART_REPORT_PERIOD_END[group.reportCode]
    if (!suffix || !/^\d{4}$/.test(group.businessYear ?? '')) {
      diagnostics.push(diagnostic('filing_period_unreadable', 'unevaluated', 'A business year and a measured report code are required before a filing has a period end', 'financials', { businessYear: group.businessYear ?? null, reportCode: group.reportCode ?? null }))
      continue
    }
    const operatingIncomeYoy = yoyPercent(group.operatingIncome, group.priorOperatingIncome)
    if (operatingIncomeYoy === null) diagnostics.push(diagnostic('filing_comparable_missing', 'unevaluated', 'The prior comparable amount is what makes a filing an inflection reading; without it the filing is carried and the axis stays unknown', 'financials', { receiptNumber: group.receiptNumber, accounts: 'operating-income' }))
    const margin = finite(group.operatingIncome) && finite(group.revenue) && group.revenue !== 0 ? group.operatingIncome / group.revenue : null
    const priorMargin = finite(group.priorOperatingIncome) && finite(group.priorRevenue) && group.priorRevenue !== 0 ? group.priorOperatingIncome / group.priorRevenue : null
    filings.push({
      periodEnd: `${group.businessYear}-${suffix}`,
      periodEndBasis: 'calendar-year-plus-report-code-assumed',
      availableAt: group.availableAt,
      receiptNumber: group.receiptNumber,
      statementScope: group.statementScope,
      operatingIncome: group.operatingIncome ?? null,
      revenue: group.revenue ?? null,
      operatingIncomeYoy,
      marginDeltaYoy: margin !== null && priorMargin !== null ? round((margin - priorMargin) * 100, 4) : null,
      currency: group.currency,
      sourceType: 'opendart-full-financial-statements',
    })
  }
  return filings.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
}

function usFilings(rows, diagnostics) {
  const pick = (metrics) => rows.filter((row) => metrics.includes(row.metric) && (row.unit === 'USD' || row.unit === 'usd'))
  const income = pick(SEC_OPERATING_INCOME)
  const revenue = pick(SEC_REVENUE)
  if (!income.length) diagnostics.push(diagnostic('filing_operating_income_absent', 'unevaluated', 'The companyfacts response carried no OperatingIncomeLoss observation, so the inflection axis has no reading', 'facts'))
  const durationDays = (row) => (Date.parse(row.periodEnd) - Date.parse(row.periodStart)) / 86_400_000
  const comparable = (row, pool) => pool.find((other) => {
    const gap = (Date.parse(row.periodEnd) - Date.parse(other.periodEnd)) / 86_400_000
    return gap >= 350 && gap <= 380 && Math.abs(durationDays(other) - durationDays(row)) <= 20
  })
  const byPeriod = new Map()
  for (const row of income) {
    if (!row.periodStart || !row.periodEnd) continue
    const key = `${row.periodStart}|${row.periodEnd}`
    const kept = byPeriod.get(key)
    if (!kept || Date.parse(row.availableAt) < Date.parse(kept.availableAt)) byPeriod.set(key, row)
  }
  const filings = []
  for (const row of byPeriod.values()) {
    const prior = comparable(row, income)
    if (!prior) diagnostics.push(diagnostic('filing_comparable_missing', 'unevaluated', 'No same-length observation one year earlier, so this period is not a year-on-year reading', 'facts', { periodEnd: row.periodEnd }))
    const currentRevenue = revenue.find((other) => other.periodStart === row.periodStart && other.periodEnd === row.periodEnd)
    const priorRevenue = prior ? revenue.find((other) => other.periodStart === prior.periodStart && other.periodEnd === prior.periodEnd) : null
    const margin = currentRevenue?.value ? row.value / currentRevenue.value : null
    const priorMargin = prior && priorRevenue?.value ? prior.value / priorRevenue.value : null
    filings.push({
      periodEnd: row.periodEnd,
      periodStart: row.periodStart,
      periodEndBasis: 'reported-by-the-filer',
      availableAt: `${row.availableAt}T23:59:59Z`,
      accession: row.accession ?? null,
      form: row.form ?? null,
      operatingIncome: row.value,
      revenue: currentRevenue?.value ?? null,
      operatingIncomeYoy: prior ? yoyPercent(row.value, prior.value) : null,
      marginDeltaYoy: finite(margin) && finite(priorMargin) ? round((margin - priorMargin) * 100, 4) : null,
      currency: 'USD',
      sourceType: 'sec-companyfacts',
    })
  }
  return filings.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
}

/** Metric names a host `NormalizedFiling` may carry, by what they mean. */
const CACHE_OPERATING_INCOME = ['operatingIncome', 'operatingIncomeLoss', 'operating_income']
const CACHE_REVENUE = ['revenue', 'revenues', 'sales']

function metricOf(metrics, aliases) {
  for (const alias of aliases) if (finite(metrics?.[alias])) return metrics[alias]
  return null
}

/**
 * Filings out of the host cache's own `NormalizedFiling`, which is the shape
 * `source_cache_read` hands back — `{period:{start,end,fiscalPeriod}, currency,
 * metrics}` and no raw payload. A year-on-year reading needs the same period a
 * year earlier, so it is computed across the returned documents rather than
 * from any single one.
 */
function cachedFilings(documents, diagnostics) {
  const rows = documents
    .map((document) => ({
      periodStart: document?.normalized?.period?.start ?? null,
      periodEnd: document?.normalized?.period?.end ?? null,
      fiscalPeriod: document?.normalized?.period?.fiscalPeriod ?? null,
      currency: document?.normalized?.currency ?? null,
      availableAt: document?.publishedAt ?? document?.capturedAt ?? null,
      version: document?.version ?? null,
      documentKey: document?.documentKey ?? null,
      operatingIncome: metricOf(document?.normalized?.metrics, CACHE_OPERATING_INCOME),
      revenue: metricOf(document?.normalized?.metrics, CACHE_REVENUE),
    }))
    .filter((row) => row.periodEnd && row.availableAt)
  if (documents.length && !rows.length) diagnostics.push(diagnostic('cache_document_unnormalized', 'unevaluated', 'The cached documents carried no normalized period, so nothing here can be read as a filing; the raw payload stays with source_request', 'documents'))
  if (rows.length && rows.every((row) => row.operatingIncome === null)) diagnostics.push(diagnostic('cache_metrics_unrecognized', 'unevaluated', `No cached document carried an operating-income metric under a name this package reads (${CACHE_OPERATING_INCOME.join(', ')})`, 'documents'))
  const filings = []
  for (const row of rows) {
    const prior = rows.find((other) => {
      const gap = (Date.parse(row.periodEnd) - Date.parse(other.periodEnd)) / 86_400_000
      return gap >= 350 && gap <= 380 && (row.fiscalPeriod === null || other.fiscalPeriod === row.fiscalPeriod)
    })
    if (!prior) diagnostics.push(diagnostic('filing_comparable_missing', 'unevaluated', 'No cached document one year earlier for the same fiscal period, so this filing is not a year-on-year reading', 'documents', { periodEnd: row.periodEnd }))
    const margin = finite(row.operatingIncome) && finite(row.revenue) && row.revenue !== 0 ? row.operatingIncome / row.revenue : null
    const priorMargin = prior && finite(prior.operatingIncome) && finite(prior.revenue) && prior.revenue !== 0 ? prior.operatingIncome / prior.revenue : null
    filings.push({
      periodEnd: row.periodEnd,
      periodStart: row.periodStart,
      periodEndBasis: 'reported-by-the-filer',
      availableAt: row.availableAt,
      documentKey: row.documentKey,
      version: row.version,
      operatingIncome: row.operatingIncome,
      revenue: row.revenue,
      operatingIncomeYoy: prior ? yoyPercent(row.operatingIncome, prior.operatingIncome) : null,
      marginDeltaYoy: finite(margin) && finite(priorMargin) ? round((margin - priorMargin) * 100, 4) : null,
      currency: row.currency,
      sourceType: 'host-source-cache',
    })
  }
  return filings.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
}

/**
 * Vendor rows — or the host cache's normalized documents — in, `upsideRadar`
 * candidates out.
 *
 * ⛔ **A symbol with no filings still comes back.** It comes back with an empty
 * `filings` array and a named reason, because dropping it is what turns *this
 * name was never fetched* into *this name did not qualify* — the exact swap
 * this whole issue is about. `unfed` is where those names are counted.
 */
export function radarCandidates({ market, symbols = [], financials = {}, facts = {}, documents = {}, prices = {}, events = {}, catalysts = {}, valuations = {}, asOf } = {}) {
  const diagnostics = []
  if (market !== 'kr' && market !== 'us') {
    return { data: null, diagnostics: [diagnostic('feed_market_invalid', 'blocked', 'Expected kr or us — the sleeve, the same argument researchUniverse takes. ⚠️ The MIC (XKRX/XNAS/XNYS) is read too and converted at the one input boundary (#212 ⑥), so a value refused here is neither spelling', 'market', { received: market ?? null })] }
  }
  const roster = symbols.map((row) => (typeof row === 'string' ? { symbol: row } : row)).filter((row) => typeof row?.symbol === 'string' && row.symbol)
  const candidates = []
  const unfed = []
  for (const row of roster) {
    const symbol = row.symbol
    const cached = documents[symbol]
    const latestEarnings = (events[symbol] ?? [])
      .filter((entry) => Number.isFinite(Date.parse(entry?.announcedAt)) && (!asOf || Date.parse(entry.announcedAt) <= Date.parse(asOf)))
      .sort((a, b) => Date.parse(b.announcedAt) - Date.parse(a.announcedAt))[0] ?? null
    const supplied = cached !== undefined ? cached : market === 'kr' ? financials[symbol] : facts[symbol]
    const fromCache = cached !== undefined
    const perSymbol = []
    let filings = []
    if (supplied === undefined) {
      unfed.push({ symbol, reason: 'no-response-supplied-for-this-symbol' })
    } else {
      const normalized = rowsOf(supplied)
      if (!normalized.length) unfed.push({ symbol, reason: fromCache ? 'cache-answered-with-no-document' : 'response-supplied-but-carried-no-rows' })
      filings = fromCache ? cachedFilings(normalized, perSymbol) : market === 'kr' ? krFilings(normalized, perSymbol) : usFilings(normalized, perSymbol)
      if (!filings.length && normalized.length) unfed.push({ symbol, reason: 'rows-supplied-but-no-comparable-filing-could-be-built' })
    }
    for (const entry of perSymbol) diagnostics.push({ ...entry, details: { ...entry.details, symbol } })
    candidates.push({
      asset: symbol,
      market,
      sector: row.sector ?? null,
      filings,
      price: prices[symbol] ?? { status: 'unknown', reason: 'no-price-observation-supplied' },
      events: events[symbol] ?? [],
      catalysts: catalysts[symbol] ?? [],
      /**
       * ⚠️ **`upsideRadar` read this field and nothing anywhere wrote it**
       * (#169). `expectation` is `{ status: 'unknown', reason: 'no-point-in-
       * time-event-record' }` for every candidate in every run this package
       * has ever produced, because the axis was read off `latestEarnings` and
       * the only shape supplied here was `events`. The mirror of the defect
       * this package keeps finding: computed and read by nobody, versus read
       * and produced by nobody. The most recent event announced at or before
       * `asOf` is what the axis is about, so it is what it gets.
       */
      ...(latestEarnings ? { latestEarnings } : {}),
      ...(valuations[symbol] ? { valuation: valuations[symbol] } : {}),
      feed: {
        filingsBuilt: filings.length,
        withComparable: filings.filter((filing) => finite(filing.operatingIncomeYoy)).length,
        responseSupplied: supplied !== undefined,
      },
    })
  }
  const withFilings = candidates.filter((row) => row.filings.length).length
  if (!withFilings && candidates.length) diagnostics.push(diagnostic('radar_feed_produced_nothing', 'unevaluated', 'Every roster name came back with no usable filing, so the branch is about to run on an empty plate; radarFeedDiagnosis names which stage lost it', 'symbols', { of: candidates.length }))
  return {
    data: {
      market,
      candidates,
      unfed,
      fedCount: withFilings,
      comparableCount: candidates.filter((row) => row.filings.some((filing) => finite(filing.operatingIncomeYoy))).length,
      asOf: asOf ?? null,
    },
    diagnostics,
  }
}

/**
 * ── Saying *what* was missing, not merely *that* something was (issue #146, ask 4) ──
 *
 * `radar_lane_starved` says the lane is *"unfed rather than empty"* and stops
 * there, which was enough while the branch had never been wired at all. Once it
 * is wired, "unfed" has five different causes with five different fixes, and a
 * run that cannot name which one it hit reports the same sentence forever.
 *
 * The stages are checked in the order they occur, and the **first** one that
 * failed is the answer — a mapping that produced nothing because the registry
 * never arrived is a registry finding, not a mapping one.
 *
 * ── `partially-fed`, because one name out of eighty-three read as all of them (#178) ──
 *
 * The last branch was `fedCount > 0`, so a roster of 83 that produced **one**
 * usable filing came back `fed` / `the-branch-was-fed`, and the lane header a
 * later run reads said the market had been looked at. Measured on
 * `run_73a3e6c41c204f468ee8be8d2923d898`: `fedCount: 1`, 83 excluded, 82 of
 * them `no-valid-point-in-time-filing` — 82 names that were never fed,
 * published as a judgement that they did not qualify. That is exactly the
 * `never-fed` ⇄ `fed-and-genuinely-empty` mixture `PROMPT.md` §3 calls the
 * worst outcome this branch can produce, arrived at by counting.
 *
 * ⛔ **And the correction is not the other silent move.** One fed name is not
 * nothing either, so `partially-fed` is its own stage rather than a demotion to
 * `never-fed`, and the counts ride along on the answer, on the diagnostic and
 * on every lane header: `fedCount` of `candidateCount`. Absence is a count, not
 * a shrug — ⛔ and never the symbols themselves.
 */
const FEED_STAGES = ['registry', 'mapping', 'request', 'response', 'normalization', 'partially-fed', 'fed']

/**
 * ── `never-fed` was one word for two facts (issue #228, ask 5) ─────────────
 *
 * Two of the three lanes read the catalyst axis, and until #228 nothing in this
 * package produced it automatically — so a branch whose filings arrived whole
 * and whose catalyst axis had never been touched came back **`never-fed`**, or
 * worse `fed-and-genuinely-empty`, with one cause about the filing path and
 * nothing at all about the axis that was actually missing. *«No catalyst
 * producer ran»* and *«the producer ran and registered nothing»* have opposite
 * fixes — call `catalystCadence`/`catalystRegister`, versus go and find out why
 * a sleeve with a cache full of filings derived no window — and they were the
 * same word.
 *
 * ⚠️ They are two verdicts now, and the split reads the register's own answer
 * rather than inferring one: `catalysts === null` is *nobody produced*, a
 * register whose coverage counts no researched and no derived name is *produced
 * and empty*. ⛔ A register that did register windows leaves the verdict alone —
 * the axis was fed and the lane's emptiness is then a real answer about the
 * horizon.
 */
const CATALYST_LANE_REASONS = /no-catalyst-registered|no-event-in-the-last-30-days/

export function radarFeedDiagnosis({ market, symbols = [], plan = null, mapping = null, responses = [], candidates = null, catalysts = null, lanes = null, asOf } = {}) {
  const diagnostics = []
  if (market !== 'kr' && market !== 'us') {
    return { data: null, diagnostics: [diagnostic('feed_market_invalid', 'blocked', 'Expected kr or us — the sleeve, the same argument researchUniverse takes. ⚠️ The MIC (XKRX/XNAS/XNYS) is read too and converted at the one input boundary (#212 ⑥), so a value refused here is neither spelling', 'market', { received: market ?? null })] }
  }
  const rosterCount = new Set(symbols.map((row) => (typeof row === 'string' ? row : row?.symbol)).filter(Boolean)).size
  const requests = Array.isArray(plan?.requests) ? plan.requests : []
  const cacheStates = {}
  for (const row of requests) cacheStates[row.cacheState ?? 'unreported'] = (cacheStates[row.cacheState ?? 'unreported'] ?? 0) + 1
  const responseRows = Array.isArray(responses) ? responses : []
  /**
   * How many names this reading is entitled to divide by (#178). The rows
   * `radarCandidates` actually built are the honest denominator — a roster of
   * 83 that only ever addressed 40 filers is 40 candidates, and dividing by 83
   * would report a join loss twice. The roster is the fallback for a caller
   * that passed counts without the rows, and `null` when neither is knowable:
   * ⛔ an unknown denominator answers `null`, never a coverage of 1.
   */
  const candidateCount = Array.isArray(candidates?.candidates) ? candidates.candidates.length : rosterCount || null
  const failures = {}
  for (const row of responseRows) {
    const key = row?.feedFailure ?? (row?.status === '000' || row?.usable === true ? null : row?.classification ?? null)
    if (key) failures[key] = (failures[key] ?? 0) + 1
  }

  let stage = 'fed'
  let cause = null
  /**
   * ⚠️ **Both registries, and both markets** (#179). The four registry-stage
   * branches below used to be gated on `market === 'kr'`, on the strength of
   * the claim that US needed no join. It needs the same one: `companyfacts` is
   * addressed by the CIK file name, so a US run holding no `company_tickers`
   * mapping lost its input at the *registry*, and reporting that as
   * `no-fundamental-request-was-planned` names the wrong stage — which is the
   * one thing this operation exists to get right.
   */
  const REGISTRY_STEPS = ['corp-code-registry', 'ticker-registry']
  const registryPlanned = requests.some((row) => REGISTRY_STEPS.includes(row.step))
  const registryFailed = responseRows.find((row) => REGISTRY_STEPS.includes(row?.step) && row?.usable === false)

  if (mapping === null) {
    /**
     * ⛔ This is the 2026-09-06 branch, and naming it is half of ask 4. The
     * roster was declared, the radar was called, and no run ever asked for the
     * registry that addresses it — so `no-valid-point-in-time-filing` ×13 was
     * never about the thirteen filers.
     */
    stage = 'registry'
    cause = registryPlanned ? 'registry-planned-but-never-read' : 'registry-never-requested'
  } else if (registryFailed) {
    stage = 'registry'
    cause = 'registry-request-failed'
  } else if (mapping && mapping.registrySize === 0) {
    stage = 'registry'
    cause = 'registry-received-but-empty'
  } else if (mapping && mapping.mapped?.length === 0 && rosterCount > 0) {
    stage = 'mapping'
    cause = 'registry-read-but-no-roster-symbol-matched'
  } else if (!requests.filter((row) => ['financials', 'facts'].includes(row.step)).length) {
    stage = 'request'
    cause = 'no-fundamental-request-was-planned'
  } else if (failures['quota-exhausted']) {
    stage = 'response'
    cause = 'vendor-quota-exhausted-we-were-not-allowed-to-look'
  } else if (failures['credential-rejected']) {
    stage = 'response'
    cause = 'vendor-refused-the-credential'
  } else if (failures['request-invalid']) {
    stage = 'response'
    cause = 'vendor-rejected-the-request-shape'
  } else if (failures['vendor-unavailable'] || failures['response-unreadable']) {
    stage = 'response'
    cause = 'vendor-did-not-answer'
  } else if (cacheStates['refresh-failed']) {
    /** The host asked and the vendor did not answer. What is cached is behind. */
    stage = 'response'
    cause = 'source-cache-refresh-failed'
  } else if (cacheStates['never-fetched'] && !responseRows.length) {
    /** ⛔ Nobody has ever asked. Blind, and it must not read as an empty answer. */
    stage = 'response'
    cause = 'source-cache-never-fetched-and-no-refresh-was-made'
  } else if (candidates === null) {
    stage = 'response'
    cause = 'responses-were-not-normalized-into-candidates'
  } else if (failures['vendor-holds-no-row'] && !candidates.fedCount) {
    stage = 'response'
    cause = 'vendor-holds-no-row-for-these-filers'
  } else if (!candidates.fedCount && cacheStates.fresh && !responseRows.length) {
    /** A fresh cache holding nothing is the vendor's answer, not a gap. */
    stage = 'response'
    cause = 'source-cache-is-fresh-and-holds-no-document-for-these-filers'
  } else if (!candidates.fedCount) {
    stage = 'normalization'
    cause = 'responses-arrived-but-no-comparable-filing-could-be-built'
  } else if (candidateCount !== null && candidates.fedCount < candidateCount) {
    /**
     * ⚠️ **Counted before the comparable check, for the same reason `fedCount`
     * is** (#178): *how many names arrived* is an earlier question than *what
     * the ones that arrived carried*, and the first stage that lost input is
     * the answer. The one name that did arrive is still reported — as a count,
     * on `fedCount`, and it is why this is not `never-fed`.
     */
    stage = 'partially-fed'
    cause = 'some-candidates-were-fed-and-the-rest-were-never-fed'
  } else if (!candidates.comparableCount) {
    stage = 'normalization'
    cause = 'filings-built-but-none-carried-a-prior-comparable'
  } else {
    stage = 'fed'
    cause = 'the-branch-was-fed'
  }

  const fed = stage === 'fed'
  const laneRows = lanes && typeof lanes === 'object' ? Object.entries(lanes) : []
  const starvedLanes = laneRows.filter(([, row]) => row?.starved).map(([lane]) => lane)
  /**
   * ⚠️ The worst outcome this package can produce is mixing *fed and empty*
   * with *never fed*, so the two are named on the same object rather than left
   * to be inferred from an absent diagnostic.
   */
  const partial = stage === 'partially-fed'
  const coverage = candidateCount === null || !finite(candidates?.fedCount) ? null : { fed: candidates.fedCount, of: candidateCount, unfed: candidateCount - candidates.fedCount }
  let verdict = !laneRows.length ? 'unevaluated' : partial ? 'partially-fed' : fed && !starvedLanes.length ? 'fed-and-evaluated' : fed ? 'fed-and-genuinely-empty' : 'never-fed'

  /* ── the catalyst axis, told from the filing path (#228) ─────────────── */
  const catalystStarved = laneRows.some(([, row]) => row?.starved && Object.keys(row?.reasons ?? {}).some((reason) => CATALYST_LANE_REASONS.test(reason)))
  const registerCoverage = catalysts?.coverage ?? null
  const catalystProducerRan = catalysts !== null && catalysts !== undefined && registerCoverage !== null
  const registeredNames = catalystProducerRan ? (registerCoverage.researched ?? 0) + (registerCoverage.derived ?? 0) + (registerCoverage.eventsResearched ?? 0) : null
  const catalystAxis = {
    producer: catalystProducerRan ? 'ran' : 'absent',
    starvedLanesReadIt: catalystStarved,
    researched: registerCoverage?.researched ?? null,
    derived: registerCoverage?.derived ?? null,
    eventsResearched: registerCoverage?.eventsResearched ?? null,
    withCatalystInHorizon: registerCoverage?.withCatalystInHorizon ?? null,
  }
  /** ⚠️ Only these two verdicts are overridden. `partially-fed` is a count on the filing path and `fed-and-evaluated` is a lane that answered; neither is a sentence about the catalyst axis. */
  if (catalystStarved && (verdict === 'never-fed' || verdict === 'fed-and-genuinely-empty')) {
    if (!catalystProducerRan) {
      verdict = 'never-fed-no-catalyst-producer'
      diagnostics.push(diagnostic('catalyst_producer_absent', 'unevaluated', 'Lanes that read the catalyst and event axis are starved and no catalystRegister answer was supplied, so this branch cannot tell «nobody produced the axis» from «the axis was produced and holds nothing» — run catalystCadence and catalystRegister, and pass the register\'s answer here as catalysts', 'catalysts', { market, starvedLanes }))
    } else if (!registeredNames) {
      verdict = 'never-fed-catalyst-producer-empty'
    }
  }
  if (!fed) {
    diagnostics.push(diagnostic(
      'radar_feed_broken',
      'unevaluated',
      partial
        ? `The fundamental branch was fed for ${coverage.fed} of ${coverage.of} candidates and the other ${coverage.unfed} were never fed; the fed ones are answerable and the rest must not read as names this run judged`
        : 'The fundamental branch did not receive its input, and this names the stage that lost it rather than reporting starvation alone',
      'plan',
      { market, stage, cause, rosterCount, cacheStates, failures, ...(coverage ? { coverage } : {}) },
    ))
  }
  if (verdict === 'fed-and-genuinely-empty') {
    diagnostics.push(diagnostic('radar_lane_empty_not_starved', 'info', 'The branch was fed and the lanes still excluded everything; this is an answered question and must not be reported as starvation', 'lanes', { starvedLanes }))
  }
  return {
    data: {
      market,
      stage,
      stageOrder: FEED_STAGES,
      cause,
      fed,
      verdict,
      rosterCount,
      requestCount: requests.length,
      cacheStates,
      vendorFailures: failures,
      mappedCount: mapping?.mapped?.length ?? null,
      unmappedCount: mapping?.unmapped?.length ?? null,
      fedCount: candidates?.fedCount ?? null,
      /**
       * ⚠️ The denominator `fedCount` was silently promoted without (#178).
       * `null` is *this reading could not count the candidates*, which is a
       * third thing and never zero and never «all of them».
       */
      candidateCount,
      coverage,
      comparableCount: candidates?.comparableCount ?? null,
      /** ⚠️ Reported whether or not it changed the verdict: «the producer ran and registered 40 windows» is the fact that keeps a later reading from re-deriving it from the verdict alone. */
      catalystAxis,
      starvedLanes,
      asOf: asOf ?? null,
    },
    diagnostics,
  }
}
