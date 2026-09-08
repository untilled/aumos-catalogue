/**
 * `scan`, run by the host over one symbol. (#209 §8-D)
 *
 * The price-pattern sweep is *the only mechanical sweep of the whole universe*
 * (`PROMPT.md` §3), which is exactly why it was the most expensive thing this
 * package did: a roster's worth of daily bars was relayed out of a vendor by a
 * model and typed back in as `calculate` arguments — 40 calls, ~850,000
 * characters, measured on one run that then submitted no judgement.
 *
 * This is the same computation with the model taken out of the middle. It calls
 * `execute({ operation: 'scan' })`, which is the same entry point
 * `mcp__evidence-gated-metrics__calculate` calls, so the lens thresholds, the
 * `LENS_ENVELOPES` they come from and every diagnostic are the ones that were
 * already there. ⛔ **Nothing in `lib/` moved for this.**
 *
 * ⚠️ **`entryQualityGate` rides along, and that is not scope creep.** It is the
 * blocking entry gate, it takes the *same bars* as its only heavy input, and a
 * candidate that cleared a lens here would otherwise have those bars relayed a
 * second time to be gated — the cost this file exists to delete, paid once more
 * per candidate. It runs **only for a candidate that named a lens**: the gate
 * reads `lenses`, and run without them its mean-reversion-only restriction
 * cannot fire, so a gate run over an empty list would report a pass it never
 * tested.
 *
 * ⛔ It does not aggregate. One process is one symbol — the host's checkpoint
 * boundary — so anything that reads the roster as a whole (`opportunityUniverse`,
 * `relativeStrength`, `sectorStrength`) stays a `calculate` call over the small
 * small rows read back from the answer files with `files_read`.
 */

import { entryQualityGate } from '../lib/scanners.mjs'
import { runRecipe, scannerAnswer } from './request.mjs'

runRecipe((request) =>
  scannerAnswer('scan', request, (candidate, input) => {
    if (candidate === null || !Array.isArray(candidate.lenses) || candidate.lenses.length === 0) {
      return {}
    }
    const gate = entryQualityGate({ bars: input.bars, lenses: candidate.lenses })
    return {
      entryQuality: gate?.data ?? null,
      entryQualityDiagnostics: gate?.diagnostics ?? [],
    }
  }),
)
