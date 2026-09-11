---
name: fmr-deterministic-core
description: "The six calls Fundamental Mean Reversion makes into its own arithmetic — priceState, stabilisation, reversionTarget, positionSizing, stagedPlan and classifyCase — with the exact request shape for each and what each answer's fields mean. Read this before computing any of them in prose."
---

# The arithmetic, and how to ask for it

One program, one JSON object in, one JSON line out:

```bash
printf '%s' "$INPUT_JSON" | node "${CLAUDE_PLUGIN_ROOT}/bin/fundamental-mean-reversion-metrics"
```

Every request has the same three fields, and `asOf` is the invocation's, verbatim:

```json
{ "operation": "classifyCase", "asOf": "2026-08-29T00:00:00Z", "input": { } }
```

⚠️ **There is no default `asOf` and there is no clock inside.** A call without one is refused
with `as_of_missing`. That is not pedantry: these operations are the part of the run a replay
has to reproduce exactly, and a function that read the wall clock would answer differently on
the day it was replayed.

⚠️ **Every answer carries `diagnostics`, and severity decides what you may do with it.**
`blocked` means the reading was not taken — treat it as missing data, never as a finding about
the company. `unevaluated` means one row was unreadable. `info` is a fact worth writing down.

⛔ **Do not recompute any of this in prose.** The six exist because each of them fails silently
when a model does it by eye, and a number you computed yourself is not evidence and carries no
id.

## `priceState` — the series, and whether it can be read

```json
{ "operation": "priceState", "asOf": "…", "input": {
  "series": {
    "adjustment": "adjusted",
    "corporateActions": [],
    "corporateActionsComplete": true,
    "rows": [ { "timestamp": "2026-08-28T00:00:00Z", "open": 171000, "high": 173500, "low": 169800, "close": 172000, "volume": 431200 } ]
  }
} }
```

- `adjustment` is **required** and is `"adjusted"`, `"unadjusted"` or `"mixed"`. Say what the
  vendor said; do not guess, and do not write `"adjusted"` because the request asked for it.
- `technical` carries `close`, `drawdownFromHigh` (over 252 bars), `rsi14`, `ma20/60/120/200`,
  the distances, `ma200Rising`, the volume readings and `discontinuity`.
- `discovery` carries `researchOpen`, which is the queue and not a case.

## `stabilisation` — has the fall stopped?

Same `rows`. The answer is one of `confirmed`, `falling-knife`, `stabilization-unconfirmed`,
`data-missing`, plus `base` (the low, when it printed, how long ago, the reclaim) and `checks`
(each of the three conditions with its value, its requirement and whether it is met).

Quote `checks` in your proposal. *"Stabilisation confirmed"* with no numbers is a claim a
reviewer cannot recompute.

## `reversionTarget` — where it goes back to, and what kind of claim that is

```json
{ "operation": "reversionTarget", "asOf": "…", "input": {
  "basis": "normalised-earning-power",
  "earningPower": {
    "normalisedEps": 12000,
    "multipleRange": { "low": 15, "high": 19 },
    "derivation": "median operating profit per share over the four pre-shock years, at the 25th–75th percentile of this name's own ten-year multiple",
    "evidenceIds": ["ev_…"]
  },
  "rows": [ ]
} }
```

Three bases and each is a different kind of claim:

| `basis` | needs | `kind` it returns |
|---|---|---|
| `historical-price-band` | `referenceWindow: { from, to }` with ≥ 60 bars in it | `price-history` |
| `moving-average` | `movingAverage: "ma120" \| "ma200"` | `technical` |
| `normalised-earning-power` | the earning figure, the multiple range, the derivation **and** the evidence ids | `valuation` |

⛔ **`kind` is derived from `basis` and is never accepted from you.** Passing `claimedKind` that
disagrees is refused with `technical_target_labelled_as_valuation`, on purpose: the mistake
lives in the sentence you were about to write, and quietly relabelling it would leave that
sentence standing.

