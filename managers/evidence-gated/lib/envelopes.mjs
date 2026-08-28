import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── Declared thresholds, and the drift they exist to catch (issue #70 §12) ─
 *
 * The numbers a methodology is made of lived in `data/*.json` in the original —
 * lens envelopes, entry gates, exit rules, policy hurdles — and the migration
 * matrix inventoried only `bin/`. So the executables were ported with their
 * dispositions recorded and **the contract files every one of them reads were
 * out of scope**: not ported, and not recorded as unported either.
 *
 * This module is where the declared numbers live now.
 *
 * ── One source, not two ────────────────────────────────────────────────────
 *
 * The original declared the lens envelopes in `lens_definitions.json` as a
 * deliberate **copy** of the scanner's hardcoded constants, and ran a
 * `--check-drift` pass that blocked with `LENS_DRIFT` when the two disagreed.
 * That is the right shape for a Python tree where the scanner cannot import the
 * declaration.
 *
 * Here it can, so the declaration below is the only copy and `scanners.mjs`
 * reads it. Drift between two copies is not prevented, it is made impossible —
 * a strictly better outcome than detecting it. What the verifier keeps is the
 * property the drift check was protecting: the scanner's behaviour is tested at
 * the declared boundaries, so a constant edited into the code without the
 * declaration moving fails immediately.
 */
export const LENS_ENVELOPES = {
  'mean-reversion': {
    label: 'Deep dislocation',
    firesWhen: 'at-least-two-signals',
    signals: {
      rsiOversold: { metric: 'rsi14', op: 'lt', value: 30 },
      nearLow: { metric: 'aboveLow200', op: 'lte', value: 0.05 },
      ma200Discount: { metric: 'ma200Distance', op: 'lte', value: -0.1 },
      ma60Discount: { metric: 'ma60Distance', op: 'lte', value: -0.07 },
      volumeCapitulation: { metric: 'volumeSpikeStabilized', op: 'eq', value: true },
    },
    /**
     * Depth has no floor here, so any drawdown-based revisit trigger is
     * reachable: the lens keeps producing candidates however far price falls.
     */
    reachable: { offHigh200: { min: -1, max: 0 }, rsi14: { min: 0, max: 100 } },
  },
  'trend-pullback': {
    label: 'Shallow pullback inside an intact uptrend',
    firesWhen: 'all-conditions',
    checks: {
      uptrend: { description: 'close above MA200 and MA50 above MA200' },
      pullback: { metric: 'offHigh200', min: -0.2, max: -0.05 },
      healthyRsi: { metric: 'rsi14', min: 35, max: 55 },
      notExtended: { metric: 'ma200Distance', op: 'lte', value: 0.4 },
    },
    /**
     * ⚠️ The shallowness is the definition, not a shortcoming — so "revisit at
     * 20% off the high" names the point where this lens *stops producing
     * candidates*. A trigger there is unreachable and never comes back through
     * this lens, which is why reachability is judged rather than described.
     */
    reachable: { offHigh200: { min: -0.2, max: -0.05 }, rsi14: { min: 35, max: 55 }, ma200Distance: { min: 0, max: 0.4 } },
  },
  'quality-pullback': {
    label: 'Quality marked down while the trend holds',
    firesWhen: 'all-conditions',
    checks: {
      aboveMa200: { description: 'close above MA200' },
      deepPullback: { metric: 'offHigh200', min: -0.35, max: -0.15 },
      rsiBand: { metric: 'rsi14', min: 30, max: 50 },
    },
    reachable: { offHigh200: { min: -0.35, max: -0.15 }, rsi14: { min: 30, max: 50 } },
  },
}

/**
 * Is this revisit trigger reachable inside the lens that created it?
 *
 * `sizing-and-concentration` and `candidate-research` both say the trigger must
 * be reachable, and neither could check it. A trigger outside its lens's
 * envelope is a promise the book will never keep: the condition can only become
 * true somewhere the lens no longer looks.
 */
export function lensEnvelope({ lens, triggers = [] } = {}) {
  const diagnostics = []
  const envelope = LENS_ENVELOPES[lens]
  if (!envelope) {
    diagnostics.push(diagnostic('lens_envelope_unknown', 'unevaluated', 'No numeric envelope is declared for this lens; reachability cannot be judged', 'lens', { lens: lens ?? null, declared: Object.keys(LENS_ENVELOPES) }))
    return { data: { lens: lens ?? null, envelope: null, triggers: [] }, diagnostics }
  }
  const judged = []
  for (const [index, trigger] of triggers.entries()) {
    const bound = envelope.reachable[trigger?.metric]
    if (!bound) {
      judged.push({ ...trigger, reachable: null, reason: 'metric-not-in-declared-envelope' })
      diagnostics.push(diagnostic('trigger_metric_undeclared', 'unevaluated', 'This lens declares no range for that metric, so reachability is unknown rather than assumed', `triggers[${index}].metric`, { metric: trigger?.metric ?? null }))
      continue
    }
    if (!finite(trigger?.level)) {
      judged.push({ ...trigger, reachable: null, reason: 'level-missing' })
      diagnostics.push(diagnostic('trigger_level_missing', 'blocked', 'A revisit trigger needs a numeric level', `triggers[${index}].level`))
      continue
    }
    const reachable = trigger.level >= bound.min && trigger.level <= bound.max
    judged.push({ ...trigger, reachable, bound, reason: reachable ? 'inside-the-envelope' : 'outside-the-lens-that-created-it' })
    if (!reachable) {
      diagnostics.push(diagnostic('trigger_unreachable', 'blocked', 'The trigger sits where this lens stops producing candidates; the book would never come back through it', `triggers[${index}].level`, { metric: trigger.metric, level: trigger.level, bound }))
    }
  }
  return { data: { lens, envelope, triggers: judged, allReachable: judged.every((row) => row.reachable !== false) }, diagnostics }
}

/**
 * A correlated event cluster, and the promotion that waits for it.
 *
 * A binary event that decides a thesis is not risk to size around, it is risk
 * to wait out — and when several holdings share one event, sizing each on its
 * own merits concentrates the book into a single print without anyone deciding
 * to. The original registered the block on the gate itself and set its end date
 * by a stated rule: **the day after the last print**, not the day of it.
 *
 * The scope is narrow on purpose: it blocks promotion to order-ready, and
 * leaves WATCH, paper registration and post-cluster entry alone. A block that
 * stopped the research would lose the window it exists to protect.
 */
export function clusterBlock({ clusters = [], intent = 'promote-to-ready', asOf } = {}) {
  const diagnostics = []
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : null
  const active = []
  for (const [index, cluster] of clusters.entries()) {
    const prints = (cluster?.prints ?? []).map((row) => String(row?.at ?? row).slice(0, 10)).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row)).sort()
    const declared = cluster?.blockUntil ? String(cluster.blockUntil).slice(0, 10) : null
    /**
     * The end date is derived from the prints rather than trusted, because a
     * copied date is the failure the original recorded: a block whose window
     * had been pasted from a sibling gate ended a day before its own last
     * print.
     */
    const derived = prints.length ? new Date(Date.parse(prints.at(-1)) + 86_400_000).toISOString().slice(0, 10) : null
    if (declared && derived && declared !== derived) {
      diagnostics.push(diagnostic('cluster_block_until_mismatch', 'blocked', 'The block ends on a date other than the day after its own last print; a window copied from another cluster ends early', `clusters[${index}].blockUntil`, { declared, derived, lastPrint: prints.at(-1) }))
    }
    const until = derived ?? declared
    if (!until) {
      diagnostics.push(diagnostic('cluster_block_undated', 'unevaluated', 'A cluster with neither prints nor an end date cannot be waited out', `clusters[${index}]`))
      continue
    }
    if (today && today < until) active.push({ name: cluster?.name ?? null, blockUntil: until, prints, reason: cluster?.reason ?? null })
  }
  const blocksThisIntent = intent === 'promote-to-ready'
  if (active.length && blocksThisIntent) {
    diagnostics.push(diagnostic('cluster_block_active', 'blocked', 'A correlated event cluster decides this thesis before the market does; promotion waits for the print rather than sizing around it', 'clusters', { active: active.map((row) => row.name), until: active.map((row) => row.blockUntil).sort().at(-1) }))
  } else if (active.length) {
    diagnostics.push(diagnostic('cluster_block_scope', 'info', 'A cluster is active but this intent is outside its scope; research, WATCH and paper registration continue', 'intent', { intent, active: active.map((row) => row.name) }))
  }
  return { data: { active, blocked: Boolean(active.length && blocksThisIntent), intent, scope: 'promotion-to-order-ready-only', clearAfter: active.map((row) => row.blockUntil).sort().at(-1) ?? null }, diagnostics }
}

