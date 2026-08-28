---
name: outcome-calibration
description: Turn closed Aumos decisions and forward outcomes into lens calibration, evidence maturity and failure summaries without auto-changing rules.
---

# Outcome calibration

Use only Aumos Decisions with forward outcomes. The catalogue track record begins at installation;
legacy Trading Harness results are historical context and must never be backfilled as Aumos results.

## Complete sample

A calibration sample requires Decision id/date, lens, action, horizon, gross return, benchmark id and
same-horizon return, active return, thesis/process compliance and outcome availability timestamp.
Incomplete rows remain referenced under `missingFields` but do not increase complete sample count.
Group dates into independent clusters using the five-day transitive rule in `evidence-gates`.

## Metrics

When fields permit, compute by lens and version:

- sample and independent cluster counts;
- hit rate for positive active return;
- mean active return and calibration by declared probability/conviction bucket;
- downside, benchmark-relative result and decision-quality mix;
- process compliance: thesis, challenge, stop/review and concentration rules;
- outcome coverage and missingness.

Do not mix lenses, rule versions, horizons, **benchmarks** or adjusted/unadjusted price bases merely
to reach a threshold. The benchmark belongs on that list and was missing from it: this methodology is
benchmark-relative end to end, so two active returns measured against different denominators are not
two samples of anything. `config.benchmarks` fixes the denominator per kind of holding — Korean
equity, US equity, cash-like — so it does not get re-decided each run. Report `relative-only` where active return is positive but gross return is negative.

## Failure taxonomy — two axes, and they are not interchangeable

This section named eleven categories and `outcomeClassification` produced eight, and only four were
the same word. A run following this list and a run reading that output disagreed about what had
happened. They are two different questions, so they are now two lists.

### Computed — `outcomeClassification.failureType`

One bucket per closed decision, mutually exclusive, decided from the compliance flags and the
returns. You do not choose it; you read it.

| value | grade | when |
|---|---|---|
| `risk_rule_failure` | Bad | a risk rule was not followed — checked first, because a rule that was broken makes the rest of the reading moot |
| `execution_failure` | Bad / Mixed | the fill differed from the plan **and the Decision caused it** — see below |
| `thesis_failure` | Bad / Mixed | the thesis was broken |
| `benchmark_failure` | Mixed | positive gross return, negative active return: right about the asset, wrong about owning it instead of the benchmark |
| `good_process_good_outcome` | Good | every gate followed and the result agreed |
| `good_process_bad_outcome` | Mixed | every gate followed and the result did not — the outcome the methodology is built to keep counting as acceptable |
| `bad_process_good_outcome` | Mixed | the gates were not followed and it worked anyway. **This is the dangerous one**: it is the row that teaches the wrong lesson if it is read as a success |
| `bad_process_bad_outcome` | Bad | neither |

### Judged — `judgedFailures`

Reasons that no compliance flag computes, assigned after reading the decision. Zero or more per
decision, passed in and validated against the vocabulary; an unrecognised tag is refused rather than
becoming a new category with a sample size of one.

`entry_quality_failure` · `trap_missed` · `variant_view_failure` · `timing_failure` ·
`source_freshness_failure` · `coverage_failure`

A judged reason explains a computed bucket; it never replaces one. `bad_process_good_outcome` with
`trap_missed` is a coherent row and the pair is the lesson.

### Execution, which is the one that was contradictory

Execution belongs to the Kernel and the broker. This manager cannot place an order, so it is not at
fault for how one filled: a poor fill is recorded as `execution_observation_only` and leaves the
process reading intact — **unless the Decision itself caused the mismatch**, which is what
`executionAttributableToDecision` says. A limit price the Decision set where it could not be reached
is the methodology's failure; slippage the broker took is not. Absent the flag, the fill is not
charged to the methodology, and the observation is still returned and still diagnosed rather than
disappearing with the grade.

## The hurdle the whole book has to clear

Per-candidate gates ask whether *this* trade is worth doing. `benchmarkHurdleAnnualPct` asks the
other question: annualized, has any of it been worth running rather than held passively? Report the
book against it alongside `baselineTrack`, and report it when the answer is no — a methodology that
only measures its own decisions against each other can be internally consistent and still behind the
index for years.

Update `learning/evidence-maturity`, `learning/closed-decision-summary`, the applicable
`calibration/*` key and `failures/repeated-patterns` only when an outcome changes an aggregate. Store
the Decision/Evidence ids that support each update. A repeated failure may produce a rule proposal,
but private memory cannot approve or apply it. Promotion or threshold changes require a new
package/config version approved by the user.
