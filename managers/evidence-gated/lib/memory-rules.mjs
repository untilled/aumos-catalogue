import { diagnostic } from './diagnostics.mjs'

/**
 * ── Retracting a durable rule this package has since refuted (#156) ────────
 *
 * ⛔ **A wrong rule in `failures/repeated-patterns` is the one kind of defect
 * this package could not previously fix by shipping a new version.** The key is
 * instance-private, append-only and read on every wake, and a row in it is
 * exactly the thing a run trusts on sight — `memory-contract` says so. So when
 * a run reasons its way to a false conclusion and files it there, upgrading the
 * package changes nothing: the next run reads the old rule, and the rule is
 * what decides how the new code is called.
 *
 * That is not hypothetical. This instance holds:
 *
 *   `armed-reviews-memory-claims-arms-the-decision-never-made`
 *   state `CONFIRMED`, severity `blocks-every-future-wake`
 *   *"Cross-check `run/armed-reviews` against `history.recentDecisions[].armed`
 *   … When they disagree, **the journal wins**."*
 *
 * ⚠️ **That rule is the cause of the duplicate arming it was filed about.** The
 * journal cannot win a question it does not answer: `decisions[].armed` is past
 * tense (aumos#687, aumos#691), so every standing review disagrees with it by
 * construction, and "the journal wins" resolves every one of those
 * disagreements by deleting a true memory row and re-arming a live review.
 *
 * So the retraction has to be **computed and handed to the run**, not written
 * as a sentence in a prompt somebody may or may not act on. The registry below
 * is the package's list of durable claims it has refuted, with what the run
 * must write instead; this operation matches it against the key the run
 * actually read and returns the rows to correct.
 *
 * ⛔ **It retracts, it does not delete.** `memory-contract` forbids overwriting
 * history, and a rule that simply vanished would be re-derived by the next run
 * that sees an empty `armed[]` — which is how it got there the first time. The
 * correction says *why* the observation was real and the inference was wrong,
 * so the same observation cannot produce the same rule again.
 *
 * ⚠️ **The registry is package-authored and closed.** A run may not add to it:
 * "this durable rule is wrong" decided inside the run that dislikes the rule is
 * the mechanism this whole file exists to stop.
 */
