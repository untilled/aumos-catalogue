import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── One trigger vocabulary, two shapes that mean different things (§25) ────
 *
 * `validateThesis` accepted `price_below` and `validateWatch` accepted
 * `price-below`, for the same condition, and no skill listed either set. A run
 * that learned one spelling was refused by the other function.
 *
 * The spelling is now kebab-case everywhere, matching the `unit` and `lens`
 * vocabularies; the snake_case forms are still accepted and normalized so no
 * recorded thesis becomes unreadable, and using one raises an `info` saying
 * which name is canonical.
 *
 * ⚠️ The two sets are still **not identical**, and that is deliberate rather
 * than leftover:
 *
 * - `metric` is a thesis invalidation and not a WATCH, because a WATCH must be
 *   evaluable by the wake engine from published data and a thesis metric may
 *   need a filing read by a person.
 * - `weight-drift` is a WATCH and not a thesis invalidation, because drifting
 *   past a weight says something about the portfolio, not about the claim.
 *
 * Everything else is shared, `at-time` included — it used to be spelled `time`
 * on the thesis side, which made one condition look like two.
 *
 * Both facts are published in `candidate-research` rather than left to be
 * discovered by a refusal.
 */
export const TRIGGER_ALIASES = {
  price_below: 'price-below',
  price_above: 'price-above',
  at_time: 'at-time',
  weight_drift: 'weight-drift',
  /**
   * `time` and `at-time` were the same condition under two names — the second
   * half of the same inconsistency as the underscores. One name now.
   */
  time: 'at-time',
}
export const THESIS_TRIGGER_KINDS = new Set(['price-below', 'price-above', 'metric', 'at-time'])
export const WATCH_TRIGGER_KINDS = new Set(['at-time', 'price-below', 'price-above', 'weight-drift'])

export function normalizeTriggerKind(kind) {
  return TRIGGER_ALIASES[kind] ?? kind
}

const TRIGGER_KINDS = THESIS_TRIGGER_KINDS
const MATURITY = new Set(['insufficient', 'observing', 'reviewable', 'promoted'])

export function validateThesis(input) {
  const diagnostics = []
  const required = ['thesisId', 'asset', 'createdAt', 'coreClaim', 'horizonEnd', 'evidenceStatus']
  for (const field of required) if (!input?.[field]) diagnostics.push(diagnostic('thesis_field_missing', 'blocked', `Thesis field ${field} is required`, field))
  if (!['complete', 'incomplete'].includes(input?.evidenceStatus)) diagnostics.push(diagnostic('thesis_evidence_status_invalid', 'blocked', 'evidenceStatus must be complete or incomplete', 'evidenceStatus'))
  const gaps = []
  if (!input?.variantView) gaps.push('variantView')
  const consensus = (input?.consensusRefs ?? []).filter((row) => row?.metric && finite(row?.value) && row?.sourceUrl && row?.publishedAt && row?.capturedAt)
  if (!consensus.length) gaps.push('consensusRefs')
  for (const [index, row] of consensus.entries()) {
    if (Date.parse(row.publishedAt) > Date.parse(row.capturedAt)) diagnostics.push(diagnostic('consensus_time_invalid', 'blocked', 'publishedAt cannot follow capturedAt', `consensusRefs[${index}]`))
  }
  const catalysts = (input?.catalysts ?? []).filter((row) => row?.event && Number.isFinite(Date.parse(row.windowStart)) && Number.isFinite(Date.parse(row.windowEnd)))
  if (!catalysts.length) gaps.push('catalysts')
  catalysts.forEach((row, index) => {
    if (Date.parse(row.windowStart) > Date.parse(row.windowEnd)) diagnostics.push(diagnostic('catalyst_window_invalid', 'blocked', 'windowStart cannot follow windowEnd', `catalysts[${index}]`))
  })
  const invalidations = []
  for (const [index, row] of (input?.invalidationTriggers ?? []).entries()) {
    const kind = normalizeTriggerKind(row?.kind)
    if (kind !== row?.kind) {
      diagnostics.push(diagnostic('trigger_kind_alias', 'info', 'The canonical spelling is kebab-case, as in every other vocabulary here; the underscore form is accepted and normalized', `invalidationTriggers[${index}].kind`, { given: row?.kind, canonical: kind }))
    }
    if (!TRIGGER_KINDS.has(kind)) {
      diagnostics.push(diagnostic('invalidation_kind_invalid', 'blocked', 'Invalidation must be price, metric or time; producer-less event is forbidden', `invalidationTriggers[${index}].kind`, { supported: [...TRIGGER_KINDS] }))
      continue
    }
    if (['price_below', 'price_above'].includes(row.kind) && !finite(row.level)) diagnostics.push(diagnostic('invalidation_price_missing', 'blocked', 'Price invalidation needs a numeric level', `invalidationTriggers[${index}].level`))
    if (!Number.isFinite(Date.parse(row.checkBy))) diagnostics.push(diagnostic('invalidation_deadline_missing', 'unevaluated', 'Invalidation needs a checkBy deadline', `invalidationTriggers[${index}].checkBy`))
    else invalidations.push(row)
  }
  if (!invalidations.length) gaps.push('invalidationTriggers')
  if (!finite(input?.expectedUpsidePct)) gaps.push('expectedUpsidePct')
  if (!finite(input?.fairValueRange?.low) || !finite(input?.fairValueRange?.high)) gaps.push('fairValueRange')
  if (input?.evidenceStatus === 'complete' && gaps.length) diagnostics.push(diagnostic('thesis_false_complete', 'blocked', 'A complete thesis cannot have evidence gaps', 'evidenceStatus', { gaps }))
  else if (gaps.length) diagnostics.push(diagnostic('thesis_incomplete', 'unevaluated', 'Thesis gaps remain explicit', 'input', { gaps }))
  return { data: { valid: !diagnostics.some((row) => row.severity === 'blocked'), complete: input?.evidenceStatus === 'complete' && gaps.length === 0, gaps }, diagnostics }
}

