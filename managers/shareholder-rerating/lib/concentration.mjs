/**
 * ── One book, one position, one set of limits ──────────────────────────────
 *
 * This package is meant to be installed beside other managers, possibly beside a
 * second copy of itself, and the failure that arrangement produces is arithmetical
 * rather than philosophical: three managers each sized to a 10% single-name cap on
 * the same name hold 30% of one company, and every one of them can show its working.
 *
 * Three rules stop that, and none of them can be stated as prose a model checks
 * itself against:
 *
 *   ⛔ **Exposure is measured over the whole account** — every real holding *and*
 *      every open proposal nobody has approved yet, whoever wrote them. A proposal
 *      that has not been filled is exposure that is about to exist, and leaving it
 *      out is how a book arrives at its limit twice in one morning.
 *
 *   ⛔ **Per-strategy caps never sum into an account cap.** If this package's own
 *      ceiling is 10% and a sibling's is 10%, the account's ceiling is whatever the
 *      account's ceiling is — not 20%. The binding number is the **minimum** of the
 *      caps that apply, and a run that adds them is reported.
 *
 *   ⛔ **A cap that was declared is a cap that is read.** `accountGrossCap` sat in
 *      this function's input contract and in nobody's arithmetic: a fresh 5.3%
 *      position was returned onto a book already 79% invested against a declared 80%
 *      ceiling, and the answer said `withinLimits: true`. Every declared limit now
 *      folds into `maxTotalWeightForName` **and** is re-checked on the projection.
 *
 * ── An empty account and an account you could not read are different states ─
 *
 * ⛔ **`holdings` and `openProposals` are required arrays and there is no default.**
 * A missing book used to arrive here as two empty lists, which reads as *this account
 * holds nothing and has nothing pending* — the most permissive state there is — and
 * a `BUY` came back from a run that had not seen the account at all. An absent list
 * is `unevaluated`, `withinLimits` is `null`, and `null` is not a pass anywhere: a
 * caller must require `withinLimits === true`. A genuinely empty account passes `[]`
 * and says so. This is #254's distinction, and it is the reason it is a distinction.
 *
 * ⚠️ **A holding is one quantity however many theses are attached to it.** Two rows
 * for one symbol are two claims about one position, and they are counted once. The
 * duplicate is reported, because a book that produced one has two managers who each
 * think they own it.
 *
 * ── A stated ceiling that cannot be checked holds the increase (#269) ───────
 *
 * ⛔ **A sector ceiling the Mandate states and this run cannot evaluate does not
 * become a sector ceiling that passed.** The proposal used to carry a `warn` and go
 * through: the name and gross axes were checked, the sector axis was skipped out
 * loud, and a position went onto a book whose sector total nobody had formed. What
 * the investor declared was a limit, and approving an order under a warning is not
 * the same act as releasing the limit.
 *
 * ⚠️ **The candidate's own sector is not the whole of the question.** The total a
 * sector ceiling is measured against is made of *every* holding and *every* open
 * proposal in that sector. A candidate that names its sector and a book carrying one
 * row that does not is a book whose sector total is short by whatever that row is —
 * and a run that checked only the candidate would pass it. Both are the same gap and
 * both are reported here.
 *
 * ⚠️ **What is withheld is the *increase*, and only the increase.** The severity of
 * this finding depends on the direction of the proposal, which is unusual here and is
 * the point: a ceiling that could not be checked stops the thing the ceiling
 * constrains. A reduction moves the way the limit points, so an unevaluable sector
 * total is a `warn` on it and an `unevaluated` on an addition. Asking «what may this
 * name be?» — the `weight: 0` pass — is a question and not an addition, so it is not
 * withheld either; the pass that carries the increment is.
 *
 * ⚠️ **And the finding is about the *account*, never about the company.** It is
 * `data_missing`. A classification nobody supplied is not a thesis anybody refuted.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/sizing.mjs`'s `concentration`** in
 * shape only — positions plus proposed rows folded against a cap table, headroom
 * reported per axis. Its sleeve budgets, currency conversion and theme axis are that
 * package's and are not here.
 */

