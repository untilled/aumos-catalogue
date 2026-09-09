# Host dependencies after issues #145–153

Version 0.5.0 follows the host out of keyed memory and into folders (`untilled/aumos#743`): the
private record and the book's shared conclusions are `files_*` and `fund_files_*` paths, the
whole-universe sweep is `task_start`/`task_get`/`task_cancel`, each recipe answer is a file read back
with `files_read`, and `engines.aumos` moves to `>=0.4.0`. Three debts below close with it and are
marked where they were recorded. 0.4.30 wires the one input the 20% lane could never be given — a consensus observation —
and makes the grade it arrives at travel to the approval screen. 0.4.29 reported what share of the
book is bearing risk at all, and read the Mandate's `objective` for the first time. 0.4.28 joined the filings to a fair value and separated a valuation
gap that was never fetched from one no source can fill; 0.4.27 wired the fundamental discovery
branch to its input; 0.4.26 before it stopped
reading `decisions[].armed` as a receipt for a promise it cannot carry; 0.4.24 separated the main
lane from the maturity gate, read the Mandate's `cashFloor`, derived the single-name total from the
Mandate and enforced the source's exit discipline.

## Stated price levels, and when this version may be published (`untilled/aumos#756`)

`untilled/aumos#758` added `DecisionProposal.priceLevels`, and 0.6.0 sends them: `exitDiscipline`
returns the stop it derived as a `stop` level beside the `price-below` it already armed, and
`entryTranchePlan` returns one `entry` level per priced rung. Both numbers existed before and had
nowhere to go — the only way to say a price was to arm a watch, and **one `price-below` is a stop
under a holding and an entry somebody is waiting for on a name they do not own**, so nothing
downstream could name the line without guessing. `priceLevels` states `purpose` instead.

### ⛔ Still owed by the host: nothing — and the debt runs the other way

This is the first entry here that is a debt **of this package to a host release**, not the reverse.
The direction matters because the compatibility is asymmetric:

| direction | verdict |
|---|---|
| an old package on a new host | **fine.** The field is optional and absence is a defined case: *what stood keeps standing* |
| a new package on an **old** host | ⛔ **the whole judgement is lost.** `decisionProposalSchema` is strict at every depth, so an unknown key is `unrecognized_keys` and the answer is recorded as `invalid-proposal` — not a dropped field, a dropped judgement |

⚠️ **So a minimum host version is not documentation here, it is the mechanism.** `engines.aumos` is
a semver range the installer matches against `AUMOS_APP_VERSION` and **refuses** on
(`engine-range`, blocking), and the marketplace entry carries the same string as `enginesAumos` so a
listing can say *not on this build* before a download. `untilled/aumos#758` recorded ⬜ *«no device
for declaring a minimum host version exists»*; that is the device, and it has been there since the
manifest had two version fields. ⛔ **What does not exist is a way to say «a host that has
`priceLevels`»** — `ampVersion` is `z.literal(1)` and will still be `1` after this ships, and a new
manifest field would be the very change #238 measured: a key added to the manifest made all five
published packages `unreadable` on the binaries investors were running.

**The range stays `>=0.4.0`, which is the floor 0.5.0 already declared for `untilled/aumos#743`.**
⚠️ It is a statement about a release *number*, and the thing that has to be true of it is a
statement about release *contents*: that the first release satisfying it carries #758. That is not
checkable from this repository — the host is private and its releases are cut by hand — so it is
recorded here rather than asserted, and the remedy is one line: **if #758 lands after 0.4.0 is cut,
raise this range before this version is published.**

### And why a wrong bet on that number costs nothing

⚠️ **Because the field is also negotiated at run time, and that is what makes the range safe rather
than load-bearing.** `decision_submit`'s published `inputSchema` is derived from the host's own judge
**at run time** — the manager reads the schema the judgement will be measured against, not a copy of
it — so *does this Aumos read `priceLevels`?* has an honest answer inside the run. `PROMPT.md` §6
says to read it and to **omit the field and name the omission in `uncertainty`** when it is not
declared. So the worst case of a version range that is one release too generous is a run that
behaves exactly as 0.5.0 did, rather than a judgement thrown away.

⛔ **It is an instruction and not enforcement, and the difference is stated rather than hidden.** No
hook can check it: `hooks/guard-submit.mjs` sees the tool input on `PreToolUse` and never the tool's
schema, and this package's own MCP server cannot see the host's. Enforcement is `engines.aumos`;
this is the belt beside it. ⚠️ The one thing that *is* checked here is that the sentence exists —
`tools/verify-evidence-gated-allocator.mjs` fails if §6 stops carrying it, because the argument
above is the only reason the range is allowed to be a bet.

