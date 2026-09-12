/**
 * ── Whose word a reading is, and what makes one citable at all ──────────────
 *
 * An issuer's statement of its own return policy — the 기업가치 제고 계획, the IR deck,
 * the value-up page — lives on the web and in no filing. This package's whole first
 * axis depends on it, and until `untilled/aumos#693` there was no route by which
 * anything read on the web became citable: a CLI `WebSearch` or `WebFetch` mints no
 * evidence id, so a policy target a run *remembered* was, to every later reader, a
 * number with nothing behind it.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/observation.mjs`**, which is where the
 * grading rule was written first. Taken: the two markers, the excerpt cap, the four
 * grades and their ordering, `attestationOf` / `attestationAnswers` /
 * `weakerAttestation` / `strongestAttestation`. Left behind: `observationLedger` and
 * its claim-to-receipt join, which is that package's own `evidenceIds` discipline and
 * belongs to its proposal shape rather than to this one. Copied rather than imported
 * because the published artifact is a path→contents map rooted at
 * `managers/shareholder-rerating/` and a relative path leaving it does not survive
 * publication.
 *
 * ⛔ **Filing a reading does not make it true, and nothing here may read as though it
 * did.** Nothing in Aumos fetched that page. The row is filed as the manager's
 * testimony and it is graded as such on two independent channels, so a reader holding
 * only one of them can still tell:
 *
 * | marker | where it travels |
 * |---|---|
 * | `EvidenceKind: 'observation'` | AMP's `EvidenceReference`, so a **later run** meets it |
 * | `Provenance.source` beginning `manager:` | every screen that prints a source |
 *
 * Either marker alone grades the row as the manager's word — a row carrying one and
 * not the other is malformed, and the safe reading of a malformed grade is the lower
 * one.
 */

import { diagnostic, instantOf } from './numbers.mjs'

export const MANAGER_ATTESTED_SOURCE_PREFIX = 'manager:'
export const MANAGER_OBSERVATION_KIND = 'observation'
export const MANAGER_OBSERVATION_SOURCE = `${MANAGER_ATTESTED_SOURCE_PREFIX}web-research`

/**
 * The cap `observation_file` enforces on `excerpt`, mirrored so a run learns it on this
 * side of the round trip.
 *
 * ⛔ **Over the cap is a refusal and never a truncation.** The host's reason is that a
 * hash taken over a fragment filed as a whole document leaves an auditor who fetched
 * the URL unable to tell a trimmed row from a fabricated one. File the passage the
 * judgement rests on, not the page.
 */
export const OBSERVATION_EXCERPT_LIMIT = 64_000

/** The manager's own interpretation goes in `reading`, and it has its own, smaller cap. */
export const OBSERVATION_READING_LIMIT = 2_000

/**
 * Worst last, and the order is the whole of `strongestAttestation`.
 *
 * `aumos` is a row this host obtained and signed for. `manager` is a row a manager says
 * it read — worth less than the first and strictly more than a sentence in a rationale,
 * which is the trade `observation_file` exists to make. `ungraded` is a cited row whose
 * markers were not carried back. `uncited` is a figure in a thesis with no evidence row
 * behind it anywhere.
 */
export const ATTESTATION_GRADES = Object.freeze(['aumos', 'manager', 'ungraded', 'uncited'])

/**
 * ⛔ **A closed set of four, and the fourth is the one that keeps the other three
 * honest.** #305: «자료 유형(공시/회사 발표/언론/매니저 해석)». A run's own reading of a
 * document is a different kind of thing from the document, and a record that cannot say
 * so lets an interpretation be filed with a filing's weight.
 */
export const WEB_READING_SOURCE_TYPES = Object.freeze(['filing', 'company-announcement', 'press', 'manager-interpretation'])

/** Hosts whose pages are result lists rather than documents. */
const SEARCH_HOSTS = Object.freeze(['google.', 'bing.', 'duckduckgo.', 'search.naver.', 'search.daum.', 'yahoo.'])
const SEARCH_PATHS = Object.freeze(['/search', '/results', '/find'])
const SEARCH_PARAMS = Object.freeze(['q', 'query', 'keyword', 'search', 'wd'])

/**
 * The grade of one row that names an evidence id, from the markers it carries.
 *
 * ⚠️ **Either marker alone grades the row as the manager's word**, matching the host's
 * own `isManagerAttested`. An implementation requiring both would disagree with the
 * host on exactly the malformed rows, and in the unsafe direction.
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

/**
 * Whether a grade answers the question at all.
 *
 * ⚠️ `ungraded` and `uncited` are **not** grades — they are the two ways the question
 * comes back unanswered, and treating them as low grades makes an absence
 * indistinguishable from a reading.
 */
export function attestationAnswers(grade) {
  return grade === 'aumos' || grade === 'manager'
}

/**
 * The safer of two grades that both answer — the later one in `ATTESTATION_GRADES`.
 *
 * ⛔ **Only ever called with two answering grades.** The one real use is a claim saying
 * `aumos` over a row this run filed as the manager's testimony: the same id cannot be
 * both, and the reading that does not promote testimony into vendor evidence is the
 * manager one.
 */
