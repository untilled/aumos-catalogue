---
name: atlas-crypto-window
description: "The source_request calls Atlas Trend Crypto makes in Stage 1 — Coinbase Exchange candles and the product record — and the four ways this vendor's candles mislead a careless reader. Read this before requesting any window."
---

# The window, and four ways this vendor will mislead you

This document carries **the shape of the calls and the behaviour of the vendor**. What to do with
the answer is in `PROMPT.md`, and `PROMPT.md` governs wherever the two meet.

`source_request`'s description carries an **`Allowed:` list** of every `source path ?parameters` on
this machine. Read it and work from it — a guessed path is refused, and a refusal looks like the
vendor being down.

## The two calls

```
coinbase-exchange /products/{symbol}/candles ?granularity=86400
                                             &start=<ISO date>
                                             &end=<ISO date>

coinbase-exchange /products/{symbol}
```

`{symbol}` is `BTC-USD`, and `ETH-USD` when `config.includeEther` is on.

## 1. The columns are not OHLC

A row is:

```
[ time, low, high, open, close, volume ]
   0     1     2      3      4      5
```

**Low and high come before open and close.** Reading this as OHLC puts the low where the open
belongs and the high where the close belongs — and the result is still a monotone-looking price
series, so nothing downstream complains. The close is **index 4**.

## 2. Rows arrive newest first

Sort ascending by `time` before you difference anything. A twelve-month return computed on the
vendor's own ordering has its sign inverted.

## 3. Three hundred candles a call, and the failure is loud

A window longer than 300 buckets returns

```
{"message":"granularity too small for the requested time range. Count of aggregations requested exceeds 300"}
```

rather than a truncated array. That is the better failure — it cannot be mistaken for data — but it
does mean a 420-day window is **two calls**.

**Overlap the two windows by at least five days and compare the closes on the overlap.** They should
agree exactly; this vendor does not adjust anything, so a disagreement means you fetched across a
vendor-side correction and the join is not safe. Say so in `uncertainty` rather than joining
anyway.

## 4. `time` is a bucket start, and the bucket may still be open

Buckets begin at **00:00 UTC** and run twenty-four hours. The newest row is almost always the
**bucket in progress** — a partial day whose close is simply the last trade so far.

This market never closes, so there is no session to have ended. `PROMPT.md` states the convention
this package uses and you must restate it in your reasoning: **`t0` is the last candle whose bucket
both starts and ends at or before `asOf`.**

## The product record

`/products/{symbol}` carries `status`, `trading_disabled` and `quote_currency`. It is how a halted
or delisted pair is told from a quiet one, and how you confirm the pair is quoted in dollars rather
than in a stablecoin. It takes no date and describes the pair **now** — which is fine for "is this
tradable", and is not evidence about the past.

⚠️ **`ticker`, `stats`, `book` and `trades` are declared by the source and are not for you.** They
take no date and answer *now*. At a past `asOf` that is not a stale number — it is a fact from the
future.
