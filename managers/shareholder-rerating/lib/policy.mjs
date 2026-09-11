/**
 * The two numbers sizing needs that the investor's Mandate cannot carry.
 *
 * ── What was wrong, and it was not the host either (`untilled/aumos#841`) ──
 *
 * `untilled/aumos#838` fixed the *ceilings*: `maxPositionWeight` and `cashFloor`
 * arrive and this package reads them under its own names. It left the other half
 * standing, and the other half is the whole of sizing:
 *
 *   rawWeight = riskBudgetWeight / lossFraction
 *
 * `riskBudgetWeight` was read from `mandate.riskBudgetWeight`, and **no producer of
 * that name exists anywhere in the host** — not in the Mandate's closed set of eight
 * fields, not on the investment-principles screen, nowhere. Beside it,
 * `minimumExecutableWeight` had the same shape of hole: `config.minimumExecutablePosition`
 * has been published at 500,000 won since this package shipped and nothing ever read
 * it, because the arithmetic wanted a weight and nothing turned won into one.
 *
 * Both absences are `unevaluated`, both `unevaluated` answers block, and blocked
 * sizing is `WAIT` with `data_missing`. Measured on the committed fixtures with the
 * host's Mandate handed in verbatim: **the four cases that do anything at all all
 * flipped to WAIT**, and the eleven that did not move were the ones that refuse or
 * watch before sizing is ever reached. *"There is no default risk budget … the answer
 * is WAIT"* read as a discipline and behaved as an off switch.
 *
 * ── The discriminator is #838's, and it is why this is not a loosening ────
 *
 * ⛔ **A run handed no Mandate at all still refuses, and that sentence is load-bearing.**
 * `mandateCeilings(...).read` is `true` only when the host's `constraints` object
 * actually arrived — `mandateSnapshotSchema` is a `strictObject` whose `baseCurrency`
 * and `allowedAssetClasses` are required, so its presence is a reading and not a
 * guess. A Mandate that *was read* and carries no per-idea risk axis is an **undeclared**
 * axis, and this package has said since #838 that an undeclared axis constrains nothing
 * rather than withholding everything. A run carrying no Mandate is nobody having looked,
 * and `fixtures/cases.json`'s `no-mandate-numbers-is-unevaluated-not-a-default` still
 * ends exactly where it did.
 *
 * ⚠️ **Stated always wins.** A caller naming `mandate.riskBudgetWeight` or
 * `mandate.minimumExecutableWeight` gets its own number and nothing here is consulted,
 * which is what keeps every committed fixture byte-for-byte unchanged.
 *
 * ── The floor is money, and money has a currency (`untilled/aumos#845`) ─────
 *
 * The reader #841 gave `minimumExecutablePosition` read the amount and not its unit.
 * 500,000 is won; divided by a **dollar** book of $100,000 it is a floor of 5.0 — five
 * hundred per cent of the account — so every case that reached sizing was then refused
 * by it and this package was structurally `WAIT` on any book not denominated in won.
 * Measured on the fifteen committed fixtures under the host's Mandate verbatim: eight
 * acting on a won book and **three** on a dollar one, six refused by this floor alone.
 *
 * ⚠️ **The reading that looked green was the wrong one.** `portfolio.totalValue` arrives
 * as a `Money` — an integer count of **minor units** — and a caller that hands
 * `minorUnits` straight in passes 10,000,000 for that $100,000 book, which puts the
 * floor back in its ordinary range: seven of the fifteen act. The unit lived only in
 * prose, so nothing could check it; now the currency is a value on both sides and the
 * arithmetic runs only when they are the same money.
 *
 * ⛔ **No weight was pre-registered to replace it.** A venue minimum is «a share in the
 * ordinary price range, in a quantity that can be staged into and trimmed», which is
 * 0.1 of a five-million-won book and 0.00001 of a fifty-billion-won one — there is no
 * non-fitted weight to publish, and `thresholds.mjs` opens by saying none of its numbers
 * was fitted. What an investor can state, and now can, is their own: as an amount in
 * their own currency, or as a weight that needs no currency at all.
 */
import { hostConstraints, mandateCeilings } from './mandate.mjs'
import { diagnostic, finite, round } from './numbers.mjs'
import { SIZING_POLICY } from './thresholds.mjs'

