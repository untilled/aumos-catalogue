import { diagnostic, finite, round, grandfatherPolicy, MANAGER_ID, SLEEVE_FLOW_MARKETS, ALLOCATOR_FLOW } from './diagnostics.mjs'
import { METHODOLOGY } from './constants.mjs'
import { normalizeTriggerKind, variantViewCheck } from './methodology.mjs'
import { trancheIntent } from './schedule.mjs'

/**
 * Lane ownership is keyed by flow, not by manager id.
 *
 * Keying it by manager id was what blocked every `specialistBudget` call made
 * with the id the manifest actually publishes. ⚠️ The table itself moved to
 * `diagnostics.mjs` (#87): `schedule.mjs` needs the same names to mint a wake
 * the orchestrator can answer, and a second copy of a vocabulary is how the two
 * halves come to disagree about what a flow is called.
 */

export function sleeveNav({ cash = [], positions = [], fx = {} }) {
  const diagnostics = []
  const totals = { KRW: 0, USD: 0 }
  for (const row of cash) {
    if (!['KRW', 'USD'].includes(row?.currency) || !finite(row?.amount)) {
      diagnostics.push(diagnostic('cash_row_unevaluated', 'unevaluated', 'Cash row needs currency and amount', 'cash'))
      continue
    }
    totals[row.currency] += row.amount
  }
  for (const row of positions) {
    if (!['KRW', 'USD'].includes(row?.currency) || !finite(row?.marketValue)) {
      diagnostics.push(diagnostic('position_value_unevaluated', 'unevaluated', 'Position needs currency and marketValue', 'positions'))
      continue
    }
    totals[row.currency] += row.marketValue
  }
  const sgov = positions
    .filter((row) => row?.symbol === 'SGOV' && row?.currency === 'USD' && finite(row.marketValue))
    .reduce((sum, row) => sum + row.marketValue, 0)
  const idleUsd = cash
    .filter((row) => row?.currency === 'USD' && finite(row.amount))
    .reduce((sum, row) => sum + row.amount, 0)
  const usdLiquidity = idleUsd + sgov
  const usdKrw = fx?.USDKRW
  const globalKrw = finite(usdKrw) && usdKrw > 0 ? totals.KRW + totals.USD * usdKrw : null
  if (globalKrw === null) diagnostics.push(diagnostic('fx_missing', 'unevaluated', 'USDKRW is required for global NAV', 'fx.USDKRW'))
  return {
    data: {
      krwSleeveNav: round(totals.KRW, 2),
      usdSleeveNav: round(totals.USD, 2),
      idleUsd: round(idleUsd, 2),
      sgovReserve: round(sgov, 2),
      usdLiquidity: round(usdLiquidity, 2),
      globalNavKrw: round(globalKrw, 2),
      units: { krwSleeveNav: 'KRW', usdSleeveNav: 'USD', usdLiquidity: 'USD', globalNavKrw: 'KRW' },
    },
    diagnostics,
  }
}

/**
 * ── A ceiling that can be executed (issue #121) ────────────────────────────
 *
 * `experimentalPositionCeiling` was a ratio and nothing else, and a ratio
 * alone says nothing about whether the order it permits can be placed. On the
 * book that found this, 1% of 10,095,751 KRW is 100,958 KRW, and the name the
 * methodology was ported with — KOGAS at 33,050 — is **three shares**. The
 * smallest expressible change in a three-share position is a third of it: it
 * cannot be scaled into, trimmed, or made to express conviction, and after the
 * tick and the round-trip fee there is no result left to measure. The ceiling
 * was reading as *do not start* rather than *start small*. The source
 * methodology's own Experiment-stage size for that same name was ten shares —
 * 2.6% of its book — so the port was 60% below the discipline it claims.
 *
 * ⛔ This is not a licence to size up, and it is deliberately not a runtime
 * config change: `policyLint` refuses a loosened threshold, and it is right to.
 * The floor raises the ceiling only until the position is executable, and
 * `experimentalPositionCeilingMax` is what stops it there.
 *
 * ⚠️ **The ratio and its bound are `METHODOLOGY` constants since #133.** They
 * are the size an *unpromoted* lens is trusted with, which is this package's
 * claim about evidence rather than the investor's about their money — and an
 * absent one used to read as `0`, so a caller who omitted them got a ceiling
 * that refused every experiment. The floor stays configured: what makes an
 * order unexecutable is a fact about a venue, and venues differ.
 *
 * ⚠️ **The floor is denominated per venue, not in the book's base currency.**
 * What makes an order unexecutable — tick size, lot size, the price a share
 * trades at, the fee and tax schedule — is a fact about the exchange; the base
 * currency is only where the investor keeps score. One USD number would buy a
 * granular position in a market quoting $0.01 ticks and a three-share position
 * in one quoting 50원 ticks on a 33,050원 share. The conversion into the
 * book's denominator uses the same USDKRW `sleeveNav` already requires.
 *
 * ⚠️ It is an approximation and stays one: exact granularity is a fact about
 * the *name*, and this operation is given no price. The currency is the
 * coarsest partition that is still correct.
 *
 * ⚠️ **Below roughly 10,000,000 KRW of NAV the floor stops fitting inside the
 * band, and the run is told so rather than quietly sized at the cap.** A book
 * that small cannot run this lane on real money at all, and the honest sample
 * there is the paper cohort — not a position that has been rounded up until it
 * looks like one.
 */
export function experimentalCeiling(input = {}) {
  const diagnostics = []
  const ratio = finite(input.experimentalPositionCeiling) ? Math.max(0, input.experimentalPositionCeiling) : METHODOLOGY.experimentalPositionCeiling
  const ceilingMax = finite(input.experimentalPositionCeilingMax) ? Math.max(0, input.experimentalPositionCeilingMax) : METHODOLOGY.experimentalPositionCeilingMax
  const floors = input.experimentalPositionFloor
  const currency = input.positionCurrency
  const data = {
    ratioCeiling: round(ratio),
    floorAmount: null,
    floorCurrency: currency ?? null,
    floorWeight: null,
    ceilingMax: ceilingMax === null ? null : round(ceilingMax),
    experimentalCeiling: round(ratio),
    binding: 'ratio',
    units: { floorAmount: 'currency-major-units', ratioCeiling: 'portfolio-weight', floorWeight: 'portfolio-weight', experimentalCeiling: 'portfolio-weight' },
  }
  /**
   * ⛔ **An absent floor used to return silently** (issue #158). The KRW leg of
   * a real run came back `floorAmount: null`, `binding: 'ratio'`, status `ok`
   * and not one diagnostic, because `experimentalPositionFloor` had arrived as
   * a bare `300000` rather than `{ KRW: 300000 }` — the exact shape of this
   * package's dominant failure pattern, a wrong input answered with a confident
   * number computed from defaults. The arithmetic the run wanted was
   * 300,000 / 1352.5 / 14,866.44 = 0.01491921, a **floor** binding, and what it
   * got was the ratio. The bare amount is refused by the published contract;
   * the *absent* one is reported here, because the ratio-only answer is a real
   * answer to a smaller question and the caller has to be able to tell.
   */
  if (!floors || typeof floors !== 'object') {
    diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'No minimum executable amount was declared, so this is the experimental ratio alone and the venue floor is unjudged rather than absent; it is declared per venue currency as { KRW: 300000, USD: 200 }', 'experimentalPositionFloor', { currency: currency ?? null }))
    return { data, diagnostics }
  }
  const amount = finite(floors[currency]) ? floors[currency] : null
  if (amount === null) {
    diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'A minimum executable amount is declared per venue currency, so the currency of the position being sized is required and has to be one the floor names', 'positionCurrency', { currency: currency ?? null, declared: Object.keys(floors) }))
    return { data, diagnostics }
  }
  data.floorAmount = round(amount, 2)
  const nav = input.portfolioNav
  const navCurrency = input.portfolioNavCurrency
  const usdKrw = input.fx?.USDKRW
  if (!finite(nav) || nav <= 0 || !['KRW', 'USD'].includes(navCurrency)) {
    diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'An amount becomes a weight only against the book it is a weight of; portfolioNav and portfolioNavCurrency are required', 'portfolioNav'))
    return { data, diagnostics }
  }
  let amountInNav = amount
  if (currency !== navCurrency) {
    if (!finite(usdKrw) || usdKrw <= 0) {
      diagnostics.push(diagnostic('experimental_floor_unevaluated', 'unevaluated', 'The floor is quoted in the venue currency and the book is denominated in another, so USDKRW is required to compare them', 'fx.USDKRW'))
      return { data, diagnostics }
    }
    amountInNav = currency === 'USD' ? amount * usdKrw : amount / usdKrw
  }
  const floorWeight = amountInNav / nav
  data.floorWeight = round(floorWeight)
  const lifted = Math.max(ratio, floorWeight)
  const capped = ceilingMax === null ? lifted : Math.min(lifted, ceilingMax)
  data.experimentalCeiling = round(capped)
  data.binding = capped === ratio && floorWeight <= ratio ? 'ratio' : ceilingMax !== null && lifted > ceilingMax ? 'ceilingMax' : 'floor'
  if (ceilingMax !== null && floorWeight > ceilingMax) {
    diagnostics.push(diagnostic('experimental_floor_unreachable', 'unevaluated', 'The smallest executable position in this venue is larger than the experimental band allows, so this book cannot run a real-money controlled experiment here; the paper cohort is the sample that is available, and a position rounded up to the cap would not be the one this floor was asked for', 'experimentalPositionFloor', { floorWeight: round(floorWeight), ceilingMax: round(ceilingMax) }))
  }
  return { data, diagnostics }
}

/** The maturities that are held to the experimental ceiling rather than to the Mandate alone. */
const UNPROMOTED_MATURITIES = ['insufficient', 'observing', 'reviewable']

/**
 * ── The cap the investor declared, and the cap that binds (issue #151) ─────
 *
 * An investor set `mandate.constraints.maxPositionWeight` to 0.20 and asked
 * why the book would not buy more than 1.3% of a name. The answer was yes,
 * and **nothing in any output said so.** The chain that produced it is three
 * rules, each defensible on its own: §4 holds an unpromoted lens to
 * `experimentalCeiling` (0.01345312 on a USD 14,866.44 book, the floor
 * binding), `controlArmLane` then holds a control-arm name to 1%, and
 * `promotionGate` is what lifts either — samples 30, regimes 3, clusters 10,
 * standing at 0/0/0. A twentieth of the declared number was the operative
 * limit, and the run submitted a `WAIT` carrying nine `uncertainty` entries,
 * none of which could be that one, because **no operation computed it.**
 *
 * ⚠️ **The asymmetry is the defect.** `concentration` reports a cap the
 * Mandate never declared as `concentration_cap_missing` / `unevaluated`, every
 * run, on the argument that *nobody said* is not a pass. A cap the investor
 * **did** declare, reduced twentyfold by this package's own evidence rules,
 * was reported nowhere at all. Whatever is owed for the first is owed more
 * plainly for the second: the first is a limit nobody chose, the second is a
 * limit somebody chose and did not get.
 *
 * ⛔ **This does not raise anything and must never be read as an argument to.**
 * The gates are right. `policyLint` refuses a loosened threshold and is right
 * to. What this operation adds is the sentence *"you declared 0.20 and this
 * book is operating at 0.01, because the lens is insufficient, and it lifts at
 * `promotionGate`"* — a disclosure, computed, in the same diagnostic vocabulary
 * as everything else, rather than a paragraph of prose a run may or may not
 * reconstruct.
 *
 * ⚠️ **The disclosure round-trips, the same way `discovery_lane_dark` does.**
 * Pass this run's `DecisionProposal.uncertainty` and a reduced cap that the
 * proposal does not carry is `blocked` — what is refused is the *proposal*,
 * never the run. The marker is the code `position_cap_reduced_by_maturity`
 * **verbatim** in one entry, a token rather than a sentence, because the prose
 * beside it is written in the invocation's `language`. Omitting `uncertainty`
 * leaves the disclosure unjudged rather than passed.
 *
 * ── The floor above the cap ───────────────────────────────────────────────
 *
 * The same book produced a second thing nothing said: `experimentalPositionFloor.USD`
 * is 200, and the control arm's 1% cell of that NAV is USD 148.66. **The floor
 * is above the cap**, so no US name enters that lane at any share price — this
 * is not the "under USD 66" reading #149 published, which was wrong and is
 * corrected here. `experimental_floor_exceeds_cap` names it and carries the
 * NAV that resolves it (USD 20,000 here), because the run should not have to
 * rediscover the arithmetic every time.
 *
 * ⚠️ **Three diagnostics look at this floor and they nest; the boundary is
 * deliberate.**
 *
 * | code | question | severity |
 * |---|---|---|
 * | `experimental_floor_unreachable` | the floor is above the whole experimental band (`> experimentalPositionCeilingMax`) | `unevaluated` |
 * | `experimental_floor_exceeds_cap` | the floor is above the control arm's single-name cell — not one position fits | `unevaluated` |
 * | `experimental_ladder_unreachable` | a position fits, but the capped budget cannot fund one lot per rung (#149) | `blocked` |
 *
 * They are ordered outermost first, and the outer ones are strictly wider: a
 * floor over the band is also over the lane cell. ⛔ **Report and act on the
 * outermost that fires** — an unreachable ladder under an unreachable floor is
 * a plan detail on a lane that could not hold one position, and answering it
 * first is how a run ends up enlarging a ladder to solve a NAV problem. The
 * two floor codes are `unevaluated` because they report *this book cannot run
 * a real-money experiment here*; the ladder code is `blocked` because it
 * refuses a specific plan.
 */