export function thesisSentinel({ invalidations = [], evidence = [], priorVerdicts = [] }) {
  const diagnostics = []
  const evidenceById = new Map(evidence.map((row) => [row.id, row]))
  const evaluations = invalidations.map((rule, index) => {
    const observation = evidenceById.get(rule.evidenceId)
    if (!observation) {
      diagnostics.push(diagnostic('sentinel_evidence_missing', 'unevaluated', 'Invalidation could not be evaluated', `invalidations[${index}].evidenceId`))
      return { id: rule.id ?? `rule-${index}`, state: 'unevaluated' }
    }
    let met = null
    if (rule.kind === 'price_below' && finite(observation.value) && finite(rule.level)) met = observation.value < rule.level
    else if (rule.kind === 'price_above' && finite(observation.value) && finite(rule.level)) met = observation.value > rule.level
    else if (rule.kind === 'metric' && finite(observation.value) && finite(rule.level)) met = rule.operator === 'above' ? observation.value > rule.level : observation.value < rule.level
    else if (rule.kind === 'time' && observation.availableAt) met = Date.parse(observation.availableAt) >= Date.parse(rule.at)
    if (met === null) diagnostics.push(diagnostic('sentinel_rule_unevaluated', 'unevaluated', 'Rule and evidence are not comparable', `invalidations[${index}]`))
    return { id: rule.id ?? `rule-${index}`, state: met === null ? 'unevaluated' : met ? 'met' : 'not-met', evidenceId: observation.id }
  })
  const verdict = evaluations.some((row) => row.state === 'met') ? 'threatened' : evaluations.some((row) => row.state === 'unevaluated') ? 'watch' : 'intact'
  let consecutiveThreatened = 0
  for (const row of [...priorVerdicts].sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))) {
    if (row.verdict !== 'threatened') break
    consecutiveThreatened += 1
  }
  if (verdict === 'threatened') consecutiveThreatened += 1
  const escalationRequired = consecutiveThreatened >= 3
  if (escalationRequired) diagnostics.push(diagnostic('sentinel_threatened_repeated', 'blocked', 'Repeated threatened verdict requires explicit resize/exit/deadline decision', 'priorVerdicts', { consecutiveThreatened }))
  return { data: { verdict, evaluations, consecutiveThreatened, escalationRequired }, diagnostics }
}

