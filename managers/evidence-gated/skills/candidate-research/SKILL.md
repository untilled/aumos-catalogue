---
name: candidate-research
description: Declare the universe this run sweeps, then research a candidate under its discovery lens — why-cheap, trap, variant, scenario and benchmark-alternative tests.
---

# Candidate research

Complete this before promoting a new single-name candidate. A scanner ranks what to investigate; it
does not rank what to buy.

## What a thesis has to carry

`validateThesis` enforces this; the fields are named here so the contract is readable before it is
refused. Six are required outright — a thesis missing one is not a thesis:

`thesisId` · `asset` · `createdAt` · `coreClaim` · `horizonEnd` · `evidenceStatus`

Six more decide whether it is **complete**. Each is a way of being wrong on the record:

| gap field | what its absence hides |
|---|---|
| `variantView` | that the claim is the consensus, in which case the price already has it |
| `consensusRefs` | what you are differing *from* — each ref dated, sourced, captured after it was published, and **filed with `observation_file` so the row names an `evidenceId`**: a consensus figure exists on the web and nowhere else, and an unfiled one is `consensus_ref_uncited` (#692) |
| `catalysts` | when the claim gets tested, as a window rather than a hope |
| `invalidationTriggers` | what would make you drop it, decided before you are attached to it, each with a `checkBy` — and an `event` one also with a `producer`, see §Trigger vocabulary |
| `expectedUpsidePct` | the number you can be wrong about |
| `fairValueRange` | the low and the high, so the upside has something under it |

⚠️ **The last two are derived, not invented, and the derivation is already in this page** (#160).
§Candidate record 5 asks each scenario for a **target**, a return and factual drivers, and
`researchGate` computes `Σ p·return` off exactly that table. `thesisValuation` is that arithmetic
made addressable: the bear and bull targets are `fairValueRange`'s low and high, the weighted
return is `expectedUpsidePct`, and each case's `drivers` are checked against the `filings`
`radarCandidates` built for the name. ⛔ It publishes no multiple and no discount rate, because this
methodology names none — a case with no target is reported, never filled in from a rule of thumb.

⛔ **An open valuation gap is two different facts and they must not be written down as one.** For an
ETF nothing publishes statements and the gap is unfillable; for a listed company `fnlttSinglAcntAll`
(or SEC `companyfacts`) answers and the gap is merely **unfetched**. `thesisGapSources` decides
which from the `mapCorporationCodes` registry rather than from a guess, and returns `unknown` where
the registry was never read. This instance filed the ETF sentence as a general rule on 2026-09-04;
`refutedMemoryRules` retracts it, and a run that reads `run/theme-radar-last` passes it there.

⛔ Declaring `evidenceStatus: 'complete'` with any gap open is refused as `thesis_false_complete`.
`incomplete` with gaps is fine and normal — the gaps are returned and stay visible. The refusal is
for claiming to have finished the work while the record shows otherwise, which is the one state that
would let an unfinished thesis be counted as a finished one.

## Trigger vocabulary — one spelling, two sets

Thesis and WATCH triggers use kebab-case, as in the `unit` and `lens` vocabularies.
The evaluator `thesisSentinel` uses `price_below`, `price_above`, `metric`, `time`;
read `inputContracts` and explicitly map trigger fields before calling it. Underscore forms are accepted and
normalized so no recorded thesis becomes unreadable, and using one says so.

| | accepted kinds |
|---|---|
| thesis invalidation (`validateThesis`) | `price-below` · `price-above` · `metric` · `at-time` · `event` |
| WATCH (`validateWatch`) | `at-time` · `price-below` · `price-above` · `weight-drift` |

`at-time` is shared. It used to be spelled `time` on the thesis side and `at-time` on the WATCH
side, which made one condition look like two; `time` is still accepted and normalized.

The remaining difference is deliberate:

- **`metric` is a thesis invalidation and not a WATCH.** A WATCH has to be evaluable by the wake
  engine from published data; a thesis metric may need a filing that a person reads.
- **`weight-drift` is a WATCH and not a thesis invalidation.** Drifting past a weight says something
  about the portfolio, not about the claim.
- **`event` is a thesis invalidation and not a WATCH**, and only with a producer. Nothing publishes
  *"the buyback was halted"* at the instant it becomes true, so no wake engine fires on it — which is
  why a producer-less `event: earnings` WATCH is still refused. A person, though, can read a named
  document by a named date, and *"자사주 매입 중단"* is precisely the condition under which the claim
  is wrong.

### `event` invalidations carry a producer and a deadline

```json
{ "id": "buyback_halt", "kind": "event", "checkBy": "2026-10-31",
  "producer": { "publisher": "우리금융지주", "document": "자기주식 취득·처분 결정 공시 (DART)" },
  "description": "자사주 매입 중단" }
```

- `producer.publisher` — who announces the fact. `producer.document` — the document it is announced
  in. Two fields, not a sentence, so each can be *wrong in a way somebody can name*: a publisher who
  publishes no such thing, a document that does not carry the item. Missing either is
  `invalidation_producer_missing` / `blocked`.
- ⚠️ **No URL.** A `consensusRefs` row cites a document that exists; an event invalidation names one
  that has not been published yet, which is the point of registering the falsifier in advance.
  Inventing a link is how a fabricated citation enters a thesis. The link arrives later, on the
  consensus row that cites the document once it exists.
- `checkBy` is **blocking** on this kind, not the usual `unevaluated`: *"not announced yet"* is a
  true answer forever, so a producer with no deadline is watched and never read. That was measured —
  one thesis ran four consecutive `threatened` verdicts because every trigger it had could only fire
  when a negative was confirmed, and the investor broke the loop by hand with a trigger whose firing
  condition was **the failure to confirm by a date**. Missing it is `invalidation_event_undated`.
- Machine evaluation is unchanged: `thesisSentinel` reports `sentinel_rule_unevaluated` for an event,
  because a person reads the document. What is automatic is `exitCheck` — a registered event that
  passes its own `checkBy` unread raises `thesis_review`, which is the loop-breaker made ordinary.

## Lens-specific reading

### Mean reversion

Deep oversold, moving-average discount or low proximity measures dislocation depth, not confidence.
Require a separate stabilization state such as basing, capitulation plus reversal, or another
predeclared price-quality condition. Ask whether earnings power or the balance sheet structurally
changed. A falling knife does not become safer because its score rose — and it does not need you to
agree, because `entryQualityGate` blocks it. That gate also refuses a mean-reversion candidate with
no `trend-pullback` beside it unless its state is a confirmed `basing` or `pullback_in_uptrend`;
`neutral` is not a pass. Read the two dual-lens readings it returns rather than the verdict alone:
`eqV1WouldPassBasing` says the window reading disagrees with the last 60 bars, and
`noNewLow.lensDisagreement` says an intraday spike low may be masking closes that are still setting
fresh lows. Either one is a hand re-check, not a number to average away.

### Quality pullback

A quality name above its MA200, 15–35% off its high, RSI 30–50. This is the band the other two
lenses drop: `trend-pullback` stops at -20%, and a name above its MA200 rarely carries the two
oversold signals `mean-reversion` needs. The question is whether the markdown is a price the business
does not deserve — a variant view on quality, not on trend shallowness or on dislocation depth. It is
a separate lens rather than a widened `trend-pullback` band because those are different claims, and
its calibration samples accrue under `calibration/quality-pullback` so neither sample is retagged.

### Trend pullback

This lens intentionally finds shallow weakness inside an uptrend. Judge trend integrity, relative
strength, business quality, catalyst, valuation and active edge. Do not reject it merely because the
drawdown is not deep enough for mean reversion. A revisit trigger must remain reachable within this
lens rather than pointing to the level where it stops qualifying.

### Core DCA

Broad ETFs are cash-allocation decisions. Do not fabricate a single-name variant view — there is no
variant view to have about owning the index, and inventing one is how a cash decision gets recorded
as a stock pick.

Five conditions, all of them numbers rather than intentions:

| | |
|---|---|
| cash threshold | the first tranche executes only when cash and short bonds are at least `coreDca.minimumCashWeightForFirstTranche` of the book. Deploying from a thin cash position turns the reserve into the tranche |
| tranche plan | T1/T2/T3 each with its size and its date-or-price condition. "We will add on weakness" is not a tranche |
| reserve floor | `effectiveCashFloor` with the Mandate's `cashFloor` as `mandateCashFloor` and the post-tranche cash weight as `projectedCashWeight` — the arithmetic showing the floor still stands **after** the tranche, not before it, computed rather than described. ⚠️ Since #153 the floor is the investor's declaration and this package holds no copy of it; an undeclared one is `cash_floor_unevaluated`, which is not "no floor", and the floor is a floor rather than a target |
| stop conditions | four, named: a market break, a better opportunity, the cash floor breached, a hedge gate firing |
| classification | recorded as cash deployment. **It does not count as a ready single-name BUY** — pooling the two makes the single-name sample look larger than it is |

`monthlyTrancheMaxWeight` paces the deployment and `catchUpMonthlyMaxWeight` is the ceiling while
catching up on a schedule that fell behind. Catching up accelerates placement; it never raises the
target.

## Staged entry on a single name

⚠️ **The classification row above is right and this section does not weaken it.** A `core-dca`
tranche is a cash deployment and never a single-name sample. What the split lost is that the ported
methodology staged *single names* too, and that lane came across without the device.

**And the reason was never size.** The NAVER thesis wrote its own down: technically oversold was
confirmed, the earnings and multiple case was not, so the name was carried as a limited staged
candidate on a three-tranche plan rather than as high conviction. Not going in at once is what that
methodology *did* about a claim it had not finished verifying — so the requirement follows the
evidence, not the weight. A 1% position split three ways is still a staged entry.

Call `entryTranchePlan`. It holds the same shape the Core DCA row states, addressed to one name:

| | |
|---|---|
| plan | T1/T2/T3, each with its size and its `immediate`, `at-time`, `price-below` or `price-above` condition. **"We will add on weakness" is not a tranche** — the same discriminant, on this side of the line. ⚠️ Each priced rung also comes back as an `entry` price level (`priceLevelsToRegister`), so pass `asset` in full; ⛔ the rungs are points and never one band — a band is a range worked across, and this plan acts at its rungs and nowhere between them |
| when it is required | an `insufficient` or `observing` lens enters in stages. `reviewable` and `promoted` may enter at once; an unstated maturity leaves the requirement unjudged and says so |
| the sizes | they add up to the position the plan says it is building, or the plan is describing two different positions |
| the rungs | a tranche within 5% of its level raises `tranche_approach` — the entry-side counterpart of `exitCheck`'s `trim_approach`, and re-read before it fires for the same reason |
| when half of it lapses | an expired condition on an unfilled tranche is `tranche_plan_incomplete` and **blocks**. Half an entry plan is a position nobody decided the size of; this run re-arms, resizes or abandons the remainder in words |
| classification | one single-name sample **per plan, never one per tranche**. `sampleCount` is 1 whether the name was entered in one step or three, and `countsAsCashDeployment` is false |

⛔ `entryTranchePlan` refuses a `core-dca` lens outright. The two lanes are kept apart in code, not
only in this table: pooled the other way — three tranches counted as three samples — a staged entry
would manufacture the "repeated runs on one still-open idea" `evidence-gates` forbids, out of the
very risk control that exists because the evidence is thin.

**Arm each unfilled tranche with the `intent` the call returns**, verbatim. It carries the same kind
of marker `nextReviewSequence` puts on a review, for the same reason: a manager cannot choose a plan
id and cannot read a WATCH back, so `intent` is the only field that survives the round trip. Armed as
a bare `price-below`, T2 is indistinguishable from any other revisit promise and the run it wakes is
never told it is standing in the middle of an entry plan. `resolveTrancheWake` reads the marker out
of the fired plan's event summary.

⛔ The plan lives in the Thesis, not in private memory. It is one document because the decision was
one decision; a ladder in a memory key would be a second copy of what the Thesis already owns.

## Consensus, before the thesis

⛔ **This was a source that existed and a procedure that did not.** `variantViewCheck`'s four
requirements are all owed before a single name may be proposed at all — since #226 a failed check
returns `variant_view_required_for_position` / `blocked` and `targetWeight: null`, so the shortfall
costs the position rather than 95% of it — and `consensusRefs` is the one whose input is **in no
filing and on no exchange feed**. A run holding `WebSearch`, `WebFetch` and `observation_file` has
everything needed to fill it, and nothing on this page told it to. Measured on
`run_c7ad46eea03840bf84ae7a8822ed02c3` (asOf `2026-09-08T03:01:37.490Z`): `requirementReport` 0 of
4, `consensusRefs` outstanding as *"no consensus row was given, so there is nothing the view differs
from"*. ⚠️ The run before it reported that as *"there is no consensus source"*, which was
**overstated**: what was missing was these four steps.

Do them for every candidate a price sweep or the radar raises, **before it reaches a thesis**:

1. **Query the consensus.** Two figures and no more: the **aggregated analyst target price** —
   mean, and the high and the low if the page carries them — and the **buy/hold/sell opinion
   distribution**. One page per name is enough; this is what your view differs *from*, not a
   research project of its own.
2. **File the passage with `observation_file`** — the URL, the document's own title and publication
   date, and the source's own words verbatim in `excerpt`, with your reading beside the quotation in
   `reading` and never instead of it. Keep the returned `evidenceId`. ⛔ A `publishedAt` after your
   `asOf` is refused, and a bare date counts as the **end** of that day; omit the date rather than
   guessing.
3. **Carry the id onto the row.** Each `consensusRefs` entry takes `metric`, a finite `value`,
   `sourceUrl`, `publishedAt`, `capturedAt`, and the `evidenceId` with `evidenceKind: "observation"`
   and `evidenceSource: "manager:web-research"`. A row without the id still satisfies the
   requirement and is reported `consensus_ref_uncited` — since the route exists, an uncited figure
   is a choice.
4. **Report the absence rather than inventing around it.** If no page answers for this name, say so
   in `uncertainty` and let the candidate stand at 3 of 4. ⛔ Do not substitute a number from model
   knowledge, and ⛔ do not open a worker to crawl for one — a consensus nobody can go and check is
   the failure this manager is named after.

⚠️ **The same reading closes three of `validateThesis`'s four gaps at once**, which is why it is
worth its own step. The 036460 thesis that returned +18.6%p carried *"애널 평균 목표 46,700원
(고 59,000 / 저 26,000), 8 Buy·1 Sell → 약 +41% 상방"* and a probability-weighted *"~+18%"*: the
first sentence is `consensusRefs` — what the view differs from — and both are what the bear/base/
bull targets in §Candidate record 5 are read against, which is where `expectedUpsidePct` and
`fairValueRange` come from.

### Where the two figures come from — one worked path each, and neither is a dependency

⛔ **This records that a path exists; it signs no vendor.** Any page that publishes the aggregate,
names its own publication date and can be quoted verbatim is a legal source, and this package
requires none of these in particular. What it requires is the `evidenceId`.

| sleeve | one worked path | what it answers |
|---|---|---|
| KR | a broker consensus aggregation — e.g. the 종목분석 · 컨센서스 page a Korean brokerage or portal publishes per listing symbol, carrying the estimate house count | 목표주가 mean/high/low and the 투자의견 distribution |
| US | a broker price-target aggregation — e.g. the analyst-ratings page a US market-data site publishes per ticker, carrying the contributing analyst count | mean/high/low price target and the Buy/Hold/Sell split |

⚠️ **`WebSearch` and `WebFetch` are the CLI's and not this gateway's**, so they issue no evidence id
and reach `evidenceIds` through nothing but step 2. ⚠️ And what you file is filed as **your
testimony**: when the main lane opens on it, `effectivePositionCap` returns
`main_lane_rests_on_manager_attestation` and the proposal has to carry that code in one
`rationale.risks` entry — what the approval screen renders — and one `uncertainty` entry, or the
sizing is `blocked`. See `skills/{kr,us}-sleeve/SKILL.md` step 12.

### The filed target is a legal scenario driver, and the contract already said so

A `scenarios.<case>.drivers[]` entry is **either** a filing fact name — `revenue`,
`operatingIncome`, `operatingIncomeYoy`, `marginDeltaYoy`, the four `radarCandidates` normalizes —
**or** an object `{ metric, evidenceId }`. So the analyst target you filed in step 2 is already a
driver this operation accepts, and nothing had to be widened to make it one:

```json
{
  "bear": { "probability": 0.25, "target": 26000,
            "drivers": [{ "metric": "analystTargetLow",  "evidenceId": "ev_consensus_2026q3" }] },
  "base": { "probability": 0.50, "target": 36400,
            "drivers": [{ "metric": "analystTargetMean", "evidenceId": "ev_consensus_2026q3" }] },
  "bull": { "probability": 0.25, "target": 59000,
            "drivers": [{ "metric": "analystTargetHigh", "evidenceId": "ev_consensus_2026q3" }] }
}
```

⚠️ **A fair value here does not have to be a DCF; it has to say where it came from.** This package
publishes no multiple and no discount rate because this methodology names none, and the original was
explicit about the same thing — the 035420 thesis wrote its 230,000~260,000원 band down as *"운영
범위이며, 독립적인 DCF 산출값은 아니다"*. A cited band is a stated basis. An uncited one is not.

⛔ **What that driver does not do is make the case `grounded`, and this page will not pretend
otherwise.** Measured: the three rows above, at a price of 33,100, return `fairValueRange`
`{low: 26000, high: 59000}`, `expectedUpsidePct` `19.18429` and a populated `thesisFields`, the `evidenceId` travels onto every
returned driver row, and the answer is **not blocked** — and `grounded` is `false` with
`scenario_driver_ungrounded` / `unevaluated` on each case, because `grounded` means *a filing fact
this run could read off the statements*, which an analyst target is not. That report is correct and
is left alone. Cite both where you have both: a target standing on an analyst aggregate **and** on
the operating income under it is grounded and cited, and it is the only combination that is.

## Candidate record

Write the following in reasoning and, when a durable asset claim is created, its Thesis:

1. **Business and lens** — what earns money, discovery lens and why this lens applies.
2. **Why cheap/down** — macro, sector and company-specific causes, separated; label temporary versus
   structural and cite point-in-time Evidence.
3. **Opportunity and trap** — the mechanism for recovery and the strongest path to permanent
   impairment.
4. **Variant view** — exactly how the view differs from consensus; if it does not, prefer the
   benchmark. Include `what would prove us wrong` as an observable condition with a horizon.
5. **Scenarios** — bear/base/bull probabilities totaling 100, target/return and factual drivers.
   Compute probability-weighted return only when inputs exist. Pass the table and the name's
   `filings` to `thesisValuation`: this is where `fairValueRange` and `expectedUpsidePct` come
   from, and each case's drivers are what tie its target to a statement rather than to a wish.
6. **Benchmark alternative** — market/sector/broad ETF, its expected return basis and why the single
   name earns its extra idiosyncratic risk. Active expected return is candidate minus benchmark.
7. **Catalyst and event risk** — dates known at `asOf`, next review and data that must arrive first.
8. **Exit logic** — thesis invalidation, price risk boundary, review horizon and trim conditions.
9. **Entry plan** — the tranche ladder from `entryTranchePlan`, each rung with its size, its
   condition and its expiry, written before the first tranche rather than after it. One plan is one
   sample.

Reject ready BUY when expected return is non-positive, active expected return is below config,
trap evidence dominates, evidence quality is inadequate, or challenge is unresolved. Do not fill a
missing field with model knowledge. Preserve source Evidence ids and web URLs separately.

### Which candidate is carried, and finishing it before declining it

⛔ **This is the stage the run loop did not have** (#243). The nine items above have been on this
page since the port, and the four gates that judge them — `thesisComplete`, `variantView`,
`consensusRefs`, `challengeCleared` — have refused an unchecked candidate since #226. What nothing
did was carry one candidate to the end. Measured on `run_bb689b6199084b04afd8b0e1d1528cda`
(2026-09-09): both price branches fed and evaluated (KR 74 of 74, US 83 of 83, `unprepared` 0), 42
eligible candidates, **four** pushed as far as `variantViewCheck` — `267260` at 1 of 4, `LOW` at 2,
`NKE` at 3, `MCD` blocked earlier by `entry_quality_falling_knife` — every one declined, **nothing
registered**. 157 names screened, four touched shallowly, zero documents.

⛔ **The gates are not the problem and the measurement says so.** The ported original — the +18.6pp
thesis `INCIDENTS.md` cites — satisfied all four **by hand**: a named «the market discounts X / our
differentiated view is Y» section, four `consensusRefs` rows each with `metric`, `period`, `value`,
`currency`, `source_url` and `captured_at`, one dated challenge cross-check, and bear/base/bull with
a probability-weighted return, a hard stop and a review date. Its pattern was **one name, deeply,
every artefact, small.** This one's was **157 names, screened, four touched, all declined.**

**⑴ `candidateQueue({rows, perLens})` — which candidate, and per lens.** Hand it the `scan` answers
you read back from the sweep. ⛔ **Not `discoveryScore` order.** That number is the fraction of the
*mean-reversion* signal set a name fires, and a name above its MA200 fires none of them, so the two
lenses that require an intact trend scored **structurally zero** and were never researched (#242).
Measured on the same sweep: `035900` at 60 and `267260` at 40 were both researched; `316140`,
eligible under `trend-pullback` at `offHigh200` −19.0% and `ma200Distance` **+7.8%**, scored 0 and
was not touched. ⚠️ **And the score's sign is backwards against the original**, which chose its name
for being *"스캔 후보 중 가장 덜 빠짐"* — the least fallen of the scan candidates. Each lens is
ordered by its own measurement now: depth for `mean-reversion`, the **shallowest** `offHigh200` with
the trend intact for `trend-pullback`, the surviving `ma200Distance` for `quality-pullback` (whose
band has already fixed the depth). ⛔ The three are on three different scales on purpose and there is
no «top N of the roster». ⚠️ A rank is not a screen: `lenses` still decides eligibility, and a row
whose rank could not be read is queued **last rather than dropped**, by name, as
`lens_rank_unavailable`.

**⑵ Write §Candidate record to the end for the top candidate of each lens.** All nine items, and in
particular the five the gates read: the three scenarios with probabilities totalling 100,
`thesisValuation` over that table for `expectedUpsidePct` and `fairValueRange`, a `catalystRegister`
row for the window, the hard stop and the review date you will register, and the `variantView`
section stating what the market discounts and how your view differs. Then hand that document to
`variantViewCheck`.

**⑶ `candidateCompletion({owesDocument, records})` — did the stage run.** Pass `candidateQueue`'s
`owesDocument` unchanged and one `records` row per document —
`{ symbol, market, lens, thesis, challengeVerdict, verdict }`. It calls `variantViewCheck` itself, so
there is one answer in this package to whether a variant view is established rather than two.
⛔ **It is not a fifth gate and it judges no candidate**; it reads whether the document exists.

⚠️ **Decline after the document exists, not instead of it.** `267260` was declined **correctly** —
the consensus was 19 buy / 0 sell, so there was no view to differ from — and the answer published for
it was `1 of 4`. That does not read as «judged and declined»; it reads as «there was nothing to
judge», and only one of those two states is evidence that this methodology ran. A carried name with
no document is `candidate_completion_absent`, an `input-path` cause that **withdraws**
`mandateExecution`'s positive answer: this run may not report `no-candidate-cleared-the-gates` over a
lane whose leading candidate reached no document. ⛔ It blocks nothing — a `WAIT` with every document
written and every candidate declined is an honest run, and the code exists so that it can be told
apart from a run that wrote none.

## Declaring the universe

Do this every run. `skills/data-source-contract/SKILL.md` owns the listing and filing routes.

⚠️ **The argument is the sleeve — `'kr'` or `'us'` — and never a MIC.**
`inputContracts.vocabulary.markets` publishes `XKRX`/`XNAS`/`XNYS`, which is the venue list this
manager contributes to and not what any operation on this page accepts; `researchMarkets` is
published beside it for exactly that reason (#146).

Use `researchUniverse({market: "kr" | "us", extensions})` for the bundled curated seed
(KR 74 / US 83, pinned to the package provenance commit). This is a research scope, not today's
whole market. Check current listing eligibility from the provider, record delistings/exclusions,
and never call coverage complete over names you did not actually inspect. For historical runs,
the operation refuses a seed dated after asOf; current listings cannot establish historical membership.

1. Read `coverage/research-index`; pass its extension rows to `researchUniverse`.
2. Check the returned roster's current eligibility and fetch price history and installed filing
   sources for the eligible names. OpenDART receipts and SEC publication times must be <= asOf.
3. **Feed the fundamental branch before running it, in this order** (#146): the registry that
   supplies the vendor's own filer id — `open-dart` `/api/corpCode.xml` for `corp_code`,
   `sec-edgar` `/files/company_tickers.json` for the CIK — then `mapCorporationCodes` to join it
   onto the roster, then `fundamentalsPlan` for the ordered calls with their host cache states,
   then `source_cache_read` / `source_cache_refresh`, then `dartVendorStatus` on every OpenDART
   response, then `radarCandidates`, then `radarFeedDiagnosis`. ⛔ **The registry step is the one
   that was never taken**, and without it nothing fetched can be addressed to a filer.
   Run `upsideRadar({candidates, feed})` and `scan`; no price signal is required to enter the
   fundamental branch.
4. Pass the declared roster to `coverage` as `scannerUniverses` and extensions as `extensions`.
   Record individual exclusions and unresolved names, and the aggregate in `coverage/universe-state`.
5. Call `researchState` with the previous index and observations containing
   `{symbol, market, observedAt, evidenceIds, sector, extension}`; persist its non-null nextState.
   This keeps research membership and provenance between runs, not raw vendor payloads.

Source storage is the host's and now exists (aumos#671, #683): `source_cache_read` reports
`never-fetched` / `refresh-failed` / `stale` / `fresh`, and those are four findings rather than one
empty payload. Read the cache, refresh only what the state says to, and report the state you got.
Where the store is unavailable, refetch per run and say so — ⛔ never in private memory, which
`skills/memory-contract/SKILL.md` forbids from being a source cache.

A failed or unperformed filing collection must surface `radar_lane_starved` **with the stage that
lost it**, not an empty opportunity set. ⛔ And `fed-and-genuinely-empty` is reported as itself:
the market was looked at and declined nobody, which is a different sentence from *nothing was ever
looked at* and produces the same empty list.

⚠️ **A partly fed branch is a third sentence and it is said in numbers** (#178). Pass the
`radarCandidates` **rows** to `radarFeedDiagnosis`, not only its counts: they are the denominator,
and without them a roster of 83 that produced one usable filing came back `fed`. The answer is
`stage: 'partially-fed'` with `coverage: { fed, of, unfed }`, and it is neither «the market was
reviewed» nor «nothing was ever looked at».

`entryQualityGate` needs historical OHLC `bars` (at least 60; 200+ for the long indicators),
not a `scanHistory` field or prior scan runs. ⚠️ **You do not relay them for the sweep** — the
`roster-scan` recipe below runs the gate beside `scan`, over the bars the host holds, for every
candidate that named a lens, and hands back `entryQuality` on the row. ⚠️ *Holds* is not *has
always held*: you ask the host to collect them with `source_cache_refresh` on `prices`/`daily`
before you prepare, which is the first of the two steps below, and no bar reaches your context on
either of them. Relay bars only for a single name the roster never covered, and never for a roster.

## The roster sweep is prepared, not relayed

⛔ **Do not read a roster of daily bars out of a vendor and type them back in as `calculate`
arguments.** That is what one measured run did — `scan` 40 times and `opportunityMetrics` 45 times,
about **1.91 million characters** of tool argument, 29 subagents opened to carry it, and no
judgement submitted at the end of it (`untilled/aumos-catalogue#209`). The arithmetic was never the
expensive part; the model in the middle of it was.

This package declares its own three computations in `aumos.json` under `recipes`, and the host runs
them in its own process over the inputs it already stores. The first two are this roster sweep; the
third is the lane ranking `skills/theme-radar/SKILL.md` owns and is not run over the roster:

| recipe | what it is | what it is not |
|---|---|---|
| `roster-scan` | `scan` for one symbol, plus `entryQualityGate` when that symbol named a lens | not an aggregate — one process is one symbol |
| `opportunity-metrics` | `opportunityMetrics` for one symbol | not the ranking; `opportunityUniverse` folds the rows afterwards |
| `sector-series` | one symbol's series reduced to what the lane fold reads — run over a lane's benchmark and its sector proxies, never over the roster | not the ranking; `sectorStrength` folds the rows afterwards |

Both call `execute()` from `lib/index.mjs` — **the same function `mcp__evidence-gated-metrics__calculate`
calls**, with the same `normalizeBars`, the same `LENS_ENVELOPES` thresholds and the same
diagnostics. The numbers do not change because the caller did.

### First fill the series, then prepare — the sweep reads what this fund already holds

⚠️ **`task_start` collects nothing.** It runs this package's arithmetic over the documents
this fund has **already** stored for each name, so a roster nobody has collected a price series for
comes back evaluated-with-no-data on every row. That is not a hypothetical: it is what every row
looked like until `untilled/aumos#734` gave the host a price collector at all.

So the sweep is two steps and this is the first of them. For every `{market, symbol}` on the roster
you just declared, call

```jsonc
source_cache_refresh({
  provider: "prices",           // ⛔ never a vendor name — which one answers is the fund's to decide
  document: "daily",
  market: "XKRX",               // ⛔ the venue MIC, not the `kr`/`us` you use for a filer
  symbol: "005930",
  asOf                          // this invocation's pin, as always
  // parameters: { assetClass: "etf" } for an ETF; `days` only to widen a FIRST collection
})
```

⛔ **No `vendorId`** — it is refused on this document. `skills/data-source-contract/SKILL.md` owns
the route, the four answers and the reason each field is shaped that way; read it before the first
call rather than after the first refusal.

⚠️ **This is cheap on the second pass and that is the design.** The host asks the vendor only for
the gap between what this fund holds and the newest bar that had closed at your `asOf`, and a
roster refreshed twice over the same closed bar reaches no vendor at all (`state: 'satisfied'`).
⛔ So *«a previous run already collected these»* is not a reason to skip this step: the previous run
was pinned earlier, and the sessions since then are exactly what the gates are being asked about.

⚠️ **Order matters and the failure is silent.** Preparing first and refreshing afterwards produces a
correctly-shaped result whose every row says the price branch was never run, and reading that as a
market that offered nothing is the error `untilled/aumos-catalogue#209` is named after. Refresh the
roster, **then** prepare it.

⚠️ **A name whose refresh you could not complete is `unprepared` in your own report before anything
else says so.** Carry those symbols by name into the `uncertainty` entry below with the answer that
stopped you — `failed`, `no-source-for-market`, or a limit that ended the turn.

### The three calls, in order — and the third one reads files

⚠️ **The answers are FILES since `untilled/aumos#743`.** One per name, written by the host into your
own folder, and that is the whole point of the route: a roster of metric rows never becomes a tool
result at all, and you read exactly the ones you want.

1. `task_start({ recipeId, items, parameters, outputPath, asOf })`. `items` is the roster you
   declared — one row per name, **names and nothing else**:

   ```jsonc
   items: [{ id: "XKRX:005930", input: { symbol: "005930", market: "XKRX" } }]
   ```

   ⚠️ **The `id` must be the coordinate this fund files documents under** — `<MIC>:<symbol>` — because
   that equality is what makes the host hand the recipe this fund's stored documents for that name.
   An id of your own invention is accepted and the recipe is handed **nothing**, which is
   `untilled/aumos-catalogue#209`'s failure bought back for the price of a prettier string. The
   `input` carries this package's own spelling and the host never reads it.

   `outputPath` is the folder the answers land in, relative to your own folder:
   **`scans/<asOf's calendar day>/<recipeId>`**. ⚠️ It is part of the cache identity, so asking for the
   same computation into a different folder runs it again — use the same path across a run's two
   recipes and across a retry.

   `parameters` carries what the sweep cannot derive and you can: `held` and `pending` as short
   symbol lists, and `sectors` as a symbol→label map for `opportunity-metrics`. ⛔ **Bars never go in
   `parameters`.** They would be the same 1.91M characters with one more process in the way.

   The answer is immediate: either `cached: true` with counts and the folder already filled, or a
   `taskRunId` to poll.
2. `task_get({ taskRunId })` until it settles — `completed`, `partial`, `failed` or `cancelled`. It
   carries the item counts, the folder, what is still pending by name, every answer with **the file
   it is in** — that list is `outputs`, and it is the only thing that says which files are *this
   run's* — and every failure with its `kind` (`network` will be retried, `parse` will not read
   any better next time).
3. `files_read` on the files `task_get` named in `outputs`. ⚠️ **Read them —
   finishing is not preparing.** A settled run whose files you never opened is `unsettled` to
   `executionRecord`, and rightly: the host counted items and only the answers say what this fund
   could actually read. ⛔ There is no call that hands you the whole roster at once and you should
   not want one; the rows you fold with `opportunityUniverse` are metric rows you read one by one.

   ⛔ **Fold `outputs`, never the folder** (`untilled/aumos-catalogue#245`). `outputPath` is a
   **calendar day**, so `scans/<date>/<recipeId>/` accumulates every sweep run on that date,
   discarded ones included. Measured in the owner's store, `scans/2026-09-09/roster-scan/` held
   **242** files — 83 answers on discarded venue-keyed ids beside 83 `us:` and 76 `kr:` answers from
   the sweep that worked — and folding the folder wholesale reports `unprepared 83종`, ⚠️ **a fact
   that does not exist**: those 83 are a coordinate this run threw away, not names it could not read.
   ⚠️ **The separating key is each answer's own `evaluatedAsOf`** — `00:39:16.609Z` on the discarded
   batch against `11:23:55.210Z` on the live one — which `recipes/request.mjs` writes from the host's
   pin and ⛔ never from `Date.now()`. So `outputs` is the instruction and `evaluatedAsOf` is the
   check: ⛔ `files_list` says what is **on disk** and never which of it is **yours**, and a roster
   read off a directory listing is a roster nobody promised you — the host promised you `outputs`.

### The counts are reports and are never added together — and you count three of them

⚠️ **The split moved with the tools** (`untilled/aumos#743` §B). The host counts **items** and stopped
counting how many names this fund held anything readable for, because that was a judgement about
documents that only the party reading them makes. That party is this package, and each answer file
carries **`sourced`** so it can be counted.

| count | who says it | what it says | what it does **not** say |
|---|---|---|---|
| `total` · `pending` · `done` · `failed` | `task_get` | how many items there are, how many are not attempted, how many answered, how many could not | nothing at all about documents |
| `sourced` | **the answer file** | this fund held readable documents for that name | nothing about whether any of them carried a price |
| `evaluated` | **the answer file** | the recipe computed something (`data` is not `null`) | ⚠️ an answer of *these documents carried nothing* **is** an evaluation and is counted here |
| `unprepared` | **derived** — a `sourced: false` answer | that name had **nothing readable at your `asOf`** | ⛔ **not** «no opportunity there» |

⛔ **Do not type these numbers.** Hand the answers to `executionRecord` as `rows` and it derives all
of them, so what the record says is checkable against the folder it names.

⛔ **`unprepared` is blindness and is reported as blindness.** It means either that nobody ever
collected those names or that everything collected was captured after the instant you are judging;
the symbols come back **by name**, and the control that fixes it is `source_cache_refresh` on those
names. Reporting an `unprepared` roster as a market that offered nothing is the same error as
reporting `never-fed` as `fed-and-genuinely-empty`, one layer up, and it is the error this whole
issue is named after.

⚠️ **A row's `sourced` and a row's `data` are two different sentences.** `sourced: false` is *nothing
about that name was readable at all*. An answer carrying `empty: true` is *the documents were read and
they carried nothing*. And a row whose `data` is `null` beside a
`scanner_history_insufficient` / `opportunity_history_insufficient` diagnostic is the third: the
documents were read and **none of them was a price series**, so the lens sweep was never run for
that name. Carry the diagnostic — it is the only thing that tells those apart.

### ⚠️ `scanner_history_insufficient` has three causes and only one of them is your fault

The diagnostic says one thing — *fewer than 60 usable bars reached the gate* — and it is emitted
identically whether nobody collected the series, whether the venue is unpriced on this machine, or
whether the name genuinely has almost no history. ⛔ **Do not report the three as one**, and ⛔ do
not repair the diagnostic by widening the roster. This is the same distinction as the three counts
above, one layer down, and it is answered by **what your own refresh said about that symbol** —
not by the recipe's output, which cannot tell them apart.

| what your `prices`/`daily` refresh answered for that symbol | how to read the diagnostic | who has the control |
|---|---|---|
| you never called it, or the turn ended first | ⛔ **not prepared** — blindness, exactly like `unprepared` | **you**, on this run or the next: call it |
| `no-source-for-market` | ⛔ **this machine prices no venue for that name** — blindness about a whole venue, not about a company | the **investor**: connect the broker or add a price source. Report it once per venue, not once per name |
| `failed` | the price source was asked and did not answer — what is stored is behind, not absent | nobody this run; re-ask next run and say so |
| `observed` or `satisfied` | ⚠️ **the series is as complete as this venue has** and 60 bars is genuinely more than exists | ⛔ **nobody** — this is a fact about the name, and it is the honest verdict |

The last row is the one that is a real finding: a name listed weeks ago, one returning from a long
halt, or one whose venue simply has not traded it. ⚠️ **It is still not «this name failed a gate».**
The gate was not evaluated — `severity: 'unevaluated'` says so — so the name is neither a candidate
nor a rejection; it is a name this methodology cannot judge yet, and it is carried as such.

⚠️ **The `barsRead` / `barsUsed` pair on the row is what makes the last two rows distinguishable at
all.** `barsRead: 0` after a successful refresh means the documents this fund holds for that name
carried no series; a small non-zero `barsUsed` means the series exists and is short. Quote the
number rather than the word.

### What you do with the names you could not review

⛔ **Not a silence, and not a new path.** Persist the roster you *did* review with
`researchState` to `state/coverage/research-index.json` (`skills/memory-contract/SKILL.md` owns it),
name the unreviewed names and **why** — `unprepared`, `failed` with its kind, or a delegation
refusal code verbatim — in one `uncertainty` entry, and arm the revisit as a WATCH/plan the way
this page already requires for a conditionally rejected candidate. A `WAIT` whose data was never
prepared is a different answer from a `WAIT` where the gates ran and nothing qualified, and
invariant 5 asks you to tell them apart.

### When the tools are not served

⚠️ `task_start`, `task_get`, `task_cancel` and the file tools are **optional skills**, so a host that
predates them serves none of them. That is an absence to report in `uncertainty`, exactly like any
other — say which was not named and that the mechanical sweep was therefore not prepared. ⚠️ The file
tools are the ones to check first: without them there is nowhere for an answer to land, so a served
`task_start` and an unserved `files_read` is a sweep that runs and cannot be read. ⛔ It is
not licence to reopen the relay path: a roster's bars typed back as tool arguments is the failure
mode, not the fallback. A single name that the sweep could not cover may still be evaluated through
`calculate` with its own bars.

## Coverage

“Coverage complete” means the declared universe was accounted for, not that the whole market was
searched — and with nothing declared it means neither. `complete` is `null` in that case, and
reporting it as a pass is the specific error this section exists to prevent.

⛔ **And `complete: null` beside a radar that was not due is a run that could not have found
anything.** The two branches shut on the same day is `discoveryCapacity`'s `discovery_lane_dark`,
and it is reported rather than passed over: a `WAIT` produced with zero discovery capacity looks
exactly like a `WAIT` produced by reviewing the market and declining it (#140). `PROMPT.md` §1b
owns the check; what this page owns is the reason it can never be inferred from an empty candidate
list — an empty list is what *both* runs produce.

**The theme radar must add candidates from outside the universe, and this is not optional.** The
mechanical scanners see inside the declared universe and nowhere else, so forward research is the
only path across that boundary; `skills/theme-radar/SKILL.md` owns the requirement and states how
many axes a run owes. Quota-filling stays forbidden in the other direction: the obligation is to
*look* outside on a named axis, never to produce a candidate, and zero qualified candidates is
valid. Schedule skipped or conditionally rejected candidates with WATCH/plan so they do not
disappear into prose.
