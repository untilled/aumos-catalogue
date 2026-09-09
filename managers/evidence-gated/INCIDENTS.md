# What each rule in the prompt was measured against

`PROMPT.md` is the document a run loads before it does anything, and every sentence in it is paid
for twice — once in context and once in the attention it takes from the judgement. So it carries
**rules** and this file carries **why they are rules**: the run that failed, the number it produced,
and the reading that produced it.

> ⚠️ **This is a development document and no run loads it.** Moving a paragraph here is a claim
> that a model does not need it to execute correctly — that the rule survives on its own, and the
> story behind it is for whoever is deciding whether to change the rule. If a rule stops making
> sense without its story, the rule is written wrong; fix the rule rather than moving the story
> back.

⛔ **Nothing here is a rule.** A contradiction between this file and `PROMPT.md` is resolved in
favour of `PROMPT.md`, and this file is then wrong and gets fixed.

## The cost that made this file (#209, 2026-09-07)

One local run of this package, measured from the vendor's own JSONL with usage de-duplicated by
message id and subagents de-duplicated by `agent_id`:

- **29 unique subagents** — one `kr-sleeve` and **28 `general-purpose`**, a role this package
  declares nowhere. Three tiers deep:

  ```text
  orchestrator → kr-sleeve
    → DART registry harvest → page workers ×4
    → KR mechanical sweep   → batch workers ×13
    → KR filings            → batch workers ×7
    → DART statement-tag probe
  ```

- **313 model responses**, all `claude-opus-5`. 29 `Agent` calls, 166 `calculate`, 107
  `source_request`, 53 `connection_request`.
- `calculate` inputs serialised to **~1.91M characters** — `opportunityMetrics` 45 calls ≈ 960k,
  `scan` 40 calls ≈ 850k. Daily bar arrays, re-typed by a model as tool arguments so that another
  model could hand them back.
- `PROMPT.md` at ~90KB: a real `Read` of it returned **25,055 tokens against a 25,000 limit** and
  failed.
- **No `DecisionProposal` was submitted.** The subscription was spent before the methodology was
  reached.

Two answers came out of that, and they are the two halves of #209 §8-D:

⑴ **The topology is enforced rather than described.** `hooks/guard-budget.mjs` refuses a dispatch
from inside a flow, a `subagent_type` outside `agents/`, more than two dispatches of one flow and
more than six in a run. The header of that file carries the derivation of each number.

⑵ **The prompt is an execution contract.** Contract shapes come from `inputContracts` and the tool
schemas; diagnoses come from the diagnostic codes; incident history comes here.

⛔ **What did not change: the investment gates.** No cap, threshold, lane rule, evidence
requirement or maturity gate moved for cost. Where a rule lived only in the prompt's prose it was
carried across in the rewrite rather than dropped; `#209` names that explicitly.

## Orchestration