/**
 * The three pre-registered radar lanes (`ur-v1`, registered 2026-07-18 —
 * before any signal was accumulated, which is the point of registering them).
 *
 * Each carries its own rule version so revising one lane's definition does not
 * invalidate another lane's sample, and every lane is evaluated for **every**
 * candidate. Inclusion and exclusion are both explained mechanically: a
 * candidate that fell out of a lane says which condition it failed, so "the
 * radar found nothing" can be told apart from "the radar was starving".
 *
 * That distinction was the whole 2026-07-29 diagnosis in the original — the
 * information-edge lenses were not missing, their inputs were. `inflection`
 * matched 2 of 92 candidates with 16 excluded for "no registered catalyst";
 * filling the rolling earnings window took it to 12. A lane that reports only
 * its hits cannot surface that.
 */
const RADAR_LANES = {
  inflection: 'uri-v1',
  'quality-pullback': 'urq-v1',
  'post-event-continuation': 'urp-v1',
}

function radarLaneVerdicts(row, candidate, asOf) {
  const { inflection, catalyst, price } = row.axes
  const filingYoy = inflection.operatingIncomeYoy
  const marginDelta = inflection.marginDeltaYoy
  const detail = {}

  const decide = (lane, included, reason) => { detail[lane] = { included, ruleVersion: RADAR_LANES[lane], reason } }

  if (inflection.status === 'unknown') decide('inflection', false, 'no-valid-point-in-time-filing')
  else if (!(filingYoy > 0)) decide('inflection', false, 'latest-filing-operating-income-not-improving')
  else if (!inflection.signFlip) decide('inflection', false, 'no-sign-flip-against-the-previous-comparable-filing')
  else if (catalyst.status !== 'present') decide('inflection', false, 'no-catalyst-registered-within-60-days')
  else decide('inflection', true, 'sign-flip-with-a-registered-catalyst')

  /**
   * The radar's route into the same population the scanner's `quality-pullback`
   * lens reaches by price alone. One lens, two routes: the rule version is what
   * keeps their samples from pooling, exactly as it does across lanes.
   */
  const close = price?.close
  const conditions = [
    [filingYoy > 0, 'latest-filing-operating-income-not-improving'],
    [finite(marginDelta) && marginDelta >= 0, 'operating-margin-not-holding'],
    [finite(close) && finite(price?.ma200) && close > price.ma200, 'trend-not-preserved-above-ma200'],
    [finite(close) && finite(price?.ma50) && close < price.ma50, 'not-actually-pulling-back-below-ma50'],
    [finite(price?.offHigh200) && price.offHigh200 >= -0.25, 'drawdown-past-25-percent-is-a-breakdown-not-a-pullback'],
  ]
  const failed = conditions.find(([ok]) => !ok)
  if (inflection.status === 'unknown') decide('quality-pullback', false, 'no-valid-point-in-time-filing')
  else if (failed) decide('quality-pullback', false, failed[1])
  else decide('quality-pullback', true, 'quality-holding-through-a-preserved-uptrend-pullback')

  const event = (candidate.events ?? []).find((entry) => {
    const since = (Date.parse(asOf) - Date.parse(entry?.announcedAt)) / 86_400_000
    return Number.isFinite(since) && since >= 0 && since <= 30
  })
  if (!event) decide('post-event-continuation', false, 'no-event-in-the-last-30-days')
  else if (!(finite(event.sue) ? event.sue > 0 : finite(event.day1ExcessPct) && event.day1ExcessPct > 0)) {
    decide('post-event-continuation', false, finite(event.sue) ? 'surprise-not-positive' : 'no-surprise-and-no-day-one-excess')
  } else if (!(finite(close) && finite(event.preAnnouncementClose) && close >= event.preAnnouncementClose)) {
    decide('post-event-continuation', false, 'price-has-not-held-the-pre-announcement-level')
  } else decide('post-event-continuation', true, 'positive-surprise-the-price-has-held')

  return detail
}

