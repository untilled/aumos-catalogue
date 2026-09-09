import { diagnostic, finite, round, grandfatherPolicy, MANAGER_ID, SLEEVE_FLOW_MARKETS, ALLOCATOR_FLOW, MARKET_CURRENCIES, convertCurrency } from './diagnostics.mjs'
import { causeCodesInLane, REGISTERED_CAUSE_CODES } from './diagnostic-codes.mjs'
import { DATA_PREPARATION_STATES, CANDIDATE_EVALUATION_STATES } from './execution-record.mjs'
import { METHODOLOGY } from './constants.mjs'
import { variantViewCheck } from './methodology.mjs'
import { trancheIntent } from './schedule.mjs'
import { buildPriceLevel } from './price-levels.mjs'

/**
 * Lane ownership is keyed by flow, not by manager id.
 *
 * Keying it by manager id was what blocked every `specialistBudget` call made
 * with the id the manifest actually publishes. ⚠️ The table itself moved to
 * `diagnostics.mjs` (#87): `schedule.mjs` needs the same names to mint a wake
 * the orchestrator can answer, and a second copy of a vocabulary is how the two
 * halves come to disagree about what a flow is called.
 */

/**
 * ── A position's value carries its own currency, and it is not always the
 *    asset's (issue #177) ──────────────────────────────────────────────────
 *
 * `currency` on a position row was read as **both** facts at once: which sleeve
 * the name belongs to, and which unit `marketValue` is counted in. Those are
 * the same fact only on a book marked in the currency its assets quote in, and
 * the host's `portfolio_read` does not hand one over: it marks **every**
 * position in the book's base currency (aumos#689 — a level belongs to the
 * asset's currency, and the mark is a conversion of it). On the USD book that
 * measured this, two KRW listings arrived as `marketValue` 653.73 and 4,063.43
 * **USD** with `valueCurrency: "USD"` beside them — a key `sleeveNav` did not
 * read, in an operation whose `named` mode does not report unread keys inside a
 * row. The dollars were added to the won bucket at face value: `krwSleeveNav`
 * came back **11,119,948.16** against a true 17,430,791.23, every converted
 * figure short by the rate itself (1,338.848×), and `status: ok` with no
 * diagnostic.
 *
 * ⚠️ **The two facts are separated rather than a spelling being guessed at.**
 * `currency` stays the currency the asset quotes in — it is what puts the row
 * in the KR or US sleeve — and `valueCurrency` states the unit `marketValue` is
 * counted in. The conversion into the sleeve uses the rate this package was
 * **handed**, exactly as `specialistBudget` does (#174), and the answer says
 * where it came from.
 *
 * ⛔ An absent `valueCurrency` still reads as the position's own currency: that
 * is what the contract has always meant, it is right on every single-currency
 * book, and refusing it would refuse every caller. What it does not do is stay
 * silent about which reading it took — `marketValueBasis` says whether the
 * units were stated or assumed.
 *
 * ⛔ A row whose value cannot be put in its sleeve's currency is **dropped and
 * named**, never added at face value. A number in the wrong unit is the defect
 * this whole comment is about.
 */
export function sleeveNav({ cash = {}, positions = [], fx = {} }) {
  const diagnostics = []
  const totals = { KRW: 0, USD: 0 }
  const usdKrw = finite(fx?.USDKRW) && fx.USDKRW > 0 ? fx.USDKRW : null
  /**
   * ⚠️ Cash is one internal type here — an object keyed by currency code (#212
   * ⑥). The `{ currency, amount }` rows `portfolio.cashByCurrency` carries are
   * the other representation of the same fact and are folded onto it at the one
   * boundary, so this reads a single shape. ⛔ An array that could **not** be
   * folded — a row missing either half — arrives as it was written and is
   * reported row by row, exactly as before.
   */
  for (const [currency, amount] of Object.entries(cash ?? {})) {
    if (!['KRW', 'USD'].includes(currency) || !finite(amount)) {
      diagnostics.push(diagnostic('cash_row_unevaluated', 'unevaluated', 'Cash row needs currency and amount', 'cash'))
      continue
    }
    totals[currency] += amount
  }
  let stated = 0
  let assumed = 0
  const valued = []
  for (const [index, row] of positions.entries()) {
    if (!['KRW', 'USD'].includes(row?.currency) || !finite(row?.marketValue)) {
      diagnostics.push(diagnostic('position_value_unevaluated', 'unevaluated', 'Position needs currency and marketValue', 'positions'))
      continue
    }
    const declared = row?.valueCurrency
    const unstated = declared === undefined || declared === null
    if (!unstated && !['KRW', 'USD'].includes(declared)) {
      diagnostics.push(diagnostic(
        'position_value_unevaluated',
        'unevaluated',
        'valueCurrency states the unit marketValue is counted in and is KRW or USD; a value whose unit cannot be read is left out of the sleeve rather than added at face value',
        `positions[${index}].valueCurrency`,
        { symbol: row.symbol ?? null, valueCurrency: declared },
      ))
      continue
    }
    const from = unstated ? row.currency : declared
    if (unstated) assumed += 1
    else stated += 1
    const amount = convertCurrency(row.marketValue, from, row.currency, usdKrw)
    if (!finite(amount)) {
      diagnostics.push(diagnostic(
        'position_value_unevaluated',
        'unevaluated',
        `This position is marked in ${from} and quotes in ${row.currency}; converting it needs fx.USDKRW, which this package is handed and never sources. Without it the row is left out rather than counted in the wrong unit`,
        'fx.USDKRW',
        { symbol: row.symbol ?? null, valueCurrency: from, positionCurrency: row.currency },
      ))
      continue
    }
    totals[row.currency] += amount
    valued.push({ symbol: row.symbol, currency: row.currency, amount })
  }
  const sgov = valued
    .filter((row) => row.symbol === 'SGOV' && row.currency === 'USD')
    .reduce((sum, row) => sum + row.amount, 0)
  const idleUsd = finite(cash?.USD) ? cash.USD : 0
  const usdLiquidity = idleUsd + sgov
  const globalKrw = usdKrw !== null ? totals.KRW + totals.USD * usdKrw : null
  if (globalKrw === null) diagnostics.push(diagnostic('fx_missing', 'unevaluated', 'USDKRW is required for global NAV', 'fx.USDKRW'))
  return {
    data: {
      krwSleeveNav: round(totals.KRW, 2),
      usdSleeveNav: round(totals.USD, 2),
      idleUsd: round(idleUsd, 2),
      sgovReserve: round(sgov, 2),
      usdLiquidity: round(usdLiquidity, 2),
      globalNavKrw: round(globalKrw, 2),
      /**
       * ⚠️ Which reading the sleeve totals were computed under: `stated` when
       * every counted row named the unit of its `marketValue`, `assumed` when
       * none did and the position's own currency was taken, `mixed` when the
       * rows disagreed about saying so.
       */
      marketValueBasis: stated + assumed === 0 ? null : stated === 0 ? 'assumed-position-currency' : assumed === 0 ? 'stated' : 'mixed',
      valuedPositionCount: valued.length,
      /** ⚠️ Where the rate came from; this package never sources one (#174). */
      fxUsed: usdKrw,
      fxBasis: usdKrw === null ? null : 'input.fx.USDKRW',
      units: { krwSleeveNav: 'KRW', usdSleeveNav: 'USD', usdLiquidity: 'USD', globalNavKrw: 'KRW' },
    },
    diagnostics,
  }
}

/**
 * ── The smallest position worth opening, and nothing above it (issues #121, #226) ─
 *
 * This operation was `experimentalCeiling`, and it answered *"how large may an
 * unpromoted lens go"* — a ratio (1%), a bound the venue floor could lift it to
 * (3%), and the floor itself. ⛔ **The first two are gone (#226).** The investor
 * removed the maturity lane on 2026-09-08 and the Mandate sizes now, so there
 * is no ceiling here to compute and this operation answers only the half that
 * was never about maturity: **the amount below which there is no result to
 * measure.**
 *
 * ⚠️ **The floor is kept because it is a fact about a venue, not a lane
 * remnant.** On the book that found it, 1% of 10,095,751 KRW is 100,958 KRW,
 * and the name the methodology was ported with — KOGAS at 33,050 — is **three
 * shares**. The smallest expressible change in a three-share position is a
 * third of it: it cannot be scaled into, trimmed, or made to express
 * conviction, and after the tick and the round-trip fee there is no result left
 * to measure. That sentence is as true under a Mandate cap as it was under a
 * lane cap, and it is the only sentence this operation makes.
 *
 * ⛔ **It is a floor and never a target.** It says *below this, do not start*;
 * it has never said *start here*, and since #226 there is no arithmetic that
 * can lift a weight to it. `targetWeight` compares its own answer against this
 * and refuses the position rather than inflating it.
 *
 * ⚠️ **The amount is denominated per venue, not in the book's base currency.**
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
 * ⚠️ **The key is `minimumExecutablePosition` since #226, and the old spelling
 * still reads.** `experimentalPositionFloor` named a lane that no longer
 * exists, and an install that holds the old key is answered from it with
 * `minimum_executable_key_renamed` beside the answer — a rename that silently
 * dropped a floor would be a package deciding an executability limit had been
 * withdrawn because a word changed. `MIGRATION.md` carries the path.
 */
export function minimumExecutableWeight(input = {}) {
  const diagnostics = []
  const renamed = input.minimumExecutablePosition === undefined && input.experimentalPositionFloor !== undefined
  const floors = renamed ? input.experimentalPositionFloor : input.minimumExecutablePosition
  const currency = input.positionCurrency
  if (renamed) {
    diagnostics.push(diagnostic('minimum_executable_key_renamed', 'info', 'This run declared the minimum executable position under its pre-#226 name `experimentalPositionFloor`; it is read and it is the same number, and the key is `minimumExecutablePosition` because the lane the old name referred to no longer exists', 'experimentalPositionFloor'))
  }
  const data = {
    minimumAmount: null,
    minimumCurrency: currency ?? null,
    minimumWeight: null,
    keyRead: renamed ? 'experimentalPositionFloor' : 'minimumExecutablePosition',
    units: { minimumAmount: 'currency-major-units', minimumWeight: 'portfolio-weight' },
  }
  /**
   * ⛔ **An absent floor used to return silently** (issue #158). The KRW leg of
   * a real run came back with no amount, `binding: 'ratio'`, status `ok` and
   * not one diagnostic, because the floor had arrived as a bare `300000` rather
   * than `{ KRW: 300000 }` — the exact shape of this package's dominant failure
   * pattern, a wrong input answered with a confident number computed from
   * defaults. The bare amount is refused by the published contract; the
   * *absent* one is reported here. ⚠️ Since #226 there is no ratio left to fall
   * back to, so an unjudged floor is the whole answer and saying so is the
   * whole job.
   */
  if (!floors || typeof floors !== 'object') {
    diagnostics.push(diagnostic('minimum_executable_unevaluated', 'unevaluated', 'No minimum executable amount was declared, so whether a position here is worth opening is unjudged rather than answered; it is declared per venue currency as { KRW: 300000, USD: 200 }', 'minimumExecutablePosition', { currency: currency ?? null }))
    return { data, diagnostics }
  }
  const amount = finite(floors[currency]) ? floors[currency] : null
  if (amount === null) {
    diagnostics.push(diagnostic('minimum_executable_unevaluated', 'unevaluated', 'A minimum executable amount is declared per venue currency, so the currency of the position being sized is required and has to be one the declaration names', 'positionCurrency', { currency: currency ?? null, declared: Object.keys(floors) }))
    return { data, diagnostics }
  }
  data.minimumAmount = round(amount, 2)
  const nav = input.portfolioNav
  const navCurrency = input.portfolioNavCurrency
  const usdKrw = input.fx?.USDKRW
  if (!finite(nav) || nav <= 0 || !['KRW', 'USD'].includes(navCurrency)) {
    diagnostics.push(diagnostic('minimum_executable_unevaluated', 'unevaluated', 'An amount becomes a weight only against the book it is a weight of; portfolioNav and portfolioNavCurrency are required', 'portfolioNav'))
    return { data, diagnostics }
  }
  let amountInNav = amount
  if (currency !== navCurrency) {
    if (!finite(usdKrw) || usdKrw <= 0) {
      diagnostics.push(diagnostic('minimum_executable_unevaluated', 'unevaluated', 'The amount is quoted in the venue currency and the book is denominated in another, so USDKRW is required to compare them', 'fx.USDKRW'))
      return { data, diagnostics }
    }
    amountInNav = currency === 'USD' ? amount * usdKrw : amount / usdKrw
  }
  data.minimumWeight = round(amountInNav / nav)
  return { data, diagnostics }
}

