# Architecture

The maintainer's document. The investor-facing page is [`README.md`](README.md) and it deliberately
carries none of this.

## What is code here, and what is not

The catalogue's default is prose, and this package keeps it: `PROMPT.md` is what every run walks
through, and the three documents under `skills/` are the stages that apply to one case — a
policy-dependent company, a deadline that has arrived, a source that did not answer.

`lib/` holds only what #258's and #256's completion criteria require to be **checkably** right rather
than model-judged. The test applied to each candidate was: *does this fail silently when a model does
it?*

| module | what it owns | why it is not prose |
|---|---|---|
| `constants.mjs` | every threshold, with its unit and its argument | a number that lives in three documents drifts in two of them |
| `diagnostics.mjs` | the four causes and their lanes | «absence is not refutation» is a lookup, not a judgement |
| `ledger.mjs` | the catalyst record, its state machine, delays, staleness, adjudication | a model asked «has this slipped before?» reads its own notes |
| `recovery.mjs` | point-in-time indicator comparison, channel folding, survivability | a figure published after `asOf` still produces a delta |
| `sizing.mjs` | loss to invalidation, target weight, whole-account concentration | the cap becomes the order size unless something subtracts |
| `staging.mjs` | the staged plan, and the refusal to add a filled stage twice | the second run's mistake is the *same right number*, again |
| `classify.mjs` | the case classification, and the multiple that gates nothing | two rules pull opposite ways and the resolution has to be assertable |
| `scoreboard.mjs` | two ledgers that share no key | one «did this work?» column gets filled from whichever number is handy |
| `verdict.mjs` | the ladder | the rungs have to be *different*, and that is only checkable across cases |

## Derived from `evidence-gated`, and what was left behind

There is no shared library in this repository and this package does not import across package
directories: the published artifact is a path→contents map rooted here, so a relative path that
escapes it does not survive publication. `tools/verify-catalyst-turnaround.mjs` asserts that no file
under `lib/` imports anything but `node:` builtins and its own siblings.

Where arithmetic came from `managers/evidence-gated/lib/`, it was copied and adapted:

| here | from | taken | left behind |
|---|---|---|---|
| `diagnostics.mjs` | `evidence-gated/lib/diagnostics.mjs` | `round`, `finite`, the `{code, severity, message, path, details}` record | its cause registry, which is keyed to that package's own lanes and gates |
| `ledger.mjs` | `evidence-gated/lib/catalysts.mjs` | the carried-register shape (`previous` in, `nextRegister` out), instants encoded as epoch milliseconds, the refusal to register a window with no `evidenceIds` | everything else — that module *produces windows to scan*, this one *manages a position's catalyst*. No states, no delays, no adjudication, no staleness there |
| `sizing.mjs` | `evidence-gated/lib/sizing.mjs` → `targetWeight` | the quarter-Kelly arithmetic and the `min(raw, caps…)` shape | its lanes, maturity attribution, unlock-delta disclosures and grandfathering |
| `sizing.mjs` | `evidence-gated/lib/sizing.mjs` → `concentration` | the rule that a proposal *restates* the position rather than stacking on it — keyed on the name since #813, not on the pair (strategy, name), because a `position-weight` target is executed against the whole position | its sector, theme and factor axes, and its parked-liquidity exemption. This package makes a single-name claim only |
| `staging.mjs` | `evidence-gated/lib/sizing.mjs` → `entryTranchePlan` | the condition kinds, «only the first stage is immediate», the sum check, the lapsed-stage finding | its lens/maturity gating, its lot-size executability arithmetic, its core-DCA lane refusal |

⚠️ **Nothing was commonised.** The three packages in `untilled/aumos-catalogue#256` are each
self-contained by decision, and the table above is the inventory a later commonisation pass would work
from. `recovery.mjs`, `classify.mjs`, `scoreboard.mjs` and `verdict.mjs` have no counterpart in
`evidence-gated` and are original to this package.

## The three-state input rule

Every cap, budget, register and balance-sheet figure in `lib/` is read through
`readDeclared()` in `diagnostics.mjs`, and has three states rather than two: a **number**, the
explicit sentinel **`'not-declared'`**, or **unread**. Only the first two may authorise an increase in
exposure; unread is `data_missing`, and `data_missing` never becomes a purchase, a staged add or a
refutation.

