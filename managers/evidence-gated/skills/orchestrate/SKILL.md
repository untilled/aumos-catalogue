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

## A wake always ends in a submission

⛔ **There is no "ran and said nothing".** `ManagerRunOutcomeKind` is `decided`,
`invalid-proposal`, `no-proposal`, `refused`, `unsound` — and `no-proposal` means no JSON could
be recovered at all, a failure row in the Forward Track Record. A run that deliberately submits
nothing is scored the same as one that crashed.

So a run woken by a touched price level, where entry quality still needs a bar that has closed,
**submits a `WAIT`** — one whose `keyReasons` say it was woken by that level, what the live
reading was, that the confirmation is pending on a closed bar, and what it re-armed. That is
invariant 5's second sentence applied to this case: *"unable to judge" is a reason for `WAIT`*,
and it is told apart from the `WAIT` that means no change is needed.

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
- ⚠️ **the instruction to declare the sleeve's universe and run the discovery sweep** — in those
  words, every dispatch, whatever this wake was about. See below
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
  mcp__aumos__portfolio_read
  mcp__aumos__brief_read       mcp__aumos__brief_write
  mcp__aumos__memory_read      mcp__aumos__memory_write
  mcp__aumos__source_request       (a data vendor this machine holds a key for)
  mcp__aumos__connection_request   (a broker login the investor already connected)
and this package's own server:
  mcp__evidence-gated-metrics__calculate
and, when this session was served them, the CLI's own web research:
  WebSearch                        (only when this session actually holds it)
  WebFetch                         (only when this session actually holds it)
