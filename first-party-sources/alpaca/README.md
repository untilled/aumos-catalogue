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
/v2/stocks/bars       ?symbols,timeframe,start,end,limit,feed,adjustment,sort,page_token
/v2/stocks/snapshots  ?symbols,feed
/v1beta1/news         ?symbols,start,end,limit,sort,include_content,page_token
```

Aumos signs the request, refuses any path outside this list, and hands back
exactly what Alpaca sent. **What shape the answer should be in is your agent's
business.** Nothing here is dated by us and nothing is cut off at the instant
being judged — an agent reading these is responsible for its own point-in-time
discipline, and is free to ask for adjusted bars, or a hundred symbols at once,
or article bodies, none of which the mapped half below will do.

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