This replaced a set of ordinary-looking parameter defaults, and each of them was permissive in the
flattering direction:

| was | read as | now |
|---|---|---|
| `positions = []`, `proposals = []` | an unread book is an empty book — an account with unlimited headroom for this name | required arrays; `readable: false` and `data_missing` otherwise |
| `caps.accountSingleName ?? defaultSingleNameCap` | an unread account limit is this package's own ceiling | declared, or `'not-declared'`, or refused |
| `mandatePositionCap = null` filtered out of the cap list | an unread Mandate imposes no cap | same three states, with a `note` when it is a declared absence |
| `monthlyCashBurn = 0` | an unread cash-flow statement is a company not burning cash — infinite runway | required; `survivable: null` and `data_missing` otherwise |
| `debtMaturingWithinYear = 0` | an unread maturity schedule is a company with no debt due — coverage skipped | required, as above |
| `previous = null` on the catalyst register | an unread register is a catalyst that has never slipped | `null` is *read and empty*; `undefined` is unread, and no deadline may be extended |
| `previous = null` on the staged plan | an unread plan register is a plan with nothing filled — so the first stage fires again | same, and `addedThisRun` is forced to 0 |
| `survivable === false` as the only refusal | an unadjudicable balance sheet passes the entry gate | `=== true` required to enter |
| `price.stabilised` carried into the answer, never read | a declared input the implementation ignored | read: an explicit `false` withholds; an absent reading is uncertainty, never a qualification |

⚠️ **`survivable !== true` and the `mayIncrease` gate are deliberately redundant.** The gate is one
line covering all nine rungs; the per-rung `=== true` means that removing the gate still cannot buy on
a `null`. Both are mutation-tested.

## Two weights, two meanings

