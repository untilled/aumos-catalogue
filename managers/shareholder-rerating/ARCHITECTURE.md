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
| `capital-headroom.mjs` | the issuer kind, and what the programme is paid out of in that kind's own units | the cross-kind refusal has to be a refusal, not an intention |
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

## Two things called a sector, and who owns each (#269)

The word does two jobs in this package and they answer to different people. Mixing them is how a
CET1 ratio ends up on an insurer and how a declared account limit ends up unchecked.

| | what it is | who decides it | where it is read |
|---|---|---|---|
| **fund risk-management sector** | the account's one consistent classification, the thing a Mandate ceiling is measured over | **the host** — and today's Mandate has no such axis | `concentration.mjs`, from `proposed.sector` and each book row's `sector` |
| **issuer kind** (기업 분석용 업종) | which balance sheet this is, and therefore which arithmetic is meaningful | **this package**, from filings and business reports | `capital-headroom.mjs`, from `issuerKind` |

⛔ **This pull request does not add a risk-management sector axis to the host.** `untilled/aumos#792`
judged it not needed yet. What is here is the contract a package owes when a Mandate *does* state
one.

### A stated ceiling that could not be checked holds the increase

`lib/concentration.mjs` answers a sector ceiling in one of three states, and `data.sectorLimitState`
carries which:

| Mandate | the account's classification | state | what happens |
|---|---|---|---|
| no sector ceiling | — | `not-applicable` | `sector_cap_not_applicable` · `info`. Every other axis runs |
| a ceiling | complete | `evaluated` | the total is formed and judged; over it is `sector_limit_exceeded` · `blocked` |
| a ceiling | the candidate, **or any book row**, unclassified | `unevaluated` | `sector_exposure_unevaluated`. `withinLimits` is `null`, and `null` is not a pass |

⚠️ **The candidate's own sector is not the whole of the question, and that is the likeliest hole.**
A ceiling is measured against a *total*, so one holding or one unapproved proposal without a sector
makes the total short by whatever it is — however well classified the candidate is. A run that
checked only the candidate passes that case, which is why
`#269 ①②③⑤` in the checker builds it explicitly and asserts the unclassified row is named.

⚠️ **The severity of that finding is the direction of the proposal**, which is unusual in this
package and is the contract: `unevaluated` on an addition, `warn` on a reduction and on the
`weight: 0` question the sizing asks. A limit that could not be checked withholds the thing the
limit constrains. So `evaluateCase` still reaches `RESIZE` on a position above target and still
returns a verdict about the company; only the purchase waits, as `data_missing`.

⛔ **`data_missing`, never `thesis_refuted`.** A classification nobody supplied is not a thesis
anybody refuted, and filing it as one would put a rejection in the ledger with no evidence behind
it.

## The five issuer kinds, and the two that have an arithmetic

`ISSUER_KINDS` in `lib/capital-headroom.mjs`:

| kind | | this package |
|---|---|---|
| `bank` | 은행·은행계 금융지주 | CET1 headroom over the issuer's own policy target |
| `non-financial` | 일반 비금융 | free cash after required investment |
| `insurance` | 보험 | ⛔ **unevaluated.** K-ICS, and it is not a CET1 in other units |
| `securities` | 증권 | ⛔ **unevaluated.** the NCR, likewise |
| `unclassified` | 복합·기타·분류 미확인 | ⛔ **unevaluated.** no single balance sheet to read |

⛔ **`financial` was retired and is not an alias.** It named the set containing all three financial
kinds, so it could not select one of them — and selecting the first was exactly the defect: the
cross-metric refusal ran across the financial/non-financial line and not inside it, so an insurer
carrying a `cet1` was refused by nothing. `BANK_ONLY` metrics are now refused for **every** kind
that is not `bank`. A caller still saying `financial` gets `issuer_kind_not_specific` ·
`unevaluated` and the list of words to say instead.

⛔ **Why the three are unevaluated rather than approximated.** A solvency ratio's meaning and the
arithmetic that converts it into distributable capital both have to be designed; putting K-ICS or
the NCR into the `cet1` slot because all three are "capital ratios" is this file's own refusal
wearing a different label. #269 scoped that design out, and an explicit non-evaluation is a wait
somebody can pick up rather than a silence.

⚠️ **The classification carries its receipts.** `classification.basis` names the filing or business
report the kind was read off; `classification.consolidationBasis` is `consolidated` or `standalone`,
because a holding company's consolidated CET1 and its banking subsidiary's are different numbers
about different entities. Both travel in `data.classification`, and both are `warn` when absent on
`regulatory_minimum_not_stated`'s argument: the ratio is what it is whichever entity it describes,
and what an absent basis costs is the ability to *say* which.

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

⛔ **The #269 regressions build their own inputs or mutate a `structuredClone` of a committed one.**
`fixtures/cases.json` was not reshaped for them; the only edit it carries in that change is the
vocabulary migration `sectorKind: "financial"` → `"bank"`, with every `expect` block unchanged, and
the checker asserts that no fixture still carries the retired word.

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
