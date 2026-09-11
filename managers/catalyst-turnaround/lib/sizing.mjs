import { METHODOLOGY } from './constants.mjs'
import { NOT_DECLARED, cause, diagnostic, finite, readDeclared, round } from './diagnostics.mjs'
import { mandateCeilings } from './mandate.mjs'

/**
 * ── What a wrong answer costs, and therefore how large the position is ─────
 *
 * #256: «무효화 가격까지의 손실과 유동성을 반영해 목표 비중을 계산한다. 상한을
 * 기본 주문 비중으로 사용하지 않는다.» The cap is a ceiling and never the order.
 * So the size is computed from the distance to the price at which this
 * methodology says it was wrong, and the cap is applied afterwards as a `min`.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/sizing.mjs`** — the
 * quarter-Kelly arithmetic (`edge = p − (1−p)/b`, `riskBudget = f·max(0,edge)`,
 * `raw = riskBudget / stopDistance`) and the `min(raw, caps…)` shape are that
 * file's `targetWeight`, taken because they are arithmetic. Left behind: its
 * lanes, its maturity attribution, its unlock-delta disclosure machinery and its
 * grandfathering policy — all of which are evidence-gated's policy about
 * evidence-gated's gates.
 */

/**
 * The distance to being wrong, as a fraction of the current price.
 *
 * `stopDistance = (price − invalidationPrice) / price`
 *
 * ⛔ It is the **price** invalidation and not the business one. #258 asks for
 * both, and only this one has a number in it; the business invalidation is a
 * condition the ledger and the recovery comparison judge, and it closes a
 * position outright rather than sizing it.
 */
export function lossToInvalidation({ price, invalidationPrice } = {}) {
  const diagnostics = []
  if (!finite(price) || price <= 0 || !finite(invalidationPrice) || invalidationPrice <= 0) {
    diagnostics.push(diagnostic('invalidation_inputs_missing', 'blocked', 'A positive current price and a positive price invalidation level are required before anything can be sized', 'invalidationPrice'))
    return { data: { stopDistance: null }, diagnostics }
  }
  if (invalidationPrice >= price) {
    diagnostics.push(
      diagnostic('invalidation_above_price', 'blocked', 'The price invalidation sits at or above the current price, so the position would open already wrong. This is usually a level copied from a stale plan', 'invalidationPrice', {
        price,
        invalidationPrice,
      }),
    )
    return { data: { stopDistance: null }, diagnostics }
  }
  return {
    data: { stopDistance: round((price - invalidationPrice) / price), price, invalidationPrice, units: { stopDistance: 'fraction-of-price' } },
    diagnostics,
  }
}

/**
 * The target weight, and the arithmetic that produced it, so a reader can see
 * that it is not the cap.
 */