**All three flows ran on every wake (#87).** The three schedules were minted with a `flow` apiece
and nothing read it: the 05:45 KST wake judged Korea on yesterday's bar, the 16:00 KST wake judged
the US before its market opened, and `allocate` ran three times a day. Three times the work, and
each sleeve judged twice a day on data it had already read. `resolveWakeFlow` answers which flow
woke this run.

⚠️ **From #87 until #212 ⑤ it answered out of prose.** The flow was recovered by regex from the
event `summary` the wake engine composes — and from `watchId`, an opaque host `eventId` no version
of this package ever wrote into — so the dispatch decision was a copy of host-owned state read back
out of a host sentence. It is read from `decisions[].armed` now (`fate: 'fired'` /
`review: 'this-run'`, `untilled/aumos#622`), which carries the `planId` and the instant as fields.
The prose path survives as one reported fallback, because the judgement that armed a review can be
older than the `history.recentDecisions` window; `HOST-FOLLOWUPS.md` states what has to be true
before it is deleted.

**No flow had ever dispatched (#221).** Measured 2026-09-08, run
`run_c7ad46eea03840bf84ae7a8822ed02c3`, version 0.4.60: `hooks/guard-budget.mjs` built its roster
out of the stems of `agents/*.md` and compared with string equality, and the host enumerates a
plugin's agents as `<plugin>:<name>`. So `Agent(subagent_type: "evidence-gated:us-sleeve")` — the
only name the CLI offers — was refused by the hook as `delegation_flow_undeclared`, and
`Agent(subagent_type: "us-sleeve")` — the only name the hook accepted — was refused by the CLI as
*Agent type not found*. A two-sided deadlock with no value in between: every wake and every manual
run since the guard landed ran **orchestrator-alone**, and `agents/*.md` and the three sleeve skills
were never loaded once. The guard's own message named the working exit (*"do the work here"*), so
the run degraded safely and said so in `uncertainty` — the failure was that the designed topology
was unreachable, not that anything unsafe happened. `canonicalFlow()` resolves both spellings to the
stem and checks the prefix against this package's manifest id, so another plugin's worker sharing
one of our names is still refused.

⚠️ **The premise was written down and still went stale.** The comment on `declaredFlows()` said the
stem *"is what `subagent_type` takes"* — true when written, and nothing re-read it when the host
changed. `hooks/guard-submit.mjs` was checked in the same pass and is unaffected: it discriminates
on the *presence* of `agent_id`, never on a name.

**The two flowless wakes were the same observation (#223).** `resolveWakeFlow` reported the legacy
adapter by name — and only after the adapter had decoded a marker, so the two wakes that reach it
most often reported nothing. Measured 2026-09-08, run `run_c7ad46eea03840bf84ae7a8822ed02c3` at
0.4.60: `armed` flattened to three rows, all `fate: 'fired'` / `review: 'no-judgement'`, answered
`data: null` with `diagnostics: []`; no input at all answered `data: null` with `diagnostics: []`;
a synthetic `review: 'this-run'` row resolved correctly. The reader was fine and the reporting was
absent. The failure direction is safe — `null` dispatches every flow, a superset of what fired — but
the two states are fixed differently: unreadable is the run's own omission, unattributed is the host
attributing elsewhere and means the prose adapter is now load-bearing. So that run inferred which
one it was from what it remembered passing and recorded the inference as the operation's answer. The
two codes fire ahead of the fall-through now, and `wake_flow_recovered_from_prose` is the receipt
for the adapter itself — the half of the promise that had no producer at all, and the only one of
the three that counts *uses* of it.

**A flow that is not told its tools goes looking.** Measured 2026-08-27: a flow dispatched without
its tool list spent its whole turn discovering the session, reached for `Bash`, and the run ended
`awaiting-input` with no judgement. Measured 2026-09-01: a run reported the gap itself, having been
told to call four names the session did not hold — `thesis_read`, `evidence_read`,
`manager_memory_read`/`_write`, none of which any build has ever served under those names.
⚠️ **Two of the four name capabilities that are served, and the spellings were the whole defect**:
`thesis:read` and `evidence:read` answer through `thesis_list`/`thesis_get` and
`evidence_get`/`evidence_search`, and `manager_memory_read`/`_write` names nothing in any tense —
the private record was `memory_read`/`memory_write` and is `files_read`/`files_write` since
`untilled/aumos#743`.

**The web tools are the CLI's and the block left them out.** Measured 2026-09-04, run
`run_ba37a8f6907a49c3a805a4ce3ee10ec6`: the session held **both** `WebSearch` and `WebFetch`, the
dispatch block named neither, `agents/*.md` tells a flow that an unnamed tool is an absence to
report, and `skills/theme-radar/SKILL.md` forbids a silent fallback — so the flow did the only thing
the three documents left it and reported *no web lane*. This book's only discovery lane closed for
the run.

**`observation_file` left off the same block shut the 20% lane** (#182, `untilled/aumos#692`).
Measured 2026-09-07, run `run_996380fbdd9a41a5bb3d74f3eca761a2`: the `us-sleeve` flow reported
`observation_file_not_granted` and submitted **zero** filings rather than invent an excerpt — the
right call — and `effectivePositionCap` read back `variantView.satisfied: []`, `missing:
["thesisComplete","variantView","consensusRefs","challengeCleared"]`, `mainLaneOpen: false`,
declared cap **0.20 sized at 0.01**.

**A narrow `task` read as a narrow mandate.** The run that measured #140 was dispatched with a
prompt built around the holdings and a standing RESIZE, and both flows did exactly what they were
told. The flow skills now own the discovery step themselves; the dispatch block says it too,
because two documents saying it is what makes it survive one of them being read quickly.

## Scope and state (§1)

**The aggregate `cash` hid the currency split** (#174). On the book that measured it the aggregate
read USD 8,596.10 and **96.6% of it was won**, while a standing `allocate` plan asked about *"idle
USD 8,514.73"* that did not exist. Sourcing a rate from a vendor instead of `portfolio.fxRates` is
marking against a number nothing else in the invocation agrees with; on that run the vendor answered
403.

**A wrapped memory record read as a corrupt one** (#204). Four operations take a stored value whole
— `signalPaper`'s `state`, `reconcileArmedReviews`' `previous`, `refutedMemoryRules`' `patterns`,
`watchAlertState`' `previous` — and the §1 envelope is carried and not read. Naming each ignored
field back (`input_state_envelope_ignored` / `info`) is what keeps *this record never had the field*
and *this operation ignored it* two answers rather than one silence. ⛔ Ignoring stops at the
envelope: outside it an unknown key reads as a misspelled member, and a misspelled `openWindows` is
a track the operation cannot see.

## Pre-flight (§1b)

**No universe, no candidate, no word about either** (#140). Measured over six runs of one book: not
one universe declared, not one candidate generated, and nothing in any proposal that would let an
investor see it. The circle closed with no error in it — §3 names the lens when there are
candidates, candidates come out of the sweep, the sweep needs a declared universe, so the run that
had none never reached the step that would have noticed. `coverage` is therefore called **every
run**, and whatever it says is reported. ⚠️ **Where it is called moved** (`#246`): it is the last
step of the flow's checklist rather than pre-flight, because an extension registered mid-run is part
of the boundary it measures. What #140 requires is that it is called and reported at all, and that
is unchanged.

**Coverage complete over the empty set** (run `run_ba37a8f6907a49c3a805a4ce3ee10ec6`, 2026-09-04).
`coverage` was called with `scannerUniverses: []` and `extensions: []` and answered `complete: true`,
`uncovered: []`, no diagnostics — on a denominator made entirely of the book's own holdings. Hence
`complete: null`: `false` would say the run looked and found gaps.

**An extension declared and `complete: true` reported in the same run** (#246,
`run_bb689b6199084b04afd8b0e1d1528cda`, 2026-09-09). `kr-sleeve` persisted `extensions: ["001440"]`
and `us-sleeve` `["LEU"]` through `researchState`, and both reported `coverage.complete: true` /
`uncovered: []`. The orchestrator re-called `coverage` with those names in the universe and both
flipped — KR declared 77 / screened 75 / dispositions 74, US 85 / 84 / 83 — each with its new name
in `uncovered`, because neither had a `prices/daily` disposition; both flows had written *price
series not collected, paper thesis only* about them in the same breath. ⚠️ **Two flows did it in one
run, so it is a procedure and not an accident.** `coverage` was step 2 of the sleeve's own preamble,
where `extensions: []` makes `complete: true` genuinely honest — and the boundary then moved behind
the verdict. It is **step 18** now, after `researchState`, and `lib/flows.mjs` declares that order
so a verifier executes it instead of a paragraph asserting it. ⛔ Widening the boundary creates the
obligation to sweep inside it in the same run — that is what makes an extension part of the
*declared* universe — and a run that cannot produce the disposition reports `coverage` incomplete
with the name left in `uncovered` rather than dropping the extension. ⚠️ **The curated 74 all
dispositioned is real and is this book's first**; what this records is that the boundary moved after
it, not that the achievement was cancelled. ⛔ `discoveryCapacity`'s `emptyExtensionRuns` reset
(1 → 0) worked correctly and is untouched: gaining an extension is itself a success.

**The close buffers arrived at the wrong nesting.** A run that handed them at the top of `config`
got the package's own 30/45 with nothing said — #91's *"the number on the install screen governed
nothing"* arriving from the caller's side, and invisible on a book whose investor happened to type
30 and 45.

**An inherited position froze against the decision that explained it.** `history.recentDecisions` is
a window, so from the sixth decision on the judgement that explains an older holding drifts out of
it. Measured: 7 decisions, rows 3–7 carried, sequence 2 explained `069500`, the holding was judged
unexplained and `blocksExpansionOf` stopped it from ever unfreezing itself.

## Sources and evidence (§2)

**A lookup miss became a lane closure.** A vendor absent from `source_request`'s `Allowed:` list is
routinely present in `connection_request`'s, and the difference is where the credential lives.
Measured: four runs of five abandoned judgement for a price, bar and calendar lane that was
installed and answering throughout, because the first run wrote the miss into
`failures/repeated-patterns` and every later run inherited it as a rule.

**A figure was used and not cited.** On 2026-09-06 this manager confirmed the BOK base rate at 3.00%
(raised 2026-08-27, 6–1) in four web calls, **used it** to judge a `thesisSentinel` invalidation
condition, and submitted 24 evidence ids none of which supported it. Before `untilled/aumos#693`
there was nothing the run could have done; `observationLedger` makes the omission a finding.

**A prescription that returned the very bar it was written to avoid** (#224). This book carried, as
`CONFIRMED` in `failures/repeated-patterns`, *"`before` accepts an instant and is how you exclude a
mid-session partial bar"*. `before` is **inclusive**, and a Toss daily bar is stamped at the venue's
local midnight — so the sentence's own natural reading returns exactly today's unfinished bar.
Measured 2026-09-08 on 069500 during the XKRX session, three controlled calls:
`before=2026-09-08T00:00:00+09:00` and an omitted `before` both answered with the same 2026-09-08
first row; `before=2026-09-07T23:59:59+09:00` answered 2026-09-07. Two calls seconds apart
disagreed about that row — close 113,470 → 113,485, volume 11,452,779 → 11,466,966 — and its close
sat 2,665 above the real 2026-09-07 close of 110,820, so `trendState` read `close`, `ma20` and
`extensionPct` off a price no session ever printed and handed the answer to `trancheGuidance`.
⛔ **No existing defence could see it**: `bar_value_invalid` and `trend_moving_average_unavailable`
ask whether the row parsed, and a partial bar's OHLCV is complete and numeric. The shape was valid
and the data was wrong. ⚠️ **And the runtime half is deliberately weaker than the issue asked
for** — «that market is mid-session» is not a question this package may answer, because it holds no
market-hours table and the sleeves source the close for exactly that reason. What it detects is age,
on the host's own rule that a daily bar becomes readable 24 hours after its opening stamp
(aumos#732), reported as `newest_bar_may_be_unclosed` / `info` and refusing nothing: a run pinned
after the close holds a same-day bar that is complete, and refusing there would turn a correct
reading into no reading. On the corrected prescription the row does not appear at all, so it fires
exactly when a run did not follow it.

**A series whose shape was valid and whose history was wrong** (#248). #224 above closed the case
of one bar that has not closed. This is the case of two hundred bars that all closed and do not
belong to one price history, and the sentence that was supposed to cover it — *"adjusted and
unadjusted series are never mixed"* — had nothing behind it: no check in this package compared a
derived level against the price it was derived from. Measured on the 2026-09-09 US roster sweep (83
names, `roster-scan` answers): **BKNG** `close` 193.29 against `ma200` **2,316.55**, `offHigh200`
**−96.5%**, `ma200Discount: true`, `discoveryScore` **20**; **VZ** `close` 50.14 against `low200`
**10.5999**, `aboveLow200` **+373%**. Neither is a drawdown, and BKNG's score of 20 came entirely
from the artifact — `discoveryScore` reads `offHigh200` and `ma200Distance`, so the price branch's
ranking was partly made of it, and nothing in the run could say how many of the other eight names
that scored 20 had the same cause. ⛔ **Every existing defence passed it, and for #224's reason**:
`bar_value_invalid` asks whether the row parsed and all of them did, and
`trend_moving_average_unavailable` asks whether the average computed and 2,316.55 is a finite
number. `price_series_discontinuity_suspected` (`info`) reports three readings over the last 200
bars — the window the corrupted numbers are read from — and `indicators.discontinuity` carries the
count of adjacent sessions beyond ±50% on a clean name too, because a field that appears only when
something is broken is a field whose absence has to be interpreted. ⚠️ **It refuses nothing, and
that is the finding rather than a compromise**: a name that really did split has exactly this shape
and its history is exactly right. The defect was never that the artifact was allowed through; it
was that the reader had no way to tell one from the other. ⛔ And the series is not repaired — a
factor re-derived from the step would make this package the second author of a price history whose
first author is the vendor.

**A producer that worked and a registration path that could not be found** (#249). #228 built
`catalystCadence` so the catalyst axis would stop being starved, and on
`run_bb689b6199084b04afd8b0e1d1528cda` (2026-09-09, us-sleeve) it worked exactly as designed: status
ok, no diagnostics, `medianLagDays` **32** over **21** filings with `basisSymbols` 2 and
`measuredFrom: "host-source-cache"` — measured from this book's own cache and close to, but
deliberately not borrowed from, the ported-from harness's US 30. **It was this book's first derived
window, and it was computed and thrown away.** us-sleeve tried three shapes on `catalystRegister`
and reported all three: the cadence row on `catalysts` → `catalyst_estimate_unmarked` / blocked; the
window on `estimated` alone → refused for a shape reason; **the window on both arrays with the
markers stripped from the `catalysts` copy → registered, with `dateSource` reading `"observed"`**
(`withConfirmedCatalystInHorizon: 1` / `withEstimatedCatalystInHorizon: 0`). The third is the worst
of the three and it was the only one that got through, and the flow read the result and correctly
declined to store it. ⚠️ **The cause was published prose beside a published table.** `catalysts[]`
was a field table and `estimated[]` was a paragraph saying *"a separate argument on purpose"* — the
purpose without the shape — and a caller that has never sent an estimate has no wrong spelling to
learn from, which is #169's own argument for publishing `catalysts[]` in the first place. Three
things moved: the row is published field for field, 1:1 with what `catalystCadence` answers, and the
`cadenceBasis` under it; `catalystCadence` hands back `registerAs: { estimated }`, the same array
under the argument name that takes it, which is the `priceLevelsToRegister` pattern; and the same
`(market, symbol, event)` on both arrays is now `catalyst_estimate_unmarked` / **blocked**. ⛔ **No
new code for the third shape**, because `catalyst_estimate_unmarked` exists to prevent precisely
that reading and the fix a reader needs is the same one. ⚠️ The key is `(market, symbol, event)` and
not the window instants: a caller that rounded one copy's `windowEnd` by a millisecond would have
escaped the check while producing the identical record.

**A source that existed and a procedure that did not** (#229). `variantViewCheck` has four
requirements and one of them — `consensusRefs` — takes an input that is in no filing and on no
exchange feed. The session held `WebSearch`, `WebFetch` and `observation_file` throughout; what it
did not hold was a step telling it to go and get a consensus for a candidate. Measured on
`run_c7ad46eea03840bf84ae7a8822ed02c3` (asOf `2026-09-08T03:01:37.490Z`): `requirementReport` **0 of
4**, `consensusRefs` outstanding as *"no consensus row was given, so there is nothing the view
differs from"*. ⚠️ The run reported that as *"there is no consensus source"* — **overstated**, and
the wrong half is the one a reader acts on: a missing source is somebody else's to fix and a missing
step is this package's. ⛔ **Since #226 the cost is the whole position**, not a smaller one:
`variant_view_required_for_position` / `blocked` with `targetWeight: null`, so ten runs generated no
single-name proposal at any size. The spine was in the order that guarantees it — a step that files
a consensus reading and a step that ledgers it, and no step that fetches one — so the retrieval is
now a numbered step of `lib/flows.mjs` between the valuation and the filing, and
`candidate-research` §Consensus, before the thesis owns the procedure and the two figures it asks
for. ⚠️ **One reading closes three of `validateThesis`'s gaps**: the 036460 thesis that returned
+18.6%p carried *"애널 평균 목표 46,700원(고 59,000 / 저 26,000), 8 Buy·1 Sell"* — that sentence is
`consensusRefs`, and the same targets are what `expectedUpsidePct` and `fairValueRange` are read
out of.

## The watch layer (§2b)

**Three usable answers reported as nothing checked** (#157). `succeeded: 3` over `attempts: 10` used
to come back as three `lane_query_failed`, so a flow that queried web, open-dart and toss-market and
got answers from all three reported that it had checked nothing — and `audit_research_unverified`
plus `lane_query_failed` mean *this WAIT cannot claim it looked at news and filings*. That sentence
travelled into `uncertainty`, into the Brief, and into the next run.

**A price through a registered invalidation, reported as unjudgeable.** `threshold`, `observed` and
`observedAt` used to be dropped rather than refused, so a rule written under them joined its
evidence, found it, and answered *"Rule and evidence are not comparable"*. The fields the operation
reads are `level` / `at` on the rule and `value` / `availableAt` on the evidence row.

## Lenses and the discovery branches (§3)

**Three lanes starved, and nothing had ever fetched a filing** (#146). The 2026-09-06 run declared
its universe, swept it, called `upsideRadar` — and all three lanes came back `starved`, 0 included
of 13, on `no-valid-point-in-time-filing` and `no-event-in-the-last-30-days`. Nothing was wrong with
the lanes. The roster was there, `open-dart` answered, the parsers existed, and the one call that
joins them — the registry that turns a six-digit listing symbol into the `corp_code` every OpenDART
route is keyed by — had never been made.

**The US side was addressed by ticker and 404ed** (#179). Measured 2026-09-07:
`/api/xbrl/companyfacts/INTC` → **404 `NoSuchKey`**; `/api/xbrl/companyfacts/CIK0000050863.json` →
**200**. The allowlist's `{symbol}` is the CIK file name, and `cik_str` in `company_tickers.json` is
an unpadded integer.

**The catalyst axis had no producer at all** (#169). This paragraph used to read *"`earningsCheckpoint`
fills the rolling event window these lanes read"*, which describes a window rather than a step that
fills one. Measured on `run_73a3e6c41c204f468ee8be8d2923d898`, the first US branch this book ever fed
to the end: `post-event-continuation` 0 included of 83, every one `no-event-in-the-last-30-days`;
`inflection` 0 included, and the single name whose operating income had flipped −3,136M → +1,796M
against the previous comparable quarter excluded for `no-catalyst-registered-within-60-days`. The two
lenses that do not require a price fall were structurally dead and said so in sentences that read as
findings about the companies.

**One fed name published as a fed branch** (#178). A branch that fed 1 of 83 candidates reported
`fed` / `the-branch-was-fed` on the strength of `fedCount > 0`, so 82 names that never arrived were
published as names the run had judged.

**Three of four requirements, and a 20× reduction** (#160). The 2026-09-06 run built a full variant
view and was answered `satisfied: [variantView, consensusRefs, challengeCleared]`, `missing:
[thesisComplete]`, with the thesis gaps holding the fourth being `catalysts`,
`invalidationTriggers`, `expectedUpsidePct` and `fairValueRange`. `effectivePositionCap` turned a
declared `0.2` into an effective `0.01`. The main lane was not shut; it had never been opened.

**An `event` invalidation could not be written honestly.** `invalidationTriggers` refused
`kind: 'event'` outright — the diagnostic said *producer-less event is forbidden* and then refused
every event, produced or not — so a falsifier like *"자사주 매입 중단"*, which is what an
invalidation condition is supposed to be, had to be dropped or dressed as a `metric` with a level
nobody measures.

**A valuation number arriving beside four that gate reads as a fifth that gates** (#170) — the same
shape as #141's unread `parkedLiquidity`, from the other side. Hence `gates: false` /
`role: 'reported-not-gated'` on every row and `reportedNotGatedAxes` once in the answer.

**A gap with no source and a gap nobody fetched read identically.** This instance's
`run/theme-radar-last` generalised from the first case to the second on 2026-09-04;
`refutedMemoryRules` retracts that row.

**A run that found nothing locked the next three days** (#227). `themeRadarDue`'s clock was
`run/theme-radar-last.lastRunAt` — the last time the radar **ran** — where the methodology it was
ported from measures from the last `thesis_call`, so an empty radar reset an interval a productive
one would have kept running. Measured on this book: the radar ran **2 times across 10 runs**, the
second only because `ageDays` had drifted past the interval (3.5218 against 3), and
`coverage/research-index.extensions` was `[]` in all ten — on the branch §3 names as the only path
across the declared universe boundary. The verdict is `lastThesisCallAt`'s from 0.6.0, and the
streak of runs that moved nothing is counted by `discoveryCapacity` rather than left to be noticed.

**An override with no producer, for the life of the port** (#227). `themeRadarDue` has taken a
`dislocation` argument since it was written — the source runs the radar regardless of staleness in
dislocation weeks, the richest thesis environment it names — and nothing in this package ever set
it. `dislocationSignal` is the producer: an index 5% or more off its own window high, or a VIX
spike, both read from rows `validateMacro` had already dated and tiered.

**One score ordered three lenses, and its sign was backwards against the only thesis that worked**
(#242). `discoveryScore` is `meanCount / knownMean` — the fraction of the *mean-reversion* signal set
a name fires — and the flow researched in that order. A `trend-pullback` candidate carries none of
those five signals by construction: above its MA200 it is not near its 200-day low, not at a 10%
discount to that average, and rarely under RSI 30. So two of the three price lenses scored
**structurally zero** and were never reached. Measured on the 2026-09-09 KR sweep, 74 names, reading
the `roster-scan` answers directly:

| name | eligible | `discoveryScore` | lens | `offHigh200` | `ma200Distance` | what the run did |
|---|---|---:|---|---:|---:|---|
| `035900` | ✅ | **60** | mean-reversion | −50.4% | −33.8% | researched → `entry_quality_falling_knife` |
| `267260` | ✅ | **40** | mean-reversion | −49.1% | −19.9% | researched → declined on consensus |
| `316140` | ✅ | **0** | trend-pullback | −19.0% | **+7.8%** | **nothing** |

And the ported original wrote its own selection reason down: *200일 고점 대비 −28.6%(스캔 후보 중
**가장 덜 빠짐**), RSI 44 회복, 바닥다지기.* Least fallen — while this score paid 60 points for most
fallen. ⛔ The answer was not to flip the sign of one score: a single 0–100 number invites the
comparison whatever its label says, and the label already said `research-priority-only` while
pointing the other way. Each lens declares the measurement that orders it, the three are on three
different scales, and there is nothing left to sort three lenses by.

**157 names screened, four touched, nothing registered — there was no stage that finishes a
candidate** (#243). Measured on `run_bb689b6199084b04afd8b0e1d1528cda` (2026-09-09). The price branch
was fed and evaluated on both markets — KR 74 of 74, US 83 of 83, `unprepared` 0 — and produced 17
eligible KR candidates and 25 US. Four reached `variantViewCheck`: `267260` at **1 of 4**
(`thesisComplete`, `variantView`, `challengeCleared` outstanding), `LOW` at 2, `NKE` at 3
(`challengeCleared`, verdict `conditional_watch`), and `MCD` blocked earlier by
`entry_quality_falling_knife`. ⚠️ `consensusRefs` was satisfied on **both** markets for the first
time, which confirms #182 closed — and `267260` still stopped at 1 of 4, because the flow reached a
decline on the consensus and **never wrote the document.**

⛔ **The gates are not too strict, and the evidence is the one result this methodology has.** The
+18.6pp thesis cited above satisfied all four by hand — a named variant-view section, four dated and
sourced `consensusRefs` rows, one dated challenge cross-check, and bear/base/bull with a
probability-weighted return, a hard stop and a review date. Its pattern: **one name, deeply, every
artefact, small.** This run's: **157 names, screened, four touched, all declined, zero registered.**
The items were already listed in `candidate-research` §Candidate record; what no numbered step did
was carry one candidate to them.

⚠️ **And the reporting was the sharper half.** `267260` was declined *correctly* — 19 buy / 0 sell,
so there was nothing to differ from. But *«1 of 4»* does not read as «judged and declined»; it reads
as «there was nothing to judge», and only one of those is evidence the methodology ran. Hence
`candidate_completion_absent` as an `input-path` cause rather than a gate finding: it **withdraws**
`mandateExecution`'s positive answer over a lane whose leading candidate reached no document, and
blocks nothing — a `WAIT` with every document written and every candidate declined is an honest run,
and the point of the code is that the two can be told apart.

**242 files in one day's sweep folder, and folding them reports a roster nobody failed to read**
(`untilled/aumos-catalogue#245`, owner's store, 2026-09-09). `outputPath` is
`scans/<asOf's calendar day>/<recipeId>`, so the folder is keyed by **date and not by run**:
`scans/2026-09-09/roster-scan/` held 242 answers — 55 `XNYS:` and 28 `XNAS:` from a discarded
venue-keyed batch, beside the 83 `us:` and 76 `kr:` answers from the sweep that worked. Folding the
folder wholesale reads those 83 as `sourced: false` and reports `unprepared 83종`, ⚠️ **a fact that
does not exist** — they are a coordinate the run threw away, not names it could not read, and it is
the same misreading as `never-fed` reported as `fed-and-genuinely-empty` one layer up. The
separating key is each answer's own `evaluatedAsOf` — `00:39:16.609Z` on the discarded batch against
`11:23:55.210Z` on the live one, written by `recipes/request.mjs` from the host's pin. ⚠️ **The
instruction is `task_get`'s `outputs` and the check is `evaluatedAsOf`**: `outputs` names this run's
files and nothing else, so it needs no comparison at all. ⛔ `files_list` answers *what is on disk*,
which is a question about the folder and not about the run — a flow that lists a directory is
reading something nobody promised it.

**And the item id that filled that folder twice** (`untilled/aumos-catalogue#245`). `task_start`'s
item id is the key the store files documents under — the research market, `kr:` / `us:` — and it sat
one line under a `market` argument that genuinely takes the venue MIC. Six documents instructed the
MIC; five were corrected with the completion stage and `skills/orchestrate/SKILL.md` was the last.
⚠️ The US instruction was self-contradictory even inside the MIC reading: it said `XNAS:<symbol>`
while the roster's real split is XNYS 55 / XNAS 28, so 55 of 83 were wrong on its own terms. ⛔ An
invented id is **accepted** and the recipe is handed nothing, so the whole batch answers
`sourced: false` — shaped exactly like a market that offered nothing, and reached by no diagnostic
in this package, because the roster was declared, the refresh answered and the task settled. The
recovery is the sleeve skills' two-sided probe: one call, one name, both coordinates.

**`entryQualityGate` was documented as needing a scan history it does not read** (#147). Its input
is `bars` — 60 minimum, 200+ for the long indicators — so a first run that fetches enough dated bars
evaluates the gate on that run. #146 recorded the opposite reading and withdrew it.

## Sizing and scheduling (§4)

**A sector cap applied to no weight at all.** `sectors`, `theme` and `factor` used to be dropped
rather than refused, so a book whose sectors were spelled in the plural had its sector cap measured
over nothing while the answer read `status: ok`.

**A won sleeve valued at its dollar face.** `portfolio_read` marks every holding in the book's base
currency, so on a USD book a KRW listing arrives as a dollar figure. Omitting `valueCurrency` put USD
4,717.16 of KRW listings into the won bucket at face value: `krwSleeveNav` came back
**11,119,948.16** against a true 17,430,791.23 — short by the rate itself, `status: ok`, no
diagnostic. `marketValueBasis` now says which reading was used.

**Four clean gates, all clean for a reason none of them stated** (#141, #171). A book at 57.25% cash,
38.54% parked and 0.00% in any single name passes `concentration`, `effectiveCashFloor`,
`caps.portfolioHeat` and `singleNameBudget`, and `heldSingleNameWeight: 0` reads as *the lane has
room* rather than as *nothing this Mandate is for is being done*.

**A gate that doubled as a size dial, and shut the book** (#226, 2026-09-08). Measured on
`run_c7ad46eea03840bf84ae7a8822ed02c3`, NAV USD 14,937.07, USDKRW 1,340. `variantViewCheck` stood at
**0 of 4** because `consensusRefs` had no collection procedure, so every candidate was forced to the
control arm; the arm capped a single name at a flat **1%** with no floor lift, which is **USD
149.37** against a USD 200 minimum ticket, and `experimental_floor_exceeds_cap` refused it. The
chain, end to end:

```text
consensusRefs 수집 절차 없음 → variantViewCheck 0/4 → lane 강제 control-arm
→ 평면 1%, floor-lift 없음 → USD 149.37 < 최소 티켓 200 → 단일종목 0건
```

⚠️ **Ten runs, `singleNameWeight` 0, `cashLikeWeight` 0.956.** Every rule in that chain was
defensible alone. ⛔ And the package's own comment beside `experimentalPositionCeilingMax` claimed
the floor could *"reproduce what that methodology did"* — the source's 2.6% Experiment-stage KOGAS
entry — while the control-arm cap it fed through had no floor lift at all, so the reproduction was
structurally impossible. The investor's decision removed the lane rather than adding a fourth rule
to it, and `variantViewCheck` now refuses the position instead of shrinking it.

**A cause vocabulary that matched nothing** (#171). `mandateExecution` decides whether an empty book
is the methodology working or its gates never receiving inputs, by intersecting reported codes with a
vocabulary that was hand-written beside the reader while the codes are emitted by five other modules.
The 2026-09-07 run reported `corp_code_unmapped_symbols`, `radar_lane_starved` and
`lane_query_failed`, matched **none** of the thirteen entries, and was told the methodology was
working. `tools/verify-evidence-gated-diagnostic-codes.mjs` is the guard.

**`decisions[].armed` read as an arming receipt** (#201, #202, `untilled/aumos#687`). It is past
tense, and a review that armed cleanly and one that was never armed produce the same empty array. One
judgement armed four plans and only the one that had already TRIGGERED appeared in its `armed[]`.
Two consecutive runs read `armed: []` as *"the arm failed"* and left three intents standing 3 / 3 / 2
deep; one run armed **nothing** on the strength of `standingPlans` and three reviews happened to be
standing, which is luck and not a method. The rule filed in `failures/repeated-patterns` — *"when
`run/armed-reviews` and the host journal disagree, the journal wins"*, `CONFIRMED` /
`blocks-every-future-wake` — is the **cause** of the duplicate arming it was filed about, and
`refutedMemoryRules` retracts it.

**A Brief that reported zero standing reviews while six were ARMED.** `previouslyProposed` is what
this instance proposed, and it was presented as what stands. The count is reportable only from
`standingPlans`, and only as *at least this many*.

**A correctly filled key was refused in proportion to how well it was filled.** `run/armed-reviews`
holds future instants by design and `memory_read` refused a payload carrying a **string** timestamp
after `asOf` — and the refusal took the whole namespace read with it, not just this key. Hence epoch
milliseconds there and in `research/catalyst-window`. ⚠️ **`memory_read` is gone as of
`untilled/aumos#743`; the record is a folder now, and that ended the refusal by moving the record
rather than by relaxing the rule** — `files_read` answers the document as one opaque string, so a
JSON body is not a timestamp and its leaves are never walked, and a folder is read by path rather
than fetched as one payload of every key at once. ⛔ **The encoding stays**, as this package's own
canon: every reader here expects it, and re-encoding stored records to celebrate a lifted
restriction buys nothing.

**Re-arming an identical promise used to cost a ledger row.** Measured on the owner's store: kr 3,
us 3, allocate 2, growing monotonically with no path to remove them. `untilled/aumos#704` folds at
arming time now. ⬜ Merged is not shipped — a host older than that release still keeps the duplicate,
which is why the depth read from `standingPlans` is something to report and never a reason to arm
less.

**The key `researchState` writes could not be read back by `researchState`** (#222). It is the only
writer of `coverage/research-index`, and its validator required an array `rows` on `previous` — while
every run up to 0.4.60 hand-wrote the key with descriptive fields (`extensions`,
`universeProvenance`, `usMapping`, `laneStateThisRun`, …) and no `rows` at all. So the key was
**self-locked**: the first malformed write made it permanently unreadable by its owner, and the
checkpoint `hooks/guard-budget.mjs` and §Orchestration prescribe for a run that stopped at a limit —
*«persist the roster you did review with `researchState`»* — could not be produced. The reporting run
(`run_c7ad46eea03840bf84ae7a8822ed02c3`) was in exactly that situation and spent four round trips on
it: the stored value, an abridged copy of it, and `{}` all answered `research_state_invalid` /
blocked at `path: previous`. A missing shape degrades now and a point-in-time violation still
refuses — a `schemaVersion` that is present and not `1`, and an `updatedAsOf` that parses and is
after `asOf`, because an index written by a later run can hold only past-dated rows and still leak
that run's judgement backwards, which the per-row date check cannot see. ⚠️ And the row contract was
enforced without being published: `observations[]` requires `symbol`, `market`, `observedAt` and a
non-empty `evidenceIds`, and omitting `observedAt` cost that run one more round trip.
`inputContracts.nested.researchState` publishes it.

## The paper track (§5)

**A track passed under the wrong key looks like a cold start.** `state.openWindows` is where
`signalPaper` reads windows; a top-level `openWindows` arrives under a key it does not read, so the
track looks empty and the `nextState` it returns then deletes it. `paper_state_misplaced` refuses
that shape. Bars written under `date` rather than `timestamp` come back `forward_base_missing`, which
reads as a window the calendar has not reached.

## Arming (§6)

**The sentence explaining the fold prevented the fold.** Aumos folds a re-armed promise into the
one already standing by comparing `kind`, `subject`, `intent` and `trigger` as the bytes the
manager wrote, interpreting none of them (`untilled/aumos#704`); reviews and tranches survived that
because their intents are minted (`marketReviewIntent`, `trancheIntent`) and armed verbatim. A stop
had **nothing to mint from** — the row carried this package's `reason` and no `intent` at all — so
the sentence was the run's, and a run writes it afresh. Measured on 2026-09-09 in the owner's book:
`SGOV`'s stop re-armed with a byte-identical trigger and 162 characters of prose grown to 231, the
new sentence naming the plan id the fold was meant to retire; and `153130`'s ₩104,254.40 arriving as
`exponent: 2 / 10425440` from one run and `exponent: 1 / 1042544` from the next — the same value,
different bytes, and `sameShape` is structural. Both left **two** standing `price-below` watches on
one asset, and a `price-below` is not folded at firing time either (#590, #593 and #624 all key on
`at-time`), so one breach opens two wakes against a `MAX_LIVE_RUNS` of four. `exitDiscipline` now
mints all four fields on the row and the run copies them; ⛔ nothing about the judgement making the
promise may be in `intent`, which is what `priceLevels[].reason` and `rationale` are for. ⛔ The four
plans already standing are not disposed of by this — this package has no withdrawal tool — and they
fold on the first re-arm from a run of `0.11.1` **whose stop level is unchanged**, because a level
that moved is a different promise and correctly stays one.

## Where the rest of the record lives

- `ARCHITECTURE.md` — why the package is shaped this way, and which AMP capabilities it can and
  cannot have.
- `HOST-FOLLOWUPS.md` — what is owed by Aumos rather than by this package, including the OpenDART
  registry ZIP decode this file's opening incident routed around.
- `IMPLEMENTATION.md` — the phase tracker.
- `MIGRATION.md` — the two recorded methodology differences against the Python this was ported from.
- `CONFORMANCE.md` — what a conforming run does.