import { diagnostic, finite, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'

/**
 * @param {object} input
 * @param {{symbol:string, sector?:string, weight:number}} input.proposed  weight is the **increment** being added;
 *   `sector` is the **fund risk-management sector** the host classifies the account by, not this package's issuer kind
 * @param {Array} input.holdings       real positions: `{ symbol, sector, weight, strategy }` — required
 * @param {Array} input.openProposals  unapproved proposals: `{ symbol, sector, weight, strategy, decisionId }` — required
 * @param {object} [input.caps]        `{ accountPositionCap, strategyPositionCap, accountSectorCap, accountGrossCap }`
 * @param {string} [input.strategy]    this package's instance id, for the overlap message
 */
export function concentration(input = {}) {
  const diagnostics = []
  const proposed = input.proposed ?? {}
  const caps = input.caps ?? {}
  const symbol = proposed.symbol
  const sector = typeof proposed.sector === 'string' && proposed.sector.length > 0 ? proposed.sector : null

  if (typeof symbol !== 'string' || symbol.length === 0 || !finite(proposed.weight)) {
    diagnostics.push(
      diagnostic('proposal_not_readable', 'unevaluated', 'A concentration check needs the symbol and the weight being proposed.', 'proposed'),
    )
    return { data: emptyAnswer(), diagnostics }
  }

  // ── the account was read, or it was not ──────────────────────────────────
  for (const [name, value] of [
    ['holdings', input.holdings],
    ['openProposals', input.openProposals],
  ]) {
    if (Array.isArray(value)) continue
    diagnostics.push(
      diagnostic(
        'account_state_unreadable',
        'unevaluated',
        `${name} was not provided as a list, so this run has not seen that half of the account. An account nobody could read is not an empty account: treating it as one is the most permissive assumption available, and it is the one that returns a position onto a book that is already full.`,
        name,
      ),
    )
  }
  if (diagnostics.length > 0) return { data: emptyAnswer(), diagnostics }

  const holdings = input.holdings
  const openProposals = input.openProposals

  // ── what the account already holds, counted once per symbol ──────────────
  const heldBySymbol = new Map()
  for (const row of holdings) {
    if (typeof row?.symbol !== 'string' || !finite(row?.weight)) {
      diagnostics.push(
        diagnostic('position_row_unreadable', 'unevaluated', 'A holding row carries no symbol or no weight, so the account total below would be short by whatever it is. Nothing is judged against a total that is missing a row.', 'holdings'),
      )
      continue
    }
    const existing = heldBySymbol.get(row.symbol)
    if (existing === undefined) {
      heldBySymbol.set(row.symbol, { ...row })
      continue
    }
    diagnostics.push(
      diagnostic(
        'duplicate_position_rows',
        'warn',
        `${row.symbol} arrived as more than one holding row. A position is one quantity however many theses are attached to it, so the larger row is counted and the rest are not added.`,
        'holdings',
        { symbol: row.symbol },
      ),
    )
    if (row.weight > existing.weight) heldBySymbol.set(row.symbol, { ...row })
  }
  for (const row of openProposals) {
    if (typeof row?.symbol !== 'string' || !finite(row?.weight)) {
      diagnostics.push(
        diagnostic('open_proposal_row_unreadable', 'unevaluated', 'An open proposal row carries no symbol or no weight. It is exposure that is about to exist and it cannot be added, so no total here is complete.', 'openProposals'),
      )
    }
  }
  if (diagnostics.some((row) => row.severity === 'unevaluated')) {
    return { data: emptyAnswer(), diagnostics }
  }

  /**
   * ── An open proposal states a **total**, so the fold is `max` (#813) ──────
   *
   * ⛔ **The weight on an open-proposal row is what that proposal asks the
   * position to *become*, not an amount to add to it.** It is the host's
   * `targetWeight`, and `portfolio_get` says so in its own published description.
   * It is also what the host executes: a book holding 6% of a name, under another
   * manager's open proposal for a total of 12%, sends an order for the
   * *difference* and ends at 12%. Never 18%. So exposure to one name is
   *
   *     exposure = max(held, the largest total any open proposal asks for)
   *              = held + max(0, thatTotal − held)
   *
   * and what this function reports as `openProposals` is the second term — what
   * the pending proposals still require on top of the holding.
   *
   * ⚠️ **This package added the two until #813, and the overstatement refuses
   * positions.** A 6%-held name under a 15% pending total was read as 21%, which
   * against a 20% single-name ceiling is `risk_limit_exceeded` on a book with 5%
   * of room left. Two managers naming the same total have agreed on one end state
   * rather than asked for two, so their totals fold by `max` as well — that is
   * the host's own reading of the field, and the reason it publishes no sum.
   *
   * ⚠️ **`max`, and not «the latest total wins».** A pending *trim* does not
   * reduce exposure before it fills: a 14% holding under a proposal to take it to
   * 8% is 14% of this book right now, and a ceiling has to hold in both of the
   * states this account passes through.
   */
  const pendingBySymbol = new Map()
  for (const row of openProposals) {
    const entry = pendingBySymbol.get(row.symbol) ?? { peak: 0, sector: null }
    if (row.weight > entry.peak) entry.peak = row.weight
    if (entry.sector === null && typeof row.sector === 'string' && row.sector.length > 0) entry.sector = row.sector
    pendingBySymbol.set(row.symbol, entry)
  }

  /** One row per name this account is exposed to, already folded. */
  const exposureBySymbol = new Map()
  for (const name of new Set([...heldBySymbol.keys(), ...pendingBySymbol.keys()])) {
    const heldRow = heldBySymbol.get(name)
    const heldWeight = heldRow?.weight ?? 0
    const pending = pendingBySymbol.get(name) ?? { peak: 0, sector: null }
    const rowSector = typeof heldRow?.sector === 'string' && heldRow.sector.length > 0 ? heldRow.sector : pending.sector
    exposureBySymbol.set(name, {
      symbol: name,
      sector: typeof rowSector === 'string' && rowSector.length > 0 ? rowSector : null,
      held: heldWeight,
      exposure: Math.max(heldWeight, pending.peak),
    })
  }

  const held = heldBySymbol.get(symbol)?.weight ?? 0
  const existingExposure = exposureBySymbol.get(symbol)?.exposure ?? 0
  /** What the open proposals still require on top of the holding. Never negative. */
  const openSame = existingExposure - held
  for (const row of openProposals) {
    if (row.symbol !== symbol) continue
    if (input.strategy !== undefined && row.strategy !== undefined && row.strategy !== input.strategy) {
      diagnostics.push(
        diagnostic(
          'overlapping_open_proposal',
          'warn',
          `${row.strategy} already has an unapproved proposal taking ${symbol} to ${round(row.weight)} of the book. That is a total and not an addition: if it is approved the account holds the larger of it and what is already there, so it is folded here by maximum rather than added to the holding.`,
          'openProposals',
          { symbol, strategy: row.strategy, weight: round(row.weight), decisionId: row.decisionId ?? null },
        ),
      )
    }
  }

  const projected = existingExposure + proposed.weight

  // ── the whole book, which is what a gross cap is about ───────────────────
  let grossExposure = 0
  for (const row of exposureBySymbol.values()) grossExposure += row.exposure
  const grossExcludingName = grossExposure - existingExposure
  const projectedGross = grossExposure + proposed.weight

  // ── the caps, folded by minimum and never by sum ─────────────────────────
  const positionCaps = [
    ['accountPositionCap', caps.accountPositionCap],
    ['strategyPositionCap', caps.strategyPositionCap],
  ].filter(([, value]) => finite(value))
  if (positionCaps.length === 0) {
    diagnostics.push(
      diagnostic(
        'position_cap_not_stated',
        'unevaluated',
        'No single-name ceiling was stated for this account, so there is nothing to check the projection against. An absent cap is nobody having said, which is not permission.',
        'caps.accountPositionCap',
      ),
    )
    return { data: emptyAnswer({ existingExposure, projected, grossExposure }), diagnostics }
  }
  if (positionCaps.length > 1) {
    const sum = positionCaps.reduce((total, [, value]) => total + value, 0)
    diagnostics.push(
      diagnostic(
        'strategy_caps_do_not_sum',
        'info',
        `Two ceilings apply to this name and the binding one is the smaller. They are not added: ${round(sum)} of the book is what a run gets by summing limits that were each written as a limit on the whole.`,
        'caps',
        { caps: Object.fromEntries(positionCaps.map(([name, value]) => [name, round(value)])), sum: round(sum) },
      ),
    )
  }
  const positionCap = positionCaps.reduce(
    (lowest, [name, value]) => (value < lowest.value ? { name, value } : lowest),
    { name: positionCaps[0][0], value: positionCaps[0][1] },
  )

  const symbolHeadroom = positionCap.value - existingExposure
  if (projected > positionCap.value + THRESHOLDS.weightTolerance) {
    diagnostics.push(
      diagnostic(
        'concentration_limit_exceeded',
        'blocked',
        `${symbol} would reach ${round(projected)} of the account against a ${positionCap.name} of ${round(positionCap.value)}, counting ${round(held)} held and ${round(openSame)} already proposed. The claim may be right; the book cannot carry this much of it.`,
        'proposed.weight',
        { symbol, held: round(held), openProposals: round(openSame), proposed: round(proposed.weight), projected: round(projected), cap: round(positionCap.value), capName: positionCap.name },
      ),
    )
  }

  // ── the sector axis, on the same two sources ─────────────────────────────
  /**
   * Is this proposal **adding** exposure? `weight: 0` is the first pass asking what
   * the account permits this name to be, and a negative weight is a reduction. Only
   * an addition is withheld when a stated ceiling cannot be evaluated.
   */
  const increasesExposure = proposed.weight > THRESHOLDS.weightTolerance

  let sectorExposure = null
  let sectorExcludingName = null
  let sectorHeadroom = null
  /** `not-applicable` — no ceiling; `evaluated` — checked; `unevaluated` — stated and unformable. */
  let sectorLimitState = 'not-applicable'
  if (finite(caps.accountSectorCap)) {
    const unclassified = []
    for (const row of exposureBySymbol.values()) {
      if (row.sector !== null) continue
      if (row.exposure === 0) continue
      if (!unclassified.includes(row.symbol)) unclassified.push(row.symbol)
    }
    if (sector === null || unclassified.length > 0) {
      sectorLimitState = 'unevaluated'
      const parts = []
      if (sector === null) parts.push('this proposal does not say which sector it is in, so there is no bucket for it to join')
      if (unclassified.length > 0) {
        parts.push(
          `${unclassified.length} of the account's own rows ${unclassified.length === 1 ? 'carries' : 'carry'} no sector (${unclassified.join(', ')}), so the total this ceiling is measured against is short by whatever they are — a candidate that names its sector does not make that total formable`,
        )
      }
      diagnostics.push(
        diagnostic(
          'sector_exposure_unevaluated',
          /**
           * ⛔ The severity is the direction of the proposal, and that is deliberate.
           * A ceiling that could not be checked withholds the thing it constrains —
           * an addition — and says nothing about a reduction or about the question
           * «what may this name be?». `unevaluated` here makes `withinLimits` `null`,
           * and `null` is not a pass anywhere in this package.
           */
          increasesExposure ? 'unevaluated' : 'warn',
          `A sector ceiling of ${round(caps.accountSectorCap)} is stated for this account and ${parts.join('; and ')}. ${
            increasesExposure
              ? 'The increase is withheld: a limit the investor declared and this run could not verify is not a limit that passed, and approving an order under a warning is not the act of releasing it.'
              : 'Nothing is withheld — this proposal does not increase exposure, and a ceiling that could not be checked constrains additions rather than reductions.'
          } This is an absence and is recorded as \`data_missing\`: a classification nobody supplied is not a thesis anybody refuted.`,
          sector === null ? 'proposed.sector' : 'holdings',
          {
            cap: round(caps.accountSectorCap),
            increasesExposure,
            proposalSectorStated: sector !== null,
            unclassifiedRows: unclassified,
          },
        ),
      )
    } else {
      sectorLimitState = 'evaluated'
      sectorExposure = 0
      for (const row of exposureBySymbol.values()) if (row.sector === sector) sectorExposure += row.exposure
      sectorExcludingName = sectorExposure - existingExposure
      sectorHeadroom = caps.accountSectorCap - sectorExposure
      if (sectorExposure + proposed.weight > caps.accountSectorCap + THRESHOLDS.weightTolerance) {
        diagnostics.push(
          diagnostic(
            'sector_limit_exceeded',
            'blocked',
            `This sector would reach ${round(sectorExposure + proposed.weight)} against a ceiling of ${round(caps.accountSectorCap)}. A shareholder-return thesis is unusually likely to find several names in one sector at once, which is exactly when this limit is doing work.`,
            'proposed.sector',
            { sector, sectorExposure: round(sectorExposure), cap: round(caps.accountSectorCap) },
          ),
        )
      }
    }
  } else {
    /**
     * ⚠️ **An absent sector or gross cap is not the same defect as an absent
     * single-name cap, and the difference is why one refuses and one reports.** The
     * single-name cap is the one this package's own arithmetic would otherwise
     * substitute for, so its absence is `unevaluated`. A Mandate that states no
     * sector ceiling has not left a gap in a calculation — it has declined to
     * constrain that axis, and inventing one here would be this package writing a
     * limit the investor never approved. It is reported so the absence is visible on
     * the screen where they approve.
     */
    diagnostics.push(
      diagnostic(
        'sector_cap_not_applicable',
        'info',
        'This Mandate states no sector ceiling, so the sector axis is **not applicable** on this run rather than unchecked. It is said out loud rather than left as a silently skipped check, and the code says which of the two it is: nothing was skipped, because there was nothing to skip.',
        'caps.accountSectorCap',
      ),
    )
  }

  // ── the gross axis, which was declared and never read until now ──────────
  let grossHeadroom = null
  if (finite(caps.accountGrossCap)) {
    grossHeadroom = caps.accountGrossCap - grossExposure
    if (projectedGross > caps.accountGrossCap + THRESHOLDS.weightTolerance) {
      diagnostics.push(
        diagnostic(
          'gross_limit_exceeded',
          'blocked',
          `The account would be ${round(projectedGross)} invested against a gross ceiling of ${round(caps.accountGrossCap)}. Every single-name and sector limit can be satisfied by a book that is nonetheless fully committed, and this is the axis that says so.`,
          'caps.accountGrossCap',
          { grossExposure: round(grossExposure), projectedGross: round(projectedGross), cap: round(caps.accountGrossCap) },
        ),
      )
    }
  } else {
    diagnostics.push(
      diagnostic('gross_cap_not_stated', 'info', 'This Mandate states no whole-account exposure ceiling, so the gross axis constrains nothing on this run.', 'caps.accountGrossCap'),
    )
  }

  /**
   * ── The ceiling on this name's **final** weight ───────────────────────────
   *
   * Every axis is folded into one number, and it is a limit on what the position may
   * *be* rather than on what may be added to it. That is the distinction finding ③
   * was about: a single-name headroom passed to the sizing step as though it were a
   * cap produced a target that was sometimes a total and sometimes an increment, and
   * a host reading it either way was wrong.
   */
  const nameLimits = [
    [positionCap.name, positionCap.value],
    ['accountSectorCap', finite(sectorExcludingName) ? caps.accountSectorCap - sectorExcludingName : null],
    ['accountGrossCap', finite(caps.accountGrossCap) ? caps.accountGrossCap - grossExcludingName : null],
  ].filter(([, value]) => finite(value))
  const nameLimit = nameLimits.reduce(
    (lowest, [name, value]) => (value < lowest.value ? { name, value } : lowest),
    { name: nameLimits[0][0], value: nameLimits[0][1] },
  )

  const blocked = diagnostics.some((row) => row.severity === 'blocked')
  const unevaluated = diagnostics.some((row) => row.severity === 'unevaluated')
  return {
    data: {
      symbol,
      held: round(held),
      openProposals: round(openSame),
      existingExposure: round(existingExposure),
      projectedExposure: round(projected),
      bindingPositionCap: round(positionCap.value),
      bindingPositionCapName: positionCap.name,
      /** The most this name may ever be, across every axis the Mandate declared. */
      maxTotalWeightForName: round(Math.max(0, nameLimit.value)),
      maxTotalWeightBinding: nameLimit.name,
      symbolHeadroom: round(Math.max(0, symbolHeadroom)),
      sectorExposure: finite(sectorExposure) ? round(sectorExposure) : null,
      sectorHeadroom: finite(sectorHeadroom) ? round(Math.max(0, sectorHeadroom)) : null,
      /** `not-applicable` (no ceiling stated), `evaluated`, or `unevaluated` (stated and unformable). */
      sectorLimitState,
      grossExposure: round(grossExposure),
      projectedGrossExposure: round(projectedGross),
      grossHeadroom: finite(grossHeadroom) ? round(Math.max(0, grossHeadroom)) : null,
      /** ⛔ `true` only when every declared axis was checked and passed. `null` is not a pass. */
      withinLimits: unevaluated ? null : !blocked,
      outcomeCode: blocked ? 'risk_limit_exceeded' : unevaluated ? 'data_missing' : null,
      units: {
        held: 'portfolio-weight',
        projectedExposure: 'portfolio-weight',
        maxTotalWeightForName: 'portfolio-weight',
        symbolHeadroom: 'portfolio-weight',
        sectorHeadroom: 'portfolio-weight',
        grossExposure: 'portfolio-weight',
        grossHeadroom: 'portfolio-weight',
      },
    },
    diagnostics,
  }
}

function emptyAnswer(partial = {}) {
  return {
    symbol: null,
    held: null,
    openProposals: null,
    existingExposure: finite(partial.existingExposure) ? round(partial.existingExposure) : null,
    projectedExposure: finite(partial.projected) ? round(partial.projected) : null,
    bindingPositionCap: null,
    bindingPositionCapName: null,
    maxTotalWeightForName: null,
    maxTotalWeightBinding: null,
    symbolHeadroom: null,
    sectorExposure: null,
    sectorHeadroom: null,
    sectorLimitState: null,
    grossExposure: finite(partial.grossExposure) ? round(partial.grossExposure) : null,
    projectedGrossExposure: null,
    grossHeadroom: null,
    withinLimits: null,
    outcomeCode: 'data_missing',
    units: { projectedExposure: 'portfolio-weight' },
  }
}