export function targetWeight({
  expectedActiveReturn,
  stopDistance,
  conviction,
  mandatePositionCap,
  accountHeadroom,
  /**
   * ⚠️ **The same room, measured against positions only (`untilled/aumos#828`).**
   * `accountHeadroom` above has every other strategy's exposure out of it and
   * that exposure folds their **open proposals** in (#813) — right for *«how
   * much may this desk buy»*, because a limit has to hold in every state the
   * account passes through. It is the wrong number for the weight that travels
   * **back**: that one is executed against the position, and an unfilled
   * proposal is not a position.
   *
   * ⛔ **`null` where the caller did not split it**, and never a silent fall
   * back to `accountHeadroom`: that fall back *is* the defect, and a caller
   * that has not answered this question must not be given the other one's
   * answer as if it had.
   */
  heldOnlyAccountHeadroom,
  /**
   * ── The Mandate itself, under the host's names (`untilled/aumos#838`) ─────
   *
   * ⚠️ **`maxPositionWeight` is `mandatePositionCap` and nothing translated
   * it.** Pass the invocation's `mandate` verbatim — the snapshot or its
   * `constraints` — and the reading above resolves from it where the caller
   * named no cap of its own. ⛔ It never overrides one that was named: a stated
   * cap, a stated sentinel and an unread field keep the three traces they have.
   */
  mandate,
  config = {},
} = {}) {
  const diagnostics = []
  const causes = []
  const kellyFraction = finite(config.kellyFraction) ? config.kellyFraction : METHODOLOGY.kellyFraction
  const houseCap = finite(config.defaultSingleNameCap) ? config.defaultSingleNameCap : METHODOLOGY.defaultSingleNameCap

  /**
   * ⛔ **Neither cap may arrive by omission.** Both used to default to `null`,
   * be filtered out of the `caps` list, and leave the house ceiling as the only
   * binding limit — so a run that never read the Mandate and a run whose Mandate
   * declares no per-position cap produced the same, full-sized answer. They are
   * different facts and only one of them may size anything.
   */
  const declared = mandateCeilings(mandate)
  const mandateReading = readDeclared(mandatePositionCap ?? declared.singleNameCap)
  const headroom = readDeclared(accountHeadroom)
  const heldOnlyHeadroom = readDeclared(heldOnlyAccountHeadroom)
  for (const [name, reading] of [
    ['mandatePositionCap', mandateReading],
    ['accountHeadroom', headroom],
  ]) {
    if (reading.state === 'unread') {
      causes.push(
        cause('data_missing', `${name} was not read, and an unread limit is not an absent one. Pass the number, or pass ${JSON.stringify(NOT_DECLARED)} to say the source was read and declares none`, name),
      )
    }
  }
  if (mandateReading.state === 'unread' || headroom.state === 'unread') {
    return { data: { targetWeight: null, cumulativeTargetWeight: null, heldOnlyTargetWeight: null }, diagnostics, causes }
  }
  if (mandateReading.state === 'not-declared') {
    diagnostics.push(
      diagnostic('mandate_position_cap_not_declared', 'note', `The Mandate was read and declares no per-position cap, so this package's own ceiling of ${houseCap} binds. Recorded because "no cap declared" and "cap not read" produce the same number and must not produce the same record`, 'mandatePositionCap'),
    )
  }

  if (![expectedActiveReturn, stopDistance, conviction].every(finite)) {
    causes.push(cause('data_missing', 'Sizing needs the expected active return, the distance to invalidation and a stated conviction. Any one of them missing and the answer is a weight this run made up', 'sizing'))
    return { data: { targetWeight: null, heldOnlyTargetWeight: null }, diagnostics, causes }
  }
  if (stopDistance <= 0 || conviction < 0 || conviction > 1) {
    diagnostics.push(diagnostic('sizing_inputs_invalid', 'blocked', 'stopDistance must be positive and conviction must lie in [0,1]', 'sizing'))
    return { data: { targetWeight: null, heldOnlyTargetWeight: null }, diagnostics, causes }
  }

  const rewardRisk = expectedActiveReturn / stopDistance
  const edge = rewardRisk > 0 ? conviction - (1 - conviction) / rewardRisk : -1
  const riskBudget = kellyFraction * Math.max(0, edge)
  const raw = riskBudget / stopDistance

  if (edge <= 0) {
    diagnostics.push(
      diagnostic('position_edge_not_positive', 'note', 'At this reward-to-risk and this conviction the edge is not positive, so the arithmetic sizes the position at zero rather than at something small. The answer is that the bet is not worth taking at these odds, and it is reported rather than rounded up', 'conviction', {
        rewardRisk: round(rewardRisk),
        conviction,
        edge: round(edge),
      }),
    )
  }

  /**
   * ── One list of caps, folded twice (`untilled/aumos#828`) ─────────────────
   *
   * ⛔ **A pending total is a ceiling and is not a position for an order.** The
   * two folds differ in exactly one term — the account headroom, which counts
   * other desks' unfilled proposals in the first and only their holdings in the
   * second — and the house and Mandate caps are properties of the thesis, so on
   * a book with no open proposals the two are the same number, byte for byte.
   */
  const foldCaps = (room) => {
    const caps = [houseCap, mandateReading.value, room].filter(finite)
    const bindingCap = caps.length > 0 ? Math.max(0, Math.min(...caps)) : 0
    return { bindingCap, sized: round(Math.min(raw, bindingCap)), capBinds: raw > bindingCap }
  }
  const { bindingCap, sized, capBinds } = foldCaps(headroom.value)
  const heldOnly = heldOnlyHeadroom.state === 'unread' ? null : foldCaps(heldOnlyHeadroom.value)

  if (headroom.state === 'value' && headroom.value <= 0) {
    causes.push(
      cause('risk_limit_exceeded', 'The whole-account concentration limit for this name is already taken by holdings and open proposals elsewhere, so there is no room for this one whatever the thesis says', 'accountHeadroom', {
        accountHeadroom,
      }),
    )
  }

  return {
    data: {
      /**
       * ⚠️ **This is a *cumulative* weight and never «buy this much more».** The
       * increment is computed against what the book already holds, by
       * `runVerdict`, and carried under its own name — the two were one field
       * next door (#265) and either reading by a host is wrong for the other.
       *
       * ⛔ **And it is *this strategy's* share of the position, not the position
       * (#817).** `accountHeadroom` above already has every other strategy's
       * exposure taken out of it, so this number is «what this desk may hold».
       * The host's `targetWeight` is the whole position's weight; the two differ
       * by exactly what somebody else holds, and handing this one over on a book
       * where somebody does is an order to sell. `runVerdict.hostTargetWeight`
       * is the number that crosses that boundary.
       */
      targetWeight: sized,
      cumulativeTargetWeight: sized,
      /**
       * ⚠️ **The same arithmetic with nobody's unfilled proposal in it (#828).**
       * `runVerdict`'s `reduce` role is the only consumer and the entry path
       * does not read it: #813's fold stands for the buying question, and what
       * may not follow from it is a *sale*. A judgement to reduce that reads a
       * ceiling another desk narrowed by writing a proposal down sells more of
       * this desk's own position the moment that proposal is sealed — measured
       * here, a 6% holding trimmed to `0.01666668` went to `0.01` on a proposal
       * nobody approved, and to zero as it grew.
       *
       * ⚠️ **Published rather than folded in, because both are true and they
       * answer different questions.** A reader asking why this desk may buy so
       * little reads `bindingCap`; one asking what a reduction is measured
       * against reads this.
       */
      heldOnlyTargetWeight: heldOnly === null ? null : heldOnly.sized,
      heldOnlyBindingCap: heldOnly === null ? null : round(heldOnly.bindingCap),
      meaning: 'this-strategys-share-of-the-position',
      rawWeight: round(raw),
      bindingCap: round(bindingCap),
      capBinds,
      sizing: {
        mode: 'quarter-kelly',
        kellyFraction,
        rewardRisk: round(rewardRisk),
        conviction,
        edge: round(edge),
        riskBudget: round(riskBudget),
        stopDistance: round(stopDistance),
      },
      caps: { house: houseCap, mandate: mandateReading.value, mandateState: mandateReading.state, accountHeadroom: headroom.value, accountHeadroomState: headroom.state, heldOnlyAccountHeadroom: heldOnlyHeadroom.value, heldOnlyAccountHeadroomState: heldOnlyHeadroom.state },
      units: { targetWeight: 'portfolio-weight', rawWeight: 'portfolio-weight', bindingCap: 'portfolio-weight' },
    },
    diagnostics,
    causes,
  }
}