/**
 * The time stop, in full (approved 2026-07-08).
 *
 * `exitCheck` already raises a `time_stop` when the review date arrives and the
 * position never got above entry, which is the narrow price proxy the exit
 * rules could compute. The approved rule is a different and better test: at the
 * review date, a single name whose **catalyst never happened** and which
 * **trailed its benchmark over the same period** is promoted to an exit
 * candidate rather than having its review date pushed out.
 *
 * Both halves matter. Trailing the benchmark while the catalyst is still ahead
 * is a thesis that has not been tested yet. A catalyst that passed without
 * effect while the position still beat its benchmark is a thesis that was wrong
 * about the mechanism and right about the asset. Only both together say the
 * position had its window and did not use it.
 *
 * Core ETFs and parked liquidity are out of scope: their reason for being held
 * is allocation, and no catalyst was ever claimed for them.
 */
export function timeStopPolicy({ positions = [], asOf } = {}) {
  const diagnostics = []
  const today = typeof asOf === 'string' ? asOf.slice(0, 10) : null
  const verdicts = []
  for (const [index, position] of positions.entries()) {
    const at = `positions[${index}]`
    if (position?.core === true || position?.parkedLiquidity === true) {
      verdicts.push({ symbol: position?.symbol ?? null, verdict: 'out-of-scope', reason: 'allocation-holding-claims-no-catalyst' })
      continue
    }
    const due = position?.reviewBy ? String(position.reviewBy).slice(0, 10) : null
    if (!due || !today || today < due) {
      verdicts.push({ symbol: position?.symbol ?? null, verdict: 'not-due', reviewBy: due })
      continue
    }
    const catalystRealized = position?.catalystRealized
    const excessPct = finite(position?.returnSinceEntryPct) && finite(position?.benchmarkReturnSinceEntryPct)
      ? round(position.returnSinceEntryPct - position.benchmarkReturnSinceEntryPct, 3)
      : null
    if (catalystRealized === undefined || catalystRealized === null || excessPct === null) {
      verdicts.push({ symbol: position?.symbol ?? null, verdict: 'unevaluated', reviewBy: due, catalystRealized: catalystRealized ?? null, excessPct })
      diagnostics.push(diagnostic('time_stop_unevaluated', 'unevaluated', 'The review date arrived but the catalyst outcome or the benchmark comparison is missing; the promotion is unresolved rather than declined', at, { symbol: position?.symbol ?? null }))
      continue
    }
    if (catalystRealized === false && excessPct < 0) {
      verdicts.push({ symbol: position.symbol, verdict: 'exit-candidate', reviewBy: due, catalystRealized, excessPct })
      diagnostics.push(diagnostic('time_stop_exit_candidate', 'unevaluated', 'The review date arrived with the catalyst unrealized and the position behind its benchmark; the review date is not extended', at, { symbol: position.symbol, excessPct }))
    } else {
      verdicts.push({
        symbol: position.symbol,
        verdict: 'review',
        reviewBy: due,
        catalystRealized,
        excessPct,
        reason: catalystRealized ? 'catalyst-happened-so-the-thesis-was-tested' : 'still-ahead-of-the-benchmark',
      })
    }
  }
  return { data: { verdicts, exitCandidates: verdicts.filter((row) => row.verdict === 'exit-candidate').map((row) => row.symbol) }, diagnostics }
}

