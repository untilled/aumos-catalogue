/**
 * How large the position may be, and what it costs when the thesis is wrong.
 *
 * ── The two things this file refuses to let a run forget ───────────────────
 *
 * ⑴ **A stop price is not a fill.** #259 says so and this is where it becomes a
 * number: the loss the sizing is done against is the distance to invalidation
 * **plus** a haircut for the session that opens through it. On KRX the ±30%
 * daily limit is not protection, it is the mechanism — a limit-down day is a day
 * on which the stop is a wish, and a halt is a day on which it is not even that.
 * A sizing that used the nominal distance would be sizing against a fill the
 * venue does not promise.
 *
 * ⑵ **The account's limit is the account's.** Exposure is counted over every
 * real holding **and** every open proposal on the same fund, whichever manager
 * or thesis produced it, because #256 fixes that per-strategy limits may never
 * sum into a larger account limit. A name held by another manager is held; a
 * proposal awaiting approval is exposure that has already been asked for.
 *
 * ⚠️ **The cap is not the order.** `mandate.singleNameCap` is the ceiling and
 * never the default weight — the weight comes from the risk budget divided by
 * the effective loss, and the cap only ever makes it smaller.
 *
 * ⑶ **A declared sector ceiling this run cannot check holds the increase (#269).**
 * This package had no sector concept at all, and «no concept, therefore no
 * conflict» was never a proof of anything: the host does not enforce a Mandate's
 * sector ceiling and this package did not receive it, so under such a Mandate a
 * correct-looking answer could put the account through a limit its investor had
 * declared. `mandate.sectorCap` is now read. Declared and formable, it is another
 * ceiling in the `min`; declared and unformable — the candidate carries no sector,
 * or a row of the book does — it refuses as `data_missing`, which withholds the
 * entry and leaves every review, trim and re-adjudication rung above it untouched.
 * Undeclared, it constrains nothing: a Mandate that states no sector ceiling has
 * declined to constrain that axis rather than left a gap.
 *
 * ⚠️ **That sector is the fund's risk-management classification** — the host's,
 * applied across the whole account — and not this package's reading of what
 * business a company is in. This package makes no such reading.
 */
import { THRESHOLDS, diagnostic, finite, narrowingOnly, round } from './core.mjs'

/**
 * The fewest adjacent readable closes from which «the worst session in this
 * name's recent history» is a measurement rather than a shrug.
 *
 * ⚠️ **This is not a threshold of the methodology and it is not pre-registered
 * with the others.** It is the point below which the *clamp* stops being a
 * bound on a measurement and starts being a substitute for one — see the ⛔ note
 * on `gapHaircut`. Twenty sessions is a month of trading; the sizing path is
 * only ever reached after `priceState` has already required 250 bars, so on a
 * real run there are 249 pairs and this never binds.
 */
export const GAP_HAIRCUT_MIN_PAIRS = 20

/**
 * The worst single-session downside move in the recent series, as the fraction
 * of price a gap can cost between one close and the next open.
 *
 * ⚠️ **Measured, floored and capped.** Measured, because a name that has already
 * gapped 12% is a name that gaps; floored at 3%, because a quiet history is not
 * a promise; capped at 15%, because one crash session would otherwise size every
 * position after it to nothing and that is a different methodology.
 *
 * ⛔ **The floor is a bound on a measurement and never a stand-in for one.** With
 * no readable pairs the loop leaves `worst` at 0, the clamp lifts it to 3%, and
 * the answer is a plausible number that nothing measured — the same shape as an
 * empty book reading as unlimited headroom. So too few pairs returns
 * `{ measurable: false }` with `total: null`, and `positionSizing` refuses on it
 * rather than sizing against a floor it invented.
 *
 * ⚠️ **`halted` and `dailyPriceLimit` must be declared as booleans.** An omitted
 * flag used to read as `false`, which is the *favourable* value — a caller who
 * said nothing got the smaller haircut. They are now reported as undeclared
 * (`unevaluated`), the conservative reading is not silently assumed either, and
 * `classifyCase` will not reach BUY on a sizing answer carrying an unevaluated
 * reading. ⛔ On XKRX `dailyPriceLimit` is `true`; this package does not fill it
 * in for the caller, because a package that guesses one venue fact will guess
 * the next one.
 */
