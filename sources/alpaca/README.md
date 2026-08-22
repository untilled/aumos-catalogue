# alpaca

Alpaca's Market Data API. You type your key once; agents call it.

One id, one credential, **two halves** — and the halves are ours to know rather
than yours to type. Until #232 this vendor was two sources (`alpaca-market` for
prices, `alpaca-news` for headlines) with the same host and the *same key pair*,
so Aumos asked for your Alpaca key twice and filed it under two names.

## What you get

| | |
|---|---|
| **Reaches** | `data.alpaca.markets` |
| **Cost** | free with any Alpaca account, paper or live |

### The endpoints — Alpaca's own answers, unread

```
/v2/stocks/bars         ?symbols,timeframe,start,end,limit,feed,adjustment,sort,page_token,asof
/v2/stocks/snapshots    ?symbols,feed
/v1/corporate-actions   ?symbols,types,start,end,limit,sort,page_token,region,data_quality
/v1beta1/news           ?symbols,start,end,limit,sort,include_content,page_token
```

Aumos signs the request, refuses any path outside this list, and hands back
exactly what Alpaca sent. **What shape the answer should be in is your agent's
business.** Nothing here is dated by us and nothing is cut off at the instant
being judged — an agent reading these is responsible for its own point-in-time
discipline, and is free to ask for adjusted bars, or a hundred symbols at once,
or article bodies, none of which the mapped half below will do.

### Three things worth knowing before you ask for bars

None of these is Aumos's behaviour — they are Alpaca's, and they are here because each
one has a wrong answer that looks like a right one.

- **`feed` has a default and it is the wrong one for a free account.** The default is
  `sip`, the consolidated tape, and that is a paid subscription. Asking without naming a
  feed fails; asking for `iex` succeeds and quietly gives you one exchange's prints,
  which is not the closing price of anything. What a free account wants for history is
  **`delayed_sip`** — the same consolidated tape, fifteen minutes behind, which is no
  delay at all for a daily bar that closed hours ago.
- **`adjustment` is applied from the request's own `start`.** A series is back-adjusted
  from the window you asked for, so two windows over the same symbol are two different
  series. Ask once for the longest history you need and derive the short horizons from
  it; asking separately for one month and twelve months gives you two numbers that were
  never comparable. Note also that the adjustment moves the price and not the volume.
- **`limit` counts rows, not symbols**, and the rows come sorted by symbol before
  timestamp — so a wide basket hits the cap mid-symbol and the rest is behind
  `page_token`. `1Month` bars are the cheap way to ask a momentum question; the bar for
  the month you are standing in is a partial one, and it is the caller's job to drop it.

### Corporate actions, and why this endpoint is not the same kind of thing

`/v1/corporate-actions` takes `start` and `end`, which almost nothing else here does. That
makes it the one endpoint on this document an agent pinned to an instant can ask about the
past without lying: dividends, splits, spin-offs, name and symbol changes, redemptions and
worthless removals, each with the vendor's own dates. Two uses it has that bars do not:

- **Checking the adjustment rather than trusting it.** `adjustment=split,dividend` is a
  claim. The cash dividends over the same window are the evidence for or against it, and a
  twelve-month total return computed over an unapplied distribution is wrong by the yield.
- **Noticing that an ETF stopped being itself.** A fund closes, a ticker is reassigned, a
  share class is redeemed — and a price series carries on looking like a price series. The
  `asof` parameter on bars is the other half of this: it resolves a symbol as it stood on a
  date, so a history does not break at the point a name changed.

⚠️ **`/v2/stocks/snapshots` has no date and never will.** It answers *now* — the latest
trade, the latest quote, today's bar. For an agent judging at an `asOf` in the past, that
is not a stale answer, it is a fact from the future. Use it when the instant you are
judging is the current session, and use bars when it is not.

### There is no mapped half any more

⚠️ This section described a **`market` port** and a built-in **`news` port** that
read this same credential and served dated, `asOf`-bounded rows — *frozen, and
still true*. #232 removed the port layer, so neither exists: nothing here maps,
nothing is dated by Aumos and nothing is cut off at the instant being judged.
The endpoints above are the whole of what this document offers.

## Two market sources at once

An agent calling **endpoints** may use this and `openbb-fmp` together — it names
the source, so there is nothing to decide between them.

An agent asking for the **`market` port** may not, if both declare the same
venues: `market_history` takes an asset and not a source, so two vendors claiming
`XNAS` leave nothing to say which one answered, and Evidence records exactly one.
That refusal is the frozen half's, and it is why the endpoints exist.

## What you supply

Your Alpaca key id and secret, once. There is no author default and there must
not be — an API key is nobody's to give away. Enter them in SETTINGS → Data
sources; Aumos keeps them in the system keychain and no agent ever sees them.

Until you do, this source refuses its own calls by name. It does not stop the
rest of your tools working.
