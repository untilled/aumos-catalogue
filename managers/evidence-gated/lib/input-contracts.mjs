/**
 * ── The validator, and the names this module has always published (#212 ③) ──
 *
 * The contract table itself moved to `operations.mjs`, where it sits in the
 * same row as the operation's registration, its nested shapes and the sentence
 * the skill prints — one definition, four projections. What is left here is the
 * part that was never duplicated: the rule that reads a contract and answers a
 * call with it.
 *
 * ⚠️ **Where a key goes now.** What was `INPUT_CONTRACTS.<operation>.keys` in
 * this file is `OPERATIONS.<operation>.keys` in `operations.mjs`, and
 * `NESTED_CONTRACTS.<operation>` is `OPERATIONS.<operation>.nested`. A change
 * that used to touch two files touches one, and a branch written against the
 * old layout re-applies by moving its hunk into that operation's row.
 *
 * ⚠️ **Every name this module exported still comes from it.** `INPUT_CONTRACTS`,
 * `INPUT_KEYS`, `NESTED_CONTRACTS`, `GUARDED_OPERATIONS`, `INPUT_VOCABULARY`,
 * `PAPER_SETUP_COHORTS`, `laneOutcome`, `laneOutcomeRejection`,
 * `PAPER_STATE_MEMBERS` and `MEMORY_ENVELOPE_FIELDS` are re-exported, so no
 * caller had to move — and none of them is a copy: each has exactly one
 * definition, in `operations.mjs` or `vocabulary.mjs`.
 */
import { diagnostic } from './diagnostics.mjs'
import { OPERATIONS, INPUT_CONTRACTS, INTERNAL_INPUT_CONTRACTS, ALL_INPUT_CONTRACTS, INPUT_KEYS, NESTED_CONTRACTS, GUARDED_OPERATIONS, PUBLISHED_OPERATIONS, INTERNAL_OPERATIONS, SUBSUMED_BY, GROUPS } from './operations.mjs'
import { ANY, ARRAY_OF_ARRAYS, KEY_MESSAGES, TYPE_LABELS, typeMatches, INPUT_VOCABULARY, PAPER_SETUP_COHORTS, PAPER_STATE_MEMBERS, MEMORY_ENVELOPE_FIELDS, laneOutcome, laneOutcomeRejection } from './vocabulary.mjs'

export {
  OPERATIONS,
  INPUT_CONTRACTS,
  INTERNAL_INPUT_CONTRACTS,
  ALL_INPUT_CONTRACTS,
  INPUT_KEYS,
  NESTED_CONTRACTS,
  GUARDED_OPERATIONS,
  PUBLISHED_OPERATIONS,
  INTERNAL_OPERATIONS,
  SUBSUMED_BY,
  GROUPS,
  INPUT_VOCABULARY,
  PAPER_SETUP_COHORTS,
  PAPER_STATE_MEMBERS,
  MEMORY_ENVELOPE_FIELDS,
  laneOutcome,
  laneOutcomeRejection,
}