export function gapHaircut(bars, execution = {}) {
  const rules = THRESHOLDS.sizing
  const window = (Array.isArray(bars) ? bars : []).slice(-rules.gapWindowBars)
  const halted = execution.halted
  const dailyPriceLimit = execution.dailyPriceLimit
  const undeclared = [
    typeof halted === 'boolean' ? null : 'halted',
    typeof dailyPriceLimit === 'boolean' ? null : 'dailyPriceLimit',
  ].filter(Boolean)

  let worst = 0
  let pairs = 0
  for (let index = 1; index < window.length; index += 1) {
    const previous = window[index - 1].close
    const current = window[index].close
    if (!finite(previous) || !finite(current) || previous <= 0) continue
    pairs += 1
    const move = current / previous - 1
    if (move < worst) worst = move
  }

  if (pairs < GAP_HAIRCUT_MIN_PAIRS) {
    return {
      measurable: false,
      pairs,
      requiredPairs: GAP_HAIRCUT_MIN_PAIRS,
      measuredWorstSession: null,
      bounded: null,
      executionRisk: null,
      total: null,
      floor: rules.gapHaircutFloor,
      cap: rules.gapHaircutCap,
      halted: typeof halted === 'boolean' ? halted : null,
      dailyPriceLimit: typeof dailyPriceLimit === 'boolean' ? dailyPriceLimit : null,
      undeclared,
    }
  }

  const measured = Math.abs(worst)
  const bounded = Math.min(Math.max(measured, rules.gapHaircutFloor), rules.gapHaircutCap)
  const executionRisk = halted === true || dailyPriceLimit === true ? rules.haltHaircut : 0
  return {
    measurable: true,
    pairs,
    requiredPairs: GAP_HAIRCUT_MIN_PAIRS,
    measuredWorstSession: round(measured),
    bounded: round(bounded),
    executionRisk,
    total: round(bounded + executionRisk),
    floor: rules.gapHaircutFloor,
    cap: rules.gapHaircutCap,
    halted: typeof halted === 'boolean' ? halted : null,
    dailyPriceLimit: typeof dailyPriceLimit === 'boolean' ? dailyPriceLimit : null,
    undeclared,
  }
}

/** The strategy name this package's own holdings and proposals are attributed to. */
export const STRATEGY_ID = 'fundamental-mean-reversion'

/**
 * Is this a book that was **read**, or a book-shaped absence?
 *
 * ⛔ **The distinction this function exists for.** `Array.isArray(x) ? x : []`
 * turns an account nobody could read into an account with no positions in it,
 * and an account with no positions has *unlimited* headroom under every cap
 * below. That defaulting is how a run that never saw the book returns a full
 * target weight, and nothing in the answer says so.
 *
 * So both arrays must be **present and array-shaped**. An empty one is a fact —
 * a fund really can hold nothing — and is accepted; a missing one is not a fact
 * and is refused by `positionSizing`.
 */
export function bookIsReadable(book) {
  return book !== null && typeof book === 'object' && Array.isArray(book.holdings) && Array.isArray(book.openProposals)
}

/**
 * Exposure to one name across the whole fund — real holdings and open proposals
 * together, with the per-strategy split carried but never used as a limit.
 *
 * ⚠️ Callers must have established `bookIsReadable(book)` first. The defaults
 * below exist so the fold cannot throw, not so an unread book can be sized
 * against.
 */
