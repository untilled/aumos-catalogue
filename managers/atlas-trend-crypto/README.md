# Atlas Trend Crypto

<sub><a href="README.ko.md">한국어</a></sub>

A trend-following exposure to crypto spot, in dollars. It holds Bitcoin only while Bitcoin's own
price has been rising, sizes the position by how much it is moving, and holds cash the rest of the
time. It reviews once a month and, most months, changes nothing.

The third of the Atlas Trend series, and **the one that deliberately does less than its siblings.**
Why is the first thing worth reading.

## Why this one has no basket

Atlas Trend US and KR run five to nine roles and spend most of their effort deciding how much of
each to hold. That effort pays because those roles are genuinely different things. This one was
measured before it was written:

| over 750 sessions | crypto, 10 largest | Atlas Trend US, 6 roles |
|---|---:|---:|
| average pairwise correlation | **+0.74** | +0.29 |
| first principal component | **76.6%** | 47.1% |
| **effective number of bets** | **1.68** | 3.30 |
| volatility cut by diversifying | 17.3% | 44.7% |

Ten coins are **1.68 independent bets**. And when it matters most they move together harder, not
less: on Bitcoin's worst 10% of days the other nine average **−5.84%** against Bitcoin's own −4.09%,
where the US basket's other five average −0.61% against VTI's −1.74%.

So a ten-coin basket weighted by inverse volatility is one position wearing ten names, and the
machinery that produced those weights would be telling the investor they are diversified when they
are not. **This package holds one asset — optionally two — and cash, and says so.**

## What it actually does

Each month it computes four returns on `BTC-USD` — over the last 1, 3, 6 and 12 calendar months —
and each one votes. An asset already held stays while at least half the votes are positive; an
asset not held gets in only on three of four **and** a price above its 200-day average. That gap
between the thresholds matters more here than anywhere: this asset's volatility is three to five
times an equity index's, so every whipsaw crossing is a larger bill.

The exposure is then `targetVolatility / realised volatility`, capped at fully invested. It never
levers. Whatever is not held is **cash**.

## Cash here is cash, not a stablecoin

The equity siblings park in a T-bill or CD fund because such a thing exists in those markets. In
crypto it does not. A stablecoin is a credit position with a price of one until it is not, and this
package will not call that cash.

The unheld fraction is declared as a `cash-weight` — a statement that the money is **not invested**.
That is a different shape from the siblings, and it is the honest one here.

## Dollars, not USDT

Most crypto price history is quoted in USDT. A return computed on that carries the peg's own risk
inside it and says nothing about it. This package reads `BTC-USD` from Coinbase Exchange, quoted in
actual dollars and that exchange's main book — Binance's own `BTCUSD` pair exists but trades about
0.3% of its USDT pair's volume, which is why the deeper venue is not the better reference here.

## How it fails

- **Sideways markets.** The signal carries no information and the crossings still happen. The
  hysteresis and the wider no-trade band reduce this; nothing removes it, and the bills are larger
  here than in either sibling.
- **Sharp reversals.** A monthly review learns about a crash a month after it starts — and this
  asset falls further in a month than the siblings' holdings fall in a year.
- **Selling the low.** The same mechanic that cuts exposure into rising volatility, which is what
  avoids the long decline, also cuts it at the bottom.

And the one that is not about markets: **the record this rests on is thin.** Bitcoin has roughly
four cycles of history. That sample cannot distinguish *"trend-following works here"* from *"this
asset went up a great deal with very deep drawdowns."* Time-series momentum has decades of
cross-asset evidence behind it; this particular application does not, and treating the two as the
same evidence would be the mistake this paragraph exists to prevent.

## A 24-hour market has no close

The siblings can write *"the bars are the calendar"* because their markets shut. This one never
does, so **which candle counts as finished is a convention, not a fact.**

The convention is stated and the manager restates it in every decision: `t0` is the last candle
whose 24-hour bucket both starts and ends at or before the instant being judged. Coinbase buckets
begin at 00:00 UTC. A reader assuming a different convention would recompute different numbers from
the same data and have no way to know it.

## What it reads

`coinbase-exchange` — daily dollar candles and the product record that says whether the pair is
still trading. No key is needed; those paths are public. It reads no filings, no news and no
on-chain data.

Two limits of that source shape the package. Candles arrive **newest first** and their columns are
`[time, low, high, open, close, volume]` — not OHLC. And at most **300 candles** answer one call, so
a 420-day window is two calls that the manager overlaps and verifies before joining.

## What it needs

A `coinbase-exchange` data source at 0.1.0 or later. There is no credential to enter.

It proposes and never trades. Every change it computes is a proposal your Aumos judges against your
Mandate and you approve or refuse.