export function weakerAttestation(a, b) {
  return ATTESTATION_GRADES.indexOf(a) >= ATTESTATION_GRADES.indexOf(b) ? a : b
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

function looksLikeSearchOrHomepage(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return 'unparseable'
  }
  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.replace(/\/+$/, '')
  if (SEARCH_HOSTS.some((prefix) => host.includes(prefix))) return 'search_host'
  if (SEARCH_PATHS.some((prefix) => parsed.pathname.toLowerCase().startsWith(prefix))) return 'search_path'
  for (const name of SEARCH_PARAMS) if (parsed.searchParams.has(name)) return 'search_query'
  if (path === '') return 'homepage'
  return null
}

/**
 * ── One web reading, as this package records it ─────────────────────────────
 *
 * #305: *«검색 결과 제목이나 요약만으로 후보를 확정하지 않는다. 원문 URL·발행자·발행일·
 * 관측일·관련 주장과 자료 유형을 남기고, 지원되는 `observation:file` 경로로 evidence를
 * 발급받는다.»* Five of those are required fields here and the sixth — the evidence id —
 * is what the round trip returns.
 *
 * ⛔ **A search-result title or snippet is not a reading.** Without the document's URL,
 * its publication date and the instant this desk looked at it, what is being recorded is
 * a summary somebody else wrote about a document nobody here opened —
 * `web_reading_is_a_summary`, blocked, and no candidate is created from it.
 *
 * ⚠️ **An evidence id issued *this* run is not citable *this* run.** Evidence filed
 * during a run that has not ended is not committed to the Kernel until the run
 * finishes (JSONL replay), so an id from `observation_file` is citable in run N+1. That
 * is why `candidate.evidenceIds` is a carried field and not a within-run local, and it
 * is host gap H-4 rather than anything this package can fix.
 *
 * @param {object} input
 * @param {string} input.url        the document, not a result list and not a homepage
 * @param {string} input.publisher  who published it
 * @param {string|number} input.publishedAt
 * @param {string|number} input.observedAt  when this desk read it
 * @param {string} input.claim      what it is being cited for
 * @param {string} input.sourceType one of `WEB_READING_SOURCE_TYPES`
 * @param {string} [input.evidenceId] what `observation_file` returned
 * @param {boolean} [input.issuedThisRun] whether that id was minted by this run
 * @param {number} [input.excerptChars]
 * @param {number} [input.readingChars]
 * @param {string|number} input.asOf
 */
