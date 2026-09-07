---
name: data-source-contract
description: Route Toss, SEC EDGAR, Alpaca, optional OpenBB/FMP and web research while enforcing point-in-time, freshness and graceful-degradation rules.
---

# Data-source contract

Read **both** tools' `Allowed:` lists before the first request — `source_request`'s and
`connection_request`'s. Never guess a path, and never discover a required source only after doing
work that assumes it exists. Pass the invocation's exact `asOf` on every call even when a vendor
endpoint also needs its own end date.

⛔ **A vendor absent from one list is not an absent vendor.** The table below is the whole reason:
the split is by where the credential lives, not by what the data is, so market data sits behind
`connection_request` and filings behind `source_request`. Measured on
`run_3a48eaaa505241d5af94fb490d7c23c6`: four runs of five abandoned every price, bar and calendar
judgement — `trendState`, `exitCheck`, `entryQualityGate`, `crossCheckPrice`, `scan`,
`opportunityMetrics`, `indicators`, `relativeStrength`, `sectorStrength`, the `signalPaper` scoring
and the session procurement for `nextReviewSequence` — after reading only `source_request`'s list
and concluding the Toss route was gone. It was installed with twenty paths throughout, and no call
was ever made. ⚠️ **A miss in one list is not a route failure**, so the sibling-route test below
does not apply to it: there is no failed call to interpret. Look in the other list first, and never
write the miss to the Brief or to `failures/repeated-patterns` — a run that files it there hands
every later run a diagnostic rule that reproduces the same wrong answer.

## Responsibility and endpoints

Granted web is the fallback for news, corporate actions, distribution history and consensus when
Alpaca is absent. This changes the route, not whether the research is performed. Preserve URL,
publishedAt, capturedAt, units and period; web remains non-canonical replay evidence and never
replaces required OpenDART/SEC filings or Toss prices. After collection call `laneCoverage` with
`intent: "holding-news"` (or `news`, `corporate-actions`, `consensus`) and `activity` such as
`{"web":{"attempts":2,"succeeded":true}}`. Zero calls is `lane_not_queried`; a failed call is
`lane_query_failed`; a missing route is `lane_source_blocked`. Carry these codes in uncertainty.

**Two tools, and which one you use is decided by where the credential lives.** 토스 and Alpaca are
**logins the investor already made**, so their calls go through `connection_request` and you are
handed no key; SEC EDGAR and 금융감독원 are documents with keys of their own, so their calls go
through `source_request`. A vendor whose login this fund does not hold has no tool at all — that is
a different thing from a call that failed.

⚠️ **There are two Toss's in this table and only one of them is a tool call.** The 토스 *login* is
market data and is reached through `connection_request`. The Toss *broker connector* — portfolio,
cash, fills, the order path — is Kernel-owned and reached through neither tool. ⛔ Do not read
"Toss is market data, not the broker connector" as an argument about which tool: it is an argument
about which Toss, and following it into `source_request` lands on a list Toss was never on.
`connection_request`'s own first line is *"Ask a broker the investor has already connected"*, which
is what makes the wrong turn look right.

| provider | tool | catalogue endpoints used here | time meaning |
|---|---|---|---|
| Toss broker connector | — | portfolio, cash, fills, order/approval path | Kernel-owned; never call through either tool |
| 토스 login | `connection_request` | `/api/v1/candles`, `/prices`, `/orderbook`, `/trades`, `/stocks`, `/stocks/all`, warnings, flows, FX, calendars, rankings, indicators | the host bounds `before`/`until`/`dateTime` at `asOf` for you; a window may come back shorter than asked and never longer |
| `sec-edgar` | `source_request` | `/files/company_tickers.json` **first**, then `/api/xbrl/companyfacts/CIK{10-digit zero-padded}.json` — ⛔ the allowlist's `{symbol}` is that **file name**, never a ticker | each fact unit is available at its `filed` date, not fiscal period end |
| Alpaca login | `connection_request` | bars, news, corporate actions | `end` is filled at `asOf` if you leave it out; snapshots are always current and never canonical replay evidence |
| `openbb-fmp` | `/api/v1/equity/price/historical` only | optional long history; set `end_date`, record provider and adjustment |
| `open-dart` | `/api/corpCode.xml`, `/api/company.json`, `/api/list.json`, `/api/fnlttSinglAcntAll.json`, `/api/fnlttSinglAcnt.json` | the **receipt** is the moment: `rcept_no` begins with the receipt date and `rcept_dt` repeats it; a business year is not a disclosure date |
| CLI web | fallback news, corporate actions, distributions, consensus; IR, policy, macro, industry/theme context | active fallback when Alpaca is absent; non-canonical, retain URL/access time and disclose replay gap |

