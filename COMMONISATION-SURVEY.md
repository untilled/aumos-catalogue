# Commonisation survey — `shareholder-rerating`, `catalyst-turnaround`, `fundamental-mean-reversion`

Issue #270, under the design in #256. The inputs are the evidence-gated derivation
inventories in #265, #267 and #266.

⛔ **This document moves no code.** Nothing in `managers/` was modified to produce it, and
nothing in it is a change to any package's behaviour. It exists so that a decision about
shared code is made from a comparison rather than from the fact that the same defect was
fixed three times.

---

## The verdict

**Keep the three implementations independent.** Do not build a shared library, do not
vendor a generated module, and do not move a function.

**But open a follow-up for a shared *scenario* suite**, because the comparison found that
on three of the four boundaries the three packages have each promised to hold, they do not
currently return the same answer — and nothing in this repository would ever have said so.

The two halves are one argument, not two:

- The overlap that is *genuinely identical* is two functions and about twelve lines
  (§1). Commonising twelve lines buys nothing and costs a generator, a CI check and a
  four-package version lockstep.
- Everything else that shares a *name* diverges at a boundary (§2, §3). Commonising any
  of it means picking one package's answer and changing the other two — which is a change
  to strategy behaviour, is what #256 assigns to each package, and is explicitly out of
  scope here.
- The disagreements themselves are the finding (§5). A shared library would have frozen
  one of the three answers without anyone deciding which was right. A shared scenario
  suite makes the disagreement visible and forces the decision, without touching a line of
  any package's code.

⛔ **Splitting conditions, sizing policy and exit logic stay independent**, per #256. The
comparison found no reason to revisit that and two reasons to reaffirm it: the three
sizing formulas are not variants of one formula (risk-budget-over-loss, quarter-Kelly,
and risk-budget-over-*effective*-loss-with-a-gap-haircut), and the three staged-plan
mechanisms read three different sources of truth (§3.3).

---

## How the comparison was made

⚠️ **Behaviour was executed, not read.** Every claim below was produced by importing the
three `lib/` directories into a scratch script under Node and calling the functions on the
same inputs, then reading back what each returned. Signatures were not compared. Where a
table gives three different numbers for one scenario, those are three observed return
values.

The scenarios are stated in full in §5 so that any of them can be re-derived. They were
not committed — building the suite is the follow-up, not this issue.

---

## Deliverable ① — functions whose inputs, outputs and error handling really are the same

Two. Both are arithmetic primitives, and both came from
`managers/evidence-gated/lib/diagnostics.mjs`.

| function | SR | CT | FMR | evidence-gated | identical? |
|---|---|---|---|---|---|
| `finite(v)` | ✅ | ✅ | ✅ | ✅ | **yes** — same answer on `1`, `0`, `-0`, `NaN`, `Infinity`, `null`, `undefined`, `"0.3"`, `true` |
| `round(v, d)` | ✅ | ✅ | ✅ | ✅ | **almost** — see below |

`round` agrees on every value tried except decimal-literal half-way cases. SR omits the
`Number.EPSILON` nudge the other three carry:

| call | SR | CT | FMR | evidence-gated |
|---|---|---|---|---|
| `round(1.005, 2)` | `1` | `1.01` | `1.01` | `1.01` |
| `round(2.675, 2)` | `2.68` | `2.68` | `2.68` | `2.68` |
| `round(5e-9, 8)` | `1e-8` | `1e-8` | `1e-8` | `1e-8` |
| `round(NaN, 8)` | `null` | `null` | `null` | `null` |

⚠️ **This is immaterial today and would not be after a merge.** Every weight in SR is
compared against `THRESHOLDS.weightTolerance` of `1e-6`, four orders above where the
disagreement lives, so no fixture and no decision turns on it. But adopting one `round`
across three packages moves committed fixture digits in whichever package loses, which is
a behaviour change in a PR whose subject is supposed to be «nothing moved».

**That is the whole of list ①.** Nothing else in the three `lib/` directories takes the
same inputs and returns the same outputs.

### Near-misses that are *not* on this list, and why