export function effectivePositionCap(input = {}) {
  const diagnostics = []
  const declared = finite(input?.mandatePositionCap) ? Math.max(0, input.mandatePositionCap) : null
  const maturity = input?.maturityStatus ?? null
  const unpromoted = UNPROMOTED_MATURITIES.includes(maturity)
  const lane = input?.lane === 'control-arm' ? 'control-arm' : input?.lane === 'main' ? 'main' : null
  const ceiling = experimentalCeiling(input)
  /**
   * ── Which lane the maturity ceiling belongs to (issue #153) ───────────────
   *
   * §4's ceiling was applied to every candidate, and the source methodology
   * applied it to one lane. `variantViewCheck` is what tells the two apart, and
   * it answers from checked inputs rather than from a claim — a thesis this
   * package already validates, a dated consensus citation, and a cleared
   * challenge. ⛔ **The default is the control arm.** An unverified candidate
   * is held exactly where it was before this change, and an explicit
   * `lane: 'control-arm'` keeps the ceiling on even where a variant view is
   * verified, because a request for the bounded lane is never overridden into a
   * larger one.
   */
  const variant = variantViewCheck({
    thesis: input?.thesis,
    challengeVerdict: input?.challengeVerdict,
    evidenceSamples: input?.evidenceSamples,
    asOf: input?.asOf,
  })
  /**
   * The check's own diagnostics belong to a run that made a claim about a
   * variant view — it offered a `thesis`, or it asked for the main lane. A
   * mechanical candidate that offered neither is *already* in the lane the
   * absence puts it in, and reporting `variant_view_unverified` on every
   * control-arm sizing call would be reporting the ordinary case. ⛔ It changes
   * no answer: `verified` is false either way and the ceiling binds either way.
   */
  if (input?.thesis !== undefined || input?.lane === 'main') diagnostics.push(...variant.diagnostics)
  const mainLaneOpen = variant.data.verified && lane !== 'control-arm'
  const resolvedLane = lane === 'control-arm' ? 'control-arm' : mainLaneOpen ? 'main' : lane === 'main' ? 'control-arm' : lane
  if (lane === 'main' && !variant.data.verified) {
    diagnostics.push(diagnostic(
      'main_lane_requires_variant_view',
      'unevaluated',
      `The main lane is what a checked variant view opens; this run asked for it without one, so the candidate is sized under the experimental ceiling until the missing requirements are met. ${variant.data.satisfiedCount} of ${variant.data.requirementCount} are already met — read requirementReport for which one binds and what is outstanding on it, rather than the verdict alone (#160)`,
      'lane',
      { missing: variant.data.missing, satisfied: variant.data.satisfied, requirements: variant.data.requirements, requirementReport: variant.data.requirementReport },
    ))
  }
  /**
   * The ceiling's own diagnostics belong to the run only where the ceiling
   * binds. On a promoted lens it is not the limit and reporting its floor
   * would be reporting a rule that did not apply — and on the main lane it is
   * not the limit either.
   */
  const ceilingApplies = unpromoted && !mainLaneOpen
  if (ceilingApplies) diagnostics.push(...ceiling.diagnostics)
  if (declared === null) {
    diagnostics.push(diagnostic('concentration_inputs_missing', 'unevaluated', "The Mandate's maxPositionWeight is the position cap and this run was given none", 'mandatePositionCap'))
  }

  const limits = []
  if (declared !== null) limits.push({ source: 'mandate', weight: declared })
  if (ceilingApplies && finite(ceiling.data.experimentalCeiling)) limits.push({ source: 'lens-maturity', weight: ceiling.data.experimentalCeiling })
  if (lane === 'control-arm') limits.push({ source: 'control-arm-lane', weight: METHODOLOGY.controlArm.singleMaxWeight })
  const bound = limits.length ? limits.reduce((low, row) => (row.weight < low.weight ? row : low)) : null
  const effective = bound ? round(bound.weight) : null

  /**
   * The *reason* is the maturity whenever the lens is unpromoted, even when
   * the arithmetic is bound by the lane cap: the control arm is the only lane
   * an unpromoted price-pattern candidate has, so "the lens is insufficient"
   * is what a person can act on and "the lane caps at 1%" is a consequence of
   * it. `limits` carries both so neither reading is lost.
   */
  const reason = ceilingApplies ? `lens_${maturity}` : lane === 'control-arm' ? 'control_arm_lane' : null
  const unlocksAt = ceilingApplies ? 'promotionGate' : null
  const progress = input?.promotion ?? null
  const promotion = {
    required: METHODOLOGY.promotionGate,
    observed: {
      samples: finite(progress?.samples) ? progress.samples : null,
      regimes: finite(progress?.regimes) ? progress.regimes : null,
      clusters: finite(progress?.clusters) ? progress.clusters : null,
    },
  }
  const reduced = declared !== null && effective !== null && effective + 1e-12 < declared
  if (reduced) {
    diagnostics.push(diagnostic(
      'position_cap_reduced_by_maturity',
      'unevaluated',
      'The position cap this book is operating under is smaller than the one the Mandate declares, because evidence maturity holds it there; say so with the declared number, the effective number and what lifts it, rather than sizing to the smaller one in silence',
      'mandatePositionCap',
      {
        declared: round(declared),
        effective,
        reducedToFraction: declared > 0 ? round(effective / declared) : null,
        reductionMultiple: effective > 0 ? round(declared / effective, 4) : null,
        binding: bound.source,
        reason,
        unlocksAt,
        promotion,
        limits: limits.map((row) => ({ source: row.source, weight: round(row.weight) })),
        /**
         * ⚠️ `promotionGate` is what lifts the *ceiling*; the main lane is what
         * takes the ceiling off the candidate entirely, and it is a different
         * door with a different key. Naming only the first left the reader of a
         * twentyfold reduction with no way to see that three of the four main
         * lane requirements were already met (#160).
         */
        mainLane: {
          open: mainLaneOpen,
          satisfied: variant.data.satisfied,
          missing: variant.data.missing,
          satisfiedCount: variant.data.satisfiedCount,
          requirementCount: variant.data.requirementCount,
          requirementReport: variant.data.requirementReport,
        },
      },
    ))
  }
  /**
   * ── The half the investor sees before the run, not after it ───────────────
   *
   * `uncertainty` is prose in the invocation's `language` and is read *after* a
   * proposal exists. The screen where the investor typed `maxPositionWeight`
   * needs a machine-readable value, and `untilled/aumos#681` (issue #679)
   * publishes exactly one: `DecisionProposal.effectiveConstraints`, an array of
   * `effectiveConstraintSchema` — a `strictObject`, so this shape is the host's
   * and not ours to extend.
   *
   * ⛔ **`field` is the host's vocabulary and only ever `maxPositionWeight`,
   * `cashFloor` or `maxDrawdown`.** A methodology name — `controlArmLane`,
   * `caps.position`, the experimental ceiling — is *refused* by that schema,
   * and rightly: the string names the control the investor filled in, beside
   * which the sentence is drawn. What actually bound is `reason`, which is
   * where this package's own vocabulary belongs.
   *
   * ⛔ **`declared` is echoed from what this run was handed**, never a constant.
   * A hardcoded 0.20 marks the row stale against every other Mandate.
   *
   * ⛔ **No entry when `effective === declared`.** The inequality is the whole
   * test, and absence is not a claim that nothing bound — the host draws
   * nothing at all — which is why *reduced and not emitted* is the exact defect
   * #151 is about, and why it is judged below rather than left to care.
   *
   * ⚠️ Only `maxPositionWeight` is ever emitted here, and that is a statement
   * about this methodology rather than a gap: `cashFloor` is untouched, and the
   * portfolio-heat cap is read straight off `maxDrawdown` without this package
   * tightening it. An axis this package does not narrow gets no row, because a
   * row saying `declared === effective` is one the host would not draw and the
   * schema does not want.
   */
  const unlocks = ceilingApplies
    ? `promotionGate: ${['samples', 'regimes', 'clusters'].map((key) => {
      const seen = promotion.observed[key]
      return `${key} ${seen === null ? '' : `${seen}/`}${METHODOLOGY.promotionGate[key]}`
    }).join(' · ')}`
    : null
  const effectiveConstraints = reduced
    ? [{ field: 'maxPositionWeight', declared: round(declared), effective, reason, ...(unlocks ? { unlocks } : {}) }]
    : []

  /**
   * The disclosure is judged on both halves, and each half is unjudged rather
   * than passed when it was not handed over. A proposal that carries the
   * diagnostic code in prose and leaves `effectiveConstraints` empty has told
   * the run's reader and not the investor's screen, which is the same silence
   * one layer up.
   */
  const uncertaintyDisclosed = Array.isArray(input?.uncertainty)
    ? input.uncertainty.some((entry) => typeof entry === 'string' && entry.includes('position_cap_reduced_by_maturity'))
    : null
  const constraintDisclosed = Array.isArray(input?.effectiveConstraints)
    ? input.effectiveConstraints.some((entry) => entry?.field === 'maxPositionWeight' && finite(entry?.effective) && Math.abs(entry.effective - effective) <= 1e-9)
    : null
  const disclosed = uncertaintyDisclosed === null && constraintDisclosed === null
    ? null
    : uncertaintyDisclosed !== false && constraintDisclosed !== false
  if (reduced && disclosed === false) {
    const missing = [
      ...(uncertaintyDisclosed === false ? ['uncertainty'] : []),
      ...(constraintDisclosed === false ? ['effectiveConstraints'] : []),
    ]
    diagnostics.push(diagnostic(
      'position_cap_reduction_undisclosed',
      'blocked',
      'This proposal is sized under a cap smaller than the one the investor declared and does not say so; carry the code `position_cap_reduced_by_maturity` verbatim in one `uncertainty` entry and this operation’s `effectiveConstraints` row verbatim in the proposal',
      missing[0] ?? 'uncertainty',
      { declared: round(declared), effective, missing, expected: effectiveConstraints },
    ))
  }

  /**
   * The floor and the lane cell, compared in the venue's own currency. NAV is
   * recovered from the ceiling's own conversion (`floorAmount / floorWeight`)
   * rather than converted a second time here — one FX reading, one answer.
   */
  const laneCap = METHODOLOGY.controlArm.singleMaxWeight
  const floorAmount = ceiling.data.floorAmount
  const floorWeight = ceiling.data.floorWeight
  let floorVersusCap = null
  if (finite(floorAmount) && finite(floorWeight) && floorWeight > 0) {
    const navInFloorCurrency = floorAmount / floorWeight
    floorVersusCap = {
      floorAmount: round(floorAmount, 2),
      floorCurrency: ceiling.data.floorCurrency,
      laneSingleMaxWeight: laneCap,
      laneCellAmount: round(laneCap * navInFloorCurrency, 2),
      portfolioNavInFloorCurrency: round(navInFloorCurrency, 2),
      resolvesAtNav: round(floorAmount / laneCap, 2),
      exceeds: floorWeight > laneCap + 1e-12,
    }
    if (ceilingApplies && floorVersusCap.exceeds) {
      diagnostics.push(diagnostic(
        'experimental_floor_exceeds_cap',
        'unevaluated',
        'The smallest position this venue is willing to open is larger than the control arm allows a single name to be, so no name enters that lane here at any share price; this is a fact about the size of the book, and the NAV that resolves it is stated rather than rediscovered each run',
        'experimentalPositionFloor',
        floorVersusCap,
      ))
    }
  }

  return {
    data: {
      declaredCap: declared,
      effectiveCap: effective,
      binding: bound?.source ?? null,
      reduced,
      reducedToFraction: reduced && declared > 0 ? round(effective / declared) : null,
      reason,
      unlocksAt,
      promotion,
      limits: limits.map((row) => ({ source: row.source, weight: round(row.weight) })),
      lane,
      /** The lane after `variantViewCheck`; `lane` stays what the run asked for. (#153) */
      resolvedLane,
      mainLaneOpen,
      ceilingApplies,
      variantView: variant.data,
      maturityStatus: maturity,
      mustReport: reduced,
      /** Copied into `DecisionProposal.effectiveConstraints` verbatim; empty is a complete answer. */
      effectiveConstraints,
      disclosed,
      uncertaintyDisclosed,
      constraintDisclosed,
      ceiling: ceiling.data,
      floorVersusCap,
      units: { declaredCap: 'portfolio-weight', effectiveCap: 'portfolio-weight', reducedToFraction: 'ratio' },
    },
    diagnostics,
  }
}