/**
 * ── «올리면 실제로 몇 원이 열리는가», computed (issue #230) ─────────────────
 *
 * The source methodology instructed this manager to **propose** cap raises —
 * *"Do proactively RECOMMEND cap adjustments … with a high-conviction
 * opportunity blocked only by a cap"* (2026-07-12) — and then bounded the
 * instruction with the thing that makes it honest:
 *
 * > 캡 상향을 제안하기 전에 «이 캡을 올리면 실제로 몇 원이 열리는가»를 계산해
 * > 확인할 것 — **0원이면 제안하지 않는다.**
 *
 * The measured case behind that sentence (2026-07-27) had 162,357원 of headroom
 * sitting unused and a cap raise worth **nothing**, because the pace limit was
 * 1.94× over and the guard stood at 1×. Two other constraints bound; the cap
 * was not the one holding the position down. A recommendation there would have
 * asked the investor to loosen a limit that was not the limit.
 *
 * ⚠️ **This port had the two halves that refuse and disclose, and no half that
 * recommends.** `policyLint` refuses a run-side loosening; `effectivePositionCap`
 * discloses that the cap it sized under is smaller than the declared one. Both
 * are about a size that was already decided. Neither answers *what would let me
 * buy* — and the book this issue is written from spent ten runs reporting the
 * same reduction to an investor who was never told which number to change.
 *
 * ── «Only binding» is computed, never assumed ─────────────────────────────
 *
 * Three tests, in this order, and any one of them is silence:
 *
 *  1. ⛔ **Something else refuses.** If the call carrying this limit raised any
 *     `blocked` diagnostic, the limit is not the only thing standing in the
 *     way — an unchecked variant view, a breach on a second axis, a cash floor
 *     the plan already crosses — and a raise opens nothing at all.
 *  2. ⛔ **The next limit binds at or below where this one stands.** `opensWeight`
 *     is `min(every other ceiling) − current`, so a second limit sitting level
 *     with this one produces zero and the raise is not proposed. This is the
 *     2026-07-27 shape, computed.
 *  3. ⛔ **Nothing else was measured.** A raise whose ceiling is unbounded is not
 *     a number — it is the absence of one — and this package's rule for that is
 *     the rule it uses everywhere: *«없는 캡은 제한 없음이 아니다»*. The caller
 *     passes no `openedWeight` and nothing is said.
 *
 * ⚠️ **A proposal and never an edit.** This returns a sentence and four numbers
 * for the investor to act on. It changes no threshold, and `policyLint` refuses
 * a run that tries to — the two are the balance the source struck in the two
 * sentences quoted above, and `tools/verify-evidence-gated-allocator.mjs`
 * proves the refusal still stands beside this channel.
 *
 * ── Which value, on which screen ──────────────────────────────────────────
 *
 * ⚠️ **"Raise the cap" is not an instruction anyone can carry out.** The three
 * limits an investor can actually move are three controls on one Aumos pane,
 * and this table is the only place this package spells them. ⛔ It is the
 * **host's** vocabulary and drifts with the host — `HOST-FOLLOWUPS.md` carries
 * the debt that would end the coupling.
 *
 * ⚠️ **`maxDrawdown` is asked for under a different name than it carries**, and
 * naming the field instead of the control is how an investor is sent looking
 * for a box that is not there: the schema field is a drawdown limit, the
 * control asks for portfolio heat, and `aumos#685` is where the two were
 * reconciled in favour of the control.
 *
 * ⛔ **Sector, theme and factor caps get no row and it is not an omission.**
 * They are this package's and its config's, no screen asks for them, and
 * `policyLint` refuses a run that loosens one. A limit with nowhere for the
 * investor to go is not a recommendation.
 */
const MANDATE_CONTROLS = Object.freeze({
  maxPositionWeight: { screen: 'FUND SETTINGS → 투자 원칙', control: '집중도 상한', direction: 'raise', unit: 'portfolio-weight' },
  cashFloor: { screen: 'FUND SETTINGS → 투자 원칙', control: '현금 비중', direction: 'lower', unit: 'portfolio-weight' },
  maxDrawdown: { screen: 'FUND SETTINGS → 투자 원칙', control: '포트폴리오 히트', direction: 'raise', unit: 'portfolio-loss-fraction' },
})

/** The one code a proposal carries verbatim when a raise would open something. */
const UNLOCK_CODE = 'cap_raise_would_unlock'
const UNLOCK_UNDISCLOSED_CODE = 'cap_raise_unlock_undisclosed'

/**
 * ⚠️ **Zero is returned as `null` and never as a row of zeroes.** The source's
 * condition is *0원이면 제안하지 않는다*, and a row saying «this would open
 * nothing» is a recommendation the investor still has to read and dismiss.
 * ⛔ `blockedBy` is the codes, not a boolean: a run told only that «something
 * else refuses» cannot tell whether to fix it.
 */
function unlockDelta({
  field,
  currentValue,
  proposedValue,
  openedWeight,
  bindingToday = null,
  nextBinding = null,
  nav = null,
  navCurrency = null,
  blockedBy = [],
  subject = null,
} = {}) {
  const control = MANDATE_CONTROLS[field]
  if (!control) return null
  if (blockedBy.length > 0) return null
  if (!finite(currentValue) || !finite(proposedValue) || !finite(openedWeight)) return null
  /**
   * ⛔ **The one test, and there is deliberately no second one beside it.**
   * *0원이면 제안하지 않는다* is the whole condition, and a `direction` check on
   * `proposedValue` against `currentValue` would be the same test written
   * twice: all three callers derive the value to type **from** the weight that
   * opens, so the two move together by construction and a duplicate guard is a
   * line no mutation can turn red.
   */
  if (openedWeight <= 1e-9) return null
  const opensAmount = finite(nav) && nav > 0 ? round(openedWeight * nav, 2) : null
  return {
    code: UNLOCK_CODE,
    field,
    screen: control.screen,
    control: control.control,
    direction: control.direction,
    currentValue: round(currentValue),
    proposedValue: round(proposedValue),
    bindingToday,
    nextBinding,
    opensWeight: round(openedWeight),
    opensAmount,
    /** ⚠️ The venue's currency, because that is the unit the order is placed in. */
    opensCurrency: opensAmount === null ? null : navCurrency,
    subject,
    units: { currentValue: control.unit, proposedValue: control.unit, opensWeight: 'portfolio-weight', opensAmount: 'currency-major-units' },
  }
}

/**
 * The sentence the proposal carries, in one place so the diagnostic, the
 * disclosure row and the fixtures cannot say three different things.
 */
function unlockSentence(row) {
  const amount = row.opensAmount === null ? `${row.opensWeight} of the book` : `${row.opensAmount} ${row.opensCurrency} (${row.opensWeight} of the book)`
  const verb = row.direction === 'raise' ? 'Raising' : 'Lowering'
  const next = row.nextBinding === null ? 'nothing further was measured above it' : `above that the ${row.nextBinding} limit binds`
  return `${verb} «${row.control}» on ${row.screen} from ${row.currentValue} to ${row.proposedValue} would open up to ${amount}; ${next}. ⛔ This is a recommendation to the investor and never a change this run may make`
}

/** The obligation the proposal owes when a raise would open something. */
function unlockDisclosure(row) {
  return {
    code: UNLOCK_CODE,
    undisclosedCode: UNLOCK_UNDISCLOSED_CODE,
    reason: 'cap-raise-would-unlock',
    /**
     * ⚠️ **`keyReasons`, measured.** `Approvals.tsx` renders `rationale.keyReasons`
     * and `rationale.risks` and nothing else, so those two are the only slots
     * that reach the investor *before* the approve button — and this is the
     * screen where the recommendation has to land, because it is an action for
     * the investor rather than a note for the run's later readers.
     * ⛔ Not `risks`: that slot is a hazard, it already carries the
     * manager-attestation warning, and filing a recommendation among the things
     * that could go wrong is how a reader learns to skim it.
     * ⛔ Not `uncertainty`: it is crowded, it is not drawn on that screen, and
     * an unavailable judgement is not what this is.
     * ⛔ Not `effectiveConstraints`: `effectiveConstraintSchema` is a
     * `strictObject` of the host's five fields and has no room for a number
     * this package computed — see `HOST-FOLLOWUPS.md`.
     */
    fields: ['keyReasons'],
    details: { code: UNLOCK_CODE, unlockDelta: row },
    message: `This run computed that ${row.direction === 'raise' ? 'raising' : 'lowering'} «${row.control}» would open ${row.opensAmount === null ? row.opensWeight : `${row.opensAmount} ${row.opensCurrency}`} and the proposal does not say so, which leaves the investor with the same refusal and no number to act on. Carry \`${UNLOCK_CODE}\` verbatim in one \`rationale.keyReasons\` entry, with the control, the value to type and what opens`,
  }
}

/**
 * ── The cap the investor declared, the risk budget under it (issues #151, #226) ─
 *
 * An investor set `mandate.constraints.maxPositionWeight` to 0.20 and asked
 * why the book would not buy more than 1.3% of a name. The answer was yes,
 * and **nothing in any output said so.** #151 made the reduction sayable. #226
 * removed the thing that was reducing it.
 *
 * ⛔ **Three limits are gone.** `lens-maturity` — the experimental ceiling an
 * unpromoted lens was held to — and `control-arm-lane` — a flat 1% a name —
 * and the `lens_insufficient` reason that named them. Measured on the run this
 * issue is written from (`run_c7ad46eea03840bf84ae7a8822ed02c3`, NAV USD
 * 14,937.07, USDKRW 1,340) the chain read: `variantViewCheck` 0/4 for want of a
 * `consensusRefs` collection procedure → every candidate forced to the control
 * arm → a flat 1% with no floor lift → USD 149.37 against a USD 200 minimum
 * ticket → `experimental_floor_exceeds_cap` → **no single name at any price,
 * for ten runs.** The lane was not making the measurement earlier; it was
 * stopping one from existing.
 *
 * ── What sizes instead ────────────────────────────────────────────────────
 *
 * ⚠️ **The Mandate's cap is a ceiling and never the answer.** Two things sit
 * under it and both are computed:
 *
 * | limit | where it comes from | what it means |
 * |---|---|---|
 * | `mandate` | `mandate.constraints.maxPositionWeight` | the investor's declared most |
 * | `risk-budget` | `(maxDrawdown − heldPortfolioHeat) / \|stopLossPct\|` | what may be risked on this name at the stop it registered |
 *
 * and `targetWeight`'s own quarter-Kelly arithmetic sits under *those*. The
 * source methodology capped a single name at 20% and entered KOGAS at 2.6%;
 * that is the shape, and a cap reached by default would not be it.
 *
 * ⛔ **An undeclared risk budget is `unevaluated`, never a pass.** A run that
 * names no `maxDrawdown` or no stop has not been shown to fit under the heat
 * limit — it has simply not been asked — and this package's own rule for a
 * missing cap («없는 캡은 제한 없음이 아니다») is the rule here.
 *
 * ── The gate that decides whether there is a position at all (#226) ────────
 *
 * ⚠️ **`variantViewCheck` is kept, and it now refuses rather than shrinks.**
 * It was a size switch: verified opened 20%, unverified closed to 1% — a
 * twentyfold difference decided by an evidence gate, which made the gate a
 * dial. The investor's own words for that dial were that a candidate without a
 * checked variant view should not be *proposed*, not proposed twenty times
 * smaller. So an unverified candidate is `blocked` here.
 *
 * ⛔ **This is not a new gate; it is the fourth quarter of one that already
 * blocked.** `targetWeight` has always returned `null` when
 * `challengeVerdict !== 'cleared'`, and `challengeCleared` is one of
 * `variantViewCheck`'s four requirements. The other three —
 * `thesisComplete`, `variantView`, `consensusRefs` — are now held to the same
 * standard as the one that was already fatal, which is the asymmetry #226
 * names. `requirementReport` says which one binds.
 *
 * ⚠️ **The control arm keeps its lens tag and loses its cap.** `role`,
 * `purpose`, `expansionProhibited` and `verdictReport`'s *a control arm is
 * measured, never promoted* are untouched: the Aumos ledger splits realised
 * outcomes by lens, so *«a price pattern is a control arm and not a strategy»*
 * is still measured — without a size limit having to carry the argument.
 *
 * ── The disclosure, unchanged in shape ────────────────────────────────────
 *
 * ⚠️ **The disclosure round-trips, and since #212 ② it round-trips one step
 * later.** This operation returns `disclosures` — the code, the fields and the
 * row to copy — and `proposalDisclosure` is what reads the assembled proposal
 * and refuses a reduced cap it does not carry. What is refused is the
 * *proposal*, never the run. ⚠️ The marker is
 * `position_cap_reduced_below_declared` since #226: it was
 * `position_cap_reduced_by_maturity`, and maturity is not what reduces a cap
 * any more, so the token would have named a rule that no longer exists.
 *
 * ⛔ **No prose is read here.** The version that read it made a sentence change
 * a position weight, because `targetWeight` returns `null` on any `blocked`
 * diagnostic this operation pushes.
 *
 * ⚠️ **The minimum executable position is compared against the cap and never
 * lifted to it.** `minimum_executable_exceeds_cap` says the smallest order
 * worth placing here is larger than the most this book may hold of one name —
 * a fact about the size of the book, with the NAV that resolves it stated
 * rather than rediscovered every run. ⛔ Its predecessor
 * `experimental_floor_exceeds_cap` compared against the control arm's 1% cell
 * and is deleted with the cell.
 */