### What is deliberately not stated, and by which packages

⛔ **No `take-profit` level is emitted.** The schema carries the purpose and this methodology does
not compute one: `thesisValuation.fairValueRange` is a **valuation** — the bear, base and bull
targets — and turning its high end into a level where the book sells is a rule the methodology never
declared. #756 says price levels are not forced on every strategy, and this is that case.
⛔ **No band from a ladder either.** Three rungs are three points; a band is *a range you would work
across*, and this plan acts at its rungs and nowhere between them. The builder supports bands and
`priceLevels` accepts one from a run that genuinely concluded a range — the fixture exercises it —
but `entryTranchePlan` never folds a ladder into one.

⚠️ **The other eight packages in this catalogue state no levels, and that is a judgement rather than
a backlog.** None of them computes a price with an investment purpose attached: the two
`atlas-trend` sleeves and `atlas-trend-crypto` exit on an ensemble vote and hold no stop price,
`prudent-allocator` and `basic-investor` are weight-first and read a stop only as prose inside a
thesis somebody else wrote, `undervalued-now` arms one `at-time` watch by construction, and
`earnings-drift-watcher` decides on a surprise rather than a level. The one real candidate is
`ai-hedge-fund-value`, whose `price-below` watch *is* an entry price in prose — *"revisit if the
price falls far enough for Graham's margin of safety to exist"* — and it is a number the model
writes rather than one the package computes, so stating it would be adding a field to a judgement
this catalogue cannot check. It stays open until that price has a deterministic author.

## Execution state (#212 ④) — ✅ the counts exist, and what is left to prove is the join

**0.4.57 stops inferring execution state from diagnostics and reads the host's counts instead.**
`mandateExecution` decided *«why does this book hold no single name?»* by intersecting the codes its
siblings returned with the lanes of `lib/diagnostic-codes.mjs`, and the positive answer was granted
by one member of a `gate-ran` lane — a code that says a gate refused **one** name and says nothing
about whether the roster was prepared. `untilled/aumos#724` and `#730` gave the host a research job
and a research result that count, `executionRecord` reads them, and `README.md` carries the
deleted-to-replacement pairing.

✅ **And half of that reading is discharged by `untilled/aumos#743` §B, which took the right half
away.** `research_result_get` is deleted and with it the settled summary's `sourced` and
`unprepared`. Those two said *this fund held readable documents for this name* — a judgement about
documents that only the domain reading them makes, and a common executor making it was the app
holding an investment opinion. So the counting is split: `task_get` says how many items, how many
pending, done and failed, the recipe writes `sourced` onto each answer, and `executionRecord` derives
`sourced`/`unprepared`/`evaluated` from the answers this run read back with `files_read`.
`executionRecord`'s inputs are `{started, run, rows, eligibleSymbols}` and its `basis` vocabulary is
`rows` · `run` · `none`. ⚠️ **A settled task run whose answer files were never read is `unsettled`
and not `prepared`** — finishing is the host's fact and preparing is ours.

⚠️ **`engines.aumos` moves for this, and for the tool names rather than for a capability.** The floor
is `>=0.4.0` — the release carrying #743's twelve file tools and three task tools. ⛔ No capability
and no manifest key was added, so an older build does **not** refuse this manifest: it serves a grant
whose tool names nothing here calls, which is an absence to report in `uncertainty`
exactly as `skills/candidate-research/SKILL.md` already says, and on such a host this operation
answers `basis: 'none'` / `dataPreparation: 'unevaluated'` and `mandateExecution` says `unreported`.
⛔ **That is the designed answer and not a degradation to paper over**: *«nobody said»* is not a pass,
and the alternative — falling back to the code lane — is the inference this revision removes.
⚠️ Quiet is the whole risk here: the five earlier floors moved to avoid a **refused** manifest, and
this one moves to avoid a served grant nobody calls.

### ⛔ Still owed by the host: nothing, and one number is deliberately ours

⚠️ **`eligibleCount` is not a host field and should not become one.** Eligibility is a methodology
verdict — which of the recipe's answers cleared the lens envelopes, the evidence gates and the
challenge — so it arrives as `eligibleSymbols`, the names this package's own fold arrived at, and the
count is derived from them. A host field for it would be Aumos deciding what *eligible* means for
every manager, which is the boundary `#209` §8-D drew when it put the recipe on this side.

