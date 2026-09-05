# Host dependencies after issues #145–151

Version 0.4.22 discloses the operative position cap and the venue floor that closes the control
arm. Three runtime facilities remain outside this catalogue package.

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

`effectivePositionCap` now computes the reduction and every run that applies one discloses it, so
the fact reaches the investor **after** a run. It does not reach them where the number is entered.
An investor typing `maxPositionWeight = 0.20` into fund settings is declaring a limit that this
manager will operate twentyfold below for as long as its lenses are unpromoted, and the screen
says nothing.

The host would need, beside the position-limit field, the effective limit each installed manager
would apply at the current evidence state and book size — which is a value only the manager can
compute, so it needs a read path Aumos does not have: a way to ask an installed manager for its
operative constraints outside a decision run. That is Aumos's design call, not this package's;
what this package can do is make the answer computable, which `effectivePositionCap` is. This
follow-up is owned by `untilled/aumos`, and #151 is therefore not fully closed by this package.

⛔ It is a **disclosure** dependency and not a gating one. Nothing here waits on the host: the
diagnostic fires today, and the proposal that does not carry it is refused today.

## The promotion ladder's middle rungs (#151, proposal 3)

Left open deliberately. Whether an intermediate grade should exist between the experimental
ceiling and a full promotion — reaching, say, 3% on 10 samples and 5 clusters without the third
regime — is a methodology judgement about how much size unproven evidence may carry, and it is
exactly the kind of number the source harness marked *"값 수정·완화는 사용자만 한다"*. This
revision changes no threshold and adds no rung. It states the wait in `README.md` so the investor
can decide before installing, and leaves the ladder question on the issue.
