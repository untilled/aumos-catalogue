import { diagnostic, finite, round } from './diagnostics.mjs'

export function independentDateClusters(dates, gapDays = 5) {
  const unique = [...new Set((dates ?? []).filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value))))].sort()
  const clusters = []
  for (const date of unique) {
    const latest = clusters.at(-1)?.at(-1)
    if (!latest || (Date.parse(date) - Date.parse(latest)) / 86_400_000 > gapDays) clusters.push([date])
    else clusters.at(-1).push(date)
  }
  return clusters
}

export function brierScore(probabilities, outcomeIndex) {
  if (!Array.isArray(probabilities) || probabilities.length === 0 || !probabilities.every(finite)) return null
  if (Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-9) return null
  if (!Number.isInteger(outcomeIndex) || outcomeIndex < 0 || outcomeIndex >= probabilities.length) return null
  return round(probabilities.reduce((sum, value, index) => sum + (value - (index === outcomeIndex ? 1 : 0)) ** 2, 0), 4)
}

export function calibrationSummary({ samples = [], minimumSamples = 10, minimumClusters = 4 }) {
  const diagnostics = []
  const complete = samples.filter((row) => finite(row?.activeReturn) && typeof row?.date === 'string')
  const clusters = independentDateClusters(complete.map((row) => row.date))
  const positive = complete.filter((row) => row.activeReturn > 0).length
  const active = complete.map((row) => row.activeReturn)
  const briers = complete.map((row) => brierScore(row.probabilities, row.outcomeIndex)).filter(finite)
  const status = complete.length < 5
    ? 'insufficient'
    : complete.length < minimumSamples || clusters.length < minimumClusters
      ? 'observing'
      : 'reviewable'
  if (complete.length !== samples.length) diagnostics.push(diagnostic('calibration_incomplete_samples', 'unevaluated', 'Incomplete samples do not count toward maturity', 'samples', { excluded: samples.length - complete.length }))
  return {
    data: {
      sampleCount: complete.length,
      independentDateClusterCount: clusters.length,
      clusters,
      positiveActiveReturnRate: complete.length ? round(positive / complete.length) : null,
      meanActiveReturn: active.length ? round(active.reduce((sum, value) => sum + value, 0) / active.length) : null,
      meanBrierScore: briers.length ? round(briers.reduce((sum, value) => sum + value, 0) / briers.length) : null,
      status,
    },
    diagnostics,
  }
}

export function benjaminiHochberg(rows, alpha = 0.05) {
  const sorted = rows.filter((row) => finite(row?.pValue)).sort((a, b) => a.pValue - b.pValue)
  let thresholdRank = 0
  sorted.forEach((row, index) => {
    if (row.pValue <= ((index + 1) / sorted.length) * alpha) thresholdRank = index + 1
  })
  return sorted.map((row, index) => ({ ...row, significant: index < thresholdRank }))
}