/**
 * ── One book, one position, however many theses ────────────────────────────
 *
 * #256 is explicit twice over and both halves are here:
 *
 *   «같은 펀드에서는 전체 실제 보유량과 **미결 제안**을 기준으로 중복 노출을
 *   계산한다» — so open proposals count as exposure before they are filled, and
 *
 *   «전략별 한도를 더해 계좌 한도를 늘릴 수 없다» — so a set of per-strategy caps
 *   that happens to add up to more than the account cap does not raise it. That
 *   is checked as its own finding rather than left to arithmetic: three
 *   strategies each allowed 0.10 of one name is not 0.30 of it, and the way that
 *   mistake reaches a book is that nobody ever adds the three numbers up.
 *
 * ⚠️ **A proposal restates the position; it does not stack on it (#813).** A
 * proposal row states the weight it asks the name to *become* — the host's
 * `targetWeight` — so summing a 0.25 holding and a 0.15 trim proposal to 0.40
 * would refuse the trim as if it were a purchase, and summing a 0.06 holding and
 * a 0.15 pending total to 0.21 refuses an entry on a book with room. The fold is
 * `max`, and it is over the whole position rather than over one strategy's share
 * of it: the shape of that rule came from `managers/evidence-gated/lib/sizing.mjs`'s
 * `concentration`, and what #813 changed is that it is keyed on the name rather
 * than on the pair (strategy, name) — which is also the only key available on a
 * book whose holdings carry no attribution.
 *
 * ── The sector axis this package does not compute, and what that costs (#269) ─
 *
 * ⛔ **«This package has no sector concept, so it cannot break a sector limit» is
 * not true and was never checked.** The axis set here was the single name and
 * nothing else, so a Mandate stating a sector ceiling had that ceiling read by
 * nobody: the host does not enforce it, and this package did not receive it. A
 * run under such a Mandate could open a position that put the account through a
 * limit its investor had declared, and every number in the answer would be
 * correct.
 *
 * What #269 fixes is the **contract**, not the arithmetic. A stated sector
 * ceiling that this run cannot evaluate is `data_missing`, which is the one
 * thing `runVerdict`'s `mayIncrease` gate already knows how to hold; a stated
 * ceiling it *can* evaluate is folded here like any other. An **unstated** one
 * is `not_applicable` and constrains nothing, because a Mandate that declares no
 * sector ceiling has declined to constrain that axis rather than left a gap.
 *
 * ⚠️ **The candidate's own sector is not the whole of the question.** The total a
 * sector ceiling is measured against is every position and every open proposal in
 * that sector, so one unclassified row makes the total unformable however well
 * classified the candidate is.
 *
 * ⚠️ **The sector here is the fund's risk-management classification** — the
 * host's, applied consistently across the whole account. It is not this
 * package's own reading of what business a company is in.
 */