### The stored copy, and the four answers it gives (aumos#671, #683 · Aumos 0.3.30)

`source_cache_read` and `source_cache_refresh` hold filings per filer so the branch is not
re-procured every run. Read before you refresh, and read the **`state`** — the field is `state`,
not `status`:

| `state` | what it is | ⚠️ what it is **not** |
|---|---|---|
| `never-fetched` | nobody has ever asked for this filer | not an empty answer — this run is blind |
| `refresh-failed` | the attempt did not reach the vendor; `failure` says why, `cached` is what is still on hand | not an empty cache — what is there is behind |
| `stale` | the last success is outside the `freshFor` this call stated | not unusable; refresh, then read |
| `fresh` | the last success is inside it | ⛔ `fresh` with an empty `documents` is **the vendor having nothing** — that is an answer |

`source_cache_read` takes `{provider, market, symbol, freshFor, asOf}` and `freshFor` has **no
default**, deliberately: a default would be the host setting this methodology's deadline.
`source_cache_refresh` additionally takes `document`. Four are routed, and the fourth is not a
filing:

| `provider`/`document` | `market` | `vendorId` | `parameters` |
|---|---|---|---|
| `open-dart`/`filings` | research market (`kr`) | the `corp_code`, **required** | — |
| `open-dart`/`financials` | research market (`kr`) | the `corp_code`, **required** | `year` and `reportCode`, by name |
| `sec-edgar`/`companyfacts` | research market (`us`) | the CIK, **required** | — |
| **`prices`/`daily`** | ⛔ **the venue MIC** — `XKRX`, `XNAS`, `XNYS` | ⛔ **refused** | optional `assetClass` (`equity` default, or `etf`) and `days` |

⛔ **There is no cache document for the corp-code registry**, which is why the registry above stays
a `source_request` and stays first. And Aumos resolves no `vendorId` for you on the three filing
rows.

The host cuts every cached observation and attempt at the invocation's `asOf` before this process
sees a row. Filter again anyway; a boundary enforced in one place is one refactor from being gone.

### `prices`/`daily` — the fund's own copy of a daily series (aumos#732)

⚠️ **This is the row that fed nothing until it existed.** Until `untilled/aumos#734` the three
routed documents were all filings, so a roster prepared through `research_prepare` came back with
receipts and no bars and both recipes answered `scanner_history_insufficient` with `count: 0`.
`prices`/`daily` is the collector that fills `reading.normalized.bars`, and it is the **only** way
a price series reaches the sweep.

⛔ **It is not `market_history` coming back, and no bar is ever handed to you.** There is no new
tool and no new capability: you call `source_cache_refresh`, which this package has held since
0.3.30, and what you read back afterwards is what a recipe computed — a handful of numbers per
name. A roster of bars typed into `calculate` is still the failure mode this whole route exists to
delete.

Four things about it differ from the filing rows, and each of them refuses rather than guesses:

- ⛔ **`market` is the exchange, not the research market.** `kr` and `us` are correct for a filer,
  whose documents are not filed at a venue, and are **refused here by name**: a bar is nothing but
  one venue's record, and Upbit's BTC and Alpaca's BTC are two order books.
- ⛔ **`vendorId` is refused.** You have already named the venue and the ticker; there is nothing
  left for a vendor's own filer id to say. Which vendor answers is decided by the fund's own price
  sources, in the same order the Wake Engine marks the book with — so the series the sweep reads and
  the closes the engine marked come from the same place by construction.
