/**
 * `sectorSeries`, run by the host over one symbol. (#247)
 *
 * ── What was unrunnable, and why neither contract was wrong ────────────────
 *
 * `sectorStrength` is the L1 attention layer: it ranks a lane's sectors against
 * one benchmark, reads the regime off that benchmark, and emits the
 * `researchQueue` that `skills/theme-radar/SKILL.md` names as its **first**
 * input. Its published shape asked the caller for `benchmarkBars` and a bar
 * array per sector — and this package forbids a flow to carry bars at all
 * (`PROMPT.md` §The delegation budget, `skills/orchestrate/SKILL.md`: ⛔ never
 * a roster of bars typed back as `calculate` arguments). Both sleeves of run
 * `run_bb689b6199084b04afd8b0e1d1528cda` refused the call and said so, so no
 * ranking was produced at all and forward research chose its axis with nothing
 * under it.
 *
 * The route that removes a relay is a recipe, and this is it: the lane's series
 * stay in the host, one process reads one symbol's stored bars, and what comes
 * back is a page of numbers.
 *
 * ── ⚠️ What one process can and cannot be ──────────────────────────────────
 *
 * It cannot be the fold. `untilled/aumos#743` §B makes one process one item and
 * one item one store coordinate, so no recipe process ever holds a lane — the
 * ranking, the rank moves, the regime and the queue are cross-symbol and stay a
 * `calculate` call. What this removes from that call is its weight: the fold
 * now reads `benchmark` and `sectors[].series`, which are these rows, read back
 * with `files_read` from `<outputPath>/<itemId>.json`. It is the same division
 * `opportunity-metrics.mjs` makes with `opportunityUniverse`.
 *
 * ⛔ **Nothing is computed here.** `execute({ operation: 'sectorSeries' })` is
 * the same entry point `mcp__evidence-gated-metrics__calculate` reaches, and
 * `sectorStrength` reduces its own bars through the very same function — so a
 * lane folded from these rows and a lane folded from bars are one call, and
 * parity is structural rather than a test result.
 *
 * ⚠️ **`periods` is derived from the weights the fold will use.** The reduction
 * carries one return per horizon, so a row reduced under one set of weights and
 * folded under another is missing horizons; the fold reports that by name
 * (`sector_series_period_unreduced`) rather than scoring the gap as zero, and
 * stating `parameters.weights` here is how a run avoids it. Unstated, both
 * sides take the same default.
 */

import { sectorSeriesPeriods } from '../lib/scanners.mjs'
import { execute } from '../lib/index.mjs'
import { runRecipe, scannerInput } from './request.mjs'

runRecipe((request) => {
  const { input, normalizeDiagnostics, documents, barsRead } = scannerInput('sectorSeries', request)
  const periods = sectorSeriesPeriods(request?.parameters?.weights)
  const computed = execute({
    operation: 'sectorSeries',
    asOf: request?.asOf,
    input: {
      symbol: input.symbol,
      market: input.market,
      ...(input.sector === undefined ? {} : { sector: input.sector }),
      bars: input.bars,
      periods,
    },
  })
  return {
    ok: true,
    output: {
      itemId: request?.itemId,
      symbol: input.symbol,
      market: input.market,
      /** ⛔ «Was there anything to read», never «was it enough». `request.mjs` holds the rule. */
      sourced: documents > 0,
      // Dated against the pin the host supplied. ⛔ Never `Date.now()`.
      evaluatedAsOf: request?.asOf,
      operation: 'sectorSeries',
      periods,
      documents,
      barsRead,
      barsUsed: input.bars.length,
      data: computed?.data ?? null,
      diagnostics: [...normalizeDiagnostics, ...(computed?.diagnostics ?? [])],
    },
  }
})
