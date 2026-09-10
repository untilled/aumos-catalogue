# Architecture

The maintainer's document. The [README](README.md) is the page an investor chooses from; this
is what somebody changing the package needs, and it is deliberately not on that page.

## What is code here, and why so little of it

The catalogue's default is prose and this package keeps it: what a fall means, whether a
business is intact, which assumption the market over-extrapolated, what the thesis is and
whether the evidence is good enough are all in `PROMPT.md` and in `skills/`.

Six things are arithmetic instead, and the test for admission was narrow — **does this fail
silently when a model does it by eye?**

| operation | what it answers | the silent failure it removes |
|---|---|---|
| `priceState` | the normalised series, the technical state, whether the discovery gate opened | a drawdown taken over a history that steps by a factor, or over an unadjusted series |
| `stabilisation` | `confirmed` / `falling-knife` / `stabilization-unconfirmed` / `data-missing` | a condition re-derived per run, and quietly loosened on the run that wants the trade |
| `reversionTarget` | the range, and **what kind of claim it is** | a moving average written up as a valuation |
| `positionSizing` | the weight, the effective loss, the binding constraint | a stop price treated as a fill; per-strategy limits summed into an account limit |
| `stagedPlan` | the ledger of what has already been proposed under a plan | a re-run adding the same rung twice |
| `classifyCase` | one outcome, one verdict, one diagnosis code | an absence recorded as a refutation |

Everything is pure: no clock, no network, no filesystem, no `process`. `asOf` is an argument of
every call and a call without one is refused.

## The thresholds, and where they live

All of them are in `lib/core.mjs` as one frozen `THRESHOLDS` object, and
`tools/verify-fundamental-mean-reversion.mjs` pins them **again as literals**. That second copy
is deliberate and is the only one in the checker: #259 fixes these conditions in the pull
request that adds the package and forbids adjusting them to make a case pass, so a later edit
has to arrive as a diff in a file whose only subject is that they did not move.

| threshold | value | unit | formula |
|---|---|---|---|
| `discovery.drawdownWindowBars` | 252 | completed bars | window for the reference high |
| `discovery.drawdownFloor` | −0.30 | fraction of price | `close / max(high, 252) − 1 ≤ −0.30` |
| `discovery.rsiCeiling` | 35 | RSI 0–100 | Wilder RSI(14) on adjusted closes |
| `discovery.ma200DistanceCeiling` | −0.15 | fraction of price | `close / ma200 − 1` |
| `stabilisation.baseWindowBars` | 120 | completed bars | window the base low is taken from |
| `stabilisation.knifeWindowBars` | 5 | completed bars | a low this recent is a knife |
| `stabilisation.minSessionsSinceLow` | 15 | completed bars | bars since the base low |
| `stabilisation.minReclaimAboveBaseLow` | 0.05 | fraction of price | `close / baseLow − 1` |
| `stabilisation.minRsi` | 35 | RSI 0–100 | at the decision bar |
| `integrity.*` | see #248 | ratio / log return | unchanged from `evidence-gated` |
| `history.minBars` | 250 | completed bars | below it, nothing above can be computed |
| `sizing.perThesisRiskBudget` | 0.0075 | fraction of NAV | numerator of the weight |
| `sizing.gapHaircutFloor / Cap` | 0.03 / 0.15 | fraction of price | clamp on the measured worst session |
| `sizing.haltHaircut` | 0.02 | fraction of price | added on a halt or a daily price limit |
| `sizing.participationRate / Days` | 0.10 / 3 | fraction / sessions | the liquidity ceiling |
| `wait.maxWaitDaysDefault` | 120 | calendar days | ceiling on a thesis's own deadline |

`config` may **narrow** `perThesisRiskBudget` and may never widen it: `narrowingOnly` refuses a
looser value, reports `config_loosens_preregistered_threshold`, and returns the pre-registered
number. The entry gate reads no configuration at all.

## Derived from `evidence-gated`, and what changed

There is no shared library in this repository and no cross-package import: the published format
is a path→contents map, so a path outside this directory does not survive publication. What was
taken was copied and adapted, and the inventory is here so that a later commonisation pass has
something to work from.