/**
 * ── The cash floor the investor declared, and the one that binds (issue #153) ─
 *
 * The investor declared **`cashFloor` 0.10** in «펀드 설정 > 투자 원칙». This
 * package never read it. It read `coreDca.reserveFloorWeight`, its own 0.15,
 * and `candidate-research` asked a run to show *"the arithmetic showing
 * `coreDca.reserveFloorWeight` still stands after the tranche"* — arithmetic no
 * operation here performed, against a number the investor never chose. Two
 * defects in one place: a private copy of an axis the Mandate owns, and a rule
 * that lived in prose.
 *
 * Both are answered the same way `effectivePositionCap` answers them.
 *
 * | | before | now |
 * |---|---|---|
 * | where the floor comes from | `config.coreDca.reserveFloorWeight` | the Mandate's `cashFloor` |
 * | when it is undeclared | the config default, 0.15, silently | `cash_floor_unevaluated` |
 * | who checks the plan against it | a sentence in a skill | this operation |
 * | when methodology binds tighter | nothing said | `effectiveConstraints` row, `field: 'cashFloor'` |
 *
 * ⛔ **An undeclared floor is not "no floor".** This package's own rule for a
 * missing cap — *"없는 캡은 제한 없음이 아니라 `concentration_cap_missing`이다"* —
 * is the rule here too: no floor is declared, so nothing was judged, and the run
 * is told that rather than handed a pass.
 *
 * ⛔ **The floor is a floor, not a target.** `cashFloor` 0.10 says the book may
 * go down to 10% cash; it never says it should. Nothing here proposes deploying
 * to the floor, and a run that reads permission as instruction has read it
 * backwards.
 *
 * ⚠️ **The projection is what is judged, not the current weight.** A plan
 * breaches a floor *after* it executes, which is why `projectedCashWeight` is
 * required and its absence is `unevaluated`: cash standing at 0.57 before a
 * tranche says nothing about where the tranche leaves it.
 */
export function effectiveCashFloor(input = {}) {
  const diagnostics = []
  const declared = finite(input?.mandateCashFloor) ? Math.max(0, input.mandateCashFloor) : null
  const additional = (Array.isArray(input?.methodologyCashFloors) ? input.methodologyCashFloors : METHODOLOGY.methodologyCashFloors)
    .filter((row) => finite(row?.weight))
    .map((row) => ({ source: row.source ?? 'methodology', weight: Math.max(0, row.weight) }))
  if (declared === null) {
    diagnostics.push(diagnostic('cash_floor_unevaluated', 'unevaluated', "The cash floor is the Mandate's cashFloor and this run was given none; an undeclared floor is not an absent one, and the Kernel refuses a proposal whose cash target sits under whatever the investor did declare", 'mandateCashFloor'))
  }
  const floors = [
    ...(declared === null ? [] : [{ source: 'mandate', weight: declared }]),
    ...additional,
  ]
  const bound = floors.length ? floors.reduce((high, row) => (row.weight > high.weight ? row : high)) : null
  const effective = bound ? round(bound.weight) : null

  const raised = declared !== null && effective !== null && effective > declared + 1e-12
  const reason = raised ? `methodology_floor_${bound.source}` : null
  if (raised) {
    diagnostics.push(diagnostic(
      'cash_floor_raised_by_methodology',
      'unevaluated',
      'This book is operating under a cash floor higher than the one the Mandate declares, because this methodology holds it there; say so with the declared number, the effective number and what raised it, rather than reserving the difference in silence',
      'mandateCashFloor',
      { declared: round(declared), effective, binding: bound.source, floors: floors.map((row) => ({ source: row.source, weight: round(row.weight) })) },
    ))
  }
  /**
   * The same row `effectivePositionCap` emits, on the other host field. ⛔ `field`
   * is the host's vocabulary — `cashFloor` here — and empty is a complete answer:
   * an axis this package does not narrow gets no row, because a row saying
   * `declared === effective` is one the host would not draw.
   */
  const effectiveConstraints = raised
    ? [{ field: 'cashFloor', declared: round(declared), effective, reason }]
    : []
  const constraintDisclosed = Array.isArray(input?.effectiveConstraints)
    ? input.effectiveConstraints.some((entry) => entry?.field === 'cashFloor' && finite(entry?.effective) && Math.abs(entry.effective - effective) <= 1e-9)
    : null
  if (raised && constraintDisclosed === false) {
    diagnostics.push(diagnostic(
      'cash_floor_raise_undisclosed',
      'blocked',
      'This proposal reserves more cash than the investor asked to reserve and does not say so; carry this operation’s `effectiveConstraints` row verbatim in the proposal',
      'effectiveConstraints',
      { declared: round(declared), effective, expected: effectiveConstraints },
    ))
  }

  const projected = finite(input?.projectedCashWeight) ? input.projectedCashWeight : null
  let breached = null
  if (effective === null || projected === null) {
    if (effective !== null) {
      diagnostics.push(diagnostic('cash_floor_projection_missing', 'unevaluated', 'A floor is checked against the cash the plan leaves behind, not the cash it starts with; give projectedCashWeight — the cash weight after everything this run proposes', 'projectedCashWeight', { effective }))
    }
  } else {
    breached = projected + 1e-12 < effective
    if (breached) {
      diagnostics.push(diagnostic(
        'cash_floor_breach',
        'blocked',
        'This plan leaves less cash than the floor that binds; the Kernel refuses a proposal whose cash target sits under the Mandate’s cashFloor, and a plan whose arithmetic breaches the floor is not a plan',
        'projectedCashWeight',
        { projectedCashWeight: round(projected), effective, declared: declared === null ? null : round(declared), shortfall: round(effective - projected) },
      ))
    }
  }

  return {
    data: {
      declaredFloor: declared,
      effectiveFloor: effective,
      binding: bound?.source ?? null,
      raised,
      reason,
      floors: floors.map((row) => ({ source: row.source, weight: round(row.weight) })),
      cashWeight: finite(input?.cashWeight) ? round(input.cashWeight) : null,
      projectedCashWeight: projected === null ? null : round(projected),
      headroomWeight: effective === null || projected === null ? null : round(projected - effective),
      breached,
      /** A floor, never a target: the headroom is what may be deployed, not what should be. */
      floorIsNotATarget: true,
      /** Copied into `DecisionProposal.effectiveConstraints` verbatim; empty is a complete answer. */
      effectiveConstraints,
      constraintDisclosed,
      units: { declaredFloor: 'portfolio-weight', effectiveFloor: 'portfolio-weight', projectedCashWeight: 'portfolio-weight', headroomWeight: 'portfolio-weight' },
    },
    diagnostics,
  }
}

/**
 * ── What the single-name lanes may hold together (issue #153 §3) ──────────
 *
 * The source capped non-core singles at 28% of the account
 * (`experiment_total_max_pct_account`, approved 2026-07-08). ⛔ **That number is
 * deliberately not ported.** It was one piece of an allocation that also carried
 * a 50% core ETF target and a 15% minimum cash, and the investor has since
 * decided that the ETF lane leaves this account entirely — in a book without
 * that lane, 28% is not the same statement it was. Porting it would have been
 * carrying a number across without the arithmetic that produced it, which is the
 * failure `experimentalPositionCeiling` already recorded once (#121).
 *
 * The investor answered §3 with **(a)**: the cash that is left is carried by
 * single names, and no parking sleeve stands in for the ETF lane. With it came
 * the source of the limit — **the Mandate, not a package constant**:
 *
 * ```
 * deployable = 1 − cashFloor            (what the investor's own floor leaves)
 * per name   = maxPositionWeight        (the investor's own single-name limit)
 * shape      = concentration sector/theme/factor
 * ```
 *
 * ⚠️ **This is the end of the line #133 started.** `concentration.position`
 * became `maxPositionWeight`, `concentration.portfolioHeat` became
 * `maxDrawdown`, `coreDca.reserveFloorWeight` became `cashFloor` (#153), and
 * this was the last sizing number that could have been a package constant
 * answering a question the investor is asked on a screen. There is now none:
 * every remaining constant in `lib/constants.mjs` is a claim about evidence, and
 * `METHODOLOGY`'s own header says so.
 *
 * ⛔ **A floor is not a target, and a budget is not an instruction.** The
 * deployable range is what the Mandate *permits*, never what the book should
 * hold; nothing here proposes filling it. And a Mandate that declares neither
 * number leaves this `unevaluated` — *"nobody said"* is not *"no limit"*, the
 * same rule `concentration_cap_missing` and `cash_floor_unevaluated` follow.
 *
 * ⚠️ The control arm spends **inside** this budget rather than beside it, which
 * is what the source said too (`counts_against_experiment_total: true`).
 * `controlArmRemainingWeight` is what `controlArmLane` takes as
 * `experimentTotalRemainingWeight`, so the two answers cannot disagree.
 */
/**
 * ── What the exclusion stopped saying out loud (issue #162) ────────────────
 *
 * `parkedLiquidity: true` takes a row off the sector, theme and factor axes and
 * off heat, and #141 is right about every part of that: a cash equivalent is on
 * no shared loss path, and counting one there did not measure a risk, it spent
 * a budget. ⛔ **That exclusion is not touched here and must not be.**
 *
 * What went wrong is what the exclusion came to *mean* in the output.
 * **Excluded means «spends no budget». It does not mean «is not there».** In
 * the 2026-09-06 book the difference was the whole reading: 57.25% cash, 27.05%
 * in the KRW parking ETF, 11.49% in SGOV, 4.21% in an index ETF and **0.00% in
 * any single name**. Four gates came back clean — `concentration` with one
 * grandfathered position breach and nothing else, `effectiveCashFloor` with
 * 0.47 of headroom, `caps.portfolioHeat` measuring **0** against 0.06, and
 * `singleNameBudget` reporting `heldSingleNameWeight: 0` against 0.90 of room —
 * and every one of them was clean for the same reason, which no operation said:
 * ⚠️ **the book is barely carrying any risk at all.**
 *
 * `heldSingleNameWeight: 0` is the whole defect in one number. It is formally
 * true, and a reader takes it for *"the lane is empty, there is room"* rather
 * than *"nothing this Mandate is for is being done"*. So the split stands beside
 * it from here on, in every operation that reports one of its parts: what is
 * parked, what is core, what is single-name, and what of the book is bearing
 * risk at all.
 *
 * ⛔ **This is arithmetic on rows the caller already passes, and it is a report
 * and not a cap.** Nothing in it refuses anything, nothing in it asks for a
 * purchase, and nothing in it proposes selling the parking — a disposal is an
 * investment judgement on the `allocate` flow and the investor approves it.
 */