| shape | why it is not identical |
|---|---|
| `diagnostic(code, severity, message, path, details)` | SR always emits the `path` key (`undefined` when absent); CT and FMR omit it via a conditional spread. CT **throws** on a severity outside its own set; SR and FMR accept any string. |
| the severity vocabulary | Three different closed sets for the same three-or-four tiers: SR `blocked / unevaluated / warn / info`, CT `blocked / unevaluated / note`, FMR `info / unevaluated / blocked`. Only `blocked` and `unevaluated` mean the same thing in all three. |
| the «did anything refuse?» predicate | `SR.isBlocked` / `FMR.isBlocked` / `CT.blocked`. `isBlocked(undefined)` is `false` in SR and FMR and throws in CT; `isBlocked(null)` throws in SR and CT and is `false` in FMR. |
| `instantOf`, `DAY_MS`, `readDeclared`, `NOT_DECLARED`, `absentFields`, `narrowingOnly` | Each exists in exactly one package. There is no three-way overlap to commonise. |

---

## Deliverable ② — similar, but different because the strategy policy is different

These are **not** commonisation candidates. Each is a correct implementation of a
different methodology's question, and the shared name is the only thing they share.

| concept | `shareholder-rerating` | `catalyst-turnaround` | `fundamental-mean-reversion` |
|---|---|---|---|
| **the sizing formula** | `riskBudgetWeight / lossFraction`, capped. No conviction term at all — deliberately: «a number a model writes about its own confidence, multiplied into a weight, is a size the model chose» | quarter-Kelly: `edge = p − (1−p)/b`, `riskBudget = 0.25·max(0, edge)`, `raw = riskBudget / stopDistance` | `perThesisRiskBudget / effectiveLoss`, where `effectiveLoss = lossToInvalidation + gapHaircut + haltHaircut` — a stop price is not a fill |
| **what «the loss» means** | entry → invalidation, **less a dividend whose ex-date falls before the invalidation review** | entry → price invalidation. The *business* invalidation is a ledger condition that closes the position rather than sizing it | entry → invalidation **plus a measured worst-session gap and a halt/price-limit haircut** |
| **the cap axes** | single-name, **sector**, **gross** — three axes, all folded into one `maxTotalWeightForName` | single-name only | single-name, per-strategy, **gross** |
| **the venue minimum** | a refusal gate (`minimum_executable_not_met`, refuses rather than rounding up), applied to the *order* as well as the *target* | absent | absent |
| **staged-plan stage weights** | `toWeight` is **cumulative**; the increment is `toWeight − (held + open)` | `weight` is an **increment**; the stages must sum to `cumulativeTargetWeight` | `weight` is an **increment**; `plannedTotalWeight` is the total |
| **stage condition kinds** | any non-price condition carries a stage; `price-below / price-above / drawdown` alone is refused | `immediate / at-time / price-below / price-above`, only the first stage may be `immediate` | `stabilisation-held / thesis-evidence / earnings-confirmation / target-reached` carry; `price / elapsed-time` do not |
| **the classification vocabulary** | `buy-path / watch / trim-or-exit-review / reject` over cases like `dividend-trap`, `one-off-earnings` | eleven `intent::review` pairs over a catalyst state machine | fourteen `OUTCOMES` over a technical/damage state, plus a `RE_ADJUDICATE` verdict that is not an AMP action |
| **thresholds** | `lib/thresholds.mjs`, 5 values | `lib/constants.mjs`, 10 values, mirrored in `config.schema.json` and `PROMPT.md` | `lib/core.mjs`, one frozen tree, re-pinned as literals in the checker |
| **price / indicator arithmetic** | none | none | `sma`, `rsi`, `normalizeBars`, `priceSeriesDiscontinuity`, `technicalState`, `adjustmentBasis` |

⚠️ **`prices.mjs` is a two-way overlap, not a three-way one.** FMR's indicator layer is
derived from `evidence-gated/lib/indicators.mjs`; SR and CT have no bar arithmetic at all.
Whatever the case for sharing it, it is a case about *two* packages and it is not this
issue's. FMR also deliberately raised two of its inherited findings from `info` to
`blocked` (`newest_bar_may_be_unclosed`, `priceSeriesDiscontinuity`) — a divergence from
the origin that #266 flagged for a reviewer and that any sharing would have to resolve
first.

---

## Deliverable ③ — the same defect, fixed three ways

