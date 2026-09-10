---
name: fmr-position-review
description: "The review branch for a position this fund already holds — a broken invalidation, a reached target, an elapsed deadline, or a business finding that changed. Read this whenever Stage 1 fires, before any new candidate is looked at."
---

# What a held position is owed

A mean-reversion thesis is a clock. It was opened with a target, a set of conditions that would
make it wrong, and a date by which the recovery was expected — and the value of writing those
in advance is entirely in what happens when one of them fires.

`classifyCase` reaches this branch whenever `position.held` is `true`, and it asks in one order:
invalidation, then target, then deadline, then the business.

## ⑴ An invalidation condition has been met → `invalidated-re-adjudicate`

The verdict is `RE_ADJUDICATE` and the actions left open are `RESIZE` and `SELL`. **`WAIT` and
`WATCH` are not among them.**

That is enforcement rather than advice, and it exists because of one specific move: a losing
mean-reversion position being reclassified as a long-term value holding, which is the version
of the same position that has no stop and no deadline in it. Nothing about the company changed
when that sentence was written; what changed is which rules apply.

If you genuinely believe the thesis survives its own invalidation condition, that is a
**re-judgement** and it is written as one: what you knew then, what you know now, what the new
invalidation and the new deadline are, and why the old ones were wrong. A re-judgement that
cannot name what it got wrong is the reclassification wearing a longer paragraph.

## ⑵ The recovery target has been reached → `target-reached-trim`

Stage out. This methodology sells into the recovery in pieces, for a reason that is not
symmetry: the target range was derived, not measured, and one print inside it is weaker
evidence than the range implies.

Record the trim through `stagedPlan` with a stage whose `kind` is `trim` and whose satisfied
condition is `target-reached`. The ledger is what stops a second run from trimming the same
rung twice.

⚠️ **Reaching the target is not automatically the end of the thesis.** What it ends is the part
of the position the reversion argument was sized for. If you want to hold the remainder on a
different argument, that is a **new thesis** with its own target, its own invalidation and its
own deadline — not this one continued at a higher price.

## ⑶ The deadline passed with no recovery → `deadline-elapsed-re-adjudicate`

Also `RE_ADJUDICATE`, and this is the subtle one.

**The absence of the move is not a refutation.** Nothing you claimed has been shown false; the
market has simply not agreed within the time you allowed. That is why the code is `null` rather
than `thesis_refuted` — #254's distinction, and it matters because recording a wait as a
refutation teaches the decision ledger something that did not happen.

It is also **not** a reason to keep waiting silently. Two honest answers exist and a third does
not:

- end it, and record that the wait ran out;
- restate it, with a new deadline, and say what has changed that justifies more time;
- ⛔ leave it, review it next month, and never write down that the deadline passed.

## ⑷ The business finding changed → `structural-earnings-damage`

A filing that turns a one-off charge into a trend refutes the thesis, and this is the ordinary
way this methodology loses: not with a crash, but with the second quarter of the same charge.
Re-run `fmr-damage-separation` against the new filing rather than against your memory of the
old finding.

## The rung that is still open

A held position often has staged entries that have not filled. When any of ⑴–⑷ fires, the
remaining stages are part of what is being re-judged: a plan whose thesis has been refuted does
not keep a live rung, and `stagedPlan` will refuse the stage anyway (`stage_thesis_not_confirmed`,
`stage_stabilisation_not_holding`). Say in the proposal what happened to the unfilled rungs —
an expiry the investor never sees is a plan they think is still running.

## What the proposal has to say

Beyond the ordinary rationale: which of the four fired, the condition **as it was written in
advance** quoted verbatim, the reading that met it, and what changed about the thesis. A review
that describes the current price without quoting the condition it was measured against is a
review of the price, not of the thesis.
