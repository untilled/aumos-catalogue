import { diagnostic, finite, round } from './diagnostics.mjs'
import { maxDrawdown } from './indicators.mjs'

export function decomposition(input) {
  const diagnostics = []
  const required = ['totalReturn', 'coreWeight', 'coreReturn', 'noncoreReturn', 'noncoreBenchmarkReturn']
  if (!required.every((key) => finite(input?.[key]))) {
    diagnostics.push(diagnostic('attribution_input_missing', 'unevaluated', 'All decomposition inputs are required', 'input'))
    return { data: null, diagnostics }
  }
  const noncoreWeight = 1 - input.coreWeight
  const coreBeta = input.coreWeight * input.coreReturn
  const noncoreBenchmarkBeta = noncoreWeight * input.noncoreBenchmarkReturn
  const selectionEffect = noncoreWeight * (input.noncoreReturn - input.noncoreBenchmarkReturn)
  const cashFxDrag = input.totalReturn - coreBeta - noncoreBenchmarkBeta - selectionEffect
  const reconciled = coreBeta + noncoreBenchmarkBeta + selectionEffect + cashFxDrag
  return {
    data: {
      coreBeta: round(coreBeta),
      noncoreBenchmarkBeta: round(noncoreBenchmarkBeta),
      selectionEffect: round(selectionEffect),
      cashFxDrag: round(cashFxDrag),
      totalReturn: round(input.totalReturn),
      reconciliationError: round(reconciled - input.totalReturn),
      units: 'return-fraction',
    },
    diagnostics,
  }
}

export function timeWeightedReturn(dailyValues, flows = {}) {
  if (!Array.isArray(dailyValues)) return null
  const byDate = new Map(dailyValues.filter((row) => typeof row?.date === 'string' && finite(row?.value)).map((row) => [row.date, row.value]))
  const rows = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
  if (rows.length < 2) return null
  let factor = 1
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1][1]
    if (previous === 0) continue
    const [date, value] = rows[index]
    factor *= (value - (flows[date] ?? 0)) / previous
  }
  return round(factor - 1)
}

function npv(rate, cashFlows, firstDate) {
  return cashFlows.reduce((sum, row) => {
    const days = (Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000
    return sum + row.amount / (1 + rate) ** (days / 365)
  }, 0)
}

export function moneyWeightedReturn(datedCashflows, endingValue, endingDate, { maxIterations = 200 } = {}) {
  const cashFlows = [...(datedCashflows ?? []), { date: endingDate, amount: endingValue }]
    .filter((row) => typeof row?.date === 'string' && finite(row?.amount))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (cashFlows.length < 2) return null
  const firstDate = cashFlows[0].date
  let low = -0.9999
  let high = 100
  let lowValue = npv(low, cashFlows, firstDate)
  let highValue = npv(high, cashFlows, firstDate)
  if (Math.sign(lowValue) === Math.sign(highValue)) return null
  for (let index = 0; index < maxIterations; index += 1) {
    const middle = (low + high) / 2
    const value = npv(middle, cashFlows, firstDate)
    if (value === 0) return round(middle)
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = middle
      lowValue = value
    } else {
      high = middle
      highValue = value
    }
  }
  return round((low + high) / 2)
}

export function portfolioMetrics({ equity = [], trades = [], exposures = [] }) {
  const diagnostics = []
  const values = equity.map((row) => row?.value)
  if (!values.every(finite)) diagnostics.push(diagnostic('equity_series_incomplete', 'unevaluated', 'Equity values are required', 'equity'))
  const turnoverNumerator = trades.every((row) => finite(row?.notional)) ? trades.reduce((sum, row) => sum + Math.abs(row.notional), 0) : null
  const averageEquity = values.length && values.every(finite) ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  const averageExposure = exposures.length && exposures.every(finite) ? exposures.reduce((sum, value) => sum + value, 0) / exposures.length : null
  let peak = equity[0] ?? null
  let worst = null
  for (const row of equity) {
    if (!finite(row?.value)) continue
    if (!peak || row.value > peak.value) peak = row
    const drawdown = peak.value > 0 ? row.value / peak.value - 1 : 0
    if (!worst || drawdown < worst.drawdown) worst = { drawdown, peakDate: peak.date, peakValue: peak.value, troughDate: row.date }
  }
  const recovered = worst ? equity.some((row) => row.date > worst.troughDate && row.value >= worst.peakValue) : null
  return {
    data: {
      maxDrawdown: values.every(finite) ? maxDrawdown(values) : null,
      maxDrawdownDetail: worst ? { value: round(worst.drawdown), peakDate: worst.peakDate, troughDate: worst.troughDate, recovered } : null,
      turnover: finite(turnoverNumerator) && averageEquity > 0 ? round(turnoverNumerator / averageEquity) : null,
      averageExposure: round(averageExposure),
      units: { maxDrawdown: 'return-fraction', turnover: 'nav-multiple', averageExposure: 'portfolio-weight' },
    },
    diagnostics,
  }
}