export function upsideRadar({ candidates = [], asOf }) {
  const diagnostics = []
  const maximumFilingLagDays = 120
  const maximumFilingAgeDays = 180
  const rows = candidates.map((candidate, index) => {
    const filings = (candidate.filings ?? []).filter((filing) => {
      const lag = (Date.parse(filing.availableAt) - Date.parse(filing.periodEnd)) / 86_400_000
      const age = (Date.parse(asOf) - Date.parse(filing.availableAt)) / 86_400_000
      return finite(filing.operatingIncomeYoy) && lag <= maximumFilingLagDays && age <= maximumFilingAgeDays && Date.parse(filing.availableAt) <= Date.parse(asOf)
    }).sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt))
    const latest = filings.at(-1)
    const previous = filings.at(-2)
    const inflection = latest ? {
      status: latest.operatingIncomeYoy > 0 ? 'improving' : 'deteriorating',
      operatingIncomeYoy: latest.operatingIncomeYoy,
      previousOperatingIncomeYoy: previous?.operatingIncomeYoy ?? null,
      signFlip: latest.operatingIncomeYoy > 0 && finite(previous?.operatingIncomeYoy) && previous.operatingIncomeYoy <= 0,
      marginDeltaYoy: latest.marginDeltaYoy ?? null,
      cashConversion: latest.cashConversion ?? null,
      availableAt: latest.availableAt,
    } : { status: 'unknown', reason: 'no-valid-point-in-time-filing' }
    const price = candidate.price ?? { status: 'unknown' }
    const catalyst = (candidate.catalysts ?? []).some((row) => Date.parse(row.windowEnd) >= Date.parse(asOf) && Date.parse(row.windowStart) <= Date.parse(asOf) + 60 * 86_400_000)
      ? { status: 'present' }
      : { status: 'unknown', reason: 'no-registered-catalyst-not-proof-of-absence' }
    const expectation = candidate.latestEarnings ? { status: 'recorded', sue: candidate.latestEarnings.sue ?? null, guidanceSurprise: candidate.latestEarnings.guidanceSurprise ?? null } : { status: 'unknown', reason: 'no-point-in-time-event-record' }
    const valuation = candidate.valuation?.equity > 0 && (finite(candidate.valuation.shares) || finite(candidate.valuation.debt)) ? {
      status: 'partial',
      priceToBook: finite(price.close) && finite(candidate.valuation.shares) ? round(price.close * candidate.valuation.shares / candidate.valuation.equity, 2) : null,
      debtToEquity: finite(candidate.valuation.debt) ? round(candidate.valuation.debt / candidate.valuation.equity, 2) : null,
    } : { status: 'unknown', reason: 'missing-shares-or-equity-never-zero-filled' }
    const eligible = price.status !== 'unknown' && inflection.status !== 'unknown' && (inflection.status === 'improving' || catalyst.status === 'present')
    if (!eligible) diagnostics.push(diagnostic('upside_candidate_unranked', 'info', 'Candidate remains visible but unranked because an axis is missing', `candidates[${index}]`, { asset: candidate.asset }))
    const row = { asset: candidate.asset, market: candidate.market, sector: candidate.sector ?? null, eligible, axes: { inflection, expectation, catalyst, price, valuation }, rankMeaning: 'research-priority-only' }
    row.lanes = radarLaneVerdicts(row, candidate, asOf)
    row.lensesEntered = Object.entries(row.lanes).filter(([, verdict]) => verdict.included).map(([lane]) => lane)
    return row
  })
  const rankKey = (row) => {
    const cell = row.axes.inflection.status === 'improving' && row.axes.price.status === 'confirmed' ? 2 : row.axes.inflection.status === 'improving' || row.axes.catalyst.status === 'present' ? 1 : 0
    return [cell, row.axes.inflection.marginDeltaYoy ?? -1e15, row.axes.price.rs20VsBenchmarkPct ?? -1e15]
  }
  const ranked = rows.filter((row) => row.eligible).sort((a, b) => {
    const aa = rankKey(a); const bb = rankKey(b)
    return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2] || String(a.asset).localeCompare(String(b.asset))
  }).map((row, index) => ({ ...row, rank: index + 1 }))
  /**
   * Starvation is a finding. A lane whose every exclusion is the same missing
   * input is not saying "nothing qualifies", it is saying it was never fed.
   */
  const laneCoverage = Object.fromEntries(Object.keys(RADAR_LANES).map((lane) => {
    const verdicts = rows.map((row) => row.lanes[lane])
    const excluded = verdicts.filter((verdict) => !verdict.included)
    const reasons = {}
    for (const verdict of excluded) reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1
    const dominant = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0] ?? null
    const starved = Boolean(dominant && rows.length && dominant[1] / rows.length >= 0.8 && /no-valid-point-in-time-filing|no-catalyst-registered|no-event-in-the-last-30-days/.test(dominant[0]))
    if (starved) diagnostics.push(diagnostic('radar_lane_starved', 'unevaluated', 'This lane excluded almost every candidate for one missing input; it is unfed rather than empty', 'candidates', { lane, reason: dominant[0], of: rows.length }))
    return [lane, { ruleVersion: RADAR_LANES[lane], included: verdicts.length - excluded.length, excluded: excluded.length, reasons, starved }]
  }))
  return { data: { ranked, unranked: rows.filter((row) => !row.eligible), lanes: laneCoverage, branch: 'fundamental-and-event', rankMeaning: 'research-priority-only' }, diagnostics }
}