⛔ A range whose top is above the 252-bar high is refused. So is one whose middle is at or below
the current price — that is a finding about the target, not a reason to widen it.

## `positionSizing` — how large, and what it costs when wrong

```json
{ "operation": "positionSizing", "asOf": "…", "input": {
  "symbol": "…",
  "entryPrice": 172000,
  "invalidationPrice": 145000,
  "nav": 400000000,
  "mandate": { "…": "the invocation's `mandate`, verbatim" },
  "book": {
    "holdings": [ { "symbol": "…", "weight": 0.06, "strategy": "another-manager" } ],
    "openProposals": [ { "symbol": "…", "targetWeight": 0.025, "strategy": "another-manager" } ]
  },
  "execution": { "halted": false, "dailyPriceLimit": true },
  "config": { "perThesisRiskBudget": 0.005 },
  "rows": [ ]
} }
```

- `book` is **the whole fund's**, not this manager's sleeve. Holdings and open proposals both
  count, whoever wrote them. ⛔ Both arrays must be **present**: an empty one is a fact and is
  accepted, a missing one is refused with `book_unreadable`. A book nobody could read is not a
  book with nothing in it, and treating it as empty is how a run that never saw the account
  returns a full target weight.
- **`mandate` is the invocation's Mandate, passed verbatim** — the snapshot or its `constraints`.
  The host's names are read: `maxPositionWeight` is the single-name ceiling, and `cashFloor` is the
  gross one as its complement (`1 − cashFloor`), because *cash ≥ x* and *invested ≤ 1 − x* are one
  statement. ⛔ The Mandate has **no sector and no per-strategy axis**; those two exist only if you
  state them yourself as `mandate.sectorCap` and `mandate.strategyCap`.
- You may state `singleNameCap`, `grossCap`, `sectorCap` and `strategyCap` outright instead, and a
  stated one always wins over the Mandate beside it.
- ⛔ **A single-name ceiling is required either way.** An investor who left the concentration
  question blank has not authorised this run to choose its own limit, and it refuses.
- ⚠️ **An unread limit is not an absent one.** A Mandate that *was* read and states no cash floor
  has declined to constrain the gross axis — it constrains nothing and says so
  (`gross_cap_not_applicable`). Passing no Mandate at all and no `grossCap` is the unread case and
  still refuses.
- `execution.halted` and `execution.dailyPriceLimit` must be **booleans**. On KRX the daily
  price limit is `true`; declare it. An omitted flag is not read as `false` — it is reported as
  `execution_conditions_undeclared` (`unevaluated`), and `classifyCase` will not reach BUY over
  a sizing carrying an unevaluated reading. Only a check that actually ran authorises an entry.
- The answer names `bindingConstraint`. Say which one bound; an investor reading *"3.5%"* with
  no reason cannot tell a risk budget from a ceiling.

**Two weights come back and they mean different things:**

