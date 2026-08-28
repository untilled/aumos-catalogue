import { diagnostic, finite, round } from './diagnostics.mjs'
import { forwardOutcome } from './outcomes.mjs'

/**
 * ── The learning-acceleration layer (issue #70 §6, §10) ────────────────────
 *
 * The promotion gate wants 30 samples, 10 independent date clusters and 3
 * regimes. `evidence-gates` says a sample is a closed Decision with a forward
 * outcome. Both are right, and together they were a deadlock: the only thing
 * that could fill the gate was a real fill, real fills are capped at the
 * experimental ceiling, and reaching three regimes at that rate takes years.
 * The gate was decoration.
 *
 * The methodology this is ported from had already solved that, and the
 * solution is the part that did not come across. Its plan (approved
 * 2026-07-13) compressed the "is there an edge here?" verdict from years to
 * months **without adding a single won of real risk**, by four means: more
 * sample throughput, mechanical-component backtests, a shadow/paper attack
 * track, and pre-registered verdict criteria. Only the backtests arrived, and
 * half of the pre-registration.
 *
 * So: paper positions are registered and scored here, and they are kept in
 * their own cohort. That separation is the whole safety property — a paper
 * row has no fill, no cost and no slippage, so mixing it into the real sample
 * would let a hypothetical unlock real size. Nothing in this file promotes
 * anything; the outputs are evidence and proposals a person still approves.
 */

/**
 * The setups, and which cohort each belongs to.
 *
 * `thesis_call` is the LLM team's own forward research — the cohort whose
 * record decides whether the research layer earns size. The mechanical setups
 * are the baseline it is measured against: a dumb momentum bot and the
 * oversold scanners. Beating the index is not the bar; beating the index *and*
 * the bot is.
 */
const SETUP_COHORTS = {
  thesis_call: 'llm-research',
  thesis_watch: 'llm-research',
  thesis_rejected: 'llm-research',
  rs_leader_pullback: 'mechanical-baseline',
  rs_breakout: 'mechanical-baseline',
  mean_reversion: 'mechanical-baseline',
  trend_pullback: 'mechanical-baseline',
}

/**
 * The challenge verdict decides the setup, and there is exactly one mapping.
 *
 * A cleared thesis is a call. A conditional one is a watch. An unresolved
 * high risk is a rejection. Logging a conditional verdict as a call would put
 * an unchallenged idea into the cohort that unlocks size, which is the one
 * substitution this contract exists to refuse.
 */
const VERDICT_SETUP = {
  cleared: 'thesis_call',
  conditional_watch: 'thesis_watch',
  high_risk_unresolved: 'thesis_rejected',
}

const STALE_PROMOTE_WEEKDAYS = 2

/**
 * §6 pre-registration, approved 2026-07-13 — *before* the data existed.
 *
 * That is the point of writing them down: a verdict reached against criteria
 * chosen afterwards is not a verdict. `verdictReport` refuses a caller that
 * passes looser numbers than these, so the only direction a threshold can move
 * at run time is stricter.
 */
const PREREGISTERED = {
  source: 'learning-acceleration plan §6, approved 2026-07-13',
  horizon: 'd60',
  go: { minSamples: 20, minWinRatePct: 55, minAvgExcessPct: 2 },
  noGo: { minSamples: 20, maxWinRatePct: 50, maxAvgExcessPct: 0 },
  shadow: { minExcessVsRealPp: 3, minWindowDays: 60 },
  reviewReadyClosedOutcomes: 10,
}

function weekdaysBetween(fromDate, toDate) {
  let cursor = Date.parse(fromDate)
  const end = Date.parse(toDate)
  if (!Number.isFinite(cursor) || !Number.isFinite(end)) return null
  let days = 0
  while (cursor < end) {
    cursor += 86_400_000
    const weekday = new Date(cursor).getUTCDay()
    if (weekday >= 1 && weekday <= 5) days += 1
  }
  return days
}

/**
 * Admission to the paper log — cheap for the control group, expensive for the
 * cohort that can unlock sizing.
 *
 * A watch or a rejection is logged on the challenge verdict alone: the control
 * group is useful even when nobody ever finished writing the bull case, and
 * making it costly is how a control group quietly stops being recorded. Only
 * `thesis_call` pays the full evidence price, because only `thesis_call` is
 * the sample the size argument will be built from.
 *
 * ⛔ A promote is refused when the price history is stale by more than two
 * weekdays. A forward record measured from a price nobody refreshed is a
 * measurement of the pipeline, not of the idea, and it would be indistinguishable
 * from the real thing once written.
 */
