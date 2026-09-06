import { diagnostic } from './diagnostics.mjs'

/**
 * ── Whose word an Evidence row is, read on this side of the wire (#692) ─────
 *
 * `untilled/aumos#693` opened the one route by which anything a manager reads
 * on the web becomes citable: the `observation_file` tool, granted by the
 * `observation:file` capability. It files what the manager hands over — a URL,
 * the document's own title and publication date, and **the source's own words**
 * verbatim — and returns an evidence id that `evidenceIds` will accept.
 *
 * ⛔ **It does not make the reading true, and this package must never let it
 * read as though it did.** Nothing in Aumos fetched that page. The row is filed
 * as the manager's testimony and the host grades it as such by two independent
 * markers, on two channels, because a reader holding only one of them must
 * still be able to tell:
 *
 * | marker | where it travels |
 * |---|---|
 * | `EvidenceKind: 'observation'` | AMP's `EvidenceReference`, so a **later run** meets it |
 * | `Provenance.source` beginning `manager:` | every screen that prints a source |
 *
 * Either marker alone is enough to grade a row as the manager's word, and that
 * is deliberate: a row carrying one and not the other is malformed, and the
 * safe reading of a malformed grade is the **lower** one. The host states this
 * once, in `isManagerAttested`; this is the same rule read from the catalogue
 * side, off the fields a run can put on a thesis row.
 *
 * ⚠️ **The constants are restated here rather than imported, because there is
 * nothing to import from.** This package is plain Node with no dependency on
 * the host's TypeScript, and the wire is what the two share. `CONFORMANCE.md`
 * records that this copy is a copy and what pins it.
 */
export const MANAGER_ATTESTED_SOURCE_PREFIX = 'manager:'
export const MANAGER_OBSERVATION_KIND = 'observation'
export const MANAGER_OBSERVATION_SOURCE = `${MANAGER_ATTESTED_SOURCE_PREFIX}web-research`

/**
 * The excerpt cap `observation_file` enforces, mirrored so a run learns it here.
 *
 * ⛔ **Over the cap is a refusal, never a truncation** — the host's reason is
 * that a hash over a fragment filed as a whole document leaves an auditor who
 * fetched the URL unable to tell a trimmed row from a fabricated one. Checking
 * it on this side buys the run a sentence before the round trip rather than
 * after it; the host's refusal is the one that binds either way.
 */
export const OBSERVATION_EXCERPT_LIMIT = 64_000

/**
 * The grades, worst last, and the order is the whole of `strongestAttestation`.
 *
 * `aumos` is a row this host obtained and signed for. `manager` is a row a
 * manager says it read — worth less than the first and strictly more than a
 * sentence in a rationale, which is the trade `observation_file` exists to
 * make. `ungraded` is a cited row whose markers were not carried back, so the
 * question cannot be answered here at all. `uncited` is the pre-#692 state and
 * the defect this file is named after: a figure written into a thesis with no
 * evidence row behind it anywhere.
 */
export const ATTESTATION_GRADES = Object.freeze(['aumos', 'manager', 'ungraded', 'uncited'])

/**
 * The grade of one row that names an Evidence id, from the markers it carries.
 *
 * Reads exactly what the host reads, from wherever a run put it: `evidenceKind`
 * or `kind` against `'observation'`, and `evidenceSource` or `source` against
 * the `manager:` prefix. ⚠️ **Either marker alone grades the row as the
 * manager's word**, matching `isManagerAttested`; a second implementation that
 * required both would disagree with the host on exactly the malformed rows,
 * and in the unsafe direction.
 */
export function attestationOf(row) {
  const id = typeof row?.evidenceId === 'string' && row.evidenceId.trim().length ? row.evidenceId.trim() : null
  if (id === null) return 'uncited'
  const kind = typeof row?.evidenceKind === 'string' ? row.evidenceKind : typeof row?.kind === 'string' ? row.kind : null
  const source = typeof row?.evidenceSource === 'string' ? row.evidenceSource : typeof row?.source === 'string' ? row.source : null
  if (kind === MANAGER_OBSERVATION_KIND) return 'manager'
  if (source !== null && source.startsWith(MANAGER_ATTESTED_SOURCE_PREFIX)) return 'manager'
  if (kind === null && source === null) return 'ungraded'
  return 'aumos'
}

/** The best grade in a set, in `ATTESTATION_GRADES` order; `null` for an empty set. */
export function strongestAttestation(grades = []) {
  for (const grade of ATTESTATION_GRADES) if (grades.includes(grade)) return grade
  return null
}

