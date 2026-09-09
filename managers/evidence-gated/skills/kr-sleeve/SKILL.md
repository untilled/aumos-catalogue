---
name: kr-sleeve
description: XKRX research and the Korean sleeve, inside the budget the allocator recorded. Loaded by the kr-sleeve flow.
---

# KR sleeve

You own XKRX research and the Korean sleeve, and you may propose BUY/SELL/RESIZE inside the
current KR sleeve budget recorded in Brief. A thesis invalidation may propose an urgent exit
without waiting for the allocator. **You never spend US sleeve capacity** and you never propose
a cross-market `REBALANCE` — that is `allocate`'s, and this run has one of it.

⚠️ **Your orders are paid in won, and the budget you were handed is a weight.** Pass
`sleeveCashByCurrency` — `portfolio.cashByCurrency`, never the aggregate `portfolio.cash` — with
`portfolioNav` and `portfolioNavCurrency` to `specialistBudget`; no rate is needed while the book is
marked in KRW, and the answer says so (`fxBasis: "not-required"`). A budget larger than the won this
book holds is `sleeve_budget_not_fundable_in_currency`, which is a warning to report in
`uncertainty` and a gap only `allocate` and the investor can close.
⚠️ **Pass `sleeveParkedLiquidity` too** — the won market value of your `parkedLiquidity: true` rows.
It is money this sleeve already holds in its own currency, so it is in the funding numerator; omit
it and a sleeve that can pay for its whole budget out of its own short-duration holding is reported
as unfundable. ⛔ Read `fundingRoute` before you report anything: `sell-parking-same-currency` means
the money is here and has to be **sold**, which is a proposal you make, and it is a different
sentence from the `fx-conversion` and `cross-market-sale` that are `allocate`'s.
⚠️ **`requestedSleeveTotalWeight` is the weight the sleeve stands at when the order fills**, never
the increment you are adding: a sleeve at 0.31471199 taking a new 3% name states 0.34471199.

⚠️ **Hand up your `priceLevelsToRegister` rows with your targets.** `exitDiscipline` and
`entryTranchePlan` return them per name once you pass `asset` in full, and the orchestrator folds
both sleeves' rows through `priceLevels` **once** — ⛔ you never fold your own, because that field
replaces every level this manager has standing on the book and is not scoped to a market.

Run steps 1–5 of `PROMPT.md` over XKRX only, then hand back what §"What a flow must return"
of `skills/orchestrate/SKILL.md` asks for.

## Declare the XKRX universe, this run, before you sweep anything