export function bookWeightSplit(rows = []) {
  const held = (Array.isArray(rows) ? rows : []).filter((row) => finite(row?.weight) && row.weight >= 0)
  const parkedRow = (row) => row?.parkedLiquidity === true
  const coreRow = (row) => !parkedRow(row) && row?.core === true
  const singleRow = (row) => !parkedRow(row) && row?.core !== true
  const sum = (predicate) => held.filter(predicate).reduce((total, row) => total + row.weight, 0)
  const core = sum(coreRow)
  const single = sum(singleRow)
  return {
    parkedLiquidityWeight: round(sum(parkedRow)),
    coreWeight: round(core),
    singleNameWeight: round(single),
    /** ⚠️ Core and single name together — what is actually exposed to a market. */
    riskBearingWeight: round(core + single),
    singleNameCount: held.filter((row) => singleRow(row) && row.weight > 0).length,
    parkedLiquiditySymbols: [...new Set(held.filter(parkedRow).map((row) => row?.symbol ?? null))],
  }
}

export function singleNameBudget(input = {}) {
  const diagnostics = []
  const cashFloorReport = effectiveCashFloor({ mandateCashFloor: input?.mandateCashFloor })
  const floor = cashFloorReport.data.effectiveFloor
  const perName = finite(input?.mandatePositionCap) ? Math.max(0, input.mandatePositionCap) : null
  const missing = [
    ...(floor === null ? ['cashFloor'] : []),
    ...(perName === null ? ['maxPositionWeight'] : []),
  ]
  if (missing.length) {
    diagnostics.push(diagnostic(
      'single_name_budget_unevaluated',
      'unevaluated',
      "The single-name total is derived from the Mandate — what cashFloor leaves, held per name to maxPositionWeight — and this package ships no constant to fall back on; an undeclared limit is unjudged rather than unlimited",
      missing[0] === 'cashFloor' ? 'mandateCashFloor' : 'mandatePositionCap',
      { missing, derivedFrom: ['cashFloor', 'maxPositionWeight'] },
    ))
  }

  const singleName = (row) => row?.core !== true && row?.parkedLiquidity !== true && finite(row?.weight) && row.weight >= 0
  const positions = Array.isArray(input?.positions) ? input.positions : []
  const proposed = Array.isArray(input?.proposed) ? input.proposed : []
  /** `proposed` restates a held symbol rather than stacking on it — the #109 contract. */
  const restated = new Set(proposed.map((row) => row?.symbol).filter((symbol) => symbol !== undefined && symbol !== null))
  const total = (rows) => rows.filter(singleName).reduce((sum, row) => sum + row.weight, 0)
  const held = total(positions)
  const withProposed = total(positions.filter((row) => !restated.has(row?.symbol))) + total(proposed)
  const heldSplit = bookWeightSplit(positions)

  const deployable = floor === null ? null : round(1 - floor)
  const remaining = deployable === null ? null : round(deployable - withProposed)
  const overCap = deployable !== null && withProposed > deployable + 1e-12
  const adding = withProposed > held + 1e-12
  if (overCap && adding) {
    diagnostics.push(diagnostic(
      'single_name_budget_exceeded',
      'blocked',
      "This run would hold more in single names than the Mandate's own cash floor leaves to deploy; the limit is the investor's declaration rather than a package number, and it is raised on the fund-settings screen and nowhere else",
      'proposed',
      { deployableWeight: deployable, withProposed: round(withProposed), heldWeight: round(held), cashFloor: floor },
    ))
  } else if (overCap) {
    diagnostics.push(diagnostic(
      'single_name_budget_carried',
      'unevaluated',
      'The book already holds more in single names than the cash floor leaves to deploy; existing exposure is carried and new exposure is not, and a trim that reduces it is never the thing refused',
      'positions',
      { deployableWeight: deployable, heldWeight: round(held), withProposed: round(withProposed) },
    ))
  }
  /**
   * Reported and not re-refused: the position axis is `concentration`'s, it is
   * the Mandate's `maxPositionWeight`, and a second gate on one number is the
   * duplication #133 removed. This says which rows are over it so the budget's
   * reader does not have to run the other operation to find out.
   */
  const overPerName = perName === null ? [] : [...positions.filter((row) => !restated.has(row?.symbol)), ...proposed]
    .filter((row) => singleName(row) && row.weight > perName + 1e-12)
    .map((row) => ({ symbol: row?.symbol ?? null, weight: round(row.weight) }))

  const controlArmWeight = finite(input?.controlArmWeight) ? Math.max(0, input.controlArmWeight) : null
  const laneTotal = METHODOLOGY.controlArm.laneTotalMaxWeight
  const controlArmRemaining = controlArmWeight === null
    ? null
    : round(Math.min(laneTotal - controlArmWeight, remaining === null ? laneTotal - controlArmWeight : remaining))

  return {
    data: {
      deployableWeight: deployable,
      perNameCap: perName,
      heldSingleNameWeight: round(held),
      proposedSingleNameWeight: round(withProposed),
      remainingWeight: remaining,
      /**
       * ⚠️ **The three numbers that stop `heldSingleNameWeight` from being read
       * alone** (#162). A zero here is either an empty lane with room in it or a
       * book that is almost entirely cash and parking, and those are opposite
       * situations reported by the same digit. `parkedLiquidity` is excluded
       * from the shared-loss-path axes — it spends no budget — and it was never
       * excluded from *existing*; this says so on the same response.
       */
      parkedLiquidityWeight: heldSplit.parkedLiquidityWeight,
      coreWeight: heldSplit.coreWeight,
      riskBearingWeight: heldSplit.riskBearingWeight,
      heldSingleNameCount: heldSplit.singleNameCount,
      parkedLiquiditySymbols: heldSplit.parkedLiquiditySymbols,
      overPerNameCap: overPerName,
      cashFloor: floor,
      /** ⚠️ Named so nobody re-reads its absence as an omission. */
      source: 'mandate-derived',
      portedTotalCap: null,
      portedTotalCapNote: "the source's 28% belonged to an allocation with a 50% core ETF lane and is not ported; the investor answered #153 §3 with (a) and the Mandate is the source of the limit",
      controlArmLaneTotalMaxWeight: laneTotal,
      controlArmRemainingWeight: controlArmRemaining,
      controlArmSpendsInside: true,
      budgetIsNotATarget: true,
      units: { deployableWeight: 'portfolio-weight', perNameCap: 'portfolio-weight', remainingWeight: 'portfolio-weight' },
    },
    diagnostics: [...cashFloorReport.diagnostics.filter((row) => row.code !== 'cash_floor_projection_missing'), ...diagnostics],
  }
}

export function targetWeight(input) {
  const diagnostics = []
  const expected = input?.expectedActiveReturn
  const downside = input?.downsideReturn
  const conviction = input?.conviction
  if (![expected, downside, conviction].every(finite)) {
    diagnostics.push(diagnostic('sizing_inputs_missing', 'unevaluated', 'Expected active return, downside and conviction are required', 'input'))
    return { data: { targetWeight: null }, diagnostics }
  }
  if (downside >= 0 || conviction < 0 || conviction > 1) {
    diagnostics.push(diagnostic('sizing_inputs_invalid', 'blocked', 'Downside must be negative and conviction must be in [0,1]', 'input'))
    return { data: { targetWeight: null }, diagnostics }
  }
  /**
   * ⚠️ **The position cap is the Mandate's, and there is no second one.**
   * `configPositionCap` was `concentration.position`, default 0.10, standing
   * beside a Mandate `maxPositionWeight` of 0.20 — one axis said twice, in two
   * numbers, with nothing to say which was the real one. The Kernel enforces
   * the Mandate's: a proposal over it is refused before it is ever sealed
   * (`judge()`), so the configured copy could only ever be the quieter of the
   * two and was silently the one that bound. It is gone, and this reads the
   * value the invocation already carries. (#133)
   *
   * ⛔ A missing `mandatePositionCap` is `unevaluated`, never a pass — an
   * absent cap is *"nobody said"*, and sizing to `sectorHeadroom` alone is a
   * position limit derived from a sector limit.
   */
  const caps = [input.mandatePositionCap, input.sectorHeadroom, input.themeHeadroom].filter(finite)
  const raw = Math.max(0, expected / Math.abs(downside)) * conviction
  const maturity = input.maturityStatus
  if (!['insufficient', 'observing', 'reviewable', 'promoted'].includes(maturity)) {
    diagnostics.push(diagnostic('maturity_status_invalid', 'unevaluated', 'Known maturityStatus is required', 'maturityStatus'))
  }
  if (input.researchGate !== 'passed' || input.challengeVerdict !== 'cleared') {
    diagnostics.push(diagnostic('research_or_challenge_blocked', 'blocked', 'Sizing cannot repair a failed research or challenge gate', 'researchGate'))
  }
  /**
   * One rule, called here. The ceiling an unpromoted lens is held to is
   * `experimentalCeiling()`'s answer and never a second copy of the arithmetic
   * — a floor computed in one place and a ratio read in another is how the two
   * come to disagree about what the ceiling is. ⚠️ Since #151 the call goes
   * through `effectivePositionCap`, which is that same rule plus the sentence
   * saying how far it moved the investor's declared cap: sizing is the place
   * that already holds both numbers, so it is the place that owes the
   * comparison. A missing `mandatePositionCap` is reported there, under the
   * code it has always had.
   */
  const capReport = effectivePositionCap(input)
  const ceiling = { data: capReport.data.ceiling }
  diagnostics.push(...capReport.diagnostics)
  if (capReport.data.ceilingApplies) caps.push(finite(ceiling.data.experimentalCeiling) ? ceiling.data.experimentalCeiling : 0)
  const cap = caps.length ? Math.max(0, Math.min(...caps)) : 0
  return {
    data: {
      rawWeight: round(raw),
      bindingCap: round(cap),
      targetWeight: diagnostics.some((item) => item.severity === 'blocked') ? null : round(Math.min(raw, cap)),
      maturityStatus: maturity,
      lane: capReport.data.resolvedLane,
      variantViewVerified: capReport.data.variantView.verified,
      experimentalCeilingApplies: capReport.data.ceilingApplies,
      experimentalCeiling: ceiling.data.experimentalCeiling,
      experimentalCeilingBinding: ceiling.data.binding,
      declaredPositionCap: capReport.data.declaredCap,
      effectivePositionCap: capReport.data.effectiveCap,
      positionCapReduced: capReport.data.reduced,
      positionCapUnlocksAt: capReport.data.unlocksAt,
      effectiveConstraints: capReport.data.effectiveConstraints,
      units: { rawWeight: 'portfolio-weight', bindingCap: 'portfolio-weight', targetWeight: 'portfolio-weight', experimentalCeiling: 'portfolio-weight', declaredPositionCap: 'portfolio-weight', effectivePositionCap: 'portfolio-weight' },
    },
    diagnostics,
  }
}

export function legacySizeSuggestion(input) {
  const diagnostics = []
  const rr = input?.riskRewardRatio
  const cap = input?.capWeight
  if (!finite(rr) || rr <= 0 || !finite(cap) || cap < 0) {
    diagnostics.push(diagnostic('legacy_sizing_input_invalid', 'blocked', 'Positive riskRewardRatio and non-negative capWeight are required', 'input'))
    return { data: { suggestedWeight: null }, diagnostics }
  }
  const minimumCalibrationSamples = input.minimumCalibrationSamples ?? 20
  const calibrationSamples = input.calibrationSamples ?? 0
  const winProbability = input.winProbability
  const kellyGated = finite(winProbability) && calibrationSamples < minimumCalibrationSamples
  let raw
  let mode
  if (finite(winProbability) && !kellyGated) {
    if (winProbability < 0 || winProbability > 1) {
      diagnostics.push(diagnostic('win_probability_invalid', 'blocked', 'winProbability must be in [0,1]', 'winProbability'))
      return { data: { suggestedWeight: null }, diagnostics }
    }
    const fullKellyRisk = winProbability - (1 - winProbability) / rr
    const riskBudget = Math.max(0, (input.kellyFraction ?? 0.25) * fullKellyRisk)
    raw = finite(input.stopDistance) && input.stopDistance > 0 ? riskBudget / input.stopDistance : riskBudget
    mode = 'kelly'
  } else {
    const fullCapAt = input.fullCapAtRiskReward ?? 2
    const conviction = Math.min(Math.max((rr - 1) / Math.max(fullCapAt - 1, Number.EPSILON), 0), 1)
    raw = input.expectedValue === undefined || input.expectedValue > 0 ? cap * conviction : 0
    mode = kellyGated ? 'heuristic-fallback-insufficient-calibration' : 'heuristic'
  }
  return {
    data: {
      rawWeight: round(raw),
      suggestedWeight: round(Math.max(0, Math.min(raw, cap))),
      capWeight: cap,
      mode,
      calibrationSamples,
      units: 'portfolio-weight',
    },
    diagnostics,
  }
}