/** Counts by grade, every key present, so a reader never has to test for absence. */
export function attestationCounts(grades = []) {
  const counts = Object.fromEntries(ATTESTATION_GRADES.map((grade) => [grade, 0]))
  for (const grade of grades) if (Object.hasOwn(counts, grade)) counts[grade] += 1
  return counts
}

/**
 * ── Read it and did not cite it: the defect, computed (#692) ────────────────
 *
 * ⚠️ **This is the failure the host issue was opened on, and it survives the
 * host fix.** On 2026-09-06 `kr-sleeve` confirmed the BOK base rate at 3.00%
 * (raised 2026-08-27, 6–1) in four web calls, **used that value** to judge a
 * `thesisSentinel` invalidation condition, and submitted 24 `evidenceIds` not
 * one of which supported it. Before #693 there was nothing the run could have
 * done — `WebSearch` issues no evidence id. After #693 there is, and the same
 * run can still do the same thing: file the observation, then not cite it, or
 * skip the filing and go on judging from a number nobody can check.
 *
 * ⛔ So the obligation is checked rather than described. Three separate
 * findings, and they are not degrees of one:
 *
 * | finding | what happened |
 * |---|---|
 * | `claim_evidence_missing` | a value **used in judgement** names no evidence id — the BOK case exactly |
 * | `claim_evidence_not_carried` | the claim names an id the proposal's `evidenceIds` does not carry |
 * | `observation_filed_not_cited` | the run paid for the filing and then cited nothing from it |
 *
 * The first two are `blocked`: a judgement resting on an uncitable number is
 * the thing this methodology exists to refuse, and it is refused whether the
 * number came from the web or from anywhere else. The third is `unevaluated` —
 * a filed row nobody leaned on is waste rather than a false record, and a run
 * that files broadly and cites narrowly is behaving correctly.
 *
 * ⛔ **Nothing here verifies that the excerpt was ever at that URL.** Neither
 * does the host, and the ceiling is written down in both places. What is
 * checked is the shape of the receipt — an id, a hash over the passage, a URL,
 * and a publication date that does not follow `asOf` — because a "receipt"
 * missing any of those did not come from `observation_file` and a run that
 * believes otherwise will cite it as though it did.
 */
