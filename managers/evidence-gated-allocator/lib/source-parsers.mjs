import { diagnostic, finite } from './diagnostics.mjs'

export function filterPointInTime(rows, { asOf, timestampField = 'availableAt', freshnessHours }) {
  const diagnostics = []
  const cutoff = Date.parse(asOf)
  const retained = []
  const dropped = []
  for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
    const timestamp = row?.[timestampField]
    const instant = Date.parse(timestamp)
    if (!Number.isFinite(instant)) {
      diagnostics.push(diagnostic('availability_timestamp_missing', 'unevaluated', `Missing ${timestampField}`, `rows[${index}].${timestampField}`))
      continue
    }
    if (instant > cutoff) {
      dropped.push(row)
      diagnostics.push(diagnostic('post_as_of_row_dropped', 'info', 'Source row was not public at asOf', `rows[${index}]`, { timestamp }))
    } else retained.push(row)
  }
  retained.sort((a, b) => Date.parse(a[timestampField]) - Date.parse(b[timestampField]))
  const newest = retained.at(-1)?.[timestampField] ?? null
  const ageHours = newest ? (cutoff - Date.parse(newest)) / 3_600_000 : null
  const fresh = finite(freshnessHours) && ageHours !== null ? ageHours <= freshnessHours : null
  if (fresh === false) diagnostics.push(diagnostic('source_stale', 'blocked', 'Newest retained row exceeds freshness limit', 'rows', { newest, ageHours, freshnessHours }))
  if (fresh === null) diagnostics.push(diagnostic('freshness_unevaluated', 'unevaluated', 'Freshness needs a retained row and limit', 'freshnessHours'))
  return { data: { retained, droppedCount: dropped.length, newestAvailableAt: newest, ageHours, fresh }, diagnostics }
}

export function normalizeSecFacts(payload, asOf) {
  const diagnostics = []
  const rows = []
  const facts = payload?.facts?.['us-gaap']
  if (!facts || typeof facts !== 'object') {
    diagnostics.push(diagnostic('sec_facts_missing', 'unevaluated', 'SEC companyfacts us-gaap object is required', 'facts.us-gaap'))
    return { data: { rows }, diagnostics }
  }
  for (const [metric, fact] of Object.entries(facts)) {
    for (const [unit, observations] of Object.entries(fact?.units ?? {})) {
      for (const observation of observations ?? []) {
        const availableAt = observation.filed
        if (!availableAt || Date.parse(`${availableAt}T23:59:59Z`) > Date.parse(asOf)) continue
        rows.push({
          metric,
          label: fact.label ?? null,
          value: observation.val ?? null,
          unit,
          periodStart: observation.start ?? null,
          periodEnd: observation.end ?? null,
          form: observation.form ?? null,
          accession: observation.accn ?? null,
          availableAt,
          sourceType: 'sec-companyfacts',
        })
      }
    }
  }
  return { data: { rows }, diagnostics }
}

export function normalizeDartFilings(payload, asOf) {
  const diagnostics = []
  const rows = []
  for (const [index, row] of (payload?.list ?? []).entries()) {
    const receipt = row?.rcept_no
    const date = row?.rcept_dt
    if (!receipt || !/^\d{8}/.test(receipt) || !/^\d{8}$/.test(date ?? '')) {
      diagnostics.push(diagnostic('dart_receipt_invalid', 'unevaluated', 'DART receipt number/date is required', `list[${index}]`))
      continue
    }
    const availableAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59+09:00`
    if (Date.parse(availableAt) > Date.parse(asOf)) continue
    const reportName = row.report_nm ?? ''
    rows.push({
      receiptNumber: receipt,
      availableAt,
      reportName,
      isPreliminaryEarnings: /잠정|영업\(잠정\)실적/.test(reportName),
      isPeriodicReport: /사업보고서|반기보고서|분기보고서/.test(reportName),
      isCorrection: /정정/.test(reportName),
      sourceType: 'opendart-filing-list',
    })
  }
  return { data: { rows }, diagnostics }
}

export function validateAdjustment(series, corporateActions = []) {
  const diagnostics = []
  const bases = new Set((series ?? []).map((row) => row?.adjustment).filter(Boolean))
  if (bases.size > 1 && corporateActions.length === 0) diagnostics.push(diagnostic('adjustment_basis_conflict', 'blocked', 'Adjusted and unadjusted series cannot be mixed without reconciliation', 'series', { bases: [...bases] }))
  return { data: { compatible: diagnostics.length === 0, bases: [...bases] }, diagnostics }
}