export function webReadingRecord(input = {}) {
  const diagnostics = []
  const asOfInstant = instantOf(input.asOf)
  const url = typeof input.url === 'string' && input.url.trim().length ? input.url.trim() : null
  const publisher = typeof input.publisher === 'string' && input.publisher.trim().length ? input.publisher.trim() : null
  const claim = typeof input.claim === 'string' && input.claim.trim().length ? input.claim.trim() : null
  const publishedAt = instantOf(input.publishedAt ?? null)
  const observedAt = instantOf(input.observedAt ?? null)
  const evidenceId = typeof input.evidenceId === 'string' && input.evidenceId.trim().length ? input.evidenceId.trim() : null
  const sourceType = typeof input.sourceType === 'string' ? input.sourceType : null

  const absent = []
  if (url === null) absent.push('url')
  if (publishedAt === null) absent.push('publishedAt')
  if (observedAt === null) absent.push('observedAt')
  if (absent.length > 0) {
    diagnostics.push(
      diagnostic(
        'web_reading_is_a_summary',
        'blocked',
        `A reading without ${absent.join(', ')} is a search-result title or a snippet, and a candidate has been made out of one. ⛔ No candidate is created from it: an assertion nobody can go and check is not evidence for a return policy, it is a recollection with a citation's shape. Open the document, keep its URL, its publication date and the instant you read it.`,
        'url',
        { absent, offered: { url, publishedAt: input.publishedAt ?? null, observedAt: input.observedAt ?? null } },
      ),
    )
  }
  if (publisher === null) {
    diagnostics.push(diagnostic('web_reading_publisher_missing', 'blocked', 'Who published it decides how it is read: an issuer\'s own words, a newspaper\'s summary of them and this desk\'s interpretation of that summary are three different weights', 'publisher'))
  }
  if (claim === null) {
    diagnostics.push(diagnostic('web_reading_states_no_claim', 'blocked', 'A reading is filed for something. Without the claim it supports, a later run has a URL and no idea what this desk took from it', 'claim'))
  }
  if (sourceType === null || !WEB_READING_SOURCE_TYPES.includes(sourceType)) {
    diagnostics.push(
      diagnostic('web_reading_source_type_unknown', 'blocked', `A reading's type is one of ${WEB_READING_SOURCE_TYPES.join(' / ')}. ⚠️ \`manager-interpretation\` is in the set so that this desk's own reading of a document can be filed without being filed at a filing's weight`, 'sourceType', {
        sourceType,
        sourceTypes: WEB_READING_SOURCE_TYPES,
      }),
    )
  }
  if (url !== null) {
    const problem = looksLikeSearchOrHomepage(url)
    if (problem !== null) {
      diagnostics.push(
        diagnostic(
          'web_reading_url_is_not_a_document',
          'blocked',
          `\`${url}\` is ${problem === 'homepage' ? 'a homepage' : problem === 'unparseable' ? 'not a readable URL' : 'a result list'}, and \`observation_file\` refuses it for the same reason this does: a page whose content changes with the query, or with the day, is a URL an auditor cannot go back to. Cite the document.`,
          'url',
          { url, problem },
        ),
      )
    }
  }
  if (Number.isFinite(input.excerptChars) && input.excerptChars > OBSERVATION_EXCERPT_LIMIT) {
    diagnostics.push(
      diagnostic(
        'observation_excerpt_over_limit',
        'blocked',
        `\`observation_file\` refuses an excerpt longer than ${OBSERVATION_EXCERPT_LIMIT} characters and **does not truncate it**. File the passage the judgement rests on rather than the whole page; a hash over a fragment filed as a whole document leaves an auditor unable to tell a trimmed row from a fabricated one.`,
        'excerptChars',
        { excerptChars: input.excerptChars, limit: OBSERVATION_EXCERPT_LIMIT },
      ),
    )
  }
  if (Number.isFinite(input.readingChars) && input.readingChars > OBSERVATION_READING_LIMIT) {
    diagnostics.push(
      diagnostic('observation_reading_over_limit', 'blocked', `\`reading\` is the manager's own interpretation and it caps at ${OBSERVATION_READING_LIMIT} characters`, 'readingChars', { readingChars: input.readingChars, limit: OBSERVATION_READING_LIMIT }),
    )
  }
  if (publishedAt !== null && asOfInstant !== null && publishedAt > asOfInstant) {
    diagnostics.push(
      diagnostic('observation_post_as_of', 'blocked', 'A document published after the instant being judged is not evidence for it — `observation_file` refuses this too, and a bare date counts as the end of that day', 'publishedAt', { publishedAtEpochMs: publishedAt, asOfEpochMs: asOfInstant }),
    )
  }
  if (observedAt !== null && asOfInstant !== null && observedAt > asOfInstant) {
    diagnostics.push(diagnostic('web_reading_observed_after_as_of', 'blocked', 'This desk cannot have read the document after the instant it is judging from', 'observedAt', { observedAtEpochMs: observedAt, asOfEpochMs: asOfInstant }))
  }

  const grade = attestationOf({ evidenceId, evidenceKind: input.evidenceKind ?? (evidenceId === null ? null : MANAGER_OBSERVATION_KIND), evidenceSource: input.evidenceSource ?? (evidenceId === null ? null : MANAGER_OBSERVATION_SOURCE) })
  if (evidenceId === null) {
    diagnostics.push(
      diagnostic('web_reading_not_yet_filed', 'unevaluated', 'This reading has no evidence id. Hand the passage to `observation_file` — url, title, the source\'s own words verbatim, publishedAt, your reading — and carry back what it returns; nothing else puts a web reading into `evidenceIds` at all', 'evidenceId'),
    )
  } else if (input.issuedThisRun === true) {
    /** ⚠️ Host gap H-4, stated here rather than worked around. */
    diagnostics.push(
      diagnostic(
        'evidence_not_citable_until_next_run',
        'unevaluated',
        `${evidenceId} was minted by this run and is not committed to the Kernel until the run ends, so this run's proposal cannot cite it. Carry it on the candidate and cite it next run — that is why \`candidate.evidenceIds\` is a carried field and not a within-run local.`,
        'evidenceId',
        { evidenceId },
      ),
    )
  }

  const blocked = diagnostics.some((row) => row.severity === 'blocked')
  return {
    data: {
      record: blocked
        ? null
        : {
            url,
            publisher,
            publishedAtEpochMs: publishedAt,
            observedAtEpochMs: observedAt,
            claim,
            sourceType,
            evidenceId,
            attestation: grade,
            evidenceKind: evidenceId === null ? null : MANAGER_OBSERVATION_KIND,
            evidenceSource: evidenceId === null ? null : MANAGER_OBSERVATION_SOURCE,
          },
      attestation: grade,
      /** ⚠️ `false` here means «filed, and not yet committed» — not «not filed». */
      citable: evidenceId !== null && input.issuedThisRun !== true && !blocked,
      /** A carried id is one the next run may cite; the reason the ledger holds it. */
      carryForward: evidenceId !== null && !blocked,
      excerptLimit: OBSERVATION_EXCERPT_LIMIT,
      managerObservationKind: MANAGER_OBSERVATION_KIND,
      managerObservationSource: MANAGER_OBSERVATION_SOURCE,
      sourceTypes: WEB_READING_SOURCE_TYPES,
    },
    diagnostics,
  }
}