/**
 * Total risk if every stop fired at once — the axis a weight cap cannot see.
 *
 * `concentration()` measures how much of the book one name, sector, theme or
 * factor is. None of those answers "how much do I lose if all of this goes
 * wrong at the same time", which is what the investor capped at 6% of the
 * account on 2026-07-10 (`risk_gates.portfolio_heat_max_pct_account`). Two
 * books with identical weights have different heat when their stops sit in
 * different places.
 *
 * ⚠️ **That cap is the Mandate's `maxDrawdown` since #133, not a config key.**
 * *"How much of the account may I lose if every stop fires at once"* is the
 * planned maximum drawdown, and the investor already declares that number in
 * the one document the whole system reads — where the Approval screen shows it
 * and every manager on the book is measured against the same figure, instead of
 * each package holding a private copy under its own name.
 * ⛔ **The Kernel does not enforce it**, and this gate is not a formality
 * standing in front of one: `CONSTRAINT_FACTS` classifies `maxDrawdown` as
 * `recorded` — a drawdown is a fact about the book's history rather than about
 * a proposal, so `judge()` will not rule on it. What moved is where the number
 * is declared. What enforces it is still this.
 * ⚠️ A Mandate that declares none leaves this `unevaluated`, which is not a
 * pass and is reported as one more thing nobody has said yet.
 *
 * Core DCA and parked liquidity are excluded: they carry no stop and so are not
 * a source of heat. A row that declares no `stopLossPct` is unevaluated rather
 * than zero — reading a missing stop as "no risk" is exactly the direction this
 * gate exists to refuse.
 *
 * ⚠️ **`parkedLiquidity` was in that sentence and not in this code until #141.**
 * Only `core` was skipped, so a parking row reached the stop test, declared no
 * stop — it has none to declare — and came back `portfolio_heat_stop_missing`
 * every run: the gate reported *"nobody said how much this can lose"* about the
 * one holding in the book whose answer is *"it is the cash"*. Prose and
 * computation disagreed, and the computation is what ran.
 *
 * Above the cap, a run that also proposes new non-core risk is blocked; a book
 * that is already over on its holdings alone warns instead. ⚠️ That rule used
 * to be written here in literals, which is why `config.grandfather` could be
 * declared and read by nothing — the concept had a second, private copy. It now
 * comes from the same `grandfatherPolicy` the weight caps read, and `proposed`
 * restates a holding here for the same reason it does there: a trim has to be
 * able to lower measured heat, or the gate refuses the thing that fixes it.
 * (#109)
 *
 * ⚠️ `enabled: false` is **stricter** than the literal it replaced, on purpose:
 * a book over the cap on its holdings alone is then refused rather than warned.
 * Turning the tolerance off is a request not to tolerate the breach, and a
 * setting that changed only the wording would be another one that governs
 * nothing.
 */
function portfolioHeat({ positions, proposed, cap, grandfather, diagnostics }) {
  const contribution = (rows, label, report = true) => {
    let total = 0
    for (const row of rows) {
      if (row?.core || row?.parkedLiquidity === true) continue
      if (!finite(row?.weight)) continue
      if (!finite(row?.stopLossPct)) {
        if (report) diagnostics.push(diagnostic('portfolio_heat_stop_missing', 'unevaluated', 'A non-core row without a stop distance cannot contribute measured heat; it is not zero risk', `${label}.stopLossPct`, { symbol: row?.symbol ?? null }))
        continue
      }
      total += row.weight * row.stopLossPct
    }
    return total
  }
  const restated = new Set(proposed.map((row) => row?.symbol).filter((symbol) => symbol !== undefined && symbol !== null))
  const heldWeight = new Map(positions.filter((row) => finite(row?.weight)).map((row) => [row.symbol, row.weight]))
  const held = contribution(positions, 'positions')
  const withProposed = contribution(positions.filter((row) => !restated.has(row?.symbol)), 'positions', false) + contribution(proposed, 'proposed')
  if (!finite(cap)) {
    diagnostics.push(diagnostic('portfolio_heat_cap_missing', 'unevaluated', "Missing portfolio heat cap; it is the Mandate's maxDrawdown and this run was given none", 'caps.portfolioHeat'))
    return { holdingsOnly: round(held), withProposed: round(withProposed), cap: null, breached: null }
  }
  /**
   * A row with no stop contributes no measured heat, so a purchase of one
   * cannot be caught by comparing the two totals — it is caught by asking
   * whether the run is raising that symbol's weight at all.
   */
  const addsNonCoreRisk =
    withProposed > held ||
    proposed.some((row) => !row?.core && finite(row?.weight) && !finite(row?.stopLossPct) && row.weight > (heldWeight.get(row?.symbol) ?? 0))
  const carried = grandfather.enabled && held > cap
  /**
   * ⛔ The same ordering the weight caps use: a run that lowers measured heat
   * and adds no risk is never the thing refused, whatever the tolerance says.
   * `addsNonCoreRisk` still has to be false — trimming a stopped name while
   * buying a stop-less one lowers *measured* heat and raises the real thing.
   */
  const reducesRisk = withProposed < held && !addsNonCoreRisk
  if (withProposed > cap && !reducesRisk && (!carried || (addsNonCoreRisk && grandfather.blocksNewNonCoreWhenBreached))) {
    diagnostics.push(diagnostic('portfolio_heat_breach', 'blocked', 'Total loss if every stop fired is above the cap, and this run adds more of it', 'proposed', { withProposed: round(withProposed), cap }))
  } else if (held > cap) {
    diagnostics.push(diagnostic('portfolio_heat_above_cap', 'unevaluated', 'Held positions alone are above the heat cap; existing risk is grandfathered but new risk is not', 'positions', { holdingsOnly: round(held), cap }))
  }
  return { holdingsOnly: round(held), withProposed: round(withProposed), cap, breached: withProposed > cap }
}

/**
 * The weight caps, and which side of them a proposal is moving.
 *
 * Exposure is accumulated twice — once from the holdings alone and once with
 * what this run proposes — because a breach the book already carries and a
 * breach this run creates are different findings and only one of them is a
 * reason to refuse. A single total could not tell them apart, so every breach
 * was blocked, including one that a **trim** would resolve: the run was told
 * not to plan the reduction that fixes the thing being complained about.
 *
 * `config.grandfather` is the setting that says so, and this is where it is
 * read. Existing exposure is carried; new non-core exposure on a breached axis
 * is refused while `blocksNewNonCoreWhenBreached` holds. Turning `enabled` off
 * restores the older, blunter reading in which any breach refuses — including
 * one the book arrived with. (#109)
 *
 * ⚠️ **`parkedLiquidity` is read here since #141, and it moves exactly three
 * axes.** Sector, theme and factor are this package's and this config's caps
 * on a *shared loss path*, and a cash equivalent is not on one; the position
 * axis is the Mandate's `maxPositionWeight` and is untouched. The comment in
 * `accumulate` states the boundary and why it stops there.
 */