export function concentration(book, symbol, strategyId = STRATEGY_ID) {
  const holdings = Array.isArray(book?.holdings) ? book.holdings : []
  const proposals = Array.isArray(book?.openProposals) ? book.openProposals : []
  const held = holdings.filter((row) => row.symbol === symbol)
  const proposed = proposals.filter((row) => row.symbol === symbol)
  const sum = (rows, key) => round(rows.reduce((total, row) => total + (finite(row[key]) ? row[key] : 0), 0))
  const heldWeight = sum(held, 'weight')
  const proposedWeight = sum(proposed, 'targetWeight')
  const byStrategy = {}
  for (const row of held) byStrategy[row.strategy ?? 'unattributed'] = round((byStrategy[row.strategy ?? 'unattributed'] ?? 0) + (finite(row.weight) ? row.weight : 0))
  for (const row of proposed) byStrategy[row.strategy ?? 'unattributed'] = round((byStrategy[row.strategy ?? 'unattributed'] ?? 0) + (finite(row.targetWeight) ? row.targetWeight : 0))
  /**
   * ⚠️ **Own exposure is split out, and it is not a second limit.** It is
   * subtracted for one reason only: a cap applies to the *whole* position, so
   * what this thesis may hold in total is the cap less what **everyone else**
   * holds — and what it may buy today is that total less what it already has.
   * Conflating those two numbers is how a "target weight" gets executed as an
   * increment, or an increment as a target.
   */
  const ownWeight = round(byStrategy[strategyId] ?? 0)
  const existingWeight = round(heldWeight + proposedWeight)
  const grossExisting = round(sum(holdings, 'weight') + sum(proposals, 'targetWeight'))
  return {
    symbol,
    strategyId,
    heldWeight,
    proposedWeight,
    /** The number every cap below is measured against. One position, one quantity. */
    existingWeight,
    /** The part of it this manager is already responsible for. */
    ownWeight,
    /** The part of it belonging to every other strategy and open proposal. */
    otherWeight: round(existingWeight - ownWeight),
    byStrategy,
    grossHeld: sum(holdings, 'weight'),
    grossProposed: sum(proposals, 'targetWeight'),
    grossExisting,
    grossOther: round(grossExisting - ownWeight),
  }
}

/**
 * Exposure to one **fund risk-management sector**, over holdings and open
 * proposals together, and the rows that could not be classified at all.
 *
 * ⚠️ **The candidate's own sector is not the whole of the question.** A ceiling
 * is measured against a total, and one unclassified row makes the total short by
 * whatever it is — however well classified the candidate is. So the unformable
 * case is reported from the *book*, not only from the candidate.
 */
export function sectorConcentration(book, sector, symbol, strategyId = STRATEGY_ID) {
  const holdings = Array.isArray(book?.holdings) ? book.holdings : []
  const proposals = Array.isArray(book?.openProposals) ? book.openProposals : []
  const rows = [
    ...holdings.map((row) => ({ ...row, weight: row.weight })),
    ...proposals.map((row) => ({ ...row, weight: row.targetWeight })),
  ]
  const unclassified = []
  let exposure = 0
  let own = 0
  for (const row of rows) {
    if (!finite(row.weight) || row.weight === 0) continue
    if (typeof row.sector !== 'string' || row.sector.length === 0) {
      if (!unclassified.includes(row.symbol ?? 'unnamed')) unclassified.push(row.symbol ?? 'unnamed')
      continue
    }
    if (row.sector !== sector) continue
    exposure += row.weight
    if (row.symbol === symbol && (row.strategy ?? 'unattributed') === strategyId) own += row.weight
  }
  return { sector, exposure: round(exposure), ownWeight: round(own), otherWeight: round(exposure - own), unclassified }
}

/**
 * The whole position this thesis may hold, what buying it today would add, and
 * the loss the book takes if the thesis reaches its invalidation.
 *
 * ── Two weights, and they are never the same field ────────────────────────
 *
 * `targetTotalWeight` is *«the whole position should be this»*.
 * `incrementalWeight` is *«buy this much more today»*.
 *
 * One field carrying both meanings depending on who asked is a proposal the
 * host executes wrongly in one of the two readings, and there is no way for it
 * to tell which it was handed. So both are returned, always, and
 * `atOrAboveTarget` says when the second is zero because the position is
 * already there — a defined state rather than a refusal or a zero that reads
 * like «no room».
 */
