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
| `sizing.mjs` | `evidence-gated/lib/sizing.mjs` → `concentration` | the rule that a proposal *restates* its own strategy's holding rather than stacking on it | its sector, theme and factor axes, and its parked-liquidity exemption. This package makes a single-name claim only |
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

`cumulativeTargetWeight` is *"the whole position should be this"*. `incrementThisRun` is *"buy this
much more, now"*. They are separate fields on the verdict with a `weightMeanings` map beside them, and
every intent that is not `enter-staged` or `add-next-stage` reports an increment of exactly zero —
including the trims and the exits, which carry a **cumulative** target the host reduces to rather than
a negative increment. The already-at-or-above-target case is defined: increment zero, intent `hold`,
review `already-at-target`.

## Which fixture stands behind which rule

`tools/verify-catalyst-turnaround.mjs` runs all of them on plain Node over committed JSON. No install,
no network, no test framework — there is none in this repository and this package does not add one.

| fixture | what it pins |
|---|---|
| `cases.json` | one run per rung of the ladder, and — asserted **across** cases — that catalyst realisation, one delay, repeated delay, cancellation, a reversing recovery indicator and a deteriorating refinancing reach six *different* judgements. A change collapsing two of them passes every per-case check and fails this one |
| `ledger.json` | confirmed vs estimated dates; announcement time vs report date; a prior-year source not opening a window; a price move never confirming success; terminal states not reopening; contrary evidence surviving a restatement; a delay costing three things; a closed window being flagged for adjudication |
| `staging.json` | the same plan read four times. The second read is the point: the same due stage, and nothing added |
| `concentration.json` | open proposals counting as exposure; per-strategy caps not summing into a larger account limit; a proposal restating its own strategy's holding; one name under two theses still being one position |
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
