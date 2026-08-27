# Atlas Trend KR

<sub><a href="README.ko.md">한국어</a></sub>

A trend-following allocation across five roles of Korea-listed ETF, run in won. It holds an asset
only while that asset's own price has been rising, sizes what it holds by how much each one moves
rather than by how much it likes them, and parks everything it is not holding in a CD-rate fund. It
is built to review once a month and, most months, it changes nothing.

This is the Korean sibling of Atlas Trend US. Same philosophy, separate package, separate version,
separate track record — a rule that works on US ETFs has not thereby been shown to work here, and
the two markets turned out to differ more than expected.

## What it actually does

Each time it runs it computes, for each role, four total returns — over the last 1, 3, 6 and 12
calendar months, in won. Each one votes: positive or not. A role the book already holds stays while
at least half the votes are positive; a role the book does not hold gets in only on three of four
**and** a price above its 200-session average. That gap between the two thresholds is where most of
this methodology's value is: it is what a sideways market has to cross twice before it can bill you
twice.

What survives is weighted by the inverse of its realised volatility, capped so no single role
dominates, and then the whole sleeve is scaled down if its estimated volatility — computed with the
correlations, so that Korean equity and US equity are counted as the one-and-a-bit trades they are —
exceeds the target. It never scales up. Whatever is left is the cash proxy.

If nothing qualifies, the answer is 100% CD-rate fund. That is a state this system is designed to
reach, not a failure to decide.

## The universe, and why it is five roles and not eight

| role | primary | alternates |
|---|---|---|
| Korean equity | `278530` KODEX 200TR | `294400` · `295040` |
| US equity | `360750` TIGER 미국S&P500 | `379800` · `360200` · `449180` (H) |
| US long Treasuries | `453850` ACE 미국30년국채액티브(H) | `476760` · `484790` (H) |
| Gold | `411060` ACE KRX금현물 | `0072R0` · `132030` (H) |
| Cash | `459580` KODEX CD금리액티브(합성) | `488770` · `475630` · `357870` |

Selected from all **1,164** Korea-listed ETFs on one date by measured liquidity and quality: net
assets at least 100 billion won, sixty-session average turnover at least 1 billion won a day, and —
compared **within each role**, never against an absolute number — premium to NAV and tracking against
the underlying index. Leveraged, inverse, covered-call, buffered, blended and thematic products are
excluded by construction.

### Three exposures are missing, and it is the market's doing

The US sibling holds developed-ex-US, emerging markets and government bonds. This one cannot. The
products exist; the money does not.

| role | listed | net assets | turnover a day |
|---|---:|---:|---:|
| Korean equity | 76 | 70.5조 | 39,955억 |
| US equity | 49 | 69.7조 | 36,087억 |
| Cash | 20 | 38.7조 | 6,357억 |
| Emerging markets | 47 | 3.5조 | **233억** |
| Korean government bonds | 21 | 3.6조 | **68억** |
| Developed ex-US | 15 | 1.2조 | **31억** |

Fifteen developed-ex-US funds trade **31억 a day between them** — about a thousandth of the US equity
role. Korean investors' overseas allocation is, in practice, America; the safe-asset demand that
would have gone to government bonds went to CD-rate and MMF funds instead, which are ten times
larger; and the 47 emerging-market funds are cut into China, India and Vietnam themes rather than
broad exposure. Across the whole market, 346 of the 1,164 funds are sector or thematic.

**This is a division of labour, not a hole.** Those three exposures are held by Atlas Trend US
directly. An investor running both packages is missing nothing; an investor running only this one is
inside the honest boundary of what Korea-listed ETFs can buy.

## Hedged and unhedged are two assets

A Korea-listed fund holding US assets carries the exchange rate inside its own price. `449180 KODEX
미국S&P500(H)` and `360750 TIGER 미국S&P500` hold the same US equities and earn different won
returns.

So they are **scored separately, as two assets, and never held together** — holding both is a partial
currency hedge nobody chose. They compete for one role, the higher score wins, and a tie goes to the
unhedged class, which pays no hedging cost.

**Hedging cost is not estimated separately.** It is the won-dollar rate differential, and it is
already inside the hedged fund's own price. A total-return trend measured on that price has the cost
in it.

⚠️ In practice the hedged classes are much less traded — 93 hedged funds exist and 18 clear the
liquidity bar. For US equity the hedged class trades at about 1/123 of the unhedged one, so it rarely
wins on merit alone. For US long Treasuries the opposite holds: the hedged class is the more liquid
of the two.

## How it fails

- **Sideways markets.** The signal carries no information and the crossings still happen. The
  hysteresis and the no-trade band reduce this; nothing removes it.
- **Sharp reversals.** A monthly review learns about a crash a month after it starts. It will sell
  after the fall and buy back after the recovery has begun.
- **The currency.** Three of the four risk roles are Korea-listed funds of foreign assets, so this is
  a won-dollar position as much as an asset position. A won rally costs the book without any trend
  turning.

And the quiet one: **it is at its most uncomfortable exactly when it is working.** The month it moves
everything to a CD-rate fund is the month it will look foolish if the market rebounds.

## What it reads, and what it cannot

Two vendors with two jobs. **토스증권** supplies the adjusted won price history the trend is measured
on. **금융위원회's 증권상품시세정보** supplies NAV, the underlying index, fund size and turnover —
whether a fund is worth holding at all. It reads no filings and no news; the claim being tested is
that an asset's own price path carries its trend.

Three limits are real and stated rather than papered over.

**No distribution data exists.** Not at either vendor and not in any Korean public API we could find.
Where a role holds a total-return share class the question does not arise — a TR class pays no
distribution, which is why Korean equity is `KODEX 200TR` and not `KODEX 200`. Where it does arise,
the package detects a distribution by watching the fund's NAV fall against its price index, and
**reports it rather than repairing it**: without the amount, a correction would be an estimate
dressed as a fact.

**That detector only works on Korean-index roles.** Measured over sixty sessions, a 코스피200 fund's
daily NAV-versus-index deviation has a standard deviation of 4.5bp and quarter-end distributions
stand out clearly; an S&P 500 fund's is 127bp, because the Korean close and the US close are hours
and a currency apart, and nothing stands out at all. For those roles the package says in its decision
that it could not run the check.

**The price pages have to be stitched.** 토스증권 returns at most 200 candles a call, so a
420-day window is three calls, and the vendor does not document what its adjustment is measured
from. The package overlaps the pages and verifies they agree before stitching; when they disagree it
says so and reports which horizons it could not compute.

## What it needs

Two data source credentials: `toss` and `fsc-securities-product` at 0.1.0 or later. The second is
free with an automatically approved key from Korea's public data portal; its licence puts no
restriction on use.

It proposes and never trades. Every rebalance it computes is a proposal your Aumos judges against
your Mandate and you approve or refuse.
