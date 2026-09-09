import { METHODOLOGY, RECOVERY_CHANNELS } from './constants.mjs'
import { cause, diagnostic, finite, instantOf, round } from './diagnostics.mjs'

/**
 * ── Is the business actually recovering, measured at two points in time ────
 *
 * #258's 필수 산출물 asks for «회복 지표의 시점별 비교» — the recovery indicators
 * compared *between points in time* — and then for the link from those
 * indicators to cash flow. Two things make that harder than subtracting one
 * number from another, and both are why this is code:
 *
 *   ⑴ **The two instants an accounting number has.** A figure covers a period
 *      (`periodEnd`) and becomes public later (`publishedAt`). A comparison
 *      built on period ends alone reads a figure the market had not seen, so
 *      every observation carries both and anything published after `asOf` is
 *      dropped — loudly, because a silently shorter series still produces a
 *      delta.
 *
 *   ⑵ **Offsetting effects, counted twice.** In a 가스공사-shaped case the
 *      receivable balance, the regulated tariff, the import cost and the
 *      overseas result all move, and some of them move *because* the others
 *      did. A falling receivable balance and the interest it stops accruing are
 *      one improvement written down twice. So an indicator declares its
 *      `channel`, a channel counts once, and an indicator that declares itself
 *      `derivedFrom` another channel does not add a second channel while its
 *      parent is already counted.
 *
 * ⛔ **A reversal is only a refutation when the thesis said it would be.** An
 * indicator marked `invalidationChannel` is one the thesis named in advance as
 * a business invalidation condition; that one reversing is `thesis_refuted`.
 * Everything else that worsens is uncertainty, and #254's rule holds: absence
 * and adverse movement are not the same finding, and neither is a refutation
 * unless it was declared as one before it happened.
 *
 * ⚠️ **Nothing here is derived from `evidence-gated`.** That package's
 * `fundamentals-feed`/`valuation` modules answer a different question (is this
 * cheap against its own history) and share no arithmetic with this one.
 */

const DIRECTIONS = Object.freeze(['up-is-better', 'down-is-better'])

function usableObservations(indicator, asOfInstant, diagnostics, where) {
  const rows = []
  for (const [index, observation] of (indicator?.observations ?? []).entries()) {
    const periodEnd = instantOf(observation?.periodEnd)
    const publishedAt = instantOf(observation?.publishedAt)
    if (periodEnd === null || publishedAt === null) {
      diagnostics.push(
        diagnostic('observation_instants_missing', 'blocked', 'An observation carries the period it covers and the instant it became public; one of the two is not a point in time', `${where}.observations[${index}]`),
      )
      continue
    }
    if (!finite(observation?.value)) {
      diagnostics.push(diagnostic('observation_value_missing', 'blocked', 'An observation carries a number', `${where}.observations[${index}].value`))
      continue
    }
    if (publishedAt > asOfInstant) {
      diagnostics.push(
        diagnostic('observation_after_as_of', 'note', 'This figure had not been published at asOf and is excluded from the comparison. It is dropped rather than ignored, because a shorter series still produces a delta and nothing would have said which one', `${where}.observations[${index}]`, {
          publishedAt: observation.publishedAt,
        }),
      )
      continue
    }
    rows.push({
      periodEndEpochMs: periodEnd,
      publishedAtEpochMs: publishedAt,
      value: observation.value,
      evidenceIds: Array.isArray(observation?.evidenceIds) ? observation.evidenceIds : [],
    })
  }
  return rows.sort((left, right) => left.periodEndEpochMs - right.periodEndEpochMs)
}

/**
 * One row per indicator, plus the channel fold the entry gate actually reads.
 */