Do not go looking for others, and do not use Bash or ToolSearch to find them.
```

⛔ **`thesis_read`, `evidence_read` and `manager_memory_read`/`_write` were on that list and are
not tools.** The first two name capabilities the AMP vocabulary declares and that `grant.ts` maps to
an empty tool list, so no build has ever served them; the other two are a spelling no build has had —
private memory is `memory_read`/`memory_write`. That is the ⚠️ two paragraphs down applied to the
literal block rather than only to the vendors: a flow told about a tool nobody served searches for
it, which is the stall this whole section exists to prevent. Measured 2026-09-01: a run reported the
gap itself, having been told to call four names the session did not hold.

⛔ **`decision_submit` is not on that list and must not be added.** It is attached to the
session and a flow that calls it takes the run down; `hooks/guard-submit.mjs` refuses it.

⚠️ **A tool the gateway did not build is not on the list either.** `source_request` exists only
when this fund has data sources selected, and `connection_request` only when it holds a broker
login — so a flow told about a tool that is not there searches for it, the same stall by another
road. Name what you were actually served.

⚠️ **The web tools are the same rule read the other way, and leaving them off closed the only
lane that finds anything.** `WebSearch` and `WebFetch` are not the gateway's — the vendor CLI
attaches them to the session, so `tools/list` does not answer for them and **you** do: name them
when you hold them and leave the two lines out when you do not. They were missing from this
block while `agents/*.md` told a flow that a name it was not given is an absence to report, and
`skills/theme-radar/SKILL.md` forbids a silent fallback — so the flow did the only thing the
three documents left it: it reported *no web lane* and produced no forward thesis. Measured
2026-09-04, run `run_ba37a8f6907a49c3a805a4ce3ee10ec6`: the session held **both** tools.
⛔ That is not a licence to search. Web research is a research instrument, never a way to
discover tools — `Bash` and `ToolSearch` stay out of a flow's hands for the reason measured
above, and a flow whose prompt does not name a web tool still reports its absence.

⚠️ **The two are not interchangeable and the difference is the credential.** `source_request`
reaches a vendor this machine has a key filed for; `connection_request` reaches one the investor
**connected**, and the manager is handed nothing. Telling a flow to fetch prices through the first
one is telling it to use a source this fund no longer has.

⛔ **And a vendor missing from one list is not a missing vendor** — it is a vendor behind the other
tool. `PROMPT.md` §2 now loads this paragraph rather than only citing it at dispatch, because the
run that concluded the Toss lane was gone had not reached dispatch yet.

⛔ **Do not hand a flow your private memory.** The namespace is this instance and the flows
share it; a flow that was told what a calibration key says will write about it in prose, and
prose is not what `skills/memory-contract/SKILL.md` accepts.

### ⚠️ Say the discovery sweep out loud, on every dispatch

**This list was written on the criterion *omit it and the run stops*, and discovery is the one
item that fails that test in the other direction.** Leave out the tool list and the flow stalls on
a permission prompt — loud, and fixed the day it was measured. Leave out discovery and nothing
happens at all: the flow watches the holdings, prices the sleeve, hands back a tidy answer, and
the run ends in a `WAIT` with no candidate in it and nothing anywhere saying a candidate was never
looked for. Measured over six runs of one book (#140): **no universe declared, no candidate
generated, three holdings all inherited, and no output that would let an investor see it.** A
silent omission needs stating *more* than a loud one, not less.

So every dispatch prompt carries this, adjusted to the flow's markets:

```
Declare this sleeve's universe for this run before any sweep — enumerate the market from
the vendor listing route, screen it, add the theme-radar extensions, and pass both to
`coverage` (`scannerUniverses`, `extensions`) and to `harnessAudit` (`universe`).
Then run the price-pattern sweep over it. If you could not enumerate, you have no
universe: say so in `uncertainty` and never substitute the holdings for one.
```

⚠️ **A narrow `task` is not a narrow mandate, and this is where the failure was yours.** The run
that measured this was dispatched with a prompt built around the holdings and a standing RESIZE,
and both flows did exactly what they were told. The flow skills now carry the step themselves —
`kr-sleeve` and `us-sleeve` each own a section for it, so the pointer is no longer the only thing
standing between a narrow prompt and a run that finds nothing. Say it here as well: two documents
saying it is what makes it survive one of them being read quickly.

⛔ **Do not decide on the flow's behalf that today is not a discovery day.** `themeRadarDue`
answers for the forward branch and only for it; the mechanical sweep has no interval and is due
every run. A dispatch that drops discovery because the radar is not due has shut both branches by
hand — which is precisely the `discovery_lane_dark` state `PROMPT.md` §1b makes you report.

### ⚠️ Settle the web lane before you dispatch, not after

`themeRadarDue` is answered in pre-flight, and the lane theme radar needs is answered by you,
here, in the same breath — **before** a flow is dispatched. `laneCoverage` already computes what
a missing source closes; pass it the lane, `intent: 'theme-radar'`, and a `sources` map whose
`web` entry says `available` when this session holds `WebSearch`/`WebFetch` and is left out when
it does not. A `blocked` verdict is a fact you have before the dispatch prompt is written, and
it belongs in that prompt and in `uncertainty` — not in a flow's answer an hour later.

⛔ **`sources.web` is your observation and nothing else can make it.** The gateway builds
`source_request` and `connection_request`, and a run can see what it built; it does not build the
web tools, so no operation in `lib/` can be asked whether this session has them. Do not infer the
lane from a config key, from `themeRadarDue`, or from the fact that a previous run had it — say
what you were served, the same sentence the tool block already asks of you.

⚠️ **What this changes is when the run finds out, not what it may claim.** A blocked web lane is
still a blocked theme radar: no forward thesis, the lane named as missing, and `run/theme-radar-last`
recorded either way. `skills/theme-radar/SKILL.md` owns that refusal and this section does not
restate it. What it removes is the turn spent discovering it — measured 2026-09-04, a flow spent
its whole dispatch establishing an absence the orchestrator could have stated before writing the
prompt, and the run's only discovery lane closed for it.

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

⛔ **An empty set with no discovery behind it is the second kind, and it says so by name.** Call
`discoveryCapacity` over this run's `themeRadarDue` and `coverage` answers before you assemble:
when both branches were shut, the proposal carries the code `discovery_lane_dark` verbatim in one
`uncertainty` entry, and `keyReasons` says the set is empty because nothing was searched rather
than because nothing qualified. Passing the assembled `uncertainty` back to `discoveryCapacity`
is what makes that a refusal instead of a habit.

⛔ **A flow never calls `decision_submit`.** `hooks/hooks.json` refuses it, and the refusal is
the second line of defence: the first is that the flows are told not to, here and in each of
their own skills.
