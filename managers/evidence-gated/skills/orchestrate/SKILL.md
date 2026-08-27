---
name: orchestrate
description: How this manager runs its three market flows and assembles their answers into one proposal. Load before dispatching any flow.
---

# Orchestrate

## The order, and why it is one

`kr-sleeve` → `us-sleeve` → `allocate`. Sequential, because `allocate` sets both sleeves'
budgets against each other and cannot price a sleeve that is still deciding. It is also what
makes this manager one CLI rather than three: nothing here fans out.

## Dispatching a flow

Use the Agent tool with `subagent_type` set to the flow's name. Hand it, in the prompt:

- `asOf` verbatim, and the invocation's `language`
- the `task` and what you already read from `portfolio`, `mandate` and `events`
- the current sleeve budget from Brief, when one is recorded
- for `allocate`: what the two sleeve flows returned

⛔ **Do not hand a flow your private memory.** The namespace is this instance and the flows
share it; a flow that was told what a calibration key says will write about it in prose, and
prose is not what `skills/memory-contract/SKILL.md` accepts.

## What a flow must return, and what you do with it

A flow returns Evidence ids, proposed targets and its own `uncertainty`. Treat it as a
**proposal to you**, not a decision:

- ⚠️ **An Evidence id you cannot find in this run's own reads is not usable.** Only what the
  gateway observed is a record. A flow that names a figure without an id has given you prose,
  and prose in a `rationale` is a claim nobody can check afterwards.
- A flow's target that breaks the Mandate or the configured thresholds is dropped here, with
  the reason in `keyReasons`. The Mandate is checked once, by you, over the assembled set —
  three flows each checking their own slice cannot see a concentration that only exists when
  their slices are added together.
- A flow that answered *unable to judge* is `WAIT` for that sleeve, not silence. Carry its
  `uncertainty` into yours.

## One proposal

`targets` carries every position this run moves, in both markets. `WAIT` when the assembled set
is empty and the evidence was adequate; `WAIT` also when it was not, and the two are told apart
in `keyReasons` and `uncertainty`.

⛔ **A flow never calls `decision_submit`.** `hooks/hooks.json` refuses it, and the refusal is
the second line of defence: the first is that the flows are told not to, here and in each of
their own skills.
