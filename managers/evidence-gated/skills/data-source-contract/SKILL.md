---
name: data-source-contract
description: Route Toss, SEC EDGAR, Alpaca, optional OpenBB/FMP and web research while enforcing point-in-time, freshness and graceful-degradation rules.
---

# Data-source contract

Read `source_request`'s `Allowed:` list before the first request. Never guess a path, and never
discover a required source only after doing work that assumes it exists. Pass the invocation's exact
`asOf` on every call even when a vendor endpoint also needs its own end date.

## Responsibility and endpoints

**Two tools, and which one you use is decided by where the credential lives.** 토스 and Alpaca are
**logins the investor already made**, so their calls go through `connection_request` and you are
handed no key; SEC EDGAR and 금융감독원 are documents with keys of their own, so their calls go
through `source_request`. A vendor whose login this fund does not hold has no tool at all — that is
a different thing from a call that failed.

| provider | tool | catalogue endpoints used here | time meaning |
|---|---|---|---|
| Toss broker connector | — | portfolio, cash, fills, order/approval path | Kernel-owned; never call through either tool |
| 토스 login | `connection_request` | `/api/v1/candles`, `/prices`, `/orderbook`, `/trades`, `/stocks`, warnings, flows, FX, calendars, rankings, indicators | the host bounds `before`/`until`/`dateTime` at `asOf` for you; a window may come back shorter than asked and never longer |
| `sec-edgar` | `source_request` | ticker mapping and `/api/xbrl/companyfacts/{symbol}` | each fact unit is available at its `filed` date, not fiscal period end |
| Alpaca login | `connection_request` | bars, news, corporate actions | `end` is filled at `asOf` if you leave it out; snapshots are always current and never canonical replay evidence |
| `openbb-fmp` | `/api/v1/equity/price/historical` only | optional long history; set `end_date`, record provider and adjustment |
| `open-dart` | `/api/corpCode.xml`, `/api/company.json`, `/api/list.json`, `/api/fnlttSinglAcntAll.json`, `/api/fnlttSinglAcnt.json` | the **receipt** is the moment: `rcept_no` begins with the receipt date and `rcept_dt` repeats it; a business year is not a disclosure date |
| CLI web | IR, consensus, policy, macro, industry/theme context | supplementary and non-canonical; retain URL/access time and disclose replay gap |

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
relayed as sent — read `corp_code` and `stock_code` off `list.json` rows instead of trying to parse
it. Errors arrive with HTTP 200 and a `status` field, so `020` (quota exceeded) must be read as *we
were not allowed to look* rather than as an empty result. And XBRL statements follow the periodic
report, so a quarter that has only been announced preliminarily has no statement — a real gap, never
filled in with the preliminary figures.

Never mix adjusted and unadjusted bars. Request the basis explicitly, verify discontinuities against
corporate actions, and block price-derived returns or targets when the basis cannot be reconciled.

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
