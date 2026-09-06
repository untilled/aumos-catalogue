# Host dependencies after issues #145–153

Version 0.4.23 separates the main lane from the maturity gate and reads the Mandate's `cashFloor`.
Three runtime facilities remain outside this catalogue package.

## Fundamental storage (#146)

The package contains KR 74 / US 83 symbol rosters from its existing provenance commit. It does
not copy the upstream investor's 173 cached files. `coverage/research-index` carries bounded
membership and Evidence references only; it cannot serve filing payloads. Every sleeve therefore
refetches OpenDART/SEC observations before `upsideRadar` and reports starvation when it cannot.

The host needs source storage keyed by provider, market, symbol, accession/receipt and version,
with publication/receipt time, capture time, Evidence id and the original response. Queries must
exclude observations published after invocation asOf, retain prior versions, enforce instance/fund
access, and distinguish a missing cache from a failed refresh. Normalized current and comparable
filings must retain provenance and period/currency semantics. A stale cache must not silently
become fresh evidence. This is a required follow-up, so #146 is not fully closed by this package.

The old `entry_quality_unverified` wording also misled the run: `entryQualityGate` consumes
historical OHLC bars, not previous scan runs. Fetching sufficient dated bars permits evaluation
on the first run; a durable scan-history database is not required for that gate.

## Authoritative WATCH reads (#97, #148)

`reconcileArmedReviews` now accepts `journalArmed`, normalized from actual host
`decisions[].armed`, separately from the proposed `sequence`. Its `nextState` contains only
confirmed future arms; `pending` never becomes a memory receipt. Missing journal data is
explicitly unverified and cannot suppress arming. Contradictory epoch/label pairs are blocked.
Do not persist any null `nextState`, or a proposal the host did not accept.

A decision journal proves submission, but cannot prove an arm remains active after early firing,
cancellation or replacement. The host still needs an asOf-aware read of active plans/watches,
including id, owner/flow, trigger instant, status, originating decision and fire/cancel history.
Until that exists, unverified journal access can lead to duplicate scheduling; the package chooses
to disclose that risk rather than suppress every future wake based on unconfirmed memory.

The #136 claim that correctly supplied `previous.armed` never deduped was refuted in #148.
Do not carry “ignore toArm and arm manually” forward as a confirmed rule.

## Experimental ladder (#149)

This revision implements option 2 from the issue: `entryTranchePlan` reports
`experimental_ladder_unreachable` when the final capped budget cannot fund one lot per rung at
the observed price. USD 200 at DKS USD 139.15 cannot fund three whole-share rungs (USD 417.45).
The ceiling and staging policy are unchanged. Broker lot size must be supplied; fractional lots
are used only when the broker actually supports them. Missing execution inputs produce
`experimental_ladder_unevaluated`, never an assertion that every entry gate passed.

⚠️ The issue's own "only names under USD 66 can enter" reading is **withdrawn** by #151 and was
too generous. The binding fact is that `experimentalPositionFloor.USD` (200) is above the control
arm's single-name cell (1% of USD 14,866.44 = USD 148.66), so no US name enters that lane at any
share price. `experimental_floor_exceeds_cap` reports it, with the resolving NAV (USD 20,000).

## The effective cap on the input screen (#151, proposal 4)

`effectivePositionCap` computes the reduction and every run that applies one discloses it, so the
fact reaches the investor after a run. Reaching them **where the number is entered** is the host's
half, and it is no longer hypothetical: `untilled/aumos#681` (issue #679) draws the effective limit
beside the fund-settings control, and it reads exactly one place —
`DecisionProposal.effectiveConstraints`.

This package fills it. `effectivePositionCap` returns the array ready to copy into the proposal,
and `PROMPT.md` §4 says to copy it verbatim:

```jsonc
{ "field": "maxPositionWeight",     // the host's vocabulary; a methodology name is refused
  "declared": 0.2,                  // echoed from this invocation's mandate, never a constant
  "effective": 0.01,
  "reason": "lens_insufficient",    // this package's own code, rendered opaque
  "unlocks": "promotionGate: samples 0/30 · regimes 0/3 · clusters 0/10" }
```

⚠️ **The two repositories have to land together.** The diagnostic alone leaves the screen empty,
and the screen alone has nothing to draw. ⚠️ **`cashFloor` is a second field this package can now
emit on (#153).** `effectiveCashFloor` reads the Mandate's floor — the package's own
`coreDca.reserveFloorWeight` is gone — and returns an `effectiveConstraints` row with
`field: 'cashFloor'` on the same inequality, for the case where this methodology ever holds a floor
above the declared one. It emits nothing today because it holds no such floor, which is the correct
empty answer rather than a silence. The heat cap is still read straight off `maxDrawdown` without
being narrowed, and the host's rule is that an axis with no row is drawn as nothing rather than as
unconstrained. ⛔ An entry is emitted **only** where `effective` differs from `declared` — that
inequality is the whole test, and a reduction that is computed and not emitted is the defect #151
is about, which is why the emission is judged (`position_cap_reduction_undisclosed`) rather than
left to diligence.

⛔ The dependency is a **disclosure** one and not a gating one. Nothing here waits on the host: the
diagnostic fires today, and the proposal that does not carry both halves is refused today.

## The lane split, and the two numbers it does not set (#153, requests 1–2)

The maturity ceiling was applied to both lanes and belongs to one; `variantViewCheck` is what tells
them apart, from checked inputs rather than a claim. Nothing here is a host dependency — the
operation runs today — but two numbers are deliberately **not** set by this revision and are
recorded so nobody reads their absence as a decision:

- **What total the single-name lanes may reach together.** The source approved 28% (2026-07-08) and
  a 15% minimum cash; the investor has since declared `cashFloor` 0.10 and asked for the ETF lane
  to leave this account, which is a different arithmetic on a book whose cash is 57%. Issue #153 §3
  puts three options to the investor and none of them is the package's to choose. The package's
  existing totals are unchanged in the meantime.
- **Whether the promotion ladder gets its middle rungs**, below.

## The promotion ladder's middle rungs (#151, proposal 3)

Left open deliberately. Whether an intermediate grade should exist between the experimental
ceiling and a full promotion — reaching, say, 3% on 10 samples and 5 clusters without the third
regime — is a methodology judgement about how much size unproven evidence may carry, and it is
exactly the kind of number the source harness marked *"값 수정·완화는 사용자만 한다"*. This
revision changes no threshold and adds no rung. It states the wait in `README.md` so the investor
can decide before installing, and leaves the ladder question on the issue.
