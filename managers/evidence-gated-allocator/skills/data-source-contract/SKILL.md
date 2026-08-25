---
name: data-source-contract
description: Route Toss, SEC EDGAR, Alpaca, optional OpenBB/FMP and web research while enforcing point-in-time, freshness and graceful-degradation rules.
---

# Data-source contract

Read `source_request`'s `Allowed:` list before the first request. Never guess a path, and never
discover a required source only after doing work that assumes it exists. Pass the invocation's exact
`asOf` on every call even when a vendor endpoint also needs its own end date.

## Responsibility and endpoints

| provider | catalogue endpoints used here | time meaning |
|---|---|---|
| Toss broker connector | portfolio, cash, fills, order/approval path | Kernel-owned; never call through `source_request` |
| `toss` source | `/api/v1/candles`, `/prices`, `/orderbook`, `/trades`, `/stocks`, warnings, flows, FX, calendars, rankings, indicators | live vendor payload; bound queries with `before`/`until`/`dateTime`, then discard later rows |
| `sec-edgar` | ticker mapping and `/api/xbrl/companyfacts/{symbol}` | each fact unit is available at its `filed` date, not fiscal period end |
| `alpaca` | bars, news, corporate actions | set `end` at `asOf`; snapshots are always current and never canonical replay evidence |
| `openbb-fmp` | `/api/v1/equity/price/historical` only | optional long history; set `end_date`, record provider and adjustment |
| OpenDART | not yet in this catalogue | required for point-in-time Korean single-name fundamentals |
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

Never mix adjusted and unadjusted bars. Request the basis explicitly, verify discontinuities against
corporate actions, and block price-derived returns or targets when the basis cannot be reconciled.

## Required and optional installation policy

The core install requires the `source_request` gateway. The usable lane depends on sources present:

- `toss`: required for new price signals and target calculations; without it, review existing
  Evidence/Thesis only.
- `sec-edgar`: required for new US fundamental BUY or thesis promotion.
- `alpaca`: required when current news or a corporate action is material to the judgement. Without
  it, SEC/Toss review may continue but that new judgement is blocked.
- OpenDART: required for new Korean single-name fundamental BUY or promotion. Until the source is
  published, those outcomes are unable-to-judge WAIT.
- `openbb-fmp`: optional and used only when configured work needs history Toss/Alpaca cannot supply.
- CLI web: optional for core/exit/weight management; unavailable web blocks theme radar, variant-view
  or consensus-difference claims and must never fail silently.

| missing | may continue | must block |
|---|---|---|
| Toss market source | existing Evidence and Thesis review | new price signal or target calculation |
| SEC EDGAR | Korean ETF and price/weight lanes | new US fundamental BUY/promotion |
| Alpaca news/actions | SEC fundamentals and Toss prices | a judgement that requires news/action confirmation |
| OpenDART | Korean ETF and existing-position price/weight management with stated uncertainty | new Korean single-name fundamental BUY/promotion |
| CLI web | core, exit and weight management | theme radar, variant view, consensus-difference and policy/macro claims |

Conflicting sources do not get averaged. Name the conflict, prefer the source whose field is primary
and point-in-time for that claim, or leave the gate unresolved.

A vendor price and a web figure for the same asset are exactly that kind of conflict. Call
`crossCheckPrice`: within tolerance the reading stands, and beyond it Toss is selected, the web number
is not averaged in, and the difference is retained as provenance in reasoning and Evidence. The
configured tolerance is 5% by default, the Trading Harness threshold this rule is ported from.

## Web observations are typed, dated and non-canonical

Web research is where an undated number does the most damage, because a page serves the same figure
today that it served last quarter and neither the model nor a replay can tell. Two contracts apply,
and both are enforced by the deterministic core rather than by prose.

### Consensus, guidance and actual

Every quoted figure is normalized before it is used, through `validateConsensus`:

| field | rule |
|---|---|
| `metric` | the named line item, not a paraphrase |
| `value` with `unit` | `unit` names the dimension; anything not a percent, ratio, count, multiple, index level, day or share count is money and also needs `currency` |
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