/**
 * An ISO 4217 code out of whatever a caller wrote, or `null` when nobody wrote one.
 *
 * ⛔ **It is not validated against a list.** The host's own table knows five currencies
 * and guesses the minor unit of everything else (`packages/domain/src/money.ts`), and a
 * second list in a manager package is a list that goes stale against the first one. All
 * this answer is used for is «is this the money the floor is an amount of», and for that
 * an unrecognised code compares unequal, which is the safe direction.
 */
function currencyCode(value) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return code === '' ? null : code
}

/**
 * `{ riskBudgetWeight, minimumExecutableWeight, sources }` plus the diagnostics that
 * say which number the run fell back to, because `PROMPT.md` requires a run to say so.
 *
 * `null` on either field means unresolved, and the refusal in `sizing.mjs` stands.
 *
 * @param {object} input
 * @param {object} [input.mandate] the invocation's Mandate as this package received it
 * @param {object} [input.book]    the account; `totalValue` is the only field read here
 * @param {object} [input.config]  `ManagerInvocation.config`
 */
export function sizingPolicy(input = {}) {
  const mandate = input.mandate ?? {}
  const config = input.config ?? {}
  const diagnostics = []
  const declared = mandateCeilings(mandate)

  /**
   * ── The budget ───────────────────────────────────────────────────────────
   *
   * ⚠️ **`config` may only narrow.** A wider value is not silently clamped and not
   * silently obeyed: it is reported and the pre-registered number governs, so the
   * answer never depends on whether anybody read the diagnostics.
   */
  let riskBudgetWeight = null
  let riskBudgetSource = 'unresolved'
  if (finite(mandate.riskBudgetWeight) && mandate.riskBudgetWeight > 0) {
    riskBudgetWeight = mandate.riskBudgetWeight
    riskBudgetSource = 'stated'
  } else if (declared.read) {
    riskBudgetWeight = SIZING_POLICY.riskBudgetWeight
    riskBudgetSource = 'methodology'
    const narrowed = config.riskBudgetWeight
    if (finite(narrowed) && narrowed > 0) {
      if (narrowed <= SIZING_POLICY.riskBudgetWeight) {
        riskBudgetWeight = narrowed
        riskBudgetSource = 'config'
      } else {
        diagnostics.push(
          diagnostic(
            'risk_budget_config_widens',
            'warn',
            `This instance is configured to risk ${round(narrowed)} of the book on one idea and this methodology pre-registered ${round(SIZING_POLICY.riskBudgetWeight)}. A setting may narrow that and may not widen it, so the pre-registered budget governs this run.`,
            'config.riskBudgetWeight',
            { configured: round(narrowed), preRegistered: round(SIZING_POLICY.riskBudgetWeight) },
          ),
        )
      }
    }
    diagnostics.push(
      diagnostic(
        'risk_budget_from_methodology',
        'info',
        `The Mandate declares no per-idea risk budget — it has no such axis — so this run sized on the ${riskBudgetSource === 'config' ? 'configured' : 'pre-registered'} ${round(riskBudgetWeight)} of the book. The investor's own ceilings still cut it wherever they are lower.`,
        'riskBudgetWeight',
        { riskBudgetWeight: round(riskBudgetWeight), source: riskBudgetSource },
      ),
    )
  }

  /**
   * ── The venue floor, which is money and therefore has a currency ──────────
   *
   * ⛔ **Without the size of the book this is unexpressible and the refusal stands.**
   * 500,000 won is a weight only against a total, and a floor skipped because the
   * total is unknown is a floor that passed a check it never made.
   *
   * ⛔ **And without the currency of the book it is unexpressible in the same way**
   * (`untilled/aumos#845`). The amount divided by the total is a weight only when both
   * are the same money. Until #845 the division ran on whatever arrived, so a dollar
   * book of $100,000 got a floor of 500000/100000 = **5.0** — five hundred per cent of
   * the account — and every case this package can act on sized and was then refused by
   * it. Measured on the fifteen committed fixtures under the host's Mandate: eight
   * acting on a won book, three on a dollar one.
   *
   * ⚠️ **A currency that was read and differs is an undeclared axis, not a missing
   * input.** This package published a minimum for a Korean venue; about a dollar
   * venue it has published nothing, and #838 settled that an axis the Mandate declares
   * nothing on constrains nothing rather than withholding everything. So the floor is
   * `0` there and a `warn` names both currencies and the two settings that state one.
   * ⛔ A currency the run never read is nobody having looked, and that still refuses.
   */
  let minimumExecutableWeight = null
  let minimumSource = 'unresolved'
  if (finite(mandate.minimumExecutableWeight)) {
    minimumExecutableWeight = mandate.minimumExecutableWeight
    minimumSource = 'stated'
  } else if (finite(config.minimumExecutableWeight) && config.minimumExecutableWeight >= 0) {
    /**
     * ⚠️ **The one spelling of this floor that never needs a currency.** An investor
     * whose venue is not the one this package was written against states the smallest
     * position it can express as a share of the book, and nothing below is consulted.
     */
    minimumExecutableWeight = config.minimumExecutableWeight
    minimumSource = 'config-weight'
    diagnostics.push(
      diagnostic(
        'minimum_executable_from_weight',
        'info',
        `This instance states the smallest position its venue can express as ${round(minimumExecutableWeight)} of the book, so no amount of money and no currency entered this run's floor.`,
        'config.minimumExecutableWeight',
        { minimumExecutableWeight: round(minimumExecutableWeight) },
      ),
    )
  } else if (declared.read) {
    const position = finite(config.minimumExecutablePosition) && config.minimumExecutablePosition >= 0
      ? config.minimumExecutablePosition
      : SIZING_POLICY.minimumExecutablePosition
    const floorCurrency = currencyCode(config.minimumExecutablePositionCurrency)
      ?? SIZING_POLICY.minimumExecutablePositionCurrency
    const bookCurrency = currencyCode(hostConstraints(mandate)?.baseCurrency)
    const totalValue = input.book?.totalValue
    if (bookCurrency === null) {
      diagnostics.push(
        diagnostic(
          'account_currency_not_stated',
          'warn',
          `The venue minimum is ${round(position, 0)} ${floorCurrency} and whether that is a statement about this account at all depends on what this account is denominated in. Pass the Mandate's \`constraints.baseCurrency\` — or state \`config.minimumExecutableWeight\`, which needs no currency.`,
          'mandate.constraints.baseCurrency',
          { minimumExecutablePosition: round(position, 0), minimumExecutablePositionCurrency: floorCurrency },
        ),
      )
    } else if (bookCurrency !== floorCurrency) {
      minimumExecutableWeight = 0
      minimumSource = 'undeclared'
      diagnostics.push(
        diagnostic(
          'minimum_executable_currency_mismatch',
          'warn',
          `The smallest position this methodology published is ${round(position, 0)} ${floorCurrency} and this book is denominated in ${bookCurrency}, so it is a fact about another venue and says nothing about this one. No venue floor constrained this run: state \`config.minimumExecutablePosition\` with \`config.minimumExecutablePositionCurrency\` set to ${bookCurrency}, or state \`config.minimumExecutableWeight\` as a share of the book.`,
          'config.minimumExecutablePositionCurrency',
          {
            minimumExecutablePosition: round(position, 0),
            minimumExecutablePositionCurrency: floorCurrency,
            baseCurrency: bookCurrency,
          },
        ),
      )
    } else if (finite(totalValue) && totalValue > 0) {
      minimumExecutableWeight = round(position / totalValue)
      minimumSource = finite(config.minimumExecutablePosition) ? 'config' : 'methodology'
      diagnostics.push(
        diagnostic(
          'minimum_executable_from_position',
          'info',
          `The smallest position this venue can express is ${round(position, 0)} in the account's own units, which on a book of ${round(totalValue, 0)} is ${minimumExecutableWeight} of it.`,
          'config.minimumExecutablePosition',
          { minimumExecutablePosition: round(position, 0), totalValue: round(totalValue, 0), minimumExecutableWeight },
        ),
      )
    } else {
      diagnostics.push(
        diagnostic(
          'account_value_not_stated',
          'warn',
          'The venue minimum is stated in the account\'s currency and turning it into a weight needs the size of the book. Pass `book.totalValue` — the invocation\'s `portfolio.totalValue`, in major units — or state `mandate.minimumExecutableWeight` outright.',
          'book.totalValue',
          { minimumExecutablePosition: round(position, 0) },
        ),
      )
    }
  }

  return {
    riskBudgetWeight,
    minimumExecutableWeight,
    sources: { riskBudgetWeight: riskBudgetSource, minimumExecutableWeight: minimumSource },
    diagnostics,
  }
}
