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
 * ── Whose holding it is, on its own, because a reduction has to ask (#819) ──
 *
 * `concentration` answers `ownHeld` and `otherHeld` — but it is the **buy**
 * path that calls it, and the buy path is the only place `untilled/aumos#817`
 * reached. Every other route out of `evaluateCase` (`trim-or-exit-review`,
 * `reject`, `watch`) returns before the fold ever runs, so the question «is any
 * of this position mine?» had no answer on exactly the routes that propose a
 * **sale**.
 *
 * ⛔ **The attribution is not asked as a favour to the caps, so it must not
 * depend on them.** Calling the whole fold from the review path would refuse
 * this pair whenever a Mandate states no single-name cap — the answer would be
 * `emptyAnswer()`, `ownHeld: null` — and a run that cannot tell whose position
 * it is is the run that sells somebody else's. Whether a *cap* was stated is a
 * question about the Mandate; whose the shares are is a question about the
 * book, and only the second one is asked here.
 *
 * `held` is folded the way `concentration` folds it — one quantity per name,
 * the larger row when a book carries two — so the two cannot drift.
 *
 * @param {object} input
 * @param {Array} input.holdings   the account's real positions, or anything else for `readable: false`
 * @param {string} input.symbol    the name being asked about
 * @param {string} [input.strategy] this package's instance id. ⚠️ **Absent means nothing is this desk's** —
 *   a row with no `strategy`, and a caller that named none, both land in `otherHeld` (`aumos-catalogue#268` §1)
 * @returns {{readable:boolean, held:number|null, ownHeld:number|null, otherHeld:number|null}}
 */
export function heldAttribution(input = {}) {
  const { holdings, symbol, strategy } = input
  if (!Array.isArray(holdings) || typeof symbol !== 'string' || symbol.length === 0) {
    return { readable: false, held: null, ownHeld: null, otherHeld: null }
  }
  let row = null
  for (const candidate of holdings) {
    if (candidate?.symbol !== symbol || !finite(candidate?.weight)) continue
    if (row === null || candidate.weight > row.weight) row = candidate
  }
  const held = row === null ? 0 : round(row.weight)
  const ownHeld = strategy !== undefined && row !== null && row.strategy === strategy ? held : 0
  return { readable: true, held, ownHeld, otherHeld: round(Math.max(0, held - ownHeld)) }
}

/**
 * @param {object} input
 * @param {{symbol:string, sector?:string, weight:number}} input.proposed  weight is the **increment** being added;
 *   `sector` is the **fund risk-management sector** the host classifies the account by, not this package's issuer kind
 * @param {Array} input.holdings       real positions: `{ symbol, sector, weight, strategy }` — required
 * @param {Array} input.openProposals  unapproved proposals: `{ symbol, sector, targetWeight, strategy, decisionId }` — required.
 *   ⚠️ `targetWeight` is the host's field and the host's meaning: the **total** weight that proposal asks
 *   this position to become, never an amount to add to what is held (#813)
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
    if (typeof row?.symbol !== 'string' || !finite(row?.targetWeight)) {
      diagnostics.push(
        diagnostic('open_proposal_row_unreadable', 'unevaluated', 'An open proposal row carries no symbol or no `targetWeight`. `targetWeight` is the total weight that proposal asks the position to become, and without it the account total here is not complete. ⚠️ A row carrying `weight` is a caller written against the contract before #813, when this field was an increment; it is unreadable rather than read as one, because reading an increment as a total understates the exposure.', 'openProposals'),
      )
    }
  }
  if (diagnostics.some((row) => row.severity === 'unevaluated')) {
    return { data: emptyAnswer(), diagnostics }
  }

  /**
   * ── An open proposal states a **total**, so the fold is `max` (#813) ──────
   *
   * ⛔ **`targetWeight` on an open-proposal row is what that proposal asks the
   * position to *become*, not an amount to add to it.** It is the host's own
   * field name, and `portfolio_get` says so in its own published description.
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
    if (row.targetWeight > entry.peak) entry.peak = row.targetWeight
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
  /**
   * ── Whose holding is it, and why only this direction asks (#817) ──────────
   *
   * ⛔ **`existingExposure` above is attribution-blind on purpose and this pair
   * is not.** A ceiling is a statement about the *account*: one name is one
   * position however many desks are attached to it, so every holding and every
   * pending total folds into the number the caps are checked against. That does
   * not change here.
   *
   * What changes is the weight that goes back **out**. The host executes a
   * `position-weight` target against the whole position and reads no attribution
   * while doing it (`untilled/aumos#815`), so the number this package hands over
   * has to carry the part of the position it is not entitled to move. That part
   * is `otherHeld`, and it is holdings only — an open proposal is exposure for a
   * ceiling and is not a position for an order.
   *
   * ⚠️ **A row with no `strategy` is `otherHeld`.** It was bought by hand in a
   * broker app, or approved without anyone being named to run it
   * (`untilled/aumos#785`); either way no judgement of this fund is responsible
   * for it, and `aumos-catalogue#268` §1 forbids inferring otherwise from cost
   * and quantity. So does a run that did not pass `strategy` at all: with
   * nothing to compare against, nothing is this desk's.
   */
  /**
   * ⚠️ **One definition, called from two places (#819).** The review routes need
   * this pair without needing the caps, so the split lives in `heldAttribution`
   * above and this fold reads it rather than repeating it.
   */
  const attribution = heldAttribution({ holdings: [...heldBySymbol.values()], symbol, strategy: input.strategy })
  const ownHeld = attribution.ownHeld
  const otherHeld = attribution.otherHeld
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
          `${row.strategy} already has an unapproved proposal taking ${symbol} to ${round(row.targetWeight)} of the book. That is a total and not an addition: if it is approved the account holds the larger of it and what is already there, so it is folded here by maximum rather than added to the holding.`,
          'openProposals',
          { symbol, strategy: row.strategy, targetWeight: round(row.targetWeight), decisionId: row.decisionId ?? null },
        ),
      )
    }
  }

  const projected = existingExposure + proposed.weight

  /**
   * ── Is this proposal **adding** exposure, and why every ceiling below asks (#830) ──
   *
   * `weight: 0` is the first pass asking what the account permits this name to
   * be, and a negative weight is a reduction. **Only an addition is withheld** —
   * by a ceiling that could not be evaluated, which is the sentence this
   * function has carried since #269, and by a ceiling the book has already
   * passed, which is the sentence it did not.
   *
   * ⛔ **A limit that was exceeded is a fact about the account and not a verdict
   * on a proposal that adds nothing to it.** Until #830 the three gates below
   * raised `blocked` on `projected > cap` whoever put the account there, so the
   * zero-weight pass came back `withinLimits: false` and `evaluateCase` turned
   * the run into a `wait` before its reduction branch existed. Measured through
   * the real host: a 6% position wholly this desk's went `sell:6` until another
   * manager sealed a BUY **nobody approved** — `funding: unfunded`, no
   * reservation, no order — and then went nowhere at all. The threshold was
   * `projected > cap` exactly: a pending total of 0.1 kept the trim and 0.1001
   * deleted it, and the diagnostic recorded `proposed: 0` about itself while
   * doing it. `untilled/aumos#782` is the sentence that forbids it: *nothing
   * here can turn a real reduction into a no-op.*
   *
   * ⚠️ **It fires with nobody else on the book, too.** A desk 0.1pp over its own
   * single-name ceiling could not reduce itself, because the answer to *«you are
   * over the limit»* was to withhold the only order that fixes it.
   *
   * ⛔ **`untilled/aumos#813` keeps its teeth, and it never depended on this.**
   * A limit has to hold in every state the account passes through, so an
   * unfilled buy still counts before it fills — in `existingExposure`, in
   * `maxTotalWeightForName`, which bounds the sizing whatever direction the run
   * is going, and in the second fold, whose `weight` is a real increment and
   * whose gate is therefore as `blocked` as it ever was. What no longer follows
   * from a full book is the deletion of the order that empties it.
   *
   * ⚠️ **`warn` and not silence.** The book *is* over the ceiling and a reader
   * approving a reduction should see that; what changes is that saying so no
   * longer withholds anything. The code is unchanged for the same reason
   * `untilled/aumos#687` gives: a renamed field arrives at a model as
   * `undefined` rather than as an error.
   */
  const increasesExposure = proposed.weight > THRESHOLDS.weightTolerance

  /**
   * The half-sentence all three gates append, written once so the axes cannot
   * drift into three readings of one rule.
   */
  const withheldOrNot = increasesExposure
    ? 'The claim may be right; the book cannot carry this much of it, so the increase is withheld.'
    : 'Nothing is withheld — this run adds nothing to the account, and a ceiling constrains additions rather than reductions. An excess is reduced by the desks that hold it, and a run prevented from proposing that reduction is a limit deleting the order that satisfies it.'

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
        increasesExposure ? 'blocked' : 'warn',
        `${symbol} would reach ${round(projected)} of the account against a ${positionCap.name} of ${round(positionCap.value)}, counting ${round(held)} held and ${round(openSame)} already proposed. ${withheldOrNot}`,
        'proposed.weight',
        { symbol, held: round(held), openProposals: round(openSame), proposed: round(proposed.weight), projected: round(projected), cap: round(positionCap.value), capName: positionCap.name, increasesExposure },
      ),
    )
  }

  // ── the sector axis, on the same two sources ─────────────────────────────
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
            increasesExposure ? 'blocked' : 'warn',
            `This sector would reach ${round(sectorExposure + proposed.weight)} against a ceiling of ${round(caps.accountSectorCap)}. A shareholder-return thesis is unusually likely to find several names in one sector at once, which is exactly when this limit is doing work. ${withheldOrNot}`,
            'proposed.sector',
            { sector, sectorExposure: round(sectorExposure), cap: round(caps.accountSectorCap), increasesExposure },
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
          increasesExposure ? 'blocked' : 'warn',
          `The account would be ${round(projectedGross)} invested against a gross ceiling of ${round(caps.accountGrossCap)}. Every single-name and sector limit can be satisfied by a book that is nonetheless fully committed, and this is the axis that says so. ${withheldOrNot}`,
          'caps.accountGrossCap',
          { grossExposure: round(grossExposure), projectedGross: round(projectedGross), cap: round(caps.accountGrossCap), increasesExposure },
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
      /** ⚠️ Holdings only: the part of the position assigned to this manager. */
      ownHeld: round(ownHeld),
      /**
       * ⚠️ Holdings only: another manager's part of the position **and every
       * unattributed one**. What the weight handed to the host is built on
       * (#817), and never something this run may propose away.
       */
      otherHeld: round(otherHeld),
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
    ownHeld: null,
    otherHeld: null,
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