export function concentration({ positions = [], proposed = [], caps = {}, config = {} }) {
  const diagnostics = []
  const grandfather = grandfatherPolicy(config)
  const axes = () => ({ position: new Map(), sector: new Map(), theme: new Map(), factor: new Map() })
  for (const [rows, path] of [[positions, 'positions'], [proposed, 'proposed']]) {
    for (const row of rows) {
      if (!finite(row?.weight) || row.weight < 0) diagnostics.push(diagnostic('weight_invalid', 'blocked', 'All weights must be non-negative', path))
    }
  }
  const accumulate = (rows, { nonCoreOnly = false } = {}) => {
    const totals = axes()
    for (const row of rows) {
      if (!finite(row?.weight) || row.weight < 0) continue
      if (nonCoreOnly && row?.core) continue
      totals.position.set(row.symbol, (totals.position.get(row.symbol) ?? 0) + row.weight)
      /**
       * ⚠️ **Parked liquidity leaves the shared-loss-path axes here, and stays
       * on the position axis one line above. That boundary is the whole of
       * #141 and it is not a rounding of it.**
       *
       * `parkedLiquidity` arrived on every row and was read by nothing, so the
       * KRW parking symbol — 153130 at 0.27052 of the book — was summed onto
       * `krw-currency` like any other holding and filled a 0.15 factor budget
       * to 0.31258 on its own. Everything quoted in won was then refused as
       * `concentration_breach_expanded`: not because the book was concentrated,
       * but because its **cash** was denominated. Sector, theme and factor ask
       * *"how much of this book dies down one path"*, and a cash equivalent
       * held to not be in the market is not on any path. Counting it there did
       * not measure a risk; it spent a budget.
       *
       * ⛔ **`position` is deliberately not in this exemption.** That axis is
       * the Mandate's `maxPositionWeight`, the Kernel refuses a proposal over
       * it, and nothing in this package may waive it — `skills/us-sleeve`
       * records the run that read a *"reserve liquidity"* label as permission
       * to size past it. Configuration and classification can only ever make
       * this manager stricter than the Mandate. So 153130 at 0.27052 against
       * 0.20 is still a breach, still grandfathered, still reported every run,
       * and a run that reads this exemption as licence to grow it has read it
       * backwards. What is exempted here are the caps this package and its
       * config own, on axes that name a shared loss path; what is not exempted
       * is the investor's own declaration about a single name.
       */
      if (row?.parkedLiquidity === true) continue
      if (row.sector) totals.sector.set(row.sector, (totals.sector.get(row.sector) ?? 0) + row.weight)
      for (const theme of row.themes ?? []) totals.theme.set(theme, (totals.theme.get(theme) ?? 0) + row.weight)
      /**
       * A factor is a shared loss path that cuts across sectors — the AI-capex
       * complex the harness capped separately because a sector cap never sees it.
       * `allocate` and `thesis-challenge` both name this axis; without it the
       * question "does an existing holding create the same loss path?" has no
       * measured answer.
       */
      for (const factor of row.factors ?? []) totals.factor.set(factor, (totals.factor.get(factor) ?? 0) + row.weight)
    }
    return totals
  }
  /**
   * ⚠️ **A `proposed` row for a symbol the book already holds replaces that
   * holding; it does not stack on top of it.** `proposed` is the target state
   * for the names it mentions, which is the vocabulary the rest of this
   * package speaks — `targetWeight`, and a `DecisionProposal` carrying target
   * weights. Summing the two would read the one shape a reduction has —
   * `{ held: 0.25 } → { proposed: 0.15 }` — as 0.40, and refuse the trim as if
   * it were a purchase. That is the inversion #109 is about, arriving through
   * the input contract instead of through the gate.
   */
  const restated = new Set(proposed.map((row) => row?.symbol).filter((symbol) => symbol !== undefined && symbol !== null))
  const standing = positions.filter((row) => !restated.has(row?.symbol))
  const held = accumulate(positions)
  const heldNonCore = accumulate(positions, { nonCoreOnly: true })
  const totals = accumulate([...standing, ...proposed])
  const finalNonCore = accumulate([...standing, ...proposed], { nonCoreOnly: true })

  const breaches = []
  for (const [kind, map] of Object.entries(totals)) {
    const cap = caps[kind]
    if (!finite(cap)) {
      diagnostics.push(diagnostic('concentration_cap_missing', 'unevaluated', `Missing ${kind} cap`, `caps.${kind}`))
      continue
    }
    for (const [key, weight] of map.entries()) {
      if (weight <= cap) continue
      const heldWeight = held[kind].get(key) ?? 0
      const grandfathered = grandfather.enabled && heldWeight > cap
      breaches.push({
        kind,
        key,
        weight: round(weight),
        heldWeight: round(heldWeight),
        addedWeight: round(weight - heldWeight),
        addedNonCoreWeight: round((finalNonCore[kind].get(key) ?? 0) - (heldNonCore[kind].get(key) ?? 0)),
        cap,
        grandfathered,
      })
    }
  }
  /**
   * ── The label is a claim, and nothing was checking it (#141) ─────────────
   *
   * The factor axis is the only cap in this package whose **subject** the
   * package does not define. Sector and theme names arrive from the same
   * place, but a sector is read off the listing and a theme is prose the
   * investor can see in Brief; a factor is a string a run wrote down, and from
   * the next run onward it is an allocation limit with the investor's number
   * attached to it. `krw-currency` is what that produced — a currency of
   * quotation labelled as a shared loss path, standing at 0.31258 against a
   * 0.15 budget, so every won-denominated name in the market was refused by a
   * cap the investor never declared. No `blocked` is added here: the label may
   * well be right, and a gate that refused a book for the *name* of its risk
   * would be inventing exactly the kind of allocation decision this diagnostic
   * exists to make visible. It asks, in the report, once per run, per label.
   */
  const factorReviewCap = caps.factor
  if (finite(factorReviewCap) && factorReviewCap > 0) {
    for (const [key, weight] of totals.factor.entries()) {
      if (weight < factorReviewCap * METHODOLOGY.factorLabelReviewMultiple) continue
      diagnostics.push(diagnostic(
        'concentration_factor_label_unexamined',
        'unevaluated',
        'One factor label alone stands at twice its cap or more. That is a question about the label before it is a finding about the book: say what shared loss path it names, or withdraw it if it is a currency of quotation, a venue or a listing country — a denomination is not a loss path, and capping one is a country allocation decision the Mandate never made',
        'factors',
        { factor: key, weight: round(weight), cap: factorReviewCap, multipleOfCap: round(weight / factorReviewCap, 2) },
      ))
    }
  }
  /**
   * ⚠️ **The direction is read before the tolerance.** `enabled: false` is a
   * request not to tolerate a breach; it is never a request to refuse the trim
   * that resolves one. Reading the tolerance first put the inversion #109 is
   * named after straight back into the gate — a reduction of an over-cap axis
   * came out `concentration_breach: blocked`, in a response that carried
   * `riskReducingAlwaysAllowed: true` beside it.
   *
   * ⛔ Inaction is not a reduction, and neither is a swap. The axis total has
   * to fall **strictly**, so a standing breach nobody is touching still refuses
   * once the investor switches the tolerance off — which is what switching it
   * off asks for — and non-core exposure must not rise, so trimming a core
   * holding while buying a non-core one on the same over-cap axis is not a
   * reduction either. It is the shape `portfolioHeat` reads one line down.
   */
  const reducing = (row) => row.addedWeight < 0 && row.addedNonCoreWeight <= 0
  const created = breaches.filter((row) => !row.grandfathered && !reducing(row))
  const expanded = breaches.filter((row) => row.grandfathered && row.addedNonCoreWeight > 0)
  const carried = breaches.filter((row) => reducing(row) || (row.grandfathered && row.addedNonCoreWeight <= 0))
  if (created.length) diagnostics.push(diagnostic('concentration_breach', 'blocked', 'Proposed portfolio breaches concentration', 'proposed', { breaches: created }))
  if (expanded.length && grandfather.blocksNewNonCoreWhenBreached) {
    diagnostics.push(diagnostic('concentration_breach_expanded', 'blocked', 'An axis the book already carries above its cap is being added to; existing exposure is tolerated and new exposure is not', 'proposed', { breaches: expanded }))
  }
  if (carried.length || (expanded.length && !grandfather.blocksNewNonCoreWhenBreached)) {
    diagnostics.push(diagnostic('concentration_grandfathered', 'unevaluated', 'The book carries exposure above a cap; forcing an immediate sale is a trade the cap never asked for, and a trim or exit of it is never blocked', 'positions', { breaches: [...carried, ...(grandfather.blocksNewNonCoreWhenBreached ? [] : expanded)] }))
  }
  const bookSplit = bookWeightSplit([...standing, ...proposed])
  const heat = portfolioHeat({ positions, proposed, cap: caps.portfolioHeat, grandfather, diagnostics })
  return {
    data: {
      breaches,
      grandfatheredBreaches: breaches.filter((row) => row.grandfathered),
      blocksExpansionOf: grandfather.blocksNewNonCoreWhenBreached ? breaches.filter((row) => row.grandfathered).map((row) => ({ kind: row.kind, key: row.key })) : [],
      riskReducingAlwaysAllowed: true,
      /**
       * ⚠️ Named rather than silently dropped. An exemption nobody can see in
       * the response is the same shape as the flag nobody read: the run has to
       * be able to say which rows left the sector, theme, factor and heat
       * axes, and that they are still on the position axis. (#141)
       */
      parkedLiquidityExcluded: [...new Set([...standing, ...proposed].filter((row) => row?.parkedLiquidity === true).map((row) => row?.symbol ?? null))],
      /**
       * ⚠️ **Which is the naming, and this is the number** (#162). Listing the
       * excluded symbols said *that* something left the axes; it never said how
       * much of the book left with them. 38.54% of the 2026-09-06 book was
       * parked and every axis it touched read clean, so the four passing gates
       * and the sentence *"this book is almost entirely cash"* were the same
       * finding with only the first half published. ⛔ Reported, never capped —
       * see `mandateExecution` for why a cap here was declined.
       */
      parkedLiquidityWeight: bookSplit.parkedLiquidityWeight,
      coreWeight: bookSplit.coreWeight,
      singleNameWeight: bookSplit.singleNameWeight,
      riskBearingWeight: bookSplit.riskBearingWeight,
      singleNameCount: bookSplit.singleNameCount,
      heat,
      exposures: Object.fromEntries(Object.entries(totals).map(([kind, map]) => [kind, Object.fromEntries([...map].map(([key, weight]) => [key, round(weight)]))])),
    },
    diagnostics,
  }
}

/**
 * ── The codes that mean «the inputs never arrived» ─────────────────────────
 *
 * Published rather than hidden, because it is the whole basis on which
 * `mandateExecution` separates *an empty single-name lane the run chose* from
 * *an empty one nobody was able to fill*. Every entry is a code this package
 * already emits from the input path — the roster, the corp-code join, the
 * vendor status, the source cache, the discovery denominator — so the
 * classification is a set intersection over diagnostics that already ran, and
 * not a second opinion about them.
 *
 * ⛔ Codes from the sizing and lens gates are deliberately absent. A thesis
 * that did not clear its challenge is a *judgement* the methodology made, and a
 * run that filed it under "the wiring is unfinished" would be excusing its own
 * verdict. What belongs here is only ever a stage that lost an input.
 *
 * ⚠️ **`valuation_gap_is_unfetched_not_unfillable` is the strongest member of
 * this list and it arrived from `thesisGapSources` (#160/#166).** It is the one
 * code that says, of a *named* instrument, that a source which fills the gap
 * **exists** and **was never called** — the distinction the undifferentiated
 * `gaps` list had been hiding. Its two siblings are deliberately **not** here,
 * and the reason each is left out is the point:
 *
 * - `valuation_gap_has_no_source_for_this_instrument` is a fact about the
 *   *instrument* — an index ETF publishes no statements — so the gap stays open
 *   however well the wiring works. Filing that under "unfinished wiring" would
 *   promise a fix that no amount of fetching can deliver.
 * - `instrument_class_unknown` says the run could not establish whether a filer
 *   exists at all. ⛔ **Unknown is not "incomplete".** Reading it as one is the
 *   generalization #166 exists to stop, arriving from this side; it goes on
 *   `CAUSE_UNRESOLVED_CODES` instead, where it does the one honest thing —
 *   forbids the *other* conclusion too.
 */
export const INPUT_PATH_INCOMPLETE_CODES = Object.freeze([
  'corp_code_mapping_pending',
  'corp_code_registry_absent',
  'dart_status_missing',
  'dart_status_unknown',
  'discovery_lane_dark',
  'feed_universe_empty',
  'radar_feed_broken',
  'radar_feed_produced_nothing',
  'source_cache_never_fetched',
  'source_cache_refresh_failed',
  'source_cache_state_unknown',
  'source_cache_unreported',
  'valuation_gap_is_unfetched_not_unfillable',
])

/**
 * ── Codes that refuse both conclusions ─────────────────────────────────────
 *
 * `no-candidate-cleared-the-gates` is `info` because it asserts something
 * positive: the gates ran, on their inputs, and nothing was worth owning. A run
 * carrying one of these has **not** established that. `instrument_class_unknown`
 * is the case #166 built the vocabulary for — nothing said whether the symbol
 * has a filer, so neither *unfetched* nor *unfillable* may be claimed about it —
 * and a `mandateExecution` that answered `info` over the top of it would be
 * making exactly the assumption that operation refuses to make.
 *
 * ⛔ So these do not prove the wiring is unfinished either. They demote the
 * answer to `unreported`, which is this package's way of saying nobody has
 * established it — the rule `cash_floor_unevaluated` follows.
 */
export const CAUSE_UNRESOLVED_CODES = Object.freeze([
  'instrument_class_disputed',
  'instrument_class_unknown',
])

export const MANDATE_EXECUTION_CAUSES = Object.freeze([
  'executing',
  'input-path-incomplete',
  'no-candidate-cleared-the-gates',
  'unreported',
])

/**
 * ── The Mandate's own sentence, and whether anything acts on it (issue #162) ─
 *
 * `mandate.objective` arrives on every invocation, is prose, and until this
 * operation **no computation in this package read it**. A book whose declared
 * purpose is *"to understand a few companies deeply and buy what the market has
 * mispriced"* held zero companies through eight consecutive runs and no
 * diagnostic anywhere said so, because each gate was answering its own
 * question and each of them passed.
 *
 * ⛔ **The sentence is not parsed, and nothing here infers an intent from it.**
 * `objective` is free text and every investor writes a different one; a run
 * that read the words and decided what the book *should* hold would be the
 * failure `aumos#687` is named for — the name beating the document — arriving
 * from the manager's side. What is judged is checkable and nothing else:
 *
 *   1. **Is an objective on the record for this run?** A string, or not.
 *   2. **Does the book bear any single-name risk?** Arithmetic over the same
 *      rows `concentration` and `singleNameBudget` already receive.
 *   3. **If not, why?** Read off the diagnostics this run's other operations
 *      *already produced* — the intersections with `INPUT_PATH_INCOMPLETE_CODES`
 *      and `CAUSE_UNRESOLVED_CODES` above — rather than decided here.
 *
 * The objective itself is carried back **verbatim** so the investor reads their
 * own words beside the number, and that is the entire use this package makes
 * of it.
 *
 * ⚠️ **Nothing here is an instruction to buy.** *When nothing clears the gates,
 * nothing is bought* is the structural advantage of this methodology and it is
 * not being traded away for a filled lane: `no-candidate-cleared-the-gates` is
 * `info`, which is this package's severity for a thing that is working and
 * still worth saying. What is `unevaluated` is the other two — an empty lane
 * because the inputs never arrived, and an empty lane nobody gave a reason for.
 * Those are unanswered questions, and *"nobody said"* is not a pass, the same
 * rule `cash_floor_unevaluated` and `concentration_cap_missing` follow.
 *
 * ⛔ **And nothing here is an instruction to sell.** Disposing of 153130 or
 * SGOV is an investment judgement on the `allocate` flow that the investor
 * approves; this operation opens the place that judgement can be *stated*, and
 * it never makes it.
 *
 * ── ⑶ Why `parkedLiquidity` is not capped ──────────────────────────────────
 *
 * The issue raised a cap on the parked share as a counter-proposal and **it is
 * declined here on purpose**, so that the next revision finds the reasoning
 * rather than the gap. A ceiling on cash-equivalent weight is a floor under
 * deployment by another name: it makes the book buy *something* on a schedule,
 * which is precisely the behaviour every evidence gate in this package exists
 * to refuse. The 2026-09-06 defect was never that 38.54% was parked — a book
 * holding cash because nothing cleared its gates is the methodology working.
 * The defect was that no output said it. So the answer is a number in every
 * response and no new limit anywhere.
 */
