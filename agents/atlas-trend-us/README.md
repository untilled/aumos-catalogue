# Atlas Trend US

<sub><a href="README.ko.md">한국어</a></sub>

A trend-following allocation across nine US-listed ETFs. It holds an asset only while that
asset's own price has been rising, sizes what it holds by how much each one moves rather
than by how much it likes them, and puts everything it is not holding into Treasury bills.
It is built to review once a month and, most months, it changes nothing.

This is the first of the Atlas Trend series. Its siblings run the same philosophy in other
markets; they are separate packages with separate track records, because a rule that works
on US ETFs has not thereby been shown to work anywhere else.

## What it actually does

Each time it runs it computes, for each ETF, four total returns — over the last 1, 3, 6 and 12
calendar months. Each one votes: positive or not. An asset held in the book stays while at
least half the votes are positive; an asset the book does not hold gets in only on three of
four **and** a price above its 200-session average. That gap between the two thresholds is
deliberate and it is where most of this methodology's value is: it is what a sideways market
has to cross twice before it can bill you twice.

The assets that survive are weighted by the inverse of their realised volatility, capped so
no single one dominates, and then the whole sleeve is scaled down if its estimated
volatility — computed with the correlations, so that equities in three regions are counted
as the one trade they are — exceeds the target. It never scales up. Whatever is left is cash.

If nothing qualifies, the answer is 100% Treasury bills. That is a state this system is
designed to reach, not a failure to decide.

## The universe, and why these nine

The requirement is one instrument per economic exposure, each large enough that a monthly
rebalance is not a market event, and each with enough listed history that a twelve-month
signal is a signal rather than an extrapolation.

| role | primary | alternates | why this one |
|---|---|---|---|
| US equity | `VTI` | `ITOT`, `SPY` | Total market rather than large-cap only: the trend being measured should be the equity market's, not the index committee's. |
| Developed ex-US equity | `VEA` | `IEFA`, `EFA` | Separated from US equity because the two decouple for years at a time, and a single global fund would net that away. |
| Emerging market equity | `VWO` | `IEMG`, `EEM` | The highest-volatility equity leg, which the inverse-volatility weighting will hold least of — correctly. |
| Intermediate/long Treasuries | `IEF` | `TLT`, `GOVT` | Duration as its own trend, not as ballast. `IEF` over `TLT` as the default because 2022 established that long duration is a risk asset with a bond's reputation. |
| Gold | `GLD` | `IAU`, `GLDM` | The one holding whose behaviour is uncorrelated with both other legs often enough to matter. |
| Broad commodities | `DBC` | `PDBC`, `GSG` | The inflation leg. `DBC` for its length of history; `PDBC` if the investor wants to avoid a K-1. |
| Listed real estate *(optional)* | `VNQ` | `SCHH` | Off by default: it is largely an equity exposure with rate sensitivity attached, so it adds a name faster than it adds diversification. |
| Cash | `BIL` | `SGOV`, `SHV` | Where everything not held sits. |

**The alternates are not preferences.** They are used in exactly one situation — the primary
is not tradable at the instant being judged, because the corporate action record or the
absence of recent bars says so — and the substitution is reported in the decision.

Two overlaps survive this list and are disclosed rather than engineered away: `DBC` carries
a gold weighting of its own, and `VNQ` is already inside `VTI` at its market weight before
any separate holding of it.

## How it fails

Every methodology has a shape of market it is wrong in. This one has two, and they are
opposites.

- **Sideways markets.** The signal carries no information and the crossings still happen. The
  system pays the spread on each one and ends the year having traded a great deal in order to
  arrive where it started. The hysteresis and the no-trade band reduce this; nothing removes
  it.
- **Sharp reversals.** A monthly review learns about a crash a month after it starts. The
  system will sell after the fall and buy back after the recovery has begun. This is the
  premium a trend follower pays for the years in which the same lateness keeps it out of a
  long decline.

It also has a quieter one worth naming: **it is at its most uncomfortable exactly when it is
working.** The month it moves everything to Treasury bills is a month it will look foolish if
the market rebounds, and the discipline of the rule is the only thing standing between the
methodology and a discretionary override that would make its record meaningless.

## What it reads, and what it cannot

| | |
|---|---|
| **Reads** | daily total-return bars and the corporate action record for its nine tickers; the book; the book's own note on whether it is in the all-cash state |
| **Does not read** | filings, news, analyst estimates, fund flows, macro data |

The blindness is the design. The claim being tested is that an asset's own price path carries
its trend; a package that reached for a headline when the signal was uncomfortable would be a
different methodology wearing this one's track record.

Two limits of the data are real and are stated rather than papered over. **Premium and
discount to NAV are not available** from the source this package reads — which is why the
universe is restricted to funds where that gap is measured in basis points. And the vendor's
dividend adjustment is a claim, so the package checks it against the corporate action record
and reports the discrepancy rather than repairing it: a return computed across an unexplained
gap is worse than an admitted one.

## About "once a month"

**The monthly cadence is what this package asks for, not something it can guarantee**, and the
distinction is worth stating plainly because the methodology's behaviour depends on it.

Every decision it submits — including the ones that conclude there is nothing to do — arms a
plan for the next month-end, so the package schedules its own next review rather than waiting to
be woken. It picks a month-end rather than a rolling thirty days, for the same reason it measures
its horizons in calendar months: a rolling interval drifts against month-end, and the drift is
invisible.

Two things still sit above it. Your Mandate's minimum review interval wins: if it is longer than
a month, the arming is refused, the agent says so, and the review happens on your schedule rather
than its own. And the interval stored for the installed agent is whatever you confirm on the
install screen — the package can pre-fill a suggestion, it cannot set it.

If you want this run monthly, check that interval when you install it.

## What it needs

An `alpaca` data source credential (free with any Alpaca account) at version 0.3.0 or later —
earlier versions do not carry the corporate actions endpoint this package uses to check its
own adjustment. Set `feed` to `delayed_sip` unless you hold a market data subscription, in
which case `sip`. `iex` is available and is not recommended: it is one exchange's prints, and
its daily close is not the closing price of anything.

It proposes and never trades. Every rebalance it computes is a proposal your Aumos judges
against your Mandate and you approve or refuse.
