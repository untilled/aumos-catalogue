# Architecture

The maintainer-facing half of this package. `README.md` is the page an investor chooses from and
carries none of this on purpose.

## What is prose and what is code, and why the line is there

The catalogue's default is prose, and most of this package is prose: `PROMPT.md` is what every run
walks through, and `skills/` holds the stages that apply to one kind of case. The judgement lives
there because it is judgement — why a company is discounted, whether the cause is resolving, where
this desk differs from the market.

`lib/` exists for the parts where #257's completion conditions demand something *checkably* right
rather than well argued, and each module is one of those conditions:

| module | what it decides | why it is not prose |
|---|---|---|
| `return-composition.mjs` | the two-leg total return, and the refusal to add a buyback to a dividend | the failure is an addition, and a model asked to add three yields adds three yields |
| `capital-headroom.mjs` | what the programme is paid out of, in the sector's own units | the cross-sector refusal has to be a refusal, not an intention |
| `classify.mjs` | which of nine cases this is, and which route it takes | "these four look-alike cases end differently" is only a claim if a fixture can assert it |
| `sizing.mjs` | the loss to invalidation, and the weight under every cap | it decides how much of somebody's book moves |
| `staged-plan.mjs` | what a stage proposes given what is already held and proposed | the re-run property is arithmetic; a promise not to double up is not |
| `concentration.mjs` | the account-wide fold, and the minimum-not-sum rule | three managers can each show correct working and hold 30% of one name |
| `thresholds.mjs` | every fixed number, with formula, unit and rationale | so the whole of the package's discretion is one screen |
| `index.mjs` | `evaluateCase`, which runs them in the methodology's order | the fixtures need one entry point to assert against |

`tools/verify-shareholder-rerating.mjs` in this repository runs all of it against
`fixtures/`, in plain Node with `node:assert/strict`. There is no test framework here and this
package did not add one.

## State ownership

| state | owner | this package's part |
|---|---|---|
| holdings, cash, fills | Aumos Portfolio | reads it; never keeps a second copy |
| open, unapproved proposals | Aumos | reads them, and counts them as exposure |
| active theses and invalidation conditions | Aumos Thesis | reads and proposes changes to |
| source observations and their ids | Aumos Evidence | cites ids it was issued; invents none |
| re-check promises | Aumos WATCH | arms them every run, including on a WAIT |
| decisions and forward outcomes | Aumos Decision / Forward Track Record | proposes; measures nothing itself |
| staged-plan ledger, unfinished-research notes, the armed review | this instance's private folder | aggregates and progress only |

⚠️ **The private folder is progress, never positions.** A ledger that starts trying to mirror the
account is wrong the first time a fill is partial. It records which stage was proposed, under which
decision id, at which instant, and what the run re-checked.

## The staged plan, in one paragraph

A plan is one `cumulativeTargetWeight`, a `decisionId` it descends from, and stages whose
`toWeight` is **cumulative**. `stagedIncrement` proposes `toWeight − (held + openProposal)`, which
is why a repeated run adds nothing whether or not the ledger write survived — the property the
fixture `the-same-stage-again-with-the-ledger-lost` asserts. A stage whose conditions are all about
the price is refused; every stage re-checks the thesis, the remaining discount and the remaining
risk budget; a stage that does not fit the remaining budget waits rather than being trimmed to fit.

## Fixture inventory

`fixtures/cases.json` — end to end through `evaluateCase`:

| fixture | reaches |
|---|---|
| `financial-positive-reaches-buy` | `shareholder-rerating` → `buy-path` → `BUY` at a computed 5.33% |
| `reference-plan-is-classified-not-screened-out` | `shareholder-rerating`, with an RSI of 61 in the input that no module reads |
| `rerated-reaches-trim-review` | `rerated` → `trim-or-exit-review` → `RESIZE` |
| `policy-retreat-reaches-trim-review` | `return-policy-retreat` → `trim-or-exit-review` → `RESIZE` |
| `dividend-trap-is-refused` | `dividend-trap` → `reject` |
| `one-off-earnings-is-refused` | `one-off-earnings` → `reject` |
| `capital-inadequate-is-refused` | `capital-inadequate` → `reject` |
| `announced-not-executed-goes-to-watch` | `announced-not-executed` → `watch` → `WATCH` |
| `absence-is-not-refutation` | `data-missing`, with no blocked diagnostic anywhere |
| `bank-metric-on-an-industrial-is-the-runs-mistake` | `research-incomplete`, not a capital finding |
| `unfinished-research-is-not-a-rejection` | `research-incomplete`, naming the two unwritten outputs |
| `account-concentration-caps-never-sum` | `risk_limit_exceeded` on 8% binding, not 18% |
| `a-cap-binds-the-total-and-the-increment-is-what-is-left` | `BUY` — a 4% cap on the total, 3% already carried, 1% proposed |
| `position-below-the-venue-minimum-is-refused` | `position_not_executable` — refused, not rounded up |
| `no-mandate-numbers-is-unevaluated-not-a-default` | `data_missing` — no default risk budget exists |

