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
2. **Pass the screen and the extensions to `coverage`** as `scannerUniverses` and `extensions`,
   and pass the same thing to `harnessAudit` as `universe`.
3. **Report what you got.** `complete: null` with `universe_undeclared` is *the sweep did not
   happen*, and it goes back to the orchestrator in your `uncertainty` — never as a clean sleeve.

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
6. **`catalystRegister`** — the catalyst and event axis, which until #169 had **no producer at
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
   - **Pass `roster`** — the same `symbols` you give `radarCandidates` — so the counts have a
     denominator. `catalyst_window_unresearched` and `event_record_unresearched` are how many names
     nobody looked at; a name that **was** researched and simply has nothing scheduled is not
     counted there, and both are `input-path` causes `mandateExecution` reads.
   - **Persist `nextState` verbatim to `research/catalyst-window`.** ⚠️ Its instants are
     **numbers** on purpose: a catalyst window ends after `asOf` by construction, and a string
     timestamp later than `asOf` is the one shape `memory_read` refuses. Do not rewrite them.
     ⛔ Event records are not persisted and must not be — `sue`, `day1ExcessPct` and
     `preAnnouncementClose` are numbers copied off a vendor answer, which
     `skills/memory-contract/SKILL.md` forbids. Re-read them each run.

7. **`radarCandidates`** — vendor rows or cached documents in, radar candidates out. Every roster
   name comes back, including the unfed ones, with the reason it is unfed.
   ⚠️ **Pass `catalysts` and `events` from the step above.** They are separate arguments and a
   call that omits them is a call that hands the radar an empty catalyst axis — which the lanes
   report as a fact about the company.
8. **`radarFeedDiagnosis`** — which stage lost the input: registry, mapping, request, response,
   normalization, or none of them.
9. **`upsideRadar({candidates, feed})`** — pass the diagnosis as `feed`. Without it a starved lane
   can say it is unfed and not *why*, and that is `radar_starvation_cause_unreported`.
10. **`thesisGapSources` and `thesisValuation` on any name that reaches a thesis** (#160). The same
   statements feed sizing. `thesisGapSources({gaps, mapping, feed})` says whether an open
   `expectedUpsidePct` / `fairValueRange` gap is **unfetched** (a filer, so go and fetch) or
   **unfillable** (no filer — an index vehicle, and `candidate-research` §Core DCA already forbids
   inventing a single-name view about one); `thesisValuation({price, scenarios, filings})` derives
   both fields from the bear/base/bull targets. ⛔ Without them a complete variant view still reads
   `missing: ["thesisComplete"]` and a declared 20% cap operates at 1%.

11. **`observation_file` on every consensus reading, then carry the id onto the row** (#692). This
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
12. **`observationLedger` before you hand the flow back.** Pass what you filed
    (`observations`), the ids the proposal will submit (`citedEvidenceIds`), and every web-read
    value your judgement leant on (`claims: [{claim, value, usedFor, evidenceId}]`). ⛔ A value
    used and uncited is `claim_evidence_missing` / `blocked` — that is the 2026-09-06 failure
    verbatim, where the BOK base rate of 3.00% decided a `thesisSentinel` invalidation condition
    and none of the 24 submitted ids supported it.

Also run the price-pattern `scan` branch; neither branch substitutes for the other. Return all
radar lanes' included/excluded counts, the `radar_lane_starved` diagnostics **with their
`feedStage`/`feedCause`**, and the feed verdict — `fed-and-evaluated`, `fed-and-genuinely-empty`,
`partially-fed` or `never-fed`. ⛔ **Reporting the second as the fourth, or the fourth as the
second, is the worst outcome available here**: one says the market was reviewed and declined, the
other says nothing was ever looked at, and they read identically in a candidate list. ⚠️ And
`partially-fed` is reported **with its counts** — `feedCoverage: { fed, of, unfed }`, e.g. 1 of 83
fed and 82 never fed — because a run that says «fed» on one name out of eighty-three has published
eighty-two absences as judgements (#178).

Use `researchState` to carry the bounded roster and Evidence references. ⛔ Private memory is not
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
that turns a reading into a citable row — see step 11 of the numbered branch above — and it is the
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
filer) and ⛔ no `vendorId` — and then `research_prepare` over the two recipes this package
declares (`roster-scan` and `opportunity-metrics`), `research_job_get` until it settles and
`research_result_get` for the summary. ⚠️ **`research_prepare` collects nothing**, so preparing
first is a sweep whose every row says the price branch was never run. The bars stay in the host on
both steps and the row that comes back carries no series. ⛔ Never a worker opened to relay bars,
walk listing pages or batch the roster, and ⛔ never a roster of bars typed back as `calculate`
arguments. `skills/candidate-research/SKILL.md` owns the procedure and the three counts and
`skills/data-source-contract/SKILL.md` the route.
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