/**
 * ── Every operation's input shape is published (issue #158) ────────────────
 *
 * `inputContracts` published **eleven** operations. `PROMPT.md` calls far more
 * of them by name, and the shape of everything else had to be guessed. Two
 * flows of the 2026-09-06 run hit the same wall independently: the orchestrator
 * spent **five** round trips on `nextReviewSequence` — `{sessions:[…]}`,
 * `{market,closeAt}`, `{krSession,usSession}`, a vendor calendar, `{sessions:{kr,us}}`
 * — every one answered `next_market_session_missing` at a `path` of `sessions`,
 * a key the operation does not have; and `kr-sleeve` gave up on
 * `nextMarketReview` and did the arithmetic by hand off a calendar Evidence.
 *
 * ⚠️ **This is the cause side of this package's dominant failure pattern.**
 * `failures/repeated-patterns` records seven cases of *"a wrong input is not
 * refused and comes back looking like a pass"*; #147 fixed instances of it.
 * An unpublished shape is what manufactures them: a caller who cannot read the
 * contract guesses, and a guess that lands in an unread key is answered with a
 * confident number computed from defaults.
 *
 * ⛔ **There was no principle behind the eleven.** They are the operations #147
 * happened to reach, nothing more. The principle is stated here instead: every
 * registered operation has an entry, every entry names its keys **and their
 * types**, and the entry says what happens to a key that is not in it.
 *
 * Three modes, because the operations genuinely differ:
 *
 * | mode | an unknown key is | why |
 * |---|---|---|
 * | `strict` | `input_shape_invalid` / `blocked` | the operation is a gate: a key it does not read is a question it was not asked, and the answer would be about something else |
 * | `named` | `input_key_unread` / `unevaluated` | the shape is published and the extra key is reported rather than refused — the answer stands, and the caller is told which part of the call was not read |
 * | `open` | nothing | the input **is** a record from somewhere else — a vendor payload, a thesis, a consensus observation — and its own fields are not this package's to enumerate |
 *
 * ⚠️ **Types are checked in every mode**, which is the other half of #158: a
 * declared key holding the wrong kind of value is `input_shape_invalid`, so a
 * shape mismatch is a refusal with a sentence rather than whatever exception
 * the arithmetic happened to raise three frames down. `coverage` handed an
 * array of objects used to answer `operation_failed` with a raw
 * `TypeError: object is not iterable`; `sleeveNav`, `opportunityUniverse`,
 * `promotionGate`, `lensEnvelope` and `validateAdjustment` all had the same
 * leak on their own keys.
 */

export function validateInput(operation, input, asOf = undefined) {
  const diagnostics = []
  const reject = (path, message) => diagnostics.push(diagnostic('input_shape_invalid', 'blocked', message, path))
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reject('input', 'Operation input must be an object')
    return diagnostics
  }
  const contract = OPERATIONS[operation]
  if (!contract) return diagnostics
  const declared = contract.keys

  /**
   * ⚠️ `asOf` is the invocation's and it sits beside `input`, not inside it. A
   * copy that agrees is accepted in every operation because runs write it and
   * it costs nothing; a copy that **disagrees** is refused rather than silently
   * losing to the envelope, which is the same substitution this whole file
   * exists to stop.
   */
  if (input.asOf !== undefined && asOf !== undefined && input.asOf !== asOf) {
    reject('input.asOf', `asOf belongs to the invocation, beside input rather than inside it; this call carries two (${asOf} and ${input.asOf}) and the invocation's is the one that runs`)
  }

  for (const key of Object.keys(input)) {
    if (key === 'asOf' || Object.hasOwn(declared, key)) continue
    const published = Object.keys(declared)
    if (contract.mode === 'strict') {
      reject(`input.${key}`, `Unknown input key for ${operation}; supported: ${published.join(', ')}`)
    } else if (contract.mode === 'named') {
      diagnostics.push(diagnostic(
        'input_key_unread',
        'unevaluated',
        `${operation} does not read this key, so whatever it carried was not part of this answer; call inputContracts for the published shape`,
        `input.${key}`,
        { operation, supported: published },
      ))
    }
  }

  for (const [key, type] of Object.entries(declared)) {
    const value = input[key]
    if (value === undefined || value === null || type === ANY) continue
    if (typeMatches(type, value)) continue
    reject(`input.${key}`, KEY_MESSAGES[`${operation}.${key}`] ?? `Expected ${TYPE_LABELS[type] ?? type}${type === ARRAY_OF_ARRAYS ? ' — one array of symbols per scanner over the same market' : ''}`)
  }

  /**
   * ⛔ The nested checks are not a chain of `if (operation === '…')` any more
   * (#212 ③). Each is a named function in `input-shapes.mjs` and the operation
   * that needs one **names it in its own row**, so a shape check cannot be
   * written for an operation that no longer exists, and an operation cannot
   * quietly lose the check that was written for it.
   */
  diagnostics.push(...(contract.shape?.(input, operation) ?? []))
  return diagnostics
}
