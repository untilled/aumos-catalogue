import { diagnostic, finite, round } from './diagnostics.mjs'
import { rsi } from './indicators.mjs'

const HORIZONS = [20, 60]

function classify(closes) {
  if (closes.length < 200) return null
  const current = closes.at(-1)
  const mean = (period) => closes.slice(-period).reduce((sum, value) => sum + value, 0) / period
  const ma20 = mean(20)
  const ma50 = mean(50)
  const ma200 = mean(200)
  const offHighPct = (current / Math.max(...closes) - 1) * 100
  const uptrend = current > ma200 && ma50 > ma200
  const pullback = uptrend && (current < ma20 || (offHighPct >= -15 && offHighPct <= -5))
  const extended = (current / ma200 - 1) * 100 > 30
  const broken = closes.at(-1) < ma200 && closes.at(-2) < ma200
  if (broken || !uptrend) return { state: broken ? 'BROKEN' : 'DOWNTREND', guidance: 'stop' }
  if (pullback) return { state: 'PULLBACK_IN_UPTREND', guidance: extended ? 'half' : 'full' }
  return { state: 'UPTREND', guidance: 'small_or_wait' }
}

function stats(values) {
  if (!values.length) return null
  return {
    n: values.length,
    averagePct: round(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    winRatePct: round(values.filter((value) => value > 0).length / values.length * 100, 1),
  }
}

export function trendGateForward({ series = [], horizons = HORIZONS, warmup = 200 }) {
  const diagnostics = []
  const rows = series.filter((row) => typeof row?.date === 'string' && finite(row.close)).sort((a, b) => a.date.localeCompare(b.date))
  const buckets = new Map()
  for (let index = warmup; index < rows.length; index += 1) {
    const classification = classify(rows.slice(index - warmup, index).map((row) => row.close))
    if (!classification) continue
    const base = rows[index - 1].close
    for (const horizon of horizons) {
      if (index - 1 + horizon >= rows.length || base === 0) continue
      const key = `${classification.guidance}:d${horizon}`
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push((rows[index - 1 + horizon].close / base - 1) * 100)
    }
  }
  if (rows.length <= warmup) diagnostics.push(diagnostic('backtest_gate_history_insufficient', 'unevaluated', 'Trend gate needs MA200 warmup plus a forward window', 'series', { count: rows.length }))
  return { data: { classifiableDays: Math.max(0, rows.length - warmup), stats: Object.fromEntries([...buckets].map(([key, values]) => [key, stats(values)])) }, diagnostics }
}

export function dcaMultiplierBacktest({ series = [], annualCashCarryPct = 2.5, warmup = 200 }) {
  const diagnostics = []
  const rows = series.filter((row) => typeof row?.date === 'string' && finite(row.close)).sort((a, b) => a.date.localeCompare(b.date))
  const schedule = []
  const months = new Set()
  const multipliers = { full: 1, half: 0.5, small_or_wait: 0.25, stop: 0 }
  for (let index = warmup; index < rows.length; index += 1) {
    const month = rows[index].date.slice(0, 7)
    if (months.has(month)) continue
    months.add(month)
    const guidance = classify(rows.slice(index - warmup, index).map((row) => row.close))?.guidance
    schedule.push({ price: rows[index].close, multiplier: multipliers[guidance] ?? 0 })
  }
  if (!schedule.length) {
    diagnostics.push(diagnostic('backtest_dca_history_insufficient', 'unevaluated', 'No classifiable monthly tranche exists', 'series'))
    return { data: { months: 0, trendMultiplied: null, uniform: null }, diagnostics }
  }
  const carry = (1 + annualCashCarryPct / 100) ** (1 / 12) - 1
  const last = rows.at(-1).close
  const simulate = (useMultiplier) => {
    let cash = 0
    let units = 0
    let budget = 0
    let peak = 0
    let maximumDrawdown = 0
    for (const tranche of schedule) {
      cash = cash * (1 + carry) + 1
      budget += 1
      const investment = Math.min(cash, useMultiplier ? tranche.multiplier : 1)
      cash -= investment
      units += investment / tranche.price
      const normalized = (cash + units * tranche.price) / budget
      peak = Math.max(peak, normalized)
      if (peak) maximumDrawdown = Math.max(maximumDrawdown, (peak - normalized) / peak * 100)
    }
    const finalValue = cash + units * last
    return { finalValueUnits: round(finalValue, 2), returnOnBudgetPct: round((finalValue / budget - 1) * 100, 2), maxDrawdownPct: round(maximumDrawdown, 1) }
  }
  return { data: { months: schedule.length, annualCashCarryPct, trendMultiplied: simulate(true), uniform: simulate(false) }, diagnostics }
}

function bucket(value, boundaries) {
  return boundaries.find(([maximum]) => value < maximum)?.[1] ?? boundaries.at(-1)[1]
}

export function oversoldStrata({ assets = [], benchmarks = {}, horizons = HORIZONS }) {
  const diagnostics = []
  const buckets = new Map()
  let symbolsUsed = 0
  for (const asset of assets) {
    const rows = (asset.bars ?? []).filter((row) => typeof row?.date === 'string' && finite(row.close)).sort((a, b) => a.date.localeCompare(b.date))
    const benchmark = new Map((benchmarks[asset.market] ?? []).map((row) => [row.date, row.close]))
    if (rows.length < 80 || !benchmark.size) continue
    symbolsUsed += 1
    const closes = rows.map((row) => row.close)
    for (let index = 60; index < rows.length; index += 1) {
      const rsi14 = rsi(closes.slice(Math.max(0, index - 100), index + 1), 14)
      const offHigh = (closes[index] / Math.max(...closes.slice(Math.max(0, index - 200), index + 1)) - 1) * 100
      const rsiBucket = bucket(rsi14, [[30, 'rsi<30'], [40, 'rsi_30-40'], [50, 'rsi_40-50'], [Infinity, 'rsi>=50']])
      const offBucket = bucket(offHigh, [[-40, 'offhigh<=-40%'], [-25, 'offhigh_-40~-25%'], [-10, 'offhigh_-25~-10%'], [Infinity, 'offhigh>-10%']])
      for (const horizon of horizons) {
        if (index + horizon >= rows.length) continue
        const baseBenchmark = benchmark.get(rows[index].date)
        const futureBenchmark = benchmark.get(rows[index + horizon].date)
        if (!finite(baseBenchmark) || !finite(futureBenchmark) || baseBenchmark === 0) continue
        const excess = (closes[index + horizon] / closes[index] - 1) * 100 - (futureBenchmark / baseBenchmark - 1) * 100
        for (const name of [rsiBucket, offBucket]) {
          const key = `${name}:d${horizon}`
          if (!buckets.has(key)) buckets.set(key, [])
          buckets.get(key).push(excess)
        }
      }
    }
  }
  if (!symbolsUsed) diagnostics.push(diagnostic('oversold_strata_unavailable', 'unevaluated', 'No asset has sufficient bars and aligned benchmark dates', 'assets'))
  return { data: { symbolsUsed, stats: Object.fromEntries([...buckets].map(([key, values]) => [key, stats(values)])) }, diagnostics }
}