export function paperAdmission({ setup, challengeVerdict, thesis = {}, priceHistoryLatestDate = null, asOf } = {}) {
  const diagnostics = []
  if (!SETUP_COHORTS[setup]) {
    diagnostics.push(diagnostic('paper_setup_unknown', 'blocked', 'A paper row must name a published setup', 'setup', { setup, supported: Object.keys(SETUP_COHORTS) }))
    return { data: { admitted: false, setup: setup ?? null, cohort: null, disposition: null }, diagnostics }
  }
  const cohort = SETUP_COHORTS[setup]
  const humanReviewed = cohort === 'llm-research'
  if (humanReviewed && !challengeVerdict) {
    diagnostics.push(diagnostic('challenge_verdict_required', 'blocked', 'A human-reviewed paper row records the verdict that produced it', 'challengeVerdict'))
  }
  const expected = VERDICT_SETUP[challengeVerdict]
  if (expected && expected !== setup) {
    diagnostics.push(diagnostic('paper_setup_mismatch', 'blocked', 'The challenge verdict decides the setup; a conditional verdict is a watch, not a call', 'setup', { challengeVerdict, expected, setup }))
  }
  if (setup === 'thesis_call') {
    if (challengeVerdict !== 'cleared') {
      diagnostics.push(diagnostic('call_requires_cleared_challenge', 'blocked', 'Only a cleared challenge becomes a call; the rest are watch or rejected', 'challengeVerdict'))
    }
    if (thesis?.evidenceStatus !== 'complete') {
      diagnostics.push(diagnostic('call_thesis_incomplete', 'blocked', 'A call needs a complete thesis — expected upside, fair value, consensus refs, catalysts and invalidation', 'thesis.evidenceStatus', { evidenceStatus: thesis?.evidenceStatus ?? null }))
    }
    if (thesis?.asset && thesis.asset !== (thesis?.symbol ?? thesis.asset)) {
      diagnostics.push(diagnostic('call_thesis_symbol_mismatch', 'blocked', 'The thesis and the paper row must name the same asset', 'thesis.asset'))
    }
    const staleWeekdays = priceHistoryLatestDate && typeof asOf === 'string' ? weekdaysBetween(priceHistoryLatestDate, asOf.slice(0, 10)) : null
    if (staleWeekdays === null) {
      diagnostics.push(diagnostic('call_price_history_missing', 'blocked', 'Without a price history there is no base to measure the forward record from', 'priceHistoryLatestDate'))
    } else if (staleWeekdays > STALE_PROMOTE_WEEKDAYS) {
      diagnostics.push(diagnostic('data_pipeline_stale', 'blocked', 'Price history is stale; a forward record started here would measure the pipeline, not the idea', 'priceHistoryLatestDate', { staleWeekdays, allowed: STALE_PROMOTE_WEEKDAYS }))
    }
  }
  const admitted = !diagnostics.some((row) => row.severity === 'blocked')
  const disposition = !admitted ? null : setup === 'thesis_call' ? 'promote' : setup === 'thesis_watch' ? 'watch' : setup === 'thesis_rejected' ? 'rejected' : 'baseline'
  return { data: { admitted, setup, cohort, disposition, tradeable: false }, diagnostics }
}

/**
 * Forward scoring of the paper log, aggregated per setup and per cohort.
 *
 * ⛔ `cohortsAreSeparate` is not decoration. A paper row has no fill, no cost
 * and no slippage; folding it into the real closed-decision sample would let a
 * hypothetical unlock real size, which is exactly the failure this whole layer
 * is built to avoid. Real samples do not enter here and paper samples do not
 * leave.
 *
 * `relativeOnly` marks the trap the original found and named: a bucket whose
 * average excess is positive while its average absolute return is negative.
 * It beat the benchmark by falling less, and reading that as an edge is how a
 * long-only book talks itself into losing money on purpose.
 */