export function observationLedger({ observations = [], citedEvidenceIds = [], claims = [], asOf = null } = {}) {
  const diagnostics = []
  const asOfInstant = Date.parse(asOf)
  const cited = new Set(
    (Array.isArray(citedEvidenceIds) ? citedEvidenceIds : [])
      .filter((id) => typeof id === 'string' && id.trim().length)
      .map((id) => id.trim()),
  )

  const filed = []
  for (const [index, row] of (Array.isArray(observations) ? observations : []).entries()) {
    const at = `observations[${index}]`
    const evidenceId = typeof row?.evidenceId === 'string' && row.evidenceId.trim().length ? row.evidenceId.trim() : null
    const grade = attestationOf(row)
    if (evidenceId === null) {
      diagnostics.push(diagnostic('observation_id_missing', 'blocked', 'A filed observation is the evidence id `observation_file` returned; a row without one is not a receipt and cannot be cited', `${at}.evidenceId`))
      continue
    }
    const excerptChars = typeof row?.excerptChars === 'number' && Number.isFinite(row.excerptChars) ? row.excerptChars : null
    if (typeof row?.contentHash !== 'string' || !row.contentHash.length) {
      diagnostics.push(diagnostic('observation_hash_missing', 'unevaluated', '`observation_file` returns a contentHash over the passage handed to it; a receipt without one was not produced by that tool and the row it names cannot be compared with anything', `${at}.contentHash`, { evidenceId }))
    }
    if (typeof row?.url !== 'string' || !row.url.length) {
      diagnostics.push(diagnostic('observation_url_missing', 'unevaluated', 'The URL is what an auditor goes to; a filed observation without one keeps the passage and loses the only thing that could check it', `${at}.url`, { evidenceId }))
    }
    if (excerptChars !== null && excerptChars > OBSERVATION_EXCERPT_LIMIT) {
      diagnostics.push(diagnostic(
        'observation_excerpt_over_limit',
        'blocked',
        `\`observation_file\` refuses an excerpt longer than ${OBSERVATION_EXCERPT_LIMIT} characters and does not truncate it; file the passage the judgement rests on rather than the whole page`,
        `${at}.excerptChars`,
        { evidenceId, excerptChars, limit: OBSERVATION_EXCERPT_LIMIT },
      ))
    }
    const published = Date.parse(row?.publishedAt)
    if (Number.isFinite(published) && Number.isFinite(asOfInstant) && published > asOfInstant) {
      diagnostics.push(diagnostic(
        'observation_post_as_of',
        'blocked',
        'A document published after the instant being judged is not evidence for it; `observation_file` refuses this too, and a date with no time counts as the end of that day',
        `${at}.publishedAt`,
        { evidenceId, publishedAt: row.publishedAt, asOf },
      ))
    }
    if (grade !== 'manager') {
      diagnostics.push(diagnostic(
        'observation_grade_unexpected',
        'unevaluated',
        `A row filed through \`observation_file\` is graded as the manager's word — kind \`${MANAGER_OBSERVATION_KIND}\`, source \`${MANAGER_OBSERVATION_SOURCE}\`. Carry those markers back with the receipt; a row listed here without them is either not from that tool or has lost the grade on the way`,
        `${at}.evidenceKind`,
        { evidenceId, grade },
      ))
    }
    filed.push({
      evidenceId,
      grade,
      url: typeof row?.url === 'string' ? row.url : null,
      title: typeof row?.title === 'string' ? row.title : null,
      publishedAt: typeof row?.publishedAt === 'string' ? row.publishedAt : null,
      contentHash: typeof row?.contentHash === 'string' ? row.contentHash : null,
      excerptChars,
      cited: cited.has(evidenceId),
    })
  }

  const filedNotCited = filed.filter((row) => !row.cited)
  if (filedNotCited.length) {
    diagnostics.push(diagnostic(
      'observation_filed_not_cited',
      'unevaluated',
      'These observations were filed this run and no submitted evidence id names them. Filing is not citing: a reading that changed nothing is worth saying so, and a reading that changed something belongs in `evidenceIds`',
      'citedEvidenceIds',
      { evidenceIds: filedNotCited.map((row) => row.evidenceId), urls: filedNotCited.map((row) => row.url) },
    ))
  }

  const claimRows = []
  for (const [index, row] of (Array.isArray(claims) ? claims : []).entries()) {
    const at = `claims[${index}]`
    const label = typeof row?.claim === 'string' && row.claim.length ? row.claim : `claims[${index}]`
    const evidenceId = typeof row?.evidenceId === 'string' && row.evidenceId.trim().length ? row.evidenceId.trim() : null
    const usedFor = typeof row?.usedFor === 'string' ? row.usedFor : null
    if (evidenceId === null) {
      diagnostics.push(diagnostic(
        'claim_evidence_missing',
        'blocked',
        `\`${label}\` was used in this run's judgement and names no evidence id. This is the 2026-09-06 failure verbatim — a value read on the web, relied on, and unsupported by any of the ids submitted. File the passage with \`observation_file\` and cite what it returns`,
        `${at}.evidenceId`,
        { claim: label, value: row?.value ?? null, usedFor },
      ))
      claimRows.push({ claim: label, value: row?.value ?? null, usedFor, evidenceId: null, grade: 'uncited', carried: false })
      continue
    }
    const carried = cited.has(evidenceId)
    if (!carried) {
      diagnostics.push(diagnostic(
        'claim_evidence_not_carried',
        'blocked',
        `\`${label}\` names ${evidenceId} and the proposal's evidence ids do not carry it. An id the proposal does not submit is not a citation — it is a reference the investor cannot follow`,
        `${at}.evidenceId`,
        { claim: label, evidenceId, usedFor },
      ))
    }
    claimRows.push({ claim: label, value: row?.value ?? null, usedFor, evidenceId, grade: attestationOf(row), carried })
  }

  const grades = claimRows.map((row) => row.grade)
  return {
    data: {
      filed,
      filedCount: filed.length,
      citedCount: filed.filter((row) => row.cited).length,
      filedNotCited: filedNotCited.map((row) => row.evidenceId),
      claims: claimRows,
      claimsUncited: claimRows.filter((row) => row.evidenceId === null).map((row) => row.claim),
      claimsNotCarried: claimRows.filter((row) => row.evidenceId !== null && !row.carried).map((row) => row.claim),
      claimAttestation: attestationCounts(grades),
      strongestClaimAttestation: strongestAttestation(grades),
      /** Every claim names an id and every id is submitted. Says nothing about whether the reading is true. */
      everyClaimCited: claimRows.length > 0 && claimRows.every((row) => row.evidenceId !== null && row.carried),
      excerptLimit: OBSERVATION_EXCERPT_LIMIT,
      managerObservationSource: MANAGER_OBSERVATION_SOURCE,
      managerObservationKind: MANAGER_OBSERVATION_KIND,
    },
    diagnostics,
  }
}
