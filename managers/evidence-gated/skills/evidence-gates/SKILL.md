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
clusters and 3 regimes; real fills are capped at the experimental ceiling while a lens is
unpromoted, so a book that counted only real fills would take years to reach a verdict and the gate
would be decoration. The methodology this is ported from answered that by running a paper track
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

`controlArmLane` holds the limits: 1% a name, 6% across the lane, six concurrent at most, spent
inside the experimental total rather than beside it, and the time stop (40 trading days) and hard
stop (−8%) registered **before** the entry rather than promised after it. A variant view is not
required here — the size is why. A candidate that does have one belongs in the main lane, where it
can be sized properly.

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

If an input is unknowable, do not insert a neutral number. Mark the gate unresolved. `insufficient`
or `observing` permits at most the experimental ceiling when every research and safety
gate is otherwise complete; missing fundamental provenance or unresolved high risk permits no BUY.

⚠️ **A small experiment has to be one that can be executed.** The ceiling is the package's
experimental ratio or the configured `experimentalPositionFloor` — the smallest position worth
opening in the venue's own currency — whichever is larger, bounded by the package's ceiling maximum;
`experimentalCeiling` is the one operation that answers it. The ratio alone was capping this book's
first real experiment at three shares, and the source methodology's Experiment-stage entry in that
same name was ten. Below the band the answer is `experimental_floor_unreachable`: this book runs
that lane on paper, and paper never unlocks real size — the columns stay separate.

⚠️ **And the floor can sit above the control arm's cell without being above the band.** On a USD
14,866.44 book the lane's 1% is USD 148.66 and the configured floor is USD 200 — so the arm is shut
to every US name at every share price, while `experimentalCeiling` reports a perfectly ordinary
0.01345312. `effectivePositionCap` is what says it: `experimental_floor_exceeds_cap`, carrying the
NAV that resolves it (USD 20,000 there). ⛔ It is a report about the size of the book, not a reason
to lift the lane cap — the control arm's 1% is what makes its variant-view waiver legitimate, and a
lane enlarged to fit a floor is no longer a control.

The same call is what tells the investor that a declared `maxPositionWeight` of 0.20 is operating
at 0.01 while the lens is unpromoted: `position_cap_reduced_by_maturity`, with the declared number,
the effective number, and `promotionGate` as what lifts it. ⛔ **Disclosing the gate is not
loosening it.** Nothing in this package's promotion thresholds moves because a cap was found to be
binding; the whole point of a control arm is that it binds.

## WAIT versus unable to judge

- **Judged WAIT**: the required lane is fresh enough, claims were challenged, and no change has
  sufficient edge. State that the evidence supports no action.
- **Unable-to-judge WAIT**: a required source, freshness boundary, point-in-time date, adjustment
  basis or high-risk answer is missing. Put each gap in `uncertainty`; do not imply a neutral view.

Use WATCH only when a presently unmet, machine-readable trigger would resolve the gate.