export const REFUTED_MEMORY_RULES = [
  {
    id: 'armed-reviews-memory-claims-arms-the-decision-never-made',
    key: 'failures/repeated-patterns',
    refutedIn: '#156',
    /**
     * Matched on id **and** on the claim's wording, because the id is this
     * instance's and another instance that reached the same conclusion will
     * have named it something else. The wording is the invariant part: a rule
     * that resolves a disagreement in favour of `decisions[].armed`.
     */
    claimPattern: /journal wins|decisions\[\]\.armed|recentDecisions\[\]\.armed|armed-reviews-memory-claims/i,
    refutedClaim: 'When `run/armed-reviews` and the host journal disagree, the journal wins.',
    correction: '`decisions[].armed` is past tense: it carries what became of promises that have already fired, lapsed or been replaced, and there is no value in it for one that is still standing. A review that armed cleanly and one that was never armed produce the same empty array, so the journal cannot settle a disagreement about what is armed and never could. The observation behind this rule was real — memory did claim arms the journal did not show — and the inference from it was wrong. What is currently armed is answered by `standingPlans` on the invocation and by nothing else (aumos#690), and that field is a floor rather than a ceiling and publishes the same rule about itself: re-arm at every judgement and let the host fold identical instants (aumos#593).',
    supersededBy: 'armed-state-is-unreadable-and-re-arming-is-the-answer',
  },
  /**
   * ── The second one, and it is filed under a different key (#160) ──────────
   *
   * `run/theme-radar-last`, 2026-09-04:
   *
   *   *"validateThesis returned complete:false with gaps expectedUpsidePct and
   *   fairValueRange that no granted source can fill"*
   *
   * ⚠️ **The observation was right and the generalization was wrong.** That run
   * was looking at KR sector ETFs, and for an ETF the sentence is exactly true:
   * nothing publishes financial statements for an index vehicle, and
   * `candidate-research` §Core DCA already says not to invent a single-name
   * view about one. For a **listed operating company** it is false — OpenDART's
   * `fnlttSinglAcntAll` answers, the scenario targets are written on top of what
   * it says, and `researchGate` has been computing the probability-weighted
   * return the whole time.
   *
   * ⛔ And a durable rule saying *no source can fill this* is self-sealing: the
   * next run does not attempt the fetch, so it observes the same empty gaps and
   * files the same rule. That is why the correction has to be computed and
   * handed over rather than left to a prompt — and why it names the operation
   * that settles the question per instrument (`thesisGapSources`) instead of
   * replacing one blanket claim with the opposite blanket claim.
   */
  {
    id: 'valuation-gaps-have-no-granted-source',
    key: 'run/theme-radar-last',
    refutedIn: '#160',
    claimPattern: /no granted source can fill|expectedUpsidePct and fairValueRange|valuation-gaps-have-no-granted-source/i,
    refutedClaim: '`validateThesis` returns `expectedUpsidePct` and `fairValueRange` as gaps that no granted source can fill.',
    correction: 'True of an ETF and false of a single name, and the difference decides a twentyfold position cap. An index vehicle has no filer, so nothing publishes statements for it and those two gaps stay open however many times the feed runs. A listed operating company does have one: `open-dart` `/api/corpCode.xml` → `corp_code` → `fnlttSinglAcntAll` (or, for US, `sec-edgar` `/files/company_tickers.json` \u2192 `cik_str` \u2192 `/api/xbrl/companyfacts/CIK{10-digit zero-padded}.json` \u2014 \u26d4 the ticker address is a 404, measured 2026-09-07) answers, `radarCandidates` normalizes it, and this methodology derives the two fields from the bear/base/bull scenario table those statements support — `candidate-research` §Candidate record 5 asks for target, return and factual drivers, and `researchGate` already computes the probability-weighted return. The gaps were unfetched, not unfillable. ⛔ Do not replace this rule with its opposite: call `thesisGapSources` per instrument, which classifies from the registry rather than asserting, and call `thesisValuation` where a filer exists.',
    supersededBy: 'valuation-gaps-are-unfetched-for-a-filer-and-unfillable-only-without-one',
  },
]

const strings = (value, depth = 0) => {
  if (typeof value === 'string') return [value]
  if (depth > 4 || value === null || typeof value !== 'object') return []
  return Object.values(value).flatMap((child) => strings(child, depth + 1))
}

const rowsOf = (patterns) => {
  if (Array.isArray(patterns)) return patterns
  if (patterns === null || typeof patterns !== 'object') return null
  for (const field of ['patterns', 'rows', 'entries', 'failures']) {
    if (Array.isArray(patterns[field])) return patterns[field]
  }
  return null
}

/** The keys this registry currently has refuted rules under. */
export const REFUTED_MEMORY_KEYS = [...new Set(REFUTED_MEMORY_RULES.map((rule) => rule.key))]

const PATTERNS_KEY = 'failures/repeated-patterns'

/**
 * ⚠️ **A false durable claim does not only live in `failures/repeated-patterns`**
 * (#160). The first refuted rule did, so the first version of this operation
 * read one key and named it in every sentence. The second one is filed under
 * `run/theme-radar-last` — an ordinary run record rather than a failure pattern
 * — and it is doing the same work: the next run reads it, does not attempt the
 * fetch it says is pointless, observes the same empty gaps, and writes it again.
 *
 * So the key is a property of the **rule**, and the caller passes what it read
 * from each one. `patterns` stays exactly what it was, as the shorthand for the
 * key that already had a rule.
 */
