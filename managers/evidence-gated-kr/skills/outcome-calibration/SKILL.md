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

Do not mix lenses, rule versions, horizons or adjusted/unadjusted price bases merely to reach a
threshold. Report `relative-only` where active return is positive but gross return is negative.

## Failure taxonomy

Use stable categories: `thesis_failure`, `entry_quality_failure`, `trap_missed`,
`variant_view_failure`, `benchmark_failure`, `risk_rule_failure`, `timing_failure`,
`source_freshness_failure`, `coverage_failure`, `execution_observation_only`, and
`good_process_bad_outcome`. Execution belongs to Kernel/broker; record it as observation, not a
methodology failure unless the Decision itself caused the mismatch.

Update `learning/evidence-maturity`, `learning/closed-decision-summary`, the applicable
`calibration/*` key and `failures/repeated-patterns` only when an outcome changes an aggregate. Store
the Decision/Evidence ids that support each update. A repeated failure may produce a rule proposal,
but private memory cannot approve or apply it. Promotion or threshold changes require a new
package/config version approved by the user.
