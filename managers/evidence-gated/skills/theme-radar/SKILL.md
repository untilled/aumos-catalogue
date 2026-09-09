---
name: theme-radar
description: Forward research — examine at least one axis outside the declared universe every run, find the sector or theme that will lead in three to six months, register it as a paper thesis call, and refuse the ones that are already consensus.
---

# Theme radar

This is the layer the rest of the package exists to discipline. Every other gate here makes an idea
survive scrutiny; none of them produces one. A scanner ranks what is already cheap or already
strong, which means it is a report on a move that has happened. Mechanical relative strength
confirmed the 2026 semiconductor leadership only after the leaders had run 44% and 73%, and the
pullback rule never caught the name that went up 567% at all. The claim that would have found it —
HBM capacity sold out, so the pure-play beneficiary earns more than the market has priced — was
writable from public information months earlier. Writing that claim is what this skill is for.

Run it when `themeRadarDue` says the interval has elapsed or a dislocation shortened it, and record
the run under `run/theme-radar-last` whether or not it produced anything.

⚠️ **The interval is measured from the last `thesis_call`, not from the last run** (#227). A run that
looked and found nothing leaves the radar due, which is the whole point: the pressure stays on until
something comes out. So the record carries **two** instants and they are not interchangeable —
`lastThesisCallAt`, which decides, and `lastRunAt`, which is the observation separating *this has
never run* from *this has run six times and produced nothing*. Write `lastThesisCallAt: null` when
this run produced no call; ⛔ leaving the field out is the pre-0.6.0 shape and is answered
`theme_radar_clock_unstated`, still due.

⚠️ **A dislocation week runs it regardless of staleness**, and `dislocationSignal` is what says so —
an index down 5% or more from the window's own high, or a VIX spike, read off the rows
`validateMacro` retained. ⛔ Never a run's own reading of the mood.

## Inputs

- `sectorStrength.researchQueue` — where to look. It is a list of questions, not of candidates: a
  sector is queued because it leads, jumped rank or sits at a 200-day high, and none of those is a
  reason to own anything.

### How the queue is produced, and why it is not one call

⛔ **You never carry the lane's bars.** `sectorStrength` ranks every sector against one benchmark, so
its inputs were one price series per sector plus the benchmark's — and gathering those is exactly the
relay `PROMPT.md` §The delegation budget and `skills/orchestrate/SKILL.md` forbid. Both sleeves of one
run said so and skipped the call, which left this skill with no ranking and made the axis choice
arbitrary (`untilled/aumos-catalogue#247`). The series stay in the host instead, in four steps:

1. **Name the lane's proxies.** The benchmark is `config.benchmarks.koreanEquity` /
   `config.benchmarks.usEquity`; each sector's proxy is the ETF or bellwether the investor's roster
   carries for it. ⛔ Never a list from model knowledge — a sector with no proxy this run can name is
   left out and comes back as `status: 'unverified'`, which is the honest answer and not a zero.
2. **Collect their series** with `source_cache_refresh` on `prices`/`daily`, the same call the roster
   sweep makes: provider `prices`, document `daily`, `market` the venue MIC, ⛔ no `vendorId`.
3. **Sweep them** with `task_start` over the **`sector-series`** recipe — one item per symbol, each
   item id the store coordinate — `kr:<symbol>` / `us:<symbol>`, the research market and ⛔ never the
   venue MIC, which is the refresh's argument and not the store's key — and `outputPath`
   `scans/<asOf date>/sector-series`.
   Poll `task_get`, then `files_read` each `<outputPath>/<itemId>.json`. What comes back per name is a
   page of numbers and no series.
4. **Fold once.** One `sectorStrength` call: `benchmark` is the benchmark's row, `sectors[].series` is
   each sector's row, and `leaders[].series` is the row of any leader you want a baseline signal from.
   ⚠️ The rank moves need `previousRanks` from the last run, so carry them forward.

⚠️ **If you pass `weights`, pass the same ones to the recipe** (`parameters.weights`): a row carries
one return per weighted horizon, and a horizon nobody reduced is reported
`sector_series_period_unreduced` rather than scored as an outperformance of zero.

⚠️ **A lane you could not sweep is a lane you did not read.** Say so in `uncertainty` and take the
axis outside the universe anyway — the obligation below is to look, and it does not wait on a ranking.
- The events in the invocation, and the earnings and policy calendar reachable through the source
  contract.
- Web research. **A silent fallback is forbidden.** If the web lane is unavailable, this run
  produces no forward thesis and says the lane was missing — an unresearched theme is not a
  cautious one, it is an unknown one asserted as safe.

## The question

For each queued area: what leads in three to six months, and what is the evidence that is *not*
already consensus? Supply and demand imbalance, capacity cycles, a policy inflection, the
second-order beneficiary nobody has connected yet — and how much of it the current price already
carries.

## At least one axis outside the universe, every run

**The mechanical scanners look inside the declared universe and nowhere else. This skill is the only
way anything else gets in — so every run of it deliberately examines at least one axis beyond that
boundary, and says which one it took.** This is a requirement, not an encouragement: it was decided
as one in the methodology this is ported from (2026-07-24, option B, over the alternative of
widening the screen), and it arrived here as permission — *"a theme radar **may** add candidates"* —
which is a sentence a run satisfies by doing nothing.

An axis is a direction to look in, named before you look: a supply chain the universe screens out by
size or by listing venue, a market the sleeve does not usually price, a policy or capacity cycle
whose beneficiary is a second-order name nobody has connected, a sector at the edge of the screen's
filters. `sectorStrength.researchQueue` cannot supply one — it ranks what is already in the
universe, which is the boundary this requirement exists to cross.

⚠️ **The obligation is to look, never to find.** Zero forward theses is still a normal outcome and a
better one than a narrative written to fill the slot; what a run may not report is that it looked
everywhere it was asked to when it only looked inside. Name the axis and the outcome in the run
record whether or not anything survived it — an examined axis that produced nothing is a fact about
this market, and it is the only fact that distinguishes a radar that ran from one that idled.

⚠️ **A cleared `thesis_call` from outside becomes part of the universe from then on**, through
`extensions` in `coverage` and `coverage/universe-state`. Otherwise the name is researched once,
never swept again, and the boundary closes behind it. The original methodology's own record of this
is the name it found that way and would have lost.

⚠️ **And a boundary that stands still is counted rather than left to be noticed** (#227).
`discoveryCapacity` carries the streak of consecutive runs in which `extensions` gained nothing —
with the count of those in which this branch was actually open beside it, because *the radar was
never due* and *the radar ran every time and found nothing* are opposite findings — and reports
`discovery_boundary_hardened` at three. ⛔ It blocks nothing: an honest radar can return zero for a
long time. What it removes is the state this book was in for ten runs, where the boundary had not
moved once and no output said so.

## What a forward thesis must contain

**Aim for two to three conviction calls per run, and never fill the quota.** Both halves of that
sentence come from the methodology this is ported from and neither survives without the other; the
aim was dropped on the way across and this section read as a ceiling of three (#227).

The aim is arithmetic rather than enthusiasm. `promotionGate` needs **30 closed samples across 10
independent date clusters** before a lens may be promoted, and the paper track is the only path to
it: at one call a week that sample arrives so far out that every size decision this book makes in
the meantime is made under `insufficient` — a shortage designed in rather than measured. The source
ran the same calculation against its own September deadline and raised the cadence for it
(2026-07-15).

⛔ **And a call written to reach a number is worse than no call.** Zero is a normal outcome and
**valid data** — the source says so in the same breath as the aim — while a narrative composed to
fill a slot enters the cohort that unlocks size, where nothing afterwards can tell it from one that
was found. So the aim governs how hard you look and the gates below govern what survives: log the
run, name the axis, and let the number be what it is.

Each call carries, and `validateThesis` refuses it without them:

| element | why it is required |
|---|---|
| a falsifiable core claim | "HBM capacity sells out and shows up in second-half earnings" can be wrong on a date. "AI is big" cannot. |
| checkpoint dates and `horizonEnd` | a claim with no clock is never scored, and an unscored claim never teaches anything |
| invalidation conditions | what would make you drop it, decided before you are attached to it |
| a variant view against named consensus refs | if it is what everyone already thinks, the price has it. Being right and being early are different, and only the second one pays |
| expected upside and a fair value range | a prediction you did not write down is one you cannot be wrong about |

## The two refusals

**A thesis is registered as a paper call before it is anything else.** Call `paperAdmission` with the
challenge verdict; a cleared one becomes `thesis_call`, a conditional one `thesis_watch`, an
unresolved high risk `thesis_rejected`. The verdict decides the setup and you do not get to choose —
logging a conditional idea as a call would put an unchallenged claim into the cohort that unlocks
size. Only the call pays the full evidence cost, and a promote is refused outright when the price
history is stale, because a forward record started from a stale price measures the pipeline rather
than the idea.

Admission returns an `openWindow` row. **Carry every one of them into `signalPaper`'s `admissions`
in §5 of the run skeleton**, and write the `nextState` it returns back to `learning/paper-cohorts`.
That is the whole of registration and there is no other step.

⛔ **It is not "append it to the key" — that sentence stood here and nothing appended anything.**
`signalPaper` computed `nextState.openWindows` as *what was carried, minus what matured*, so a
window admitted this run was dropped between two tool calls and the track stayed at zero rows
(measured, run `run_f1560197652549e18bf7c1420f83983b`). The merge is now inside `signalPaper` —
it refuses a duplicate symbol/setup, a missing rule version and a `signalAt` after `asOf`, and none
of those judgements is a run's to make by hand.

This is what makes the layer measurable: the team's calls are scored against the index *and* against
the mechanical baseline signals `sectorStrength` logs, so "our research beats a dumb momentum bot" is
a number rather than a belief. Until that number exists, the team's edge is a hypothesis exactly as
the bot's is.

**So register the bot too, in the same run.** Each `baselineSignals` row carries its own
`ruleVersion` — the version of `baselineSetup`, which is the rule, and not one a run may choose —
and its `signalAt`. Pass the row to `paperAdmission` as the `thesis`, with its own `setup`, and its
`openWindow` joins the same `admissions` list. ⛔ The cohorts do not merge and the control arm is
never promoted: `verdictReport` refuses to render a verdict on anything but `llm-research`, so a
strong baseline reads "our bar is high" and can never read "do more of this".

**Nothing reaches the watchlist before `thesis-challenge` clears it.** A forward claim is the most
attractive kind of wrong: it is unfalsified precisely because it has not happened yet. Paper
registration is unconditional; promotion is not. Load `skills/thesis-challenge/SKILL.md` and let it
run against the claim before the candidate is anywhere an allocation decision can see it.

## What this skill does not do

It does not size, propose or buy. A cleared forward thesis enters the same path every other
candidate does — `candidate-research`, `evidence-gates`, `sizing-and-concentration`, and the
investor's per-order approval. What changes here is only where the idea came from.
