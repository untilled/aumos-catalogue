---
name: orchestrate
description: How this manager runs its three market flows and assembles their answers into one proposal. Load before dispatching any flow.
---

# Orchestrate

## Which flows this run dispatches

**Not all of them, most runs.** `resolveWakeFlow` reads the `summary` of the `plan-trigger`
event that woke this run and returns the flow it was armed for; `classifyScheduledWake` returns
the same `flow` alongside its due/duplicate/late verdict, so a run already making that call has
the answer.

⚠️ **The flow rides in the watch's `intent`, because nothing else survives the trip.** A watch
the manager arms is `{ subject?, intent, trigger, expiresAt? }` — no id it may choose — and the
`AumosEvent` a fired plan raises carries `eventId`, `kind`, `subject`, `occurredAt`,
`detectedAt`, `summary`, `materiality` and `evidenceIds`, with no plan id on it. The wake engine
composes the summary as `<what fired> — watching for: <the intent>`, which is the one place the
manager's own words come back. Arm the intent `nextReviewSequence` returns and the marker is
already in it.

| the wake's `flow` | dispatch | why |
|---|---|---|
| `kr-sleeve` | `kr-sleeve` | armed at the XKRX close plus buffer — Korea's bar has just closed and nothing else has |
| `us-sleeve` | `us-sleeve` | armed at the actual XNYS/XNAS close plus buffer |
| `allocate` | `allocate` | armed at 08:00 Asia/Seoul: after both closes, **before the Korean open**. Both sleeves have already run at their own closes and written their conclusions to Brief |
| none | all three, in order | a manual run, an event review or an earnings checkpoint carries no flow, and running everything is the honest answer to "I do not know what woke me" |

⚠️ **`allocate` has one fallback and it is not optional.** Before pricing the sleeves against
each other, check each sleeve's Brief conclusion against that market's most recent close. A
conclusion older than the close means that sleeve's wake was missed or failed, and `allocate`
would otherwise set a budget on a sleeve nobody looked at. Dispatch the stale sleeve first,
then allocate, and name the gap in `uncertainty`. Say which sleeve and how stale — a silent
recovery is how a missed wake becomes a habit.

## The order, and why it is one

When more than one flow runs: `kr-sleeve` → `us-sleeve` → `allocate`. Sequential, because
`allocate` sets both sleeves' budgets against each other and cannot price a sleeve that is
still deciding. It is also what makes this manager one CLI rather than three: nothing here
fans out.

⚠️ **This used to be every run, and that was the defect.** The three wakes were minted with a
`flow` apiece and nothing read it, so each of them ran all three flows: the 05:45 KST US wake
also judged Korea on yesterday's bar, the 16:00 KST Korean wake also judged the US before its
market opened, and `allocate` ran three times a day when only one of those three sat where it
was meant to sit. Three times the work, and each sleeve judged twice on data it had already
read. (#87)

## What a single-sleeve run may propose

⛔ **Not a cross-market `REBALANCE`.** A sleeve flow that never saw the other sleeve cannot
claim the shape of the whole book. A `kr-sleeve` wake may reach:

- `BUY`, `SELL` or `RESIZE` inside that sleeve's **recorded budget** — the one Brief carries
  from the last `allocate`, not one this run invents;
- `REBALANCE` **within one market**, when two or more positions in that sleeve move together
  and the sleeve total does not change;
- `WAIT` or `WATCH`.

Repairing the sleeve split itself, the book's cash, FX, or a concentration that only exists
when both sleeves are added together is `allocate`'s. A single-sleeve run that finds one says
so in `uncertainty` and leaves it for the 08:00 wake — which is hours away, not days, and that
is what the schedule is for.

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

`targets` carries every position this run moves — in both markets when both sleeves ran, in one
when this was a single-sleeve wake. `WAIT` when the assembled set is empty and the evidence was
adequate; `WAIT` also when it was not, and the two are told apart in `keyReasons` and
`uncertainty`.

⛔ **A flow never calls `decision_submit`.** `hooks/hooks.json` refuses it, and the refusal is
the second line of defence: the first is that the flows are told not to, here and in each of
their own skills.
