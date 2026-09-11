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
| `no-mandate-numbers-is-unevaluated-not-a-default` | `data_missing` — a run that read no Mandate sizes nothing (`untilled/aumos#841`) |

`fixtures/return-composition.json` — the two legs, the three double counts, the unreceivable
dividend and the untaxed one. `fixtures/staged-plans.json` — eleven states of one plan, including
both re-run cases, the price-only stage, the exhausted budget and the expired stage.

`fixtures/boundaries.json` — the review regressions. Each names a base fixture and the mutations
to apply to a **copy** of it, so the cases above keep passing for the reasons they already passed
for. They cover the four P1 findings on `d36e32b` and the rest of that defect class: an unread
book, half an unread book, an unreadable row, absent caps, the declared gross cap in three states,
a held position below / at / above target, an increment under the venue minimum, an unstated venue
minimum, and the three classification inputs whose absence used to skip a test silently.

## An open proposal states a total, and the fold is `max` (#813)

The host publishes each unapproved judgement's **total** weight per asset — `portfolio_get` says
so in its own description — and the host executes it as a total: a book holding 6% of a name,
under another manager's open proposal for a total of 12%, sends an order for the **difference**
and ends at 12%. Never 18%. `untilled/aumos` PR #815 measured that through the real execution
path, and then measured what this package did with the same rows.

So exposure to one name is

```
exposure = max(held, the largest total any open proposal asks for)
         = held + max(0, thatTotal − held)
```

and this package reports the second term — what the pending proposals still require **on top of**
the holding — as the open-proposal figure, so that `held + open = exposure` stays an identity.

⚠️ **The row's field is `targetWeight`, which is the host's name for it.** It was `weight` here
until #813, next to `weight` on a holding row, which is one word meaning two things inside one
input object. A row that still carries `weight` is `open_proposal_row_unreadable` — an absence
rather than a permissive reading, because reading a total as an increment understates the account.

⚠️ **This package added the two until #813**, and the overstatement is not conservative in any
useful sense — it refuses positions on books with room:

| | held | pending total | the host produces | this package said |
|---|---|---|---|---|
| A | 0% | 8% | **8%** | 8% |
| B | 6% | 12% | **12%** | 18% |
| C | 6% | 15% | **15%** | 21% |

⚠️ **Two managers naming the same total have agreed on one end state**, not asked for two, so
their totals fold by `max` as well. That is the host's own reading of the field and the reason it
publishes no sum — a host-side sum is the aggregate cap `untilled/aumos#781` rejected by name.

⚠️ **`max`, and not «the latest total wins».** A pending *trim* does not reduce exposure before it
fills: a 14% holding under a proposal to take it to 8% is 14% of this book right now, and a
ceiling has to hold in both of the states the account passes through.

⛔ **The netting lives here rather than in the caller.** A run that is asked to subtract before it
calls is a run that can be argued out of subtracting, and every axis — the name, the sector and
the whole book — has to fold the same way or one name is counted twice on one of them.

## The two weights, and the rule behind the boundary cases

