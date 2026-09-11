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
import { mandateCeilings } from './mandate.mjs'

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
 * ── An open proposal states a **total**, so the fold is `max` (#813) ────────
 *
 * ⛔ **`targetWeight` on an open-proposal row is what that proposal asks the
 * position to *become*, and this function used to add it to the holding.** The
 * name was right and the arithmetic was not: it is the host's own field, and
 * `portfolio_get` publishes «a total weight, not an increment» in its
 * description. It is also what the host executes — a book holding 6% of a name,
 * under another manager's proposal for a total of 12%, sends an order for the
 * *difference* and ends at 12%. Never 18%. So
 *
 *     existingWeight = max(heldWeight, the largest total any proposal asks for)
 *
 * and `proposedWeight` is what those proposals still require **on top of** the
 * holding — `existingWeight − heldWeight`, never negative.
 *
 * ⚠️ **The overstatement refuses positions.** A 6%-held name under a 15% pending
 * total was read as 21%, and against a 20% single-name ceiling `positionSizing`
 * answered `refused / risk_limit_exceeded` on a book with 5% of room. Two
 * managers naming the same total have agreed on one end state rather than asked
 * for two, so their totals fold by `max` as well.
 *
 * ⚠️ **`max`, and not «the latest total wins».** A pending *trim* does not reduce
 * exposure before it fills: a 14% holding under a proposal to take it to 8% is
 * 14% of this book right now, and a ceiling has to hold in both of the states the
 * account passes through.
 *
 * ── One name is one position, however many theses point at it (#256) ───────
 *
 * ⛔ **Two holding rows for one symbol used to be added together.** A 6% row
 * attributed here and a 6% row attributed to another desk read as a 12%
 * position, and nothing in the answer said a row had been counted twice: the
 * name then looked like it was at its ceiling and this desk's own buy was
 * refused, or — one axis over — a sale was sized out of a quantity that does not
 * exist. The host does not emit that shape. Its `broker-book.ts` merges every
 * row of the same asset into **one** `Position` before this package sees it, and
 * `discovery-service.ts` maps positions one-to-one with at most one assignment
 * per `assetKey`. So a second row for a name is a restatement of the same
 * quantity — a duplicate — and not a second holding.
 *
 * The fold is therefore `max` on the name, and `duplicate_holding_rows` (`info`)
 * says it happened. #256: «보유 종목에 복수 thesis가 붙어도 포지션 수량은 하나다.»
 *
 * ⚠️ **Attribution folds the same way, one bucket at a time.** Two rows for one
 * name carrying *different* `strategy` values are two claims about who the
 * position belongs to, not two positions: each bucket keeps its own largest row,
 * and the position is the largest row of all. `ownHeldWeight` is then clamped by
 * `heldWeight` exactly as it was before, so mixed attribution can never make the
 * parts add to more than the whole. Nothing about #814/#817/#819–#823 changes —
 * those rules read `heldByStrategy`, and what moved is how a bucket is filled.
 *
 * ⚠️ Callers must have established `bookIsReadable(book)` first. The defaults
 * below exist so the fold cannot throw, not so an unread book can be sized
 * against.
 */
export function concentration(book, symbol, strategyId = STRATEGY_ID) {
  const holdings = Array.isArray(book?.holdings) ? book.holdings : []
  const proposals = Array.isArray(book?.openProposals) ? book.openProposals : []
  const diagnostics = []
  const duplicated = []

  /**
   * One row per name the fund is exposed to: what is held, and the largest total
   * any open proposal asks that name to become.
   */
  const byName = new Map()
  const nameOf = (row) => (typeof row?.symbol === 'string' ? row.symbol : 'unnamed')
  for (const row of holdings) {
    const name = nameOf(row)
    const seen = byName.get(name)
    const entry = seen ?? { held: 0, pendingPeak: 0, heldByStrategy: {}, pendingPeakByStrategy: {}, rows: 0 }
    const weight = finite(row?.weight) ? row.weight : 0
    const owner = row?.strategy ?? 'unattributed'
    entry.rows += 1
    if (entry.rows > 1 && !duplicated.includes(name)) duplicated.push(name)
    /** One name, one quantity — the largest row, never the sum of them. */
    entry.held = round(Math.max(entry.held, weight))
    entry.heldByStrategy[owner] = round(Math.max(entry.heldByStrategy[owner] ?? 0, weight))
    byName.set(name, entry)
  }
  if (duplicated.length > 0) {
    diagnostics.push(diagnostic(
      'duplicate_holding_rows',
      'info',
      `${duplicated.join(', ')} arrived as more than one holding row. A position is one quantity however many theses are attached to it, so the largest row is counted on each attribution and the rest are not added to it`,
      'book.holdings',
      { symbols: [...duplicated] },
    ))
  }
  for (const row of proposals) {
    const entry = byName.get(nameOf(row)) ?? { held: 0, pendingPeak: 0, heldByStrategy: {}, pendingPeakByStrategy: {}, rows: 0 }
    const target = finite(row?.targetWeight) ? row.targetWeight : 0
    const owner = row?.strategy ?? 'unattributed'
    entry.pendingPeak = Math.max(entry.pendingPeak, target)
    entry.pendingPeakByStrategy[owner] = Math.max(entry.pendingPeakByStrategy[owner] ?? 0, target)
    byName.set(nameOf(row), entry)
  }
  const exposureOf = (entry) => round(Math.max(entry?.held ?? 0, entry?.pendingPeak ?? 0))

  const entry = byName.get(symbol) ?? { held: 0, pendingPeak: 0, heldByStrategy: {}, pendingPeakByStrategy: {}, rows: 0 }
  const heldWeight = round(entry.held)
  const existingWeight = exposureOf(entry)
  /** What the open proposals still require on top of the holding. Never negative. */
  const proposedWeight = round(existingWeight - heldWeight)
  const byStrategy = {}
  for (const owner of new Set([...Object.keys(entry.heldByStrategy), ...Object.keys(entry.pendingPeakByStrategy)])) {
    byStrategy[owner] = round(Math.min(existingWeight, Math.max(entry.heldByStrategy[owner] ?? 0, entry.pendingPeakByStrategy[owner] ?? 0)))
  }
  /**
   * ⚠️ **Own exposure is split out, and it is not a second limit.** It is
   * subtracted for one reason only: a cap applies to the *whole* position, so
   * what this thesis may hold in total is the cap less what **everyone else**
   * holds — and what it may buy today is that total less what it already has.
   * Conflating those two numbers is how a "target weight" gets executed as an
   * increment, or an increment as a target.
   */
  const ownWeight = round(byStrategy[strategyId] ?? 0)
  /**
   * ── The one number the host's `targetWeight` needs, and `otherWeight` is not it (#817) ──
   *
   * ⛔ **`otherWeight` folds open proposals in, and an open proposal is not a
   * position.** It is the right number for a *ceiling* — a limit has to hold in
   * every state the account passes through, so a pending buy counts before it
   * fills. It is the wrong number for the weight this run hands the host,
   * because the host executes a `position-weight` target against the **whole
   * position** and a position is what is actually held. Adding somebody's
   * unfilled proposal to the target would buy their proposal for them.
   *
   * So the write direction needs holdings only, split by attribution:
   *
   *     ownHeldWeight   what is held and assigned to this manager
   *     otherHeldWeight everything else that is held — another manager's, and
   *                     every unattributed row, which is not this desk's either
   *
   * ⚠️ **Unattributed lands in `otherHeldWeight`, and that is the point.** A row
   * bought by hand in a broker app, or one whose approval never named a manager,
   * carries no `strategy` and reads as `unattributed` — and a position nobody is
   * assigned to is not a position this desk runs (`untilled/aumos#785`,
   * `aumos-catalogue#268` §1). Guessing the other way is how a BUY leaves here as
   * a sale of a holding nobody asked to sell.
   */
  const ownHeldWeight = round(entry.heldByStrategy[strategyId] ?? 0)
  const otherHeldWeight = round(Math.max(0, heldWeight - ownHeldWeight))
  let grossExisting = 0
  let grossHeld = 0
  for (const row of byName.values()) {
    grossExisting = round(grossExisting + exposureOf(row))
    grossHeld = round(grossHeld + row.held)
  }
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
    otherWeight: round(Math.max(0, existingWeight - ownWeight)),
    /** ⚠️ **Holdings only.** What is really held and assigned to this manager. */
    ownHeldWeight,
    /**
     * ⚠️ **Holdings only, and the term the host's `targetWeight` is built on
     * (#817).** Another manager's holding plus every unattributed one. No open
     * proposal is in here: an unfilled proposal is not a position, and the host
     * executes against positions.
     */
    otherHeldWeight,
    byStrategy,
    grossHeld,
    /** What every open proposal on the fund still requires on top of what is held. */
    grossProposed: round(grossExisting - grossHeld),
    grossExisting,
    grossOther: round(grossExisting - ownWeight),
    /**
     * ⚠️ **The gross term's holdings-only twin (#826).** `grossOther` folds
     * every open proposal on the fund in, which is right for a ceiling on a new
     * position and wrong for a judgement that reduces one: nobody else's
     * unfilled proposal may decide how much of its own position this desk sells.
     * Same split as `otherHeldWeight`, one axis wider.
     */
    grossOtherHeld: round(Math.max(0, grossHeld - ownHeldWeight)),
    /** ⚠️ `info` only. A duplicated row is a shape to report, never a reason to refuse. */
    diagnostics,
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
 *
 * ⚠️ **The names fold before the sector adds them up (#813).** A proposal states
 * the weight it asks a position to become, so a name held at 6% under a pending
 * total of 12% is 12% of this sector and not 18% of it. Adding the two here as
 * well as in `concentration` is the same overstatement twice.
 *
 * ⚠️ **And duplicate holding rows fold by `max` here too (#256).** The same
 * sentence one axis up: a name that arrives twice is one position, so a sector
 * total that added both rows was over by whichever row was smaller. The
 * `duplicate_holding_rows` diagnostic is raised by `concentration`, which sees
 * the same book; this function folds and does not say it twice.
 */
export function sectorConcentration(book, sector, symbol, strategyId = STRATEGY_ID) {
  const holdings = Array.isArray(book?.holdings) ? book.holdings : []
  const proposals = Array.isArray(book?.openProposals) ? book.openProposals : []
  const byName = new Map()
  const entryFor = (name) => {
    const entry = byName.get(name) ?? { symbol: name, sector: null, held: 0, pendingPeak: 0, ownHeld: 0, ownPendingPeak: 0 }
    byName.set(name, entry)
    return entry
  }
  for (const row of holdings) {
    const entry = entryFor(typeof row?.symbol === 'string' ? row.symbol : 'unnamed')
    const weight = finite(row?.weight) ? row.weight : 0
    if (entry.sector === null && typeof row?.sector === 'string' && row.sector.length > 0) entry.sector = row.sector
    entry.held = round(Math.max(entry.held, weight))
    if ((row?.strategy ?? 'unattributed') === strategyId) entry.ownHeld = round(Math.max(entry.ownHeld, weight))
  }
  for (const row of proposals) {
    const entry = entryFor(typeof row?.symbol === 'string' ? row.symbol : 'unnamed')
    const target = finite(row?.targetWeight) ? row.targetWeight : 0
    if (entry.sector === null && typeof row?.sector === 'string' && row.sector.length > 0) entry.sector = row.sector
    entry.pendingPeak = Math.max(entry.pendingPeak, target)
    if ((row?.strategy ?? 'unattributed') === strategyId) entry.ownPendingPeak = Math.max(entry.ownPendingPeak, target)
  }

  const unclassified = []
  let exposure = 0
  let own = 0
  let heldExposure = 0
  let ownHeld = 0
  for (const entry of byName.values()) {
    const folded = round(Math.max(entry.held, entry.pendingPeak))
    if (folded === 0) continue
    if (entry.sector === null) {
      if (!unclassified.includes(entry.symbol)) unclassified.push(entry.symbol)
      continue
    }
    if (entry.sector !== sector) continue
    exposure = round(exposure + folded)
    heldExposure = round(heldExposure + entry.held)
    if (entry.symbol === symbol) {
      own = round(Math.min(folded, Math.max(entry.ownHeld, entry.ownPendingPeak)))
      ownHeld = round(Math.min(entry.held, entry.ownHeld))
    }
  }
  return {
    sector,
    exposure: round(exposure),
    ownWeight: round(own),
    otherWeight: round(Math.max(0, exposure - own)),
    /**
     * ⚠️ **The same sector, over positions only (#826).** A pending proposal is
     * sector exposure the moment it is written — a ceiling has to hold in every
     * state the account passes through — and it is not a position, so it may not
     * enlarge the sale this desk makes out of its own holding.
     */
    heldExposure: round(heldExposure),
    ownHeldWeight: round(ownHeld),
    otherHeldWeight: round(Math.max(0, heldExposure - ownHeld)),
    unclassified,
  }
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
 *
 * ── And a third, which is the only one the host may be handed (#817) ───────
 *
 * `hostTargetWeight` is *«the whole position should be this»* — `targetTotalWeight`
 * plus every holding of this name that is **not** this manager's. The two above
 * are this thesis's arithmetic; this one is the wire. Handing over
 * `targetTotalWeight` on a book where somebody else holds the name is an order
 * to sell down to this desk's share, and the run that does it can be a BUY.
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
  /** ⚠️ The duplicate-row finding travels with the answer; it never refuses one. */
  diagnostics.push(...exposure.diagnostics)
  /**
   * ── The Mandate, under the host's names as well as this package's (#838) ──
   *
   * ⚠️ **`maxPositionWeight` is the single-name ceiling and `1 − cashFloor` is
   * the gross one.** Both are questions the investor is actually asked and both
   * arrive on every invocation; this package read neither, so a run handed the
   * Mandate verbatim refused on both lines below and sized nothing. The names
   * this file uses still win where a caller states them, which is why nothing
   * measured here moves. `mandate.mjs` carries the rule and the discriminator.
   */
  const ceilingsDeclared = mandateCeilings(mandate)
  const singleNameCap = ceilingsDeclared.singleNameCap
  const grossCap = ceilingsDeclared.grossCap
  if (singleNameCap === null) {
    diagnostics.push(diagnostic('mandate_single_name_cap_missing', 'blocked', 'The mandate\'s single-name ceiling is what this weight is measured against and it is missing. A run that sized without it would be choosing its own limit', 'mandate.singleNameCap'))
    return { status: 'refused', code: 'data_missing', haircut, exposure, diagnostics }
  }
  /**
   * ⛔ **An unread gross cap refuses; a Mandate that declares none constrains
   * nothing.** The refusal is the older half and it stands: named in this
   * function's input contract and absent, its headroom was `null`, filtered out
   * of the ceiling list and silently not applied — a declared account limit a
   * caller could omit its way past.
   *
   * ⚠️ **What #838 separated out is the other half.** There is no `grossCap`
   * anywhere in the host's Mandate; what there is is `cashFloor`, and an
   * investor who answered neither question has declined to constrain the gross
   * axis rather than left a gap. That is `sizing.mjs`'s own sector sentence —
   * *declared and unevaluable refuses; undeclared constrains nothing* — applied
   * to the axis that was contradicting it four lines away.
   */
  if (grossCap === null) {
    if (!ceilingsDeclared.read) {
      diagnostics.push(diagnostic(
        'mandate_gross_cap_missing',
        'blocked',
        'The mandate\'s gross ceiling is named in this operation\'s input contract and was not readable. An unreadable limit is not an absent one, and dropping it from the list of ceilings is the difference between a book at 79% invested and one with room',
        'mandate.grossCap',
      ))
      return { status: 'refused', code: 'data_missing', haircut, exposure, diagnostics }
    }
    diagnostics.push(diagnostic(
      'gross_cap_not_applicable',
      'info',
      'This mandate was read and states neither a gross ceiling nor a cash floor, so the gross axis is not applicable on this run rather than unchecked. Said out loud, because an axis nobody looked at and an axis nobody declared must not leave the same trace',
      'mandate.grossCap',
    ))
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
  /**
   * ── One list of ceilings, folded twice, and a pending proposal is what separates them (#826) ──
   *
   * ⛔ **A pending total is exposure for a ceiling and is not a position for an
   * order.** The three book-derived ceilings above are measured against
   * `otherWeight` — the `max` of what others hold and what their open proposals
   * ask for (`aumos-catalogue#275`) — and that is right for *«how much may this
   * desk buy»*: a limit has to hold in every state the account passes through,
   * so somebody's unfilled buy counts before it fills.
   *
   * It is the wrong number for *«how much should this desk sell»*. Until #826
   * there was one fold and `classifyCase`'s `reduce` role clamped this desk's
   * share against it, so an entry ceiling narrowed by a proposal nobody had
   * approved became a **larger sale**: measured to the exchange, a 6% position
   * wholly this desk's went from `sell:23` to `sell:50` when another manager
   * sealed an unapproved 15% BUY on the same name, and to the whole position
   * when the pending total passed the cap. `shareholder-rerating` already
   * carried the sentence this closes; this package did not.
   *
   * ⚠️ **So the two ceilings that read no book fold identically and the three
   * that do are re-measured against holdings.** `risk-budget` and `liquidity`
   * are properties of the thesis and the tape, so the held-only fold is
   * frequently the entry fold — which is exactly why an empty book, the common
   * case, is a byte-for-byte identity.
   */
  /**
   * ── And a second axis under that one: two kinds of ceiling (#835) ─────────
   *
   * ⛔ **A ceiling that names *this position* and a ceiling that is the
   * account's leftover room after *other names* are not the same statement**,
   * and folding them together produced the number that sized a **sale**.
   *
   *   ⚠️ **`nameAxes`** — `risk-budget` and `liquidity` are properties of this
   *      thesis and this tape; `single-name-headroom` and `strategy-headroom`
   *      are ceilings on **this name**, less what other desks hold *of it*.
   *      Every one of them says *«this position may be at most X»*. They need
   *      no division between names, and a desk over one of them reduces itself.
   *
   *   ⚠️ **`residualAxes`** — the gross and sector ceilings *less everything
   *      else in the bucket* — say *«after the other names, this much is
   *      left»*. That is the right ceiling for an **addition**, because a limit
   *      has to hold in every state the account passes through (#813). It is
   *      **not a size for this position**.
   *
   * ⛔ **Because a residual is not an allocation, folding it into a reduction
   * makes the answer depend on evaluation order.** A sector ceiling states no
   * division of itself between the names under it, so reading *«the sector has
   * 0.01 left»* as *«this position must become 0.01»* hands the whole
   * adjustment to whichever name was evaluated last — including when every
   * other name in the bucket belongs to a desk this run cannot reduce at all.
   * Measured through the real host on a 6% position **wholly this desk's**, its
   * thesis invalidated, under a 0.25 sector ceiling: another name at 0.24 of the
   * sector turned `sell:23` into `sell:50`, 0.245 into `sell:55`, and 0.3 into
   * `sell:60` — **the whole position**, which nobody asked to liquidate. The
   * gross axis is the same arithmetic with a wider bucket, and the owner of that
   * other name — another desk, this desk, or nobody — made no difference at all.
   *
   * ⚠️ **`shareholder-rerating` carried this sentence first** (`#833`,
   * `aumos-catalogue#286`); this package carried only the axis above it.
   */
  const nameAxes = (otherName) => [
    { name: 'risk-budget', value: riskWeight },
    { name: 'liquidity', value: liquidityCap },
    { name: 'single-name-headroom', value: round(singleNameCap - otherName) },
    { name: 'strategy-headroom', value: strategyCap === null ? null : round(strategyCap - otherName) },
  ]
  const residualAxes = (otherGross, otherSector) => [
    { name: 'gross-headroom', value: grossCap === null ? null : round(grossCap - otherGross) },
    { name: 'sector-headroom', value: otherSector === null ? null : round(sectorCap - otherSector) },
  ]
  const ceilingsAgainst = (otherName, otherGross, otherSector) =>
    [...nameAxes(otherName), ...residualAxes(otherGross, otherSector)].filter((row) => finite(row.value))
  /** ⛔ The same list with the account's leftover room left out. Nothing else differs. */
  const nameCeilingsAgainst = (otherName) => nameAxes(otherName).filter((row) => finite(row.value))
  const foldCeilings = (rows) => {
    const lowest = rows.reduce((best, row) => (best === null || row.value < best.value ? row : best), null)
    return { binding: lowest, total: lowest ? round(Math.max(lowest.value, 0)) : 0 }
  }

  const ceilings = ceilingsAgainst(
    exposure.otherWeight,
    exposure.grossOther,
    sectorCap === null || sectorExposure === null ? null : sectorExposure.otherWeight,
  )
  const heldOnlyCeilings = ceilingsAgainst(
    exposure.otherHeldWeight,
    exposure.grossOtherHeld,
    sectorCap === null || sectorExposure === null ? null : sectorExposure.otherHeldWeight,
  )

  /**
   * ⚠️ **The reduction fold is where the two axes compose (#826, #835).** A sale
   * is measured against holdings only *and* against the ceilings that name this
   * position — nobody's unfilled proposal and nobody else's *name* may decide
   * how much of its own holding this desk sells. With no open proposal and
   * nothing else in the bucket all three folds are one number, which is why the
   * ordinary account is a byte-for-byte identity.
   */
  const reductionCeilings = nameCeilingsAgainst(exposure.otherHeldWeight)

  const { binding, total: targetTotalWeight } = foldCeilings(ceilings)
  const { binding: heldOnlyBinding, total: heldOnlyTargetTotalWeight } = foldCeilings(heldOnlyCeilings)
  const { binding: reductionBinding, total: reductionTargetTotalWeight } = foldCeilings(reductionCeilings)
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
     * ── The same fold with nobody's unfilled proposal in it (#826) ──────────
     *
     * ⛔ **`classifyCase`'s `reduce` role is the only consumer, and the entry
     * path does not read this.** `#813` folds pending totals into every
     * book-derived ceiling and that judgement stands for the buying question;
     * what may not follow from it is a sale. A judgement to reduce is bounded
     * by what this desk *holds* — `hostTargetWeight = otherHeld +
     * min(heldOnlyTargetTotalWeight, ownHeldWeight)` — so a proposal that was
     * never approved and never filled neither creates a reduction nor enlarges
     * one.
     *
     * ⚠️ **Published rather than folded in here, because the two answer
     * different questions and both are true.** A caller that wants to know why
     * this desk may buy so little reads `bindingConstraint`; one that wants to
     * know what a reduction is measured against reads
     * `heldOnlyBindingConstraint`. Collapsing them would be the single number
     * without a judgement that `#823` is about, one axis over.
     */
    heldOnlyCeilings,
    heldOnlyBindingConstraint: heldOnlyBinding?.name ?? null,
    heldOnlyTargetTotalWeight,
    /**
     * ── The same fold with the account's leftover room left out (#835) ──────
     *
     * ⛔ **`classifyCase`'s `reduce` role is the only consumer, and the entry
     * path does not read this.** A ceiling constrains additions rather than
     * reductions, so a sale is sized by what the risk arithmetic says this
     * position should be and by the ceilings that **name** it — never by what
     * is left of a sector or of the whole book after somebody else's names.
     *
     * ⚠️ **Published rather than folded in, because the two answer different
     * questions and both are true.** A caller asking why this desk may buy so
     * little reads `bindingConstraint`; one asking what a sale is measured
     * against reads `reductionBindingConstraint`.
     *
     * ⚠️ **What this gives up, said out loud.** Where a sector really is over
     * its ceiling and it is *this desk's other holdings* that filled it, this
     * package no longer trims *this* name on the sector axis. The excess stands
     * and the axis that names it still says so; the reduction that fixes it
     * comes from a ceiling that names a position — the single-name cap or the
     * risk budget of whichever name is actually oversized. Dividing a sector
     * budget between this desk's names is portfolio construction, and a
     * name-at-a-time evaluator has no input with which to choose it.
     */
    reductionCeilings,
    reductionBindingConstraint: reductionBinding?.name ?? null,
    reductionTargetTotalWeight,
    /**
     * ⚠️ **Two weights and two meanings, always both present.** One field doing
     * both jobs is a proposal the host executes wrongly in one of its two
     * readings with no way to tell which it was handed.
     */
    targetTotalWeight,
    incrementalWeight,
    atOrAboveTarget,
    /**
     * ── The number that leaves this package, and it is neither of the two above (#817) ──
     *
     *     hostTargetWeight = otherHeldWeight + targetTotalWeight
     *
     * ⛔ **`targetTotalWeight` is this thesis's share of the position and the
     * host's `targetWeight` is the position.** Every ceiling above is measured
     * against what *everyone else* has, so what comes out of the fold is what
     * this desk may hold — «the cap less what is not mine». The host's field is
     * the other total: `rebalanceShadowBook` reads a position's whole weight and
     * never its attribution (`untilled/aumos#815`), so handing it this desk's
     * share tells it to make the **whole** position that size.
     *
     * ⚠️ **The two totals differ by exactly what somebody else holds, and the
     * difference sells.** A 6% holding assigned to nobody, sized here at 3.75%,
     * handed over as 0.0375 is an order to sell a third of a position no
     * judgement in this fund ever asked to reduce — on a run whose own verdict
     * is BUY. `0.06 + 0.0375 = 0.0975` is the weight that buys.
     *
     * ⚠️ **Only holdings are added, never `otherWeight`.** A pending proposal is
     * not a position; adding one would have this run buy another manager's
     * unapproved judgement on its behalf, and that is the second answer to «how
     * much did this judgement ask for» that `untilled/aumos#781` refused.
     *
     * ⚠️ **A reduction still leaves here.** When the position is this manager's,
     * `otherHeldWeight` is 0, this number *is* `targetTotalWeight`, and a target
     * below the holding sends the trim it always sent. What it can no longer do
     * is trim somebody else's.
     *
     * ⛔ **And it is the total of one judgement only: «add up to this desk's
     * share» (#823).** Every ceiling above is an entry ceiling, so this sum
     * answers the buying question and nothing else — this function is reached
     * before any outcome is known and cannot know which judgement will carry it.
     * `classifyCase` decides that (`OUTCOME_WEIGHT_ROLES`) and replaces this
     * field on the answer it publishes; a caller reading this one on a reduction
     * is reading an entry target, which over a holding smaller than the share is
     * a **purchase**. `hostTargetWeightRole` says which judgement this number is
     * for, so the two can never be taken for each other on the wire.
     */
    hostTargetWeight: round(exposure.otherHeldWeight + targetTotalWeight),
    /** ⛔ The judgement the total above is for. This function only ever answers the entry one. */
    hostTargetWeightRole: 'increase',
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