/**
 * Field names that are the *body* of a source, not a summary of one.
 *
 * The rule this enforces is the one the issue states plainly: private memory
 * cites Evidence ids and never copies IR, news or consensus prose. Two things go
 * wrong when it does. The copy stops being the observation — nothing re-checks
 * it against the vendor, so a stale paragraph outlives the source it came from —
 * and the run that reads it can no longer say which Evidence its conclusion came
 * from, which is what §5 asks of every recorded fact.
 *
 * ⚠️ The length ceiling is the part that actually catches this in practice: a
 * pasted release does not usually arrive under a key called `articleBody`. It is
 * deliberately generous, because every legitimate value here is an aggregate — a
 * count, a metric, a status, a short label — and none of them is a paragraph.
 */
const SOURCE_TEXT_KEYS = new Set(['rawText', 'articleBody', 'filingText', 'transcript', 'consensusText', 'newsBody', 'pressRelease', 'sourceText'])
const MAX_MEMORY_STRING = 500

function copiedSourceText(value, path = 'value') {
  const found = []
  if (typeof value === 'string') {
    if (value.length > MAX_MEMORY_STRING) found.push({ path, reason: 'string-too-long' })
    return found
  }
  if (Array.isArray(value)) {
    for (const [index, row] of value.entries()) found.push(...copiedSourceText(row, `${path}[${index}]`))
    return found
  }
  if (value && typeof value === 'object') {
    for (const [key, row] of Object.entries(value)) {
      if (SOURCE_TEXT_KEYS.has(key)) found.push({ path: `${path}.${key}`, reason: 'source-body-key' })
      else found.push(...copiedSourceText(row, `${path}.${key}`))
    }
  }
  return found
}

export function validateMemory({ value, asOf, expectedSchemaVersion = 1 }) {
  const diagnostics = []
  if (!value || typeof value !== 'object' || value.schemaVersion !== expectedSchemaVersion || !MATURITY.has(value.status) || !Number.isFinite(Date.parse(value.updatedAsOf)) || Date.parse(value.updatedAsOf) > Date.parse(asOf)) {
    diagnostics.push(diagnostic('memory_value_ignored', 'unevaluated', 'Malformed, wrong-version or future memory is ignored', 'value'))
    return { data: { accepted: false, value: null }, diagnostics }
  }
  if (value.sampleCount !== undefined && (!Number.isInteger(value.sampleCount) || value.sampleCount < 0)) diagnostics.push(diagnostic('memory_sample_count_invalid', 'unevaluated', 'Invalid sampleCount makes memory unusable', 'value.sampleCount'))
  const identifiers = [...(value.decisionIds ?? []), ...(value.evidenceIds ?? [])]
  if (value.sampleCount > 0 && !identifiers.length) diagnostics.push(diagnostic('memory_provenance_missing', 'unevaluated', 'Learned state must trace to Decision/Evidence ids', 'value'))
  for (const copied of copiedSourceText(value)) {
    diagnostics.push(diagnostic('memory_raw_source_copied', 'blocked', 'Private memory references Evidence ids; it never carries the source text itself', copied.path, { reason: copied.reason }))
  }
  return { data: { accepted: diagnostics.length === 0, value: diagnostics.length ? null : value }, diagnostics }
}

export function visibleMemoryRevision({ revisions = [], asOf, instanceId, model, key }) {
  const diagnostics = []
  const visible = revisions.filter((row) => row.instanceId === instanceId && row.model === model && row.key === key && Date.parse(row.writtenAsOf) <= Date.parse(asOf)).sort((a, b) => b.revision - a.revision)[0] ?? null
  return { data: { revision: visible }, diagnostics }
}

