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

- ⚠️ **the tools it has, by name** — see below. This is the first item because leaving it out
  is what stalls a run
- `asOf` verbatim, and the invocation's `language`
- the `task` and what you already read from `portfolio`, `mandate` and `events`
- the current sleeve budget from Brief, when one is recorded
- for `allocate`: what the two sleeve flows returned

### ⚠️ Name the tools, every time

**A flow is a fresh context.** It gets its agent file and its skill and nothing else — it does
not see this prompt, and nothing tells it that an Aumos gateway is attached to the session. A
flow that was not told goes looking: it searches the tool list, it reaches for `Bash`, and in a
run those are not in the grant, so the CLI asks the investor for permission and the flow stops
until somebody answers. Measured 2026-08-27: a flow dispatched without its tool list spent its
whole turn discovering the session and the run ended `awaiting-input` with no judgement.

So every dispatch prompt carries this list, adjusted to what `tools/list` actually offered this
run:

```
Your tools are the Aumos gateway's, already attached to this session:
  mcp__aumos__portfolio_read   mcp__aumos__thesis_read     mcp__aumos__evidence_read
  mcp__aumos__brief_read       mcp__aumos__brief_write
  mcp__aumos__manager_memory_read   mcp__aumos__manager_memory_write
  mcp__aumos__source_request   (the only way to reach a data vendor)
and this package's own server:
  mcp__evidence-gated-metrics__calculate
Do not go looking for others and do not use Bash, WebFetch or WebSearch to find them.
```

⛔ **`decision_submit` is not on that list and must not be added.** It is attached to the
session and a flow that calls it takes the run down; `hooks/guard-submit.mjs` refuses it.

⚠️ **A tool the gateway did not build is not on the list either.** `source_request` exists only
when this machine has data sources installed, so a flow told about a tool that is not there
searches for it — the same stall by another road. Name what you were actually served.

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
