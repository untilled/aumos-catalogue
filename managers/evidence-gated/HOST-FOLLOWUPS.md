# Host dependencies after issues #145–153

Version 0.4.30 wires the one input the 20% lane could never be given — a consensus observation —
and makes the grade it arrives at travel to the approval screen. 0.4.29 reported what share of the
book is bearing risk at all, and read the Mandate's `objective` for the first time. 0.4.28 joined the filings to a fair value and separated a valuation
gap that was never fetched from one no source can fill; 0.4.27 wired the fundamental discovery
branch to its input; 0.4.26 before it stopped
reading `decisions[].armed` as a receipt for a promise it cannot carry; 0.4.24 separated the main
lane from the maturity gate, read the Mandate's `cashFloor`, derived the single-name total from the
Mandate and enforced the source's exit discipline.

## Web observations (#692) — ✅ the host built the route, and two things are still ours to watch

**The dependency is discharged and the grade is the whole story.** `observation_file`
(`untilled/aumos#693`, capability `observation:file`) is the one tool by which anything a manager
reads on the web reaches `evidenceIds`. It matters here more than anywhere else: `consensusRefs` is
one of `variantViewCheck`'s four requirements and the only one whose input exists on the web and
nowhere else, so before #693 this methodology was **requiring an input whose only supply route it
had closed** — and the account bought no single name in eight runs. The manifest declares the
capability and `engines.aumos` moves to `>=0.3.32`.

⚠️ **Measured, and it differs from what a reader would assume.** #693 merged 2026-09-06T14:48Z,
after the `v0.3.31` tag was cut (09:56Z). `observation:file` is therefore in **no released binary
yet** — `packages/amp/src/manifest.ts` at `v0.3.31` does not contain it — so the floor named above
is the next release rather than the current one. Until `0.3.32` ships, an installed Aumos refuses
this manifest **whole** rather than ignoring an unknown capability, which is the same failure mode
`engines.aumos` has been moved for four times now.

### ⛔ Still owed by the host: the grade does not reach the approval screen

#693 draws the attestation grade in **`DecisionDetail`** (a first column on the evidence table) and
in **`RunTimeline`** (a prefix on each evidence row). ⚠️ **Neither of those is where an investor
approves.** `apps/desktop/src/screens/Approvals.tsx` renders `rationale.keyReasons` and
`rationale.risks` and nothing else from the proposal — the evidence table is behind *open the sealed
decision*, one click past the approve button, and `uncertainty` is not on that screen at all.

That gap is why this package writes its disclosure into **`rationale.risks`** rather than into
`effectiveConstraints` or `uncertainty` alone, and why `main_lane_attestation_undisclosed` is
`blocked`. It is a workaround, and it works only for managers that choose to do it. **What would
close it properly is host-side**, and one of these would do:

- an attestation summary on the approval card itself — *"n of the m evidence rows behind this
  proposal are the manager's own reading"* — drawn from `EvidenceView.attestedBy`, which #693
  already derives and which `Approvals.tsx` does not currently read; or
- `DecisionProposal.effectiveConstraints` accepting a non-numeric disclosure row. Today
  `effectiveConstraintSchema` is a `strictObject` whose `field` is only `maxPositionWeight`,
  `cashFloor` or `maxDrawdown`, and this package emits one **only when a cap was reduced** — which
  is precisely what does not happen when the main lane opens. So there is no machine-readable slot
  for *"this size rests on manager-attested evidence"*, and prose is the only carrier left.

⛔ **Not asked for: a check that the excerpt was ever at that URL.** #693 names that as its ceiling
and this package agrees. Fetching the page later cannot give an honest verdict once the page has
changed, and a check that pretends to verify is worse than the caveat both sides already print.

### ⛔ Still owed by the host: the vendored lint copy is behind

`tools/lint/manager-package-manifest.schema.json` in this repository does not carry
`observation:file` — #693 updated `catalogue-tools/lint/` in the Aumos repository and the copy here
is re-vendored from there by `packages/package-lint/scripts/vendor.ts`. `tools/lint/VENDORED.md`
forbids editing it here, so it is not edited here. ⚠️ **Measured: it does not fail this manifest
either** — the capability enum is not enforced by the vendored runner at all (a deliberately bogus
`kind` also passes), so the stale copy is silent rather than wrong. The real check runs at merge in
the Aumos repository, where #693 already added the value. This is recorded so nobody reads the green
tick here as the enum having been checked.

## Fundamental storage (#146) — ✅ the host built it, and this package now uses it