The absence audit closed eleven findings per package. The findings were of the same
*class* — «an input that was never read authorised something» — and the fixes are not the
same fix. Below, each row is the same defect class, what each package did, and whether the
difference matters.

### ③.1 An unread account must not read as an empty one

| | mechanism | on an unread book | on `[]` |
|---|---|---|---|
| SR | `Array.isArray` on both lists in `concentration` and again in `evaluateCase` | `withinLimits: null`, `outcomeCode: 'data_missing'`, severity **`unevaluated`**; `evaluateCase` → `WAIT` | passes, `withinLimits: true` |
| CT | `Array.isArray` on `positions`/`proposals`, plus `readDeclared` on the cap | `readable: false`, cause `data_missing` (lane `absence`, severity **`blocked`**) | passes, `readable: true` |
| FMR | `bookIsReadable(book)` requiring both arrays | `status: 'refused'`, `code: 'data_missing'`, severity **`blocked`** | passes, sizes normally |

**All three are right, and they agree on the answer.** They disagree on the severity of
the finding (`unevaluated` vs `blocked`) and on the shape it arrives in
(`data.withinLimits === null` / `causes[]` / `status === 'refused'`). A host or a shared
harness reading these three has to know which package it is talking to.

⚠️ **CT's is the strongest of the three and the difference is structural, not cosmetic.**
`runVerdict` computes `mayIncrease = (no cause with code data_missing)` once, and then
`throw`s if a positive increment survives it — a single line that would have refused all
three of the #265 findings at once. SR and FMR make the equivalent check at each branch
instead. Both work; only one of them cannot be forgotten at a new branch.

### ③.2 A limit that could not be checked must not read as a limit that passed

| scenario | SR | CT | FMR |
|---|---|---|---|
| single-name cap **not passed at all** | `targetTotalWeight: null`, `position_cap_not_stated` (`unevaluated`) | `targetWeight: null`, cause `data_missing` | refused, `mandate_single_name_cap_missing` (`blocked`) |
| mandate **read, declares no single-name cap** | not expressible | `targetWeight: 0.1` — house ceiling `0.20` binds against headroom, `mandate_position_cap_not_declared` recorded | not expressible |
| **gross cap absent**, single-name cap present | `withinLimits: **true**`, `gross_cap_not_stated` (`info`) | no gross axis exists | **refused**, `mandate_gross_cap_missing` (`blocked`) |
| **venue minimum** not stated | `minimum_executable_not_stated` (`unevaluated`), no size | no such gate | no such gate |

**Row 1: all three agree.** ✅

**Row 2 is a capability gap, not a disagreement.** CT invented a three-state read
(`readDeclared`: a number / the literal `'not-declared'` / unread) so that «the mandate was
read and declares none» is a positive statement a caller has to make on purpose. SR and
FMR have no such sentinel, so a mandate that genuinely declares no cap is indistinguishable
from one nobody read, and both refuse. **That is the safe direction** — they refuse rather
than pass — so it is not a defect. It is a real limitation: neither can serve a mandate
that declines to constrain the axis.

**Row 3 is a genuine disagreement and both sides argue it explicitly in comments.**

- FMR: the gross cap is *named in this operation's input contract*, so an unreadable one
  is missing data, and dropping it from the ceiling list «is the difference between a book
  at 79% invested and one with room».
- SR: a mandate that states no gross ceiling «has not left a gap in a calculation — it has
  declined to constrain that axis», and inventing one would be the package writing a limit
  the investor never approved. So it reports `info` and passes.

⚠️ **Both are defensible and they cannot both be applied to one shared function.** This is
the clearest single reason not to commonise the concentration fold: the shared version
would have to pick one, and picking either changes a shipped package's behaviour on a
reachable input. **Recommendation: leave both, and put the scenario in the shared suite so
the divergence is on the record rather than in two files nobody reads side by side.**

**Row 4**: SR alone has a venue-minimum gate, and it applies it twice — once to the total
and once to the order increment, since a target that clears the minimum can be reached by
an addition that does not. Nothing to reconcile; CT and FMR simply do not make this claim.

### ③.3 A re-run must not add the same stage twice

Three different sources of truth, and the difference shows up only when the source of
truth is itself unavailable.