`cumulativeTargetWeight` is *"this strategy's share of the position should be this"*.
`incrementThisRun` is *"buy this much more, now"*. ⚠️ A **third** weight, `hostTargetWeight`, is the
only one the host may be handed — see «The weight that leaves is a third number» below (#817). They are separate fields on the verdict with a `weightMeanings` map beside them, and
every intent that is not `enter-staged` or `add-next-stage` reports an increment of exactly zero —
including the trims and the exits, which carry a **cumulative** target the host reduces to rather than
a negative increment. The already-at-or-above-target case is defined: increment zero, intent `hold`,
review `already-at-target` — ⚠️ **on both sides since #825**, the entry rung and the staged-add rung
that reaches the same state through a plan rather than through the sizing.

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
until #813, next to `weight` on a position row, which is one word meaning two things inside one
input object. A proposal row that still carries `weight` is `exposure_weight_invalid` — refused
rather than read as an increment, because reading a total as an increment understates the account.

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

`#813` and `#814` were both the **reading** direction. This is the **writing** one, and until #817
nothing said anything about it.

`headroomForStrategy` is *«the smaller of the account's cap and this strategy's, less what every
**other** strategy holds or has proposed»*, so `cumulativeTargetWeight` answers «how much of this
name may be mine». The host's `targetWeight` answers «what should this position weigh» — and
`rebalanceShadowBook` executes it against the whole position without ever reading attribution
(`untilled/aumos#815`). The conversion is one addition, and `runVerdict` does it:

```
hostTargetWeight = otherHeldWeight + (close-out ? 0 : cumulativeTargetWeight)
```

⛔ **Why the addition is code and not a sentence.** The same argument #813 settled: a run asked to
add before it sends is a run that can be argued out of adding. `PROMPT.md` says what the number
means and forbids assembling it by hand; the arithmetic is here.

⛔ **`otherHeldWeight` counts holdings and never proposals.** `otherStrategies` — the term behind
`headroomForStrategy` — folds pending totals in, which is right for a ceiling and wrong for an
order: an unfilled proposal is not a position, and adding one would buy another manager's
unapproved judgement on their behalf. Two fields, because the two directions need two numbers.

⛔ **`close-out` reduces this desk's share to zero and no further.** Where nobody else holds the
name that is `0`, which is the host's `exit`. Where somebody does, an `exit` would liquidate their
position too, so the exit is expressed as this weight instead.

**What #817 measured.** Fund ₩100,000,000 on XKRX, 20% single-name ceiling, a 6% holding assigned
to **nobody**, 12% pending under another manager. This package reaches `enter-staged` with
`cumulativeTargetWeight = 0.02`; the real host, driven to the exchange, turns that into `sell:40`.

| the position's assignee | before #817 | after |
|---|---|---|
| another manager | `sell:40` — but `untilled/aumos#786` refuses the judgement first, `submitted: 0` | `0.06 + share`, a buy |
| **this manager** | `sell:40`, and ⛔ **not a defect** — reducing a position this desk runs is a defined move on the ladder | unchanged: `otherHeldWeight` is 0 |
| **unattributed** | `sell:40`, and **nothing stops it** — this is the issue | `0.06 + share`, a buy |

⚠️ **Unattributed is not a rare state**: every holding bought by hand in a broker app, and every
position whose approval did not name a manager to run it (`untilled/aumos#785`).

⚠️ **#813's overstatement was conservative and this one is not.** #813 stopped this package
buying. This one **sells**, out of a run whose intent is a purchase.

⛔ **What was not done.** The host does not fold or add — a second answer to «how much did this
judgement ask for» ends at the aggregate cap `untilled/aumos#781` rejected by name. Execution does
not read attribution — `untilled/aumos#232` rejected the reconciler that needs. And `#786`'s gate
was not widened to unattributed positions — that is `untilled/aumos#782`'s «safely do nothing»
coming back.

⚠️ **One rename came with it.** `weightMeanings.cumulativeTargetWeight` and `targetWeight`'s own
`meaning` were `cumulative-position-weight`, which is the confusion itself written down: it is not
the position's weight. Both now read `this-strategys-share-of-the-position`.

## The addition was right and the number it added was not (#821)

`#817` above answered «what do we add?» — somebody else's holding. It did not answer «**add it to
what?**», and the answer it left standing was `cumulativeTargetWeight` on every intent but
`close-out`. That number is the weight a **purchase** targets. `aumos-catalogue#278` closed the same
seam in the other two packages, read `close-out` here, found it safe and left this package alone —
but `close-out` is safe **by accident**: its own share is `0`, so `otherHeld + 0` happens to equal
what the account holds. The three reduction intents whose share is not zero were not safe.

Measured on the real host over a 6% holding assigned to nobody, `₩100,000,000`, 20% single-name
ceiling:

| intent | `hostTargetWeight` before | what left | after |
|---|---|---|---|
| `close-out` | `0.06` | ✅ nothing | `0.06`, unchanged |
| `trim-into-realisation` | `0.07666668` | ⚠️ **`buy:16`** | `0.06` — and the intent is withdrawn |
| `reduce-on-invalidation` | `0.09988096` | ⚠️ **`buy:39`** — `thesis_refuted` buying 3.99pp more | `0.06`, withdrawn |
| `resize-to-risk-limit` | `0.12` | ⚠️ **`buy:60`** — the position **doubled** | `0.06`, withdrawn |

⛔ **And the same object said it was not happening.** `increasesExposure` was
`intent === 'enter-staged' || intent === 'add-next-stage'` — the intent restated, never the weight
measured — so it answered `false` beside a target 1.7pp above the holding. That is why 111 checks
were green over a defect that doubles a position, and it is why the field is now
`hostTargetWeight` against `positionWeight`, with `addsToThisDesksShare` carrying the sentence the
old derivation was true of.

### What each intent asks the position to do

`lib/constants.mjs` carries the table, and `runVerdict` reads it rather than naming intents inline:

| role | `hostTargetWeight` | intents |
|---|---|---|
| `increase` | `otherHeldWeight + max(cumulativeTargetWeight, ownHeldWeight)` — the `max` is #825's floor | `enter-staged` · `add-next-stage` |
| `reduce` | `otherHeldWeight + min(cumulativeTargetWeight, ownHeldWeight)` | `trim-into-realisation` · `reduce-on-invalidation` · `resize-to-risk-limit` |
| `close` | `otherHeldWeight` | `close-out` |
| `standstill` | `otherHeldWeight + ownHeldWeight` | `hold` · `hold-through-delay` · `exit-review` · `research-watch` · `blocked-by-account-limit` · `wait-for-data` · `reduction-not-this-desks` |

⚠️ **The clamp is a ceiling and never a floor.** A reduction is a decision about **this desk's own
share**; `min` takes that share down and can never take it up, and it is the identity wherever the
sizing asks for less than is held — which is what a reduction *is*. A desk that runs the whole
position trims exactly as it did before (`untilled/aumos#782`), and a desk that runs part of one
reduces its part and stops at `otherHeldWeight`.

⚠️ **The standstill row was the same defect in seven more places.** A `hold-through-delay` whose own
prose is «nothing is added» handed over the entry weight and bought 2.3pp of a position it wholly
ran; `exit-review`, whose entire content is «adjudicate against the benchmark **before** deciding
anything else», handed over a `0` and liquidated the name. A judgement that changes nothing now says
so with the weight the account already holds — stated rather than `null`, because `null` already
means «the book was not read» and one word may not carry two states.

### The word, where none of the position is this desk's

`reduction-not-this-desks` is the thirteenth intent, and it is
`fundamental-mean-reversion`'s `["WATCH"]` and `shareholder-rerating`'s `WAIT`
(`aumos-catalogue#278`) said in this package's vocabulary. The rung judged the thesis; this asks
whose position it is. **The review is not withdrawn** — it stands, armed, with its benchmark
comparison — and a `held_position_is_not_this_desks` note says which judgement did not go out.

⛔ **It is a `note` and not `data_missing`.** The book was read and said something definite. Calling
it an absence makes every holding bought by hand in a broker app un-reviewable, which is
`untilled/aumos#782`'s «safely do nothing» coming back. The review runs; only the sale does not.

⛔ **What was not done**, for the fourth time and the same four reasons: the host does not fold or
add (`untilled/aumos#781`), execution does not read attribution (`#232`), `#786`'s gate was not
widened to unattributed positions (`#782`), and the host does not read a judgement's *words* to
refuse a weight — `REBALANCE` alone would walk past such a check.

### Per assignee

| the position's assignee | before | after |
|---|---|---|
| **this manager** | `sell:43` · `sell:20` · no order — ⛔ **not a defect**, and unchanged here | unchanged, plus a `resize-to-risk-limit` that no longer buys 2pp when the sizing asks for more than is held |
| another manager | `buy:16` · `buy:39` · `buy:60`, but `#786` refuses the judgement first (`submitted: 0`) | `reduction-not-this-desks`, target = the holding |
| **unattributed** | the same three buys and **nothing stops them** — this is the issue | `reduction-not-this-desks`, target = the holding, review armed |

⚠️ **And the buys still leave.** `enter-staged` over the same 6% unattributed holding still answers
`otherHeld + share` and still goes out as a purchase (`#817`). What splits the two is **whether the
intent is a reduction**, never whether somebody else holds the name.

⚠️ **`currentWeight` was renamed to `ownHeldWeight`, and `positionWeight` is new.** The old field
never meant «what this position weighs» — it has always been *this strategy's share of it* — and
over a 6% unattributed holding it answered `0` beside an account plainly holding 6%. Both numbers
now exist under names that say which is which, with `weightMeanings` entries for each.

## The clamp had one sign, and «add the next stage» sold (#825)

`#821` above wrote half a sentence. The half it wrote is *a reduction moves this desk's own share
down and never up*; the half it did not is the same sentence in the other sign — **a purchase moves
that share up and never down.** `reduce` got `min(cumulative, ownHeldWeight)`; `increase` got
`cumulative`, unclamped.

The state that reaches it is ordinary: a **staged plan whose cumulative target sits below what this
desk already holds** — a plan written when the sizing was larger, or a position topped up outside
it. The stage comes due, the run's own `incrementThisRun` says «add 4pp», and the weight that leaves
is the plan's target against a larger holding. Measured on the real host, fund NAV `$100,000`,
NVDA `$100`, the position **wholly this desk's**:

| held | intent | `incrementThisRun` | `cumulative` | `hostTargetWeight` | what left | after |
|---|---|---|---|---|---|---|
| **0.15** | `add-next-stage` | 0.04 | 0.12 | `0.12` | ⚠️ **`sell:30`** | `hold` / `already-at-target`, target `0.15`, no order |
| 0.12 | `add-next-stage` | 0.04 | 0.12 | `0.12` | nothing, and `addsToThisDesksShare: true` beside it | `hold`, `addsToThisDesksShare: false` |
| 0.06 | `add-next-stage` | 0.04 | 0.12 | `0.12` | ✅ `buy:60` | unchanged |

⛔ **This one is not reachable through `#786`.** The seven seams before it were unattributed
positions; this is a position whose assignee **is the author of the judgement**, so no widening of
the host's handover gate touches it — the same shape `#823` found next door.

### The judgement chooses, and the floor stands behind it

Two changes, at two levels, and the first is the one that fires:

⑴ **The rung.** The entry side has read this state since #265 — *the book already holds at or above
what this run would target; the increment is zero and there is nothing to do* — and the staged-add
rung, which arrives at it through `plan.cumulativeTargetWeight` instead of through
`sizing.targetWeight`, never asked. It asks now, and answers `hold` on the review this package
already had for it. ⚠️ **A purchase that cannot be made is not a sale**: the plan never said «reduce
to 12%», and reducing is a different judgement with its own rungs and its own causes.

⑵ **The floor**, `max(cumulative, ownHeldWeight)`, in the role table's `increase` row. ⚠️ **A floor
is never a ceiling** — wherever the sizing asks for more than is held, which is what a purchase *is*,
`max` is the identity and every real buy is untouched. ⬜ **It has no producer in this build**: every
path to an `increase` role now passes one of the two «already at the target» rungs, and
`verify-catalyst-turnaround.mjs`'s ⑶′ sweeps every case × every attribution × the staged plan to
assert exactly that absence — **green there is the evidence**. It stays because the table is what
decides the weight and `#821` is the record of what an unclamped role does while 111 checks stay
green. `addsToThisDesksShare` is measured against the resolved target for the same reason and with
the same standing: the sentence beside the number is what kept the last one quiet.

### The check that read the defect and pinned it green

`#821`'s ⑵ — *«the word and the number agree, on every case and every attribution»* — checked, on
the `increase` role, only the **formula** (`host === otherHeld + cumulative`). The direction
assertion its `reduce` branch had was never written on this side. Worse, `#821`'s ⑶ ran **this exact
input**, asserted `exposureDirection: 'reduce'` and wrote *"the answer says buy and the host
reduces"* into its own failure message. It measured the defect, named it, and passed.

⚠️ **Measuring a number is not refusing it.** ⑶ is now the regression; ⑵ carries the missing
direction assertion **and** the staged plan, without which no row in that sweep ever reached
`add-next-stage` at all — the whole staged-add side of the ladder sat outside the check that exists
to catch this.

### The stage that quietly disappeared

Beside it, smaller and in the same expression: a plan's cumulative target is frozen at the run that
wrote it, and the room left for this desk is not. `enter-staged` is sized through `accountHeadroom`
every run and lands exactly on the cap; `add-next-stage` read the same `accountCap` into its own
answer and ignored it. Over 15% of the name held elsewhere under a 20% ceiling it asked for a
position of **27%** — and the host does not trim that back, it downgrades the **whole judgement** to
WAIT (`target weight 0.27 exceeds max position weight 0.2`). Nothing moved wrongly; a stage stopped
arriving and no line said why.

The target is now folded into the room that is there, and `stage_target_folded_into_headroom` names
both numbers when it binds. ⚠️ **That room is measured against holdings** — see `#828` below, which
this fold opened. ⚠️ **The floor is what makes that safe**: folding a target *down* is the
same arithmetic that turns a purchase into a sale, and on a position 10% this desk's under 5% of
remaining room it would be `sell:5pp` on a run whose word is «add». The two clamps compose — the
fold can stop a stage and can never sell one.

⛔ **What was not done**, for the fifth time and the same four reasons: the host does not fold or add
(`untilled/aumos#781`), execution does not read attribution (`#232`), `#786`'s gate was not widened
to unattributed positions (`#782`), and the host does not read a judgement's *words* to refuse a
weight — `REBALANCE` alone walks past such a check (`#822`).

### A pending total is a ceiling and is not a position (`untilled/aumos#828`)

⚠️ **The fold above opened this one itself, and it is the axis `aumos-catalogue#281` had closed in
`fundamental-mean-reversion` on the same day.** `headroomForStrategy` subtracts `otherStrategies`,
which is the `max` of what other desks **hold** and what their open proposals **ask for** (`#813`).
That is right for a ceiling — a limit has to hold in every state the account passes through, so an
unfilled buy counts before it fills — and wrong for the weight that travels **back**, which
`sizing.mjs` had already said three hundred lines above the fold: *the weight this desk hands back
to the host is executed against the position, and an unfilled proposal is not a position.*

Measured through the host, with `shareholder-rerating` sealing a BUY nobody approved
(`funding: unfunded`, no reservation, no order), over a 6% position wholly this desk's on a plan
building toward 12%:

| that desk's pending total | `cumulativeTargetWeight` | the exchange |
|---|---|---|
| none · 0.08 | 0.12 | `buy:60` |
| **0.15** | **0.11** | ⚠️ `buy:50` |
| **0.20** | **0.06** | ⚠️ no order |

⚠️ **The arithmetic was incoherent and not merely generous.** The fold takes
`min(cap, strategyCap) − otherStrategies` and `hostTargetWeight` adds back `otherHeldWeight`; where
those differ the sum reads two different books at its two ends.

⚠️ **And the same sentence one rung over, which the sweep below found rather than the issue.** A
reduction is `min(cumulative, ownHeldWeight)` and that `cumulative` was sized against the same entry
ceiling: a 6% holding trimmed to `0.01666668` went to `0.01` on a 25% proposal nobody approved, and
to **zero — the whole position — at 30%**. Identical in shape to `#826`, in this package.

**One list of ceilings, folded twice.** `accountConcentration` publishes
`heldOnlyHeadroomForStrategy` beside `headroomForStrategy` and `targetWeight` publishes
`heldOnlyTargetWeight` beside `targetWeight` — the two differ in exactly one term, so on a book with
no open proposals they are the same number byte for byte. The entry path reads the first; the staged
fold and the `reduce` clamp read the second. ⛔ `#813`'s fold is unmoved and still narrows what this
desk may **buy**.

**And the word.** `#825`'s new rung answered this state with `already-at-target`, whose reason read
*«already holds 0.06 … against a cumulative target of 0.06»* — a tautology built out of the folded
number, true of every folded answer and saying nothing about any of them. The rung is now two: a plan
this desk has *reached* is `hold` / `already-at-target` against the **plan's own** target, and a plan
the account limit will not let it reach is `blocked-by-account-limit` / `account-limit-taken`, the
word this package has carried since #265. Both are `standstill`, so ⛔ **no weight moved with the
word.** `stage_target_ignores_others_pending` names the divergence wherever it decided something and
carries `hostTargetWeightIfPendingFolded` — the order that did not go out, because an observation is
not one unless a reader can measure what it withheld.

## `untilled/aumos#831` — and the same gate one rung over, on the ladder with no plan

**What `#828` did not touch.** It fixed the rung a `plan` reaches. `add-next-stage` and the **entry**
ladder arrive at the same state — *«this desk holds at or above what this run would target»* — through
two different sizings, and the entry rung was still reading `sizing.data.targetWeight` there: the fold
with every other desk's **open proposals** in it. Same book, same desk, same pending total, one
difference:

| other desks' pending | with a `plan` | with none |
|---|---|---|
| `0` | `add-next-stage`, `buy:60` | `enter-staged`, `buy:60` |
| `0.15` | `add-next-stage`, `buy:60`, a note | `enter-staged`, `buy:50`, silence |
| `0.20` | `add-next-stage`, `buy:60`, a note | ⚠️ **`hold`**, no order, silence |
| `0.25` | `add-next-stage`, `buy:60`, a note | `hold`, no order, silence |

⛔ **And the answer disagreed with itself.** `heldOnlyTargetWeight` sat in the same object saying
`0.12` while `review.reason` read *«already holds 0.06 … against a cumulative target of 0.06»* —
`#828`'s tautology verbatim, one rung over. At pending `0.25` the reason named `0.01` and the host was
handed `0.06`: two numbers for one state inside one object.

**The rungs are two here as well.** A desk that reached what it would size **against the positions**
is `hold` / `already-at-target` and names *that* target; a desk the account limit left with nothing
above its holding is `blocked-by-account-limit` / `account-limit-taken` and names the two rooms and
the cap. Both are `standstill`, so ⛔ **no weight moved with the word** — `increase`'s floor (#825) is
what makes that safe, and every row of a two-axis sweep asserts no rung that cannot buy ever sold.

**And the silence, which was the other half.** ⛔ `stage_target_ignores_others_pending` was **not**
widened to reach here. Its name is a claim — *the target ignores the pending total* — true on the
staged rung and **false** on this one, where the target folds it in deliberately (`#813`, and `#828`'s
own regression). A reader who greps one code and is handed two opposite facts cannot tell which run
they are reading. The entry ladder gets `entry_target_folds_others_pending`, gated on the same
question (*did the fold decide anything*) and carrying `hostTargetWeightIfHoldingsOnly` — the order
that did not go out.

⛔ **The entry ceiling is unmoved.** `enter-staged` still sizes through the fold that counts open
proposals, and an opening beside a full single-name limit is still refused. What split off was the
**word**, not the number.

**The third rung that reads the folded target keeps its word by construction.**
`odds-not-worth-taking` says the *odds* sized this at zero and sits below a rung that refuses a
headroom of zero, so the sweep asked whether a pending total could slip between them and blame the
arithmetic for what the limit did. It cannot: `headroomForStrategy` and `targetWeight` round on the
same eight-place grain, so a room the fold does not take to zero is at least `1e-8` and sizes to at
least `1e-8`. That claim is an assertion in the checker rather than a sentence here.

## The sector axis: the judgement #269 asked for, and what came of it

**The question.** #269 required each of the three #256 packages to be *read* and judged under a
Mandate that states a sector ceiling, rather than assumed safe. «`catalyst-turnaround` only touches
sector in `lib/sizing.mjs`» was the starting observation and it was not an answer.

**The reading.** Before this change, `lib/sizing.mjs` mentioned a sector once — in the ⚠️ note on
`accountConcentration` saying that `evidence-gated` folds sector, theme and factor axes and *this
package makes a single-name claim only*. `caps` carried `accountSingleName` and `perStrategy` and
nothing else; `runVerdict` passed `input.book?.caps` straight through. So a Mandate's
`accountSector` reached no arithmetic anywhere in the package.

**The verdict: it could increase risk.** #269's own conditional is that either the host enforces
the ceiling or the package receives its result, and neither was true. So under a Mandate declaring
a sector ceiling, `enter-staged` and `add-next-stage` could open or extend a position that took the
account through that ceiling, with a correct `intent`, a correct `cumulativeTargetWeight` and no
finding anywhere. The absence of a concept was the mechanism, not the defence.

**What was changed, and what was not.** `accountConcentration` now takes a `candidate`
(`{ symbol, sector }`, passed by `runVerdict` from `input.sector`) and reads `caps.accountSector`:

| Mandate | classification | `data.sectorState` | effect |
|---|---|---|---|
| no `accountSector` | — | `not-applicable` | `sector_cap_not_applicable` · `note`; nothing constrained |
| declared | complete | `evaluated` | the sector total is folded; past the ceiling is `risk_limit_exceeded` |
| declared | candidate **or any book row** unclassified | `unevaluated` | `data_missing` cause |

⛔ **The withheld case reaches `mayIncrease`, which already existed.** `runVerdict` computes
`mayIncrease = causes.filter(code === 'data_missing').length === 0`, and the invariant at the end of
the file throws if an increment survives it. So a `data_missing` here is the whole of the wiring: the
entry waits, the staged addition does not fire, and `close-out`, `reduce-on-invalidation`,
`resize-to-risk-limit`, `trim-into-realisation` and `hold-through-delay` are all above the gate and
untouched. A limit that could not be verified withholds an increase and nothing else.

⚠️ **The sector here is the fund's risk-management classification** — the host's, applied across
the whole account. This package still forms no view of what business a company is in, and #269 did
not ask it to: its case work is about an event and a balance sheet.

⚠️ **The candidate's own sector is not the whole of the question.** A ceiling is measured against a
total, and one unclassified holding or open proposal makes that total short by whatever it is. The
`#269 —` checks in `tools/verify-catalyst-turnaround.mjs` build that case explicitly, because a run
that looked only at the candidate passes every other one.

## Which fixture stands behind which rule

`tools/verify-catalyst-turnaround.mjs` runs all of them on plain Node over committed JSON. No install,
no network, no test framework — there is none in this repository and this package does not add one.

| fixture | what it pins |
|---|---|
| `cases.json` | one run per rung of the ladder, and — asserted **across** cases — that catalyst realisation, one delay, repeated delay, cancellation, a reversing recovery indicator and a deteriorating refinancing reach six *different* judgements. A change collapsing two of them passes every per-case check and fails this one |
| `ledger.json` | confirmed vs estimated dates; announcement time vs report date; a prior-year source not opening a window; a price move never confirming success; terminal states not reopening; contrary evidence surviving a restatement; a delay costing three things; a closed window being flagged for adjudication |
| `staging.json` | the same plan read four times. The second read is the point: the same due stage, and nothing added |
| `concentration.json` | open proposals counting as exposure; per-strategy caps not summing into a larger account limit; a proposal restating the position rather than stacking on it; one name under two theses still being one position |
| `scoreboard.json` | a failed catalyst under a positive price return still scoring zero on the catalyst side; an open window staying out of the denominator; a combined return being refused |
| the absent-input regressions (in `tools/verify-catalyst-turnaround.mjs`, not a fixture file) | one declared input removed from a run that passes, twelve times over, asserting the run refuses rather than proceeds — and that none of them reports a refutation. They are in-memory mutations precisely so the positive fixtures keep passing for the reasons they already passed |
| `reference-case.json` | the reference case classifying as a policy-and-financial turnaround at three points in its own story, never excluded on a valuation multiple, with the four channels kept apart — **and** a variant with the same classification that does not reach a purchase |

⛔ **Every figure in `fixtures/` is illustrative.** None of it is a re-audited historical record, a
transcription from the upstream repository, or a backtest. #256 is explicit that the upstream author's
reported result was never re-audited and is not a validated edge; no threshold in `constants.mjs` was
chosen against it.

## What the host owns and this package does not

- **The proposal envelope.** `decision_submit`'s input schema is published by the Aumos MCP server from
  `initialize`, once per session. It is not restated here, and where anything in this package appears
  to disagree with it, the schema governs. What *is* shown in `PROMPT.md` is the catalyst row, which is
  this package's own shape and which no host specifies.
- **Evidence ids.** Minted by the host. This package cites them and never creates one.
- **Sizing the order, routing and filling it.** The manager proposes a target weight; Aumos judges it
  against the Mandate, sizes the order, routes and fills. There is no `broker:write` capability and
  this package would not know what to do with one.
- **Waking the manager.** Every judgement arms its own next review because nothing else reliably does,
  and Aumos may refuse an arming — which is a normal outcome to be recorded, not retried differently.

## What has not been verified

- **Host integration.** Proposal storage, WATCH re-arming, and the link from an approved decision to an
  actual fill are #256's 검증 조건 and need a running host. Nothing in this repository can establish
  them, and this package does not claim they were checked.
- **Position attribution across managers.** #256 asks that the host's support for position ownership,
  open-proposal lookup and conflict adjudication be confirmed before multiple managers share one fund.
  This package computes whole-account exposure from what it is handed and refuses rather than
  splitting a limit; whether the host hands it *every* manager's open proposals is the host's
  question, and until it is answered the safe operating shape is a separate fund per manager.
- **The methodology's forward performance.** Nothing here measures it, and the catalogue deliberately
  shows none.