| taken from | what | what changed |
|---|---|---|
| `lib/diagnostics.mjs` | `finite`, `round`, `diagnostic` | unchanged, minus the market/currency tables this package does not need |
| `lib/indicators.mjs` | `sma`, `rsi`, `normalizeBars`, `unclosedNewestBar`, `BAR_CLOSE_LAG_MS` | `normalizeBars` refuses a zero or negative OHLC value, and raises `newest_bar_may_be_unclosed` as **`blocked`** rather than `info` — this methodology reviews on completed bars and every reading is taken off the newest rows |
| `lib/indicators.mjs` (#248) | `priceSeriesDiscontinuity` and `PRICE_DISCONTINUITY_BOUNDS` | bounds unchanged; severity raised from `info` to `blocked`, because there the corrupted number feeds a ranking and here it *is* the entry signal |
| `lib/indicators.mjs` | `indicatorPacket` | reworked into `technicalState`: a 252-bar reference high instead of a 200-bar one, `ma120`, `ma200Rising`, a volume-drying ratio, and no legacy volume window |
| `lib/source-parsers.mjs` | `adjustment_basis_conflict` | generalised into `adjustmentBasis`, which judges by **declaration** and refuses an undeclared basis outright — the ex-dividend case leaves no shape in the bars, so nothing but a declaration can see it |
| `lib/price-levels.mjs` | the idea that a level states its **purpose** and is never inferred | not the code. AMP's `Money` encoding, the exponent arithmetic and the armed-key link checks are the host contract and belong to that package; here the same principle appears as `reversionTarget`'s `kind`, derived from `basis` |
| `lib/sizing.mjs` | the shape of a ceiling-and-budget calculation | rewritten. None of `evidence-gated`'s lane, calibration or mandate-execution policy came across; what is shared is the argument that the cap is not the order |

Nothing was taken from `evidence-gated`'s allocator, learning, calibration, catalyst, coverage,
memory or recipe modules, and no fixture was copied.

## The absence rule, and where it is enforced

One defect class runs through every operation here and it is worth stating once: **a declared
input that is absent, unread or unadjudicable must never read as a pass.** It arrives as
ordinary defensive code — `Array.isArray(x) ? x : []`, `finite(x) && check(x)`,
`clamp(measured, floor, cap)` — and every one of those turns *«nobody could tell»* into
*«nothing was wrong»*.

The three shapes, and the rule for each:

| shape | what it did | what it does |
|---|---|---|
| a collection defaulted to empty | an unread book had **unlimited** headroom under every cap | `bookIsReadable` requires both arrays; an empty one is a fact, a missing one refuses |
| a guard written `finite(x) && …` | the check silently did not run when its input was absent | the absent input refuses first: `mandate_gross_cap_missing`, `target_prior_high_unreadable`, `staged_total_unstated`, `plan_expiry_unstated`, `stage_weight_unstated` |
| a clamp with a floor | a plausible number stood in for a measurement | `gapHaircut` returns `measurable: false` and `positionSizing` refuses on it |

And two severity rules that make the above bite: a reading that could not be taken is
`blocked` (it refuses), a reading nobody declared is `unevaluated` — and `classifyCase` will
not reach BUY over a sizing answer carrying either. `info` stops nothing and is reserved for
facts worth recording.

⛔ **Every one of these refusals is `data_missing`.** Absence is not evidence against a thesis
(#254), so none of them may be reported as `thesis_refuted`, and none of them is
`risk_limit_exceeded` either — that code means the judgement was made, was positive, and the
book has no room.

### The two weights

`targetTotalWeight` is *«the whole position should be this»* and `incrementalWeight` is *«buy
this much more today»*. They were one field, and one field carrying both meanings is a proposal
the host executes wrongly in one of its two readings with no way to tell which it was handed.

Caps are measured against what **other** strategies hold, so this thesis's own weight is
subtracted once — at the increment — rather than twice. `atOrAboveTarget` is the defined state
where the increment is zero because the position is complete; `classifyCase` answers
`target-weight-already-held` and `WAIT`, which is a different sentence from «no room» and would
otherwise have been the same zero.

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

## The weight that leaves is a third number (#817)

`#813` and `#814` were both the **reading** direction — how the host's answer becomes a row of
this package's `book`. This is the **writing** direction, and until #817 nothing said anything
about it.

Two totals, and they are not the same total:

| | what it means | who computes it |
|---|---|---|
| `targetTotalWeight` | the cap **less what everyone else has** — this thesis's share of the position | `positionSizing`, out of `exposure.otherWeight` |
| host `targetWeight` | the **whole position's** weight, executed against the whole position with no attribution read (`untilled/aumos#815`) | the host, on whatever number it is handed |

The conversion is one addition, and it lives in `positionSizing`:

```
hostTargetWeight = exposure.otherHeldWeight + targetTotalWeight
```

⛔ **Why the addition is code and not a sentence.** The same argument #813 settled: the model
assembles the rows, and a run asked to add before it sends is a run that can be argued out of
adding. The prose in `PROMPT.md` says *what the number means and never to build it by hand*; the
arithmetic is here, next to the fold it is the mirror of.

⛔ **The addend is `otherHeldWeight` and never `otherWeight`.** The second folds open proposals
in. That is right for a *ceiling* — a limit has to hold in every state the account passes
through — and wrong for an *order*: an unfilled proposal is not a position, and adding one would
have this run buy another manager's unapproved judgement for them. Two fields, because the two
directions genuinely need two numbers.

**What `#817` measured, and it is a sale.** Fund ₩100,000,000 on XKRX, 20% single-name ceiling, a
6% holding assigned to **nobody** and 12% pending under another manager. This package reaches BUY
and sizes `targetTotalWeight = 0.0375`; the real host, driven to the exchange, turns that into
`sell:22`. `0.06 + 0.0375 = 0.0975` is `buy:37`.

| the position's assignee | before #817 | after |
|---|---|---|
| another manager | `sell:22` — but `untilled/aumos#786` refuses the judgement first, `submitted: 0` | `hostTargetWeight = 0.06 + share`, a buy |
| **this manager** | `sell:22`, and ⛔ **not a defect** — a desk reducing its own position is what this methodology is for | unchanged: `otherHeldWeight` is 0, the two totals are one number |
| **unattributed** | `sell:22`, and **nothing stops it** — this is the issue | `hostTargetWeight = 0.06 + share`, a buy |

⚠️ **Unattributed is not a rare state.** It is every holding bought by hand in a broker app and
every position whose approval did not name a manager to run it (`untilled/aumos#785`).

⚠️ **And #813's overstatement was conservative where this one is not.** #813 stopped this package
from buying. This one **sells** — a position nobody asked to reduce, out of a judgement that says
BUY.

⛔ **What was not done, and each has a decision behind it.** The host does not fold or add — a
second answer to «how much did this judgement ask for» ends at the aggregate cap
`untilled/aumos#781` rejected by name. Execution does not read attribution — two ledgers for one
position ends at the reconciler `untilled/aumos#232` rejected. And `#786`'s gate was not widened
to unattributed positions — making a hand-bought holding permanently untouchable is the «safely do
nothing» state `untilled/aumos#782` undid.

## The same conversion on the branch that sells, and the `exit` judgement (#819)

`#817` closed the **buy** direction. The review branch of `classifyCase` — an invalidation that
fired, an elapsed deadline, a target reached — never saw it, and driven against the real host the
three outcomes came back **identical** on this desk's position, on another manager's and on one
assigned to nobody:

| case | this manager | unattributed | another manager |
|---|---|---|---|
| `invalidation-triggered` | `invalidated-re-adjudicate` / `["RESIZE","SELL"]` | same | same |
| `deadline-elapsed` | `deadline-elapsed-re-adjudicate` / `["RESIZE","SELL"]` | same | same |
| `target-reached-staged-trim` | `target-reached-trim` / `["RESIZE","SELL"]` | same | same |

No `sizing` on the answer, so neither `hostTargetWeight` nor `otherHeldWeight` crossed at all —
the model was told to sell and handed no number. And at the host, an `exit` over a 6%
unattributed holding was **`sell:60`**: the whole position, all of it somebody else's.

**Three things changed, and none of them is a new arithmetic.**

⑴ Every answer carries `ownHeldWeight`, `otherHeldWeight` and `hostTargetWeightFloor`, and the
three review answers carry the whole `sizing` answer with them. The numbers come from the same
`exposure` the buy path adds — holdings only, never `otherWeight`.

⑵ `hostTargetWeightFloor = otherHeldWeight` is the weight **no** target handed to the host may go
below. A floor was what this branch could say at the time — a close-out of this thesis *is* the
floor exactly — and ⛔ **the sentence that followed it here, «this branch sizes nothing, so it
cannot answer a `hostTargetWeight`», stopped being true in the same commit**: carrying the whole
`sizing` answer carried a `hostTargetWeight` with it. That is #823, one section down.

⑶ ⛔ **`exit` is withdrawn where somebody else holds part of the name.** This is the judgement the
issue left open, and it is the same one in all three packages: *an `exit` is correct only when
`otherHeldWeight` is 0.* An `exit` target is a real `0` (`untilled/aumos#154`) and bypasses every
weight computed anywhere, so no arithmetic can protect it — the only protection is not to offer
it. `catalyst-turnaround` said it as a number (`hostTargetWeight = otherHeld` on a `close-out`);
here it is said by narrowing the actions the outcome leaves open:

| the position | actions left open | floor |
|---|---|---|
| wholly this desk's | `["RESIZE","SELL"]` — **unchanged**, exit included | 0 |
| part somebody else's | `["RESIZE"]` — the reduction is a total at or above the floor | `otherHeldWeight` |
| none of it this desk's | `["WATCH"]` — the review is still written down; it ends in no order | `otherHeldWeight` |
| the book was not folded | `["RESIZE","SELL"]` + `review_exposure_unread` | `null` |

**The door that locked one way.** `classify.mjs` already refused *«the book attributes exposure
here and the run did not report holding it»* as `data_missing`. The reverse — the run holds it and
the book attributes **none** of it here — is deliberately **not** `data_missing`: the book is
explicit, and what it says is that the position is somebody else's or nobody's. Calling that
missing data would make a hand-bought holding a position no manager may ever review, which is the
«safely do nothing» state `untilled/aumos#782` undid. The review runs; the sale does not.

⛔ **What was not done** is what `#817` did not do, for the same three reasons: the host does not
fold or add (`untilled/aumos#781`), execution does not read attribution
(`untilled/aumos#232`), and `#786`'s gate was not widened to unattributed positions
(`untilled/aumos#782`).

⬜ `cash-weight` targets name no asset, so there is no position for a floor to attach to. This
package's `PROMPT.md` never asks for one.

## The number a judgement carries is the judgement's (#823)

`#819` put the `sizing` answer on the three review outcomes so that the two attribution numbers
would travel with them. What travelled with them was `positionSizing`'s `hostTargetWeight`, and
that number is **entry arithmetic**: every ceiling behind `targetTotalWeight` is *«the cap less
what other strategies hold»*, so the sum is *«what the position becomes if this desk buys up to
its share»*. It is computed before any outcome is known, and the caller attached it to whichever
outcome it reached.

⛔ **The defect needs no unattributed holding.** It fires where the position is **wholly this
desk's**, which is why `untilled/aumos#786`'s gate cannot reach it and why `#819`'s two defences
are absent: the withdrawn `SELL` and the floor both require `otherHeldWeight > 0`, and here the
actions are the published `["RESIZE","SELL"]` and the floor is `0`. A review is reached most
often while the position is still being staged in — this desk holding *less* than its own sizing
target — and there the entry total is a purchase.

Measured to the exchange, one book, one entry share of `0.03623596`:

| this desk's holding | outcome | before | after |
|---|---|---|---|
| 2% | `target-reached-trim`, and both `re-adjudicate`s | ⚠️ **`buy:16`** | `0.02` — no order |
| 3% | the same three | ⚠️ **`buy:6`** | `0.03` — no order |
| 6% | the same three | ✅ `sell:23` | ✅ unchanged |
| 12% | the same three | ✅ `sell:83` | ✅ unchanged |

⚠️ **The green rows were green by coincidence.** 6% and 12% sit above the entry target, so the
entry total *happens* to reduce — the same coincidence that made `catalyst-turnaround`'s
`close-out` look safe until `aumos-catalogue#279` measured the other twelve intents.

⚠️ **And the answer said so, in the same object, with nothing reading it.** `incrementalWeight:
0.01623596` and `atOrAboveTarget: false` — «buy 1.6pp more», «not at target yet» — on an outcome
whose code is `thesis_refuted`, with an empty `diagnostics`. ⛔ Both readings are **true of the
entry question**, which is what made them quiet: what was wrong is not the fields but the branch
that read them.

**The fix is a table, `OUTCOME_WEIGHT_ROLES` in `lib/core.mjs`**, and `classifyCase` chooses the
total after the outcome is known:

| role | `hostTargetWeight` | outcomes |
|---|---|---|
| `increase` | `otherHeld + targetTotalWeight` — ⛔ `#817` unchanged | `mean-reversion-candidate` |
| `reduce` | `otherHeld + min(reductionTargetTotalWeight, ownHeldWeight)` — ⚠️ `#826` and `#835` each moved this term | the three review outcomes |
| `standstill` | `otherHeld + ownHeld` — what the account holds today | the other ten |

⛔ **An outcome with no role throws.** «Whatever the sizing answered» is the default this section
is about, and a fourteenth outcome must not inherit it.

⚠️ **The clamp is a ceiling and never a floor.** `min` can only lower this desk's share, so where
the sizing target is already below the holding — which is what makes a reduction a reduction — it
is the identity and the trim, the resize and the exit still leave (`untilled/aumos#782`). The
lower bound is `otherHeld`, unchanged: `#819`'s floor and this clamp meet exactly at a position
none of which is this desk's, where the total *is* the floor and no order leaves.

⚠️ **`standstill` says a number rather than `null`**, because `null` already means «the account
was not folded» and one word cannot carry two states.

**Two answers of the same family, outside the review branch.** `sizing` also rides on
`target-weight-already-held` (`WAIT`) and on a `research-incomplete` produced by an unevaluated
sizing (`WATCH`). Over a holding **above** the entry target that total is *below* what the
account holds — so a `WAIT` meaning «the position is complete» carried a **sale** of part of it.
Both are `standstill` now, and `standstill_total_is_the_position_as_held` says so in the answer.

**One name, one number.** The review answer used to hold two fields called `hostTargetWeight` —
the answer's and the `sizing`'s — with different values. `classifyCase` replaces the field on the
`sizing` it carries and stamps `hostTargetWeightRole` beside it; the entry arithmetic is not
hidden, it stays on `targetTotalWeight` under the name that says whose share it is.

**And the check that fails when a word and a number disagree.** Eighty-six checks were green
while a `TRIM` asked the host to buy, because nothing compared the verdict against the weight the
same answer carried. `tools/verify-fundamental-mean-reversion.mjs` now runs every fixture case
against five books — this desk's, unattributed, another manager's, shared, and an empty one — and
reads only the two numbers on the answer: the floor bounds every non-`increase` total from below,
`positionWeight` bounds it from above, `standstill` equals it, `exposureDirection` is recomputed
rather than trusted, and a verdict may not leave with a direction that contradicts it.

⛔ **What was not done**, as in `#817` and `#819`: the host does not fold or add
(`untilled/aumos#781`), execution does not read attribution (`untilled/aumos#232`), `#786`'s gate
was not widened (`untilled/aumos#782`), and execution does not refuse an order by reading the
judgement's word (`untilled/aumos#822`).

## A pending total is a ceiling, and it is not a position (`untilled/aumos#826`)

One layer under `#823`. That fix bounded a reduction by `min(entry ceiling, own holding)`; this
one is about the entry ceiling. The three book-derived ceilings — single-name, gross, sector —
are measured against `exposure.otherWeight`, the `max` of what other desks *hold* and what their
open proposals *ask for* (`aumos-catalogue#275`, `untilled/aumos#813`). That fold is right for
the buying question: a limit has to hold in every state the account passes through, so an
unfilled buy counts before it fills.

It is wrong for a sale. Driven through the real host — `shareholder-rerating` sealing a total
`0.15` BUY that nobody approved and nothing filled, that fund's `portfolio_get` adapted into this
package's `lib`, and the number it answered run back out to the exchange:

| another desk's **pending** | `targetTotalWeight` | `bindingConstraint` | exchange | `diagnostics` |
|---|---|---|---|---|
| none / 0.05 … 0.12 | `0.03623596` | `risk-budget` | `sell:23` | (none) |
| **0.15** | **`0.01`** | `single-name-headroom` | ⚠️ **`sell:50`** | ⚠️ (none) |
| **0.30** | **`0`** | `single-name-headroom` | ⚠️ **whole position** | ⚠️ (none) |

⛔ **A proposal that was never approved and never filled trebled a sale out of a position wholly
this desk's, and then liquidated it.** `#823` is what made the direction visible: before it that
number sat *above* the holding and left as a purchase; after the `min` clamp it can only go the
other way, and the clamp is right — the ceiling under it was not.

⚠️ **`shareholder-rerating` already carried this sentence** — *«a pending total is exposure for a
ceiling and is not a position for an order, so somebody else's unfilled proposal neither creates
a reduction nor raises the floor»* — and `catalyst-turnaround` does not read the axis at all. Three
packages, three answers on one axis.

**The fix is a second fold of one list.** `positionSizing` builds its ceilings through
`ceilingsAgainst(otherName, otherGross, otherSector)` and folds it twice: once against the
`#813` terms (`targetTotalWeight`, `bindingConstraint`, `ceilings` — ⛔ byte-for-byte unmoved)
and once against holdings only (`heldOnlyTargetTotalWeight`, `heldOnlyBindingConstraint`,
`heldOnlyCeilings`). `concentration` gained `grossOtherHeld` and `sectorConcentration` gained
`heldExposure` / `ownHeldWeight` / `otherHeldWeight`, so **every** axis that reads the book has a
holdings-only twin rather than only the one the issue happened to drive.

⚠️ **`risk-budget` and `liquidity` read no book, so on an account with no open proposal the two
folds are the same number** — which is why this change is invisible almost everywhere, and it is
measured over every sizing fixture rather than asserted.

⚠️ **Said out loud, because the four answers before it were not.**
`reduction_target_ignores_others_pending` fires whenever the two folds disagree on an outcome
that reduces, and carries `hostTargetWeightIfPendingFolded` — the order that would otherwise have
left — beside the one that did. `increasesExposure` (`#821`), `atOrAboveTarget` (`#823`) and
`exposureDirection` (`#825`) were each quiet at the moment they mattered; an observation nobody
can measure against what it withheld is a restatement.

⛔ **What is unchanged.** `#813`'s `max` fold still narrows the entry ceiling and
`bindingConstraint` still reports it — *«how much may this desk add»* is a real question and a
crowded name is a real answer to it. `#817`'s buy total is still `otherHeld +
targetTotalWeight`. `#823`'s role table and `min` clamp are untouched. `#819`'s floor and
withdrawn `SELL` are untouched. And the host does not fold, execution does not read attribution,
`#786`'s gate was not widened, and no order is refused by reading a judgement's word.

⬜ `cash-weight` names no asset and so has no position for a role to attach to; this package's
`PROMPT.md` never asks for one.

## A residual is not an allocation (`untilled/aumos#835`)

The other axis under `#823`, and it was open the whole time. `positionSizing` folds **six**
ceilings into one number and two of them are not ceilings on this position at all:

|  | what it says | bounds an addition | sizes a sale |
|---|---|---|---|
| `risk-budget` · `liquidity` | this thesis, this tape | ✅ | ✅ |
| `single-name-headroom` · `strategy-headroom` | *«this name may be at most X»*, less what others hold **of it** | ✅ | ✅ |
| `gross-headroom` · `sector-headroom` | *«after the **other names**, this much is left»* | ✅ | ⛔ |

⛔ **A sector ceiling states no division of itself between the names under it.** Reading *«the
sector has 0.01 left»* as *«this position must become 0.01»* hands the whole adjustment to
whichever name was evaluated last — and to a desk that may not be able to reduce a single share
of what filled the bucket. **An arithmetic whose answer depends on evaluation order has not made
a judgement**: run the same book starting from another name and that one pays instead.

Driven through the real host on a 6% position **wholly this desk's**, thesis invalidated, under a
`sectorCap` of 0.25, with another *name* filling the sector:

| the other name held | `targetTotalWeight` | `bindingConstraint` | exchange |
|---|---|---|---|
| none / 0.19 / 0.20 / 0.21 | `0.03623596` | `risk-budget` | `sell:23` |
| **0.24** | **`0.01`** | `sector-headroom` | ⚠️ **`sell:50`** |
| **0.245** | **`0.005`** | `sector-headroom` | ⚠️ **`sell:55`** |
| **0.30 / 0.50** | **`0`** | `sector-headroom` | ⛔ **`sell:60` — the whole position** |

⛔ **Nobody asked for that liquidation and nothing in the answer said so.**
`deadline-elapsed-re-adjudicate` did not differ by one value; the gross axis is the same
arithmetic one bucket wider; and the **owner** of that other name — another desk, this desk, or
nobody at all — produced the same three numbers, so `untilled/aumos#786`'s handover gate never
reaches it. This is not a multi-manager defect.

⚠️ **`shareholder-rerating` carried this sentence first** (`untilled/aumos#833`,
`aumos-catalogue#286`), and it ended one row better than this package did: there the ceiling
collapsing to zero **deleted** the order, here it **sends** one.

**The fix is the same shape as `#826`'s, one axis over.** `positionSizing` splits its ceiling
list into `nameAxes` and `residualAxes` and folds a third time —
`reductionTargetTotalWeight` / `reductionBindingConstraint` / `reductionCeilings`, the name axes
measured against **holdings only**, which is where `#826`'s correction and this one compose.
⛔ `targetTotalWeight`, `bindingConstraint` and `ceilings` are byte-for-byte unmoved, and
`classifyCase`'s `reduce` role is the only consumer.

⚠️ **Said out loud, because five answers before it were not.**
`reduction_is_not_sized_by_the_accounts_remaining_room` fires wherever the two folds disagree on
an outcome that reduces, and carries `hostTargetWeightIfRoomFolded` — the order that would
otherwise have gone out — beside the one that did. It is silent where they agree, which is every
account with no other name in the bucket, and silent on a purchase.

⚠️ **What this gives up, named.** Where a sector really is over its ceiling and it is *this
desk's other holdings* that filled it, this package no longer trims *this* name on the sector
axis. The excess stands, `sector_limit_exceeded` still names it, and the reduction that fixes it
comes from a ceiling that names a position — the single-name cap or the risk budget of whichever
name is actually oversized. Dividing a sector budget between this desk's names is portfolio
construction, and a name-at-a-time evaluator has no input with which to choose it.

⛔ **What is unchanged.** `#813`'s residual still bounds the **entry** — a 0.24 sector under a
0.25 ceiling still buys at most 0.01 and a full one still refuses outright. `#826`'s held-only
fold, `#817`'s buy total, `#823`'s role table and `min` clamp, `#819`'s floor and withdrawn
`SELL` all stand. No fixture was edited, there is no migration, and the host does not fold, does
not add, and does not read attribution while executing.

⚠️ **Measured before and after over 5,760 books** (two gross ceilings × three sector states ×
ten other-name weights × three owners × four holdings × two pending states × four cases):
**sales larger: 0 · reductions deleted: 0 · BUY answers changed: 0 · sales smaller: 1,098.**
Every order this change moves gets **smaller**, because the reduction fold can never be the
lower of the two.

## The sector axis: the judgement #269 asked for, and what came of it

**The question.** #269 required each of the three #256 packages to be *read* and judged under a
Mandate that states a sector ceiling — and said so about this one by name: «`fundamental-mean-reversion`
은 섹터 개념이 없으므로 충돌하지 않는다»는 결론은 조건부다. 개념이 없다는 것 자체가 준수의 증거가
아니다.

**The reading.** Before this change, the string `sector` appeared nowhere in `lib/` at all, and once
in `PROMPT.md` — in the list of things that might have *caused* a fall («a sector de-rating»), which
is a cause to decompose and not an exposure axis. `positionSizing` read `mandate.singleNameCap`,
`mandate.grossCap` and `mandate.strategyCap`; `mandate.sectorCap` was read by nothing.

**The verdict: it could increase risk.** #269's conditional needs either the host to enforce the
ceiling or the package to receive its result. Neither held. So under a Mandate declaring a sector
ceiling, a `mean-reversion-candidate` BUY could take the account through that ceiling with a
correct target weight, a correct downside figure and no finding anywhere. Having no concept of a
sector is what made the breach invisible, not what made it impossible.

**What was changed, and what was not.** `positionSizing` now reads `mandate.sectorCap` and
`input.sector`, and `sectorConcentration` folds the sector total over holdings and open proposals
together:

| Mandate | classification | effect |
|---|---|---|
| no `sectorCap` | — | `sector_cap_not_applicable` · `info`; no `sector-headroom` ceiling exists |
| declared | complete | a `sector-headroom` ceiling joins the `min`, measured against what *other* strategies hold in that sector — the same rule as every other headroom here |
| declared | candidate **or any book row** unclassified | `sector_exposure_unevaluable` · `blocked`, refused as `data_missing` |

⛔ **The refusal is `data_missing` and it lands below the held-position rungs.** `classifyCase`
reaches the sizing at rung ⑺; the review branch — an invalidation that fired, an elapsed deadline, a
target reached — is rung ⑵. So a trim, a re-adjudication and an exit are never withheld by a ceiling
that only constrains additions, and the withheld entry is recorded as an absence about the *account*
rather than as a finding about the thesis.

⚠️ **This package still classifies nothing.** The sector it reads is the fund's risk-management
classification, supplied with the book and the candidate; the methodology's own work — the fall's
causes, the damage test, the stabilisation evidence — is about one company and stays that way.

⚠️ **The candidate's own sector is not the whole of the question.** A ceiling is measured against a
total, and one unclassified holding or open proposal makes that total unformable however well
classified the candidate is. The `#269 —` checks in `tools/verify-fundamental-mean-reversion.mjs`
build that case explicitly, with a positive control that reaches BUY, because a run that looked only
at the candidate passes every other one.

## Fixtures

Synthetic bars, generated once and committed. ⛔ **They are shapes, not prices.** No vendor data
is redistributed and no assertion over them is evidence about a market.

`fixtures/series.json` holds eleven series, each 300 weekday sessions ending 2026-08-28, as
compact `[date, open, high, low, close, volume]` rows. The other three files reference them by
name.

| fixture case | reaches |
|---|---|
| `temporary-shock-plus-stabilisation` | `mean-reversion-candidate` → BUY |
| `continuing-new-lows` | `falling-knife` → WATCH |
| `structural-earnings-damage` | `structural-earnings-damage` → WAIT, `thesis_refuted` |
| `damage-asserted-without-evidence` | `research-incomplete` — a claim of damage with no evidence is not a refutation |
| `business-question-unanswered` | `research-incomplete` |
| `data-missing-short-history` | `data-missing` |
| `data-missing-undeclared-basis` | `data-missing` |
| `unadjusted-split-declared-adjusted` | `price-artifact-suspected` — the #248 regression |
| `ex-dividend-unadjusted-series` | `data-missing` |
| `ex-dividend-same-rows-called-adjusted` | the same rows mislabelled: the gate **opens** on a fall the price never took |
| `ex-dividend-truly-adjusted-series` | `out-of-scope` — the truly adjusted series never fell that far |
| `uptrend-pullback` | `uptrend-pullback-not-this-strategy` |
| `reference-plan-shape` | `stabilization-unconfirmed` → WATCH |
| `target-reached-staged-trim` | `target-reached-trim` → TRIM |
| `invalidation-triggered` | `invalidated-re-adjudicate` → RESIZE/SELL only |
| `deadline-elapsed` | `deadline-elapsed-re-adjudicate` → RESIZE/SELL only |
| `risk-limit-exceeded` | `risk-limit-exceeded` → WAIT |
| `no-future-rows-across-an-earnings-date` | identical technical state to the clean series |

`sizing.json` carries ten cases: the calm baseline, a gap-down history, a halted name, a name
held by another strategy plus an open proposal from a third, a per-strategy cap larger than the
account cap, no headroom left, a `config` value trying to widen the risk budget, an invalidation
above the entry, a fully declared execution state, and a position already at its own target.

⚠️ **The absence regressions are in the checker rather than in the fixtures**, as in-memory
mutations of a positive control: each one deletes or blanks exactly one declared input and
asserts the answer changes. Keeping them there means a reviewer reads the *difference* between
two inputs instead of diffing two fixture files, and the committed fixtures stay a record of
what a well-formed run produces.

`staged-plan.json` carries nine: the first stage firing, the re-run refusing to double-add,
price alone, price-and-time alone, a broken stabilisation, an exhausted loss budget, the
cumulative ceiling, an expired plan, and a staged trim.

`reversion.json` carries seven: each basis, a technical band labelled as a valuation, an
earning-power range missing its inputs, a band above the prior high, and no basis at all.

Every case's `measured` block is committed, so a change in the arithmetic shows up as a fixture
diff rather than as a quiet re-ranking.

## Running the checks

```bash
npm run check:fundamental-mean-reversion
```

Plain Node over committed JSON. No test framework is installed in this repository and this does
not add one.

## What no check here establishes

These are #256's host-integration criteria and every one of them needs a running Aumos:

- that a proposal is stored, and that a `WATCH` re-arms and actually wakes a later run;
- that a decision links to a real fill, and that fees, taxes and dividends are separated in the
  forward record;
- that exposure attribution works when two managers on one book hold the same name, and that
  the host can report open proposals from another manager at all — `positionSizing` counts them
  correctly *when it is handed them*, which is a different claim;
- that the Toss connection's daily candles arrive with a stated adjustment basis, which this
  package requires and refuses without;
- benchmark comparison against a Korean equity index over the same holding period.

Until the third of those is verified, running this package alongside another that can hold the
same name is best done on a separate fund. That is stated on the README too, because it is a
limit an investor is affected by rather than only a maintainer.