`fixtures/return-composition.json` — the two legs, the three double counts, the unreceivable
dividend and the untaxed one. `fixtures/staged-plans.json` — eleven states of one plan, including
both re-run cases, the price-only stage, the exhausted budget and the expired stage.

`fixtures/boundaries.json` — the review regressions. Each names a base fixture and the mutations
to apply to a **copy** of it, so the cases above keep passing for the reasons they already passed
for. They cover the four P1 findings on `d36e32b` and the rest of that defect class: an unread
book, half an unread book, an unreadable row, absent caps, the declared gross cap in three states,
a held position below / at / above target, an increment under the venue minimum, an unstated venue
minimum, and the three classification inputs whose absence used to skip a test silently.

## The two weights, and the rule behind the boundary cases

`targetTotalWeight` is what the name should **be**: the risk budget over the loss to invalidation,
under the single-name cap and under what the sector and gross ceilings leave once the rest of the
book is counted. `incrementWeight` is `targetTotalWeight − (held + open)`, which is what a
proposal carries. At target the run proposes nothing; above target it is a reduction question and
this manager proposes a reduction only against what is actually held; an increment below the venue
minimum waits.

⛔ **An absent input is not an input that passed.** `holdings` and `openProposals` are required
lists — an empty list says *there is nothing* and an absent one says *nobody looked*. A `BUY`
requires `concentration` to answer `true`; `null` is not a pass. Every staged re-check value is
required, and an unverified one returns `unevaluated` with an increment of zero. The same rule
extends to `requiredInvestment` (an unstated commitment is not zero), the venue minimum, and the
three classification inputs whose absence would otherwise skip the trap, flip and programme tests.

⛔ **Every figure in every fixture is invented for the arithmetic it exercises.** None is a price
record; none is copied from the source repository's private files; none was tuned so that the
reference case produces a `BUY` or any particular return.

## The fixed thresholds

Stated in full, with formula and rationale, in `lib/thresholds.mjs`. In summary:

| name | value | unit | what it is a property of |
|---|---|---|---|
| `executionPaceFloor` | 0.5 | dimensionless | the mechanics of a treasury programme's own window |
| `executionObservableElapsed` | 0.25 | share of the window | the Korean quarterly progress-disclosure cycle |
| `relativeYieldTrap` | 2.0 | × the sector median yield | the point at which a yield describes the price |
| `nonRecurringShare` | 0.3 | share of pre-tax profit | accounting materiality; the payout *flip* is the primary test and needs no threshold |
| `weightTolerance` | 1e-6 | portfolio weight | IEEE-754 noise, below any expressible position |

**Deliberately absent:** a default risk budget, a default position cap, a default sector cap and a
default entry discount. Those are the Mandate's, and their absence is `unevaluated` rather than a
pass.

## Derived from `evidence-gated`

This package imports nothing from another package directory — the published artifact is a
path→contents map rooted here, and a relative path that leaves it does not survive publication. So
the pure arithmetic that was worth reusing was copied and adapted, and the policy around it was
left behind:

| taken from | what was taken | what was left |
|---|---|---|
| `lib/diagnostics.mjs` | `finite`, `round`, the diagnostic row, the `{data, diagnostics}` answer shape | the KRW/USD sleeve table, `convertCurrency`, `grandfatherPolicy`, the cause-code registry |
| `lib/sizing.mjs` (`targetWeight`) | min-of-caps, the venue-minimum refusal, absent cap ⇒ `unevaluated` | quarter-Kelly and its conviction term, `effectivePositionCap`'s variant-view gate and unlock arithmetic, sleeve budgets, the maturity lane |
| `lib/sizing.mjs` (`concentration`) | positions + proposed folded against a cap table, headroom per axis | sleeve budgets, currency conversion, the theme axis |
| `lib/sizing.mjs` (`entryTranchePlan`), `lib/schedule.mjs` (`trancheIntent`) | a plan carrying its originating decision id, expiries, a wake per stage | the 40/35/25 ladder, price and time fallbacks, the lens vocabulary |
| `lib/valuation.mjs` | the habit of a `units` block beside every number | its valuation policy |

There is no shared library in this repository and this pull request did not create one; #256's
follow-up owns that question, and this table is its inventory.

## What has not been verified here

The host-side half. Nothing in this repository can run an Aumos session, so proposal storage, WATCH
re-arming, the link from a decision to an actual fill, and how the host attributes a position held
under several theses are unverified by these checks. #256 requires that verification before this is
run beside another manager on one funded book; until it exists, run it on a separate fund.