⬜ **Not measured on this side: a run against a live task run.** This repository has no host, so
every count above is fixture-fed. ✅ **The join this entry named is gone rather than proven**
(`untilled/aumos#743` §B): it read *"that a settled `research_result_get` summary arrives here with
those five keys as whole numbers"*, and there is no such summary — `research_result_get` is deleted.
⚠️ **What replaced it is a smaller claim about a shape this package writes itself.** The host's half
is `task_get`'s four whole numbers (`total`, `pending`, `done`, `failed`) and the answers' half is
`sourced` on each answer file, which `recipes/request.mjs` writes and `files_read` returns. So the
unproven join is now *that an answer file written by this package's own recipe reads back through
`files_read` with `sourced` on it* — checkable by a reader in a way an asserted count was not. ⛔ A
record this operation did not produce is still refused as `execution_record_unreadable` rather than
read as zero, so the failure is reportable rather than silent — which is what makes the absence of
the measurement survivable, not what makes it unnecessary.

## Prepared research (#209 §8-D) — ✅ the route exists and the input is now fed

**0.4.53 declares two recipes and asks the host to run them.** `untilled/aumos#725` gave the host
`research_prepare` / `research_job_get` / `research_job_cancel` / `research_result_get` and a way to
run a named computation in its own process over stored inputs; `untilled/aumos#726` let a published
package put its own name on one, in `manifest.recipes`. This package now declares `roster-scan` and
`opportunity-metrics`, whose entrypoints call the same `execute()` the MCP tool calls, and the
whole-universe sweep is routed through them. `engines.aumos` moved to `>=0.3.34` — **the next
release at the time**, because neither host PR was merged when this was written and
`research:prepare` / `research:read` were in no released binary, so an installed Aumos refused the
manifest whole. Same failure mode as `observation:file` below, for the fifth time.

✅ **Three of those four tools shipped renamed and the fourth was deleted** (`untilled/aumos#743`).
`research_prepare` is **`task_start`** (`{recipeId, items, parameters, outputPath, asOf,
idempotencyKey?}`, `items` a list of `{id, input?}`), `research_job_get` is **`task_get`**,
`research_job_cancel` is **`task_cancel`**, and `research_result_get` has **no replacement**: each
answer is a file at `<outputPath>/<itemId>.json`, read with `files_read`. ⚠️ **The capability
spellings did not move and must not** — `research:prepare` and `research:read` are the AMP
vocabulary's, and a renamed enum member stops every published manifest parsing. ⚠️ **Two properties
of the new call are load-bearing on this side**: the item `id` must be the store's document
coordinate `<MIC>:<symbol>` (`XKRX:005930`), because that equality is what makes the host hand the
recipe this fund's stored documents, while the package's own `{symbol, market}` spelling rides in
`input` and the host never parses it; and `outputPath` is part of the cache identity, so
`scans/<asOf's calendar day>/<recipeId>` is asked for by name rather than left to a default.
`engines.aumos` moves to `>=0.4.0`. ⛔ **And the failure mode is the opposite of the five before
it**: no capability changed, so an older build does not refuse this manifest — it serves
`research_prepare` and friends while every instruction surface here calls `task_start`, and the run
reports the absence and submits a WAIT. That is quieter than a refusal.

### ✅ Discharged: a collector writes a price series (`untilled/aumos#734`)

**What was owed here was one row, and the host added it.** This section used to record that
`COLLECTOR_ROUTES` held three rows — `open-dart/filings`, `open-dart/financials`,
`sec-edgar/companyfacts` — none of them a price series, so a roster prepared through
`research_prepare` came back with filings and no bars and both recipes answered
`scanner_history_insufficient` / `opportunity_history_insufficient` with `count: 0`. It is deleted
rather than carried forward because the sentence that made it true stopped being true:
**`prices`/`daily` exists**, it writes exactly the `reading.normalized.bars` payload these recipes
already read, and 0.4.55 calls it. ⛔ Nothing under `recipes/` or `lib/` changed to receive it — the
prediction this file recorded (*"the day a row exists for it these recipes are already fed"*) is the
thing that was checked.