export function recoveryComparison({ indicators = [], asOf } = {}) {
  const diagnostics = []
  const causes = []
  const asOfInstant = instantOf(asOf)
  if (asOfInstant === null) {
    diagnostics.push(diagnostic('as_of_unreadable', 'blocked', 'The comparison is pinned to asOf', 'asOf'))
    return { data: { rows: [], improvingChannels: [], reversedChannels: [], cashFlowLinked: false }, diagnostics, causes }
  }

  const rows = []
  for (const [index, indicator] of indicators.entries()) {
    const where = `indicators[${indicator?.name ?? index}]`
    if (!RECOVERY_CHANNELS.includes(indicator?.channel)) {
      diagnostics.push(
        diagnostic('recovery_channel_unknown', 'blocked', 'Every recovery indicator names one of the registered channels; that name is what stops two views of one fact being counted as two facts', `${where}.channel`, {
          channel: indicator?.channel ?? null,
          registered: RECOVERY_CHANNELS,
        }),
      )
      continue
    }
    if (!DIRECTIONS.includes(indicator?.direction)) {
      diagnostics.push(diagnostic('recovery_direction_unknown', 'blocked', 'An indicator says which way is better before it is read', `${where}.direction`))
      continue
    }
    const observations = usableObservations(indicator, asOfInstant, diagnostics, where)
    if (observations.length < 2) {
      causes.push(
        cause('research_incomplete', `${indicator.name} has fewer than two observations that existed at asOf, so there is no comparison between points in time — which is a gap in the research and not a finding about the company`, where, {
          usable: observations.length,
        }),
      )
      rows.push({
        name: indicator.name ?? null,
        channel: indicator.channel,
        direction: indicator.direction,
        unit: indicator.unit ?? null,
        latest: observations.at(-1) ?? null,
        prior: null,
        delta: null,
        improving: null,
        comparable: false,
        derivedFrom: indicator.derivedFrom ?? null,
        invalidationChannel: indicator.invalidationChannel === true,
        linksToCashFlow: indicator.linksToCashFlow === true,
      })
      continue
    }
    const latest = observations.at(-1)
    const prior = observations.at(-2)
    const delta = round(latest.value - prior.value)
    const improving = indicator.direction === 'up-is-better' ? delta > 0 : delta < 0
    rows.push({
      name: indicator.name ?? null,
      channel: indicator.channel,
      direction: indicator.direction,
      unit: indicator.unit ?? null,
      latest,
      prior,
      delta,
      deltaPct: prior.value === 0 ? null : round(delta / Math.abs(prior.value)),
      improving,
      comparable: true,
      derivedFrom: RECOVERY_CHANNELS.includes(indicator.derivedFrom) ? indicator.derivedFrom : null,
      invalidationChannel: indicator.invalidationChannel === true,
      linksToCashFlow: indicator.linksToCashFlow === true,
      evidenceIds: [...new Set([...(prior.evidenceIds ?? []), ...(latest.evidenceIds ?? [])])],
    })
  }

  // ── the channel fold, where the double counting is refused ────────────────
  const improvingByChannel = new Map()
  for (const row of rows) {
    if (row.comparable && row.improving) improvingByChannel.set(row.channel, row)
  }
  const counted = []
  for (const [channel, row] of improvingByChannel.entries()) {
    if (row.derivedFrom !== null && improvingByChannel.has(row.derivedFrom)) {
      diagnostics.push(
        diagnostic('offsetting_effects_double_counted', 'note', `${row.name} moves because ${row.derivedFrom} moved, and both are improving. It is recorded and does not count as a second independent channel — one fact written down twice is not two pieces of evidence`, `indicators[${row.name}]`, {
          channel,
          derivedFrom: row.derivedFrom,
        }),
      )
      continue
    }
    counted.push(channel)
  }
  counted.sort()

  const reversedChannels = rows.filter((row) => row.comparable && row.invalidationChannel && row.improving === false)
  for (const row of reversedChannels) {
    causes.push(
      cause('thesis_refuted', `${row.name} moved the wrong way, and this is the channel the thesis named in advance as a business invalidation condition. That is a refutation, not an uncertainty`, `indicators[${row.name}]`, {
        channel: row.channel,
        delta: row.delta,
      }),
    )
  }

  const cashFlowLinked = rows.some((row) => row.comparable && row.improving && row.linksToCashFlow)
  if (!cashFlowLinked) {
    causes.push(
      cause('research_incomplete', 'No improving indicator is linked to the cash-flow line it is supposed to move. A recovery nobody has traced to cash is a story about accruals', 'indicators'),
    )
  }

  return {
    data: {
      rows,
      improvingChannels: counted,
      improvingChannelCount: counted.length,
      reversedChannels: reversedChannels.map((row) => row.channel),
      cashFlowLinked,
      meetsChannelFloor: counted.length >= METHODOLOGY.minImprovingChannels,
      units: { delta: 'indicator-unit', deltaPct: 'fraction' },
    },
    diagnostics,
    causes,
  }
}