export function effectivePositionCap(input = {}) {
  const diagnostics = []
  const declared = finite(input?.mandatePositionCap) ? Math.max(0, input.mandatePositionCap) : null
  const maturity = input?.maturityStatus ?? null
  const lane = input?.lane === 'control-arm' ? 'control-arm' : input?.lane === 'main' ? 'main' : null
  const minimum = minimumExecutableWeight(input)
  diagnostics.push(...minimum.diagnostics)

  /**
   * ⚠️ **The check runs on every sizing call now (#226).** It used to be
   * reported only when the run made a claim about a variant view — a `thesis`,
   * or a request for the main lane — because an unverified candidate simply
   * fell into a smaller lane and reporting it would have been reporting the
   * ordinary case. There is no smaller lane, so «unchecked» is the answer
   * rather than a route, and a silent one would be the gate deciding nothing.
   */
  const variant = variantViewCheck({
    thesis: input?.thesis,
    challengeVerdict: input?.challengeVerdict,
    evidenceSamples: input?.evidenceSamples,
    asOf: input?.asOf,
  })
  diagnostics.push(...variant.diagnostics)
  const verified = variant.data.verified
  /** The lens role this candidate carries into the ledger; ⛔ it caps nothing. */
  const resolvedLane = lane === 'control-arm' ? 'control-arm' : verified ? 'main' : 'control-arm'
  if (!verified) {
    diagnostics.push(diagnostic(
      'variant_view_required_for_position',
      'blocked',
      `A real-money position is what a checked variant view opens, and this candidate has none, so it is not sized smaller — it is not proposed. ${variant.data.satisfiedCount} of ${variant.data.requirementCount} requirements are met; read requirementReport for which one binds and what is outstanding on it. ⛔ Sizing cannot repair an evidence gate, which is already true of challengeCleared and is now true of all four (#226)`,
      'thesis',
      { missing: variant.data.missing, satisfied: variant.data.satisfied, requirements: variant.data.requirements, requirementReport: variant.data.requirementReport },
    ))
  }
  if (declared === null) {
    diagnostics.push(diagnostic('concentration_inputs_missing', 'unevaluated', "The Mandate's maxPositionWeight is the position cap and this run was given none", 'mandatePositionCap'))
  }

  /**
   * ── The risk budget, from the investor's own drawdown number (#226) ───────
   *
   * A position of weight `w` stopped at `s` loses `w × |s|` of the account, and
   * `maxDrawdown` is the declared limit on exactly that sum — the one
   * `portfolioHeat` already reads. So the most this name may be is the heat
   * headroom divided by its own stop distance, and that is a limit derived
   * entirely from numbers the investor declared and the run registered.
   *
   * ⚠️ **`heldPortfolioHeat` defaults to 0 and its absence is not reported
   * here.** `portfolioHeat` is the operation that measures held heat and says
   * when it cannot; a second unevaluated row for the same fact would be the
   * duplication this package keeps removing. What *is* reported is a missing
   * drawdown limit or a missing stop, because without either there is no
   * budget at all.
   */
  const drawdown = finite(input?.mandateMaxDrawdown) ? Math.max(0, input.mandateMaxDrawdown) : null
  const heldHeat = finite(input?.heldPortfolioHeat) ? Math.max(0, input.heldPortfolioHeat) : 0
  const stopDistance = finite(input?.stopLossPct) ? Math.abs(input.stopLossPct) : null
  let riskBudgetWeight = null
  if (drawdown !== null && stopDistance !== null && stopDistance > 0) {
    riskBudgetWeight = round(Math.max(0, drawdown - heldHeat) / stopDistance)
  } else {
    diagnostics.push(diagnostic(
      'position_risk_budget_unevaluated',
      'unevaluated',
      "How large this name may be under the declared drawdown limit is the heat headroom divided by its own stop distance, and one of the two was not given; the position is unjudged on that axis rather than shown to fit under it, and the Mandate's cap is then the only thing between it and the whole book",
      drawdown === null ? 'mandateMaxDrawdown' : 'stopLossPct',
      {
        mandateMaxDrawdown: drawdown,
        heldPortfolioHeat: round(heldHeat),
        stopLossPct: finite(input?.stopLossPct) ? round(input.stopLossPct) : null,
        unlocksWith: drawdown === null ? 'mandate.constraints.maxDrawdown' : 'the stop this entry registers with exitDiscipline',
      },
    ))
  }

  const limits = []
  if (declared !== null) limits.push({ source: 'mandate', weight: declared })
  if (riskBudgetWeight !== null) limits.push({ source: 'risk-budget', weight: riskBudgetWeight })
  const bound = limits.length ? limits.reduce((low, row) => (row.weight < low.weight ? row : low)) : null
  const effective = bound ? round(bound.weight) : null

  const reason = bound?.source === 'risk-budget' ? 'risk_budget' : null
  const unlocksAt = reason === 'risk_budget' ? 'portfolioHeat' : null
  const progress = input?.promotion ?? null
  /**
   * ⚠️ **Reported and no longer a gate (#226).** `promotionGate` was the door a
   * reduced cap lifted at; nothing reduces a cap for maturity now, so this
   * travels as a statement about the lens's record and unlocks nothing.
   */
  const promotion = {
    required: METHODOLOGY.promotionGate,
    observed: {
      samples: finite(progress?.samples) ? progress.samples : null,
      regimes: finite(progress?.regimes) ? progress.regimes : null,
      clusters: finite(progress?.clusters) ? progress.clusters : null,
    },
    gatesSize: false,
  }
  const reduced = declared !== null && effective !== null && effective + 1e-12 < declared
  if (reduced) {
    diagnostics.push(diagnostic(
      'position_cap_reduced_below_declared',
      'unevaluated',
      'The position cap this book is operating under is smaller than the one the Mandate declares; say so with the declared number, the effective number and what holds it there, rather than sizing to the smaller one in silence',
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
        riskBudget: { mandateMaxDrawdown: drawdown, heldPortfolioHeat: round(heldHeat), stopLossPct: finite(input?.stopLossPct) ? round(input.stopLossPct) : null, weight: riskBudgetWeight },
        limits: limits.map((row) => ({ source: row.source, weight: round(row.weight) })),
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
   * `cashFloor` or `maxDrawdown`.** A methodology name is *refused* by that
   * schema, and rightly: the string names the control the investor filled in,
   * beside which the sentence is drawn. What actually bound is `reason`, which
   * is where this package's own vocabulary belongs.
   *
   * ⛔ **`declared` is echoed from what this run was handed**, never a constant.
   * A hardcoded 0.20 marks the row stale against every other Mandate.
   *
   * ⛔ **No entry when `effective === declared`.** The inequality is the whole
   * test, and absence is not a claim that nothing bound — the host draws
   * nothing at all — which is why *reduced and not emitted* is the exact defect
   * #151 is about, and why it is judged below rather than left to care.
   */
  const unlocks = reason === 'risk_budget'
    ? `portfolioHeat: maxDrawdown ${drawdown} · held ${round(heldHeat)} · stop ${round(stopDistance)}`
    : null
  const effectiveConstraints = reduced
    ? [{ field: 'maxPositionWeight', declared: round(declared), effective, reason, ...(unlocks ? { unlocks } : {}) }]
    : []

  /**
   * ── What must be said, computed; whether it was said, not read here (#212 ②) ─
   *
   * ⚠️ **This operation used to read the proposal's prose and change its own
   * answer over it.** It scanned `uncertainty` for a substring and emitted
   * `blocked` — and `targetWeight` pushes those diagnostics onto its own list
   * and returns `null` for any `blocked` one. So **editing a sentence moved a
   * position weight.** That is a calculator whose output depends on the wording
   * beside it, which is the one thing a calculator may never be.
   *
   * So the split: **this operation says what has to be disclosed**;
   * **`proposalDisclosure` says whether the assembled proposal disclosed it**,
   * and it is the only place the refusal lives.
   */
  const disclosures = []
  if (reduced) {
    disclosures.push({
      /** The code an `uncertainty` entry has to carry verbatim. */
      code: 'position_cap_reduced_below_declared',
      /** The refusal `proposalDisclosure` raises when it is not carried. */
      undisclosedCode: 'position_cap_reduction_undisclosed',
      reason: 'position-cap-reduced',
      fields: ['uncertainty', 'effectiveConstraints'],
      expect: { effectiveConstraints },
      details: { declared: round(declared), effective },
      message: 'This proposal is sized under a cap smaller than the one the investor declared and does not say so; carry the code `position_cap_reduced_below_declared` verbatim in one `uncertainty` entry and `effectivePositionCap`’s `effectiveConstraints` row verbatim in the proposal',
    })
  }

  /**
   * The minimum executable position against the cap, compared in the venue's
   * own currency. NAV is recovered from the conversion the minimum already did
   * (`minimumAmount / minimumWeight`) rather than converted a second time here
   * — one FX reading, one answer.
   */
  const minimumAmount = minimum.data.minimumAmount
  const minimumWeight = minimum.data.minimumWeight
  let minimumVersusCap = null
  if (finite(minimumAmount) && finite(minimumWeight) && minimumWeight > 0 && effective !== null) {
    const navInMinimumCurrency = minimumAmount / minimumWeight
    minimumVersusCap = {
      minimumAmount: round(minimumAmount, 2),
      minimumCurrency: minimum.data.minimumCurrency,
      effectiveCap: effective,
      capAmount: round(effective * navInMinimumCurrency, 2),
      portfolioNavInMinimumCurrency: round(navInMinimumCurrency, 2),
      resolvesAtNav: effective > 0 ? round(minimumAmount / effective, 2) : null,
      exceeds: minimumWeight > effective + 1e-12,
    }
    if (minimumVersusCap.exceeds) {
      diagnostics.push(diagnostic(
        'minimum_executable_exceeds_cap',
        'unevaluated',
        'The smallest position this venue is willing to open is larger than the most this book may hold of one name, so no name enters here at any share price; this is a fact about the size of the book, and the NAV that resolves it is stated rather than rediscovered each run',
        'minimumExecutablePosition',
        minimumVersusCap,
      ))
    }
  }

  /**
   * ── The raise, and whether it opens anything (issue #230) ────────────────
   *
   * ⚠️ **Only two states in this operation are a cap actually holding a
   * position down**, and outside them a recommendation would be noise on every
   * run: `reduced` — the risk budget binds below the cap the investor declared
   * — and `minimumVersusCap.exceeds` — the venue's smallest order is larger
   * than the most this book may hold of one name, so no name enters at any
   * price. Anywhere else the cap refused nothing, and the source's condition
   * («blocked only by a cap») is not met.
   *
   * ⛔ **The control named is the one that binds, never the one that is
   * convenient.** When the risk budget binds, raising `maxPositionWeight` opens
   * nothing at all — the heat headroom is what is holding the size — so the row
   * names `maxDrawdown` and converts the ceiling back into the drawdown number
   * the investor would have to type: `heldHeat + ceiling × stopDistance`.
   *
   * ⚠️ **The venue minimum is the second constraint here, and it is checked
   * against the ceiling rather than against today's cap.** A raise that lands
   * the cap still under the smallest executable order opens weight and no
   * order, which is the source's 0원 exactly.
   */
  const capBlockedBy = diagnostics.filter((row) => row.severity === 'blocked').map((row) => row.code)
  const others = limits.filter((row) => row.source !== bound?.source)
  const ceilingRow = others.length ? others.reduce((low, row) => (row.weight < low.weight ? row : low)) : null
  const capBinds = reduced || minimumVersusCap?.exceeds === true
  const unexecutableAfterRaise = ceilingRow !== null && finite(minimumWeight) && ceilingRow.weight + 1e-12 < minimumWeight
  const capNav = minimumVersusCap !== null
    ? { nav: minimumVersusCap.portfolioNavInMinimumCurrency, currency: minimumVersusCap.minimumCurrency }
    : finite(input?.portfolioNav) && input.portfolioNav > 0 && typeof input?.portfolioNavCurrency === 'string'
      ? { nav: input.portfolioNav, currency: input.portfolioNavCurrency }
      : { nav: null, currency: null }
  const capUnlock = !capBinds || ceilingRow === null || effective === null
    ? null
    : unlockDelta({
      field: bound.source === 'risk-budget' ? 'maxDrawdown' : 'maxPositionWeight',
      currentValue: bound.source === 'risk-budget' ? drawdown : declared,
      proposedValue: bound.source === 'risk-budget' ? heldHeat + ceilingRow.weight * stopDistance : ceilingRow.weight,
      openedWeight: ceilingRow.weight - effective,
      bindingToday: bound.source,
      nextBinding: ceilingRow.source,
      nav: capNav.nav,
      navCurrency: capNav.currency,
      blockedBy: [...capBlockedBy, ...(unexecutableAfterRaise ? ['minimum_executable_exceeds_cap'] : [])],
    })
  if (capUnlock !== null) {
    diagnostics.push(diagnostic(UNLOCK_CODE, 'unevaluated', unlockSentence(capUnlock), 'mandatePositionCap', capUnlock))
    disclosures.push(unlockDisclosure(capUnlock))
  }

  /**
   * ── The 20% lane standing on the manager's own word, said out loud (#692) ──
   *
   * ⚠️ **This is the half of `untilled/aumos#693` that is this package's.** The
   * `consensusRefs` requirement can only be met from the web, and the only
   * route the web now has into the record files the passage as the **manager's
   * testimony**. So a position up to the Mandate's `maxPositionWeight` can now
   * open on a citation nobody but the manager ever saw. The investor was asked
   * and chose that: ⑴ *file it, and I read the passage before I approve*, over
   * ⑵ *keep the lane shut* and ⑶ *drop the requirement*.
   *
   * ⛔ **⑴ collapses into ⑶ the moment the grade stops travelling.** If a
   * manager-attested consensus row opens the position and the proposal says
   * nothing, the investor approves a size whose supporting evidence they were
   * never told was self-reported — which is the requirement dropped, without
   * anyone deciding to drop it. So it is not left to care.
   *
   * ⚠️ **Measured: where the disclosure has to land.** `Approvals.tsx` renders
   * `rationale.keyReasons` and `rationale.risks` and nothing else from the
   * proposal, so `risks` is the slot that reaches the investor **before** the
   * approve button; `uncertainty` is required beside it because that is what
   * the run's later readers get.
   *
   * ⛔ **This adds an obligation and lowers nothing.** `variantViewCheck`'s four
   * requirements and `verified` are untouched: a manager-attested row satisfies
   * `consensusRefs` exactly as it did a line above. What is refused is opening
   * the position **quietly**.
   */
  const restsOnManagerAttestation = verified && variant.data.restsOnManagerAttestation === true
  const attestationCode = 'main_lane_rests_on_manager_attestation'
  const attestationRefs = variant.data.managerAttestedRefs ?? []
  let mainLaneAttestation = null
  if (restsOnManagerAttestation) {
    mainLaneAttestation = {
      restsOnManagerAttestation: true,
      grade: 'manager',
      disclosureCode: attestationCode,
      /** The passages the investor is being asked to take the manager's word for. */
      refs: attestationRefs.map((row) => ({ metric: row.metric, sourceUrl: row.sourceUrl, evidenceId: row.evidenceId, publishedAt: row.publishedAt })),
      /** Where the disclosure has to appear, and why each one. */
      disclosureFields: ['risks', 'uncertainty'],
    }
    disclosures.push({
      code: attestationCode,
      undisclosedCode: 'main_lane_attestation_undisclosed',
      reason: 'main-lane-attestation',
      fields: ['risks', 'uncertainty'],
      details: { code: attestationCode, refs: mainLaneAttestation.refs },
      message: `This proposal is sized on the manager’s own reading and does not say so where the investor reads before approving. Carry \`${attestationCode}\` verbatim in one \`rationale.risks\` entry and one \`uncertainty\` entry`,
    })
    diagnostics.push(diagnostic(
      attestationCode,
      'unevaluated',
      `This candidate is proposed on a consensus citation that is the manager’s own reading — filed through \`observation_file\`, graded as the manager’s word, fetched and verified by nothing in Aumos. The requirement is genuinely met; what this says is whose word it is met on. Carry the code \`${attestationCode}\` verbatim in one \`rationale.risks\` entry with the source URL, because \`risks\` is what the approval screen shows, and in one \`uncertainty\` entry for the run’s later readers`,
      'thesis.consensusRefs',
      { refs: mainLaneAttestation.refs, disclosureFields: mainLaneAttestation.disclosureFields },
    ))
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
      /** The heat arithmetic behind the `risk-budget` limit; `null` when it could not be computed. */
      riskBudget: { mandateMaxDrawdown: drawdown, heldPortfolioHeat: round(heldHeat), stopLossPct: finite(input?.stopLossPct) ? round(input.stopLossPct) : null, weight: riskBudgetWeight },
      promotion,
      limits: limits.map((row) => ({ source: row.source, weight: round(row.weight) })),
      lane,
      /** The lens role this candidate carries; ⛔ since #226 it caps nothing. (#153, #226) */
      resolvedLane,
      /** ⚠️ Whether a position may be proposed at all — not how large it may be. */
      variantViewVerified: verified,
      /** ⚠️ `null` when the citation is not the manager's own. (#692) */
      mainLaneAttestation,
      variantView: variant.data,
      /** Reported for attribution; ⛔ it sizes nothing since #226. */
      maturityStatus: maturity,
      mustReport: reduced,
      /** Copied into `DecisionProposal.effectiveConstraints` verbatim; empty is a complete answer. */
      effectiveConstraints,
      /**
       * ⚠️ **What a raise would open, or `null` because it would open nothing.**
       * ⛔ Never a row of zeroes: the source's rule is *0원이면 제안하지 않는다*,
       * and a recommendation worth nothing is one the investor still has to
       * read and dismiss. (#230)
       */
      unlockDelta: capUnlock,
      /**
       * ⚠️ **What has to be disclosed, structured — never whether it was.**
       * Hand this array to `proposalDisclosure` beside the assembled proposal;
       * empty means this sizing owes the proposal nothing.
       */
      disclosures,
      minimumExecutable: minimum.data,
      minimumVersusCap,
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

  /**
   * ── The floor, and what lowering it would deploy (issue #230) ────────────
   *
   * ⚠️ **The floor blocks exactly when the plan crosses it**, and nowhere else:
   * a floor with headroom under it refused nothing, so a recommendation there
   * is noise. So this is emitted on `breached` and on nothing else.
   *
   * ⛔ **`cash_floor_breach` is the one `blocked` this does not stay silent
   * for.** Every other rule in this file treats a refusal as proof that the
   * limit is not the only thing in the way; here the refusal *is* the thing the
   * recommendation resolves, and treating it as a veto would make the channel
   * unreachable by construction.
   *
   * ⛔ **A floor this methodology holds above the Mandate's is not lowered on
   * any screen.** When `binding` is a methodology row the investor has nowhere
   * to go — `policyLint` refuses a run that lowers it, and this package's
   * constant needs a version bump and a reviewer — so the row is not emitted
   * and the methodology floor is named as what binds instead.
   *
   * ⚠️ **The next constraint is the plan's own need.** Lowering the floor past
   * `projectedCashWeight` deploys nothing further, because there is nothing
   * further this run asked to deploy; the second-highest floor bounds it from
   * the other side. `max` of the two is where the raise stops paying.
   */
  const floorBlockedBy = diagnostics.filter((row) => row.severity === 'blocked' && row.code !== 'cash_floor_breach').map((row) => row.code)
  const otherFloors = floors.filter((row) => row.source !== bound?.source)
  const nextFloor = otherFloors.length ? otherFloors.reduce((high, row) => (row.weight > high.weight ? row : high)) : null
  const floorStopsPayingAt = nextFloor !== null && nextFloor.weight > projected ? nextFloor.weight : projected
  const floorUnlock = breached !== true || bound?.source !== 'mandate' || projected === null
    ? null
    : unlockDelta({
      field: 'cashFloor',
      currentValue: effective,
      proposedValue: floorStopsPayingAt,
      openedWeight: effective - floorStopsPayingAt,
      bindingToday: bound.source,
      nextBinding: nextFloor !== null && nextFloor.weight > projected ? nextFloor.source : 'projected-cash-weight',
      nav: finite(input?.portfolioNav) && input.portfolioNav > 0 ? input.portfolioNav : null,
      navCurrency: typeof input?.portfolioNavCurrency === 'string' ? input.portfolioNavCurrency : null,
      blockedBy: floorBlockedBy,
    })
  const floorDisclosures = []
  if (floorUnlock !== null) {
    diagnostics.push(diagnostic(UNLOCK_CODE, 'unevaluated', unlockSentence(floorUnlock), 'mandateCashFloor', floorUnlock))
    floorDisclosures.push(unlockDisclosure(floorUnlock))
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
      /** ⚠️ `null` because lowering the floor would deploy nothing; ⛔ never a row of zeroes. (#230) */
      unlockDelta: floorUnlock,
      /** The obligation this floor owes the proposal, in `effectivePositionCap`'s shape. (#230) */
      disclosures: floorDisclosures,
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
 * ⛔ **The control-arm lane budget is gone (#226).** `controlArmWeight` in,
 * `controlArmLaneTotalMaxWeight` and `controlArmRemainingWeight` out, and
 * `controlArmLane`'s 6% total that they fed: the lane has no size of its own
 * any more, so a second budget beside this one would be a number nothing
 * enforces. Every single name — whichever lens found it — spends inside the
 * one budget the Mandate's own two numbers describe, which is what this
 * operation already computed.
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
      /** ⛔ Removed in #226 with the lane cap they described: `controlArmLaneTotalMaxWeight`, `controlArmRemainingWeight`, `controlArmSpendsInside`. */
      budgetIsNotATarget: true,
      units: { deployableWeight: 'portfolio-weight', perNameCap: 'portfolio-weight', remainingWeight: 'portfolio-weight' },
    },
    diagnostics: [...cashFloorReport.diagnostics.filter((row) => row.code !== 'cash_floor_projection_missing'), ...diagnostics],
  }
}

/**
 * ── The weight comes out of the arithmetic; the Mandate is the ceiling (#226) ─
 *
 * ⛔ **`rawWeight` was `(expectedActiveReturn / |downsideReturn|) × conviction`
 * and that is not a size.** It is a reward-risk ratio scaled by conviction, so
 * it exceeds 1.0 — the whole book — at any reward-risk of 2 with conviction
 * above a half, and every candidate that reached it was therefore sized at
 * whatever cap happened to bind. That was survivable while a 1% lane cap bound;
 * with the Mandate's 0.20 as the ceiling it would mean **20% by default**,
 * which is exactly what #226 says must not happen.
 *
 * So the raw weight is the same quarter-Kelly arithmetic `legacySizeSuggestion`
 * already ports, computed from the same three inputs and read from one constant
 * (`METHODOLOGY.positionRiskBudget.kellyFraction`):
 *
 * ```
 * b        = expectedActiveReturn / |downsideReturn|      reward per unit risked
 * p        = conviction                                    probability of the expected leg
 * edge     = p − (1 − p) / b                               full-Kelly fraction of risk capital
 * risk     = 0.25 × max(0, edge)                           quarter Kelly
 * raw      = risk / |downsideReturn|                       the weight that risks exactly that
 * ```
 *
 * ⚠️ **A non-positive edge is a weight of zero, not a small one.** `edge ≤ 0`
 * is the arithmetic saying this bet is not worth taking at the stated odds, and
 * rounding that up to a token position is how a book fills with entries no
 * calculation asked for.
 *
 * ⛔ **The three caps above it are unchanged and none of them is a maturity.**
 * `mandatePositionCap`, `sectorHeadroom`, `themeHeadroom` — and
 * `effectivePositionCap`'s risk budget under them. A missing
 * `mandatePositionCap` is `unevaluated`, never a pass: an absent cap is *"nobody
 * said"*, and sizing to `sectorHeadroom` alone is a position limit derived from
 * a sector limit.
 *
 * ⚠️ **`maturityStatus` is carried and read by nothing here (#226).** It was a
 * size multiplier through `experimentalCeiling`; it is now an attribution
 * label. A value that is not one of the four is still reported, because a run
 * that invented one has told the ledger something the ledger cannot group by —
 * but its **absence** is no longer a diagnostic, since demanding an input
 * nothing reads is what this package calls `input_key_unread`.
 *
 * ⚠️ **The venue minimum refuses; it never lifts.** A weight the arithmetic put
 * below `minimumExecutablePosition` is a position with no result to measure, so
 * it is `blocked` rather than rounded up to the floor — the direction #226
 * insists on, and the opposite of the pre-#226 ceiling, which lifted.
 */
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
  const caps = [input.mandatePositionCap, input.sectorHeadroom, input.themeHeadroom].filter(finite)
  const stopDistance = Math.abs(downside)
  const rewardRisk = expected / stopDistance
  const kellyFraction = METHODOLOGY.positionRiskBudget.kellyFraction
  const edge = rewardRisk > 0 ? conviction - (1 - conviction) / rewardRisk : -1
  const riskBudget = kellyFraction * Math.max(0, edge)
  const raw = riskBudget / stopDistance
  if (edge <= 0) {
    diagnostics.push(diagnostic(
      'position_edge_not_positive',
      'unevaluated',
      'At the stated reward-risk and conviction the Kelly edge is not positive, so the arithmetic sizes this at zero rather than small; the answer is that this bet is not worth taking at these odds, and it is reported rather than rounded up',
      'conviction',
      { rewardRisk: round(rewardRisk), conviction: round(conviction), edge: round(edge) },
    ))
  }
  const maturity = input.maturityStatus
  if (maturity !== undefined && maturity !== null && !['insufficient', 'observing', 'reviewable', 'promoted'].includes(maturity)) {
    diagnostics.push(diagnostic('maturity_status_invalid', 'unevaluated', 'maturityStatus is an attribution label since #226 and sizes nothing, but an unknown value is one the ledger cannot group by', 'maturityStatus'))
  }
  if (input.researchGate !== 'passed' || input.challengeVerdict !== 'cleared') {
    diagnostics.push(diagnostic('research_or_challenge_blocked', 'blocked', 'Sizing cannot repair a failed research or challenge gate', 'researchGate'))
  }
  /**
   * One rule, called here. ⚠️ Since #151 the call goes through
   * `effectivePositionCap`, which holds the cap, the risk budget under it, the
   * variant-view gate and the sentence saying how far the arithmetic moved the
   * investor's declared cap: sizing is the place that already holds both
   * numbers, so it is the place that owes the comparison. A missing
   * `mandatePositionCap` is reported there, under the code it has always had.
   */
  const capReport = effectivePositionCap(input)
  diagnostics.push(...capReport.diagnostics)
  if (finite(capReport.data.effectiveCap)) caps.push(capReport.data.effectiveCap)
  const cap = caps.length ? Math.max(0, Math.min(...caps)) : 0
  const sized = round(Math.min(raw, cap))
  const minimumWeight = capReport.data.minimumExecutable?.minimumWeight ?? null
  if (finite(minimumWeight) && sized > 0 && sized + 1e-12 < minimumWeight) {
    diagnostics.push(diagnostic(
      'minimum_executable_not_met',
      'blocked',
      'The weight this arithmetic asks for is below the smallest position worth opening in this venue, so there would be no result to measure; it is refused rather than rounded up to the minimum, because a position the calculation did not ask for measures the rounding and not the idea',
      'minimumExecutablePosition',
      { targetWeight: sized, minimumWeight: round(minimumWeight), minimumAmount: capReport.data.minimumExecutable?.minimumAmount ?? null, minimumCurrency: capReport.data.minimumExecutable?.minimumCurrency ?? null },
    ))
  }
  const blocked = diagnostics.some((item) => item.severity === 'blocked')
  return {
    data: {
      rawWeight: round(raw),
      bindingCap: round(cap),
      targetWeight: blocked ? null : sized,
      /** The arithmetic behind `rawWeight`, so a reader can see it is not the cap. (#226) */
      sizing: { mode: 'quarter-kelly', kellyFraction, rewardRisk: round(rewardRisk), conviction: round(conviction), edge: round(edge), riskBudget: round(riskBudget), stopDistance: round(stopDistance) },
      /** ⚠️ Carried for attribution; it sizes nothing. (#226) */
      maturityStatus: maturity ?? null,
      lane: capReport.data.resolvedLane,
      variantViewVerified: capReport.data.variantViewVerified,
      minimumExecutableWeight: minimumWeight,
      declaredPositionCap: capReport.data.declaredCap,
      effectivePositionCap: capReport.data.effectiveCap,
      positionCapReduced: capReport.data.reduced,
      positionCapUnlocksAt: capReport.data.unlocksAt,
      riskBudget: capReport.data.riskBudget,
      effectiveConstraints: capReport.data.effectiveConstraints,
      /** ⚠️ What a raise would open, carried up so a run that only calls `targetWeight` still sees it. (#230) */
      unlockDelta: capReport.data.unlockDelta,
      /** Carried up so a run that only calls `targetWeight` still meets the obligation. (#692) */
      mainLaneAttestation: capReport.data.mainLaneAttestation,
      /**
       * ⚠️ The obligations this weight owes the proposal, carried up for the
       * same reason — and they are obligations, not verdicts. ⛔ This weight is
       * a function of the numbers alone since #212 ②: no wording anywhere can
       * move it, because the operation that judges wording is a different one.
       */
      disclosures: capReport.data.disclosures,
      units: { rawWeight: 'portfolio-weight', bindingCap: 'portfolio-weight', targetWeight: 'portfolio-weight', minimumExecutableWeight: 'portfolio-weight', declaredPositionCap: 'portfolio-weight', effectivePositionCap: 'portfolio-weight' },
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
    const riskBudget = Math.max(0, (input.kellyFraction ?? METHODOLOGY.positionRiskBudget.kellyFraction) * fullKellyRisk)
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
/**
 * The three caps that have a wrong place to be declared in, and where those
 * places are. ⛔ `position` and `portfolioHeat` are the Mandate's and
 * `config.schema.json` declares neither, so neither is here (#251 ①).
 */
export const MISPLACEABLE_CAPS = Object.freeze(['sector', 'theme', 'factor'])

/** Where this axis's threshold was declared instead of `caps`, or `null`. */
function misplacedCapPath(kind, config) {
  if (!MISPLACEABLE_CAPS.includes(kind)) return null
  if (finite(config?.[kind])) return `config.${kind}`
  if (finite(config?.concentration?.[kind])) return `config.concentration.${kind}`
  return null
}

export function concentration({ positions = [], proposed = [], caps = {}, config = {}, portfolioNav = null, portfolioNavCurrency = null }) {
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
  const unmeasuredAxes = []
  for (const [kind, map] of Object.entries(totals)) {
    const cap = caps[kind]
    if (!finite(cap)) {
      /**
       * ── «Nobody declared it» and «it is in the wrong place» are two facts
       *    (#251 ①) ────────────────────────────────────────────────────────
       *
       * `concentration_cap_missing` said only the first, and a run that had
       * declared all three thresholds — and put them in `config` — was answered
       * with it three times. ⚠️ **`unevaluated` is not a pass, and that answer
       * reads as one anyway**: `breaches` comes back empty and `exposures`
       * comes back populated, so sector, theme and factor look measured and
       * clear. Measured on `run_bb689b6199084b04afd8b0e1d1528cda`, where
       * `caps` carried the two Mandate numbers and the other three sat in
       * `config`.
       *
       * ⚠️ **Two wrong places, and the second is the likelier one.** The
       * investor's numbers genuinely live at `config.concentration.{sector,
       * theme,factor}` — that is `config.schema.json`, and it says so — and a
       * caller who hands its `config` block straight through has put them
       * somewhere real that this operation does not read. `config.<axis>` at
       * the top is the other, and it is the shape `scheduleBuffers` already
       * refuses one operation over.
       *
       * ⛔ **`blocked`, on the same judgement `scheduleBuffers` made.** No
       * legitimate call is refused by it: nothing in this package reads a
       * threshold from either of those two paths, so a call that carries one
       * has already lost the axis whatever this says. Answering `unevaluated`
       * a fourth way would leave the reversed reading — three clean axes —
       * standing beside it.
       *
       * ⛔ Only the three. `position` is the Mandate's `maxPositionWeight` and
       * `portfolioHeat` its `maxDrawdown`; `config.schema.json` deliberately
       * declares neither, so neither has a wrong place in `config` to be found
       * in.
       */
      const declaredAt = misplacedCapPath(kind, config)
      if (declaredAt === null) diagnostics.push(diagnostic('concentration_cap_missing', 'unevaluated', `Missing ${kind} cap`, `caps.${kind}`))
      else {
        diagnostics.push(diagnostic(
          'concentration_caps_misplaced',
          'blocked',
          `The ${kind} threshold is declared at \`${declaredAt}\` and this operation reads the caps from \`caps\`. Passed there it is read by nothing: the ${kind} axis is accumulated, reported in \`exposures\`, and compared against no cap — so \`breaches\` comes back empty for it and the answer reads as measured and clear. Put all five in \`caps\`: position and portfolioHeat from the Mandate, sector, theme and factor from config.concentration`,
          `caps.${kind}`,
          { axis: kind, declaredAt, declaredValue: config?.[kind] ?? config?.concentration?.[kind] ?? null, expected: `caps.${kind}`, misplaceableCaps: MISPLACEABLE_CAPS },
        ))
      }
      unmeasuredAxes.push(kind)
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
  /**
   * ── An axis nobody labelled is not an axis under its cap (#173) ───────────
   *
   * `concentration_cap_missing` says *nobody declared a cap*. There was no
   * sentence for the other half — **a cap the investor did declare, applied to
   * rows that carry no label on that axis** — and the two produce the same
   * empty exposure map. The run that filed this passed `sectors` in the plural
   * on its one labelled row: `exposures.sector` came back `{}`, the sector cap
   * was compared against nothing, and the answer was `status: ok` with an empty
   * diagnostics array. The shape guard in `input-contracts.mjs` refuses that
   * spelling now; this is the belt for every other way a label fails to arrive,
   * including the ordinary one of nobody writing it down.
   *
   * ⚠️ **`unevaluated`, never `blocked`.** A label is a claim about a shared
   * loss path and this package declares none of them itself — refusing a book
   * for the absence of one would be inventing the classification, which is the
   * same reason `concentration_factor_label_unexamined` one block down blocks
   * nothing. What it must not do is stay silent, because silence here reads as
   * *measured and under the cap*.
   *
   * ⚠️ Parked liquidity is excluded for the reason it is excluded from the axes
   * themselves (#141): it is on no shared loss path, so it has no label to be
   * missing. Core rows are **not** excluded — they are accumulated onto these
   * axes and an unlabelled core holding is exactly the weight a sector cap
   * would want to see.
   */
  const labelled = { sector: (row) => typeof row?.sector === 'string' && row.sector.length > 0, theme: (row) => (row?.themes ?? []).length > 0, factor: (row) => (row?.factors ?? []).length > 0 }
  const axisRows = [...standing, ...proposed].filter((row) => finite(row?.weight) && row.weight >= 0 && row?.parkedLiquidity !== true)
  const unlabelled = {}
  for (const [kind, hasLabel] of Object.entries(labelled)) {
    const rows = axisRows.filter((row) => !hasLabel(row))
    unlabelled[kind] = { symbols: [...new Set(rows.map((row) => row?.symbol ?? null))], weight: round(rows.reduce((total, row) => total + row.weight, 0)) }
    if (!rows.length || !finite(caps[kind])) continue
    diagnostics.push(diagnostic(
      'concentration_labels_unstated',
      'unevaluated',
      `A ${kind} cap is declared and these rows carry no ${kind} label, so their weight was accumulated onto no ${kind} and the cap was applied to less of the book than it holds. Unlabelled is not under the cap`,
      kind === 'sector' ? 'positions[].sector' : `positions[].${kind}s`,
      { axis: kind, cap: caps[kind], symbols: unlabelled[kind].symbols, unlabelledWeight: unlabelled[kind].weight },
    ))
  }

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
  /**
   * ── The one axis a raise can open, and the 2026-07-27 shape (issue #230) ──
   *
   * ⚠️ **Exactly one refusal, or nothing is said.** This is where the source's
   * measured zero lives: on 2026-07-27 the book had 162,357원 unspent and a cap
   * raise worth nothing, because the pace limit and the guard were both binding
   * — two constraints, so moving either one alone opened nothing. The
   * arithmetic here is the same shape: a proposal refused on two axes is
   * refused after a raise on one of them, so the raise opens **0** and the
   * recommendation is not made. `blocking` counts them.
   *
   * ⛔ **Only the position axis.** Sector, theme and factor caps are this
   * package's and its config's, no screen asks the investor for them, and
   * `policyLint` refuses a run that loosens one — a limit with nowhere to go is
   * not a recommendation. And ⛔ **heat is not answered here**: `maxDrawdown`
   * is a loss budget, not a weight, and the one place it becomes a position
   * weight is `effectivePositionCap`'s risk budget. Two operations answering
   * that in different units is the drift this package keeps deleting.
   *
   * ⚠️ **The ceiling is what this run actually asked for.** Raising the cap
   * past the proposed weight opens nothing, because nothing further was
   * proposed — so `proposedValue` is the breaching weight itself and the
   * sentence names `proposed-weight` as what binds above it.
   */
  const concentrationBlocking = [
    ...created.map((row) => `concentration_breach:${row.kind}:${row.key}`),
    ...(grandfather.blocksNewNonCoreWhenBreached ? expanded.map((row) => `concentration_breach_expanded:${row.kind}:${row.key}`) : []),
    ...diagnostics.filter((row) => row.severity === 'blocked' && !['concentration_breach', 'concentration_breach_expanded'].includes(row.code)).map((row) => row.code),
  ]
  const soleBreach = created.length === 1 && concentrationBlocking.length === 1 ? created[0] : null
  const concentrationUnlock = soleBreach === null || soleBreach.kind !== 'position'
    ? null
    : unlockDelta({
      field: 'maxPositionWeight',
      currentValue: caps.position,
      proposedValue: soleBreach.weight,
      openedWeight: soleBreach.weight - caps.position,
      bindingToday: 'mandate',
      nextBinding: 'proposed-weight',
      nav: finite(portfolioNav) && portfolioNav > 0 ? portfolioNav : null,
      navCurrency: typeof portfolioNavCurrency === 'string' ? portfolioNavCurrency : null,
      blockedBy: [],
      subject: soleBreach.key,
    })
  const concentrationDisclosures = []
  if (concentrationUnlock !== null) {
    diagnostics.push(diagnostic(UNLOCK_CODE, 'unevaluated', unlockSentence(concentrationUnlock), 'caps.position', concentrationUnlock))
    concentrationDisclosures.push(unlockDisclosure(concentrationUnlock))
  }
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
      /**
       * ⚠️ Published for the reason `parkedLiquidityExcluded` is (#173): a
       * clean axis and an unlabelled one are the same empty map, and the run
       * has to be able to say which of the two it is looking at — per axis,
       * whether or not that axis has a cap to be measured against.
       */
      unlabelled,
      /**
       * ⚠️ **The axes this answer did not measure, by name** (#251 ①). An empty
       * `breaches` over a populated `exposures` is what a clean book looks
       * like and also what an uncapped axis looks like, and a reader comparing
       * five axes against two caps had to notice the absence to tell them
       * apart. ⛔ Not a severity and not a refusal — those are
       * `concentration_cap_missing` and `concentration_caps_misplaced` above;
       * this is so the fact survives into a record that kept the data and
       * dropped the diagnostics.
       */
      unmeasuredAxes,
      /** ⚠️ `null` unless the position cap is the **only** thing refusing this proposal. (#230) */
      unlockDelta: concentrationUnlock,
      /** The obligation that recommendation owes the proposal, in `effectivePositionCap`'s shape. (#230) */
      disclosures: concentrationDisclosures,
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
 * *an empty one nobody was able to fill*.
 *
 * ⚠️ **It is a projection of `diagnostic-codes.mjs` and not a list (#171).**
 * It used to be written out here by hand, beside the operation that reads it,
 * while the operations that emit the codes were written in four other modules —
 * and the two spellings drifted until a run reporting `corp_code_unmapped_symb
 * ols`, `radar_lane_starved` and `lane_query_failed` intersected with **none**
 * of them and was told the methodology was working. The registry is where a
 * code and its lane are decided now; nothing here may add a fourteenth entry
 * without an operation that emits it.
 */
export const INPUT_PATH_INCOMPLETE_CODES = causeCodesInLane('input-path')

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
export const CAUSE_UNRESOLVED_CODES = causeCodesInLane('unresolved')

/**
 * ── What earns the `info` answer, and why it is no longer a code (#212 ④) ──
 *
 * `no-candidate-cleared-the-gates` claims *the gates ran, on their inputs, and
 * nothing was worth owning* — the one positive assertion this operation makes.
 * #171 made it earned rather than a fall-through by requiring a member of a
 * `gate-ran` code lane: an expected active return under the gate, a challenge
 * not cleared, a thesis still incomplete.
 *
 * ⚠️ **That lane is deleted, because one refused candidate is not a judged
 * roster.** `active_return_below_gate` says a gate refused **one** name and says
 * nothing about whether the other seventy-three were ever prepared, so a run
 * blind across its whole universe could emit it once and be told the methodology
 * was working. That is `untilled/aumos-catalogue#209`'s error — blindness
 * reported as an absence of opportunity — reached through the very check #171
 * added to stop a different one.
 *
 * ⛔ **So the positive claim is now earned by a count and never by a string.**
 * `executionRecord` reads the host's own task run (`aumos#724`, `#730`,
 * generalised by `aumos#743` §B) **and the recipe answers the run read back out
 * of its own folder** — the host counts items and the answers carry `sourced`,
 * because how many names a fund held anything readable for is a judgement about
 * documents that only the party reading them makes. This operation requires all
 * three of the record's facts: `dataPreparation: 'prepared'`,
 * `candidateEvaluation: 'evaluated'` and `eligibleCount === 0`. ⚠️ A settled run
 * whose answer files nobody opened is `unsettled` and earns nothing, which is
 * this same rule one layer down: finishing is the host's fact and preparing is
 * the package's. The pairing is written out in `README.md`.
 *
 * ⚠️ **What the diagnostics still do is withdraw it**, which is the safe
 * direction and is not state inference: an `input-path` code names a stage that
 * lost an input the record cannot see (the corp-code join is not the price
 * sweep), and an `unresolved` code refuses both conclusions. Reading a reason to
 * *decline* a claim is the opposite of reading one to grant it.
 */
/** Every code this operation can read at all — membership decides `unreported`. */
export const MANDATE_EXECUTION_CODE_VOCABULARY = REGISTERED_CAUSE_CODES

export const MANDATE_EXECUTION_CAUSES = Object.freeze([
  'executing',
  'input-path-incomplete',
  'no-candidate-cleared-the-gates',
  /**
   * ⚠️ **The fifth, and it exists because the record can say something the code
   * lane never could** (#212 ④): the roster was prepared, the recipe answered,
   * names *did* clear the gates — and the book still holds none of them. That is
   * neither «the wiring is unfinished» nor «nothing was worth owning», and
   * folding it into `unreported` would file a run that reported everything as a
   * run that reported nothing.
   *
   * ⛔ It is a report and not an instruction: a purchase still needs its
   * evidence and its approval, and this operation never asks for one.
   */
  'candidates-cleared-not-proposed',
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
export function mandateExecution({ mandateObjective = null, positions = [], proposed = [], cashWeight = null, reportedDiagnostics = [], executionRecord = null } = {}) {
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
  /**
   * ⚠️ **«21 codes reported, 0 recognised» is not «the gates ran» (#171).** It
   * is this operation saying it was handed a vocabulary it cannot read, and the
   * honest answer to that is the one it already has for a run that reported
   * nothing at all.
   */
  const recognisedCodes = codes.filter((code) => REGISTERED_CAUSE_CODES.includes(code)).sort()

  /**
   * ── The record, read as a record (#212 ④) ────────────────────────────────
   *
   * `executionRecord`'s own `data`, handed back unedited. ⛔ Its shape is
   * checked rather than trusted — a hand-written object claiming
   * `dataPreparation: 'prepared'` is a state nobody counted, which is the
   * inference this issue removes wearing the new field's name — and a value
   * outside the published vocabularies is refused rather than read as absence,
   * because «unreadable» and «not handed over» are different facts and only one
   * of them is the run's own doing.
   */
  const record = executionRecord && typeof executionRecord === 'object' && !Array.isArray(executionRecord) ? executionRecord : null
  const recordShaped = record !== null
    && record.recordVersion === 1
    && DATA_PREPARATION_STATES.includes(record.dataPreparation)
    && CANDIDATE_EVALUATION_STATES.includes(record.candidateEvaluation)
    && (record.eligibleCount === null || (typeof record.eligibleCount === 'number' && Number.isInteger(record.eligibleCount) && record.eligibleCount >= 0))
  if (record !== null && !recordShaped) {
    diagnostics.push(diagnostic(
      'execution_record_unreadable',
      'unevaluated',
      'This is not a record `executionRecord` produced: it has to carry `recordVersion: 1`, a `dataPreparation` and a `candidateEvaluation` from the published vocabularies, and an `eligibleCount` that is a whole number or `null`. ⛔ Call that operation with what the research tools returned and hand its `data` over verbatim — an object asserting a state nobody counted is the inference #212 ④ removes, under a new name',
      'executionRecord',
      { executionRecord, dataPreparationStates: DATA_PREPARATION_STATES, candidateEvaluationStates: CANDIDATE_EVALUATION_STATES },
    ))
  }
  const dataPreparation = recordShaped ? record.dataPreparation : 'unevaluated'
  const candidateEvaluation = recordShaped ? record.candidateEvaluation : 'unevaluated'
  const eligibleCount = recordShaped ? record.eligibleCount : null

  const laneEmpty = split.singleNameWeight <= 0
  /**
   * ⛔ The order is the argument, and since #212 ④ only the first step of it
   * reads a diagnostic.
   *
   *   1. **A positive input-path finding outranks everything.** A source that
   *      exists and was never called is established whatever the record says,
   *      and the record cannot see it: the corp-code join, the radar feed and
   *      the lane preflight are not the price sweep the research job counts.
   *   2. **The record decides the rest.** No record is `unreported` — ⛔ not
   *      `info`, because *«nobody said»* is not a pass, which is the rule
   *      `cash_floor_unevaluated` has always followed. A roster that did not
   *      settle, answered for nothing, or is blind about some of its names is
   *      `input-path-incomplete`: blindness, never an absence of opportunity
   *      (`untilled/aumos-catalogue#209`).
   *   3. **An unresolved code still withdraws the positive claim.**
   *      `instrument_class_unknown` says the run could not establish whether a
   *      filer exists at all, and unknown is not «the gates ran». (#166)
   *   4. **`eligibleCount` splits the last two answers.** `null` is
   *      `unreported` (nobody folded the rows), `0` earns the `info` answer,
   *      and a positive count over an empty lane is its own fact.
   *
   * ⚠️ **#171's «21 reported, 0 recognised» is a report here and no longer a
   * verdict.** It was a verdict because `info` was granted by a code, so a
   * drifted vocabulary reassured; `info` is granted by the record now, so an
   * unregistered code can neither grant nor withdraw. ⛔ It is not ignored in
   * silence — that is the half of #171 that must not be lost — it is said, as
   * `mandate_execution_codes_unrecognised`, beside the two numbers that have
   * always been on the response. And ⛔ an unknown code is still never a pass on
   * its own: with no record the answer is `unreported`, whatever was reported.
   */
  const cause = !laneEmpty
    ? 'executing'
    : inputPathCodes.length
      ? 'input-path-incomplete'
      : dataPreparation === 'unevaluated' || candidateEvaluation === 'unevaluated'
        ? 'unreported'
        : dataPreparation !== 'prepared' || candidateEvaluation !== 'evaluated'
          ? 'input-path-incomplete'
          : unresolvedCodes.length || eligibleCount === null
            ? 'unreported'
            : eligibleCount > 0
              ? 'candidates-cleared-not-proposed'
              : 'no-candidate-cleared-the-gates'

  if (laneEmpty && codes.length > 0 && recognisedCodes.length === 0) {
    diagnostics.push(diagnostic(
      'mandate_execution_codes_unrecognised',
      'info',
      'This run reported diagnostics and none of them is a code this operation reads: the registry is the vocabulary of codes that *withdraw* the positive answer, so these neither withdrew nor granted anything and the cause below rests on the counted record alone. ⛔ Not a defect on its own — a gate that refused one candidate is spelled outside this vocabulary on purpose since #212 ④ — and ⛔ not silent either, which is the half of #171 that had to survive',
      'reportedDiagnostics',
      { reportedCodeCount: codes.length, codes, vocabulary: MANDATE_EXECUTION_CODE_VOCABULARY },
    ))
  }

  if (laneEmpty) {
    diagnostics.push(diagnostic(
      'mandate_objective_unexecuted',
      cause === 'no-candidate-cleared-the-gates' ? 'info' : 'unevaluated',
      'This book carries no single-name weight at all, so every weight, heat and concentration gate is clean for one reason none of them states — there is almost nothing in the market to measure; report the share that is cash and parked beside that fact and say which of the two this is, a run that found nothing worth owning or a run whose gates never received their inputs. ⛔ It is neither a reason to buy nor a reason to sell: a purchase still needs its evidence, and disposing of parked liquidity is the investor’s judgement to approve',
      'positions',
      {
        objective: declared ? mandateObjective : null,
        cause,
        dataPreparation,
        candidateEvaluation,
        eligibleCount,
        inputPathCodes,
        unresolvedCodes,
        reportedCodeCount: codes.length,
        recognisedCodeCount: recognisedCodes.length,
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
      /**
       * ── The record, and the three facts the cause is decided from (#212 ④) ─
       *
       * ⚠️ **Three absences that are three answers, and they never collapse.**
       * `'unevaluated'` is «no record was handed over», `'unprepared'` is «the
       * record says nothing was readable at this pin» — *not reached* — and a
       * count of `0` is a measurement. `eligibleCount: null` is the same split
       * one field over: nobody folded the rows, which is not «nothing cleared».
       */
      dataPreparation,
      dataPreparationStates: DATA_PREPARATION_STATES,
      candidateEvaluation,
      candidateEvaluationStates: CANDIDATE_EVALUATION_STATES,
      eligibleCount,
      /** ⛔ `false` says the cause below rests on no counted record at all. */
      executionRecordRead: recordShaped,
      executionBasis: recordShaped && typeof record.basis === 'string' ? record.basis : null,
      /** ⛔ The one thing this operation no longer does: read state off a code. */
      causeInferredFromDiagnostics: false,
      /**
       * ⚠️ Read this beside `reportedDiagnosticCount`: codes reported and codes
       * this operation could read are two numbers, and «many reported, none
       * recognised» is the failure #171 records rather than a quiet `info`.
       */
      recognisedCodes,
      codeVocabulary: MANDATE_EXECUTION_CODE_VOCABULARY,
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

/**
 * ── A budget is a ratio; paying for it is an amount, and amounts have a
 *    currency (issue #174) ────────────────────────────────────────────────────
 *
 * `specialistBudget` compared two portfolio weights and said `withinBriefBudget`,
 * and on a two-currency book that sentence is not the one the sleeve needed. The
 * measured call — `us-sleeve`, `XNYS`, current 0.11370454, Brief budget
 * 0.26488897 — came back `allowed: true`, `withinBriefBudget: true`, **no
 * diagnostic**, over a budget of roughly USD 3,979 on a book holding
 * **USD 2,002.01** in the sleeve and **USD 294.02** in idle dollars. The
 * difference does not exist: it is reachable only by selling a KRW asset or by
 * converting won, and both of those are `allocate`'s judgement and the
 * investor's approval, not something a sleeve flow may assume it already has.
 *
 * The aggregate is what hid it. `portfolio_read`'s `cash` read USD 8,596.10 and
 * **96.6% of it was KRW** (11,115,231원 beside USD 294.02); the standing
 * `allocate` plan on that book was asking about *"idle **USD** 8,514.73"*, and
 * the escalation's own sentence was therefore false. Expressing a budget purely
 * as a ratio is what let a currency-blind number describe it.
 *
 * ── Why the currency goes on the cash and not on the budget ────────────────
 *
 * The host settled the neighbouring question first (aumos#689): a book carries
 * two base currencies — the one the investor thinks in and the one this mark was
 * converted into — they may disagree and both be right, and **a limit expressed
 * as a ratio has no currency at all**, because one FX rate scales its numerator
 * and its denominator by the same factor. That is exactly true of
 * `sleeveBudgetWeight`, and it is why `{ value, currency }` on the budget is the
 * alternative #689 declined and this operation declines too.
 *
 * What #689 also says is that **a level belongs to the currency the asset is
 * quoted in** — and procurement is a level. The sleeve's orders settle on one
 * venue in one currency, so the funding question has a currency even though the
 * budget does not, and that currency is `MARKET_CURRENCIES[market]`: derived,
 * never declared, because a run that could name it could name the wrong one.
 *
 * ── What it does, and what it deliberately does not ────────────────────────
 *
 * ⚠️ **Unfundable is a warning and never a block.** Converting currency is a
 * legitimate move and so is selling the other sleeve; what is not legitimate is
 * a run being told it is inside a budget nobody has shown can be paid. So this
 * says so, names the shortfall in the sleeve's own currency, and leaves the
 * decision where it belongs.
 *
 * ⛔ **And silence is not a pass.** A call that does not carry the cash, the NAV
 * and the FX comes back `sleeve_budget_fundability_unevaluated` / `unevaluated`
 * naming the key it is waiting for, with `budgetFundableInSleeveCurrency: null`
 * beside `withinBriefBudget`. Before #174 that same call was `status: ok` with
 * an empty diagnostics array — the shape of this package's dominant failure,
 * a confident answer to a smaller question than the caller asked.
 *
 * ⛔ An emergency exit is not funded, it produces cash: the whole section is
 * skipped rather than answered with a warning nobody can act on.
 */
export function specialistBudget({ managerId = MANAGER_ID, flow, market, currentSleeveWeight, sleeveBudgetWeight, requestedSleeveTotalWeight, requestedTargetWeight, emergencyExit = false, sleeveCashByCurrency, sleeveParkedLiquidity, portfolioNav, portfolioNavCurrency, fx }) {
  const diagnostics = []
  /** ⚠️ The literal id, never the host's instance id — an `inst_…` refused the whole call against a contract that said only `managerId: "string"` (#177). */
  if (managerId !== MANAGER_ID) diagnostics.push(diagnostic('manager_id_unknown', 'blocked', `This package publishes one manager id and it is the literal \`${MANAGER_ID}\`, not the instance id the host addresses this manager by; the market roles are flows of it, named in \`flow\`, and omitting managerId is the safe call`, 'managerId', { managerId, expected: MANAGER_ID, supported: [MANAGER_ID] }))
  if (!SLEEVE_FLOW_MARKETS[flow]) diagnostics.push(diagnostic('flow_unknown', 'blocked', 'A sleeve flow is required; the allocator flow does not take a sleeve budget', 'flow', { flow, supported: Object.keys(SLEEVE_FLOW_MARKETS) }))
  else if (!SLEEVE_FLOW_MARKETS[flow].includes(market)) diagnostics.push(diagnostic('specialist_market_not_owned', 'blocked', 'Sleeve flow cannot allocate outside its market lane', 'market', { flow, market }))
  /**
   * ── ⛔ The key that read as an increment and meant a total (#251 ④) ────────
   *
   * `requestedTargetWeight` was the sleeve's **total** target weight and its
   * name said «target», which a caller adding to a sleeve reads as the thing
   * being added. Measured, in one run, by two subjects independently: the
   * `us-sleeve` flow wanted a new 3% name on a sleeve standing at 0.31471199
   * and passed `0.03`, which was read as *shrink this sleeve to three per
   * cent* and came back `increaseWeight: −0.28471199`, `allowed: true`, **no
   * diagnostic** — the reversed question answered confidently. The correct
   * call was `0.34471199`, and it is refused as
   * `specialist_sleeve_budget_exceeded` / `blocked`, which is the answer the
   * run needed. `allocate` reached the same trap on its own and corrected
   * itself.
   *
   * ⛔ **The old spelling is refused and never aliased.** Reading it as the new
   * key would keep answering the reversed question — the defect is the *name*,
   * so a silent alias preserves it exactly. Reading it as an increment would
   * be worse still: two callers would then mean two things by one contract.
   * So it stays **declared**, purely so that this sentence can be specific
   * rather than the generic `input_shape_invalid` an undeclared key gets, and
   * it is `blocked`, so `allowed` can never come back `true` for a call whose
   * question this operation could not establish.
   */
  if (requestedTargetWeight !== undefined) {
    diagnostics.push(diagnostic(
      'sleeve_requested_weight_renamed',
      'blocked',
      'The key is `requestedSleeveTotalWeight`, and the rename is the whole correction: this number is the weight the **sleeve** is to stand at when the order fills — not the weight being added to it. A sleeve at 0.31 asking for a new 3% name states 0.34; stating 0.03 asked for the sleeve to be cut to three per cent, and that call came back allowed. ⛔ The old spelling is not read as the new one, because reading it would answer the same reversed question it always did',
      'requestedTargetWeight',
      { given: requestedTargetWeight, key: 'requestedSleeveTotalWeight', meaning: 'sleeve-total', retired: 'requestedTargetWeight' },
    ))
  }
  /**
   * ⚠️ **Which of the three is missing, by name** (issue #158). `kr-sleeve`
   * tried three spellings of the budget key against one `sleeve_budget_missing`
   * whose `path` was `input`, gave up, and left `withinBriefBudget` at `null` —
   * so the run's compliance with its own sleeve budget was never checked at
   * all. The unknown key is refused by the published contract; this says which
   * declared key the operation is still waiting for.
   *
   * ⛔ The retired spelling suppresses this row for its own key rather than
   * adding a second one: one mistake, one sentence, and the sentence above
   * already names the key that is waiting.
   */
  const missingWeights = Object.entries({ currentSleeveWeight, sleeveBudgetWeight, requestedSleeveTotalWeight })
    .filter(([key, value]) => !finite(value) && !(key === 'requestedSleeveTotalWeight' && requestedTargetWeight !== undefined))
    .map(([key]) => key)
  if (missingWeights.length) diagnostics.push(diagnostic('sleeve_budget_missing', 'unevaluated', 'Current sleeve, Brief budget and the requested sleeve total are required, and the sleeve budget is the Brief\'s `sleeveBudgetWeight`', missingWeights[0], { missing: missingWeights }))
  if ([currentSleeveWeight, sleeveBudgetWeight, requestedSleeveTotalWeight].filter(finite).some((value) => value < 0)) diagnostics.push(diagnostic('sleeve_weight_negative', 'blocked', 'Sleeve weights cannot be negative', 'input'))
  const increase = finite(requestedSleeveTotalWeight) && finite(currentSleeveWeight) ? requestedSleeveTotalWeight - currentSleeveWeight : null
  if (!emergencyExit && finite(requestedSleeveTotalWeight) && finite(sleeveBudgetWeight) && requestedSleeveTotalWeight > sleeveBudgetWeight) diagnostics.push(diagnostic('specialist_sleeve_budget_exceeded', 'blocked', 'Specialist must ask Global for cross-market budget', 'requestedSleeveTotalWeight', { sleeveBudgetWeight }))
  if (emergencyExit && finite(increase) && increase > 0) diagnostics.push(diagnostic('emergency_exit_cannot_increase', 'blocked', 'Emergency invalidation bypass only permits SELL/RESIZE down', 'requestedSleeveTotalWeight'))

  const funding = sleeveFunding({ market, sleeveCashByCurrency, sleeveParkedLiquidity, portfolioNav, portfolioNavCurrency, fx })
  const judged = !emergencyExit && finite(sleeveBudgetWeight)
  if (judged && funding.missing.length) {
    diagnostics.push(diagnostic(
      'sleeve_budget_fundability_unevaluated',
      'unevaluated',
      'A sleeve budget is a ratio and paying for it is an amount: pass the sleeve currency\'s cash as `sleeveCashByCurrency` (portfolio.cashByCurrency), this book\'s `portfolioNav` + `portfolioNavCurrency`, and `fx.USDKRW` from portfolio.fxRates. Without them `withinBriefBudget` is a claim about a budget nobody has shown can be procured',
      funding.missing[0],
      { missing: funding.missing, sleeveCurrency: funding.sleeveCurrency },
    ))
  }
  const unfundable = (subject, path, needWeight, needAmount) => diagnostics.push(diagnostic(
    'sleeve_budget_not_fundable_in_currency',
    'unevaluated',
    `The sleeve is paid in ${funding.sleeveCurrency} and this book does not hold that much of it, in cash or in parking; the difference exists only after an FX conversion or a sale in the other currency, and both are the allocate flow's judgement and the investor's approval`,
    path,
    {
      subject,
      sleeveCurrency: funding.sleeveCurrency,
      fundableAmount: round(funding.fundableAmount, 2),
      /** ⚠️ Split, never summed away: the second is a sale and the first is not. */
      fundableFromCash: round(funding.fundableFromCash, 2),
      fundableFromParking: round(funding.fundableFromParking, 2),
      fundableWeight: round(funding.fundableWeight),
      requiredAmount: round(needAmount, 2),
      /** ⚠️ The number the verdict is decided on, at the precision it is printed in (#250 ②). */
      shortfallAmount: funding.shortfallOf(needAmount),
      shortfallWeight: round(needWeight - funding.fundableWeight),
      fundingRoute: funding.routeOf(needAmount),
      fundingRoutes: SLEEVE_FUNDING_ROUTES,
      fxUsed: funding.fxUsed,
      fxBasis: funding.fxBasis,
    },
  ))
  /**
   * ⚠️ Two subjects, because they fail on different days. The **budget** is
   * unfundable the moment Global writes it — that is the measured call, where
   * the request was `0` and nothing was being bought — and the **request** is
   * unfundable at the first buy that reaches for the part of it that is not
   * there. Reporting only the second would have said nothing on the run that
   * found this; reporting only the first would go quiet on a book whose budget
   * fits and whose particular order does not.
   *
   * ── The comparison is made where the answer is printed (#250 ②) ───────────
   *
   * ⚠️ **It was made in weight space against a 1e-9 tolerance, and that
   * tolerance is finer than any budget a caller can express.** Measured, one
   * control: `requiredAmount 294.02`, `fundableAmount 294.02`,
   * `shortfallAmount 0` — and `budgetFundableInSleeveCurrency: false` with the
   * code fired. Every weight in these runs is written to eight decimal places,
   * which carries up to 5e-9 of error, five times the epsilon; at that book's
   * NAV 5e-9 of weight is four hundredths of a cent. So **no budget value could
   * pass this code quietly**, and `mandateExecution` booked an unresolved code
   * on every run of the flow.
   *
   * The fix is not a larger epsilon — it is deciding the question on the number
   * the answer reports. `shortfallOf` rounds the difference to the sleeve
   * currency's printed precision and the verdict is `<= 0` of that, so the
   * published `shortfallAmount` and the published verdict are one answer and
   * cannot disagree. ⛔ `BUDGET_EPSILON` still guards `withinBriefBudget`,
   * which is a ratio against a ratio and has no amount to be rounded to.
   */
  const budgetNeedWeight = finite(sleeveBudgetWeight) && finite(currentSleeveWeight) ? sleeveBudgetWeight - currentSleeveWeight : null
  const budgetNeedAmount = funding.amountOf(budgetNeedWeight)
  const budgetShortfall = funding.shortfallOf(budgetNeedAmount)
  const fundableBudget = finite(currentSleeveWeight) && finite(funding.fundableWeight) ? currentSleeveWeight + funding.fundableWeight : null
  const budgetFundable = judged && finite(budgetShortfall) ? budgetShortfall <= 0 : null
  if (budgetFundable === false) {
    unfundable('sleeveBudget', 'sleeveBudgetWeight', budgetNeedWeight, budgetNeedAmount)
  }
  const requestNeedAmount = funding.amountOf(increase)
  const requestShortfall = funding.shortfallOf(requestNeedAmount)
  const requestFundable = !emergencyExit && finite(increase) && finite(requestShortfall)
    ? requestShortfall <= 0
    : null
  if (requestFundable === false) unfundable('requestedTarget', 'requestedSleeveTotalWeight', increase, requestNeedAmount)

  return {
    data: {
      managerId,
      flow: flow ?? null,
      market,
      allowed: !diagnostics.some((row) => row.severity === 'blocked'),
      increaseWeight: round(increase),
      withinBriefBudget: finite(requestedSleeveTotalWeight) && finite(sleeveBudgetWeight) ? requestedSleeveTotalWeight <= sleeveBudgetWeight : null,
      emergencyExit,
      /** ⚠️ Derived from the market, never taken from the caller — aumos#689. */
      sleeveCurrency: funding.sleeveCurrency,
      sleeveCurrencyBasis: funding.sleeveCurrency ? 'market' : null,
      /** What this book actually holds in that currency, and the same as a weight. */
      fundableAmount: round(funding.fundableAmount, 2),
      /**
       * ── ⚠️ Two numbers and never their sum alone (#250 ①) ─────────────────
       *
       * Parking is in the numerator because it is money this sleeve already has
       * in its own currency — the run that measured this had a sleeve fundable
       * **entirely** out of its own short-duration holding and was told
       * `budgetFundableInSleeveCurrency: false` four runs running, with the
       * «shortfall» matching that sleeve's parked market value to the cent. But
       * spending it is a **sale**, and a sale is a proposal the investor
       * approves, so the two are reported apart: a reader who needs to know
       * whether anything has to be sold reads `fundableFromParking` and
       * `fundingRoute`, not the total.
       *
       * ⛔ `concentration` already takes `parkedLiquidity` off the sector, theme,
       * factor and heat axes (#141); this operation was the one that did not
       * know the concept at all.
       */
      fundableFromCash: round(funding.fundableFromCash, 2),
      fundableFromParking: round(funding.fundableFromParking, 2),
      fundableWeight: round(funding.fundableWeight),
      /** The budget that can be reached without converting or selling the other sleeve. */
      fundableSleeveBudgetWeight: round(fundableBudget),
      /** ⚠️ `<= 0` of the printed shortfall, so the two can never disagree (#250 ②). */
      budgetFundableInSleeveCurrency: budgetFundable,
      budgetShortfallAmount: budgetShortfall,
      requestFundableInSleeveCurrency: requestFundable,
      /**
       * ⚠️ **Which act pays for the budget, rather than the reader deriving it.**
       * Before #250 a run had to compare the shortfall against the sleeve's
       * parked market value by hand to learn that the money was there and only
       * had to be sold. `cash` is also the answer when nothing has to be
       * procured at all — a budget at or below the sleeve's current weight buys
       * nothing — because that is the member of these four that names no sale
       * and no conversion.
       */
      fundingRoute: funding.routeOf(budgetNeedAmount),
      requestFundingRoute: funding.routeOf(requestNeedAmount),
      fundingRoutes: SLEEVE_FUNDING_ROUTES,
      /** ⚠️ Where the rate came from; this package never sources one. */
      fxUsed: funding.fxUsed,
      fxBasis: funding.fxBasis,
      units: {
        increaseWeight: 'portfolio-weight',
        fundableWeight: 'portfolio-weight',
        fundableSleeveBudgetWeight: 'portfolio-weight',
        fundableAmount: 'sleeve-currency-major-units',
        fundableFromCash: 'sleeve-currency-major-units',
        fundableFromParking: 'sleeve-currency-major-units',
        budgetShortfallAmount: 'sleeve-currency-major-units',
      },
    },
    diagnostics,
  }
}

/**
 * ⚠️ **The tolerance for a ratio compared against a ratio, and nothing else.**
 * `withinBriefBudget` is `requestedSleeveTotalWeight` against
 * `sleeveBudgetWeight` — two weights, no amount, nothing to round to — so a
 * float epsilon is the right instrument there. ⛔ It is **not** the instrument
 * for fundability: that question has an amount and a currency, and deciding it
 * here is what made a printed `shortfallAmount: 0` sit beside
 * `budgetFundableInSleeveCurrency: false` (#250 ②).
 */
const BUDGET_EPSILON = 1e-9

/**
 * The precision the funding answer is printed in, and therefore the precision
 * it is decided in. Both halves read this one number.
 */
const SLEEVE_AMOUNT_DIGITS = 2

/**
 * ── How the sleeve's next order gets paid for (#250 ③) ─────────────────────
 *
 * Four acts, ordered by what they cost the investor, and the answer is the
 * first one that reaches:
 *
 * | route | what has to happen |
 * |---|---|
 * | `cash` | nothing. The sleeve's own currency is sitting idle — or the budget is at or below the sleeve's current weight and buys nothing at all |
 * | `sell-parking-same-currency` | the sleeve sells its own short-duration holding. Same currency, no rate, **and a proposal the investor approves** |
 * | `fx-conversion` | the book converts idle cash held in the other currency |
 * | `cross-market-sale` | something in the other market has to be sold, and then converted |
 *
 * ⚠️ **The last two are `allocate`'s judgement and this operation says so
 * rather than choosing.** What it does is stop a reader having to compare a
 * shortfall against a parked market value by hand to find out which of the four
 * they are in — which is the arithmetic the run that measured #250 did, four
 * runs in a row, after being told the money was not there.
 *
 * ⛔ **Other-currency parking is `cross-market-sale` and not `fx-conversion`.**
 * Reaching it needs a sale *and* a rate; calling it a conversion would price
 * the more expensive act as the cheaper one.
 */
export const SLEEVE_FUNDING_ROUTES = Object.freeze(['cash', 'sell-parking-same-currency', 'fx-conversion', 'cross-market-sale'])

/**
 * The procurement side of a sleeve budget: what this book holds in the currency
 * the sleeve's orders settle in, said both as an amount and as a weight.
 *
 * ⚠️ **`missing` names the key rather than reporting «cannot judge».** The three
 * inputs fail independently — a run may carry the cash and not the NAV — and
 * #158's whole finding is that a caller told only *something is missing* tries
 * spellings until it gives up.
 *
 * ⚠️ **Parking is a funding source and there was nowhere to write it** (#250 ①).
 * `sleeveCashByCurrency` was the only numerator, so a sleeve fundable entirely
 * out of its own same-currency short-duration holding reported
 * `budgetFundableInSleeveCurrency: false` on every run — and the «shortfall»
 * it named was that sleeve's parked market value. It is now read, in the same
 * per-currency representation and through the same boundary folding, and split
 * out in the answer because spending it is a sale and spending the cash is not.
 *
 * ⛔ **Absent parking is `{}` and never `missing`.** A book that parks nothing
 * is the ordinary book, and demanding the key would answer
 * `sleeve_budget_fundability_unevaluated` for every one of them. A key that was
 * *handed over* and cannot be read is a different fact and is named.
 */
function sleeveFunding({ market, sleeveCashByCurrency, sleeveParkedLiquidity, portfolioNav, portfolioNavCurrency, fx }) {
  const sleeveCurrency = MARKET_CURRENCIES[market] ?? null
  /**
   * ⚠️ Per-currency cash is one internal type by the time it arrives (#212 ⑥):
   * an object keyed by currency code. The `{ currency, amount }` rows
   * `portfolio.cashByCurrency` carries were folded onto it at the boundary, and
   * the bare amount #174 is about is still refused by name — by
   * `input-shapes.mjs`' `sleeveCash`, which this operation's row already names.
   * Parking arrives the same way, through the same two functions named a second
   * time, so neither representation is read in two places.
   */
  const perCurrency = (value) => value === undefined || value === null ||
    Array.isArray(value) || typeof value !== 'object' ||
    Object.values(value).some((amount) => !finite(amount))
    ? null
    : value
  const totals = perCurrency(sleeveCashByCurrency)
  const parked = sleeveParkedLiquidity === undefined || sleeveParkedLiquidity === null ? {} : perCurrency(sleeveParkedLiquidity)
  const navCurrency = typeof portfolioNavCurrency === 'string' && portfolioNavCurrency ? portfolioNavCurrency : null
  const usdKrw = finite(fx?.USDKRW) && fx.USDKRW > 0 ? fx.USDKRW : null
  const needsFx = sleeveCurrency !== null && navCurrency !== null && sleeveCurrency !== navCurrency
  const missing = []
  if (sleeveCurrency === null) missing.push('market')
  if (totals === null) missing.push('sleeveCashByCurrency')
  if (parked === null) missing.push('sleeveParkedLiquidity')
  if (!finite(portfolioNav) || portfolioNav <= 0) missing.push('portfolioNav')
  if (navCurrency === null) missing.push('portfolioNavCurrency')
  if (needsFx && usdKrw === null) missing.push('fx.USDKRW')
  const fxBasis = missing.length ? null : needsFx ? 'input.fx.USDKRW' : 'not-required'
  if (missing.length) {
    return {
      sleeveCurrency,
      missing,
      fundableAmount: null,
      fundableFromCash: null,
      fundableFromParking: null,
      fundableWeight: null,
      fxUsed: null,
      fxBasis,
      amountOf: () => null,
      shortfallOf: () => null,
      routeOf: () => null,
    }
  }
  /**
   * ⚠️ A currency this book holds nothing in is `0`, not «unknown». The cash
   * reading is complete by construction — it is the whole `cashByCurrency` — so
   * an absent row is the book saying there are no dollars, which is the finding
   * rather than a gap in it.
   */
  const fundableFromCash = totals[sleeveCurrency] ?? 0
  const fundableFromParking = parked[sleeveCurrency] ?? 0
  const fundableAmount = fundableFromCash + fundableFromParking
  /**
   * What a conversion alone could reach: idle cash held in the **other**
   * currencies, priced in the sleeve's. ⛔ Parking held elsewhere is not in this
   * sum — reaching it is a sale as well as a rate, which is the fourth route.
   */
  const convertibleCash = Object.entries(totals)
    .filter(([currency]) => currency !== sleeveCurrency)
    .reduce((total, [currency, amount]) => {
      const priced = convertCurrency(amount, currency, sleeveCurrency, usdKrw)
      return finite(priced) ? total + priced : total
    }, 0)
  const inNav = convertCurrency(fundableAmount, sleeveCurrency, navCurrency, usdKrw)
  /** A portfolio weight priced in the sleeve's own currency. */
  const amountOf = (weight) => (finite(weight) ? convertCurrency(weight * portfolioNav, navCurrency, sleeveCurrency, usdKrw) : null)
  /**
   * ⚠️ **The published number and the verdict are one value.** Rounded to the
   * printed precision, so `shortfallAmount: 0` and «not fundable» cannot appear
   * in the same answer — which they did, on every call this flow made (#250 ②).
   */
  const shortfallOf = (needAmount) => (finite(needAmount) ? round(needAmount - fundableAmount, SLEEVE_AMOUNT_DIGITS) : null)
  const routeOf = (needAmount) => {
    if (!finite(needAmount)) return null
    if (round(needAmount - fundableFromCash, SLEEVE_AMOUNT_DIGITS) <= 0) return 'cash'
    if (round(needAmount - fundableAmount, SLEEVE_AMOUNT_DIGITS) <= 0) return 'sell-parking-same-currency'
    if (round(needAmount - (fundableAmount + convertibleCash), SLEEVE_AMOUNT_DIGITS) <= 0) return 'fx-conversion'
    return 'cross-market-sale'
  }
  return {
    sleeveCurrency,
    missing,
    fundableAmount,
    fundableFromCash,
    fundableFromParking,
    fundableWeight: finite(inNav) ? inNav / portfolioNav : null,
    fxUsed: needsFx ? usdKrw : null,
    fxBasis,
    amountOf,
    shortfallOf,
    routeOf,
  }
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

export function entryTranchePlan({ symbol = null, asset = null, lens = null, maturity = null, price, plannedTotalWeight = null, tranches = [], execution = null, asOf } = {}) {
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
    const kind = row.condition?.kind
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
    const kind = row.condition?.kind
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

  /**
   * ── The rungs, said out loud rather than left in an `intent` (#756) ───────
   *
   * A ladder's rungs are prices, and until now the only place a rung's number
   * reached the host was `trancheIntent(symbol, label)` — a string this package
   * writes and nothing reads — plus the `price-below` a run may or may not have
   * armed beside it. So a plan that had decided *«we accumulate at 62,000, then
   * 58,000, then 54,000»* submitted three opaque promises and no prices. Each
   * unfilled priced rung is now also an `entry` level with `purpose` stated.
   *
   * ⚠️ **One rung, one level — the ladder is not folded into a band.** The
   * temptation is to send `band: 54,000–62,000`, and it says something the plan
   * does not: a band is *a range you would work across*, and this plan names
   * three prices it will act at and nothing in between. Points are strictly
   * more of what was concluded, and #756's prohibition is on **collapsing** a
   * range, which three points do not do. ⛔ Never both shapes for one ladder —
   * that draws one intention twice, which is the duplicate #756 §7 refuses.
   *
   * ⛔ **`immediate` gets no level.** That rung executes at whatever the market
   * is on the run that plans it, so its price is an observation and not a level
   * the plan is working to; stating today's quote as an entry level would put a
   * number on the chart the methodology never chose. A lapsed or filled rung
   * gets none either — it is not a price this plan still stands behind, and the
   * field replaces rather than adds.
   *
   * ⛔ **No `armedKey`.** This operation emits no watches, so there is nothing
   * in *this* function's output to point at. A run that arms a `price-below`
   * per rung may add the link itself, and `priceLevelSet` checks it — but
   * inventing a key here for a watch this function did not write is a dangling
   * reference by construction.
   */
  const priceLevelsToRegister = []
  const pricedRungs = rows.filter((row) => !row.filled
    && !lapsed.includes(row.label)
    && (row.condition?.kind === 'price-below' || row.condition?.kind === 'price-above')
    && finite(row.condition?.threshold))
  if (pricedRungs.length) {
    for (const row of pricedRungs) {
      const built = buildPriceLevel({
        purpose: 'entry',
        asset,
        point: row.condition.threshold,
        reason: `Rung ${row.label} of a ${rows.length}-rung staged entry${finite(row.weight) ? ` for ${round(row.weight * 100, 4)}% of the book` : ''}: the plan adds here and nowhere between the rungs.`,
        ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
        path: `priceLevels[${row.label}]`,
      })
      if (built.level === null) {
        diagnostics.push(diagnostic(
          'entry_level_unstated',
          'unevaluated',
          'A rung states a price and the level it puts on the chart cannot be stated: a price level belongs to the currency its asset is quoted in, and that is derived from the market, which this call did not give. The ladder verdicts are unaffected — pass `asset` to state the levels as well',
          'asset',
          { symbol, label: row.label, threshold: row.condition.threshold, causes: built.diagnostics.map((entry) => entry.code) },
        ))
        break
      }
      priceLevelsToRegister.push(built.level)
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
      /** One `entry` level per unfilled priced rung, for the proposal's `priceLevels`. */
      priceLevelsToRegister,
      priceLaneRead: priceRead,
      candidateOnly: true,
    },
    diagnostics,
  }
}
