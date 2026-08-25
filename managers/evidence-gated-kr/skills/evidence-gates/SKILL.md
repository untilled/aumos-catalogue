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

## Entry gates

For a new single-name BUY require all of the following:

- point-in-time price and the fundamental lane required for its market;
- explicit discovery lens;
- `why cheap`, temporary-versus-structural assessment and trap risks;
- falsifiable variant view and invalidation;
- bear/base/bull scenario inputs whose probabilities sum to 100;
- positive probability-weighted return and expected active return at least the configured minimum;
- named benchmark alternative and reason the single name is preferable;
- thesis challenge without `high_risk_unresolved`;
- fresh, non-conflicting evidence and an intact adjusted/unadjusted price basis;
- Mandate and concentration headroom.

If an input is unknowable, do not insert a neutral number. Mark the gate unresolved. `insufficient`
or `observing` permits at most the configured experimental ceiling when every research and safety
gate is otherwise complete; missing fundamental provenance or unresolved high risk permits no BUY.

## WAIT versus unable to judge

- **Judged WAIT**: the required lane is fresh enough, claims were challenged, and no change has
  sufficient edge. State that the evidence supports no action.
- **Unable-to-judge WAIT**: a required source, freshness boundary, point-in-time date, adjustment
  basis or high-risk answer is missing. Put each gap in `uncertainty`; do not imply a neutral view.

Use WATCH only when a presently unmet, machine-readable trigger would resolve the gate.