export function signalPaper({ rows = [], horizons = [5, 20, 60], asOf } = {}) {
  const diagnostics = []
  const scored = []
  for (const [index, row] of rows.entries()) {
    if (!SETUP_COHORTS[row?.setup]) {
      diagnostics.push(diagnostic('paper_setup_unknown', 'blocked', 'Every paper row names a published setup', `rows[${index}].setup`, { setup: row?.setup ?? null }))
      continue
    }
    if (row?.ruleVersion === undefined || row?.ruleVersion === null) {
      diagnostics.push(diagnostic('paper_rule_version_missing', 'blocked', 'A paper row carries the rule version it was judged under; rows from different versions are never pooled', `rows[${index}].ruleVersion`))
      continue
    }
    const outcome = forwardOutcome({ bars: row.bars ?? [], benchmarkBars: row.benchmarkBars ?? [], sectorBars: row.sectorBars ?? [], signalAt: row.signalAt, horizons })
    diagnostics.push(...outcome.diagnostics.map((entry) => ({ ...entry, path: `rows[${index}].${entry.path ?? 'bars'}` })))
    scored.push({
      symbol: row.symbol ?? null,
      setup: row.setup,
      cohort: SETUP_COHORTS[row.setup],
      ruleVersion: row.ruleVersion,
      signalAt: row.signalAt ?? null,
      forward: outcome.data.forward,
      excursion: outcome.data.excursion,
      tradeable: false,
    })
  }

  const bucket = () => ({ samples: 0, sumExcess: 0, sumReturn: 0, wins: 0, absoluteWins: 0, absoluteSamples: 0 })
  const summarize = (map) => Object.fromEntries([...map].map(([key, horizonMap]) => [key, Object.fromEntries([...horizonMap].map(([horizon, stats]) => {
    const avgExcessPct = stats.samples ? round(stats.sumExcess / stats.samples, 3) : null
    const avgReturnPct = stats.absoluteSamples ? round(stats.sumReturn / stats.absoluteSamples, 3) : null
    return [horizon, {
      samples: stats.samples,
      avgExcessPct,
      winRatePct: stats.samples ? round(stats.wins / stats.samples * 100, 2) : null,
      avgReturnPct,
      absoluteWinRatePct: stats.absoluteSamples ? round(stats.absoluteWins / stats.absoluteSamples * 100, 2) : null,
      relativeOnly: finite(avgExcessPct) && finite(avgReturnPct) && avgExcessPct > 0 && avgReturnPct < 0,
    }]
  }))]))

  const bySetup = new Map()
  const byCohort = new Map()
  for (const entry of scored) {
    for (const horizon of horizons) {
      const forward = entry.forward[`d${horizon}`]
      if (!forward || !finite(forward.benchmarkExcessPct)) continue
      for (const [map, key] of [[bySetup, entry.setup], [byCohort, entry.cohort]]) {
        if (!map.has(key)) map.set(key, new Map())
        const horizonMap = map.get(key)
        if (!horizonMap.has(`d${horizon}`)) horizonMap.set(`d${horizon}`, bucket())
        const stats = horizonMap.get(`d${horizon}`)
        stats.samples += 1
        stats.sumExcess += forward.benchmarkExcessPct
        if (forward.benchmarkExcessPct > 0) stats.wins += 1
        if (finite(forward.returnPct)) {
          stats.absoluteSamples += 1
          stats.sumReturn += forward.returnPct
          if (forward.returnPct > 0) stats.absoluteWins += 1
        }
      }
    }
  }
  const versions = [...new Set(scored.map((entry) => entry.ruleVersion))]
  if (versions.length > 1) {
    diagnostics.push(diagnostic('paper_rule_versions_mixed', 'unevaluated', 'Rows judged under different rule versions are reported together but must not be pooled into one verdict', 'rows', { versions }))
  }
  return {
    data: {
      rows: scored,
      bySetup: summarize(bySetup),
      byCohort: summarize(byCohort),
      ruleVersions: versions,
      cohortsAreSeparate: true,
      sampleKind: 'paper-only-never-mixed-with-closed-decisions',
      asOf: asOf ?? null,
    },
    diagnostics,
  }
}

/**
 * Two curves from the same decisions, differing only in size.
 *
 * If the shadow book — same signals, unconstrained sizing — is materially
 * ahead of the real one over a full quarter, the constraint that is costing
 * return is the position cap and not the research. That is a quantified
 * argument for raising a cap, which is why the threshold and the window were
 * pre-registered: without a minimum window a good fortnight becomes an
 * argument for more size.
 */