/**
 * The eleven versioned axes, as a registry rather than a field on a row.
 *
 * A rule version written only on the rows it produced cannot answer the two
 * questions it exists for: which version is current for an axis, and whether a
 * comparison is mixing versions. Declaring the axes makes both mechanical, and
 * makes the third rule enforceable — **a judgement definition changes by
 * incrementing its axis, never by re-tagging rows already recorded under the
 * old one.**
 */
const RULE_VERSION_AXES = [
  'signal_paper', 'exit_signal_paper', 'upside_radar', 'triage', 'exit_tracking',
  'promotion_gate', 'thesis_invalidation', 'entry_quality', 'benchmark_expectation',
  'lens_envelope', 'cluster_block',
]

export function ruleVersions({ registry = {}, rows = [], axis = null } = {}) {
  const diagnostics = []
  const declared = {}
  for (const name of RULE_VERSION_AXES) {
    const entry = registry[name]
    if (!entry?.version) {
      diagnostics.push(diagnostic('rule_axis_undeclared', 'unevaluated', 'A versioned axis has no current version declared; a comparison cannot know what it is comparing', `registry.${name}`))
      continue
    }
    declared[name] = { version: entry.version, since: entry.since ?? null, supersedes: entry.supersedes ?? null }
  }
  for (const name of Object.keys(registry)) {
    if (!RULE_VERSION_AXES.includes(name)) {
      diagnostics.push(diagnostic('rule_axis_unknown', 'blocked', 'A version axis outside the published set would version something nothing reads', `registry.${name}`, { axis: name, supported: RULE_VERSION_AXES })) 
    }
  }
  const versionsInRows = [...new Set(rows.map((row) => row?.ruleVersion).filter(Boolean))]
  if (versionsInRows.length > 1) {
    diagnostics.push(diagnostic('rule_versions_mixed', 'blocked', 'These rows were judged under different versions of the same axis and cannot be pooled; a definition change increments the axis, it does not re-tag what is already recorded', 'rows', { axis, versions: versionsInRows }))
  }
  const current = axis ? declared[axis]?.version ?? null : null
  const stale = current ? versionsInRows.filter((version) => version !== current) : []
  if (stale.length) {
    diagnostics.push(diagnostic('rule_version_superseded', 'unevaluated', 'Rows carry a superseded version of this axis; they stay valid on their own terms and are counted separately', 'rows', { axis, current, stale }))
  }
  return { data: { axes: RULE_VERSION_AXES, declared, versionsInRows, current, stale, poolable: versionsInRows.length <= 1 }, diagnostics }
}