/**
 * ── Does the company outlive its own catalyst ──────────────────────────────
 *
 * The entry rule in #258 weighs the recovery evidence against **survivable**
 * financial risk, and the failure it is guarding against is buying a real
 * recovery in a company that has to refinance before the recovery arrives.
 * Two numbers, one identity each:
 *
 *   `runwayMonths = liquidAssets / monthlyCashBurn`
 *   `debtCoverage = (liquidAssets + securedRefinancing) / debtMaturingWithinYear`
 *
 * A company that is not burning cash has infinite runway and this reports it as
 * `null` with `burning: false` rather than as a large number, because a large
 * number invites a comparison that means nothing.
 */
export function financialSurvivability({
  liquidAssets,
  monthlyCashBurn = 0,
  debtMaturingWithinYear = 0,
  securedRefinancing = 0,
  dilutionRisk = null,
  currency = 'KRW',
  config = {},
} = {}) {
  const diagnostics = []
  const causes = []
  const minRunwayMonths = finite(config.minRunwayMonths) ? config.minRunwayMonths : METHODOLOGY.minRunwayMonths
  const floor = finite(config.debtCoverageFloor) ? config.debtCoverageFloor : METHODOLOGY.debtCoverageFloor

  if (!finite(liquidAssets) || liquidAssets < 0) {
    causes.push(cause('data_missing', 'Financial survivability cannot be judged without the liquid assets figure, so this run cannot size the position', 'liquidAssets'))
    return { data: { survivable: null }, diagnostics, causes }
  }

  const burning = finite(monthlyCashBurn) && monthlyCashBurn > 0
  const runwayMonths = burning ? round(liquidAssets / monthlyCashBurn, 3) : null
  const maturing = finite(debtMaturingWithinYear) ? debtMaturingWithinYear : 0
  const secured = finite(securedRefinancing) ? securedRefinancing : 0
  const debtCoverage = maturing > 0 ? round((liquidAssets + secured) / maturing, 6) : null

  const runwayShort = burning && runwayMonths < minRunwayMonths
  const coverageShort = debtCoverage !== null && debtCoverage < floor

  if (runwayShort) {
    causes.push(
      cause('risk_limit_exceeded', `${runwayMonths} months of runway against the ${minRunwayMonths} this methodology requires. The thesis may still be right; the company does not reach it without money nobody has promised`, 'monthlyCashBurn', {
        runwayMonths,
        minRunwayMonths,
      }),
    )
  }
  if (coverageShort) {
    causes.push(
      cause('risk_limit_exceeded', `Debt maturing inside a year is covered ${debtCoverage}× by cash and committed refinancing, under the ${floor}× floor. Below one, the gap is a lender's decision and not this manager's`, 'debtMaturingWithinYear', {
        debtCoverage,
        floor,
      }),
    )
  }
  if (dilutionRisk === null) {
    diagnostics.push(
      diagnostic('dilution_risk_unstated', 'unevaluated', 'Whether the funding gap is closed by an equity raise changes what a right thesis is worth per share, and nothing here says', 'dilutionRisk'),
    )
  }

  return {
    data: {
      survivable: !runwayShort && !coverageShort,
      burning,
      runwayMonths,
      debtCoverage,
      dilutionRisk,
      currency,
      minRunwayMonths,
      debtCoverageFloor: floor,
      units: { runwayMonths: 'months', debtCoverage: 'ratio' },
    },
    diagnostics,
    causes,
  }
}
