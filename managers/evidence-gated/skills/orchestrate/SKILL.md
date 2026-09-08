---
name: orchestrate
description: How this manager runs its three market flows and assembles their answers into one proposal. Load before dispatching any flow.
---

# Orchestrate

## Which flows this run dispatches

**Not all of them, most runs.** `resolveWakeFlow` answers which flow opened this run.
**Hand it `armed`** — the `armed` entries of `history.recentDecisions`, flattened, exactly as
the host wrote them — and it reads the entry the host marked `fate: 'fired'` /
`review: 'this-run'`: that is the host's own record of which promise of yours came true and
woke you, and it carries the `planId` and the instant as fields. `classifyScheduledWake` takes
`armed` too and returns the same `flow` alongside its due/duplicate/late verdict, so a run
already making that call has the answer.

### Who owns which half of the schedule

| the fact | owner | where it is read |
|---|---|---|
| the recurrence a review nominally falls on | the **host**, from `manifest.schedule` | you never compute it; PLANS draws it |
| the exact instant of the next review | **this package** | `nextReviewSequence` over sourced sessions — holidays, half-days, delayed opens |
| which promise opened **this** run | the **host** | `decisions[].armed`, `fate: 'fired'` / `review: 'this-run'` → pass as `armed` |
| what stands right now | the **host** | `standingPlans` on the invocation → pass to `reconcileArmedReviews`, which reports it as a floor |
| what this instance itself promised | **this package** | `run/armed-reviews`, first person |

⛔ **None of those four host answers is permission to arm less.** Re-arm the whole sequence at
every judgement; the host folds an identical promise at arming time and an identical instant at
firing time, and a floor over live rows cannot establish that a review is already covered.

⚠️ **The prose channel is a fallback and it says so.** A watch the manager arms is
`{ subject?, intent, trigger, expiresAt? }` — no id it may choose — and the `AumosEvent` a fired
plan raises carries `eventId`, `kind`, `subject`, `occurredAt`, `detectedAt`, `summary`,
`materiality` and `evidenceIds`, with **no plan id on it**. So the wake engine composes the
summary as `<what fired> — watching for: <the intent>`, and reading the flow out of that
sentence was the only channel this package had. It still works — the judgement that armed a
review can be older than the `history.recentDecisions` window, and then the host's attribution
is genuinely absent — but it is a **legacy adapter**, and every use of it is reported.
`wake_flow_recovered_from_prose` is the adapter's own receipt: it fires when, and only when, the
flow came out of the summary. Beside it, the reason the host was not the answer —
`wake_attribution_unreadable` when no `armed` was passed (fix it by passing the field),
`wake_flow_unattributed` when it was passed and named nothing of yours — and those two fire even
when no flow comes back at all, so ⛔ you never have to infer which case you are in from what you
remember passing. Arm the `intent`
`nextReviewSequence` returns, verbatim, so that channel keeps working.

