import { diagnostic, finite, round } from './diagnostics.mjs'

const TRIGGER_KINDS = new Set(['price_below', 'price_above', 'metric', 'time'])
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
    if (!TRIGGER_KINDS.has(row?.kind)) {
      diagnostics.push(diagnostic('invalidation_kind_invalid', 'blocked', 'Invalidation must be price, metric or time; producer-less event is forbidden', `invalidationTriggers[${index}].kind`))
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
    return { asset: candidate.asset, market: candidate.market, sector: candidate.sector ?? null, eligible, axes: { inflection, expectation, catalyst, price, valuation }, rankMeaning: 'research-priority-only' }
  })
  const rankKey = (row) => {
    const cell = row.axes.inflection.status === 'improving' && row.axes.price.status === 'confirmed' ? 2 : row.axes.inflection.status === 'improving' || row.axes.catalyst.status === 'present' ? 1 : 0
    return [cell, row.axes.inflection.marginDeltaYoy ?? -1e15, row.axes.price.rs20VsBenchmarkPct ?? -1e15]
  }
  const ranked = rows.filter((row) => row.eligible).sort((a, b) => {
    const aa = rankKey(a); const bb = rankKey(b)
    return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2] || String(a.asset).localeCompare(String(b.asset))
  }).map((row, index) => ({ ...row, rank: index + 1 }))
  return { data: { ranked, unranked: rows.filter((row) => !row.eligible) }, diagnostics }
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