**The dependency recorded here is discharged.** `source_cache_read` and `source_cache_refresh`
(aumos#671, #683, released in 0.3.30) are exactly the storage this section asked for: keyed by
provider, market, symbol and version, trimmed at invocation `asOf` in the host before the gateway
process sees a row, retaining prior versions, and — the request this package cared most about —
**distinguishing a missing cache from a failed refresh**. The manifest declares `source-cache:read`
and `source-cache:write` and `engines.aumos` moves to `>=0.3.30`.

⚠️ **And the diagnosis this file recorded was half wrong.** The 2026-09-06 run measured it: the
curated roster *is* ported (`researchUniverse` answers 74 KR / 83 US at `snapshotDate 2026-07-24`)
and the OpenDART route *is* alive (`company.json?corp_code=00126380` → `stock_code 005930`). The
only missing piece was the **join** — nothing mapped a six-digit listing symbol to the `corp_code`
every OpenDART route, and the cache's own `vendorId`, is keyed by. `/api/corpCode.xml` was already
on the allowlist and `parseDartCorpCodes` already read it; no run had asked for it. ⚠️ **The US
side was recorded here as having "an even lower barrier — `companyfacts` is keyed by the ticker",
and that was false** (#179): `/api/xbrl/companyfacts/INTC` answers 404 `NoSuchKey`, and the file is
`/api/xbrl/companyfacts/CIK0000050863.json` — measured 2026-09-07, along with the 200 that
replaces it at 4,311,809 bytes. US has the **same** barrier, one registry over:
`/files/company_tickers.json` → `cik_str` (an unpadded integer) → ten-digit zero-pad → the file
name. It had never been fed either, and while that sentence stood a fed run would still have taken
83 404s and read them as the vendor holding nothing.

So this revision adds the path rather than another request: `fundamentalsPlan` →
`mapCorporationCodes` → the two cache tools → `dartVendorStatus` → `radarCandidates` →
`radarFeedDiagnosis` → `upsideRadar({candidates, feed})`, with the flow skills carrying it as a
numbered step because a sentence in §3 was skipped by all three flows.

⛔ **What is still owed is not storage but proof.** No live OpenDART or SEC key exists in the
environment this was written in, so every step is fixture-fixed and none of it has been observed
against a vendor. `#146` stays open until a run with keys reports a lane that is fed rather than
starved. Two smaller items remain host-side:

- `source_cache_refresh` routes only `open-dart`/`filings`, `open-dart`/`financials` and
  `sec-edgar`/`companyfacts`. There is **no cache document for the corp-code registry**, so the
  registry stays a `source_request` and its ZIP arrives relayed as sent — a run that cannot
  decompress it falls back to reading `corp_code`/`stock_code` off `list.json` rows.
- `CachedDocument.normalized.metrics` is a free-form map. This package reads operating income and
  revenue under the names it has measured and reports `cache_metrics_unrecognized` rather than
  guessing when neither appears.

The old `entry_quality_unverified` wording also misled the run: `entryQualityGate` consumes
historical OHLC bars, not previous scan runs. Fetching sufficient dated bars permits evaluation
on the first run; a durable scan-history database is not required for that gate. §3 of `PROMPT.md`
carried the same misreading and no longer does.

## Authoritative WATCH reads (#97, #148, #156 — `untilled/aumos#690` landed)

⚠️ **This section asked for the face, and then the package went ahead and built one out of a
field that does not carry it.** #148 had `reconcileArmedReviews` take `journalArmed`, normalized
from `decisions[].armed`, and treat it as proof of arming. `decisions[].armed` is **past tense** —
`fate` is `fired | replaced | lapsed`, with no value for a promise still standing — so a review
that armed cleanly and one that was never armed produce the same empty array. One judgement in the
measured book armed four plans and only the already-TRIGGERED one appeared in its `armed[]`.

The cost is recorded in `#156` and `untilled/aumos#687`: three market-review intents standing
3 / 3 / 2 deep, *“the journal wins”* set in `failures/repeated-patterns` as `CONFIRMED` /
`blocks-every-future-wake`, and a Brief that told the investor **zero** market reviews were standing
while six were ARMED.

0.4.26 removes the reading entirely. `journalArmed` is refused with `armed_journal_not_a_receipt`
rather than ignored; nothing suppresses a re-arm; `nextState` is a first-person record of what this
instance proposed and whose instant has not passed. The one duplicate the
host does not fold — the same flow promised at a **different** instant — is `review_superseded`.
⚠️ **`standingArms` was `null` for one release longer than it had to be.** 0.4.26 hard-coded it
beside `standingArmsAreUnreadable: true` so the count could never be published as zero, which was
true of *that operation's inputs* and stopped being the only option once `standingPlans` shipped:
the operation is `strict`, so a run that followed §4 and handed the field over had the whole
calculation refused as an unknown key. 0.4.50 takes it as a **report-only** parameter and answers
`standingArms: { atLeast, basis }` — a floor whose own shape says so — while `toArm`,
`duplicateFlows`, `superseded` and `nextState` are computed without it. ⛔ Not handed the field is
still `null` / unreadable; handed `[]` is a floor of **0**, and the two are different facts.
(`untilled/aumos-catalogue#201`)

✅ **The contract half is settled.** `untilled/aumos#691` keeps the field name and meaning
(a rename would fail silently on the consumer side, and a fourth `fate` value would restore the
“permission to stop” #622 refused), and states the invariant in the field's published
`description` and in `AMP_MANAGER_INSTRUCTIONS`: `decisions[].armed` is not an arming receipt;
re-arm at every judgement; the host folds. ⚠️ Both published sentences were widened by
`untilled/aumos#712` to say **which** folds and to bound them — an identical promise at arming time
and an identical instant per instance at firing time (#593), *"identity, not resemblance"* — because
until that landed *"arming a review you already hold … changes nothing"* was true of the wake and
false of the ledger.

✅ **The face this section asked for landed as `untilled/aumos#690`.** `ManagerInvocation.standingPlans`
carries the watches and plans that stood at `asOf` over this book, armed by this manager, each with
`planId`, `armedAt`, `armedByDecisionId`, `expiresAt`, `intent` and `trigger` — including ones armed
by a judgement too old for the `history.recentDecisions` window. Measured on
`run_73a3e6c41c204f468ee8be8d2923d898`: twelve rows, matching row-for-row and depth-for-depth the
table the previous run had read straight out of `plans`, with exactly the one instant that had
passed absent from it. ⚠️ **The shape question #622 raised was answered by bounding the field, not
by withholding it**: it is a **floor and not a ceiling** — a promise with no instant to date it by is
left out rather than guessed at, so one missing from the list may still be standing — and the field's
own `description` says in as many words that no reading of it licenses skipping an arm. The package
therefore reports from it and arms exactly as before; `PROMPT.md` §4 carries that split.

✅ **The verb this section asked for next arrived as a fold, and no verb at all.** A promise wrongly
armed could not be withdrawn: the wake-time fold (#593, #624) kept a duplicate from producing a
second wake and left the plan **row** standing — this book stood 3 / 3 / 2 deep on three review
intents for that reason — which was `untilled/aumos#704`. `untilled/aumos` PR **712 merged** and
closed it from the host side with **no tool and no AMP field added**: a second fold runs at
**arming** time, inside the transaction that seals the judgement and over the same list
`standingPlans` showed the run, and an identical promise (`kind`, `subject`, `intent`, `trigger`,
compared as written bytes with `expiresAt` deliberately excluded) retires the older row as
`rearmed`. ⚠️ **Identity, not resemblance**, so the one duplicate this section named as the harm —
the same flow promised at a **different** instant — is untouched and still has no verb; that stays
`review_superseded`, first-person, reported and not withdrawn. ⬜ **And merged is not shipped**: the
fold landed after `untilled/aumos` `v0.3.32`, so a host older than it still keeps the row, and the
depth read from `standingPlans` remains something to report rather than a reason to arm less.
(`untilled/aumos-catalogue#175`)

The #136 claim that correctly supplied `previous.armed` never deduped was refuted in #148; #148's
own conclusion that the journal is authoritative about arming was refuted in #156. Do not carry
either forward as a confirmed rule — `refutedMemoryRules` retracts the second from durable memory.

## Where a holding came from (`untilled/aumos#688`, landed in `#691`)

`harnessAudit` used to read `history.recentDecisions` as though it were the journal. It is a
**window**, so the decision that explains an older holding drifts out of it as the book keeps
judging — and the block it produces is unfixable by construction, because what would lift it is the
decision that just aged out. Measured: `dec_f0549343…` opened the thesis for `069500` and armed its
tranche gate, sat at sequence 2 of 7 behind a five-row window, and the holding was reported as
explained by nothing.

0.4.26 reads the two faces `#691` added instead. `history.totalDecisions` → `totalDecisions` says
whether the window was cut; `positions[].origin` (`{ decisionId, asOf }`) is the earliest judgement
naming the asset, read over the **whole** journal.

⚠️ **Both are optional and this package treats absence as the host not saying.** No origin and no
total is `audit_decision_window_unstated`; a total above the rows supplied is
`audit_decision_window_truncated`. In both cases the holding is still carried conservatively and
still withheld from expansion, and `explanationReadable: false` records that "no decision explains
it" is what this run failed to read rather than what it read. ⛔ `origin.asOf` is when a judgement
was sealed and never an acquisition date; the inherited-or-acquired question stays on `acquiredAt`
against `managedSince`.

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

## The lane split, and the number that is now decided (#153, requests 1–3)

The maturity ceiling was applied to both lanes and belongs to one; `variantViewCheck` is what tells
them apart, from checked inputs rather than a claim. Nothing there is a host dependency.

**The single-name total is no longer open.** The investor answered §3 with **(a)** — the cash that
is left is carried by single names, and no parking sleeve stands in for the ETF lane — and set the
source of the limit with it: the Mandate rather than a package constant. `singleNameBudget` derives
the range from `cashFloor` and holds each name to `maxPositionWeight`. The source's 28% is **not
ported**, and that is now a recorded decision rather than an open one: it was one piece of an
allocation that also carried a 50% core ETF target, and in an account without that lane it is not
the same statement. ⚠️ With it, no sizing constant in this package answers a question the investor
is asked on a screen — the end of the line #133 began. What is still open is the promotion ladder's
middle rungs, below.

## The exit discipline needs a WATCH read path (#153, request 2 · #97)

`exitDiscipline` enforces the source's rule — 40 trading days from entry, unconditionally, plus a
stop distance derived from the Mandate's `maxDrawdown` outside the control arm — and registers it
the only way this package can: `watchesToRegister` returns a `price-below` and an `at-time` row for
the entry's own `DecisionProposal`. The source wrote its registration into a file
(`data/exit_rules.json`) that `exit-check` then watched; this package has `thesis:read` and no
`thesis:write`, and the runtime maps that grant to an empty tool list, so there is no such file and
no equivalent.

⛔ **Private memory is not the substitute and must not become one.** `skills/memory-contract`
forbids exactly this shape — *"a gate that must execute"* and a hidden portfolio database — and a
per-position stop table would be both. So the discipline is **re-derived from the entry date every
run** rather than read back from state, which is correct but pays for the missing read path twice:
a WATCH armed at entry could not be seen at all, and the same #97 gap that cost duplicate
scheduling cost an unverifiable stop here. ⚠️ **`standingPlans` closed the seeing half and not the
verifying half** — the read is a floor, so a stop present in it did stand at `asOf` while one absent
from it may still be standing, and «absent» is therefore not a finding. So the discipline is still
re-derived from the entry date every run, and the package still discloses that the arm is unverified
rather than assuming it stands.

⚠️ **The stop distance itself waits on the investor, not the host.** `mandate.constraints.maxDrawdown`
is undeclared, so outside the control arm the distance comes back `hard_stop_unevaluated` with the
declaration that resolves it named in the diagnostic. No number is invented, and the control arm —
whose 1% cell is what the source's −8% was computed against — is fully judged today.

## Closed outcomes reach one maturity axis, not both (#153 · #118)

`closedOutcomeSamples` turns a closed decision into the calibration sample that moves
`maturityStatus`, which is the axis the experimental ceiling reads. That conversion previously
existed only as a sentence in `skills/outcome-calibration` and no operation performed it — the same
shape as the paper-track registration that held zero rows across every run.

⛔ **It does not and must not reach `promotionGate`.** That gate counts matured *paper* windows in
the `promote` cohort: rows registered before the outcome was known, with no fill, cost or size. A
realized trade has all three, and pooling the two would open a promotion on evidence the gate was
not measuring. `closed_outcome_not_a_paper_sample` states the boundary every run. Both axes still
depend on the host for the underlying record — the Decision journal and Track Record are Aumos's,
and this package keeps no ledger.

## The promotion ladder's middle rungs (#151, proposal 3)

Left open deliberately. Whether an intermediate grade should exist between the experimental
ceiling and a full promotion — reaching, say, 3% on 10 samples and 5 clusters without the third
regime — is a methodology judgement about how much size unproven evidence may carry, and it is
exactly the kind of number the source harness marked *"값 수정·완화는 사용자만 한다"*. This
revision changes no threshold and adds no rung. It states the wait in `README.md` so the investor
can decide before installing, and leaves the ladder question on the issue.