function retractionsIn(value, key, prefix) {
  const rows = rowsOf(value)
  const rules = REFUTED_MEMORY_RULES.filter((rule) => rule.key === key)
  /**
   * ⚠️ A key whose value is not a row list is still matched — as one value.
   * That is `run/theme-radar-last`'s shape: prose and fields, not an array of
   * rules, and the false claim sits inside it either way.
   */
  const entries = rows === null ? [{ row: value, path: prefix }] : rows.map((row, index) => ({ row, path: `${prefix}[${index}]` }))
  const found = []
  for (const { row, path } of entries) {
    const haystack = strings(row).join('   ')
    for (const rule of rules) {
      if (row?.id !== rule.id && !rule.claimPattern.test(haystack)) continue
      found.push({
        key,
        path,
        matchedId: typeof row?.id === 'string' ? row.id : null,
        refutedRuleId: rule.id,
        refutedIn: rule.refutedIn,
        refutedClaim: rule.refutedClaim,
        correction: rule.correction,
        supersededBy: rule.supersededBy,
        writeAs: { id: rule.supersededBy, state: 'RETRACTED', retracts: typeof row?.id === 'string' ? row.id : rule.id, retractedIn: rule.refutedIn, note: rule.correction },
      })
      break
    }
  }
  return { found, reviewed: rows === null ? 1 : rows.length }
}

/**
 * Which durable rows this package has refuted, and what the run must write in
 * their place.
 *
 * `patterns` is **the whole value read from `failures/repeated-patterns`**, in
 * either of the two shapes that key is written in: a bare array of rows, or the
 * memory-contract envelope with the rows under `patterns` / `rows` / `entries` /
 * `failures`. `memory` is an object keyed by any other stable memory key —
 * `{ "run/theme-radar-last": … }` — carrying whatever was read from it.
 */
export function refutedMemoryRules({ patterns, memory, asOf } = {}) {
  const diagnostics = []
  const registry = REFUTED_MEMORY_RULES.map(({ claimPattern, ...published }) => published)
  if (memory !== undefined && (memory === null || typeof memory !== 'object' || Array.isArray(memory))) {
    diagnostics.push(diagnostic('memory_rules_shape_invalid', 'blocked', '`memory` is an object keyed by the stable memory key — { "run/theme-radar-last": … } — and never a bare value; a value with no key beside it cannot be matched against the rules filed under that key', 'memory', { received: memory === null ? 'null' : Array.isArray(memory) ? 'array' : typeof memory }))
    return { data: null, diagnostics }
  }
  const supplied = memory ?? {}
  const unread = REFUTED_MEMORY_KEYS.filter((key) => (key === PATTERNS_KEY ? patterns === undefined : !Object.hasOwn(supplied, key)))
  if (unread.length) {
    diagnostics.push(diagnostic('memory_rules_unread', 'unevaluated', 'This package has refuted durable rules that a previous run filed under these keys; a run that does not pass what it read from them cannot retract them, and an uncorrected rule decides how this run is called', 'patterns', { keys: unread, refutedRuleCount: REFUTED_MEMORY_RULES.length }))
  }
  if (patterns !== undefined && rowsOf(patterns) === null) {
    diagnostics.push(diagnostic('memory_rules_shape_invalid', 'blocked', 'Pass the whole value read from `failures/repeated-patterns` — an array of rows, or the stored object holding them under `patterns`/`rows`/`entries`/`failures`. Read under a key that is not there, a carried rule reads as absent and stays uncorrected', 'patterns', { received: patterns === null ? 'null' : typeof patterns }))
    return { data: null, diagnostics }
  }
  const retractions = []
  let reviewed = 0
  if (patterns !== undefined) {
    const answer = retractionsIn(patterns, PATTERNS_KEY, 'patterns')
    retractions.push(...answer.found)
    reviewed += answer.reviewed
  }
  for (const [key, value] of Object.entries(supplied)) {
    if (value === undefined) continue
    const answer = retractionsIn(value, key, `memory[${JSON.stringify(key)}]`)
    retractions.push(...answer.found)
    reviewed += answer.reviewed
  }
  if (retractions.length) {
    diagnostics.push(diagnostic('memory_rule_refuted', 'unevaluated', 'A durable rule this run carries was refuted by this package. Write the retraction in `writeAs` as a new revision of the key it came from in this run — leave the original row in place, because these keys are append-only and a rule that merely vanished is re-derived by the next run that sees the same observation', 'patterns', { retractions: retractions.map((row) => ({ key: row.key, id: row.refutedRuleId })) }))
  }
  return { data: { retractions, reviewed, registry, appliesTo: REFUTED_MEMORY_KEYS, keysUnread: unread, asOf: asOf ?? null }, diagnostics }
}
