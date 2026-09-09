/**
 * What every recipe in this package shares: the stdin/stdout contract. (#209 §8-D)
 *
 * ── What a recipe is here, and what it deliberately is not ─────────────────
 *
 * It is a **shell**. `untilled/aumos#724` gave the host a way to run a named
 * computation over inputs it already holds, in a separate process, and hand the
 * manager counts and a reference instead of an array; `untilled/aumos#726` gave
 * a published package a way to put its own name on one. Neither of those is a
 * reason to write a second copy of this package's arithmetic, so nothing under
 * `recipes/` computes anything: the entrypoints call `execute()` from
 * `lib/index.mjs`, which is the same function `mcp__evidence-gated-metrics__calculate`
 * calls, with the same `normalizeBars`, the same envelopes and the same
 * diagnostics. **Parity is not a test result here, it is the same call.**
 *
 * ── The contract, which the host enforces and this file honours ────────────
 *
 * ESM, one JSON object on stdin, one JSON line on stdout, no arguments, no
 * environment, no network, no filesystem — and ⛔ **no clock**. Everything dated
 * is dated against `request.asOf`; a recipe that asked what time it was would
 * stop being reproducible, and a reproducible answer is the whole reason the
 * host may cache one.
 *
 * The answer is one of three shapes:
 *
 *   { ok: true, output }                  — evaluated
 *   { ok: true, empty: true, reason }     — we read them and there was nothing
 *   { ok: false, failure }                — this did not work
 *
 * ⚠️ **`empty` and `gap` are different facts and only one of them is ours.**
 * *We looked and there was nothing* is this file's to say; *we could not look*
 * is the host's, decided from the manifest before this process is ever spawned.
 * Confusing the two is the failure `untilled/aumos-catalogue#209` is named
 * after — a roster nobody fed reported as a market with no opportunities.
 *
 * ── ⚠️ Where the bars come from, and the one that is not fed yet ───────────
 *
 * `RecipeRequest.readings` is what this fund has already collected about one
 * symbol: rows out of `source_observations`, each with the publisher's instant
 * and, where a collector normalized it, a `normalized` payload. A daily bar
 * series reaches these recipes **only** through that payload, under
 * `normalized.bars`.
 *
 * ⚠️ **A collector writes that payload as of `untilled/aumos#734`, and nothing
 * here changed to receive it.** When this file was written the host's routes
 * were three filings and none of them a price series, so a prepared roster came
 * back with receipts and no bars and these recipes answered
 * `scanner_history_insufficient` on every name; `HOST-FOLLOWUPS.md` recorded the
 * debt and predicted that the shape a collector would have to write was the one
 * read below. `prices`/`daily` writes exactly it, one closed bar per document,
 * so the loop below — which accumulates `normalized.bars` across **every**
 * reading before normalizing once — is what makes a series out of them.
 * ⛔ The manager still asks for the collection (`source_cache_refresh`) and
 * still never holds a bar; that is the whole route and it did not move.
 *
 * ⛔ **The bars are not accepted from `parameters`.** They could be — the field
 * is a free-form record — and it would be the same 1.91M characters of tool
 * argument this whole issue exists to delete, with an extra process in the
 * middle. `parameters` carries what a roster sweep genuinely needs the caller
 * to say and cannot derive: which names this book already holds, which have an
 * order pending, and each name's sector label. Those are short lists of symbols.
 */

import { normalizeBars } from '../lib/indicators.mjs'
import { execute } from '../lib/index.mjs'

/**
 * The ceiling on one request, well under the host's own output cap.
 *
 * A request larger than this is not a roster slice, it is a caller handing a
 * recipe the thing the recipe exists to stop being handed.
 */
const MAX_INPUT_BYTES = 4_000_000

/** One JSON line, then out. Exit 0: a refusal is a shape, not an exit code. */
function answer(body) {
  process.stdout.write(`${JSON.stringify(body)}\n`, () => process.exit(0))
}

/**
 * Reads the request, runs `build`, writes the answer. Never throws to the host.
 *
 * A throw would reach the host as an exit code and be classified `parse` with a
 * stack trace for a message; catching it here means the failure says what this
 * package calls the problem.
 */
