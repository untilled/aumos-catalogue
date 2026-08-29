# coinbase-exchange

<sub><a href="README.ko.md">한국어</a></sub>

Coinbase Exchange's public market data. **There is no key to enter** — these paths are open,
and nothing declared here can reach an account.

## What you get

| | |
|---|---|
| **Reaches** | `api.exchange.coinbase.com` |
| **Cost** | free, and no registration |
| **Credential** | **none** |
| **History** | `BTC-USD` from **2016-01**, `ETH-USD` from **2017-01** |

```
/time
/currencies
/products
/products/{symbol}                 e.g. BTC-USD
/products/{symbol}/candles         ?granularity,start,end
/products/{symbol}/ticker
/products/{symbol}/stats
/products/{symbol}/book            ?level
/products/{symbol}/trades          ?limit
```

Every path and parameter above was called against the live API before it was written down.

## Why this vendor, and why the pair is quoted in dollars

Most crypto price history is quoted in **USDT**, a stablecoin. A series priced that way carries
the stablecoin's own risk inside it: if the peg moves, so does every return computed from it, and
nothing in the number says so.

`BTC-USD` here is quoted in **actual dollars**, and it is this exchange's main book rather than a
thin secondary listing. That is the whole reason to prefer it over the deeper USDT venues — a
trend measured on it is a trend in the asset, not in the asset plus a peg.

## Four things about a candle

**⚠️ The columns are not OHLC.** A row is

```
[ time, low, high, open, close, volume ]
```

Low and high come **before** open and close. Reading it as OHLC silently swaps the open with the
low and the close with the high, and the result still looks like a price series.

**⚠️ Rows arrive newest first.** Sort before you difference them.

**At most 300 candles answer one call.** A window longer than that returns
`granularity too small for the requested time range` rather than a truncated answer — which is the
better failure, but it does mean a year of daily bars is two calls. Overlap them and check the
overlap agrees before joining.

**Buckets start at 00:00 UTC.** A 24-hour market has no close, so *which bucket is finished* is a
convention rather than a fact. This document does not choose one; the agent reading it must state
the convention it used.

## What has no date on it

`ticker`, `stats`, `book` and `trades` answer **now**. There is no parameter that moves them, so
for an agent judging at a past instant they are not stale numbers — they are facts from the
future. Use `candles` for anything dated.

`/products/{symbol}` is the one to ask whether an instrument is still itself: it carries `status`,
`trading_disabled` and `fx_stablecoin`, which is how a halted or delisted pair is told from a quiet
one.

## What this does not cover

- **One venue.** Coinbase's own book, not a cross-exchange aggregate. Another exchange's print for
  the same minute will differ, and this document has no opinion about which is right.
- **Spot only.** No perpetuals, no funding, no derivatives.
- **No account reach.** Balances, orders and fills live on a different host and are not declared
  here; nothing in this document can be pointed at one.

## What you supply

Nothing. Aumos signs no credential for this source because there is none to sign, and it refuses
any path outside the list above.
