/**
 * The investor's ceilings, read from the Mandate the host actually sends.
 *
 * ── What was wrong, and it was not the host (`untilled/aumos#838`) ──────────
 *
 * This package reads the account's limits under its own names —
 * `mandatePositionCap`, `caps.accountSingleName`, `caps.accountSector`,
 * `caps.perStrategy` — and nothing translated the host's. The host's
 * `mandate.constraints` is a **closed, published set of eight fields** and one
 * of them is a ceiling this package already knows how to use:
 *
 *   | what this package calls it | what arrives |
 *   |---|---|
 *   | `mandatePositionCap`, `caps.accountSingleName` | `maxPositionWeight` — the concentration limit the investor was asked for |
 *   | `caps.accountSector`, `caps.perStrategy` | ⛔ not in that contract |
 *
 * So a run handed the Mandate verbatim answered `wait-for-data`: both readings
 * came back `unread`, `targetWeight` refused with `data_missing` and
 * `accountConcentration` returned an unreadable book — under a Mandate that had
 * answered the concentration question.
 *
 * ── ⛔ Declared-and-unread are two facts and this module keeps them two ──────
 *
 * `readDeclared` exists because *«the Mandate declares no cap»* and *«nobody
 * read the Mandate»* produce the same number and must not produce the same
 * record. The host cannot send the `NOT_DECLARED` sentinel — its schema omits an
 * unanswered optional field rather than sending a token — so this module is what
 * turns a Mandate that **was** read into that sentinel, and leaves an absent
 * Mandate unread.
 *
 * The discriminator is not sniffed: a caller passing the host's snapshot passes
 * `constraints`, and a caller passing the bare constraints object passes
 * `baseCurrency` and `allowedAssetClasses`, both **required** by that schema and
 * therefore always present. Either marker means the source was read.
 *
 * ⚠️ **The package's own names always win.** A caller that states
 * `caps.accountSingleName` outright — a number or the sentinel — gets exactly
 * the answer it got before this module existed, which is why every fixture and
 * every measured regression in `tools/verify-catalyst-turnaround.mjs` is
 * byte-for-byte unchanged.
 */
import { NOT_DECLARED, finite } from './diagnostics.mjs'

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
 * Accepts the `MandateSnapshot` and the bare `constraints` object equally: a
 * manager handed the invocation may reasonably forward either, and refusing one
 * would be this package deciding which half of the host's own document is the
 * Mandate.
 */
export function hostConstraints(mandate) {
  if (mandate === null || typeof mandate !== 'object') return null
  const nested = mandate.constraints
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) return nested
  if (HOST_CONSTRAINT_MARKERS.some((field) => mandate[field] !== undefined)) return mandate
  return null
}

/**
 * `{ read, singleNameCap, sectorCap }`, each already in `readDeclared`'s
 * vocabulary: a number, the `NOT_DECLARED` sentinel, or `undefined`.
 *
 * ⛔ **`undefined` only where no Mandate was passed.** Under a Mandate that was
 * read, an axis the host's contract does not carry — and an optional field the
 * investor left blank — are both declared absences, and this package's own
 * ceiling binds with a note saying so.
 */
export function mandateCeilings(mandate) {
  const constraints = hostConstraints(mandate)
  if (constraints === null) return { read: false, singleNameCap: undefined, sectorCap: undefined }
  return {
    read: true,
    singleNameCap: finite(constraints.maxPositionWeight) ? constraints.maxPositionWeight : NOT_DECLARED,
    /**
     * ⛔ **No host field maps here and none is invented.** The Mandate contract
     * has no sector axis at all (`untilled/aumos#792`), so under a read Mandate
     * this is a declared absence and constrains nothing — which is what
     * `accountConcentration` already did with an unread one, reported at the
     * same `sector_cap_not_applicable` note.
     */
    sectorCap: NOT_DECLARED,
  }
}
