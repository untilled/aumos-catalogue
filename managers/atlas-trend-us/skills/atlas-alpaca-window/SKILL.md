---
name: atlas-alpaca-window
description: "The two connection_request calls Atlas Trend makes in Stage 1, and the four Alpaca behaviours that each have a wrong answer looking like a right one — which feed to name, what the adjustment is measured from, what limit counts, and why snapshots cannot be asked at a past asOf. Read this before requesting the daily bar window."
---

# The window, and the four ways this vendor is not what it looks like

This document carries **the shape of the calls and the behaviour of the vendor**. What to do
with the answer is in `PROMPT.md`, and `PROMPT.md` governs wherever the two meet.

**The tool is `connection_request`, and the vendor is a login the investor already made.**
Its description carries an **`Allowed:` list** of every `connector path ?parameters` this run may
ask for. Read it and work from it — a guessed path is refused, and a refusal looks like the vendor
being down.

⚠️ **You are handed no credential and you choose no vendor.** The host signs the call with the
Alpaca login this fund is already connected to; there is nothing to configure and no key to ask the
investor for. If the fund holds no Alpaca login the tool is simply absent, which is a different
thing from a call that failed — say which one happened.

⚠️ **The upper bound is filled in for you.** Leave `end` out and the host writes this run's `asOf`
into it; pass one that is later and it is trimmed. So a window you asked for may come back shorter
than you asked, and it is never longer. ⛔ Do not try to reach past `asOf` by naming a different
parameter — `asof` is the symbol table's date and is not a bound on the bars.

## 1. One window

```
/v2/stocks/bars ?symbols=VTI,VEA,VWO,IEF,GLD,DBC,BIL
                &timeframe=1Day
                &start=<asOf minus config.historyDays>
                &end=<asOf>
                &adjustment=split,dividend
                &feed=<config.feed>
                &limit=10000
```

Every universe member in one request. This is not an efficiency; it is a correctness rule, and
it is the one a manager is most likely to break by being helpful.

## 2. The corporate actions, over the same window

```
/v1/corporate-actions ?symbols=<the same list>
                      &types=cash_dividend,forward_split,reverse_split,name_change,redemption,worthless_removal
                      &start=<the same start> &end=<asOf>
                      &limit=1000
```

This endpoint takes a date range. That is what makes it the one endpoint here you may ask
about the past while pinned to `asOf`.

## The four

**`adjustment=split,dividend` is not optional.** Without the dividend leg you are ranking a
4%-yielding bond fund against a 1%-yielding equity fund on price alone, and over twelve months
that reverses orderings. Total return is the premise of the whole ensemble.

**The adjustment is applied from the request's own `start`.** Two windows over the same symbol
are two different series. That is why there is one request, and why the one-month and
twelve-month numbers must both come out of **the same response** — asking separately for a
short window produces two numbers that were never comparable. Note also that the adjustment
moves the price and not the volume.

**Name the `feed`.** The vendor's default is the paid consolidated tape and will simply fail on
a free account; `config.feed` exists so that failure is a setting rather than a mystery. `iex`
succeeds and quietly returns one exchange's prints, which is not the closing price of anything.

**`limit` counts rows across all symbols, not per symbol.** If the response carries a
`next_page_token`, follow it until it does not. A basket silently truncated mid-symbol gives one
ETF a twelve-month return computed over four months, and nothing about that number looks wrong.

## Do not call `/v2/stocks/snapshots`

Not unless `asOf` is the current session. It takes no date and answers *now*. At a past `asOf`
that is not a stale number — it is a fact from the future, and you would be putting one into a
twelve-month ranking.
