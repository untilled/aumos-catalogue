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
 */
import { mandateCeilings } from './mandate.mjs'
import { diagnostic, finite, round } from './numbers.mjs'
import { SIZING_POLICY } from './thresholds.mjs'

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
   * ── The venue floor ──────────────────────────────────────────────────────
   *
   * ⛔ **Without the size of the book this is unexpressible and the refusal stands.**
   * 500,000 won is a weight only against a total, and a floor skipped because the
   * total is unknown is a floor that passed a check it never made.
   */
  let minimumExecutableWeight = null
  let minimumSource = 'unresolved'
  if (finite(mandate.minimumExecutableWeight)) {
    minimumExecutableWeight = mandate.minimumExecutableWeight
    minimumSource = 'stated'
  } else if (declared.read) {
    const position = finite(config.minimumExecutablePosition) && config.minimumExecutablePosition >= 0
      ? config.minimumExecutablePosition
      : SIZING_POLICY.minimumExecutablePosition
    const totalValue = input.book?.totalValue
    if (finite(totalValue) && totalValue > 0) {
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