export function mandateExecution({ mandateObjective = null, positions = [], proposed = [], cashWeight = null, reportedDiagnostics = [] } = {}) {
  const diagnostics = []
  const declared = typeof mandateObjective === 'string' && mandateObjective.trim().length > 0
  if (!declared) {
    diagnostics.push(diagnostic(
      'mandate_objective_unread',
      'unevaluated',
      "The Mandate's objective is the one sentence saying what this money is for, it arrives on every invocation, and this run did not carry it; without it the book can still be measured but cannot be set beside what the investor declared, which is the comparison nothing in this package was making",
      'mandateObjective',
    ))
  }

  const restated = new Set((Array.isArray(proposed) ? proposed : []).map((row) => row?.symbol).filter((symbol) => symbol !== undefined && symbol !== null))
  const standing = (Array.isArray(positions) ? positions : []).filter((row) => !restated.has(row?.symbol))
  const heldSplit = bookWeightSplit(positions)
  const split = bookWeightSplit([...standing, ...(Array.isArray(proposed) ? proposed : [])])
  const cash = finite(cashWeight) ? round(Math.max(0, cashWeight)) : null
  const cashEquivalent = cash === null ? null : round(cash + split.parkedLiquidityWeight)

  /** Strings or `{ code }` rows — a run passes back what `execute` handed it. */
  const codes = [...new Set((Array.isArray(reportedDiagnostics) ? reportedDiagnostics : [])
    .map((row) => (typeof row === 'string' ? row : row?.code))
    .filter((code) => typeof code === 'string' && code.length > 0))]
  const inputPathCodes = codes.filter((code) => INPUT_PATH_INCOMPLETE_CODES.includes(code)).sort()
  const unresolvedCodes = codes.filter((code) => CAUSE_UNRESOLVED_CODES.includes(code)).sort()

  const laneEmpty = split.singleNameWeight <= 0
  /**
   * ⛔ The order is the argument. A positive input-path finding outranks an
   * unresolved one — a source that exists and was never called is established
   * whatever else is unknown — but an unresolved one outranks the `info`
   * answer, because `no-candidate-cleared-the-gates` claims the gates *ran* and
   * a run that cannot say whether the instrument even has a filer has not
   * earned that claim. (#162 reading #166's vocabulary.)
   */
  const cause = !laneEmpty
    ? 'executing'
    : inputPathCodes.length
      ? 'input-path-incomplete'
      : unresolvedCodes.length || !codes.length
        ? 'unreported'
        : 'no-candidate-cleared-the-gates'

  if (laneEmpty) {
    diagnostics.push(diagnostic(
      'mandate_objective_unexecuted',
      cause === 'no-candidate-cleared-the-gates' ? 'info' : 'unevaluated',
      'This book carries no single-name weight at all, so every weight, heat and concentration gate is clean for one reason none of them states — there is almost nothing in the market to measure; report the share that is cash and parked beside that fact and say which of the two this is, a run that found nothing worth owning or a run whose gates never received their inputs. ⛔ It is neither a reason to buy nor a reason to sell: a purchase still needs its evidence, and disposing of parked liquidity is the investor’s judgement to approve',
      'positions',
      {
        objective: declared ? mandateObjective : null,
        cause,
        inputPathCodes,
        unresolvedCodes,
        cashWeight: cash,
        parkedLiquidityWeight: split.parkedLiquidityWeight,
        cashLikeWeight: cashEquivalent,
        riskBearingWeight: split.riskBearingWeight,
        singleNameWeight: split.singleNameWeight,
      },
    ))
  }

  return {
    data: {
      objectiveDeclared: declared,
      /** ⛔ Verbatim. Read to be quoted beside the numbers, and to nothing else. */
      objective: declared ? mandateObjective : null,
      objectiveIsNotParsed: true,
      cashWeight: cash,
      cashLikeWeight: cashEquivalent,
      parkedLiquidityWeight: split.parkedLiquidityWeight,
      parkedLiquiditySymbols: split.parkedLiquiditySymbols,
      coreWeight: split.coreWeight,
      singleNameWeight: split.singleNameWeight,
      singleNameCount: split.singleNameCount,
      riskBearingWeight: split.riskBearingWeight,
      heldSingleNameWeight: heldSplit.singleNameWeight,
      singleNameLaneEmpty: laneEmpty,
      cause,
      causes: MANDATE_EXECUTION_CAUSES,
      inputPathCodes,
      inputPathCodeVocabulary: INPUT_PATH_INCOMPLETE_CODES,
      /** ⛔ Why this run may not claim the gates ran and found nothing. */
      unresolvedCodes,
      unresolvedCodeVocabulary: CAUSE_UNRESOLVED_CODES,
      reportedDiagnosticCount: codes.length,
      /** ⑶ of #162, decided and recorded: reported here, capped nowhere. */
      parkedLiquidityIsUncapped: true,
      parkedLiquidityCapDeclined: 'a ceiling on cash-equivalent weight is a floor under deployment by another name; the defect was that the parking was unreported, never that it was large',
      notABuyInstruction: true,
      notASellSignal: true,
      units: {
        cashWeight: 'portfolio-weight',
        cashLikeWeight: 'portfolio-weight',
        parkedLiquidityWeight: 'portfolio-weight',
        coreWeight: 'portfolio-weight',
        singleNameWeight: 'portfolio-weight',
        riskBearingWeight: 'portfolio-weight',
      },
    },
    diagnostics,
  }
}

export function specialistBudget({ managerId = MANAGER_ID, flow, market, currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight, emergencyExit = false }) {
  const diagnostics = []
  if (managerId !== MANAGER_ID) diagnostics.push(diagnostic('manager_id_unknown', 'blocked', 'This package publishes one manager id', 'managerId', { managerId, expected: MANAGER_ID }))
  if (!SLEEVE_FLOW_MARKETS[flow]) diagnostics.push(diagnostic('flow_unknown', 'blocked', 'A sleeve flow is required; the allocator flow does not take a sleeve budget', 'flow', { flow, supported: Object.keys(SLEEVE_FLOW_MARKETS) }))
  else if (!SLEEVE_FLOW_MARKETS[flow].includes(market)) diagnostics.push(diagnostic('specialist_market_not_owned', 'blocked', 'Sleeve flow cannot allocate outside its market lane', 'market', { flow, market }))
  /**
   * ⚠️ **Which of the three is missing, by name** (issue #158). `kr-sleeve`
   * tried three spellings of the budget key against one `sleeve_budget_missing`
   * whose `path` was `input`, gave up, and left `withinBriefBudget` at `null` —
   * so the run's compliance with its own sleeve budget was never checked at
   * all. The unknown key is refused by the published contract; this says which
   * declared key the operation is still waiting for.
   */
  const missingWeights = Object.entries({ currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight })
    .filter(([, value]) => !finite(value))
    .map(([key]) => key)
  if (missingWeights.length) diagnostics.push(diagnostic('sleeve_budget_missing', 'unevaluated', 'Current sleeve, Brief budget and requested target are required, and the sleeve budget is the Brief\'s `sleeveBudgetWeight`', missingWeights[0], { missing: missingWeights }))
  if ([currentSleeveWeight, sleeveBudgetWeight, requestedTargetWeight].filter(finite).some((value) => value < 0)) diagnostics.push(diagnostic('sleeve_weight_negative', 'blocked', 'Sleeve weights cannot be negative', 'input'))
  const increase = finite(requestedTargetWeight) && finite(currentSleeveWeight) ? requestedTargetWeight - currentSleeveWeight : null
  if (!emergencyExit && finite(requestedTargetWeight) && finite(sleeveBudgetWeight) && requestedTargetWeight > sleeveBudgetWeight) diagnostics.push(diagnostic('specialist_sleeve_budget_exceeded', 'blocked', 'Specialist must ask Global for cross-market budget', 'requestedTargetWeight', { sleeveBudgetWeight }))
  if (emergencyExit && finite(increase) && increase > 0) diagnostics.push(diagnostic('emergency_exit_cannot_increase', 'blocked', 'Emergency invalidation bypass only permits SELL/RESIZE down', 'requestedTargetWeight'))
  return { data: { managerId, flow: flow ?? null, market, allowed: !diagnostics.some((row) => row.severity === 'blocked'), increaseWeight: round(increase), withinBriefBudget: finite(requestedTargetWeight) && finite(sleeveBudgetWeight) ? requestedTargetWeight <= sleeveBudgetWeight : null, emergencyExit }, diagnostics }
}

export function globalAllocation({ targets = [], availableWeight = 1, currentWeights = {} }) {
  const diagnostics = []
  if (!finite(availableWeight) || availableWeight < 0 || availableWeight > 1) diagnostics.push(diagnostic('global_available_weight_invalid', 'blocked', 'availableWeight must be in [0,1]', 'availableWeight'))
  const keys = new Set()
  let allocated = 0
  for (const [index, target] of targets.entries()) {
    if (typeof target?.key !== 'string' || !target.key) diagnostics.push(diagnostic('global_target_key_missing', 'blocked', 'Each target needs a string key and numeric weight', `targets[${index}].key`))
    else if (keys.has(target.key)) diagnostics.push(diagnostic('global_target_duplicate', 'blocked', 'Each sleeve/cash target must be unique', `targets[${index}].key`))
    else keys.add(target.key)
    if (!finite(target?.weight) || target.weight < 0) diagnostics.push(diagnostic('global_target_invalid', 'blocked', 'Target weight must be non-negative', `targets[${index}].weight`))
    else allocated += target.weight
  }
  if (allocated > availableWeight + 1e-9) diagnostics.push(diagnostic('global_cash_double_spend', 'blocked', 'Combined targets exceed the one global budget denominator', 'targets', { allocated, availableWeight }))
  const deltas = Object.fromEntries(targets.map((target) => [target.key, finite(target.weight) ? round(target.weight - (currentWeights[target.key] ?? 0)) : null]))
  return { data: { targets, allocatedWeight: round(allocated), residualCashWeight: finite(availableWeight) ? round(availableWeight - allocated) : null, deltas, owner: MANAGER_ID, flow: ALLOCATOR_FLOW, proposalAction: 'REBALANCE' }, diagnostics }
}

/**
 * Pacing, which is a warning and stays one.
 *
 * The approved rule (2026-07-10, P5) is soft on purpose: three patterns say the
 * book is adding single names faster than it is learning from them — two or
 * more new non-core singles in one session, another new single while the last
 * one is still unverified, and a new single on the day the sizing policy
 * changed. None of them is evidence that this particular candidate is wrong, so
 * none of them blocks; they are the observation that the run should say out
 * loud before the investor approves it. The harness relaxes them once the book
 * has ten closed outcomes to learn from.
 */
export function newSinglePacing({ proposedNewSingles = [], priorNewSingles = [], sizingPolicyUpdatedAt = null, closedOutcomeCount = 0, asOf, reviewReadyClosedOutcomes = METHODOLOGY.reviewReadyClosedOutcomes }) {
  const diagnostics = []
  const warnings = []
  const relaxed = closedOutcomeCount >= reviewReadyClosedOutcomes
  const newCount = proposedNewSingles.filter((row) => !row?.core).length
  if (newCount >= 2) warnings.push({ code: 'multiple-new-singles-one-session', count: newCount })
  const unverified = priorNewSingles.filter((row) => row?.verified === false)
  if (newCount > 0 && unverified.length) warnings.push({ code: 'prior-single-unverified', symbols: unverified.map((row) => row?.symbol ?? null) })
  if (newCount > 0 && sizingPolicyUpdatedAt && typeof asOf === 'string' && sizingPolicyUpdatedAt.slice(0, 10) === asOf.slice(0, 10)) {
    warnings.push({ code: 'sizing-policy-changed-today', sizingPolicyUpdatedAt })
  }
  for (const warning of warnings) {
    diagnostics.push(diagnostic('new_single_pacing_warn', relaxed ? 'info' : 'unevaluated', 'New single-name exposure is being added faster than it is being learned from; say so before approval', 'proposedNewSingles', warning))
  }
  return { data: { warnings, newSingleCount: newCount, relaxed, closedOutcomeCount }, diagnostics }
}

