/**
 * ── Where a required disclosure is judged (issue #212 ②) ───────────────────
 *
 * `effectivePositionCap` computed a cap **and** read the proposal's prose. It
 * scanned `uncertainty` and `risks` for a substring, compared the
 * `effectiveConstraints` rows it had just produced against the ones handed
 * back, and pushed `blocked` diagnostics — which `targetWeight` pushes onto its
 * own list, and any `blocked` one makes `targetWeight` return `null`.
 *
 * ⚠️ **So rewording a sentence changed a position weight.** The run that
 * carried nine `uncertainty` entries and rephrased the one holding a token got
 * a different size than the run that pasted the token it never read. A
 * calculator whose answer depends on the wording beside it is not a calculator,
 * and the defect is not that the disclosure is required — it is that arithmetic
 * was the thing requiring it.
 *
 * ⛔ **Nothing is relaxed here and the check is not dropped.** The two codes are
 * the same codes, the severity is the same `blocked`, `details.missing` names
 * the same halves in the same order. What moved is *who asks*: this operation,
 * which is handed an assembled proposal and has no arithmetic to distort.
 *
 * ── Why this operation and not the host, yet ───────────────────────────────
 *
 * The obligation belongs on the approval screen: `DecisionProposal` carries
 * `effectiveConstraints` (`untilled/aumos#681`) and `Approvals.tsx` renders
 * `rationale.risks`, so the host is the one surface that can refuse to draw a
 * size whose disclosure is absent. It does not do that today. Until it does,
 * the assembly path this package owns is the last place the check can stand,
 * and `HOST-FOLLOWUPS.md` records what is deleted from here on the day the
 * screen enforces it.
 *
 * ── The shape ──────────────────────────────────────────────────────────────
 *
 * `disclosures` is `effectivePositionCap`'s (or `targetWeight`'s) array,
 * verbatim. `proposal` is the assembled `DecisionProposal` — `uncertainty`,
 * `rationale.risks` (or a flat `risks`), `effectiveConstraints`.
 *
 * ⚠️ **A field that was not handed over is unjudged, never passed.** Absence
 * says the proposal does not exist yet; an empty array says it exists and is
 * silent. Those are two different facts and only the second is a refusal —
 * which is the rule the calculator already used and the one thing worth keeping
 * from it.
 */
import { diagnostic } from './diagnostics.mjs'

const finite = (value) => typeof value === 'number' && Number.isFinite(value)

/**
 * `includes`, on one token, deliberately. The prose beside the marker is
 * written in the invocation's `language`, so the only part of the entry this
 * can read is the code — and reading it here costs nothing, because no number
 * downstream depends on the answer.
 */
const carriesMarker = (value, marker) => Array.isArray(value)
  ? value.some((entry) => typeof entry === 'string' && entry.includes(marker))
  : null

/**
 * The machine-readable half: the row the fund-settings screen draws has to be
 * the row this sizing produced, at the number this sizing produced. A row
 * naming another effective weight is a different claim, not this one.
 */
const carriesConstraints = (value, expected) => {
  if (!Array.isArray(value)) return null
  return expected.every((row) => value.some((entry) => entry?.field === row.field
    && finite(entry?.effective) && finite(row?.effective)
    && Math.abs(entry.effective - row.effective) <= 1e-9))
}

/**
 * `rationale.risks` and `rationale.keyReasons` are where the proposal actually
 * carries them; a flat spelling is read too.
 *
 * ⚠️ **`keyReasons` is the second nested field since #230**, and it is nested
 * for the same reason `risks` is: `Approvals.tsx` renders `rationale.keyReasons`
 * and `rationale.risks` and nothing else, so those are the two slots that reach
 * the investor before the approve button, and both live under `rationale`.
 * Reading only the flat spelling made a carried recommendation look silent.
 */
const NESTED_RATIONALE_FIELDS = ['risks', 'keyReasons']
const proposalField = (proposal, field) => {
  if (NESTED_RATIONALE_FIELDS.includes(field)) {
    const nested = proposal?.rationale?.[field]
    return nested === undefined ? proposal?.[field] : nested
  }
  return proposal?.[field]
}

export function proposalDisclosure(input = {}) {
  const diagnostics = []
  const disclosures = Array.isArray(input?.disclosures) ? input.disclosures : null
  if (disclosures === null) {
    diagnostics.push(diagnostic(
      'proposal_disclosure_inputs_missing',
      'unevaluated',
      'Hand this operation the `disclosures` array `effectivePositionCap` or `targetWeight` returned, verbatim, beside the assembled proposal; an absent array is not an empty one',
      'disclosures',
    ))
    return { data: { required: [], rows: [], missing: [], disclosed: null }, diagnostics }
  }
  const proposal = input?.proposal
  const rows = []
  for (const row of disclosures) {
    const code = typeof row?.code === 'string' ? row.code : null
    const fields = Array.isArray(row?.fields) ? row.fields.filter((field) => typeof field === 'string') : []
    if (code === null || fields.length === 0) {
      diagnostics.push(diagnostic(
        'proposal_disclosure_row_unreadable',
        'unevaluated',
        'A disclosure row names a code and the fields it has to appear in; this one names neither, so nothing about it can be judged',
        'disclosures',
        { row },
      ))
      continue
    }
    const expected = Array.isArray(row?.expect?.effectiveConstraints) ? row.expect.effectiveConstraints : null
    const verdicts = {}
    for (const field of fields) {
      const value = proposalField(proposal, field)
      verdicts[field] = field === 'effectiveConstraints' && expected !== null
        ? carriesConstraints(value, expected)
        : carriesMarker(value, code)
    }
    const judged = fields.filter((field) => verdicts[field] !== null)
    const missing = fields.filter((field) => verdicts[field] === false)
    const disclosed = judged.length === 0 ? null : missing.length === 0
    rows.push({ code, fields, verdicts, missing, disclosed, unjudged: fields.filter((field) => verdicts[field] === null) })
    if (disclosed === false) {
      diagnostics.push(diagnostic(
        typeof row?.undisclosedCode === 'string' ? row.undisclosedCode : 'proposal_disclosure_undisclosed',
        'blocked',
        typeof row?.message === 'string' ? row.message : `This proposal owes the disclosure \`${code}\` and does not carry it`,
        missing[0],
        { ...(row?.details ?? {}), missing, ...(expected === null ? {} : { expected }) },
      ))
    }
  }
  const judgedRows = rows.filter((row) => row.disclosed !== null)
  return {
    data: {
      /** The codes this proposal owes, in the order the sizing named them. */
      required: rows.map((row) => row.code),
      rows,
      /** Every field of every owed code that was present and silent. */
      missing: rows.flatMap((row) => row.missing.map((field) => ({ code: row.code, field }))),
      /**
       * `true` only when every judged row is disclosed; `null` when there was
       * nothing to judge — no obligation, or no proposal handed over. ⛔ Not
       * `true`: «this proposal disclosed everything» and «nobody looked» are
       * different answers.
       */
      disclosed: rows.length === 0 || judgedRows.length === 0 ? null : judgedRows.every((row) => row.disclosed),
    },
    diagnostics,
  }
}