export function shadowTrack({ shadowReturnPct, realReturnPct, windowDays, thresholds = {} } = {}) {
  const diagnostics = []
  const minExcess = finite(thresholds.minExcessVsRealPp) ? Math.max(thresholds.minExcessVsRealPp, PREREGISTERED.shadow.minExcessVsRealPp) : PREREGISTERED.shadow.minExcessVsRealPp
  const minWindow = finite(thresholds.minWindowDays) ? Math.max(thresholds.minWindowDays, PREREGISTERED.shadow.minWindowDays) : PREREGISTERED.shadow.minWindowDays
  if (![shadowReturnPct, realReturnPct].every(finite)) {
    diagnostics.push(diagnostic('shadow_comparison_unevaluated', 'unevaluated', 'Both the shadow and the real curve are required', 'shadowReturnPct'))
    return { data: { excessPp: null, sizingBottleneck: null, windowMature: null }, diagnostics }
  }
  const excessPp = round(shadowReturnPct - realReturnPct, 3)
  const windowMature = finite(windowDays) && windowDays >= minWindow
  if (!windowMature) diagnostics.push(diagnostic('shadow_window_immature', 'unevaluated', 'The comparison window has not reached its pre-registered minimum; a good fortnight is not an argument for size', 'windowDays', { windowDays: windowDays ?? null, minWindow }))
  const sizingBottleneck = windowMature && excessPp >= minExcess
  if (sizingBottleneck) {
    diagnostics.push(diagnostic('shadow_sizing_bottleneck', 'info', 'Same decisions, larger size, materially better result over a full window — the cap is what is costing return', 'shadowReturnPct', { excessPp, minExcess, windowDays }))
  }
  return { data: { excessPp, sizingBottleneck, windowMature, thresholds: { minExcessVsRealPp: minExcess, minWindowDays: minWindow } }, diagnostics }
}

/**
 * The passive baseline — what doing nothing would have returned.
 *
 * Every other measurement here compares one active choice with another. This
 * one asks the question the book can lose to quietly: would buying the index
 * and waiting have done better? A methodology that cannot beat that is working
 * exactly as designed and still not worth running.
 */
export function baselineTrack({ portfolioReturnPct, baselines = [] } = {}) {
  const diagnostics = []
  if (!finite(portfolioReturnPct)) {
    diagnostics.push(diagnostic('baseline_portfolio_unevaluated', 'unevaluated', 'The portfolio return is required', 'portfolioReturnPct'))
    return { data: { comparisons: [], beatsEveryBaseline: null }, diagnostics }
  }
  const comparisons = []
  for (const [index, baseline] of baselines.entries()) {
    if (!finite(baseline?.returnPct)) {
      diagnostics.push(diagnostic('baseline_return_unevaluated', 'unevaluated', 'A baseline without a return is unread, never assumed to be behind', `baselines[${index}].returnPct`, { key: baseline?.key ?? null }))
      continue
    }
    comparisons.push({ key: baseline.key ?? null, kind: baseline.kind ?? 'passive', returnPct: round(baseline.returnPct, 3), excessPp: round(portfolioReturnPct - baseline.returnPct, 3), ahead: portfolioReturnPct > baseline.returnPct })
  }
  const beatsEveryBaseline = comparisons.length ? comparisons.every((row) => row.ahead) : null
  if (comparisons.length && !beatsEveryBaseline) {
    diagnostics.push(diagnostic('baseline_not_beaten', 'info', 'A baseline is ahead of the book; the methodology has to answer for that before it argues for size', 'baselines', { behind: comparisons.filter((row) => !row.ahead).map((row) => row.key) }))
  }
  return { data: { portfolioReturnPct: round(portfolioReturnPct, 3), comparisons, beatsEveryBaseline }, diagnostics }
}

/**
 * The §6 verdict, against criteria chosen before the data existed.
 *
 * ⛔ **A threshold may only be tightened here.** Passing a looser number is
 * refused rather than honoured — a verdict reached against criteria adjusted
 * after seeing the result is not a verdict, and the pre-registration exists to
 * make that impossible rather than merely discouraged.
 *
 * `borderline` is a real answer and stays one. Some of the criteria met is
 * not a GO, and relaxing the rest to reach one is the move the pre-registration
 * was written to block.
 *
 * ⚠️ And a `GO` is not a size increase. It says the research cohort looks like
 * a candidate for an edge; the cap change is a separate proposal that a person
 * approves, and `promotionGate` still has to pass on its own terms.
 */