export function accountConcentration({ positions, proposals, caps = {}, strategy = null, candidate = null } = {}) {
  /**
   * ── The Mandate itself, under the host's names (`untilled/aumos#838`) ─────
   *
   * ⚠️ `caps.mandate` is the invocation's Mandate verbatim, and `mandate.mjs`
   * turns it into this file's vocabulary: `maxPositionWeight` is the account's
   * single-name limit, and an axis the host's contract does not carry is a
   * **declared** absence rather than an unread one. ⛔ A cap the caller states
   * itself always wins, so a caller that passes no Mandate is unchanged.
   */
  const declared = mandateCeilings(caps.mandate)
  const diagnostics = []
  const causes = []

  /**
   * ⛔ **The book is a required reading, not a defaulted one.** `positions = []`
   * and `proposals = []` as parameter defaults meant an account nobody could read
   * arrived as an account with nothing in it — which is the same arithmetic as an
   * account with unlimited room. An empty book is a legitimate and common state
   * and it is expressed the way every other empty thing here is: by passing an
   * empty array on purpose.
   */
  for (const [name, rows] of [
    ['positions', positions],
    ['proposals', proposals],
  ]) {
    if (!Array.isArray(rows)) {
      causes.push(
        cause('data_missing', `${name} was not read. An unread book is not an empty one, and treating it as empty is the arithmetic of an account with no limits`, name),
      )
    }
  }
  const accountReading = readDeclared(caps.accountSingleName ?? declared.singleNameCap)
  if (accountReading.state === 'unread') {
    causes.push(
      cause('data_missing', `The account's single-name limit was not read. Pass the number, or pass ${JSON.stringify(NOT_DECLARED)} to say the Mandate was read and declares none`, 'caps.accountSingleName'),
    )
  }
  if (causes.length > 0) {
    return { data: { rows: [], accountCap: null, headroom: {}, unusedHeadroom: null, breaches: [], readable: false }, diagnostics, causes }
  }
  if (accountReading.state === 'not-declared') {
    diagnostics.push(
      diagnostic('account_single_name_cap_not_declared', 'note', `The Mandate was read and declares no account single-name limit, so this package's own ceiling of ${METHODOLOGY.defaultSingleNameCap} binds. Recorded, because a declared absence and an unread field must not leave the same trace`, 'caps.accountSingleName'),
    )
  }
  const accountCap = accountReading.state === 'value' ? accountReading.value : METHODOLOGY.defaultSingleNameCap
  const strategyCaps = caps.perStrategy ?? {}

  const strategyCapTotal = round(Object.values(strategyCaps).filter(finite).reduce((total, value) => total + value, 0))
  if (finite(strategyCapTotal) && strategyCapTotal > accountCap) {
    diagnostics.push(
      diagnostic('per_strategy_caps_exceed_account_cap', 'note', `The per-strategy single-name caps add to ${strategyCapTotal} and the account allows ${accountCap}. The account cap binds; the sum is not a larger limit and was never one`, 'caps.perStrategy', {
        strategyCapTotal,
        accountCap,
        perStrategy: strategyCaps,
      }),
    )
  }

  /**
   * ── An open proposal states a **total**, so the fold is `max` (#813) ───────
   *
   * ⛔ **`targetWeight` on a proposal row is the weight that proposal asks the
   * position to *become*, not an amount to add to it.** It is the host's own
   * field name, and `portfolio_get` publishes that sentence in its own
   * description. It is also what the host executes: a book holding 6% of a name,
   * under another manager's proposal for a total of 12%, sends an order for the
   * *difference* and ends at 12%. Never 18%. So exposure to one name is
   *
   *     total = max(held, the largest total any open proposal asks for)
   *
   * and `proposed` on the row below is what the pending proposals still require
   * on top of the holding — `total − held`, never negative.
   *
   * ⚠️ **This package added the two until #813.** A 6%-held name under a 15%
   * pending total was read as 21%, which against a 20% account ceiling is a
   * `breach` with `headroomForStrategy: 0` on a book that had 5% of room. Two
   * managers naming the same total have agreed on one end state rather than asked
   * for two, so their totals fold by `max` as well.
   *
   * ⚠️ **`max`, and not «the latest total wins».** A pending *trim* does not
   * reduce exposure before it fills: a 14% holding under a proposal to take it to
   * 8% is 14% of this book right now.
   *
   * ⛔ **The fold is keyed on the name, and that is a fact about execution rather
   * than about what the book happens to tell us.** This function used to drop a
   * position when a proposal from the *same strategy* named it — keyed on the
   * pair (strategy, name) — and the new fold replaces that rule rather than
   * approximating it. The reason is that a `position-weight` target is executed
   * against the **whole position**: the host's `rebalanceShadowBook` reads the
   * position's total weight and never its attribution, which `untilled/aumos#815`
   * measured through the exchange. So attribution cannot key this axis, and a
   * strategy-keyed rule is wrong in both directions — it sums a 6% holding and
   * another manager's 12% total to 18%, and it reads a 14% position under its own
   * trim to 8% as 8% of a book that still holds 14%.
   *
   * ⚠️ **Attribution answers the *other* question, and it does answer it.**
   * `untilled/aumos#814` puts an `assignment` on every holding row, so
   * `byStrategy` and `headroomForStrategy` below stop reading every holding as
   * somebody else's — the axis where «how much of this is mine» belongs. That
   * changes what is left for this strategy; it does not change what the name
   * totals.
   */
  const bySymbol = new Map()
  const readRow = (row, source) => {
    if (typeof row?.symbol !== 'string' || !row.symbol) {
      diagnostics.push(diagnostic('exposure_row_unnamed', 'blocked', 'Every exposure row names the symbol it is exposure to', source))
      return
    }
    /**
     * ⚠️ **A holding carries `weight` and a proposal carries `targetWeight`**, and
     * the two words are different because the two numbers are: one is what is
     * held, the other is what the position is asked to become. A proposal row
     * carrying `weight` is a caller written against the contract before #813,
     * when this field was an increment, and it is refused rather than read as
     * one — reading a total as an increment understates the account.
     */
    const field = source === 'positions' ? 'weight' : 'targetWeight'
    const value = row?.[field]
    if (!finite(value) || value < 0) {
      diagnostics.push(diagnostic('exposure_weight_invalid', 'blocked', `Every ${source === 'positions' ? 'holding states \`weight\`' : 'open proposal states \`targetWeight\`, the total weight it asks the position to become'}, as a non-negative number`, `${source}[${row.symbol}]`))
      return
    }
    const entry = bySymbol.get(row.symbol) ?? { symbol: row.symbol, sector: null, held: 0, pendingPeak: 0, heldByStrategy: {}, pendingPeakByStrategy: {} }
    if (entry.sector === null && typeof row.sector === 'string' && row.sector.length > 0) entry.sector = row.sector
    const owner = row.strategy ?? 'unattributed'
    if (source === 'positions') {
      entry.held = round(entry.held + value)
      entry.heldByStrategy[owner] = round((entry.heldByStrategy[owner] ?? 0) + value)
    } else {
      entry.pendingPeak = Math.max(entry.pendingPeak, value)
      entry.pendingPeakByStrategy[owner] = Math.max(entry.pendingPeakByStrategy[owner] ?? 0, value)
    }
    bySymbol.set(row.symbol, entry)
  }
  for (const row of positions) readRow(row, 'positions')
  for (const row of proposals) readRow(row, 'proposals')

  /** One name, one quantity: what the account is exposed to once the pending totals are folded in. */
  const exposureOf = (entry) => round(Math.max(entry.held, entry.pendingPeak))

  /**
   * ── the sector axis, read or reported as unreadable ────────────────────────
   */
  const sectorCapReading = readDeclared(caps.accountSector ?? declared.sectorCap)
  let sectorState = 'not-applicable'
  let sectorRows = null
  /**
   * ⛔ **`null` and `false` are two facts here (#836).** `false` is «the total
   * was formed and it is inside the ceiling»; `null` is «nobody declared one»
   * or «this run could not form the total». A gate written as `!== true` reads
   * the second as the first, which is the arithmetic of an account with no
   * limits — the failure `readDeclared` exists for, one field over.
   */
  let sectorBreach = null
  if (sectorCapReading.state === 'value') {
    const candidateSector = typeof candidate?.sector === 'string' && candidate.sector.length > 0 ? candidate.sector : null
    const unclassified = []
    for (const entry of bySymbol.values()) {
      if (entry.sector !== null) continue
      if (exposureOf(entry) === 0) continue
      if (!unclassified.includes(entry.symbol)) unclassified.push(entry.symbol)
    }
    if (candidateSector === null || unclassified.length > 0) {
      sectorState = 'unevaluated'
      /**
       * ⛔ `data_missing`, which is what `runVerdict`'s `mayIncrease` gate reads.
       * It withholds an opening and a staged addition and touches nothing else:
       * a hold, a trim, a close-out and every verdict about the *company* stand,
       * because a classification nobody supplied refutes nothing.
       */
      causes.push(
        cause(
          'data_missing',
          `A sector ceiling of ${sectorCapReading.value} is declared and this run cannot form the total it is measured against: ${
            [
              candidateSector === null ? 'the candidate does not say which sector it is in' : null,
              unclassified.length > 0 ? `${unclassified.join(', ')} carr${unclassified.length === 1 ? 'ies' : 'y'} no sector` : null,
            ].filter(Boolean).join('; ')
          }. No exposure is increased under a declared limit this run could not check`,
          'caps.accountSector',
          { accountSectorCap: sectorCapReading.value, candidateSector, unclassified },
        ),
      )
    } else {
      sectorState = 'evaluated'
      const bySector = new Map()
      for (const entry of bySymbol.values()) {
        if (entry.sector === null) continue
        bySector.set(entry.sector, round((bySector.get(entry.sector) ?? 0) + exposureOf(entry)))
      }
      sectorRows = Object.fromEntries(bySector)
      const candidateExposure = bySector.get(candidateSector) ?? 0
      sectorBreach = candidateExposure > sectorCapReading.value
      if (sectorBreach) {
        causes.push(
          cause('risk_limit_exceeded', `${candidateSector} reaches ${round(candidateExposure)} of the book across holdings and open proposals, past the declared sector ceiling of ${sectorCapReading.value}`, 'caps.accountSector', {
            sector: candidateSector,
            exposure: round(candidateExposure),
            accountSectorCap: sectorCapReading.value,
          }),
        )
      }
    }
  } else {
    diagnostics.push(
      diagnostic(
        'sector_cap_not_applicable',
        'note',
        'This Mandate declares no sector ceiling, so the sector axis is not applicable on this run rather than unchecked. Recorded, because a declared absence and an axis nobody looked at must not leave the same trace',
        'caps.accountSector',
      ),
    )
  }

  const rows = []
  for (const entry of bySymbol.values()) {
    const total = exposureOf(entry)
    const held = round(entry.held)
    const strategyCap = finite(strategyCaps[strategy]) ? strategyCaps[strategy] : accountCap
    /**
     * ⚠️ **A strategy's share of the name folds the same way**, and it is capped
     * by the name's own total: what everybody else has is what is left over, so
     * `headroomForStrategy` below cannot be widened by an attribution that
     * disagrees with the position.
     */
    const byStrategy = {}
    for (const owner of new Set([...Object.keys(entry.heldByStrategy), ...Object.keys(entry.pendingPeakByStrategy)])) {
      byStrategy[owner] = round(Math.min(total, Math.max(entry.heldByStrategy[owner] ?? 0, entry.pendingPeakByStrategy[owner] ?? 0)))
    }
    const otherStrategies = round(Math.max(0, total - (byStrategy[strategy] ?? 0)))
    /**
     * ── Holdings only, split by attribution — the write direction (#817) ─────
     *
     * ⛔ **`otherStrategies` above folds open proposals in and this pair does
     * not.** The distinction is which direction the number travels. A *ceiling*
     * has to hold in every state the account passes through, so a pending buy
     * counts against it before it fills. The weight this desk hands **back** to
     * the host is executed against the position, and an unfilled proposal is not
     * a position — adding one would buy another manager's unapproved judgement
     * on their behalf.
     *
     * ⚠️ **An unattributed holding is in `otherHeld`.** A row with no `strategy`
     * was bought by hand or approved without anyone being named to run it
     * (`untilled/aumos#785`), and a position nobody is assigned to is not one
     * this desk runs. It is not this desk's to shrink.
     */
    const ownHeld = round(entry.heldByStrategy[strategy] ?? 0)
    const otherHeld = round(Math.max(0, held - ownHeld))
    /**
     * What is left for *this* strategy in *this* name. The binding limit is the
     * smaller of the account's and this strategy's, minus whatever every other
     * strategy is already holding or has already proposed — which is the line
     * that makes the per-strategy caps unable to sum.
     */
    const row = {
      symbol: entry.symbol,
      held,
      /** What the open proposals still require **on top of** the holding. Never negative. */
      proposed: round(total - held),
      total,
      /** ⚠️ Holdings only: what is held and assigned to this strategy. */
      ownHeld,
      /**
       * ⚠️ Holdings only: every other manager's holding of this name **and every
       * unattributed one**. The term `hostTargetWeight` is built on (#817).
       */
      otherHeld,
      byStrategy,
      accountCap,
      breach: total > accountCap,
      headroomForStrategy: round(Math.max(0, Math.min(accountCap, strategyCap) - otherStrategies)),
      /**
       * ⚠️ **The same room with only the positions in it (`untilled/aumos#828`).**
       * `headroomForStrategy` subtracts `otherStrategies`, which folds the open
       * proposals in — a ceiling has to hold in every state the account passes
       * through, so somebody's unfilled buy counts before it fills. This one
       * subtracts `otherHeld`, and it is the term the weight travelling **back**
       * to the host is folded into: `hostTargetWeight` adds `otherHeld` back, so
       * folding a target into the *other* number reads two different books at
       * the two ends of one sum and lands under the cap by the difference.
       */
      heldOnlyHeadroomForStrategy: round(Math.max(0, Math.min(accountCap, strategyCap) - otherHeld)),
    }
    if (row.breach) {
      causes.push(
        cause('risk_limit_exceeded', `${entry.symbol} reaches ${total} of the book across real holdings and open proposals, past the account limit of ${accountCap}. Holding one name under two theses is still one position`, `concentration[${entry.symbol}]`, {
          held: row.held,
          proposed: row.proposed,
          accountCap,
        }),
      )
    }
    rows.push(row)
  }
  rows.sort((left, right) => left.symbol.localeCompare(right.symbol))

  /**
   * A name nobody holds and nobody has proposed has no row above, and its
   * headroom is still a number this run needs. `unusedHeadroom` is that answer.
   */
  const unusedHeadroom = round(Math.min(accountCap, finite(strategyCaps[strategy]) ? strategyCaps[strategy] : accountCap))

  return {
    data: {
      rows,
      accountCap,
      strategyCapTotal,
      unusedHeadroom,
      headroom: Object.fromEntries(rows.map((row) => [row.symbol, row.headroomForStrategy])),
      /**
       * ⚠️ **Its holdings-only twin, per name (#828).** Same fallback for a name
       * with no row: nobody holds it and nobody has proposed it, so the two folds
       * are `unusedHeadroom` alike.
       */
      heldOnlyHeadroom: Object.fromEntries(rows.map((row) => [row.symbol, row.heldOnlyHeadroomForStrategy])),
      /**
       * ⚠️ **Holdings this desk is not responsible for, per name (#817).** What
       * `runVerdict` adds to a cumulative target before anything leaves for the
       * host. A name with no row is a name nobody holds, and the answer there is
       * `0` rather than absent — but only because the *book was read*, which
       * `readable` above is the only statement about.
       */
      otherHeld: Object.fromEntries(rows.map((row) => [row.symbol, row.otherHeld])),
      /**
       * ⚠️ **The other two of the same triple, per name (`untilled/aumos#821`).**
       * `ownHeld` is what is held **and assigned to this strategy**; `positionHeld`
       * is what the account holds in the name whoever runs it, which is the number
       * the host's own `targetWeight` is compared against when an order is formed.
       *
       * ⛔ **One definition, two callers.** `runVerdict` used to recompute this
       * desk's share by filtering `book.positions` itself — a second reading of
       * the same rows that could drift from `heldByStrategy` above without
       * anything failing. A reduction is now decided against **this** number, so
       * the two readings are one.
       */
      ownHeld: Object.fromEntries(rows.map((row) => [row.symbol, row.ownHeld])),
      positionHeld: Object.fromEntries(rows.map((row) => [row.symbol, row.held])),
      breaches: rows.filter((row) => row.breach).map((row) => row.symbol),
      /** The book and the limit were both read. Nothing downstream may size without it. */
      readable: true,
      accountCapState: accountReading.state,
      /** `not-applicable` (no ceiling declared), `evaluated`, or `unevaluated` (declared and unformable). */
      sectorState,
      /**
       * ⛔ **The finding, as a field a gate can read (#836).** `risk_limit_exceeded`
       * was raised here from #269 and read by nobody: `runVerdict`'s `mayIncrease`
       * filters `data_missing`, so a ceiling this run *could not* check withheld an
       * entry and a ceiling it checked and found **exceeded** did not. Measured
       * before the fix: 0.36 of one sector under a declared 0.3, `enter-staged`,
       * `hostTargetWeight 0.12`, and the `blocked` finding sitting in `causes`.
       *
       * ⚠️ **The severity could not have been the fix instead.** `cause()` reads
       * severity from `CAUSE_CODES` per *code*, never per site, and the same code
       * carries the single-name limit that is wired — so downgrading it here is
       * downgrading it there, and a fifth code is refused by `diagnostics.mjs`'s
       * own header. A finding that says `blocked` beside a run that increased
       * exposure is the shape this catalogue has now been wrong about eight times.
       *
       * `true` · `false` · `null` — see above.
       */
      sectorBreach,
      accountSectorCap: sectorCapReading.state === 'value' ? sectorCapReading.value : null,
      sectorExposure: sectorRows,
      units: { held: 'portfolio-weight', proposed: 'portfolio-weight', total: 'portfolio-weight' },
    },
    diagnostics,
    causes,
  }
}
