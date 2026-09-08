---
name: evidence-gates
description: Classify decision evidence maturity and decide whether a lens may support observation, a controlled experiment, review, or promoted sizing.
---

# Evidence gates

Use this skill for every `BUY`, risk-increasing `RESIZE`, or `REBALANCE` that adds exposure. Safety
controls and a scanner hit do not establish edge.

## Unit of evidence

A sample is a closed Decision with a forward outcome, a named benchmark over the same horizon, and
enough provenance to reproduce the lens classification. Do not backfill legacy Trading Harness
history into Aumos Forward Track Record. Open decisions, repeated runs on one still-open idea,
synthetic backtests and five names found during one shock are not five independent samples.

⚠️ **A staged entry is one sample.** A name entered in three tranches was one idea decided once, so
`entryTranchePlan` returns `sampleCount: 1` and `sampleKind` says per plan and never per tranche.
Counting the rungs would manufacture evidence out of the risk control that exists *because* the
evidence is thin — the same inflation as repeated runs on one still-open idea, arriving from the
other direction. And it is still not a `core-dca` tranche: that one is a cash deployment, counted in
neither of the columns below, and the function refuses the lens rather than trusting the label.

### Paper samples are counted, and never in the same column

A paper position — a `thesis_call`, a mechanical baseline signal — is not a closed Decision and does
not become one. It has no fill, no cost and no slippage, so admitting it here would let a
hypothetical unlock real size, and that is the failure this whole gate exists to prevent.

It is also the only thing that makes the gate reachable. The floors are 30 samples, 10 independent
clusters and 3 regimes; ⚠️ **the experimental ceiling that made real fills too small to count was
removed in #226**, and the gate no longer decides a size either — but three regimes still turn on
the calendar rather than on activity, so a book that counted only real fills would still take years
to reach a verdict. The methodology this is ported from answered that by running a paper track
beside the real one — more throughput, no additional risk.

So both are kept, in separate columns:

| | what it counts | what it can unlock |
|---|---|---|
| real | closed Decisions with forward outcomes | lens maturity, and through it size |
| paper | `signalPaper` rows, per setup and per cohort | the §6 verdict on whether the research layer has an edge, and a cap-increase **proposal** a person approves |

`signalPaper` returns `cohortsAreSeparate: true` and `sampleKind` says which kind of sample it is
holding. A run that reports a paper count as a maturity count has broken the rule the label exists to
state.

⚠️ **And an empty paper column is a finding, not a blank.** The track is the only thing that makes
this gate reachable, so `signalPaper` reports `trackStatus` and raises `paper_track_empty` when
nothing has ever been registered and `paper_windows_unscored` when a carried window was not looked
at. Before that it returned a clean, empty, silent result for both a cold start and a run that
skipped the loop entirely — which is what had been happening, and the reason every lens below reads
`insufficient` with nothing on the way to change it. Report the status; do not read a zero as
"nothing qualified". Rows carry the `ruleVersion` they were judged under and are never pooled across versions:
re-tagging old rows under a new definition would manufacture a sample rather than gather one.

The research cohort is measured against two things and not one — the index *and* the mechanical
baselines `sectorStrength` logs. Beating the index while losing to a momentum bot is not an edge,
and a bucket whose excess is positive while its absolute return is negative is marked `relativeOnly`
rather than counted as a win.

A sample also carries the regime it was decided under, from the closed vocabulary in
`outcome-calibration`. Three distinct regimes are required for promotion precisely so a record built
in one market state cannot pass as evidence of an edge, and a tag outside the vocabulary is refused
rather than counted — free text makes one state look like several.

Cluster sample dates in ascending order. A date joins the current cluster when it is at most five
calendar days after that cluster's latest date; otherwise it opens a new cluster. Chaining is
transitive. Store both `sampleCount` and `independentDateClusterCount`.

## Maturity

| status | minimum evidence | permitted claim |
|---|---|---|
| `insufficient` | 0–4 complete closed samples, or required fields missing | no profitability claim; WATCH or controlled experiment only |
| `observing` | at least 5 complete samples but below configured sample/cluster floors | describe observed process and outcomes; no size expansion |
| `reviewable` | configured sample and independent-cluster floors met | review calibration, benchmark-relative performance and failure mix |
| `promoted` | reviewable plus an approved package/config revision that promotes the lens | normal sizing within Mandate and concentration gates |