- ⚠️ **The window is incremental and it is the host's to compute, not yours.** A first collection
  reaches back `days` calendar days (400 by default, roughly 270 sessions); every later one asks for
  the **gap and nothing else**, and a re-run over the same closed bar reaches no vendor at all and
  answers `state: 'satisfied'`. So refreshing the roster twice in one turn is cheap, and *«I already
  did it»* is not a reason to skip it on the run that needs it.
- ⚠️ **The newest bar you can read is yesterday's.** A daily bar becomes readable 24 hours after its
  own opening stamp, which is at or after the close on every venue and needs no timezone table. On
  XKRX that is about eight and a half hours after the close, so a run pinned during or just after a
  session **cannot see that session's own bar**. ⛔ That is one row out of two hundred and it is not
  starvation — do not report it as one, and do not re-ask for it.

Read the `state` the same way as for a filing, plus the one refusal that is neither:

| answer | what it is | ⚠️ what it is **not** |
|---|---|---|
| `observed` with `refreshed: n` | *n* newly closed bars are now in this fund's copy | not the total held — it is the gap that was filled |
| `satisfied` | this fund already holds every bar that had closed at your `asOf` | ⛔ **not** an empty answer and not a failure — it is the cheap path working |
| `failed` | the ask reached the price source and did not come back | not an empty cache; what is stored is behind |
| `no-source-for-market` | ⛔ **nothing on this machine prices that venue** | not a vendor outage and not this run's to fix — it is a standing condition, it is the investor's control (connect the broker, or add a price source for that venue), and it is true of the **whole venue** rather than of the name |

### Toss's two time formats, and the one enum this package guessed

The 토스 login is two families of route, and they do not spell time the same way. Neither shape is
derivable from the other, so a run that carries one across is refused by the vendor rather than
answered wrongly:

| route family | parameter | shape | what comes back |
|---|---|---|---|
| `/api/v1/candles`, `/api/v1/market-indicators/{symbol}/candles` | `before` | RFC 3339 with an offset — `2026-08-20T00:00:00.000+09:00` | `nextBefore`, in that same shape |
| `/api/v1/stocks/{symbol}/…` | `until` | a date — `2026-08-27` | `nextUntil`, in that same shape |