⛔ **Two things `resolveWakeFlow` will not do.** It will not read an empty `armed` as a failed
arm — past tense says nothing about what stands — and it will not pick one flow when the host
attributes the run to two (a folded instant): that answers `null` with `wake_flow_ambiguous`,
and `null` dispatches every flow, which is a superset of what fired.

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
  mcp__aumos__files_list       mcp__aumos__files_read       mcp__aumos__files_write
  mcp__aumos__files_mkdir      mcp__aumos__files_move       mcp__aumos__files_remove
                                   (your own folder — state/, scans/, proposals/)
  mcp__aumos__fund_files_list  mcp__aumos__fund_files_read  mcp__aumos__fund_files_write
  mcp__aumos__fund_files_mkdir mcp__aumos__fund_files_move  mcp__aumos__fund_files_remove
                                   (this book's shared folder — book/)
  mcp__aumos__task_start       mcp__aumos__task_get         mcp__aumos__task_cancel
                                   (the whole-universe sweep; answers land in scans/)
  mcp__aumos__source_request       (a data vendor this machine holds a key for)
  mcp__aumos__connection_request   (a broker login the investor already connected)
  mcp__aumos__source_cache_read    (stored filings for one filer, cut to this asOf)
  mcp__aumos__source_cache_refresh (collect one document — a filing for one filer by vendor id,
                                    or this fund's own daily bars: provider `prices`, document
                                    `daily`, the venue MIC as `market`, and no vendorId)
  mcp__aumos__observation_file     (file what you read on the web — URL, publication date and
                                    the source's own words verbatim — and get back the
                                    evidenceId that `evidenceIds` and `consensusRefs` require)
and this package's own server:
  mcp__evidence-gated-metrics__calculate
and, when this session was served them, the CLI's own web research:
  WebSearch                        (only when this session actually holds it)
  WebFetch                         (only when this session actually holds it)
Do not go looking for others, and do not use Bash or ToolSearch to find them.
```

⛔ **`memory_read`, `memory_write`, `brief_read` and `brief_write` were on that list and are gone**
(`untilled/aumos#743`): the two folders above replaced them, key for path. ⛔ **`thesis_read`,
`evidence_read` and `manager_memory_read`/`_write` were on it too and never were tools** — the first
two name capabilities served under other spellings (`thesis_list`/`thesis_get`,
`evidence_get`/`evidence_search`, where this session holds them), and the other two are a spelling no
build has ever had. That is the ⚠️ two paragraphs down applied to the
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

⛔ **And `observation_file` is the other half of that lane. Leaving it off shut the 20% lane
by construction** (#182, aumos#692). The web tools let a flow *read*; this one is the only route
by which a reading becomes an `evidenceId`, and `variantViewCheck`'s `consensusRefs` requirement
takes an input that exists on the web and in no filing and on no exchange feed. So a flow told
about `WebSearch` and not about this tool can find the consensus figure and can never cite it —
and by `agents/*.md`'s own rule it reports the absence rather than going to look, which is
exactly what happened. Measured 2026-09-07, run `run_996380fbdd9a41a5bb3d74f3eca761a2`: the
`us-sleeve` flow reported `observation_file_not_granted` in `uncertainty` and submitted **zero**
filings rather than invent an excerpt — the right call — and `effectivePositionCap` read back
`variantView.satisfied: []`, `missing: ["thesisComplete","variantView","consensusRefs",
"challengeCleared"]`, `mainLaneOpen: false`, declared cap **0.20 sized at 0.01**. ⚠️ This is not
the web tools' rule read again: those are the CLI's and you say whether the session holds them,
while this one is the gateway's and `tools/list` answers for it — name it when it is there, and
when it is not, say so, because a flow that is not told is a flow whose whole market runs under
the control arm. ⛔ It is not a licence either: the excerpt is the source's own words or the row
is worthless, and `skills/{kr,us}-sleeve/SKILL.md` step 10 carries the rest of the contract.

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
Declare this sleeve's universe for this run before any sweep — call researchUniverse for
the curated seed, verify current listing eligibility, add persisted research extensions, and pass both to
`coverage` (`scannerUniverses`, `extensions`) and to `harnessAudit` (`universe`).
Feed the fundamental branch before running it, in this order (#146): the registry that gives the
vendor's own filer id (open-dart /api/corpCode.xml for corp_code, sec-edgar
/files/company_tickers.json for the CIK) → mapCorporationCodes → fundamentalsPlan →
source_cache_read / source_cache_refresh → dartVendorStatus on every OpenDART response →
catalystRegister → radarCandidates → radarFeedDiagnosis → upsideRadar({candidates, feed}). If the registry cannot be read, report corp_code_unmapped_symbols, let radarFeedDiagnosis name the
registry stage and run the price branch — never reconstruct it by walking disclosure pages. The registry call is the
one no run has ever made; without it nothing fetched can be addressed to a filer — on **both**
sides (#179): sec-edgar companyfacts is the CIK file name
(/api/xbrl/companyfacts/CIK{10-digit zero-padded}.json), and the ticker address answers 404.
The same statements feed sizing (#160): for any name that reaches a thesis, call thesisGapSources
(is an open expectedUpsidePct / fairValueRange gap unfetched, or does this instrument have no filer
at all?) and thesisValuation (fairValueRange and expectedUpsidePct off the bear/base/bull targets,
drivers checked against the filings). Without them a complete variant view still reads
missing: ["thesisComplete"] and the investor's declared 20% cap operates at 1%.
Collect dated filings, catalysts and events, then run both the price-pattern sweep and upsideRadar.
⚠️ Catalysts and events had no producer until #169, so a flow that is not told to build them hands
the radar an empty axis and the two lenses that need no price fall report it as a finding about the
company — measured: post-event-continuation 0 of 83, inflection excluding the one name that cleared
every filing test. catalystRegister is that producer, every row carries the evidenceIds the reading
was filed under, and its nextState is persisted to research/catalyst-window with numeric instants.
Do all of that in your own context with calculate — do not open subagents to batch the roster, to
relay bars, or to walk listing pages; that is refused and the run is charged for it either way.
Collect the price series before you sweep, and in that order: call source_cache_refresh with
provider `prices`, document `daily`, the venue MIC as market (XKRX/XNAS/XNYS, never kr/us) and no
vendorId, for every name on the roster. task_start collects nothing — it reads what this fund
already stores — so a roster prepared first answers scanner_history_insufficient on every name and
that is blindness, not an empty market. Re-running it over the same closed bar reaches no vendor at
all, so a previous run having collected them is not a reason to skip it.
Then run the whole-universe price sweep through task_start over this package's declared recipes
(roster-scan, opportunity-metrics), with each item id the store coordinate MIC:symbol and
outputPath scans/<asOf date>/<recipeId>; then task_get until it settles, then files_read on
<outputPath>/<itemId>.json for the answers. The bars stay in the host on every step and never
become tool arguments. Read the answer files — a settled run whose files nobody opened is not a
prepared roster. Report sourced, evaluated and unprepared as three separate counts and never their
sum; they are derived from the answers' own sourced field, not from the host's item counts. Treat
unprepared as blindness with the names attached and source_cache_refresh as its fix — never as a
market that offered nothing.
scanner_history_insufficient has three causes and only one is a finding: not collected, no price
source for that venue (the investor's control, reported once per venue), or a name that genuinely
has too little history. Quote barsRead/barsUsed rather than the word. If the task tools or the file
tools were not named in your grant, say so in uncertainty and do not reopen the relay path.
skills/candidate-research/SKILL.md owns the procedure.
Scan holdings' news/disclosures through granted web and installed filing sources every cycle.
Return researchActivity ({source, granted, attempts, succeeded}), each radar lane's exclusions and
starvation with its feedStage/feedCause, and the feed verdict — fed-and-evaluated,
fed-and-genuinely-empty, partially-fed or never-fed. fed-and-genuinely-empty and never-fed produce
an identical empty list and mean opposite things; do not report one as the other. Report
partially-fed with its counts (feedCoverage: fed of, unfed) and never as either of them. Persist the roster/Evidence references with researchState. If the roster cannot
be read or eligibility cannot be checked, report that scope gap in uncertainty; never substitute holdings.
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

### ⚠️ Fill `dislocation` before you read `themeRadarDue`, and fill it from readings

`themeRadarDue` takes a `dislocation` flag that runs the radar regardless of staleness, and **for the
life of this port nothing set it** (#227) — the override was published, documented and `false` on
every run. Its producer is `dislocationSignal`, and it is yours to call in pre-flight: hand it what
`validateMacro` returned, and `regimeTag`'s answer beside it, then pass `dislocated` into
`themeRadarDue` as `dislocation`.

⛔ **It is a reading, not an adjective.** The two axes are an index down 5% or more from its own
window high and a VIX spike, both from dated rows `validateMacro` retained; a market nobody
observed comes back `unevaluated` with the override off, which is not the same as a calm one and
the answer says which it is. A regime tag is carried and never decides — `risk-off` can stand for
months and this question is about weeks.

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

Collect each flow's `researchActivity` and radar lane coverage. Rerun `harnessAudit` with the
actual route activity before submitting; carry `lane_not_queried`, `lane_query_failed`,
`audit_research_unverified` and `radar_lane_starved` into the final uncertainty where applicable.

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
`discoveryCapacity` over this run's `themeRadarDue` and `coverage` answers before you assemble —
passing `run/theme-radar-last`'s `boundary` in and writing its `nextBoundary` back, which is how the
hardened-boundary streak is counted at all (#227):
when both branches were shut, the proposal carries the code `discovery_lane_dark` verbatim in one
`uncertainty` entry, and `keyReasons` says the set is empty because nothing was searched rather
than because nothing qualified. Passing the assembled `uncertainty` back to `discoveryCapacity`
is what makes that a refusal instead of a habit.

⛔ **A flow never calls `decision_submit`.** `hooks/hooks.json` refuses it, and the refusal is
the second line of defence: the first is that the flows are told not to, here and in each of
their own skills.

## The delegation budget

⛔ **One tier, three flows, and it is enforced rather than described.** `hooks/guard-budget.mjs`
runs on every `PreToolUse` and refuses a dispatch it does not recognise, with the reason on stderr
and a code to carry verbatim into `uncertainty`:

| limit | code | why that number |
|---|---|---|
| a dispatch made from **inside a flow** | `delegation_depth_exceeded` | the package declares one tier: `agents/` holds three files and *"nothing here fans out"* is this document's own sentence. There is no second tier to budget for, so a dispatch from inside one is undeclared work by construction |
| a `subagent_type` outside `agents/` | `delegation_flow_undeclared` | a worker with no agent file has no skill, no market and no rule about what it may not do. The roster is read out of `agents/`, so it moves when the package does |
| more than **2 dispatches of one flow**, or **6 in a run** | `delegation_budget_exhausted` | 2 is the one reason this document gives for dispatching a flow twice — the stale-sleeve fallback above. 6 is that across the three flows, and it leaves every documented dispatch reachable: a manual run's three, plus one recovery each |

⚠️ **This was measured before it was written** (`untilled/aumos-catalogue#209`). One run opened **29
unique subagents** — one `kr-sleeve` and 28 `general-purpose`, three tiers deep — spent ~1.91M
characters of tool arguments on bar arrays one model had retyped so another could hand them back,
and **submitted no judgement at all**. The topology in this document was correct throughout. It was
just not enforced, and a rule this package only states is a rule the next context talks itself out
of.

⛔ **Mechanical work is calculated, never delegated.** The sweep is
`mcp__evidence-gated-metrics__calculate`, one call per operation over a roster. Do not open a worker
to convert or relay price arrays, to walk a vendor's listing pages, or to split a roster into
batches — and do not write a dispatch prompt that asks a flow to do any of those either.

⚠️ **When a limit stops the run, leave a checkpoint rather than a silence.** Persist the roster that
was reviewed with `researchState` to `coverage/research-index` — the key
`skills/memory-contract/SKILL.md` already owns, and ⛔ not a new one — name the unreviewed scope and
the refusal code in `uncertainty`, and submit. A `WAIT` whose data was never prepared is a different
answer from a `WAIT` where the gates ran and nothing qualified, and `PROMPT.md`'s invariant 5 asks
for the two to be told apart.