export function migrationMap({ records = [], cutoverAt, schemaVersion = 1 }) {
  const diagnostics = []
  if (!Number.isFinite(Date.parse(cutoverAt))) diagnostics.push(diagnostic('migration_cutover_invalid', 'blocked', 'A cutover timestamp is required', 'cutoverAt'))
  const destinations = { thesis: [], brief: [], watch: [], evidence: [], memory: [] }
  const seen = new Set()
  for (const [index, row] of records.entries()) {
    if (!row?.legacyId || seen.has(row.legacyId)) {
      diagnostics.push(diagnostic('migration_record_duplicate', 'blocked', 'Each legacy record must have one stable id', `records[${index}].legacyId`))
      continue
    }
    seen.add(row.legacyId)
    const destination = row.kind === 'asset-claim' ? 'thesis' : row.kind === 'book-conclusion' ? 'brief' : row.kind === 'live-gate' ? 'watch' : row.kind === 'raw-evidence' ? 'evidence' : row.kind === 'aggregate-learning' ? 'memory' : null
    if (!destination) diagnostics.push(diagnostic('migration_owner_unknown', 'blocked', 'Legacy record has no canonical Aumos owner', `records[${index}].kind`))
    else destinations[destination].push({ ...row, importedAt: cutoverAt })
  }
  return { data: { destinations, marker: { key: 'migration/schema-version', schemaVersion, cutoverAt }, backfillForwardTrackRecord: false, legacyModeAfterCutover: 'read-only' }, diagnostics }
}

const EXIT_SEVERITY = { stop_loss: 0, target_full: 0, trailing_stop: 0, time_stop: 0.2, trim: 1, thesis_invalidation: 1.5, trim_approach: 2, review: 3, thesis_review: 3.5 }
const FULL_EXIT_KINDS = new Set(['stop_loss', 'target_full', 'trailing_stop', 'time_stop'])

/**
 * L2.5 — the sell-side watch, which had become a post-hoc measurement.
 *
 * `MIGRATION.md` maps `exit-check` to "SELL/TRIM/REVIEW diagnostics, preserving
 * price and fundamental invalidation", and the `exit` coverage group named
 * `forward-outcome`, `mfe-mae` and `failure-taxonomy` — three functions in
 * `outcomes.mjs` that score a position after it closed. Attribution is not a
 * watch. A thesis that breaks on fundamentals while price sits above the stop
 * had nothing looking at it until the next scheduled review.
 *
 * Two lanes run in parallel and neither one overrides the other, which is the
 * whole point of the design this is ported from:
 *
 * - **price** — stop, trim ladder, take-profit target, trailing stop, and the
 *   time stop (the review date arrived and the position never got above its
 *   entry, so the thesis had its window);
 * - **fundamental** — `thesisSentinel`'s verdict and the sidecar deadlines:
 *   horizon end, a catalyst window that closed without the catalyst, an
 *   invalidation trigger whose own check-by date passed.
 *
 * ⛔ Every verdict is a *candidate*, never an order. Nothing here sizes, sells
 * or bypasses the per-order approval Aumos owns; a `SELL` here is an input to a
 * proposal the investor still approves one order at a time.
 *
 * A trim level set weeks ago can be stale by the time price reaches it, so
 * approaching one within 5% raises `trim_approach` — re-validate the ladder's
 * premise before it fires (approved 2026-07-11, L2.5c). It is advisory: the
 * change it argues for is a rule proposal, never an automatic edit.
 */