export function runRecipe(build) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    raw += chunk
    if (raw.length > MAX_INPUT_BYTES) {
      answer({ ok: false, failure: `the request was larger than ${MAX_INPUT_BYTES} bytes` })
    }
  })
  process.stdin.on('end', () => {
    let request
    try {
      request = JSON.parse(raw)
    } catch {
      answer({ ok: false, failure: 'the request was not JSON' })
      return
    }
    try {
      answer(build(request))
    } catch (error) {
      answer({ ok: false, failure: error instanceof Error ? error.message : String(error) })
    }
  })
}

/** `true` when this symbol is named in `parameters.<key>`, which is a symbol list. */
function namedIn(parameters, key, symbol) {
  const rows = parameters?.[key]
  return Array.isArray(rows) && rows.includes(symbol)
}

/**
 * Which name this process is about, out of the two places it can be said. (aumos#743 §B)
 *
 * ── ⚠️ The host stopped saying it, and that is the point of the slice ───────
 *
 * `RecipeRequest` carried `market` and `symbol` until #743 §B. It does not any
 * more: a common executor holds no opinion about what a unit of work *is*, so
 * what arrives is `itemId` — the manager's own string — and an opaque `input`
 * beside it that the host hands over verbatim and never parses.
 *
 * ⚠️ **The id is not free, and this package spends it on one thing.** The
 * executor compares the id against the coordinate this fund files a document
 * under, and hands over that filer's readings when the two are equal. So the id
 * this package sends is the store's coordinate — `XKRX:005930` — because the
 * alternative is a name of our choosing and an empty `readings` on every row,
 * which is `untilled/aumos-catalogue#209`'s failure bought back for the price of
 * a prettier string.
 *
 * ⚠️ **`input` carries this package's vocabulary and the id carries the host's.**
 * The venue in a coordinate is always a MIC (aumos#571); the operations here
 * take `kr`/`us`, and `canonicalMarket` at the input boundary reads either
 * (#212 ⑥). Sending `{ symbol, market }` beside the id means neither side has to
 * know the other's spelling — and it means a caller that gets the id wrong is
 * told about it by `readings` being empty rather than by this file guessing.
 *
 * ⛔ **The id is parsed only as a fallback, and it is a fallback rather than the
 * route.** A recipe that derived its subject by splitting a string would make
 * the id's shape a contract the host does not enforce; reading `input` first
 * means the package says what it means and the split is what answers a caller
 * that said nothing.
 */
export function itemCoordinate(request) {
  const stated = request?.input
  if (stated !== null && typeof stated === 'object') {
    const symbol = stated.symbol
    const market = stated.market
    if (typeof symbol === 'string' && symbol.length > 0) {
      return { symbol, market: typeof market === 'string' && market.length > 0 ? market : undefined }
    }
  }
  const id = request?.itemId
  if (typeof id !== 'string' || id.length === 0) return { symbol: undefined, market: undefined }
  const cut = id.lastIndexOf(':')
  if (cut <= 0 || cut === id.length - 1) return { symbol: id, market: undefined }
  return { symbol: id.slice(cut + 1), market: id.slice(0, cut) }
}

/**
 * The operations that read a `sector` label, and it is a short list on purpose.
 *
 * ⚠️ `execute()` reports an unread key rather than ignoring it —
 * `input_key_unread` / `unevaluated`, by name (#158) — so handing `sector` to
 * `scan`, which does not read it, would put a diagnostic on every row of the
 * roster saying part of the call was not used. It would be **true**, and it
 * would be noise on the one channel that has to stay legible.
 */
const READS_SECTOR = new Set(['opportunityMetrics', 'sectorSeries'])

/**
 * Everything a scanner operation needs, assembled from the request and nothing else.
 *
 * ⚠️ The bars are normalized **once, here**, against `request.asOf` — the same
 * `normalizeBars` the operations run — so a row later than the pin is dropped
 * before any metric sees it and the drop is reported. `scan` normalizes again
 * downstream and that pass is a no-op on an already-normalized series: the
 * function sorts, de-duplicates by timestamp and cuts at the pin, and doing so
 * twice reaches the same list. ⛔ `opportunityMetrics` does **not** normalize
 * its own bars, which is why this cannot be left to the operation.
 */