/**
 * ── The staged entry, on the single-name side (#120) ───────────────────────
 *
 * `candidate-research` already required a tranche plan — "T1/T2/T3 each with
 * its size and its date-or-price condition. *We will add on weakness* is not a
 * tranche" — and required it **only of `core-dca`**. That row's last line is
 * right and stays: a cash deployment is not a ready single-name BUY, and
 * pooling the two makes the single-name sample look larger than it is.
 *
 * What the split lost is that the original harness staged single names too, and
 * ⚠️ **not because they were large — because the conviction was low.** The NAVER
 * thesis wrote its own reason down: technically oversold was confirmed, the
 * earnings/multiple case was not, so it was "제한 분할매수 후보" — a limited,
 * staged candidate — on a three-tranche plan. Not going in at once is what that
 * methodology *did* about an unverified claim, and after the port that device
 * survived on the ETF side only.
 *
 * So this is the same five-condition shape, addressed to a single name, and the
 * two lanes are kept apart **in code**: a `core-dca` lens is refused here, and
 * what this returns says in its own data that a plan is one sample no matter how
 * many tranches it has. Three tranches counted as three samples would be the
 * "repeated runs on one still-open idea" `evidence-gates` forbids — the same
 * inflation, arriving from the other direction.
 *
 * ⚠️ **The plan is one document, and the document is the Thesis.** A tranche
 * ladder in private memory would be a second copy of a fact the Thesis already
 * owns, and invariant 7 says which copy is authoritative. Nothing here writes a
 * new memory key.
 *
 * ⛔ Nothing here sizes or orders. Like every `exitCheck` verdict, a `tranche_due`
 * is a *candidate* for the one proposal the investor still approves.
 */
export const SINGLE_NAME_TRANCHES = {
  /** T1/T2/T3, the number the ported theses actually wrote. */
  planned: 3,
  /**
   * The same 5% band `exitCheck` raises `trim_approach` in, for the same
   * reason: a rung set weeks ago can be stale by the time price reaches it, and
   * the premise is re-read *before* it fires rather than after.
   */
  approachPct: 0.05,
  /** Unpromoted evidence is precisely the state the staging exists for. */
  stagingRequiredMaturities: ['insufficient', 'observing'],
}

/** A tranche waits on a date or on a price. `immediate` is the one that does not wait. */
const TRANCHE_CONDITION_KINDS = new Set(['immediate', 'at-time', 'price-below', 'price-above'])

export function entryTranchePlan({ symbol = null, lens = null, maturity = null, price, plannedTotalWeight = null, tranches = [], execution = null, asOf } = {}) {
  const diagnostics = []
  const findings = []
  const add = (kind, label, message, detail = {}) => findings.push({ kind, symbol, label, message, ...detail })
  const asOfInstant = Date.parse(asOf)
  if (SINGLE_NAME_TRANCHES.stagingRequiredMaturities.includes(maturity)) {
    if (!execution || !finite(execution.portfolioNav) || execution.portfolioNav <= 0 || !finite(execution.lotSize) || execution.lotSize <= 0 || !execution.positionCurrency || execution.portfolioNavCurrency !== execution.positionCurrency || !finite(price) || price <= 0 || !finite(plannedTotalWeight) || plannedTotalWeight <= 0) {
      diagnostics.push(diagnostic('experimental_ladder_unevaluated', 'unevaluated', 'Ladder executability needs positive price, final capped weight, broker lotSize and portfolioNav expressed in positionCurrency', 'execution'))
    } else {
      const budget = plannedTotalWeight * execution.portfolioNav
      const minimum = price * execution.lotSize * SINGLE_NAME_TRANCHES.planned
      if (budget + 1e-6 < minimum) diagnostics.push(diagnostic('experimental_ladder_unreachable', 'blocked', 'The capped position cannot fund one executable lot per rung; do not enlarge the cap or describe this as gate-passing paper selection', 'plannedTotalWeight', { budget, minimum, lotSize: execution.lotSize, price, requiredRungs: SINGLE_NAME_TRANCHES.planned }))
      for (const [index, row] of tranches.entries()) {
        if (finite(row.weight) && row.weight * execution.portfolioNav + 1e-6 < price * execution.lotSize) diagnostics.push(diagnostic('tranche_below_minimum_lot', 'blocked', 'This rung cannot buy one executable lot at the observed price', `tranches[${index}].weight`))
      }
    }
  }

  /**
   * The lane separation, as a refusal rather than a sentence. A cash
   * deployment's tranches are the `core-dca` conditions and they are counted in
   * the other column; asking this function to hold them is the pooling the
   * classification row exists to prevent.
   */
  if (lens === 'core-dca') {
    diagnostics.push(diagnostic('tranche_lane_mismatch', 'blocked', 'Core DCA tranches are a cash deployment and are recorded under the core-dca conditions; they never become a single-name sample', 'lens', { lens }))
    return {
      data: {
        symbol, lens, classification: 'cash-deployment', countsAsSingleNameSample: false, sampleCount: 0,
        sampleKind: 'cash-deployment-never-a-single-name-sample', staged: null, action: 'NONE',
        findings, intents: [], candidateOnly: true,
      },
      diagnostics,
    }
  }

  const rows = tranches.map((row, index) => ({
    label: typeof row?.label === 'string' && row.label ? row.label : `T${index + 1}`,
    weight: row?.weight,
    condition: row?.condition ?? null,
    filled: row?.filled === true,
    expiresAt: row?.expiresAt ?? null,
    index,
  }))

  if (!rows.length) {
    diagnostics.push(diagnostic('tranche_plan_missing', 'blocked', 'A staged entry is a plan or it is not staged; T1/T2/T3 each carry a size and a date-or-price condition', 'tranches'))
  }

  let plannedSum = 0
  let filledWeight = 0
  for (const row of rows) {
    const where = `tranches[${row.index}]`
    if (!finite(row.weight) || row.weight <= 0) {
      diagnostics.push(diagnostic('tranche_weight_missing', 'blocked', 'A tranche states the weight it puts to work; a share of the plan nobody wrote down is not a tranche', `${where}.weight`, { label: row.label }))
    } else {
      plannedSum += row.weight
      if (row.filled) filledWeight += row.weight
    }
    const kind = normalizeTriggerKind(row.condition?.kind)
    if (!TRANCHE_CONDITION_KINDS.has(kind)) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', '"We will add on weakness" is not a tranche; each one carries a date-or-price condition', `${where}.condition`, { label: row.label, supported: [...TRANCHE_CONDITION_KINDS] }))
      continue
    }
    if (kind === 'immediate' && row.index !== 0) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', 'Only the first tranche executes on the run that plans it; a later one waits on a stated condition', `${where}.condition`, { label: row.label }))
      continue
    }
    if ((kind === 'price-below' || kind === 'price-above') && !finite(row.condition?.threshold)) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', 'A price tranche states the level it waits for', `${where}.condition.threshold`, { label: row.label }))
    }
    if (kind === 'at-time' && !Number.isFinite(Date.parse(row.condition?.at))) {
      diagnostics.push(diagnostic('tranche_condition_missing', 'blocked', 'A dated tranche states the instant it waits for', `${where}.condition.at`, { label: row.label }))
    }
  }

  if (finite(plannedTotalWeight) && rows.length && Math.abs(plannedSum - plannedTotalWeight) > 1e-9) {
    diagnostics.push(diagnostic('tranche_sizes_do_not_sum', 'blocked', 'The tranches add up to the position the plan says it is building, or the plan is describing two different positions', 'tranches', { plannedTotalWeight, trancheSum: round(plannedSum) }))
  }

  /**
   * Whether staging is *required* is a maturity question, because the reason
   * for staging was never size. An unstated maturity is unevaluated rather than
   * waved through: the requirement is not judged, and the run is told so.
   */
  const staged = rows.length >= SINGLE_NAME_TRANCHES.planned
  if (maturity === null || maturity === undefined) {
    diagnostics.push(diagnostic('tranche_maturity_unstated', 'unevaluated', 'Whether this entry has to be staged is decided by the lens maturity; without it the requirement is not judged', 'maturity', { planned: SINGLE_NAME_TRANCHES.planned }))
  } else if (SINGLE_NAME_TRANCHES.stagingRequiredMaturities.includes(maturity) && !staged) {
    diagnostics.push(diagnostic('tranche_plan_required', 'blocked', 'An unpromoted lens enters in stages; the split is what an unverified claim does about its own uncertainty, not a way of being small', 'tranches', { maturity, planned: SINGLE_NAME_TRANCHES.planned, given: rows.length }))
  }

  const priceRead = finite(price)
  if (!priceRead) {
    diagnostics.push(diagnostic('tranche_price_unread', 'unevaluated', 'Without a current price the price tranches are unread; dated and lapsed tranches are still judged', 'price'))
  }

  const lapsed = []
  const intents = []
  for (const row of rows) {
    if (row.filled) continue
    const kind = normalizeTriggerKind(row.condition?.kind)
    const expiry = Date.parse(row.expiresAt)
    if (Number.isFinite(expiry) && Number.isFinite(asOfInstant) && expiry <= asOfInstant) {
      lapsed.push(row.label)
      add('tranche_lapsed', row.label, 'A tranche condition expired with the plan unfinished; the remainder is re-armed, resized or abandoned in this run', { expiresAt: row.expiresAt, weight: row.weight ?? null })
      continue
    }
    if (kind === 'immediate') {
      add('tranche_due', row.label, 'The first tranche executes on the run that plans it', { weight: row.weight ?? null })
      continue
    }
    if (kind === 'at-time') {
      const at = Date.parse(row.condition?.at)
      if (Number.isFinite(at) && Number.isFinite(asOfInstant) && at <= asOfInstant) add('tranche_due', row.label, 'A dated tranche reached its instant', { at: row.condition.at, weight: row.weight ?? null })
      else add('tranche_pending', row.label, 'A dated tranche is still waiting', { at: row.condition?.at ?? null, weight: row.weight ?? null })
      intents.push({ label: row.label, at: row.condition?.at ?? null, intent: trancheIntent(symbol, row.label) })
      continue
    }
    if (kind === 'price-below' || kind === 'price-above') {
      intents.push({ label: row.label, threshold: row.condition?.threshold ?? null, intent: trancheIntent(symbol, row.label) })
      if (!priceRead || !finite(row.condition?.threshold)) continue
      const level = row.condition.threshold
      const met = kind === 'price-below' ? price <= level : price >= level
      const near = kind === 'price-below'
        ? price <= level * (1 + SINGLE_NAME_TRANCHES.approachPct)
        : price >= level * (1 - SINGLE_NAME_TRANCHES.approachPct)
      if (met) add('tranche_due', row.label, 'A price tranche reached its level', { level, price, weight: row.weight ?? null })
      else if (near) add('tranche_approach', row.label, 'Price is within 5% of a tranche rung; re-read the premise before it fires', { level, price, weight: row.weight ?? null })
      else add('tranche_pending', row.label, 'A price tranche is still waiting', { level, price, weight: row.weight ?? null })
    }
  }

  const complete = rows.length > 0 && rows.every((row) => row.filled)
  if (lapsed.length && !complete) {
    diagnostics.push(diagnostic('tranche_plan_incomplete', 'blocked', 'Half an entry plan is a position nobody decided the size of; state the remainder as re-armed, resized or abandoned', 'tranches', { lapsed, filledWeight: round(filledWeight), plannedTotalWeight: finite(plannedTotalWeight) ? plannedTotalWeight : round(plannedSum) }))
  }
  const kinds = new Set(findings.map((row) => row.kind))
  const action = kinds.has('tranche_lapsed') || kinds.has('tranche_approach')
    ? 'REVIEW'
    : kinds.has('tranche_due')
      ? 'ENTER'
      : 'NONE'

  return {
    data: {
      symbol, lens, maturity,
      classification: 'single-name',
      /**
       * ⛔ The number that must not move. A staged entry is one idea decided
       * once; counting a tranche as a sample would manufacture evidence out of
       * the risk control that exists because the evidence is thin.
       */
      countsAsSingleNameSample: true,
      sampleCount: 1,
      sampleKind: 'one-single-name-sample-per-plan-never-one-per-tranche',
      countsAsCashDeployment: false,
      staged,
      trancheCount: rows.length,
      plannedTotalWeight: finite(plannedTotalWeight) ? plannedTotalWeight : round(plannedSum),
      filledWeight: round(filledWeight),
      remainingWeight: round(plannedSum - filledWeight),
      complete,
      lapsed,
      action,
      findings,
      intents,
      priceLaneRead: priceRead,
      candidateOnly: true,
    },
    diagnostics,
  }
}
