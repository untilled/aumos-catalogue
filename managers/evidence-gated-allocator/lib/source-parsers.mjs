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
  if (payload?.status && payload.status !== '000') diagnostics.push(diagnostic('dart_vendor_error', 'blocked', 'OpenDART returned a non-success status', 'status', { status: payload.status, message: payload.message ?? null }))
  for (const [index, row] of (payload?.list ?? []).entries()) {
    const receipt = row?.rcept_no
    const date = row?.rcept_dt
    if (!receipt || !/^\d{8}/.test(receipt) || !/^\d{8}$/.test(date ?? '')) {
      diagnostics.push(diagnostic('dart_receipt_invalid', 'unevaluated', 'DART receipt number/date is required', `list[${index}]`))
      continue
    }
    const availableAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59+09:00`
    if (Date.parse(availableAt) > Date.parse(asOf)) {
      diagnostics.push(diagnostic('post_as_of_row_dropped', 'info', 'DART filing was not conservatively public at asOf', `list[${index}]`, { receiptNumber: receipt, availableAt }))
      continue
    }
    const reportName = row.report_nm ?? ''
    rows.push({
      receiptNumber: receipt,
      availableAt,
      reportName,
      isPreliminaryEarnings: /잠정|영업\(잠정\)실적/.test(reportName),
      isPeriodicReport: /사업보고서|반기보고서|분기보고서/.test(reportName),
      isCorrection: /정정/.test(reportName),
      corporationCode: row.corp_code ?? null,
      corporationName: row.corp_name ?? null,
      stockCode: row.stock_code ?? null,
      disclosureType: row.pblntf_ty ?? null,
      disclosureDetailType: row.pblntf_detail_ty ?? null,
      sourceType: 'opendart-filing-list',
    })
  }
  return { data: { rows }, diagnostics }
}

export function parseDartCorpCodes(xml) {
  const diagnostics = []
  if (typeof xml !== 'string') {
    diagnostics.push(diagnostic('dart_corp_codes_xml_missing', 'blocked', 'Decompressed CORPCODE.xml text is required', 'xml'))
    return { data: { rows: [] }, diagnostics }
  }
  const rows = []
  const value = (body, tag) => body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? null
  for (const match of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const body = match[1]
    const corporationCode = value(body, 'corp_code')
    const corporationName = value(body, 'corp_name')
    if (!corporationCode || !corporationName) {
      diagnostics.push(diagnostic('dart_corp_code_row_invalid', 'unevaluated', 'corp_code and corp_name are required', 'xml'))
      continue
    }
    rows.push({ corporationCode, corporationName, stockCode: value(body, 'stock_code') || null, modifiedDate: value(body, 'modify_date') || null })
  }
  if (!rows.length) diagnostics.push(diagnostic('dart_corp_codes_empty', 'unevaluated', 'No corporation rows were parsed', 'xml'))
  return { data: { rows }, diagnostics }
}

function dartAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || ['', '-'].includes(value.trim())) return null
  const parsed = Number(value.replaceAll(',', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeDartFinancials(payload, asOf) {
  const diagnostics = []
  const rows = []
  if (payload?.status !== '000') {
    diagnostics.push(diagnostic('dart_financials_vendor_error', 'blocked', 'Successful OpenDART financial statement payload is required', 'status', { status: payload?.status ?? null, message: payload?.message ?? null }))
    return { data: { rows }, diagnostics }
  }
  for (const [index, row] of (payload.list ?? []).entries()) {
    const receipt = row?.rcept_no
    if (!/^\d{8,}$/.test(receipt ?? '')) {
      diagnostics.push(diagnostic('dart_financial_receipt_invalid', 'unevaluated', 'Financial row needs a DART receipt number', `list[${index}].rcept_no`))
      continue
    }
    const date = receipt.slice(0, 8)
    const availableAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:59:59+09:00`
    if (Date.parse(availableAt) > Date.parse(asOf)) {
      diagnostics.push(diagnostic('post_as_of_row_dropped', 'info', 'DART financial row was not conservatively public at asOf', `list[${index}]`, { receiptNumber: receipt, availableAt }))
      continue
    }
    const amount = dartAmount(row.thstrm_amount)
    if (amount === null) diagnostics.push(diagnostic('dart_financial_amount_missing', 'unevaluated', 'Missing amount stays null', `list[${index}].thstrm_amount`, { accountId: row.account_id ?? null }))
    rows.push({
      receiptNumber: receipt,
      availableAt,
      corporationCode: row.corp_code ?? null,
      businessYear: row.bsns_year ?? null,
      reportCode: row.reprt_code ?? null,
      statementScope: row.fs_div === 'CFS' ? 'consolidated' : row.fs_div === 'OFS' ? 'separate' : null,
      statementType: row.sj_div ?? null,
      accountId: row.account_id ?? null,
      accountName: row.account_nm ?? null,
      currentPeriodName: row.thstrm_nm ?? null,
      currentAmount: amount,
      currency: row.currency ?? 'KRW',
      sourceType: 'opendart-full-financial-statements',
    })
  }
  return { data: { rows }, diagnostics }
}

