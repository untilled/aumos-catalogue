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
| CLI web | IR, consensus, policy, industry/theme context | supplementary and non-canonical; retain URL/access time and disclose replay gap |

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
| CLI web | core, exit and weight management | theme radar, variant view and consensus-difference claims |

Conflicting sources do not get averaged. Name the conflict, prefer the source whose field is primary
and point-in-time for that claim, or leave the gate unresolved.
