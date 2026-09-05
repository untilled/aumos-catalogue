# Host dependencies after issues #145–149

Version 0.4.21 restores the curated research assets and makes collection, input and scheduling
failures observable. Two runtime facilities remain outside this catalogue package.

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