⚠️ **What arrived is not what this file guessed.** It expected a `toss/bars` or `alpaca/bars` row —
a vendor-named coordinate beside the two filing publishers. The host refused that shape and put the
series on the **price-source** side of `naming.md` §4g instead: `MarketDataPort.history()` has been
in the contract since aumos#161 with five adapters implementing it and no caller, so what #734 added
was the caller. The store id is **`prices`** and never a vendor, which is why the instructions in
this package name no vendor either, and why the series the sweep reads and the closes the Wake
Engine marks the book with come from one function rather than from two lists that agree.
⛔ `market_history` did **not** come back: no tool and no capability was added, no bar reaches an
MCP payload, and what this package calls is `source_cache_refresh`, which it has held since 0.3.30.

⚠️ **Three properties of it are load-bearing on this side and are written into the instructions**
(`skills/data-source-contract/SKILL.md` owns them): `market` is the **venue MIC** and the `kr`/`us`
research markets are refused, `vendorId` is refused, and the collection is **incremental** — a
re-run over the same closed bar reaches no vendor and answers `satisfied`, which is what makes
*«refresh the whole roster, every run»* an affordable instruction rather than a wasteful one.

### ⛔ Still owed by the host: nothing, and the remaining risk is ours to measure

⚠️ **`engines.aumos` does not move for this.** `prices`/`daily` is a **document name inside a tool
this manifest already declares**, not a capability and not a manifest key, so a host that predates
#734 refuses the name at call time — by name, with the accepted names in the message — instead of
refusing this manifest whole. Raising the floor would trade a reportable run-time refusal for the
silent catalogue drop this file has now recorded five times, and the floor is set by what the
manifest and the instructions genuinely cannot be read without: `>=0.3.34` for #724/#726 when this
was written, `>=0.4.0` since #743 renamed the tools those instructions call.
⚠️ **So there is a window** — a host below #734 — in which the refresh is refused and
the sweep is `unprepared`. That is the state every document here already describes, with the names
attached, and it is why the wording was not deleted along with the debt.

⬜ **Not measured on this side: a run with a live price source.** #734's own suite is fixture-fixed,
this repository has no host at all, and `check:recipes` measures the recipes rather than the
collector. What is unproven is the join — that a roster refreshed on `prices`/`daily` arrives at
`roster-scan` as bars — and the first run with a connected broker answers it.
⬜ And a run pinned during a session cannot see that session's own bar (`publishedAt = start + 24h`,
about eight and a half hours after the XKRX close). One row in two hundred, stated in the
instructions so it is not re-asked for and not reported as starvation.

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
`blocked` — raised by `proposalDisclosure` since #212 ②, never by the arithmetic. It is a workaround, and it works only for managers that choose to do it. **What would
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

- `source_cache_refresh` routes four documents — `open-dart`/`filings`, `open-dart`/`financials`,
  `sec-edgar`/`companyfacts` and, since `untilled/aumos#734`, `prices`/`daily`. There is still
  **no cache document for the corp-code registry**, so the
  registry stays a `source_request` and its ZIP arrives relayed as sent — a run that cannot
  decompress it falls back to reading `corp_code`/`stock_code` off `list.json` rows.
- `CachedDocument.normalized.metrics` is a free-form map. This package reads operating income and
  revenue under the names it has measured and reports `cache_metrics_unrecognized` rather than
  guessing when neither appears.

The old `entry_quality_unverified` wording also misled the run: `entryQualityGate` consumes
historical OHLC bars, not previous scan runs. Fetching sufficient dated bars permits evaluation
on the first run; a durable scan-history database is not required for that gate. §3 of `PROMPT.md`
carried the same misreading and no longer does.

## The cadence basis, and the two things the cache cannot say (#228)

`catalystCadence` derives the next expected disclosure window out of the filings the branch already
read, which is what ended the catalyst axis's structural starvation without weakening the rule that
every registered window is citable. ⛔ **Nothing was asked of the host to do it and nothing new was
approved** — the capability set did not move by one row, and the inputs are the `source_cache_read`
documents `radarCandidates` is already given. Two debts are recorded here because they bound what
the derivation can honestly claim, not because the stage is blocked on them.

### ⛔ Still owed by the host: a cached document does not name its own Evidence id

The `CachedDocument` shape this package has measured is `{ publishedAt, version, normalized }` and
carries **no Aumos evidence id**, so a derived window cannot cite the filings it was measured over
from the cache answer alone. `catalystCadence` therefore takes the join as a separate `evidence`
argument keyed by `documentKey`, which the flow fills from `evidence_search` — and ⛔ a document it
cannot cite derives nothing (`cadence_basis_uncited`), because the discipline that refuses an uncited
reading is repointed at the basis rather than relaxed. ⚠️ **The cost is a round trip and a join the
package maintains**, and the join is by `documentKey`, which is the host's own key: if
`source_cache_read` carried the evidence id on the document, the argument and its failure mode both
disappear. Until it does, a flow that skips the join gets a sleeve with a measured cadence and zero
derived windows, which is at least the honest shape.