export function normalizeSecSubmissions(payload, asOf) {
  const diagnostics = []
  const rows = []
  const recent = payload?.filings?.recent
  if (!recent || !Array.isArray(recent.accessionNumber)) {
    diagnostics.push(diagnostic('sec_submissions_missing', 'unevaluated', 'SEC filings.recent parallel arrays are required', 'filings.recent'))
    return { data: { rows }, diagnostics }
  }
  for (let index = 0; index < recent.accessionNumber.length; index += 1) {
    const accession = recent.accessionNumber[index]
    const accepted = recent.acceptanceDateTime?.[index]
    const filed = recent.filingDate?.[index]
    const availableAt = accepted && /^\d{14}$/.test(accepted)
      ? `${accepted.slice(0, 4)}-${accepted.slice(4, 6)}-${accepted.slice(6, 8)}T${accepted.slice(8, 10)}:${accepted.slice(10, 12)}:${accepted.slice(12, 14)}Z`
      : filed ? `${filed}T23:59:59Z` : null
    if (!accession || !availableAt || !Number.isFinite(Date.parse(availableAt))) {
      diagnostics.push(diagnostic('sec_submission_time_invalid', 'unevaluated', 'Accession and accepted/filing date are required', `filings.recent[${index}]`))
      continue
    }
    if (Date.parse(availableAt) > Date.parse(asOf)) {
      diagnostics.push(diagnostic('post_as_of_row_dropped', 'info', 'SEC submission was filed after asOf', `filings.recent[${index}]`, { accession, availableAt }))
      continue
    }
    const form = recent.form?.[index] ?? null
    rows.push({
      accession,
      availableAt,
      filingDate: filed ?? null,
      reportDate: recent.reportDate?.[index] ?? null,
      form,
      primaryDocument: recent.primaryDocument?.[index] ?? null,
      isEarningsFiling: form === '8-K' || form === '6-K',
      isPeriodicReport: ['10-Q', '10-K', '20-F', '40-F'].includes(form),
      sourceType: 'sec-submissions',
    })
  }
  return { data: { rows }, diagnostics }
}

export function laneCoverage({ lane, sources = {}, intent = 'review' }) {
  const diagnostics = []
  const rules = {
    kr: { fundamental: ['toss', 'open-dart'], price: ['toss'] },
    us: { fundamental: ['toss', 'sec-edgar', 'alpaca'], price: ['toss'] },
    global: { allocation: ['toss'], price: ['toss'] },
  }
  const category = intent === 'new-fundamental-buy' || intent === 'thesis-promotion' ? 'fundamental' : intent === 'cross-market-allocation' ? 'allocation' : 'price'
  const required = rules[lane]?.[category] ?? []
  const unavailable = required.filter((source) => !['fresh', 'available'].includes(sources[source]?.status))
  if (unavailable.length) diagnostics.push(diagnostic('lane_source_blocked', category === 'price' && intent === 'review' ? 'unevaluated' : 'blocked', 'Required source is missing or stale for this lane and intent', 'sources', { lane, intent, unavailable }))
  return { data: { lane, intent, required, unavailable, judgement: unavailable.length ? 'unable' : 'reviewable', action: unavailable.length ? 'WAIT' : 'CONTINUE' }, diagnostics }
}

export function validateAdjustment(series, corporateActions = []) {
  const diagnostics = []
  const bases = new Set((series ?? []).map((row) => row?.adjustment).filter(Boolean))
  if (bases.size > 1 && corporateActions.length === 0) diagnostics.push(diagnostic('adjustment_basis_conflict', 'blocked', 'Adjusted and unadjusted series cannot be mixed without reconciliation', 'series', { bases: [...bases] }))
  return { data: { compatible: diagnostics.length === 0, bases: [...bases] }, diagnostics }
}