export function positionSizing(input = {}) {
  const diagnostics = []
  const rules = THRESHOLDS.sizing
  const { symbol, entryPrice, invalidationPrice, nav, bars = [], mandate = {}, book, config = {}, execution, strategyId = STRATEGY_ID } = input

  if (!finite(entryPrice) || entryPrice <= 0 || !finite(invalidationPrice) || invalidationPrice <= 0) {
    diagnostics.push(diagnostic('sizing_prices_unreadable', 'blocked', 'A sizing needs a positive entry price and a positive invalidation price', 'input', { entryPrice, invalidationPrice }))
    return { status: 'refused', code: 'data_missing', diagnostics }
  }
  if (invalidationPrice >= entryPrice) {
    diagnostics.push(diagnostic('invalidation_not_below_entry', 'blocked', 'The invalidation price is at or above the entry price, so there is no measurable loss to size against', 'invalidationPrice', { entryPrice, invalidationPrice }))
    return { status: 'refused', code: 'research_incomplete', diagnostics }
  }
  if (!finite(nav) || nav <= 0) {
    diagnostics.push(diagnostic('nav_unreadable', 'blocked', 'The fund\'s net asset value is the denominator of every weight here and it is missing', 'nav', { nav }))
    return { status: 'refused', code: 'data_missing', diagnostics }
  }

  const riskBudget = narrowingOnly('perThesisRiskBudget', config.perThesisRiskBudget, rules.perThesisRiskBudget, 'lower', diagnostics)
  const lossToInvalidation = round((entryPrice - invalidationPrice) / entryPrice)
  const haircut = gapHaircut(bars, execution ?? {})
  /**
   * ⛔ **An unmeasurable haircut refuses; it does not fall back to the floor.**
   * The floor bounds a measurement from below and cannot stand in for one, and
   * an invented 3% here is the number the whole weight divides into.
   */
  if (haircut.measurable !== true) {
    diagnostics.push(diagnostic(
      'gap_haircut_unmeasurable',
      'blocked',
      `The worst single session could not be measured: ${haircut.pairs} readable adjacent close(s) against the ${haircut.requiredPairs} this needs. The clamp's floor bounds a measurement and is not a substitute for one — a stop price is not a fill, and how badly it is not a fill is exactly what was unmeasured here`,
      'bars',
      { pairs: haircut.pairs, requiredPairs: haircut.requiredPairs },
    ))
    return { status: 'refused', code: 'data_missing', haircut, diagnostics }
  }
  if (haircut.undeclared.length > 0) {
    /**
     * ⚠️ `unevaluated`, not `info`. An omitted flag used to read as `false` —
     * the *favourable* value — so a caller who said nothing got the smaller
     * haircut and a larger position. `classifyCase` refuses to reach BUY on a
     * sizing answer carrying an unevaluated reading.
     */
    diagnostics.push(diagnostic(
      'execution_conditions_undeclared',
      'unevaluated',
      `execution.${haircut.undeclared.join(' and execution.')} were not declared as booleans, so the halt component of the haircut was not evaluated. On XKRX a daily price limit exists and the honest declaration is \`dailyPriceLimit: true\`; this package will not fill a venue fact in on a caller's behalf`,
      'execution',
      { undeclared: haircut.undeclared },
    ))
  }
  const effectiveLoss = round(Math.min(lossToInvalidation + haircut.total, 1))
  const riskWeight = round(riskBudget / effectiveLoss)

  /** What a full position would be worth against what this name actually trades. */
  const liquidityWindow = bars.slice(-rules.liquidityWindowBars)
  const tradedValues = liquidityWindow.map((bar) => (finite(bar.close) && finite(bar.volume) ? bar.close * bar.volume : null)).filter(finite)
  const averageTradedValue = tradedValues.length ? round(tradedValues.reduce((total, value) => total + value, 0) / tradedValues.length) : null
  if (!finite(averageTradedValue) || averageTradedValue <= 0) {
    /**
     * ⛔ **Was `info`, and an `info` does not stop anything.** A ceiling that
     * could not be computed was simply dropped from the list, which is an
     * unmeasured constraint behaving exactly like an absent one — the defect
     * class this audit is about. A liquidity ceiling this package cannot
     * compute is missing data.
     */
    diagnostics.push(diagnostic(
      'liquidity_unreadable',
      'blocked',
      'No traded value could be computed from the series, so the liquidity ceiling is unmeasured. It is not thereby absent: dropping it from the list of ceilings would size this position as though the name traded without limit',
      'bars',
      { window: rules.liquidityWindowBars, readable: tradedValues.length },
    ))
    return { status: 'refused', code: 'data_missing', haircut, diagnostics }
  }
  const liquidityCap = round((averageTradedValue * rules.participationRate * rules.participationDays) / nav)

  /**
   * ⛔ **A book that was not read is not a book with nothing in it.** Defaulting
   * the two arrays turns an unread account into one with unlimited headroom
   * under every cap below, and the answer says nothing about it.
   */
  if (!bookIsReadable(book)) {
    diagnostics.push(diagnostic(
      'book_unreadable',
      'blocked',
      'The fund\'s holdings and open proposals are the denominator of every concentration reading here, and at least one of them was not an array. An empty array is a fact and is accepted; an absent one is not a fact, and treating it as empty is how a run that never saw the account returns a full target weight',
      'book',
      { holdings: Array.isArray(book?.holdings), openProposals: Array.isArray(book?.openProposals) },
    ))
    return { status: 'refused', code: 'data_missing', haircut, diagnostics }
  }

  const exposure = concentration(book, symbol, strategyId)
  const singleNameCap = finite(mandate.singleNameCap) ? mandate.singleNameCap : null
  const grossCap = finite(mandate.grossCap) ? mandate.grossCap : null
  if (singleNameCap === null) {
    diagnostics.push(diagnostic('mandate_single_name_cap_missing', 'blocked', 'The mandate\'s single-name ceiling is what this weight is measured against and it is missing. A run that sized without it would be choosing its own limit', 'mandate.singleNameCap'))
    return { status: 'refused', code: 'data_missing', haircut, exposure, diagnostics }
  }
  /**
   * ⛔ **And the gross cap is refused on the same argument.** It was named in
   * this function's input contract and, when absent, its headroom was `null`,
   * filtered out of the ceiling list, and silently not applied — a declared
   * account limit that a caller could omit its way past.
   */
  if (grossCap === null) {
    diagnostics.push(diagnostic(
      'mandate_gross_cap_missing',
      'blocked',
      'The mandate\'s gross ceiling is named in this operation\'s input contract and was not readable. An unreadable limit is not an absent one, and dropping it from the list of ceilings is the difference between a book at 79% invested and one with room',
      'mandate.grossCap',
    ))
    return { status: 'refused', code: 'data_missing', haircut, exposure, diagnostics }
  }
  /**
   * ── the sector ceiling, which nothing here used to read (#269) ───────────
   *
   * ⛔ **Declared and unevaluable refuses; undeclared constrains nothing.** The
   * two are different facts and only the first withholds anything. The refusal
   * is `data_missing`, so `classifyCase` reaches it below the held-position
   * rungs: a trim, a re-adjudication and an exit are never withheld by a limit
   * that only constrains additions.
   */
  const sectorCap = finite(mandate.sectorCap) ? mandate.sectorCap : null
  const candidateSector = typeof input.sector === 'string' && input.sector.length > 0 ? input.sector : null
  let sectorExposure = null
  let headroomSector = null
  if (sectorCap !== null) {
    sectorExposure = sectorConcentration(book, candidateSector, symbol, strategyId)
    if (candidateSector === null || sectorExposure.unclassified.length > 0) {
      diagnostics.push(diagnostic(
        'sector_exposure_unevaluable',
        'blocked',
        `A sector ceiling of ${sectorCap} is declared and the total it is measured against cannot be formed: ${[
          candidateSector === null ? 'this candidate does not say which sector it is in' : null,
          sectorExposure.unclassified.length > 0 ? `${sectorExposure.unclassified.join(', ')} in the book carr${sectorExposure.unclassified.length === 1 ? 'ies' : 'y'} no sector` : null,
        ].filter(Boolean).join('; ')}. A declared limit this run could not verify is not a limit that passed, and no exposure is increased under one. This is an absence about the account and says nothing about the thesis`,
        'mandate.sectorCap',
        { sectorCap, candidateSector, unclassified: sectorExposure.unclassified },
      ))
      return { status: 'refused', code: 'data_missing', haircut, exposure, sectorExposure, diagnostics }
    }
    headroomSector = round(sectorCap - sectorExposure.otherWeight)
  } else {
    diagnostics.push(diagnostic(
      'sector_cap_not_applicable',
      'info',
      'This mandate declares no sector ceiling, so the sector axis is not applicable on this run rather than unchecked. Said out loud, because an axis nobody looked at and an axis nobody declared must not leave the same trace',
      'mandate.sectorCap',
    ))
  }

  /**
   * ⛔ **A per-strategy allowance never raises the account's ceiling.** It is
   * read only to make the smaller of the two bind, and a caller handing in one
   * that is larger is told so rather than obeyed.
   */
  let strategyCap = finite(mandate.strategyCap) ? mandate.strategyCap : null
  if (strategyCap !== null && strategyCap > singleNameCap) {
    diagnostics.push(diagnostic(
      'strategy_cap_exceeds_account_cap',
      'info',
      'The per-strategy allowance handed in is larger than the account\'s single-name ceiling and was ignored. Per-strategy limits constrain a strategy; they never sum into a larger account limit',
      'mandate.strategyCap',
      { strategyCap, singleNameCap },
    ))
    strategyCap = singleNameCap
  }

  /**
   * ⚠️ **Every headroom is measured against what *other* strategies hold**, not
   * against the total. The caps bound the whole position, and this thesis's own
   * existing weight is part of the position being bounded — subtracting it here
   * as well as at `incrementalWeight` below would charge it twice and shrink a
   * position every time the manager re-ran on it.
   */
  const headroomSingleName = round(singleNameCap - exposure.otherWeight)
  const headroomStrategy = strategyCap === null ? null : round(strategyCap - exposure.otherWeight)
  const headroomGross = round(grossCap - exposure.grossOther)

  const ceilings = [
    { name: 'risk-budget', value: riskWeight },
    { name: 'liquidity', value: liquidityCap },
    { name: 'single-name-headroom', value: headroomSingleName },
    { name: 'strategy-headroom', value: headroomStrategy },
    { name: 'gross-headroom', value: headroomGross },
    { name: 'sector-headroom', value: headroomSector },
  ].filter((row) => finite(row.value))

  const binding = ceilings.reduce((lowest, row) => (lowest === null || row.value < lowest.value ? row : lowest), null)
  /** *«The whole position should be this.»* */
  const targetTotalWeight = binding ? round(Math.max(binding.value, 0)) : 0
  /** *«Buy this much more today.»* Never negative: a reduction is an exit decision. */
  const incrementalWeight = round(Math.max(targetTotalWeight - exposure.ownWeight, 0))
  const atOrAboveTarget = targetTotalWeight > 0 && incrementalWeight === 0

  const result = {
    status: 'ok',
    symbol,
    strategyId,
    riskBudget,
    lossToInvalidation,
    haircut,
    /** `lossToInvalidation + gap + halt`, and the number every weight below divides into. */
    effectiveLoss,
    riskWeight,
    liquidityCap,
    averageTradedValue,
    exposure,
    sectorExposure,
    ceilings,
    bindingConstraint: binding?.name ?? null,
    /**
     * ⚠️ **Two weights and two meanings, always both present.** One field doing
     * both jobs is a proposal the host executes wrongly in one of its two
     * readings with no way to tell which it was handed.
     */
    targetTotalWeight,
    incrementalWeight,
    atOrAboveTarget,
    /** The cumulative staged target: the whole position, not the rung. Same number as `targetTotalWeight`, under the name the staged plan uses. */
    plannedTotalWeight: targetTotalWeight,
    /** What the book loses if the whole position is held and reaches invalidation. */
    downsideFraction: round(targetTotalWeight * effectiveLoss),
    downsideValue: round(targetTotalWeight * effectiveLoss * nav),
    diagnostics,
  }

  if (targetTotalWeight <= 0) {
    diagnostics.push(diagnostic(
      'risk_limit_exceeded',
      'blocked',
      `There is no room for this position: the binding constraint is ${binding?.name ?? 'unknown'}. That is a finding about the book and not about the thesis — the thesis is neither refuted nor incomplete`,
      'targetTotalWeight',
      { binding: binding?.name ?? null, ceilings },
    ))
    return { ...result, status: 'refused', code: 'risk_limit_exceeded' }
  }
  if (atOrAboveTarget) {
    /**
     * ⚠️ A defined state and not a refusal. The thesis stands, the position is
     * the size it should be, and there is nothing to buy — which is a different
     * sentence from «there is no room», and would be a different decision if the
     * two were reported as one zero.
     */
    diagnostics.push(diagnostic(
      'position_at_or_above_target',
      'info',
      'This thesis already holds its whole target weight, so today\'s increment is zero. That is not a risk limit and not a refutation: the position is complete',
      'incrementalWeight',
      { targetTotalWeight, ownWeight: exposure.ownWeight },
    ))
  }
  return result
}