| field | means |
|---|---|
| `targetTotalWeight` | the whole position should be this |
| `incrementalWeight` | buy this much more today |
| `atOrAboveTarget` | the second is zero because the position is already complete |
| `heldOnlyTargetTotalWeight` | the same share with the book-derived ceilings measured against **holdings** only — no open proposal of another desk in it. ⛔ What a reduction is clamped against (#826); `heldOnlyBindingConstraint` says which ceiling bound it |
| `hostTargetWeight` | ⛔ **the entry total only** — `otherHeldWeight + targetTotalWeight`, «what the position becomes if this desk buys up to its share». `hostTargetWeightRole` on the same answer says `increase`, because this operation is reached before any judgement is known |

⛔ **Take the total from `classifyCase`, never from here, whenever an outcome has been
reached.** `positionSizing` cannot know which judgement will carry its number; on a reduction
over a holding smaller than the share the entry total is a **purchase** (#823). `classifyCase`
answers `hostTargetWeight`, `weightRole` and `exposureDirection`, and replaces the field on the
`sizing` it carries so that one answer never holds two totals under one name.

⛔ Never carry one of them into a proposal as though it were the other. With nothing held they
are equal, which is exactly why one field looked sufficient — and why the run that already held
half the position is the one that would have executed it wrongly.

## `stagedPlan` — the ledger

Read it by omitting `stageId`; record a stage by naming one:

```json
{ "operation": "stagedPlan", "asOf": "…", "input": {
  "plan": {
    "planId": "plan_…", "decisionId": "dec_…", "symbol": "…",
    "plannedTotalWeight": 0.035,
    "expiresAt": "2026-12-31T00:00:00Z",
    "stages": [ { "stageId": "stage-1", "kind": "add", "weight": 0.015, "conditions": ["stabilisation-held", "thesis-evidence"] } ],
    "filled": []
  },
  "stageId": "stage-1",
  "satisfied": ["stabilisation-held", "thesis-evidence"],
  "gate": { "thesisIntact": true, "stabilisationOutcome": "confirmed", "lossBudgetRemaining": 0.004 }
} }
```

Condition kinds are `price`, `elapsed-time`, `stabilisation-held`, `thesis-evidence`,
`earnings-confirmation` and `target-reached`. **The first two cannot carry a stage on their
own** — a stage satisfied only by them is refused with `stage_condition_price_or_time_only`.

⚠️ **Write `plan` back verbatim** — the answer's, not yours. On a refusal the plan comes back
*unchanged rather than absent*, so following that instruction can never erase your own ledger.

## `classifyCase` — the whole judgement

Takes `series`, `business`, `research`, `position`, `review` and the `sizing` answer, and
returns one `outcome`, one `verdict`, the `ampActions` that verdict leaves open, and one of the
four diagnosis codes or `null`.

```json
{ "operation": "classifyCase", "asOf": "…", "input": {
  "series": { },
  "business": { "damage": "one-off-impairment", "evidenceIds": ["ev_…"] },
  "research": {
    "fallCauses": ["…"],
    "targetBasis": "historical-price-band",
    "invalidationPrice": 148000,
    "invalidationConditions": ["…"],
    "maxWaitDays": 120,
    "reviewAt": "2026-09-30T08:00:00Z",
    "evidenceIds": ["ev_…"],
    "complete": true
  },
  "position": { "held": false },
  "review": { },
  "sizing": { }
} }
```

**The answer's weights, and which of them a proposal carries:**

| field | means |
|---|---|
| `ownHeldWeight` | what is **held** in this name and assigned to this manager |
| `otherHeldWeight` | what is held and is not — another manager's, and every unattributed row |
| `positionWeight` | what the account holds in the name, whoever runs it |
| `hostTargetWeightFloor` | `otherHeldWeight`: no total you send may be below it (#819) |
| `weightRole` | what this outcome asks the position to do — `increase`, `reduce`, `standstill` |
| `hostTargetWeight` | ⛔ **the one total this answer may hand the host**, chosen by the role |
| `exposureDirection` | that total against `positionWeight`: `increase`, `reduce`, `unchanged` |

⛔ **A reduction is bounded by what this desk holds (#823).** On the `reduce` role the total is
`otherHeldWeight + min(heldOnlyTargetTotalWeight, ownHeldWeight)`, so a review reached while the
position is still being staged in asks for the holding rather than for the entry target — which
over a 2% holding was a `buy:16` out of a `TRIM`. The clamp is a ceiling and never a floor: a
holding above the target reduces exactly as it always did.

⛔ **And the share it clamps against ignores other desks' open proposals (#826).** A pending
total is exposure for a ceiling and is not a position for an order, so somebody's unfilled buy
narrows what you may *add* and never enlarges what you *sell*: on a 6% position wholly this
desk's, another manager's unapproved 15% BUY on the same name took the order from `sell:23` to
`sell:50`, and past the cap to the whole position. On `standstill` the total is what the
account holds today, because an outcome that changes nothing proposes no change. `null`
throughout means the account was not folded — hand the `sizing` answer in, or propose no weight.

`requiredOutputs` in the answer is the checklist of what a finished run owes. A `false` there
is a paragraph you have not written; a `null` is a step you have not reached yet.