`interval` on the two candle routes is a closed vocabulary, and the daily member is **`1d`**.
`day` is refused with a 400 — one string, and it stopped this book for two days
(untilled/aumos-catalogue#127). ⛔ **`1d` is written here because `1d` is what was measured**, on
2026-09-04, against 069500: 200 with sixty daily bars. `KOSPI` reproduced the 400 and was never
asked for the 200, so it is not evidence here. A weekly or monthly spelling may well exist and this
package does not know it, so a run that needs one is varying a parameter — the section below, not a
value copied out of this table.

### The listing route, which checks current eligibility

`/api/v1/stocks/all` is the one route here that answers with a **roster** rather than with a
reading. Use it to check the curated roster's current eligibility or declare a broader sweep
(`skills/candidate-research/SKILL.md` owns that procedure). It takes
four filters — `market`, `status`, `securityType`, `commonShare` — and a run states which it passed,
because a screen nobody wrote down is not a declared universe.

⚠️ **Those four are parameter *names*, and their values are a vocabulary this package has not
measured.** Do not copy a value out of anywhere, including this page — there is none here for that
reason. Send the filter you mean, and when the vendor refuses it you are in the section above: a
sibling route decides whether the route is unwell or the value is, and a filter vocabulary the
vendor never published is a row in `missingFields`, not a guess.

⛔ **It carries no time parameter, so it is not point-in-time and never becomes replay evidence.**
The roster it returns is what is listed at the moment of the call: a name delisted last year is
absent, so a universe declared from it is survivorship-shaped, and every backward-looking number
computed over it inherits that. That is a caveat to state, not a reason to skip the call — an
undeclared universe is worse than a survivor-biased one, because it reports as complete.

## Time filter

For every response:

1. Identify the market-availability timestamp, not merely the period it describes: SEC `filed`;
   DART receipt time/number; news publication time; corporate-action announcement/effective fields;
   bar timestamp.
2. Drop rows strictly later than invocation `asOf`. Do not round `asOf` to a date when intraday
   ordering matters.
3. Apply configured freshness from the newest retained row. A source can be successfully called and
   still be stale.
4. Record dropped-row count, newest retained timestamp, freshness outcome and Evidence id in
   reasoning/diagnostics.
5. Pagination repeats the same boundary. A later page may not reintroduce future rows.

Three OpenDART behaviours change what a response means. `corpCode.xml` answers with a ZIP archive,
relayed as sent — `parseDartCorpCodes` reads the decompressed text, and where a run cannot
decompress it, `corp_code` and `stock_code` come off `list.json` rows for roster names instead;
`mapCorporationCodes` takes either. ⛔ **That fallback is one bounded read and not a licence to
harvest**: a run that cannot address a filer reports it and runs the price branch, and it never
walks the disclosure listing page by page — nor opens a worker to — to rebuild the registry by hand. ⛔ **That registry is not optional and it is not a fallback**: every OpenDART route,
and the host cache's `vendorId`, is keyed by `corp_code`, the curated roster is keyed by the
six-digit listing symbol, and the call that joins them had never been made until #146.
Errors arrive with HTTP 200 and a `status` field, so `020` (quota exceeded) must be read as *we
were not allowed to look* rather than as an empty result — ⛔ and `013` (matched nothing) is a
**different** answer, not a synonym. `dartVendorStatus` separates them and every OpenDART response
goes through it. And XBRL statements follow the periodic
report, so a quarter that has only been announced preliminarily has no statement — a real gap, never
filled in with the preliminary figures.

Never mix adjusted and unadjusted bars. Request the basis explicitly, verify discontinuities against
corporate actions, and block price-derived returns or targets when the basis cannot be reconciled.

## A vendor error is not an outage until it is proved one

The section below is about a source this fund does not have. This is the other case — the source is
there, the call was made, and the vendor answered with an error — and it is the one a run improvises.
Invariant 5 forbids turning missing, stale or conflicting evidence into confidence; **infrastructure
evidence is evidence**, and the same discipline governs it. What a failed call establishes is *this
request returned this status*. *The route is down* is a different claim about a different subject,
and this run has to earn it.

Earn it by calling a **sibling route on the same source** — one whose shape this run already knows,
`/prices` or a market calendar for 토스, a mapping call for `sec-edgar`, `list.json` for `open-dart`
— and read the pair:

| the siblings | what that is | what this run does |
|---|---|---|
| answer normally | **a request error.** A vendor serving three routes out of five is not down | vary the request one axis at a time, and take the fields that may carry a closed vocabulary first — `interval` is the shape of that failure, because a wrong enum member and a dead route return the same status. Where the vendor names no vocabulary for the field, that absence is the finding: record it in `missingFields` |
| fail the same way | a source failure, which may be recorded as one | record it, and apply the degradation row below for that source |
| are not conclusive either way | undetermined | say so in `uncertainty` and **write no blocking list.** "I could not tell" is a sentence this package already has a home for |

⛔ **A 4xx is the vendor saying the request was wrong, and reading it as an outage inverts it.** A
4xx may be recorded as a vendor failure only after a sibling call failed too; without that, it is a
request error whose axis has not been found yet.

⛔ **An unconfirmed diagnosis does not enter a Brief conclusion or `failures/repeated-patterns`.**
Those two hold observations, and a causal claim written into either outlives every run that could
have falsified it — the next run reads it as something already established and stops looking.
`uncertainty` is where an unverified inference belongs, and it ends with the run that wrote it.
`skills/memory-contract/SKILL.md` carries the same refusal from the writing side.

⚠️ **Read back the record you are about to write.** The failure this section exists for wrote its
own refutation into the same object — three sibling routes listed as healthy, beside a conclusion
that the vendor was down — and never re-read it. A diagnosis whose own fields contradict it is not
a diagnosis, and the fields are right there.

## Required and optional installation policy

The core install requires the `source_request` gateway. The usable lane depends on sources present:

- **토스 login**: required for new price signals and target calculations; without it, review existing
  Evidence/Thesis only. ⚠️ What is missing is a **connection**, not a source — the investor connects
  it where accounts are connected, and an account is not required for prices.
- `sec-edgar`: required for new US fundamental BUY or thesis promotion.
- **Alpaca login**: required when current news or a corporate action is material to the judgement.
  Without it, SEC/Toss review may continue but that new judgement is blocked.
- `open-dart`: required for new Korean single-name fundamental BUY or promotion. Where it is not
  installed, those outcomes are unable-to-judge WAIT — the source exists in the catalogue, so this is
  a machine that has not installed it rather than a capability nobody has.
- `openbb-fmp`: optional and used only when configured work needs history Toss/Alpaca cannot supply.
- CLI web: optional for core/exit/weight management; unavailable web blocks theme radar, variant-view
  or consensus-difference claims and must never fail silently.

| missing | may continue | must block |
|---|---|---|
| 토스 login | existing Evidence and Thesis review | new price signal or target calculation |
| SEC EDGAR | Korean ETF and price/weight lanes | new US fundamental BUY/promotion |
| Alpaca login (news/actions) | SEC fundamentals and Toss prices | a judgement that requires news/action confirmation |
| `open-dart` | Korean ETF and existing-position price/weight management with stated uncertainty | new Korean single-name fundamental BUY/promotion |
| CLI web | core, exit and weight management | theme radar, variant view, consensus-difference and policy/macro claims |

Conflicting sources do not get averaged. Name the conflict, prefer the source whose field is primary
and point-in-time for that claim, or leave the gate unresolved.

A vendor price and a web figure for the same asset are exactly that kind of conflict. Call
`crossCheckPrice`: within tolerance the reading stands, and beyond it Toss is selected, the web number
is not averaged in, and the difference is retained as provenance in reasoning and Evidence. The
configured tolerance is `priceConflictTolerance`, 5% by default, the Trading Harness threshold this
rule is ported from.

## Web observations are typed, dated and non-canonical

Web research is where an undated number does the most damage, because a page serves the same figure
today that it served last quarter and neither the model nor a replay can tell. Two contracts apply,
and both are enforced by the deterministic core rather than by prose.

### Consensus, guidance and actual

Every quoted figure is normalized before it is used, through `validateConsensus`:

| field | rule |
|---|---|
| `metric` | the named line item, not a paraphrase |
| `value` with `unit` | `unit` names the dimension, spelled exactly: `percent`, `ratio`, `count`, `multiple`, `index-points`, `days`, `shares`, `basis-points`. Anything else is money and also needs `currency` — including a prose spelling of one of these, which is not recognised |
| `period` | the fiscal period the figure describes |
| `sourceUrl` | the page the figure was read from |
| `publishedAt` | when the source published it; never after `capturedAt`, never after `asOf` |
| `capturedAt` | when this run read it |
| `type` | one of `consensus`, `company-guidance`, `actual` |

A search snippet without a publication date is not point-in-time consensus and cannot be repaired by
citing the search itself. Market consensus, company guidance and reported actuals stay three separate
observations: they answer different questions, and merging them destroys the surprise calculation
that the earnings review depends on. Fair value, expected upside and the variant view must each name
the consensus observations they were computed from. When aggregators disagree, record the conflict
and the unresolved uncertainty; an average of two undated numbers is a third undated number.

### Policy and macro

The declared macro vocabulary is `vix`, `put-call-ratio`, `sentiment-index`, `market-breadth`,
`index-level`, `index-ma50`, `index-ma200`, `policy-rate`, `policy-statement` and `industry-policy`.
Pass each observation to `validateMacro` with its `observedAt`, `sourceUrl` and `sourceTier`:

- an undated reading is refused, not treated as current — this is the rule that keeps a replay honest;
- an observation later than `asOf` is dropped like any other source row;
- an official publisher — central bank, exchange, index publisher, regulator — outranks an aggregator
  restatement, and an aggregator-only reading keeps its provenance gap named;
- index levels and prices are cross-checked against Toss by the rule above.

⛔ There is no macro score. A regime judgement is a mixed quantitative and qualitative reading at one
`asOf`; it belongs in Brief with its Evidence ids, and a single number here would be read as a
database this package does not have. Without web access this lane blocks rather than assuming a
neutral regime.
