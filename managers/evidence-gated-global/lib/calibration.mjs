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
  const valid = rows.map((row, originalIndex) => ({ ...row, originalIndex })).filter((row) => finite(row?.pValue))
  const sorted = valid.sort((a, b) => a.pValue - b.pValue)
  let thresholdRank = 0
  sorted.forEach((row, index) => {
    if (row.pValue <= ((index + 1) / sorted.length) * alpha) thresholdRank = index + 1
  })
  let running = 1
  const ranked = Array(sorted.length)
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    running = Math.min(running, sorted[index].pValue * sorted.length / (index + 1))
    ranked[index] = {
      ...sorted[index],
      qValue: round(Math.min(running, 1), 6),
      significant: index < thresholdRank,
    }
  }
  return ranked.sort((a, b) => a.originalIndex - b.originalIndex).map(({ originalIndex, ...row }) => row)
}

export function quintileSpread(values) {
  const sorted = (values ?? []).filter(finite).sort((a, b) => a - b)
  if (sorted.length < 5) return null
  const width = Math.max(1, Math.floor(sorted.length / 5))
  const bottom = sorted.slice(0, width)
  const top = sorted.slice(-width)
  const mean = (rows) => rows.reduce((sum, value) => sum + value, 0) / rows.length
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return {
    n: sorted.length,
    kPerTail: width,
    bottomQuintileMean: round(mean(bottom), 3),
    topQuintileMean: round(mean(top), 3),
    spread: round(mean(top) - mean(bottom), 3),
    median: round(median, 3),
  }
}

function seededRandom(seed = 0) {
  // mulberry32 is package-owned and versioned so golden bootstrap output is portable.
  let state = Number.isInteger(seed) ? seed >>> 0 : 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function bootstrapClusterCi(clusterValues, { resamples = 2000, confidence = 0.95, seed = 0 } = {}) {
  const clusters = Object.values(clusterValues ?? {}).map((values) => values.filter(finite)).filter((values) => values.length)
  if (clusters.length < 2 || !Number.isInteger(resamples) || resamples < 1 || confidence <= 0 || confidence >= 1) return null
  const all = clusters.flat()
  const random = seededRandom(seed)
  const means = []
  for (let run = 0; run < resamples; run += 1) {
    const pooled = []
    for (let index = 0; index < clusters.length; index += 1) pooled.push(...clusters[Math.floor(random() * clusters.length)])
    means.push(pooled.reduce((sum, value) => sum + value, 0) / pooled.length)
  }
  means.sort((a, b) => a - b)
  const tail = (1 - confidence) / 2
  const low = Math.floor(tail * means.length)
  const high = Math.min(Math.floor((1 - tail) * means.length) - 1, means.length - 1)
  return {
    pointEstimate: round(all.reduce((sum, value) => sum + value, 0) / all.length, 3),
    ciLow: round(means[low], 3),
    ciHigh: round(means[high], 3),
    clusterCount: clusters.length,
    resamples,
    confidence,
    randomVersion: 'mulberry32-v1',
  }
}

function approximatePValue(pointEstimate, confidenceInterval) {
  if (!finite(pointEstimate) || !confidenceInterval || !finite(confidenceInterval.ciLow) || !finite(confidenceInterval.ciHigh)) return null
  const standardError = (confidenceInterval.ciHigh - confidenceInterval.ciLow) / (2 * 1.959964)
  if (standardError <= 0) return pointEstimate === 0 ? 1 : 0
  // Abramowitz-Stegun approximation to erfc(abs(z) / sqrt(2)).
  const x = Math.abs(pointEstimate / standardError) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return round(Math.max(0, Math.min(1, 1 - erf)), 6)
}

export function promotionGate({ rows = [], horizon = 'd20', seed = 0, resamples = 2000, thresholds = {} }) {
  const diagnostics = []
  const minimum = {
    samples: thresholds.samples ?? 30,
    regimes: thresholds.regimes ?? 3,
    clusters: thresholds.clusters ?? 10,
  }
  const costs = { kr: 0.3, us: 0.5, ...(thresholds.roundTripCostPct ?? {}) }
  const matured = rows.filter((row) => row?.cohort === 'promote' && finite(row?.forward?.[horizon]?.returnPct) && typeof row?.signalDate === 'string')
  if (matured.length !== rows.length) diagnostics.push(diagnostic('promotion_rows_excluded', 'info', 'Only mature promote rows enter the promotion gate', 'rows', { excluded: rows.length - matured.length }))
  const byVersion = new Map()
  for (const row of matured) {
    const version = row.ruleVersion ?? 'legacy-unclassified'
    if (!byVersion.has(version)) byVersion.set(version, [])
    byVersion.get(version).push(row)
  }
  const versions = []
  for (const [ruleVersion, cohort] of byVersion.entries()) {
    const clusters = independentDateClusters(cohort.map((row) => row.signalDate))
    const clusterByDate = new Map(clusters.flatMap((cluster, index) => cluster.map((date) => [date, index])))
    const costAdjusted = cohort.map((row) => round(row.forward[horizon].returnPct - (costs[String(row.market).toLowerCase()] ?? costs.us), 3))
    const grouped = {}
    cohort.forEach((row, index) => {
      const cluster = clusterByDate.get(row.signalDate)
      if (cluster !== undefined) (grouped[cluster] ??= []).push(costAdjusted[index])
    })
    const interval = bootstrapClusterCi(grouped, { resamples, seed })
    const ordered = cohort.map((row, index) => ({ row, value: costAdjusted[index] })).sort((a, b) => a.row.signalDate.localeCompare(b.row.signalDate))
    const split = Math.floor(ordered.length / 2)
    const average = (items) => items.length ? round(items.reduce((sum, item) => sum + item.value, 0) / items.length, 3) : null
    const train = ordered.slice(0, split)
    const test = ordered.slice(split)
    const regimes = [...new Set(cohort.map((row) => row.regime).filter(Boolean))].sort()
    const gate = {
      samplesOk: cohort.length >= minimum.samples,
      regimesOk: regimes.length >= minimum.regimes,
      clustersOk: clusters.length >= minimum.clusters,
      outOfSampleOk: finite(average(test)) && average(test) > 0,
    }
    gate.reviewReady = Object.values(gate).every(Boolean)
    versions.push({
      ruleVersion,
      sampleCount: cohort.length,
      independentClusterCount: clusters.length,
      regimeCount: regimes.length,
      regimes,
      quintileSpreadRaw: quintileSpread(cohort.map((row) => row.forward[horizon].returnPct)),
      quintileSpreadCostAdjusted: quintileSpread(costAdjusted),
      bootstrapClusterCiCostAdjusted: interval,
      walkForward: {
        inSampleCount: train.length,
        inSampleMeanCostAdjustedPct: average(train),
        outOfSampleCount: test.length,
        outOfSampleMeanCostAdjustedPct: average(test),
      },
      pValue: approximatePValue(interval?.pointEstimate, interval),
      gate,
    })
  }
  const corrected = benjaminiHochberg(versions.map((row) => ({ ruleVersion: row.ruleVersion, pValue: row.pValue })))
  const correction = new Map(corrected.map((row) => [row.ruleVersion, row]))
  for (const row of versions) {
    const match = correction.get(row.ruleVersion)
    row.fdrQValue = match?.qValue ?? null
    row.fdrRejectedNull = match?.significant ?? null
  }
  return {
    data: {
      horizon,
      totalMaturePromote: matured.length,
      minimumThresholds: minimum,
      costModelPct: costs,
      versions,
      anyReviewReady: versions.some((row) => row.gate.reviewReady),
    },
    diagnostics,
  }
}
