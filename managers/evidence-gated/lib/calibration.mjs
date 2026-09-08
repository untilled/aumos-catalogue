import { diagnostic, finite, round } from './diagnostics.mjs'
import { REGIMES, normalizeRegime } from './scanners.mjs'
import { METHODOLOGY } from './constants.mjs'

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

export function calibrationSummary({ samples = [], minimumSamples = METHODOLOGY.minimumLensSamples, minimumClusters = METHODOLOGY.minimumIndependentDateClusters }) {
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

/**
 * ── Where a closed position actually lands (issue #153, #118) ─────────────
 *
 * The exit discipline exists to produce closed outcomes. Before adding it, the
 * question worth answering is whether a closed outcome reaches the gate anybody
 * is waiting on — because the port has **two** maturity axes and they are fed
 * from different places, which no document said plainly:
 *
 * | axis | what feeds it | what it moves |
 * |---|---|---|
 * | `calibrationSummary` → `learning/evidence-maturity` | **closed real decisions**, one sample each | `maturityStatus` — ⛔ an attribution label since #226, which caps no size |
 * | `promotionGate` (30 · 3 · 10) | **matured paper windows** in the `promote` cohort (`signalPaper`) | promotion of a lens |
 *
 * ⛔ **A closed real position does not become a `promotionGate` sample, and
 * must not.** That gate measures a forward record registered before the outcome
 * was known; a realized trade has a fill, a cost and a size, and pooling the two
 * would be the sample contamination §6 forbids in the source's own words. The
 * two axes stay separate and this operation says so in its output rather than
 * leaving a run to discover it by looking for its trades in the wrong place.
 *
 * ⚠️ **What was genuinely broken is the first row, and this closes it.** The
 * conversion from a closed decision to a calibration sample lived in a sentence
 * in `skills/outcome-calibration` — *"update `learning/evidence-maturity` and
 * the applicable `calibration/*` key"* — with no operation performing it, which
 * is the same shape as the paper-track registration that held zero rows across
 * every run (#118). A rule that only exists in prose is a rule that did not run.
 *
 * ⛔ A row that cannot be scored is dropped **and reported**, never zero-filled:
 * a closed decision with no benchmark comparison is not a zero active return,
 * it is a decision nobody measured.
 */
export function closedOutcomeSamples({ outcomes = [], lens = null, asOf } = {}) {
  const diagnostics = []
  const asOfInstant = Date.parse(asOf)
  const samples = []
  const rejected = []
  for (const [index, row] of (Array.isArray(outcomes) ? outcomes : []).entries()) {
    const at = `outcomes[${index}]`
    const date = typeof row?.closedAt === 'string' ? row.closedAt.slice(0, 10) : typeof row?.date === 'string' ? row.date.slice(0, 10) : null
    /** Percent in, fraction out — `calibrationSummary` counts in fractions. */
    const activeReturn = finite(row?.activeReturn)
      ? row.activeReturn
      : finite(row?.activeReturnPct)
        ? row.activeReturnPct / 100
        : finite(row?.grossReturnPct) && finite(row?.benchmarkReturnPct)
          ? (row.grossReturnPct - row.benchmarkReturnPct) / 100
          : null
    const rowLens = row?.lens ?? null
    if (date === null || !Number.isFinite(Date.parse(date))) {
      rejected.push({ at, reason: 'no-close-date' })
      diagnostics.push(diagnostic('closed_outcome_sample_incomplete', 'unevaluated', 'A closed outcome is a sample on the day it closed; without that date it cannot be clustered and does not count toward maturity', `${at}.closedAt`, { decisionId: row?.decisionId ?? null }))
      continue
    }
    if (Number.isFinite(asOfInstant) && Date.parse(date) > asOfInstant) {
      diagnostics.push(diagnostic('closed_outcome_post_as_of', 'blocked', 'A closed outcome dated after this invocation did not exist when the run was asked; it is refused rather than counted', `${at}.closedAt`, { closedAt: date, asOf }))
      continue
    }
    if (rowLens === null) {
      rejected.push({ at, reason: 'no-lens' })
      diagnostics.push(diagnostic('closed_outcome_sample_incomplete', 'unevaluated', 'Maturity is measured per lens, so a sample that does not name the lens it came from cannot be pooled into one', `${at}.lens`, { decisionId: row?.decisionId ?? null }))
      continue
    }
    if (lens !== null && rowLens !== lens) continue
    if (activeReturn === null) {
      rejected.push({ at, reason: 'no-active-return' })
      diagnostics.push(diagnostic('closed_outcome_sample_incomplete', 'unevaluated', 'Active return is the measurement this axis counts, and a closed decision with no benchmark comparison is unmeasured rather than flat; give activeReturnPct, or the gross and benchmark returns it comes from', `${at}.activeReturnPct`, { decisionId: row?.decisionId ?? null }))
      continue
    }
    samples.push({
      date,
      activeReturn: round(activeReturn),
      lens: rowLens,
      decisionId: row?.decisionId ?? null,
      ...(Array.isArray(row?.probabilities) ? { probabilities: row.probabilities } : {}),
      ...(Number.isInteger(row?.outcomeIndex) ? { outcomeIndex: row.outcomeIndex } : {}),
    })
  }
  const summary = calibrationSummary({ samples })
  diagnostics.push(...summary.diagnostics)
  /**
   * Said every run, once, because the pooling it refuses is silent when it
   * happens: a run that reports its trades under the promotion gate's sample
   * count has not broken anything visible until the gate opens on the wrong
   * evidence.
   */
  diagnostics.push(diagnostic(
    'closed_outcome_not_a_paper_sample',
    'info',
    "Closed real outcomes move the lens maturity axis and never promotionGate, which counts matured paper windows in the promote cohort; the two are kept apart on purpose and a run that pools them would open a gate on evidence it was not measuring",
    'outcomes',
    { reaches: ['calibrationSummary', 'learning/evidence-maturity'], doesNotReach: ['promotionGate'], accepted: samples.length },
  ))
  return {
    data: {
      samples,
      accepted: samples.length,
      rejected,
      lens,
      maturityStatus: summary.data.status,
      sampleCount: summary.data.sampleCount,
      independentDateClusterCount: summary.data.independentDateClusterCount,
      summary: summary.data,
      reaches: ['calibrationSummary', 'learning/evidence-maturity'],
      doesNotReach: ['promotionGate'],
      /** The memory key this belongs in; the run writes it, this computes it. */
      memoryKey: lens === null ? 'learning/evidence-maturity' : `calibration/${lens}`,
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
    samples: thresholds.samples ?? METHODOLOGY.promotionGate.samples,
    regimes: thresholds.regimes ?? METHODOLOGY.promotionGate.regimes,
    clusters: thresholds.clusters ?? METHODOLOGY.promotionGate.clusters,
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
    /**
     * ⚠️ This counted distinct **strings**, so `risk_on`, `risk-on` and
     * `Risk On` were three regimes and a sample gathered entirely in one
     * satisfied the requirement that exists to prevent exactly that. (issue #81)
     *
     * Only vocabulary-valid tags count now, and an unrecognised one is
     * diagnosed rather than quietly counted as a regime of its own.
     */
    const taggedRegimes = cohort.map((row) => row.regime).filter(Boolean)
    const normalized = taggedRegimes.map((regime) => ({ given: regime, canonical: normalizeRegime(regime) }))
    const regimes = [...new Set(normalized.filter((row) => REGIMES.has(row.canonical)).map((row) => row.canonical))].sort()
    const unrecognised = [...new Set(normalized.filter((row) => !REGIMES.has(row.canonical)).map((row) => row.given))]
    if (unrecognised.length) {
      diagnostics.push(diagnostic('regime_outside_vocabulary', 'blocked', 'A sample carries a regime tag outside the published vocabulary; it is not counted, because free text makes one market state look like several', 'rows', { ruleVersion, unrecognised, supported: [...REGIMES] }))
    }
    const untagged = cohort.length - taggedRegimes.length
    if (untagged) {
      diagnostics.push(diagnostic('regime_untagged_samples', 'unevaluated', 'Samples with no regime tag cannot show the bias the regime requirement exists to reveal', 'rows', { ruleVersion, untagged }))
    }
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