export function exitCheck({ symbol = null, price, rules = {}, thesis = {}, sentinel = null, asOf } = {}) {
  const diagnostics = []
  const findings = []
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : null
  const past = (day) => typeof day === 'string' && today !== null && day.slice(0, 10) <= today
  const add = (kind, message, detail = {}) => findings.push({ kind, symbol, message, ...detail })

  if (!finite(price)) {
    diagnostics.push(diagnostic('exit_price_unevaluated', 'unevaluated', 'Without a current price the price lane is unread; the fundamental lane still runs', 'price'))
  } else {
    const { stop, target, trailPct, peak, entry, reviewBy, trims = [] } = rules
    if (finite(stop) && price <= stop) add('stop_loss', 'Price is at or below the stop; a full exit is the candidate', { level: stop, price })
    if (finite(target) && price >= target) add('target_full', 'Price reached the take-profit target', { level: target, price })
    if (finite(trailPct) && finite(peak)) {
      const trigger = peak * (1 - trailPct)
      if (price <= trigger) add('trailing_stop', 'Price is at or below the trailing stop', { level: round(trigger), price, peak })
    }
    for (const trim of trims) {
      if (!finite(trim?.price) || trim?.fired) continue
      if (price >= trim.price) add('trim', 'Price reached a trim rung', { level: trim.price, sellPct: trim.sellPct ?? null, price })
      else if (price >= trim.price * 0.95) add('trim_approach', 'Price is within 5% of a trim rung; re-validate the ladder before it fires', { level: trim.price, sellPct: trim.sellPct ?? null, price })
    }
    if (reviewBy && past(reviewBy)) {
      /**
       * A calendar reminder and a thesis that had its window are different
       * findings. "Never got above entry" is the narrow, stated proxy for the
       * second — the benchmark-since-entry comparison the thesis text really
       * asks for needs an entry date this input does not carry.
       */
      if (finite(entry) && price <= entry) add('time_stop', 'The review date arrived and the position never got above entry; it is an exit candidate', { level: entry, price, reviewBy, proxy: 'at-or-below-entry' })
      else add('review', 'The review date arrived; the thesis needs eyes, not necessarily an exit', { reviewBy })
    }
  }

  for (const trigger of thesis?.invalidationTriggers ?? []) {
    if (trigger?.status && trigger.status !== 'open') continue
    const kind = normalizeTriggerKind(trigger?.kind)
    const fired = finite(price) && finite(trigger?.level) &&
      ((kind === 'price-below' && price <= trigger.level) || (kind === 'price-above' && price >= trigger.level))
    if (fired) add('thesis_invalidation', 'A thesis invalidation trigger is met; the claim must be re-verified before anything else', { triggerId: trigger.id ?? null, level: trigger.level, price })
    else if (past(trigger?.checkBy)) add('thesis_review', 'An invalidation trigger passed its own check-by date without being evaluated', { triggerId: trigger.id ?? null, checkBy: trigger.checkBy })
  }
  if (past(thesis?.horizonEnd)) add('thesis_review', 'The thesis horizon ended; score it and record a hold/add/trim/exit checkpoint', { horizonEnd: thesis.horizonEnd })
  for (const catalyst of thesis?.catalysts ?? []) {
    if (catalyst?.occurred === undefined || catalyst?.occurred === null) {
      if (past(catalyst?.windowEnd)) add('thesis_review', 'A catalyst window closed without the catalyst being scored', { event: catalyst.event ?? null, windowEnd: catalyst.windowEnd })
    }
  }
  /**
   * The fundamental lane's own verdict. `threatened` is a review candidate on
   * its own — the price lane may be silent precisely because the market has not
   * priced what the filing already says.
   */
  if (sentinel?.verdict === 'threatened') add('thesis_review', 'The fundamental sentinel reads threatened; bring the review forward rather than waiting for price', { verdict: sentinel.verdict })
  if (sentinel?.escalationRequired) {
    diagnostics.push(diagnostic('sentinel_escalation_pending', 'blocked', 'A repeated threatened verdict requires an explicit resize, exit or deadline decision in this run', 'sentinel'))
  }

  findings.sort((a, b) => (EXIT_SEVERITY[a.kind] ?? 9) - (EXIT_SEVERITY[b.kind] ?? 9))
  const kinds = new Set(findings.map((row) => row.kind))
  const action = [...kinds].some((kind) => FULL_EXIT_KINDS.has(kind)) || kinds.has('thesis_invalidation')
    ? 'SELL'
    : kinds.has('trim')
      ? 'TRIM'
      : kinds.has('review') || kinds.has('thesis_review') || kinds.has('trim_approach')
        ? 'REVIEW'
        : 'NONE'
  if (action !== 'NONE') {
    diagnostics.push(diagnostic('exit_candidate', action === 'REVIEW' ? 'info' : 'unevaluated', `Exit watch raised a ${action} candidate; it is an input to a proposal, never an order`, 'rules', { action, kinds: [...kinds] }))
  }
  return { data: { symbol, action, findings, priceLaneRead: finite(price), candidateOnly: true }, diagnostics }
}