export function verdictReport({ paper = {}, shadow = {}, baseline = {}, closedOutcomeCount = 0, thresholds = {}, asOf } = {}) {
  const diagnostics = []
  const go = { ...PREREGISTERED.go }
  const noGo = { ...PREREGISTERED.noGo }
  for (const [key, value] of Object.entries(thresholds.go ?? {})) {
    if (!finite(value)) continue
    if (value < PREREGISTERED.go[key]) {
      diagnostics.push(diagnostic('prereg_relaxed', 'blocked', 'A pre-registered criterion may be tightened, never loosened; a verdict against adjusted criteria is not a verdict', `thresholds.go.${key}`, { pre: PREREGISTERED.go[key], requested: value }))
    } else go[key] = value
  }
  const stats = paper?.[`d${60}`] ?? paper.d60 ?? null
  let verdict
  let meaning
  if (!stats || !finite(stats.avgExcessPct) || !Number.isInteger(stats.samples)) {
    verdict = 'unevaluated'
    meaning = 'The research cohort has no scored d60 window yet'
    diagnostics.push(diagnostic('verdict_sample_missing', 'unevaluated', 'The verdict needs a scored d60 cohort', 'paper'))
  } else if (stats.samples < go.minSamples) {
    verdict = 'insufficient_sample'
    meaning = 'Too few matured windows to judge; the answer is throughput, not a looser threshold'
  } else if (stats.winRatePct >= go.minWinRatePct && stats.avgExcessPct >= go.minAvgExcessPct) {
    verdict = 'GO'
    meaning = 'The research cohort looks like an edge candidate — a cap-increase proposal may now be put to the investor'
  } else if (stats.winRatePct < noGo.maxWinRatePct || stats.avgExcessPct <= noGo.maxAvgExcessPct) {
    verdict = 'NO_GO'
    meaning = 'No edge in this cohort — freezing new non-core experiments and accepting index plus carry is the correct outcome, not a failure'
  } else {
    verdict = 'borderline'
    meaning = 'Some criteria met and not others; judgement is deferred to the next verdict date and the thresholds are not relaxed to reach one'
  }

  /**
   * §10, the user directive of 2026-07-15: the gates exist to *earn size with
   * proof*, not to avoid risk forever — so when the evidence supports it, the
   * increase is proposed without being asked. Before this, failure produced
   * rule proposals and success produced nothing, and a manager that can only
   * ever argue itself smaller is not being careful, it is being useless.
   */
  const proposals = []
  if (verdict === 'GO') {
    proposals.push({ kind: 'cap-increase-review', because: 'thesis-call cohort met the pre-registered GO criteria', evidence: { samples: stats.samples, winRatePct: stats.winRatePct, avgExcessPct: stats.avgExcessPct }, requiresApproval: true })
    if (stats.relativeOnly) {
      diagnostics.push(diagnostic('go_is_relative_only', 'unevaluated', 'The cohort beat the benchmark while losing money in absolute terms; the GO is carried with that caveat attached', 'paper', { avgReturnPct: stats.avgReturnPct }))
    }
  }
  if (verdict === 'NO_GO') {
    proposals.push({ kind: 'freeze-new-experiments', because: 'the pre-registered NO-GO criteria were met', requiresApproval: true })
  }
  if (shadow?.sizingBottleneck) {
    proposals.push({ kind: 'cap-increase-review', because: 'the shadow book beat the real one on identical decisions over a full window; the cap is the constraint', evidence: { excessPp: shadow.excessPp }, requiresApproval: true })
  }
  if (closedOutcomeCount >= PREREGISTERED.reviewReadyClosedOutcomes) {
    proposals.push({ kind: 'cap-review-session', because: `${closedOutcomeCount} closed outcomes are enough to revisit the caps with evidence`, requiresApproval: true })
  }
  if (baseline?.beatsEveryBaseline === false) {
    proposals.push({ kind: 'answer-the-baseline', because: 'a passive baseline is ahead of the book', requiresApproval: true })
  }
  if (proposals.length) {
    diagnostics.push(diagnostic('threshold_reached_proposal', 'info', 'Evidence reached a pre-registered threshold; the proposal is surfaced without being asked and still requires approval', 'paper', { kinds: [...new Set(proposals.map((row) => row.kind))] }))
  }
  return {
    data: {
      verdict,
      meaning,
      horizon: PREREGISTERED.horizon,
      criteria: { go, noGo, source: PREREGISTERED.source },
      stats: stats ?? null,
      proposals,
      changesNothingAutomatically: true,
      asOf: asOf ?? null,
    },
    diagnostics,
  }
}