`targetTotalWeight` is what the name should **be**: the risk budget over the loss to invalidation,
under the single-name cap and under what the sector and gross ceilings leave once the rest of the
book is counted. `incrementWeight` is `targetTotalWeight − existingExposure`, which is what a
proposal carries — and `existingExposure` is the fold above, not the sum of the two rows. At target the run proposes nothing; above target it is a reduction question **about this desk's own
holding** and this manager proposes a reduction only against what is actually held **and assigned
to it** (#817); an increment below the venue minimum waits. ⚠️ Neither of the two weights is what
the host is handed — see «The weight that leaves is a third number» below.

⛔ **An absent input is not an input that passed.** `holdings` and `openProposals` are required
lists — an empty list says *there is nothing* and an absent one says *nobody looked*. A `BUY`
requires `concentration` to answer `true`; `null` is not a pass. Every staged re-check value is
required, and an unverified one returns `unevaluated` with an increment of zero. The same rule
extends to `requiredInvestment` (an unstated commitment is not zero), the venue minimum, and the
three classification inputs whose absence would otherwise skip the trap, flip and programme tests.

⚠️ **The venue minimum is an amount of money and therefore has a currency** (`untilled/aumos#845`).
`minimumExecutablePosition / book.totalValue` is a weight only when both are the same money, so the
amount names its currency (`minimumExecutablePositionCurrency`, KRW) and governs a book denominated
in that and no other. ⛔ On any other book the venue minimum for **that** account is undeclared, and
an undeclared axis constrains nothing and says so — the #838 rule, not a skipped check; what is
still a skipped check, and still refuses, is a book whose currency or size was never read at all.
An investor states their own as an amount in their own currency or as `minimumExecutableWeight`, a
share of the book that needs no currency. ⛔ **No weight is pre-registered**: the same amount is 0.1
of a five-million-won book and 0.00001 of a fifty-billion-won one, so any default here would be
fitted to one account size.

⛔ **The #269 regressions build their own inputs or mutate a `structuredClone` of a committed one.**
`fixtures/cases.json` was not reshaped for them; the only edit it carries in that change is the
vocabulary migration `sectorKind: "financial"` → `"bank"`, with every `expect` block unchanged, and
the checker asserts that no fixture still carries the retired word.

⛔ **Every figure in every fixture is invented for the arithmetic it exercises.** None is a price
record; none is copied from the source repository's private files; none was tuned so that the
reference case produces a `BUY` or any particular return.

## The weight that leaves is a third number, and «above target» says whose (#817)

`#813` and `#814` were both the **reading** direction — how the host's answer becomes this
package's `holdings` and `openProposals`. This is the **writing** direction.

`decision_submit` carries a `position-weight` **total for the whole position**, and
`rebalanceShadowBook` executes it against the whole position without ever reading attribution
(`untilled/aumos#815`). So the number that crosses the boundary has to carry the part of the
position this run is not entitled to move:

```
hostTargetWeight = otherHeld + (ownHeld + incrementWeight)
                 = held + incrementWeight
```

`evaluateCase` answers it, and it is `null` on every run that proposes no order — a weight is an
instruction, and there is none.

⛔ **Why the addition is code and not a sentence.** The argument #813 settled: a run asked to add
before it sends is a run that can be argued out of adding. `PROMPT.md` says what the number means
and forbids building it by hand; the arithmetic is here.

⛔ **Holdings are added and `existingExposure` is not.** That number folds every open proposal in,
which is right for a ceiling — a limit has to hold in every state the account passes through — and
wrong for an order: buying up to somebody else's pending total would be this run executing their
unapproved judgement.

**«The account is above it» became «*this desk's* holding is above it».** This package already
said the right sentence about pending rows — *an excess made of somebody else's unapproved
proposal is theirs to withdraw* — and #817 says it about holdings too. The test in the
`position_above_target` branch is `ownHeld`, not the whole position, and a run that leaves an
excess alone records `excess_is_not_this_managers_to_reduce`.

**What #817 measured.** Fund ₩100,000,000 on XKRX, 20% single-name ceiling, a 6% holding assigned
to **nobody**. This package sizes the name at `0.05` and called it a reduction; the real host,
driven to the exchange, turns that into `sell:10` — against a position no judgement on this fund
ever asked to reduce.

| the position's assignee | before #817 | after |
|---|---|---|
| another manager | `RESIZE`, `sell:10` — `untilled/aumos#786` refuses the judgement first, `submitted: 0` | `WAIT`, no weight |
| **this manager** | `RESIZE`, `sell:10`, and ⛔ **not a defect** — this is the reduction question, named | unchanged: `RESIZE`, `hostTargetWeight = targetTotalWeight` |
| **unattributed** | `RESIZE`, `sell:10`, and **nothing stops it** — this is the issue | `WAIT`, `excess_is_not_this_managers_to_reduce` |

⚠️ **Unattributed is not a rare state**: every holding bought by hand in a broker app, and every
position whose approval did not name a manager to run it (`untilled/aumos#785`).

⛔ **This is not «nobody may touch an unattributed position».** A BUY into an unattributed name
still leaves, and it leaves as a **buy** — `hostTargetWeight` adds to what is there rather than
replacing it. Once the investor assigns the position on the approval screen, `otherHeld` is 0 and
every reduction works exactly as it did. Making a hand-bought holding permanently untouchable is
the «safely do nothing» state `untilled/aumos#782` undid, and `#786`'s gate was deliberately not
widened to reach it.

⚠️ **One fixture input was restated, and no `expect` block moved.**
`boundaries.json → seven-percent-held-is-above-target-and-is-a-reduction-question` carried a
holding with no `strategy`, written before `assignment` reached the wire (`untilled/aumos#814` ·
`#816`) and silently read as this manager's. The row now says so. Every expected number is
unchanged — it is the same case, restated under the contract it is read against, which is exactly
the move `aumos-catalogue#275` made for the pending rows.

## The routes that reduce ask whose position it is (#819)

`#817` reached one branch — `position_above_target`, **inside** the buy path. Every other route
out of `evaluateCase` returns before the concentration fold ever runs, so `actionFor` judged on
`heldWeight`, the whole position, and reached `RESIZE` the moment the account held anything of the
name. Driven against the real host over a 6% holding assigned to nobody:

| case | this manager | unattributed | another manager |
|---|---|---|---|
| `rerated-reaches-trim-review` | `RESIZE` | `RESIZE` | `RESIZE` |
| `policy-retreat-reaches-trim-review` | `RESIZE` | `RESIZE` | `RESIZE` |
| `dividend-trap-is-refused` (`reject`) | `RESIZE` | `RESIZE` | `RESIZE` |

— all three with `hostTargetWeight: null` and `otherHeldWeight: null`, because this path never
called `concentration()` at all.

**What changed.** `heldAttribution` in `concentration.mjs` answers `held`/`ownHeld`/`otherHeld`
from the holdings alone, and the non-buy path calls it:

```
proposedAction        = ownHeld > 0 ? RESIZE : WAIT      ← the whole change, in one comparison
hostTargetWeightFloor = otherHeld                        ← no total sent may be below this
```

⛔ **Why a second function rather than the fold.** The attribution is a question about the *book*
— whose shares are these — and the fold is a question about the *Mandate*. Calling the whole fold
here would return `emptyAnswer()` under a Mandate that states no single-name cap, so a run with no
declared ceiling would not know whose position it is, and a run that does not know that is the run
that sells somebody else's. One definition, two callers: `concentration` reads it too, so the two
cannot drift.

**The `exit` judgement, which is the same in all three packages.** An `exit` target is a real `0`
(`untilled/aumos#154`) and bypasses every weight computed anywhere. So *«close this out»* is a
`position-weight` total equal to `otherHeld` — which sells all of this desk's and none of theirs —
and it is an `exit` only when `otherHeld` is 0. `catalyst-turnaround` already answers that number
on its `close-out`; this package publishes it as `hostTargetWeightFloor` on every route, and
`fundamental-mean-reversion` publishes the same floor and stops offering `SELL` above it.

| the position's assignee | before #819 | after |
|---|---|---|
| another manager | `RESIZE` — but `untilled/aumos#786` refuses the judgement first, `submitted: 0` | `WAIT`, and `reduction_is_not_this_managers_to_make` |
| **this manager** | `RESIZE`, and ⛔ **not a defect** — reducing its own position is what the route is for | **unchanged**: `ownHeld` is the holding, `otherHeld` is 0, the floor is 0 |
| **unattributed** | `RESIZE`, and **nothing stops it** — this is the issue | `WAIT`; the finding about the company stands, the order does not follow |

⚠️ **The classification never moved.** A re-rated name is `rerated` whoever holds it: this is the
same separation the file already made for an unreadable book — the finding is about the company
and the action is about the account.

⛔ **This is not «nobody may touch an unattributed position»** (`untilled/aumos#782`). A buy into
one still leaves as a buy, and once the investor assigns the position on the approval screen
(`untilled/aumos#785`) every reduction works exactly as it did.

⚠️ **A run that names no `strategy` can attribute nothing**, so every row lands in `otherHeld` and
no reduction leaves. That is reported as `run_did_not_name_its_strategy` (`unevaluated`) rather
than resolved by a guess — `aumos-catalogue#268` §1 forbids inferring ownership from cost and
quantity. Two `cases.json` inputs gained a top-level `strategy` for that reason; their `expect`
blocks are unchanged, and the rows themselves already named this manager.

⛔ **What was not done**: the host does not fold or add (`untilled/aumos#781`), execution does not
read attribution (`untilled/aumos#232`), and `#786`'s gate was not widened to unattributed
positions (`untilled/aumos#782`).

## A ceiling withholds an addition and never a reduction (#830)

`#813`, `#817` and `#819` were all about **how much** an order was for. This one is about whether
there was an order at all, and `untilled/aumos#782` is the sentence it breaks: *nothing here can
turn a real reduction into a no-op.*

`evaluateCase` folds concentration twice, and the first fold proposes nothing — `weight: 0`. It
asks what the account permits this name to **be**; that ceiling goes into the sizing, and the
sizing minus what the account already carries is what decides between a purchase and a reduction.
Until #830 the three limit gates inside that fold raised `blocked` on `projected > cap` whoever put
the account there, so `withinLimits` came back `false` and `index.mjs` turned the whole case into a
`wait` **before the reduction branch existed**. The diagnostic recorded `proposed: 0` about itself
while doing it.

**What #830 measured** — through the real host, over this desk's own 6% holding under a 10%
`accountPositionCap`, with `catalyst-turnaround` sealing a BUY **nobody approved**
(`funding: unfunded`, no reservation, no order):

| another desk's pending total | before #830 | after |
|---|---|---|
| none · 0.03 · 0.06 · 0.1 | `trim-or-exit-review` · `0.05333333` · **`sell:6`** | **unchanged** |
| **0.1001** | ⚠️ `wait` · `null` · **no order** | `trim-or-exit-review` · `0.05333333` · `sell:6` |
| 0.12 · 0.2 · 0.5 | `wait` · `null` · no order | `trim-or-exit-review` · `0.05333333` · `sell:6` |

The threshold was `projected > cap` exactly: `0.1` kept the trim and `0.1001` deleted it.

⚠️ **And it fires with nobody else on the book.** A desk holding 0.101 of a name under its own
0.1 ceiling could not reduce itself, because the answer to *«you are over the limit»* was to
withhold the only order that fixes it. That half has nothing to do with running beside another
manager, and the same one condition closes both.

⚠️ **The sentence was already in this file, one paragraph below the gate.**
`sector_exposure_unevaluated` has carried it since #269 — *«Only an addition is withheld when a
stated ceiling cannot be evaluated»* — and `index.mjs`'s trim branch says the other half — *«an
excess made of somebody else's unapproved proposal is theirs to withdraw»*. Neither was reachable,
because the gate answered first. So `increasesExposure` moved above the first gate and all three
axes read it: `concentration_limit_exceeded`, `sector_limit_exceeded` and `gross_limit_exceeded`
are `blocked` on an addition and `warn` on a run that adds nothing.

⛔ **The ceiling itself did not move, and `#813` never depended on this gate.** A limit has to hold
in every state the account passes through, so an unfilled buy still counts before it fills — in
`existingExposure`, in `maxTotalWeightForName`, which bounds the sizing whichever direction the run
is going, and in the **second** fold, whose `weight` is a real increment and whose gates are as
`blocked` as they ever were. A book at or over its ceiling still buys nothing; what no longer
follows from a full book is the deletion of the order that empties it.

⚠️ **`warn` and not silence.** The book *is* over the ceiling and an investor approving a reduction
should see that; what changed is that saying so no longer withholds anything. The diagnostic codes
are unchanged for the reason `untilled/aumos#687` gives — a renamed field arrives at a model as
`undefined` rather than as an error — and each now carries `increasesExposure`, so a reader can
tell which direction was judged.

⚠️ **One committed fixture moved, and only in which sentence declines it.**
`account-concentration-caps-never-sum` is an account carrying 9% of a name against an 8% binding
ceiling with **none of it this desk's**. It declined as `wait` / `risk_limit_exceeded` and now
declines as `trim-or-exit-review` / `position_above_target` — the same answer #817 already blessed
for an unattributed holding, and the same one the identical book already gave when the cap was
0.10 rather than 0.08. Still `WAIT`, still no order, still `incrementWeight: 0`, and
`concentration_limit_exceeded` still names the breach; what the fixture is *for* — that two caps
fold by minimum and never by sum — is asserted unchanged. `risk_limit_exceeded` stays reached by
the two `boundaries.json` rows where the ceilings leave a purchase no room at all, and the #254
check now reads both fixture files.

⬜ **A second door was left open here and `#833` closed it.** The paragraph that stood in this
place said that `index.mjs` refuses a second time on `targetTotalWeight <= 0`, that the branch
folds the account's leftover room in through `maxTotalWeightForName`, and that closing it meant
deciding what a ceiling-derived `0` means for a position this desk already holds. The section
below is that decision.

## A ceiling made of other names sizes no sale (#833)

`#830` closed the three **gates**. This is the **fold** underneath them, and the measurement that
opened it says the door was worse than the paragraph above guessed: the reduction does not simply
vanish at the boundary — **it grows all the way to the boundary first.**

Every declared axis folds into `maxTotalWeightForName`; the sizing is bounded by it; `index.mjs`
subtracts what the account carries. So as another desk's **other names** fill a sector or the whole
book, the ceiling on *this* name falls, and a reduction sized against it grows. Measured through
the real host on a 6% position wholly this desk's, its own thesis intact, `accountSectorCap` 0.25,
this package sizing the thesis at `0.05333333`:

| other names in the sector | `hostTargetWeight` | the order | multiple |
|---|---|---|---|
| 0 · 0.19 | `0.05333333` | `sell:6` | 1.0× |
| **0.21** | `0.04` | **`sell:20`** | **3.0×** |
| **0.24** | `0.01` | **`sell:50`** — 83% of the position | **7.5×** |
| **0.245** | `0.005` | — | **8.2×** |
| **0.2451 and above** | `null` | ⛔ **no order at all** | deleted |

The threshold that deletes it is `cap − minimumExecutableWeight` (0.245 on the sector axis, 0.495
on the gross axis). The gross axis is the same arithmetic with a wider bucket.

⛔ **And an unapproved proposal produced the same number as a holding** — 0.21/0.24/0.245 → 0.04 /
0.01 / 0.005 either way, `null` either way past the threshold. That is the mirror of what
`aumos-catalogue#281` closed in `fundamental-mean-reversion` and what `#284` closed in this
package's gates: *a pending total is exposure for a ceiling and is not a position for an order.*

### The judgement, because the arithmetic could not make it

⛔ **A residual is not an allocation.** A sector ceiling states no division of itself between the
names under it. Reading *«the sector has 0.01 left»* as *«this position must become 0.01»* silently
assigns the entire adjustment to whichever name was evaluated last — and to a desk that may not be
able to reduce a single share of what filled the bucket. **An arithmetic whose answer depends on
evaluation order has not made a decision.** Evaluate the same book starting from the other name and
the other name pays instead; nothing in the Mandate chose either.

So the fix is **not the `0` boundary** the issue framed. Option ⑴ — *«when the ceiling derives 0,
answer this desk's own holding»* — was written believing the failure was the disappearance, and it
would have left the 3.0× and the 7.5× rows exactly where the host measured them. What changed is
**which ceilings may size a sale**:

| | binds an addition | sizes a reduction |
|---|---|---|
| `accountPositionCap`, `strategyPositionCap` — *«this name may be at most X»* | ✅ | ✅ |
| the risk arithmetic, `mandatePositionCap` — this thesis's own size | ✅ | ✅ |
| `accountSectorCap`, `accountGrossCap` **less every other name in the bucket** | ✅ | ⛔ |

A ceiling that **names this position** needs no allocation across names, so a desk over one reduces
itself and always could — that is `#830`'s standalone half and it is untouched. A ceiling that is
the account's **leftover room after other names** is a statement about the account, and this
package already carried the sentence that decides it, twice, since #269 and #830: *a ceiling
constrains additions rather than reductions.* The **fold** was the last place it was not applied.
The gates stopped withholding a reduction and the arithmetic went on sizing one.

⚠️ **Option ⑶'s word exists and it is a finding rather than a route.**
`reduction_is_not_sized_by_the_accounts_remaining_room` fires wherever the two folds diverge and
carries **the order this fix withholds** — `hostTargetWeightIfRoomFolded` — beside the one that
leaves. `untilled/aumos#782` is only checkable if both numbers are on the page; the same rule
`aumos-catalogue#281` wrote as `hostTargetWeightIfPendingFolded`. It is silent when the two folds
agree, which is every account with nothing else in the bucket.

### What it is made of

`concentration` splits its axis list into `nameAxes` and `residualAxes` and folds it **twice**:
`maxTotalWeightForName` / `maxTotalWeightBinding` (every declared axis — ⛔ **not one byte
different**) and `reductionNameLimit` / `reductionNameLimitBinding`. `targetWeight` folds its cap
list twice the same way — `targetTotalWeight` and `reduceTargetTotalWeight` — and an absent
`accountNameLimitForReduction` is the same fold twice, so a caller written before #833 is
unchanged. `index.mjs`'s reduction branch is the **only** consumer of the second fold, and it asks
the direction question **before** the two refusals that are about a purchase (`targetTotalWeight`
below the venue minimum, and `targetTotalWeight <= 0`) rather than after them.

⚠️ **The RESIZE/WAIT test and the weight that leaves read one fold.** They have to: the entry fold
is the smaller of the two, so a test against it says `RESIZE` on a desk whose own holding is *below*
the number the order then names — a **purchase sent out of a judgement to reduce**. A mutant that
splits them survives the whole ramp and is caught by one case, and that case is in the verifier.

⛔ **`untilled/aumos#813` did not move.** The entry direction still folds every declared axis and
every unapproved proposal: a bucket with 0.04 of room buys 0.04, a full one buys nothing, and a
pending total counts before it fills. ⛔ `#817`'s `otherHeld + target`, `#819`'s floor and the
`ownHeld > target` test are unchanged. ⛔ No fixture file was reshaped, no diagnostic code was
renamed, and the venue minimum still refuses a target below it on **both** folds.

⚠️ **What is genuinely lost, said out loud.** When a sector really is over its ceiling and the
names filling it are this desk's *other* holdings, this package will no longer trim **this** name
on the sector axis. It reports `sector_limit_exceeded` as a `warn` — the excess stands and is
named — and the reduction that follows comes from a ceiling that names a position: this desk's own
single-name cap, or the risk budget, on whichever name is actually oversized. Dividing a sector
budget across this desk's own names is portfolio construction, and a per-name evaluator has no
input that would let it choose. ⚠️ **No sale grows and none is invented**: the reduction fold is
never the smaller of the two, so every order this change moves gets *smaller*, and the state it
newly declines to act in is a `WAIT` that says why rather than the silent no-op that was there at
`0.2451`.

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
under several theses are unverified *by these checks*.

They were verified elsewhere. untilled/aumos#789 fed this package's real `lib` from the host's real
kernel — sealing, position assignment, reservations, execution locks — and ran the resulting target
weights back through the host to a venue, fifteen times. The host hands every manager's open
proposals and the assignment of every position, and this package's exposure arithmetic is correct on
top of them. **This may be run beside another manager on one funded book.**

What those runs could not reach is a vendor CLI and a live broker: no measurement here or there
exercises a real session or a real fill. The forward record is still the thing nobody has.
