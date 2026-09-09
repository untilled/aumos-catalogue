---
name: staged-plan-and-ledger
description: Writing a staged entry or exit plan, and re-running one without adding the same exposure twice. Load when a plan is being written, a stage is being evaluated, or a run is resuming after a failure.
---

# One plan, one cumulative target, one decision it came from

A staged plan here is not "buy a third now and a third later". It is a route to **one** weight,
with each stage stating the weight the position should **reach** and the conditions that have to
be true before it does.

```jsonc
{
  "planId": "plan_…",
  "decisionId": "dec_…",            // the decision this plan descends from
  "symbol": "000000",
  "cumulativeTargetWeight": 0.06,   // the total this position may ever reach
  "stages": [
    { "stageId": "stage-1", "toWeight": 0.02, "expiresAt": "…",
      "conditions": [{ "kind": "thesis-intact" }, { "kind": "discount-headroom" }, { "kind": "risk-budget" }] },
    { "stageId": "stage-2", "toWeight": 0.04, "expiresAt": "…",
      "conditions": [{ "kind": "execution-evidence", "of": "quarterly treasury acquisition report" },
                     { "kind": "thesis-intact" }, { "kind": "risk-budget" }] }
  ]
}
```

That shape is **this methodology's** and is why it is written out here rather than left to the
protocol: `toWeight` being cumulative is what makes a re-run free.

## Why cumulative

`stagedIncrement` proposes `toWeight − (heldWeight + openProposalWeight)`. Both terms matter:

- **held**, so a stage that already filled proposes nothing;
- **open and unapproved**, so a stage whose proposal is still sitting in the approval queue does
  not get proposed again.

A host repeats a run after a failure. If stages were increments, that repeat would double the
position, and it would do it in the case where the ledger write was the thing that failed. With
cumulative stages the second run computes zero without needing the ledger to have survived.

## The conditions, and the one that is refused

Every stage re-checks three things on the run that fires it: the thesis is still intact, there is
still discount to the base case, and the remaining risk budget covers the increment's loss to
invalidation. `stagedIncrement` blocks a stage whose conditions are **only** about the price —
`price-below`, `price-above`, `drawdown` — because that is averaging down with a schedule
attached. A price condition is fine as one condition among others; it may not be the whole list.

⛔ **A stage that does not fit the remaining budget waits; it is not trimmed to fit.** A stage
sized to what happens to be left is a size nothing calculated.

⚠️ **Do not copy a ladder from elsewhere.** No 40/35/25, no "add every 10% down", no time-based
fallback. The stages of a plan are its thesis's catalysts: the results release that confirms the
payout, the acquisition report that shows the programme running, the general meeting that fixes
the policy. If a stage cannot be attached to something observable, it is not a stage.

## Exits are staged too

Reaching fair value is a reason to reduce in stages against the range, not to exit in one action;
a policy retreat or a capital or earnings deterioration is a reason to re-argue the thesis from
the beginning; a hard risk breach is a reason to propose liquidation. Write the exit stages into
the same plan, with the same cumulative discipline, so the reduction is not re-decided on the day
under pressure.

## What to write back

After a stage is proposed, record in this instance's own folder: the stage id, the decision id,
the weight proposed, the instant, and what the run re-checked. Read it back at the start of every
run. It holds **progress**, not positions: real holdings, cash and fills belong to the host's
portfolio and are read from there, and a ledger that starts trying to be a second copy of the
account will be wrong the first time a fill is partial.