| | source of truth | first run | re-run, ledger present | re-run, **ledger unreadable** |
|---|---|---|---|---|
| SR | the **book** (`heldWeight` + `openProposalWeight`) | `0.03` | `0` | `0` — the book still holds it. With the *book* unreadable: `0`, action `unevaluated` |
| CT | a carried **register**; `undefined` means «not read», `null` means «read and empty» | `0.03` | `0` | **`0`**, `registerRead: false`, cause `data_missing` |
| FMR | `plan.filled` inside the plan object | `0.03` | refused, `stage_already_filled` | ⛔ **fires again** — `status: 'ok'`, the stage is recorded a second time |

⛔ **This is a one-sided finding, and it is the same defect class the audit closed.**
`applyStage` reads `Array.isArray(plan?.filled) ? plan.filled : []`, so a plan whose ledger
was lost or never written arrives as a plan with nothing filled — which is exactly «an
unread thing read as an empty thing», the defect FMR's own `bookIsReadable` closes twelve
files away in the same package, with a comment saying so. SR is immune by construction
(it never consults a private ledger for the increment) and CT closed it explicitly with
the `undefined` / `null` distinction.

**Verdict: CT's fix is the right one and FMR's is incomplete.** ⚠️ Fixing it is **not**
this PR's job — #270 forbids behaviour changes, and #256 is explicit that a fix for
something the existing checks missed must not travel in the same PR as a refactor. It
belongs in its own issue against `fundamental-mean-reversion`.

### ③.4 A total and an increment must not be one field

**All three fixed this, all three are right, and they agree on every answer.** ✅ Only the
field names differ:

| | the total | the increment | computed where |
|---|---|---|---|
| SR | `targetTotalWeight` | `incrementWeight` | `evaluateCase`, after the concentration fold |
| CT | `cumulativeTargetWeight` (+ `meaning: 'cumulative-position-weight'`) | `incrementThisRun` | `runVerdict` |
| FMR | `targetTotalWeight` | `incrementalWeight` (+ `atOrAboveTarget`) | `positionSizing`, both returned together |

⚠️ Three field names for two concepts is a real cost, but it is a cost paid by a host
reading three packages — it is a *naming* convention, and a convention can be agreed in
`CONTRIBUTING.md` without any shared code.

### ③.5 Degenerate invalidation prices — where the fixes actually disagree

Same input, three answers:

| entry / invalidation | SR | CT | FMR |
|---|---|---|---|
| `100 / 80` | `0.2` | `0.2` | `0.2` ✅ |
| `100 / 100` | `blocked: invalidation_above_entry` | `blocked: invalidation_above_price` | refused, **`research_incomplete`** |
| `100 / 120` | `blocked` | `blocked` | refused, **`research_incomplete`** |
| `100 / 0` | ⛔ **`lossFraction: 1`** | `blocked` | refused, `data_missing` |
| `100 / −50` | ⛔ **`lossFraction: 1.5`** | `blocked` | refused, `data_missing` |
| `0 / −10` | `unevaluated` | `blocked` | refused |
| invalidation missing | `unevaluated` | `blocked` | refused |

Two findings here:

1. ⛔ **SR alone accepts a non-positive invalidation price.** End to end on SR's own
   `financial-positive-reaches-buy` fixture with `invalidationPrice: -100`, `evaluateCase`
   returns **`BUY` at 0.99% of the book**. The direction is conservative — a larger
   `lossFraction` divides into a smaller weight — so it does not oversize anything. But a
   negative stop level is not a level, and a package that sizes off one is sizing off an
   input nobody validated. Candidate defect, separate issue.
2. **The cause code for «invalidation at or above entry» is not agreed.** SR reaches
   `data_missing` end to end; FMR says `research_incomplete`; CT raises a blocked
   diagnostic carrying no cause of the four. #256 requires those four states to stay
   apart, and an invalidation level written above the entry price is not an *absence* —
   somebody wrote a number and it is wrong. **FMR's is the faithful reading**; SR's is the
   one to revisit. Again: separate issue, not this one.

### ③.6 Counting exposure once — three packages, three answers

This is the most important row in the whole survey, so it is stated as §5.3 with the
scenarios in full.

---

## Deliverable ④ — the version scope, if commonisation ever happens

**Four packages, twelve files, plus whatever the generator itself lives in.**

Only four of the twelve managers in this catalogue ship a `lib/` at all:

| package | version | `lib/` files | role |
|---|---|---|---|
| `evidence-gated` | `0.11.1` | 36 | the origin all three derived from; **unmodified by #265/#266/#267** |
| `shareholder-rerating` | `0.1.0` | 9 | derivative |
| `catalyst-turnaround` | `0.1.0` | 10 | derivative |
| `fundamental-mean-reversion` | `0.1.0` | 8 | derivative |

The other eight (`ai-hedge-fund-value`, `atlas-trend-crypto`, `atlas-trend-kr`,
`atlas-trend-us`, `basic-investor`, `earnings-drift-watcher`, `prudent-allocator`,
`undervalued-now`) are prose-only and are outside the blast radius entirely.

**Per package, a version bump touches three files**, and two existing checks already
enforce that they agree:

| file | enforced by |
|---|---|
| `managers/<id>/aumos.json` | — (the source of truth) |
| `managers/<id>/.claude-plugin/plugin.json` | `check:plugin` (`name`, `version`, `description` must match the manifest) |
| the `.claude-plugin/marketplace.json` row | `check:index` (`entry.version` must equal the manifest's) |

`.aumos/first-party.json` lists ids only and carries no version, so it does not move.

⚠️ **A shared module means a four-package lockstep on every edit.** A change to a shared
`finite`/`round` is a change to the bytes published inside three or four packages, so all
of them bump, all twelve files move, and all of them re-publish — for a change that
affects nobody's behaviour. That cost is the argument against commonising the twelve lines
in §1, not an argument that the cost is unmanageable.

⛔ **A cross-package `import` is not available and this is a hard constraint, not a
preference.** The published artifact is a path→contents map rooted at
`managers/<id>/`, so a relative path leaving that directory does not survive publication.
All three PRs state this and all three copied rather than imported. Any commonisation is
therefore **generation plus vendoring**, which is the shape that failed in
`untilled/aumos#791` — see §6.

---

## The shared «contracts» — do the three actually give the same answer?

Four properties, already promised by all three packages. Each was executed against all
three implementations on the same scenario.

| contract | agree? |
|---|---|
| ① a lookup failure is not read as an empty account | ✅ **same answer**, different severity and shape |
| ② the total target and the order increment are distinguished | ✅ **same answer**, three field names |
| ③ open orders and reservations are not double-counted | ❌ **three different numbers** |
| ④ a configured limit that cannot be checked does not pass | ⚠️ **agree on «unread»; disagree on «declared-none» and on the gross axis** |

### §5.1 Contract ① — an unread account

Covered in ③.1. Scenario: call each package's concentration/sizing entry point with the
holdings list absent, then again with `[]`.

**Result: all three refuse on the absent list and all three proceed on the empty one.** The
contract holds. A shared scenario would have to assert «refused, for an absence reason»
rather than a shape, because the three shapes are `withinLimits === null` /
`readable === false` + `causes[]` / `status === 'refused'`.

### §5.2 Contract ② — the total and the increment

Covered in ③.4. Scenario: size a name the book already holds at the target weight.

**Result: all three distinguish, and all three answer «increment 0, and this is not a
refusal».** FMR names the state (`atOrAboveTarget: true`); SR reaches
`outcomeCode: 'position_at_target'`; CT reaches `review: 'already-at-target'`. The contract
holds.

### §5.3 Contract ③ — counting an open proposal once ❌

⛔ **This is the survey's most important finding.** Three scenarios, three packages, and
they do not agree on any of them.

**Scenario A** — another strategy holds 6% of the name and has one open, unapproved
proposal on it whose stated figure is 8%:

| | existing exposure reported |
|---|---|
| SR | **0.14** |
| CT | **0.08** |
| FMR | **0.14** |

**Scenario B** — the *same* manager holds 4% and has its own open proposal at 6%:

| | existing exposure | headroom logic |
|---|---|---|
| SR | **0.10** | 0.10 counted against the cap |
| CT | **0.06** | the proposal *restates* the strategy's own holding |
| FMR | **0.10**, all of it `ownWeight`, `otherWeight: 0` | subtracted out, so the cap is not affected — the answer happens not to matter here |

**Scenario C** — two holding rows for one symbol, i.e. two theses on one position:

| | total |
|---|---|
| SR | **0.05** — deduplicated, larger row wins, `duplicate_position_rows` warned |
| CT | **0.10** |
| FMR | **0.10** |

**What is actually going on.** The three ask the host for the same concept under three
different meanings:

| package | field | documented meaning |
|---|---|---|
| SR | `openProposals[].weight` | the **increment** being added |
| CT | `proposals[].weight` | the **restated total** for that strategy and symbol — «proposals are the target state for the names they mention» |
| FMR | `openProposals[].targetWeight` | named as a **total**, but summed onto the holding as though it were an increment |

- **SR and CT are each self-consistent** under their own documented field meaning. Given
  the *same host payload*, they return different numbers because they are reading the
  same field to mean different things. Neither is wrong; the two cannot both be right about
  what the host sends.
- ⛔ **FMR's is internally inconsistent.** The field is called `targetWeight` and FMR's own
  `positionSizing` uses `targetTotalWeight` to mean «the whole position should be this» —
  yet `concentration` adds it to the holding. Its fixtures never catch this because in
  every one of them the holder and the proposer are *different* strategies (`held-by-another-
  strategy` has `catalyst-turnaround` holding 6% and `shareholder-rerating` proposing 2.5%),
  where additive is the right answer. The untested case is one strategy that both holds and
  has a proposal restating that holding — and on a book where these three managers run
  together, that case is `catalyst-turnaround` re-running on a name it already holds.
- **Scenario C is a stated-rule violation.** #256 says «보유 종목에 복수 thesis가 붙어도
  포지션 수량은 하나다». SR implements it; CT and FMR double-count. The direction is
  conservative — an over-counted position blocks a purchase rather than authorising one —
  but it blocks legitimate purchases and it reports a book position that does not exist.

⚠️ **This is exactly what a shared library would have hidden.** Had the three imported one
`concentration`, they would have agreed by construction, one of the three semantics would
have won silently, and nobody would have decided which. The disagreement is information,
and it is worth more than the deduplication.

### §5.4 Contract ④ — an uncheckable limit ⚠️

Covered in ③.2. The three agree on the case that matters most (a limit nobody read never
authorises anything) and diverge on two secondary cases: whether a «declared none» can be
expressed at all (only CT), and whether an absent gross cap is missing data (FMR) or a
declined axis (SR) or a concept that does not exist (CT).

---

## Can a shared scenario suite actually be built?

**Yes, and the shape is forced by what the comparison found.** Assessment only — building
it is a separate issue.

**What works.** Every function compared is pure: no clock, no network, no filesystem,
`asOf` is an argument in all three. A scenario is therefore a JSON object plus an expected
answer, and a checker is plain Node — which is what all three packages' existing verifiers
already are (`tools/verify-*.mjs`, no test framework, no install).

**What does not work: asserting one output shape.** The three answers have three shapes
(`{data, diagnostics}` / `{data, diagnostics, causes}` / a flat object with `status`), three
severity vocabularies and three sets of field names. A suite that asserted a shape would
be asserting a refactor.

**So the suite has to be scenario + adapter:** one scenario file holding the *situation*
and the *answer that matters*, and three thin per-package adapters that translate the
situation into that package's input shape and normalise its answer down to the small set
of things all three genuinely claim:

| the suite asserts | the suite does **not** assert |
|---|---|
| did this authorise an increase? (`yes` / `no`) | the field names |
| which of #256's four causes, if it refused | the severity word |
| the exposure number the cap was measured against | the diagnostic codes |
| the total-vs-increment pair | the answer's shape |

**The adapters are the cost, and they are small** — the probes written for this survey were
about forty lines per package. **The adapters are also the risk**: an adapter is a place
where a scenario can be quietly translated into something the package finds easy. The
mitigation is that the adapter lives beside the scenario, in this repository, and that a
scenario the three answer differently is recorded as a *disagreement* rather than skipped.

⛔ **Where the suite must stop.** It covers the four contracts and nothing else. Splitting
conditions, sizing formulas, exit logic, classification vocabularies and thresholds are
each package's own and must not acquire a cross-package assertion — that would be
commonisation of policy through the back door, which is what #256 forbids.

---

## If generation and vendoring is ever chosen — the conditions

Not recommended now. Recorded because #270 asks for it and because
`untilled/aumos#791` failed in this exact place: generated vendored copies went **three
kinds stale**, and the check that was supposed to break the build when a copy differed did
not catch it.

A proposal to generate and vendor is incomplete unless it carries all five:

1. **Origin, generator and every deployed copy live in one repository.** A generator that
   cannot see the copies cannot be checked against them.
2. **CI regenerates into a temporary path and diffs against the committed copies.**
   Comparing a copy against itself, or against a hash the generator also wrote, is the
   failure mode — the comparison must be against a fresh generation.
3. **Missing files and missing managers are both failures.** #791's copies were stale in
   three ways and only one of them was «different bytes»: a generated file that was never
   written, and a new manager that was never added to the generator's list, both pass a
   diff over the files that *do* exist.
4. **Deliberately corrupt a copy and confirm CI goes red.** This measures whether the check
   runs at all, which is the thing #791 assumed and did not have. It belongs in the PR that
   adds the check, as evidence, not as a claim.
5. **A changed package's version is bumped**, across all three files in §4. `check:plugin`
   and `check:index` already enforce internal agreement; what is missing is anything that
   says «the vendored bytes changed, so the version must».

⚠️ And one more, specific to this catalogue: **the origin has to be decided before the
generator is written.** `evidence-gated` at `0.11.1` is a shipped package with its own
policy baked into the same files (`sizing.mjs` is 2,989 lines and carries sleeve budgets,
maturity lanes and unlock arithmetic). It is not a common library, and making it one is a
change to a published package. The alternative — a fourth, source-only directory that
nothing publishes — has no precedent in this repository and no lint rule, which is
precisely the reason #257/#258/#259 declined to invent one mid-implementation.

---

## ⬜ What was not compared

- ⬜ **Host integration — nothing in this survey was run against a live Aumos.** Every
  claim about how a host supplies open proposals, attributes positions to strategies, or
  reconciles two managers on one book is read off the packages' own input contracts. The
  §5.3 finding says the three *disagree about what a host payload means*; it cannot say
  which meaning the host actually sends, and that question decides which of the three is
  wrong. `untilled/aumos#789` is the same gap all three PRs already recorded.
- ⬜ **The prose was not compared.** `PROMPT.md` and `skills/` in all three are outside
  scope — they are the methodologies, they are meant to differ, and #256 assigns them to
  each package. No claim here is about them.
- ⬜ **`evidence-gated`'s side of each derivation was not audited.** The origin functions
  were read where a derivative's comment named them, and `diagnostics.mjs` was executed for
  the §1 comparison. The other 35 files were not, so this survey cannot say whether any
  derivative diverged from its origin in a way its own PR did not report.
- ⬜ **FMR's `prices.mjs` against `evidence-gated/lib/indicators.mjs`** — a two-way overlap
  with no third party, deliberately left out of a three-way survey. If indicator sharing is
  ever considered, that comparison still has to be done, including the two severities FMR
  raised from `info` to `blocked`.
- ⬜ **Fixtures were not cross-run.** No package's fixtures were fed to another package.
  Where a fixture is cited above it was read, not executed against a sibling — the input
  shapes differ too much for that to mean anything without the adapters §6 describes.
- ⬜ **Exhaustive boundary enumeration.** The probes covered the four contracts, the
  primitives, and the degenerate price inputs. They are not a systematic sweep of every
  exported function's input domain; a function not named in this document was inventoried
  (§2) but not boundary-tested.

---

## What a reviewer has to settle

1. **The verdict itself** — independent implementations, and a shared scenario suite as a
   follow-up rather than a shared library.
2. **§5.3.** Which meaning of «an open proposal's weight» is the host's? That answer
   decides whether SR, CT or FMR is the one to change, and it needs `untilled/aumos#789`.
3. **③.2 row 3.** Is an absent gross cap missing data (FMR) or a declined axis (SR)? Both
   ship today and they answer the same input differently.
4. **③.3 / ③.5.** Three candidate defects found by comparison, all one-sided, none fixed
   here: FMR's staged ledger reading an absent `filled` as empty; SR accepting a
   non-positive invalidation price; SR reporting `data_missing` where FMR reports
   `research_incomplete`. Each wants its own issue against its own package, per #256's rule
   that a fix for something the checks missed does not travel with a refactor.