export function scannerInput(operation, request) {
  const readings = Array.isArray(request?.readings) ? request.readings : []
  const parameters =
    request?.parameters !== null && typeof request?.parameters === 'object'
      ? request.parameters
      : {}
  const rows = []
  for (const reading of readings) {
    const normalized = reading?.normalized
    const bars = normalized && typeof normalized === 'object' ? normalized.bars : undefined
    if (Array.isArray(bars)) rows.push(...bars)
  }
  const normalized = normalizeBars(rows, request?.asOf)
  const sectors = parameters.sectors
  const { symbol, market } = itemCoordinate(request)
  return {
    input: {
      symbol,
      market,
      bars: normalized.bars,
      held: namedIn(parameters, 'held', symbol),
      pending: namedIn(parameters, 'pending', symbol),
      ...(READS_SECTOR.has(operation) &&
      sectors !== null &&
      typeof sectors === 'object' &&
      typeof sectors[symbol] === 'string'
        ? { sector: sectors[symbol] }
        : {}),
    },
    normalizeDiagnostics: normalized.diagnostics,
    documents: readings.length,
    barsRead: rows.length,
  }
}

/**
 * `execute()`'s answer, wrapped as a recipe answer.
 *
 * ⚠️ **A row with no bars is `output`, not `empty`.** The operation already has
 * a word for it — `scanner_history_insufficient` / `opportunity_history_insufficient`,
 * severity `unevaluated`, with the bar count — and answering `empty: true`
 * instead would say *we read this name's documents and it carried nothing*,
 * which is a finding about the company. It is the opposite: nothing about this
 * name's **price** was readable. The distinction is invariant 5's and it is the
 * one the issue measured being lost.
 *
 * ⛔ The `diagnostics` are carried whole rather than summarized. They are the
 * only thing that tells a reader which of the two an empty `data` was, and a
 * recipe that dropped them would hand back the ambiguity the counts exist to
 * remove.
 *
 * `decorate(data, input)` is how an entrypoint adds a field computed from the
 * **same normalized bars** without relaying them anywhere. Its keys are written
 * first so that nothing it returns can overwrite `data` or `diagnostics`.
 *
 * ── ⚠️ `sourced` is written here now, and it had to move (aumos#743 §B) ─────
 *
 * The host used to settle a summary carrying `sourced` and `unprepared`, and
 * `executionRecord` read them. It does not any more, and the reason is right:
 * *this fund held readable documents for this name* is a judgement about
 * documents that only the domain reading them can make, and a common executor
 * making it was the app holding an investment opinion.
 *
 * So this file says it, because this file is the one process that was handed the
 * documents. `sourced` is **`documents > 0`** — whether anything at all was
 * there to read — and it is deliberately not `barsRead > 0`: a name whose
 * filings arrived and whose price series did not is *sourced and unevaluable*,
 * which `scanner_history_insufficient` already says with the counts attached.
 * Collapsing the two would report a fed roster as an unfed one and lose the
 * distinction #209 is named after in the other direction.
 */
export function scannerAnswer(operation, request, decorate) {
  const { input, normalizeDiagnostics, documents, barsRead } = scannerInput(operation, request)
  const computed = execute({ operation, asOf: request?.asOf, input })
  const extra = decorate === undefined ? {} : decorate(computed?.data ?? null, input)
  return {
    ok: true,
    output: {
      ...extra,
      itemId: request?.itemId,
      symbol: input.symbol,
      market: input.market,
      /** ⛔ «Was there anything to read», never «was it enough». See the header. */
      sourced: documents > 0,
      // Dated against the pin the host supplied. ⛔ Never `Date.now()`.
      evaluatedAsOf: request?.asOf,
      operation,
      documents,
      barsRead,
      barsUsed: input.bars.length,
      held: input.held,
      pending: input.pending,
      data: computed?.data ?? null,
      diagnostics: [...normalizeDiagnostics, ...(computed?.diagnostics ?? [])],
    },
  }
}