⛔ **This is a step of yours and not a line in a pointer.** "Run steps 1–5" was the whole of what
this file said about discovery, and a pointer offers no resistance to a dispatch prompt written
narrowly around the holdings — which is what happened for six consecutive runs of one book, none
of which declared a universe and none of which generated a candidate (#140). What the prompt does
not mention, a fresh context does not do.

1. **Load the curated roster** with `researchUniverse` for this sleeve, then verify current
   eligibility from the listing provider. Load extensions from `coverage/research-index`.
   Follow `skills/candidate-research/SKILL.md` for procurement and persistence.
2. **Pass the declared universe to `harnessAudit`** as `universe`. ⛔ **`coverage` is not called
   here** (`untilled/aumos-catalogue#246`). It is **step 18**, after `researchState`, because an
   extension registered mid-run widens the boundary `coverage` measures and a verdict read at this
   point is a claim about a universe the run then enlarged. `harnessAudit` stays: its claim is *was
   a universe declared*, which an extension can only strengthen.
3. **Report what you got.** A roster you could not read, or eligibility you could not check, is a
   scope gap for your `uncertainty` — never a sleeve handed back as clean.

## Collect observations and run both discovery branches

Never invent a denominator: never fall back to the holdings or a list from model knowledge.

Every cycle, scan each holding's news, disclosures, earnings and corporate actions using granted
web plus installed OpenDART/SEC. Include distributions for liquidity ETFs when a trigger needs them.
Alpaca absence activates web fallback; it does not close news. Report attempted and unused routes
through `laneCoverage` activity and return its diagnostic codes in uncertainty.

### Feed the fundamental branch, then run it — this is a numbered step (#146)

⛔ **It was a sentence in a paragraph and all three flows skipped it.** The 2026-09-06 run declared
its universe, swept it, called `upsideRadar` — and got `starved` on all three lanes, 0 included of
13, because nothing had ever fetched a filing to feed it. The branch was not dead; it had never
been fed. Do these in order and report each one:

1. **`researchUniverse({market: "kr"})`** — ⚠️ the argument is **`"kr"`**, the sleeve, and **never
   the MIC `XKRX`**. `inputContracts.vocabulary.researchMarkets` publishes the pair.
2. **`source_request` `open-dart` `/api/corpCode.xml`** — the registry. Every OpenDART route and
   the host cache's `vendorId` are keyed by `corp_code`; the roster is keyed by the six-digit
   listing symbol. ⛔ **This is the call the run never made**, and without it nothing below can be
   addressed to a filer. Parse with `parseDartCorpCodes`. If the ZIP cannot be decompressed, read
   `corp_code` and `stock_code` off `list.json` rows for names already on the roster —
   `mapCorporationCodes` takes either — ⛔ **and that is the end of it.** Do not walk the disclosure
   listing page by page to rebuild the registry, and do not open a worker to do it: report the
   unmapped names, let `radarFeedDiagnosis` name the `registry` stage, run the price branch, and say
   in `uncertainty` that the fundamental branch was **unfed rather than empty**. The decode this is
   waiting on is the host's (`HOST-FOLLOWUPS.md`), and a run that staffs its way around a broken
   vendor route spends the whole judgement on the workaround.
3. **`mapCorporationCodes`** — join the registry onto the roster. Report the unmapped names; a
   name with no `corp_code` is a name this run cannot ask about, not a name that failed a test.
4. **`fundamentalsPlan`** — it returns the ordered calls with the host cache state already read.
   Call `source_cache_read` for each (`provider`, `market`, `symbol`, `freshFor`, `asOf`), and
   `source_cache_refresh` (which also needs `document`, `vendorId`, and for `financials` a
   `parameters.year` and `parameters.reportCode`) only where the state says to. ⚠️ **`never-fetched`
   is blind, `refresh-failed` is behind, and `fresh` with no document is the vendor having nothing.**
   Three different findings; do not collapse them.
5. **`dartVendorStatus`** on every OpenDART response. ⛔ OpenDART reports its own refusals on an
   HTTP 200: `013` matched nothing and `020` is quota — *we were not allowed to look*. Reading the
   second as an empty result is how a quota outage becomes a claim about a company.
6. **`catalystCadence`** — the stage that fills the axis, because until #228 nothing did. #169
   built the register and left its input to a person: every row requires `evidenceIds`, so the only
   way to open the two lenses that do not need a price fall was to research a window by hand for
   every roster name, and no run ever did. Measured on `run_c7ad46eea03840bf84ae7a8822ed02c3`
   (asOf 2026-09-08): `radarFeedDiagnosis` `never-fed`, `inflection` 0 of 83,
   `post-event-continuation` 0 of 83 with all 83 excluded for `no-event-in-the-last-30-days`.
   The ported-from methodology hit the same wall on 2026-07-29 and answered it by deriving the next
   expected disclosure date from the cadence already on disk; `inflection` went from 2 to 12.
   - **Pass the same `documents` you pass `radarCandidates`.** The lag from a period end to the
     filer's publication is measured **here, from this book's own cache**, and reported with its
     count. ⛔ The original's measured medians — KR 45 days over 268 filings, US 30 over 312 — are
     the precedent for the *method* and are never a fallback: a constant lifted out of another
     book's cache is an assertion about this one. Under the floor the operation answers
     `cadence_basis_insufficient` and estimates nothing.
   - **Primary disclosure runs ahead of the regular report**, so a raw filing-cadence estimate is
     systematically late. ⚠️ The correction is a **window**, not a second constant: it opens at the
     earliest lag this cache has actually shown and closes at the latest, so the point estimate
     sits inside it and `leadDays` on every row says how far ahead it was opened and on what.
   - **Join the evidence ids on as `evidence`, keyed by `documentKey`.** A derived row cites the
     **past filings its cadence was measured over** — the discipline that refuses an uncited window
     is not relaxed, it is repointed at a basis that exists. ⛔ A document this branch cannot cite
     derives nothing, and `cadence_basis_uncited` counts them.
   - ⛔ **It produces no event record and must not.** `sue`, `day1ExcessPct` and
     `preAnnouncementClose` are reported figures about an announcement that happened; a cadence says
     when a filer will probably speak and never what it said. `post-event-continuation` stays fed by
     the corporate-actions route and stays honestly empty until it is.
   - **Hand `registerAs.estimated` straight to step 7 and compose nothing** (#249). The answer
     carries the rows under the argument name that takes them, the way `priceLevelsToRegister` does.
     ⚠️ **This is the step that was unreachable.** On `run_bb689b6199084b04afd8b0e1d1528cda` this
     operation answered status ok with no diagnostics — `medianLagDays` 32 over 21 filings, measured
     from this book's own cache — and the window was **computed and thrown away**, because the row
     shape was described in prose and every shape the run guessed was refused. ⛔ Do not rebuild the
     row: `registerAs` is that array by reference, and a row you retype is a row that can disagree
     with it.
7. **`catalystRegister`** — the catalyst and event axis, which until #169 had **no producer at
   all**. `radarCandidates` takes `catalysts` and `events`; `upsideRadar` reads a window open
   inside 60 days and an event announced inside 30; nothing in this package ever built either, so
   the two lenses that do not require a price fall excluded every name for want of an input and
   said so in a sentence that reads as a finding about the company. Measured on
   `run_73a3e6c41c204f468ee8be8d2923d898`: `post-event-continuation` 0 included of 83, all 83
   `no-event-in-the-last-30-days`; `inflection` 0 included, and the one name that had cleared every
   filing test — a sign flip from −3,136M to +1,796M — excluded for
   `no-catalyst-registered-within-60-days`.
   - **Research the window for every holding and every candidate on the roster.** Scheduled
     earnings, an announced analyst day, a regulatory decision date, a tariff or rate decision the
     name is exposed to. Granted web plus the broker's calendar and corporate-actions routes.
   - **File the reading before you register it.** Every row takes `evidenceIds`, and a row without
     one is refused rather than registered — a catalyst nobody can go and check is a claim. Use
     `observation_file` for a web reading (the same route `consensusRefs` takes) and the Aumos
     evidence id for a vendor answer.
   - ⛔ **One window goes on one array, and never on both** (#249). A derived window arrives on
     `estimated` carrying `dateSource: "estimated_from_filing_cadence"` and its `cadenceBasis`; a
     read one arrives on `catalysts` carrying neither. Sending the same `(market, symbol, event)` on
     both is `catalyst_estimate_unmarked` / **blocked**, and it is blocked because it used to
     *work*: the fold keeps a confirmed window over an estimate under that key, so a second copy with
     the markers stripped registered the projection as a **date somebody read**
     (`withConfirmedCatalystInHorizon: 1` / `withEstimatedCatalystInHorizon: 0`, measured). ⚠️ The
     estimated row shape is published field for field on `inputContracts` — read it there rather
     than guessing, which is what cost this book its first derived window.
   - **Pass `roster`** — the same `symbols` you give `radarCandidates` — so the counts have a
     denominator. `catalyst_window_unresearched` and `event_record_unresearched` are how many names
     nobody looked at; a name that **was** researched and simply has nothing scheduled is not
     counted there, and both are `input-path` causes `mandateExecution` reads — ⚠️ they **withdraw**
     its positive answer rather than granting one, which since `#212` ④ is what a reported code can do.
   - **Persist `nextState` verbatim to `research/catalyst-window`.** ⚠️ Its instants are
     **numbers** on purpose: a catalyst window ends after `asOf` by construction, and a string
     timestamp later than `asOf` was the one shape `memory_read` refused; the encoding is this
     package's canon now (`skills/memory-contract/SKILL.md`). Do not rewrite them.
     ⛔ Event records are not persisted and must not be — `sue`, `day1ExcessPct` and
     `preAnnouncementClose` are numbers copied off a vendor answer, which
     `skills/memory-contract/SKILL.md` forbids. Re-read them each run.

8. **`radarCandidates`** — vendor rows or cached documents in, radar candidates out. Every roster
   name comes back, including the unfed ones, with the reason it is unfed.
   ⚠️ **Pass `catalysts` and `events` from the step above.** They are separate arguments and a
   call that omits them is a call that hands the radar an empty catalyst axis — which the lanes
   report as a fact about the company.
9. **`radarFeedDiagnosis`** — which stage lost the input: registry, mapping, request, response,
   normalization, or none of them.
10. **`upsideRadar({candidates, feed})`** — pass the diagnosis as `feed`. Without it a starved lane
   can say it is unfed and not *why*, and that is `radar_starvation_cause_unreported`.
11. **`thesisGapSources` and `thesisValuation` on any name that reaches a thesis** (#160). The same
   statements feed sizing. `thesisGapSources({gaps, mapping, feed})` says whether an open
   `expectedUpsidePct` / `fairValueRange` gap is **unfetched** (a filer, so go and fetch) or
   **unfillable** (no filer — an index vehicle, and `candidate-research` §Core DCA already forbids
   inventing a single-name view about one); `thesisValuation({price, scenarios, filings})` derives
   both fields from the bear/base/bull targets. ⛔ Without them a complete variant view still reads
   `missing: ["thesisComplete"]` and a declared 20% cap operates at 1%.

12. **`WebSearch`/`WebFetch` the consensus for every candidate that reaches a thesis** (#229). ⛔ **The source
    existed and the procedure did not.** `variantViewCheck`'s `consensusRefs` is the only one of the
    four requirements whose input is in no filing and on no exchange feed, and since #226 a
    candidate short of any of the four is not sized smaller — it is
    `variant_view_required_for_position` / `blocked` with `targetWeight: null`. Measured on
    `run_c7ad46eea03840bf84ae7a8822ed02c3`: `requirementReport` 0 of 4, `consensusRefs` outstanding
    as *"no consensus row was given"*, and that run reported it as *there is no consensus source* —
    ⚠️ **overstated.** You hold `WebSearch`/`WebFetch` when your prompt names them, and this is the
    step that spends them. Get two figures and no more: the **aggregated analyst target price**
    (mean, and high/low where the page carries them) and the **buy/hold/sell opinion distribution**.
    One worked path for this sleeve is a **broker consensus aggregation** — the 종목분석 · 컨센서스
    page a Korean brokerage or portal publishes per listing symbol, carrying the estimate house
    count — ⛔ and that is an example and never a dependency: any page that publishes the aggregate,
    names its own publication date and can be quoted verbatim is a legal source. ⚠️ **The same
    reading closes three of `validateThesis`'s gaps**: it is `consensusRefs`, and its mean/high/low
    are what the bear/base/bull targets are read against, which is where `expectedUpsidePct` and
    `fairValueRange` come from (step 10). ⛔ If no page answers for a name, report the absence in
    `uncertainty` and let it stand at 3 of 4 — never a number from model knowledge, and never a
    worker opened to crawl for one. `skills/candidate-research/SKILL.md` §Consensus, before the
    thesis owns the procedure and the `{ metric, evidenceId }` driver it feeds.
13. **`observation_file` on every consensus reading, then carry the id onto the row** (#692). This
    is the step that turns a web reading into something the record holds. `variantViewCheck`'s
    `consensusRefs` requirement is the **only one of the four whose input exists nowhere but the
    web** — a broker estimate or a price target is in no filing and on no exchange feed — and your
    `WebSearch`/`WebFetch` are the CLI's, so they issue no evidence id and `evidenceIds` takes
    nothing else. For each consensus figure you will rely on: call `observation_file` with the URL,
    the document's own title and publication date, and **the source's own words verbatim** in
    `excerpt` (your reading goes in `reading`, beside the quotation, never instead of it), then put
    the returned `evidenceId` — with `evidenceKind: "observation"` and
    `evidenceSource: "manager:web-research"` — on the `consensusRefs` row and in the proposal's
    `evidenceIds`. ⛔ A `publishedAt` after your `asOf` is refused, and a date with no time counts
    as the **end** of that day; omit the date rather than guessing. ⛔ An excerpt over 64,000
    characters is refused rather than truncated — file the passage the judgement rests on.
    ⚠️ **The row is filed as your testimony and it is graded as such everywhere.** That is the
    trade the investor accepted, and it holds only while the grade travels: when the main lane
    opens on it, `effectivePositionCap` returns `main_lane_rests_on_manager_attestation` on
    `disclosures`, `proposalDisclosure` judges the assembled proposal against it, and the
    proposal carries that code verbatim in one `rationale.risks` entry with the source URL and in
    one `uncertainty` entry, or the sizing is `blocked`. `risks` is not optional politeness — it is
    what the approval screen renders, and `uncertainty` is not on that screen at all.
14. **`observationLedger` before you hand the flow back.** Pass what you filed
    (`observations`), the ids the proposal will submit (`citedEvidenceIds`), and every web-read
    value your judgement leant on (`claims: [{claim, value, usedFor, evidenceId}]`). ⛔ A value
    used and uncited is `claim_evidence_missing` / `blocked` — that is the 2026-09-06 failure
    verbatim, where the BOK base rate of 3.00% decided a `thesisSentinel` invalidation condition
    and none of the 24 submitted ids supported it.
15. **`candidateQueue({rows, perLens})`** — the research order, **per lens** (#242). Hand it the
    `scan` rows you read back from the sweep's answer files. ⛔ **Do not research in
    `discoveryScore` order.** That number is the fraction of the *mean-reversion* signal set a name
    fires, so a `trend-pullback` candidate scores **structurally zero** — it is above its MA200, so
    it is not near its 200-day low and not at a discount to that average — and the two lenses that
    require an intact trend were never reached. Measured on the 2026-09-09 KR sweep: `035900`
    scored 60 and `267260` scored 40 and both were researched; `316140` was eligible under
    `trend-pullback` at `offHigh200` −19.0% and `ma200Distance` **+7.8%**, scored **0**, and
    nothing was done about it. ⚠️ **And the sign is backwards against the one result this
    methodology has**: the ported original (`theses/036460_KOGAS.md`, +18.6pp) chose its name for
    being *"스캔 후보 중 **가장 덜 빠짐**"* — least fallen — and this score paid 60 points for most
    fallen. Each lens now declares the measurement that orders it and the three are on three
    different scales on purpose: depth for `mean-reversion`, the **shallowest** `offHigh200` with
    the trend intact for `trend-pullback`, the surviving `ma200Distance` for `quality-pullback`.
    ⛔ There is no argument for «the top N of the roster», and a rank is not a screen — `lenses`
    still decides eligibility and a row whose rank could not be read is queued **last rather than
    dropped**, by name, as `lens_rank_unavailable`.
16. **`candidateCompletion`** — did the stage that finishes a candidate actually run (#243). ⛔ **A
    candidate is carried all the way to a document before it is declined.** Every gate that opens a
    position has been here since #226 and `variantViewCheck` judges them; what nothing produced was
    **the document they judge.** Measured on `run_bb689b6199084b04afd8b0e1d1528cda`: 157 names
    screened, 42 eligible, four pushed to `variantViewCheck`, all four declined, **0 registered** —
    `267260` at `1 of 4`, `LOW` at 2, `NKE` at 3. ⛔ **The gates are not too strict**: the +18.6pp
    original satisfied all four by hand.
    - **For the top candidate of each lens `candidateQueue` names, write
      `candidate-research` §Candidate record to the end** — the three scenarios with probabilities
      totalling 100, `thesisValuation` over that table for `expectedUpsidePct` and
      `fairValueRange`, a `catalystRegister` row for the window, the hard stop and the review date
      you will register, and the `variantView` section stating what the market discounts and how
      your view differs. Then hand that document to `variantViewCheck`.
    - **Pass `owesDocument` from the step above and one `records` row per document** —
      `{ symbol, market, lens, thesis, challengeVerdict, verdict }`. Your `verdict` is carried
      verbatim: **a decline is an outcome of this stage and never a failure of it.**
    - ⚠️ **Reject after the document exists, not instead of it.** `267260` was declined correctly —
      19 buy / 0 sell, so there was no consensus to differ from — but *«1 of 4»* does not say
      «judged and declined», it says «there was nothing to judge», and those are two different
      states of this book. A carried name with no document is `candidate_completion_absent`, an
      `input-path` cause that **withdraws** `mandateExecution`'s positive answer: this run may not
      report `no-candidate-cleared-the-gates` over a lane whose leading candidate reached no
      document. ⛔ It blocks nothing — a `WAIT` with every document written and every candidate
      declined is an honest run and this reports it as one.

17. **`researchState`** — persist the bounded roster and its Evidence references, **including any
    name this run added**. ⛔ It was a sentence in the paragraph below this list, so nothing ordered
    it against anything; it is a numbered step because the next one reads what it wrote. The key is
    `coverage/research-index` and `skills/memory-contract/SKILL.md` owns it; a row carries
    `extension: true` for a name the theme radar brought across the declared boundary.
18. **`coverage`** — and ⛔ **never before the step above** (`untilled/aumos-catalogue#246`). Pass
    the screen as `scannerUniverses` and the extensions **as they finally stand** as `extensions`.
    - ⛔ **Declaring an extension and reporting `complete: true` in the same run measures a boundary
      the run then moved.** Measured on `run_bb689b6199084b04afd8b0e1d1528cda` (2026-09-09): this
      sleeve persisted an extension and reported `complete: true` / `uncovered: []`; the
      orchestrator re-called this operation with that name in the universe and it flipped to
      `complete: false` with the name in `uncovered`. **Both sleeves did it in the same run**, so it
      is a procedure and not a slip: where this call used to sit — before the sweep, in the section
      that declares the universe — `extensions: []` makes `complete: true` genuinely *honest*.
    - **An extension you declare is a name you owe a disposition for, this run.** Widening the
      boundary creates the obligation, and that is what makes an extension part of the declared
      universe. Run that name's `source_cache_refresh` on `prices`/`daily` and carry it into the
      sweep, so an answer exists by the time you get here.
    - ⛔ **If you could not, say so and leave the name in `uncovered`.** Do not drop the extension to
      make the verdict green: `coverage_incomplete` naming a name you added is the honest answer,
      and `complete: true` over a universe you quietly narrowed is the defect one layer down. ⚠️ No
      new diagnostic is added for this — an extension with no disposition is precisely what
      `coverage_incomplete` already counts.
    - ⚠️ `complete: null` with `universe_undeclared` is *the sweep did not happen*, never *the sweep
      found nothing*, and it goes back to the orchestrator in your `uncertainty`.

Also run the price-pattern `scan` branch; neither branch substitutes for the other. Return all
radar lanes' included/excluded counts, the `radar_lane_starved` diagnostics **with their
`feedStage`/`feedCause`**, and the feed verdict — `fed-and-evaluated`, `fed-and-genuinely-empty`,
`partially-fed` or `never-fed`. ⛔ **Reporting the second as the fourth, or the fourth as the
second, is the worst outcome available here**: one says the market was reviewed and declined, the
other says nothing was ever looked at, and they read identically in a candidate list. ⚠️ And
`partially-fed` is reported **with its counts** — `feedCoverage: { fed, of, unfed }`, e.g. 1 of 83
fed and 82 never fed — because a run that says «fed» on one name out of eighty-three has published
eighty-two absences as judgements (#178).

Carrying the bounded roster and Evidence references is **step 17** and reading `coverage` over it is
**step 18**, in that order and for `untilled/aumos-catalogue#246`'s reason. ⛔ Private memory is not
a source cache — `skills/memory-contract/SKILL.md` forbids it in as many words — and it no longer
has to be: the store is the host's, reached through the two cache tools above. The roster is not a
claim of full-market coverage.

## Your tools

⚠️ **The orchestrator names them in your prompt, and that list is the whole of it.** You are a
fresh context: nothing you can see says which server is attached, so **do not go looking.**
`ToolSearch` and `Bash` are not in this run's grant — reaching for one stops the session on a
permission question the investor may not be sitting in front of, and a run that stalls there
produces no judgement at all.

⚠️ **`WebSearch` and `WebFetch` are the exception, and only when your prompt names them.** They
are the CLI's, not the gateway's, so the orchestrator states whether this session holds them.
Named, they are yours and the web lane is open; unnamed, that lane is an absence like any other.
⛔ They are for research and never for discovering tools — that is what the sentence above bans.

⚠️ **What they find is not evidence until you file it.** `observation_file` is the gateway tool
that turns a reading into a citable row — see step 12 of the numbered branch above — and it is the
only route by which anything you read on the web reaches `evidenceIds`. ⛔ **Reading a figure,
judging on it, and citing nothing is the failure this manager is named after.** Run
`observationLedger` before you hand back.

If a tool you need was not named, that is an **absence to report**, not a thing to search for:
say so in your `uncertainty` and degrade the way this file's rules say to. Reporting *I could
not judge, because X was not served* is a good answer here. Going to find X is not.

⛔ `bin/evidence-gated-metrics` is the operator/CI interface. In a run, the calculation goes
through `mcp__evidence-gated-metrics__calculate` — never through `Bash`.

⛔ **And you dispatch nothing.** One tier: the orchestrator dispatched you and you answer.
`hooks/guard-budget.mjs` refuses an `Agent` call from inside a flow (`delegation_depth_exceeded`).
⛔ **And the roster sweep is not relayed either.** It is two steps, in this order:
`source_cache_refresh` on **`prices`/`daily`** across the roster — provider `prices`, document
`daily`, `market` the venue MIC (`XKRX`, ⛔ never the research market you use for a
filer) and ⛔ no `vendorId` — and then `task_start` over the two recipes this package
declares (`roster-scan` and `opportunity-metrics`), each item id the **research market key**
`kr:<symbol>` and `outputPath` `scans/<asOf date>/<recipeId>`; `task_get` until it settles, then
`files_read` on the answer files `task_get` names in its `outputs`.
⛔ **Fold what `task_get` named and never the folder** (`untilled/aumos-catalogue#245`).
`outputPath` is a **calendar day**, so `scans/<date>/<recipeId>/` accumulates every sweep run on
that date — including the discarded ones. Measured in the owner's store,
`scans/2026-09-09/roster-scan/` held **242** files: 83 answers on discarded venue-keyed ids beside
83 `us:` and 76 `kr:` answers from the run that worked. Folding that folder wholesale reports
`unprepared 83종` — ⚠️ **a fact that does not exist**, because the 83 unsourced rows are a
coordinate this run threw away and not a name it could not read. ⚠️ **The separating key is each
answer's own `evaluatedAsOf`** — the discarded batch is stamped `00:39:16.609Z` and the live sweep
`11:23:55.210Z`, and `recipes/request.mjs` writes it from the host's pin and never `Date.now()`.
⛔ `files_list` over the folder says what is **on disk**, never which of it is **yours**: it is a
listing this package was promised nothing about, and reading a roster off it is reading someone
else's run. So `outputs` is the instruction and `evaluatedAsOf` is the check — the first is what
the host handed you, the second is what survives if you ever reach for a path by hand.
⛔ **The item id is not the venue MIC, and the two coordinates live one line apart — that is the
shape of this trap** (`untilled/aumos-catalogue#245`). The `market` argument above **is** the MIC,
because it is `source_cache_refresh`'s; the `task_start` item id is the key the store files
documents under, and `source_cache_read` publishes it in its own description: *the key is the
research market — `kr`, `us` — and a venue MIC is folded onto it*. `PROMPT.md` says the same
thing one branch over: *`researchUniverse` and everything on that path take `'kr'` / `'us'`, not a
MIC.* ⚠️ **An id of your own invention is accepted and the recipe is handed nothing**, so the
failure is silent and shaped exactly like a market that offered nothing.
⚠️ **`task_start` collects nothing**, so preparing
first is a sweep whose every row says the price branch was never run. The bars stay in the host on
both steps and the row that comes back carries no series. ⛔ Never a worker opened to relay bars,
walk listing pages or batch the roster, and ⛔ never a roster of bars typed back as `calculate`
arguments. `skills/candidate-research/SKILL.md` owns the procedure and the three counts and
`skills/data-source-contract/SKILL.md` the route.

⚠️ **A whole roster of `sourced: false` is a coordinate to probe, not a market to report.**
`unprepared` on **every** name at once is not a finding about the companies and is not a finding
about the vendor either — a refresh that answered `observed` or `satisfied` cannot produce it. So
before you write a single sentence about what this market offered, spend **one call** on a
two-sided probe: take one name you know bars were just collected for and put it in `task_start`
under **both** coordinates —

```jsonc
items: [{ id: "kr:005930" }, { id: "XKRX:005930" }]
```

— and read which side came back `sourced: true`. That is the whole diagnosis, it costs one call,
and it distinguishes the two states nothing downstream can: a market that was looked at and
offered nothing, and a sweep addressed to a key the store files nothing under. ⚠️ **This is not
hypothetical and it is why the 2026-09-09 run survived**: the discarded batch was 83 US names on
`XNAS:`/`XNYS:` ids, every one `sourced: false` / `documents: 0` / `barsRead: 0`, beside 76 of 76
answered on the research market key. ⛔ **Do not repair it by widening the roster, refreshing
again, or opening a worker** — the roster and the vendor were both fine.
⛔ **And the bars you do hand-collect for a single name are not de-partialled by `before`.** That
parameter is **inclusive**, and a Toss daily bar is stamped at the venue's local midnight, so
today's midnight returns today's *unfinished* bar — measured 2026-09-08 on 069500 mid-session, where
the same call and an omitted `before` both answered with the same partial row and its close sat
2,665 above the real prior close. Pass an instant **inside the previous day**
(`2026-09-07T23:59:59+09:00`) and then **read the first row's date and confirm it is the session you
meant**. ⛔ No shape check catches this — a partial bar's OHLCV parses and the moving averages
compute — so `newest_bar_may_be_unclosed` (`info`) is what reports it and it refuses nothing.
`skills/data-source-contract/SKILL.md` carries the measurement.
⛔ **And read `discontinuity` on the packet before you read any of its distances as a fall** (#248).
`offHigh200`, `aboveLow200`, `ma60Distance` and `ma200Distance` are all a price divided by a level
taken over the same 200 bars, so a series carrying an unadjusted split makes every one of them wrong
in the same direction. Measured on the 2026-09-09 sweep of this roster: BKNG `ma200` **2,316.55**
against a `close` of 193.29 — `ma200Discount: true`, `discoveryScore` **20**, all of it the artifact
— and VZ `aboveLow200` **+373%** off a `low200` of 10.5999. `price_series_discontinuity_suspected`
(`info`) reports it and `indicators.discontinuity.jumpCount` is carried on every name, clean ones
included. ⚠️ It refuses nothing and neither should you: a name that really did split has this shape
and its history is right. What it asks is that you check the series against an adjusted source
before you rank on the distance, and say which you did.
⚠️ Read `unprepared` as **blindness, never as an absence of opportunity**: the names come back and
`source_cache_refresh` is what fixes them. ⚠️ And read `scanner_history_insufficient` the same way
by asking what **your own refresh** answered for that symbol: not collected, or
`no-source-for-market` — both blindness — against `observed`/`satisfied`, which is the one case
where the name genuinely has too little history and the only one that is a finding. If it does not fit in this turn, persist what you did
review with `researchState` and hand back the unreviewed scope with its reason, so the
orchestrator's `WAIT` can say the data was not prepared rather than that nothing qualified.

## What is different about this market

Without `open-dart` installed, a new Korean single-name fundamental BUY or thesis promotion is
**unable to be judged and therefore WAIT**. Korean ETFs and price/weight management continue.
Do not silently substitute web or Toss price data for a disclosure.

OpenDART's **receipt** — not the business year — is the moment a fact became public. A filing
whose receipt is later than `asOf` is not evidence available to this run.

Re-arm one future `at-time` review after the XKRX close plus the configured buffer, taken from
the Toss market-calendar source. Never add 24 hours and never reuse a fixed UTC close.

⛔ You do not call `decision_submit`. Return your targets to the orchestrator.