### ⛔ Still owed by the host: the cache holds regular reports, not primary disclosures

Primary disclosure runs **ahead** of the regular report — a KR filer publishes 잠정실적 and a US one an
earnings release days-to-weeks before the document whose lag this median measures — so a raw
filing-cadence estimate is systematically late. That is the ported-from harness's own recorded
finding and it is why this operation registers a **window** rather than a date: it opens at the
earliest regular-report lag this cache has actually shown and closes at the latest, and every row
carries `leadDays` and `leadBasis` saying how far ahead it was opened and on what.

⚠️ **What that does not do is measure the primary disclosure itself**, and the answer says so:
`leadCovers` is *the regular report only; a primary disclosure ahead of the earliest cached lag opens
before this window*. Closing it needs a primary-disclosure document in the cache — `source_cache_refresh`
routes `open-dart`/`filings`, `open-dart`/`financials`, `sec-edgar`/`companyfacts` and `prices`/`daily`,
and none of them is one. ⛔ **It is deliberately not closed with a constant.** A lead lifted out of
another book's cache is an assertion about this one, which is the same mistake as importing the
harness's KR 45 / US 30 medians — and this operation exists partly to refuse that.

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
`review_superseded`, first-person, reported and not withdrawn — and, being the only duplicate left,
reported with the orphan's `planId` where `standingPlans` names it and with which silence it is
where it does not (`untilled/aumos-catalogue#202`). ⬜ **And merged is not shipped**: the
fold landed after `untilled/aumos` `v0.3.32`, so a host older than it still keeps the row, and the
depth read from `standingPlans` remains something to report rather than a reason to arm less.
(`untilled/aumos-catalogue#175`)

The #136 claim that correctly supplied `previous.armed` never deduped was refuted in #148; #148's
own conclusion that the journal is authoritative about arming was refuted in #156. Do not carry
either forward as a confirmed rule — `refutedMemoryRules` retracts the second from durable memory.

## The refusal two encodings were built against (#136 — ✅ closed by `untilled/aumos#743`)

⚠️ **The debt here was never "relax the timestamp guard", and the host did not.** `memory_read`
refused a result carrying any ISO-8601-shaped string later than `asOf`, and the pattern deliberately
included the date-only form because that is what SEC's `filed` means. Two keys hold such values by
construction: `run/armed-reviews` is future, and `run/watch-alerts` named the current session, whose
date is on or after `asOf`'s. So both were refused in normal operation — measured on
`run_3a48eaaa505241d5af94fb490d7c23c6`: three armed rows, three violations, the read refused, and
because the refusal was per read rather than per key the run's first keyless `memory_read` died with
it and twelve keys had to be fetched one at a time. `untilled/aumos#658`/`#659` folded that per entry
and named the dropped keys in `omitted.keys`; the key itself was still not read.

✅ **#743 closed it by moving the record.** `files_read` answers the document as one opaque string
and the outgoing scan is anchored, so a whole JSON body is not a timestamp and its leaves are never
walked — and the keyless-read collapse cannot recur either, because a folder is listed and read by
path instead of fetched as one payload of every key at once. ⛔ **Nothing was asked for and nothing
was granted**: no exemption, no per-field schedule declaration, and the ⛔ this file carried against
one — *which field is scheduled is the manager's private schema, and a gateway that knows it is a
second table of every manager's fields* — stands unchanged and unused.

