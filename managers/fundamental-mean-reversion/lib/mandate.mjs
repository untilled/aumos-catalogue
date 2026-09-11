/**
 * The investor's ceilings, read from the Mandate the host actually sends.
 *
 * ── What was wrong, and it was not the host (`untilled/aumos#838`) ──────────
 *
 * This package reads the account's limits under its own names —
 * `mandate.singleNameCap`, `mandate.grossCap` — and nothing translated the
 * host's. The host's `mandate.constraints` is a **closed, published set of eight
 * fields** and two of them are ceilings this package already knows how to use:
 *
 *   | what this package calls it | what arrives |
 *   |---|---|
 *   | `singleNameCap` | `maxPositionWeight` — the concentration limit the investor was asked for |
 *   | `grossCap`      | the complement of `cashFloor` — cash ≥ `cashFloor` is the same statement as invested ≤ `1 − cashFloor` |
 *   | `sectorCap`     | ⛔ not in that contract |
 *   | `strategyCap`   | ⛔ not in that contract |
 *
 * So a run handed the Mandate verbatim refused with
 * `mandate_single_name_cap_missing` and `mandate_gross_cap_missing` and sized
 * nothing at all, under a Mandate that had answered both questions.
 *
 * ⚠️ **Reading `cashFloor` as the gross ceiling is reading a declared
 * constraint, not inventing one.** It is the investor's own answer to «현금
 * 비중», and the host computes `cashFloorAmount` from it one layer over
 * (`discovery-service.ts`). The arithmetic is a complement and nothing else:
 * this package does not decide how much of a book may be invested, it reads how
 * much the investor said must not be.
 *
 * ── ⛔ Declared-and-unreadable still refuses; undeclared constrains nothing ──
 *
 * That sentence is `sizing.mjs`'s, written for the sector axis, and this module
 * is what lets the other axes obey it. The discriminator is **whether the
 * Mandate was read at all**, and it is not sniffed: a caller that passes the
 * host's snapshot passes `constraints`, and a caller that passes the bare
 * constraints object passes `baseCurrency` and `allowedAssetClasses`, both of
 * which are **required** by that schema and therefore always present. Either
 * marker means the source was read; their absence means nobody read it.
 *
 * ⛔ **So an absent ceiling under a read Mandate is a declared absence** — the
 * investor was asked the question and left it blank, and the host's strict
 * schema omits the key rather than sending a zero. An absent ceiling with no
 * Mandate in sight is still an unread limit and still refuses. The two facts
 * keep the two traces they have always had.
 *
 * ⚠️ **The package's own names always win.** A caller that states
 * `singleNameCap` outright gets exactly the answer it got before this module
 * existed, whatever else rides alongside — which is why every fixture, every
 * assertion and every measured regression in `tools/verify-*.mjs` is
 * byte-for-byte unchanged.
 */
import { finite, round } from './core.mjs'

/**
 * The two fields the host's constraints object cannot omit.
 *
 * ⚠️ **Required in `mandateSnapshotSchema`, which is a `strictObject`.** That is
 * what makes their presence a reading and not a guess; a shape that carries
 * neither is not that contract.
 */
export const HOST_CONSTRAINT_MARKERS = Object.freeze(['baseCurrency', 'allowedAssetClasses'])

/**
 * The host's constraints object out of whatever the caller passed, or `null`
 * when the caller passed no Mandate at all.
 *
 * Accepts the `MandateSnapshot` (`{ mandateId, version, …, constraints }`) and
 * the bare `constraints` object equally: a manager handed the invocation may
 * reasonably forward either, and refusing one of them would be this package
 * deciding which half of the host's own document is the Mandate.
 */
export function hostConstraints(mandate) {
  if (mandate === null || typeof mandate !== 'object') return null
  const nested = mandate.constraints
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) return nested
  if (HOST_CONSTRAINT_MARKERS.some((field) => mandate[field] !== undefined)) return mandate
  return null
}

/**
 * `{ read, singleNameCap, grossCap, sectorCap, strategyCap, grossFromCashFloor }`.
 *
 * `read` is the whole point: it is what separates *«the Mandate declares no
 * ceiling on this axis»* from *«nobody read the Mandate»*, and only the second
 * withholds anything.
 */
export function mandateCeilings(mandate) {
  const native = mandate !== null && typeof mandate === 'object' ? mandate : {}
  const constraints = hostConstraints(mandate)
  const read = constraints !== null
  const fromCashFloor = read && finite(constraints.cashFloor) ? round(1 - constraints.cashFloor) : null
  const hostSingleName = read && finite(constraints.maxPositionWeight) ? constraints.maxPositionWeight : null
  const grossCap = finite(native.grossCap) ? native.grossCap : fromCashFloor
  return {
    read,
    singleNameCap: finite(native.singleNameCap) ? native.singleNameCap : hostSingleName,
    grossCap,
    /** Whether the gross ceiling above is the complement of a declared cash floor. */
    grossFromCashFloor: !finite(native.grossCap) && fromCashFloor !== null,
    cashFloor: read && finite(constraints.cashFloor) ? constraints.cashFloor : null,
    /**
     * ⛔ **No host field maps here and none is invented.** The Mandate contract
     * has no sector and no per-strategy axis, so under a read Mandate these are
     * declared absences and constrain nothing — which is what `sizing.mjs`
     * already did with them and the reason this module changes neither.
     */
    sectorCap: finite(native.sectorCap) ? native.sectorCap : null,
    strategyCap: finite(native.strategyCap) ? native.strategyCap : null,
  }
}