Meeting a numeric threshold yields `reviewable`, never automatic `promoted`. Methodology changes
require user-approved package/config changes. A lens may be demoted by such a change; memory itself
does not rewrite the rule.

**But say so when the threshold is met.** These gates exist to earn size with proof, not to avoid
risk forever, so when the evidence supports an increase the run proposes it without being asked —
`verdictReport` raises the proposal and it still requires approval. A manager whose failures produce
rule proposals and whose successes produce nothing is not being careful; it is structurally unable to
grow and unable to report that it cannot.

## The control arm

The price-pattern branch is a **control arm, not a strategy**. Oversold depth and moving-average
pullbacks are the most arbitraged signals in existence; institutions run them at lower cost with
faster execution, and a large-cap universe offers no capacity advantage to shelter in. Its job is to
be the baseline every claimed edge has to clear, measured with real money rather than asserted.

Its second job is to close positions. Sizing only opens on closed evidence, and a book that never
closes anything keeps that gate shut forever — so this lane runs a fixed exit discipline and a loss
is a valid output, because the output being bought is the outcome record.

`controlArmLane` holds what is left of the limits: six concurrent at most, and the time stop (40
trading days) and hard stop (−8%) registered **before** the entry rather than promised after it.

⛔ **Its size caps are gone (#226).** 1% a name and 6% across the lane were removed on 2026-09-08,
with `control_arm_single_cap`, `control_arm_lane_cap` and `control_arm_exceeds_experiment_total`.
They were the axis that turned an evidence gate into a size dial, and with `variantViewCheck`
standing at 0/4 every candidate fell here and was flattened to a position under the venue's minimum
ticket. ⚠️ **Everything that makes it a control arm survives** — `role`, `purpose`,
`expansionProhibited`, the registered exits, and `verdictReport`'s refusal to promote a control arm
however well it did. The lens is what tags outcomes in the Aumos ledger; the measurement is made
there rather than by a cap standing in for it.

⛔ **And the variant view is no longer waived here.** The waiver was paid for by the 1% bound, and
the bound is gone: `controlArmLane.variantViewRequired` is `true`. Every real-money position owes a
checked variant view, whichever lens found it.

⚠️ **"A checked variant view" is computed rather than described.** `variantViewCheck` is the
operation, and it answers from inputs that can be checked rather than from the claim itself: a
thesis `validateThesis` calls complete, a non-empty `variantView`, at least one `consensusRefs` row
with a metric, a value, a source URL and `publishedAt` ≤ `capturedAt` ≤ `asOf`, and
`challengeVerdict: 'cleared'`. All four, or there is no position
(`variant_view_unverified`, and `variant_view_required_for_position` / `blocked` at the sizing
door). The Mandate's `maxPositionWeight`, the risk budget and every concentration cap still bind on
top of it.

⚠️ **And when it says no, it says which of the four and what is outstanding on it** (#160). The
2026-09-06 run met three — `variantView`, `consensusRefs`, `challengeCleared` — and read back
`missing: ["thesisComplete"]`, one word covering the fact that almost everything had been done and
that the whole of a twentyfold cap reduction hung on two derivable fields. `requirementReport` is
per requirement, and `effectivePositionCap` carries it on
`variant_view_required_for_position` since #226. ⛔ Reporting the reason changes no threshold: the
four requirements and `verified` are what they were, and `thesisComplete` is not waived for a
candidate that has three of four — it is now the difference between a position and none, which is
the honest form of the same answer.

⚠️ **And when it says yes, it says whose word it is saying yes on** (#692). `consensusRefs` is the
one requirement of the four whose input is on the web and nowhere else — a broker estimate or a
price target is in no filing and on no exchange feed — and the only route the web has into
`evidenceIds` is `observation_file`, which files the passage as the **manager's own testimony**.
So `variantViewCheck` grades every accepted row: `aumos` (this host obtained it), `manager` (you
filed it), `ungraded` (cited, markers not carried back) or `uncited` (nothing in the record stands
behind it at all). `consensusStrongestAttestation` is the best grade the candidate has and
`restsOnManagerAttestation` is true when that best grade is yours.

⛔ **A manager-attested row satisfies the requirement, unchanged.** That is the trade the investor
was asked for and chose — *file it, and I read the passage before I approve* — over keeping the
lane shut or dropping the requirement. ⛔ **And it collapses into dropping the requirement the
moment the grade stops travelling.** So when a position opens on one,
`effectivePositionCap` returns `main_lane_rests_on_manager_attestation` on `disclosures` and the
proposal carries that code verbatim in one `rationale.risks` entry with the source URL and in one
`uncertainty` entry; hand both to `proposalDisclosure`, where missing either is
`main_lane_attestation_undisclosed` / `blocked`. `risks` is the slot because the approval screen
renders `keyReasons` and `risks` and nothing else. ⛔ **The arithmetic does not read the prose** —
since #212 ② it names the obligation and `proposalDisclosure` judges it, because a `blocked` raised
from a substring reached `targetWeight` and made a reworded sentence change a position weight.

⚠️ **The requirement that binds is usually fillable, and the fill is a fetch.** `expectedUpsidePct`
and `fairValueRange` come off `thesisValuation` — the bear/base/bull targets this page already
requires, drivers checked against the filings — so a `thesisComplete` gap on a **filer** is work not
yet done rather than a source that does not exist. `thesisGapSources` is what tells those apart, and
it decides from the registry rather than from an assumption about the instrument.

⛔ **The leak this closes on the other side.** A thesis may not open a position on the control
arm's own record: `evidenceSamples` rows from any cohort other than `llm-research` come back
`control_arm_evidence_cited` / `blocked`. That is `expansionProhibited` at the lane door — the same
rule `verdictReport` enforces one layer up, where a mechanical cohort gets no verdict at all.

### The exit discipline, which is unconditional

⚠️ **`controlArmLane`'s `exitRegistered: true` is a boolean a run can assert; `exitDiscipline` is
what checks it.** Call it for every non-core holding and for every entry this run proposes.

- **The time stop reads the entry date and nothing else.** 40 trading days after entry the position
  is closed regardless of how it is doing — `time_stop_reached`. It is not a review to extend, and a
  loss is a valid output because the output being bought is the closed outcome. ⛔ It does **not**
  read a `reviewBy`: the two conditional time stops here (`exitCheck`'s `time_stop`, and
  `timeStopPolicy`) both do, and a position nobody wrote a review date for is invisible to both —
  which is how this book reached zero closed outcomes with two time-stop operations reporting
  nothing wrong. Where more than one fires, `exitDiscipline` answers; the others keep their own
  finding and never postpone it.
- **The stop distance is not one number any more, and that is correct.** The control arm keeps the
  source's approved −8%, which was computed against its 1% cell. Every other lane **derives** it
  from the Mandate's `maxDrawdown` against this position's weight — the widest stop a position may
  carry is the heat budget left for it divided by its weight — and the −8% is only the ceiling on
  that answer. ⚠️ The investor has not declared `maxDrawdown`, so outside the control arm the answer
  today is `hard_stop_unevaluated` and **no number is invented**; the diagnostic names the
  declaration that resolves it. A registered stop wider than the derived bound is
  `hard_stop_exceeds_budget` / `blocked` — that breach would otherwise be invisible to
  `portfolioHeat` until the day it fired.
- **Registration happens at entry or the entry is refused.** The source wrote *"산문 약속으로 두지
  않는다"* and kept a file; this package has no `thesis:write` and no way to read a WATCH back, so
  the registration path is the proposal itself. `watchesToRegister` returns the two rows an entry
  owes — a `price-below` at the stop and an `at-time` at the time stop — and they are copied into
  the same `DecisionProposal` as the BUY. A missing stop or review date is
  `exit_rules_unregistered` / `blocked`.
- **And the stop is stated as a price with a purpose on it, not only armed.** `priceLevelsToRegister`
  returns the same number as a `priceLevels` row with `purpose: 'stop'` — because one `price-below`
  is a stop under a holding *and* an entry somebody is waiting for, so a direction cannot say which
  and `reason: 'exit-discipline-hard-stop'` is our word rather than a field Aumos reads
  (`untilled/aumos#756`). ⚠️ The level and the watch are built by one call and hold **one** `Money`
  and one `key`, so the host's link check cannot fail on a rounding disagreement — ⛔ do not retype
  either of them. Pass `asset` in full or the level cannot be stated at all
  (`stop_level_unstated` / `unevaluated`); the discipline itself is unaffected either way.
- **A reported stop that nobody acts on is the prose it replaced.** Pass this run's exits as
  `proposedExits`; a due stop with no exit proposed for that symbol is `exit_due_unactioned` /
  `blocked` — the proposal, never the run.

⛔ **A good result from this lane is never an argument for enlarging it.** `verdictReport` refuses to
render a verdict on the mechanical cohort at all. Read a strong baseline as "our bar is high", not as
"do more of this": expanding a control arm destroys the control, and after that no edge claim can be
verified against anything. Expansion is a separate proposal that must first say what replaces the
control.

## Entry gates

For a new single-name BUY require all of the following:

- point-in-time price and the fundamental lane required for its market;
- explicit discovery lens;
- `why cheap`, temporary-versus-structural assessment and trap risks;
- falsifiable variant view and invalidation;
- bear/base/bull scenario inputs whose probabilities sum to 100;
- positive probability-weighted return and expected active return at least `minimumExpectedActiveReturn`;
- named benchmark alternative and reason the single name is preferable;
- thesis challenge without `high_risk_unresolved`;
- fresh, non-conflicting evidence and an intact adjusted/unadjusted price basis;
- Mandate and concentration headroom.

If an input is unknowable, do not insert a neutral number. Mark the gate unresolved. Missing
fundamental provenance or unresolved high risk permits no BUY.

⚠️ **Maturity no longer caps a size, and the variant view no longer shrinks one (#226).** The
investor removed the experimental lane on 2026-09-08: *"실험 레인은 없애고 실제로 aumos의
mandate에 따라 매수하면서 실험하는 방향으로 바꿔라."* `insufficient`, `observing` and `reviewable`
buy at the same cap `promoted` does — the Mandate's `maxPositionWeight`, under a computed risk
budget — and the learning temperament moved to the Aumos decision ledger and its Forward Track
Record, where every judgement is recorded with its lens and its forward return.

⛔ **The variant view is now a gate on whether the position exists, not on how large it is.** A
candidate without a checked one is refused: `effectivePositionCap` returns
`variant_view_required_for_position` / **`blocked`** and `targetWeight` answers `null`. It is not
sized twenty times smaller and submitted anyway. The four requirements are unchanged, and
`challengeCleared` was already fatal on its own — what changed is that the other three are held to
the same standard. Read `requirementReport` for the one that binds and what is outstanding on it.

⚠️ **The measured reason this had to change.** On `run_c7ad46eea03840bf84ae7a8822ed02c3` the chain
ran: `consensusRefs` had no collection procedure → `variantViewCheck` 0/4 → every candidate forced
to the control arm → a flat 1% of a USD 14,937.07 book = **USD 149.37** → under the USD 200 minimum
ticket → no single name at any price, for ten runs. The gate was not slowing the measurement down;
it was preventing one from existing.

⚠️ **A position still has to be one that can be executed, and the minimum refuses rather than
lifts.** `minimumExecutablePosition` — the smallest position worth opening in the venue's own
currency — is what `minimumExecutableWeight` reads. A weight the arithmetic puts below it comes back
`minimum_executable_not_met` / `blocked`: ⛔ **do not round a position up to the minimum**, because
then the size measures the rounding rather than the idea. Before #226 this number *lifted* an
experimental ceiling; there is no ceiling to lift now.

The disclosure is what tells the investor that a declared `maxPositionWeight` of 0.20 is operating
lower — `position_cap_reduced_below_declared`, with the declared number, the effective number and
the risk arithmetic that holds it there. ⛔ **Disclosing a limit is not loosening it**, and nothing
in this package's promotion thresholds moved: `promotionGate` reports a lens's record and gates no
size (`promotion.gatesSize: false`).

## WAIT versus unable to judge

- **Judged WAIT**: the required lane is fresh enough, claims were challenged, and no change has
  sufficient edge. State that the evidence supports no action.
- **Unable-to-judge WAIT**: a required source, freshness boundary, point-in-time date, adjustment
  basis or high-risk answer is missing. Put each gap in `uncertainty`; do not imply a neutral view.

Use WATCH only when a presently unmet, machine-readable trigger would resolve the gate.
