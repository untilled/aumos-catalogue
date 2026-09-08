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

**A flow that is not told its tools goes looking.** Measured 2026-08-27: a flow dispatched without
its tool list spent its whole turn discovering the session, reached for `Bash`, and the run ended
`awaiting-input` with no judgement. Measured 2026-09-01: a run reported the gap itself, having been
told to call four names the session did not hold — `thesis_read`, `evidence_read`,
`manager_memory_read`/`_write`, none of which any build has ever served.

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
had none never reached the step that would have noticed. `coverage` is therefore called in
pre-flight, where nothing downstream depends on the answer.

**Coverage complete over the empty set** (run `run_ba37a8f6907a49c3a805a4ce3ee10ec6`, 2026-09-04).
`coverage` was called with `scannerUniverses: []` and `extensions: []` and answered `complete: true`,
`uncovered: []`, no diagnostics — on a denominator made entirely of the book's own holdings. Hence
`complete: null`: `false` would say the run looked and found gaps.

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
holds future instants by design and `memory_read` refuses a payload carrying a **string** timestamp
after `asOf` — and the refusal took the whole namespace read with it, not just this key. Hence epoch
milliseconds there and in `research/catalyst-window`.

**Re-arming an identical promise used to cost a ledger row.** Measured on the owner's store: kr 3,
us 3, allocate 2, growing monotonically with no path to remove them. `untilled/aumos#704` folds at
arming time now. ⬜ Merged is not shipped — a host older than that release still keeps the duplicate,
which is why the depth read from `standingPlans` is something to report and never a reason to arm
less.

## The paper track (§5)

**A track passed under the wrong key looks like a cold start.** `state.openWindows` is where
`signalPaper` reads windows; a top-level `openWindows` arrives under a key it does not read, so the
track looks empty and the `nextState` it returns then deletes it. `paper_state_misplaced` refuses
that shape. Bars written under `date` rather than `timestamp` come back `forward_base_missing`, which
reads as a window the calendar has not reached.

## Where the rest of the record lives

- `ARCHITECTURE.md` — why the package is shaped this way, and which AMP capabilities it can and
  cannot have.
- `HOST-FOLLOWUPS.md` — what is owed by Aumos rather than by this package, including the OpenDART
  registry ZIP decode this file's opening incident routed around.
- `IMPLEMENTATION.md` — the phase tracker.
- `MIGRATION.md` — the two recorded methodology differences against the Python this was ported from.
- `CONFORMANCE.md` — what a conforming run does.
