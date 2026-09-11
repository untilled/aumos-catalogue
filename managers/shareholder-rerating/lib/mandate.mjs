/**
 * The investor's ceilings, read from the Mandate the host actually sends.
 *
 * ── What was wrong, and it was not the host (`untilled/aumos#838`) ──────────
 *
 * This package reads the account's limits under its own names —
 * `mandatePositionCap`, `caps.accountPositionCap`, `caps.accountGrossCap`,
 * `caps.accountSectorCap` — and nothing translated the host's. The host's
 * `mandate.constraints` is a **closed, published set of eight fields** and two
 * of them are ceilings this package already knows how to use:
 *
 *   | what this package calls it | what arrives |
 *   |---|---|
 *   | `mandatePositionCap`, `caps.accountPositionCap` | `maxPositionWeight` — the concentration limit the investor was asked for |
 *   | `caps.accountGrossCap` | the complement of `cashFloor` — cash ≥ `cashFloor` is the same statement as invested ≤ `1 − cashFloor` |
 *   | `caps.accountSectorCap`, `caps.strategyPositionCap` | ⛔ not in that contract |
 *
 * So a run handed the Mandate verbatim answered WAIT: `position_cap_not_stated`
 * left `withinLimits` at `null`, and `null` is not permission — under a Mandate
 * that had answered the concentration question and the cash one.
 *
 * ⚠️ **Reading `cashFloor` as the gross ceiling is reading a declared
 * constraint, not inventing one.** It is the investor's own answer to «현금
 * 비중», and the host computes `cashFloorAmount` from it one layer over
 * (`discovery-service.ts`). The arithmetic is a complement and nothing else.
 *
 * ── ⛔ An absent axis is a declared absence and this file already knew that ──
 *
 * `concentration` says it out loud for the gross axis — *«This Mandate states no
 * whole-account exposure ceiling, so the gross axis constrains nothing on this
 * run»* — and for the sector one. Nothing about that moves. What moves is that
 * the two axes the host **does** carry are now read instead of being absent for
 * want of a name.
 *
 * The discriminator, where one is needed, is not sniffed: a caller passing the
 * host's snapshot passes `constraints`, and a caller passing the bare
 * constraints object passes `baseCurrency` and `allowedAssetClasses`, both
 * **required** by that schema and therefore always present.
 *
 * ⚠️ **The package's own names always win.** A caller that states
 * `caps.accountPositionCap` outright gets exactly the answer it got before this
 * module existed, which is why every fixture and every measured regression in
 * `tools/verify-shareholder-rerating.mjs` is byte-for-byte unchanged.
 */
import { finite, round } from './numbers.mjs'

/**
 * The two fields the host's constraints object cannot omit.
 *
 * ⚠️ **Required in `mandateSnapshotSchema`, which is a `strictObject`.** That is
 * what makes their presence a reading and not a guess.
 */
export const HOST_CONSTRAINT_MARKERS = Object.freeze(['baseCurrency', 'allowedAssetClasses'])

/**
 * The host's constraints object out of whatever the caller passed, or `null`
 * when the caller passed no Mandate at all.
 *
 * Accepts the `MandateSnapshot`, this package's own `mandate` object carrying
 * the snapshot's `constraints`, and the bare constraints object equally.
 */
export function hostConstraints(mandate) {
  if (mandate === null || typeof mandate !== 'object') return null
  const nested = mandate.constraints
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) return nested
  if (HOST_CONSTRAINT_MARKERS.some((field) => mandate[field] !== undefined)) return mandate
  return null
}

/**
 * `{ read, accountPositionCap, accountGrossCap }` — the axes the host carries,
 * under this package's names, or `null` where the Mandate declares none.
 *
 * ⛔ **`accountSectorCap` and `strategyPositionCap` are absent by contract.**
 * The Mandate has no sector and no per-strategy axis (`untilled/aumos#792`), and
 * `concentration` already treats an absent one as a declared absence that
 * constrains nothing.
 */
export function mandateCeilings(mandate) {
  const constraints = hostConstraints(mandate)
  if (constraints === null) return { read: false, accountPositionCap: null, accountGrossCap: null, cashFloor: null }
  return {
    read: true,
    accountPositionCap: finite(constraints.maxPositionWeight) ? constraints.maxPositionWeight : null,
    accountGrossCap: finite(constraints.cashFloor) ? round(1 - constraints.cashFloor) : null,
    cashFloor: finite(constraints.cashFloor) ? constraints.cashFloor : null,
  }
}

/**
 * `caps` with the Mandate's own ceilings folded in **under** whatever the caller
 * stated.
 *
 * ⚠️ **Stated wins, always.** This only ever fills a name the caller left empty,
 * which is what makes an account that states its caps byte-for-byte unchanged.
 */
export function capsWithMandate(caps = {}, mandate = caps?.mandate) {
  const stated = caps ?? {}
  const declared = mandateCeilings(mandate)
  if (!declared.read) return stated
  const filled = { ...stated }
  for (const name of ['accountPositionCap', 'accountGrossCap']) {
    /**
     * ⛔ **`finite`, not `in`.** A key whose value is `undefined` is a key the
     * caller left empty, and reading its *presence* as a statement is how a
     * spread of an object built with optional fields silently un-declares a
     * ceiling the investor stated.
     */
    if (!finite(filled[name]) && declared[name] !== null) filled[name] = declared[name]
  }
  return filled
}