⛔ **The two encodings stay, and they are this package's canon now rather than an accommodation.**
`atEpochMs` in `run/armed-reviews`, the three epoch instants in `research/catalyst-window`, and the
`session-` prefix in `run/watch-alerts` all mean exactly what they meant; every reader here expects
them, and re-encoding stored records to celebrate a lifted restriction is a migration with no
benefit and a readable-history cost. ⚠️ `toArm` was always RFC 3339 and is untouched — it leaves in
a `DecisionProposal`, where AMP takes strings and this guard never ran.
([#136](https://github.com/untilled/aumos-catalogue/issues/136))

## Which promise opened this run (`untilled/aumos#622` landed; the window is what is left)

⚠️ **This package used to answer that question with a regex over a host sentence.** The flow a wake
was armed for rode inside the watch's `intent`, and `intent` reaches a woken run only as part of the
event `summary` the wake engine composes — `` `${verdict.reason} — watching for: ${intent}` ``. So
`resolveWakeFlow` read `market-review:<flow>:<at>` out of that sentence, and out of `watchId` as
well, which is Aumos's opaque `eventId` and has never contained a marker in any version of this
package. Two consequences: the dispatch decision was a copy of host-owned state recovered from
prose, and a rewording upstream would have taken it silently.

✅ **The host already answers it structurally.** `decisions[].armed` carries
`fate: 'fired'` with `review: 'this-run'` (`untilled/aumos#622`) — *this is what woke you* — beside
the `planId` and the instant the condition was met. This package now reads that first and reports
which channel answered (`basis`), and the `armed` scan is confined to that one pair: ⛔ never a
length, never a receipt. The refusal in `reconcileArmedReviews`
(`armed_journal_not_a_receipt`) is unchanged, because *"is it armed"* is a question that field does
not answer in any tense. (`untilled/aumos-catalogue#212` ⑤)

### ⛔ Still owed by the host: the wake does not name its own plan

`armed` hangs off `history.recentDecisions`, and that is a **window** (`untilled/aumos#688`). The
judgement that armed a review can fall out of it, and then the host's attribution is absent for a
wake the host did attribute. `standingPlans` is not the substitute: a promise that has fired is no
longer standing at `asOf`, by construction.

So the prose path stays as a **boundary adapter** — one fall-through, after the host has been asked
— and every use of it is reported by name: `wake_flow_recovered_from_prose` is the receipt for the
use itself, and beside it the reason the host was not the answer, `wake_attribution_unreadable` (no
`armed` was handed over, which the caller can fix) or `wake_flow_unattributed` (handed over and
naming nothing of this manager's, which it cannot).

⚠️ **And the receipt is what measures the removal** (#223). The two reason codes fire for wakes
that never touch the adapter — a manual run has no marker to read — so counting them would say the
adapter is load-bearing when it is idle. `wake_flow_recovered_from_prose` counts uses.

⚠️ **The removal condition is a host fact rather than a release date.** Delete the adapter — the
marker scan, `wake_marker_unreadable` on the prose path, and `wake_flow_recovered_from_prose` —
when the invocation names the fired plan **on the wake itself**: a `planId` on the `plan-trigger` event, or
any equivalent field not bounded by the `recentDecisions` window. `AumosEvent` is a strict object of
`eventId`, `kind`, `subject`, `occurredAt`, `detectedAt`, `summary`, `materiality` and `evidenceIds`,
so this is a host schema change and not something this side can arrange. ⛔ Until then, deleting the
adapter would make a wake whose arming judgement has aged out dispatch all three flows — three times
the work and each sleeve judged twice, which is the `#87` state.

⚠️ **`engines.aumos` does not move for this.** The floor already carries `#622` — `>=0.3.34` when
this was written, `>=0.4.0` since #743 — and the fallback is what covers the window rather than an
older host.

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
too generous. The binding fact was that the venue minimum (USD 200) sat above the control arm's
single-name cell (1% of USD 14,866.44 = USD 148.66), so no US name entered that lane at any share
price. ⚠️ **#226 removed the cell.** The comparison is now against the cap that binds —
`minimum_executable_exceeds_cap`, with the resolving NAV — and on the measured book USD 200 is
1.34% against a 20% cap, so it does not fire at all. That is the fix rather than a widened
tolerance: the position the arithmetic asks for is above the minimum ticket, where before it was
below.

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
  "effective": 0.1875,
  "reason": "risk_budget",          // this package's own code, rendered opaque
  "unlocks": "portfolioHeat: maxDrawdown 0.06 · held 0.045 · stop 0.08" }
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

### Where that refusal lives, and what is deleted when the host takes it (#212 ②)

⚠️ **The refusal moved out of the arithmetic on 2026-09-08 and it did not move to the host.**
`effectivePositionCap` used to read the proposal's `uncertainty`, `risks` and `effectiveConstraints`
and push `blocked` — and `targetWeight` returns `null` for any `blocked` diagnostic it is handed, so
**rewording one sentence changed a position weight**. A run that rephrased the entry carrying the
token lost its size; a run that pasted a token it never understood kept it. The calculation now
returns `disclosures` — the code, the fields it is owed in, and the `effectiveConstraints` row to
copy — and **`proposalDisclosure`** is the operation that reads an assembled proposal and emits
`position_cap_reduction_undisclosed` / `main_lane_attestation_undisclosed`.

⛔ **That is still this package checking its own homework.** The obligation belongs on the approval
screen: the host holds `DecisionProposal.effectiveConstraints` and renders `rationale.risks`, so it
is the only surface that can refuse to *draw* a size whose disclosure is absent, whatever the
manager chose to do. `proposalDisclosure` is where the check stands until that exists — and it is
one operation rather than a rule inside the arithmetic precisely so that it can be removed without
touching a number.

**What is deleted here on the day the host enforces it** — the day `Approvals.tsx` (or its
successor) refuses, or visibly annotates, a proposal whose `effectiveConstraints` do not match the
sealed sizing and whose `rationale.risks` does not carry a required attestation code:

| deleted | kept |
|---|---|
| `lib/proposal.mjs` in full, and the `proposalDisclosure` registration in `lib/index.mjs` | `effectivePositionCap.data.disclosures` — the host needs to be *told* what is owed |
| the `proposalDisclosure` contract row in `lib/input-contracts.mjs`, and its two rows in `skills/deterministic-metrics/SKILL.md` | `effectiveConstraints`, `mainLaneAttestation` and both `unevaluated` codes (`position_cap_reduced_by_maturity`, `main_lane_rests_on_manager_attestation`) |
| step 4e of `skills/sizing-and-concentration/SKILL.md` and the `proposalDisclosure` sentences in `PROMPT.md` §2 / §4 | the instruction to carry the code verbatim in `uncertainty` and `rationale.risks` — the host refusing it does not make it optional |
| the `proposalDisclosure` assertions in `tools/verify-evidence-gated-allocator.mjs` and `tools/verify-evidence-gated-input-regressions.mjs` | ⛔ **the prose-invariance test**, which is about the arithmetic and outlives every host change |

⛔ **Not before.** Deleting the check while no screen refuses is #692's ⑴ collapsing into ⑶: the
investor approves a size whose supporting evidence they were never told was self-reported, and the
requirement is dropped without anyone deciding to drop it.

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
`thesis:write`, and what `thesis:read` serves is a read path — `thesis_list`/`thesis_get` — with
nothing to register a gate into, so there is no such file and no equivalent. ⚠️ **This entry used to
say that grant maps to an empty tool list, which stopped being true and does not change the
conclusion**: reading claims back was never the missing half, writing one was.

⛔ **The instance's private folder is not the substitute and must not become one.**
`skills/memory-contract`
forbids exactly this shape — *"a gate that must execute"* and a hidden portfolio database — and a
per-position stop table would be both. ⚠️ **`untilled/aumos#743` widened the address space and not
the licence**: a file tree is exactly the shape in which a per-position stop table would look
natural, and it is refused as a path for the reason it was refused as a key. So the discipline is **re-derived from the entry date every
run** rather than read back from state, which is correct but pays for the missing read path twice:
a WATCH armed at entry could not be seen at all, and the same #97 gap that cost duplicate
scheduling cost an unverifiable stop here. ⚠️ **`standingPlans` closed the seeing half and not the
verifying half** — the read is a floor, so a stop present in it did stand at `asOf` while one absent
from it may still be standing, and «absent» is therefore not a finding. So the discipline is still
re-derived from the entry date every run, and the package still discloses that the arm is unverified
rather than assuming it stands.

⚠️ **2026-09-08: the number is now stated as well as armed.** `priceLevelsToRegister` returns the
same stop as a `priceLevels` row with `purpose: 'stop'`, built by the same call that builds the
`price-below` and holding the same `Money` and `key` — see the `untilled/aumos#756` section above.
⛔ It does not close the read-back gap and must not be read as closing it: a level is a statement in
a proposal, exactly as the WATCH was, and this package still cannot read either one back.

⚠️ **The stop distance itself waits on the investor, not the host.** `mandate.constraints.maxDrawdown`
is undeclared, so outside the control arm the distance comes back `hard_stop_unevaluated` with the
declaration that resolves it named in the diagnostic. No number is invented, and the control arm —
whose −8% is the source's own approved number — is fully judged today. ⚠️ **Since #226 that same
undeclared `maxDrawdown` costs a second answer**: `effectivePositionCap`'s risk budget is
`(maxDrawdown − heldPortfolioHeat) / |stopLossPct|`, so without it the position is
`position_risk_budget_unevaluated` and the Mandate's cap is the only thing between the candidate
and the whole book.

## Closed outcomes reach one maturity axis, not both (#153 · #118)

`closedOutcomeSamples` turns a closed decision into the calibration sample that moves
`maturityStatus`. ⚠️ **Since #226 that axis reads no ceiling** — the experimental lane is gone and
`maturityStatus` is an attribution label — so what this conversion feeds is what the run may
*claim*, and the Aumos decision ledger is where the learning now lands. That conversion previously
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


## The experimental lane is gone and the ledger is the sample (#226)

⚠️ **This package's half is done and the host's half is what it always was.** The investor removed
the maturity lane on 2026-09-08 and moved the learning temperament from paper cohorts to the **Aumos
decision ledger and its Forward Track Record** — `closedOutcomeSamples`, `outcomeClassification`,
`attribution`. Every one of those reads a record only Aumos holds: a sealed Decision, the order that
executed under it, and the forward return beside it.

⛔ **Nothing new is asked for.** The reads exist (`decisions[]`, `history`, `positions[].origin`,
`positions[].acquisition`), and what this revision changes is that they are now the *only* sample —
so their gaps stop being a reporting inconvenience and become the measurement itself. The two that
matter most: a decision whose forward return the host cannot attribute is a sample this package
cannot count, and `history.recentDecisions` is a window rather than a journal
(`history.totalDecisions` says so, `untilled/aumos#688`).

⚠️ **The risk transfer belongs on this page too.** With no maturity gate, a first single name can
reach the Mandate's cap with zero closed outcomes behind it. Four of the five brakes left are this
package's arithmetic (the risk budget, `portfolioHeat`, `concentration`, `newSinglePacing`); the
fifth is the host's, and it is the strongest — **§12's per-order approval**. This package's answer
to *"what stops a 20% first position"* names it, and it names it as somebody else's.

## The cap raise reaches the investor as prose, and it should reach the screen as a number (#230)

⚠️ **This package's half is done and it lands in the wrong place for the wrong reason.**
`effectivePositionCap`, `effectiveCashFloor` and `concentration` compute `unlockDelta` — the control
the investor typed the limit into, the value to type instead, and the weight and amount that opens —
and `PROMPT.md` §4 sends it into `rationale.keyReasons`, because `Approvals.tsx` renders that and
`rationale.risks` and nothing else.

⛔ **`effectiveConstraints` is where it belongs and cannot go.** `effectiveConstraintSchema`
(`untilled/aumos#681`, issue #679) is a `strictObject` of exactly `field`, `declared`, `effective`,
`reason`, `unlocks` — so the one surface that draws the number *beside the control the investor
filled in* has no field for what raising it would open. The recommendation therefore reaches the
approval screen as a sentence and the fund-settings screen not at all, which is the half of #230 this
package cannot close: the investor reads *«raise 포트폴리오 히트 to 0.071»* on one screen and then goes
to another one that draws nothing.

**What would discharge it**: two optional numbers on that row — `unlocksWeight` and, if the host
wants the currency figure, `unlocksAmount` with `unlocksCurrency` — drawn beside the effective limit
as *«raising this to X opens Y»*. ⚠️ The host owns the arithmetic's other half already: it holds the
NAV, the mark and the currency, and this package's number is a weight against the same book.

⛔ **Nothing here waits on it.** The recommendation fires today, `proposalDisclosure` refuses a
proposal that owes one and is silent today, and the screen route is an improvement rather than a gate.

⚠️ **What is deleted here on the day that row exists**: the `keyReasons` slot stays — it is where an
*action for the investor* belongs before the approve button, and a fund-settings field nobody opened
does not reach them during an approval. What moves is that `unlockDelta` gets copied into the host
row as well as spoken, and `PROMPT.md` §4 gains the second half the way it gained
`effectiveConstraints` for the reduction.

⚠️ **One coupling this creates, stated rather than left to be discovered.** `MANDATE_CONTROLS` in
`lib/sizing.mjs` spells three Aumos control labels — «집중도 상한», «현금 비중», «포트폴리오 히트» —
and they are the **host's** vocabulary, on the host's pane, renamed by the host. A drift there is
silent: the recommendation stays arithmetically right and sends the investor to a label that is not on
the screen. ⛔ Naming the schema field instead is not the fix — `maxDrawdown` is asked for as
«포트폴리오 히트» (`untilled/aumos#685`) and the field name is the one thing that is certainly not
written anywhere the investor can see. The row on the host's own screen is what ends the coupling.
