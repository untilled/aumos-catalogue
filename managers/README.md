# ManagerPackages

<sub><a href="README.ko.md">한국어</a></sub>

Each directory contains one ManagerPackage. The package format and submission rules are
documented in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Choosing between the Atlas Trend packages

Three packages share one philosophy — hold an asset only while its own price has been rising,
size it by how much it moves, and go to cash when nothing is trending. They are **separate
packages with separate versions and separate track records**, because a rule that works on US
ETFs has not thereby been shown to work anywhere else.

They are not three ports of one methodology. Each market was measured, and each package carries
only the structure its market supports.

| | [US](atlas-trend-us) | [KR](atlas-trend-kr) | [Crypto](atlas-trend-crypto) |
|---|---|---|---|
| **What it buys** | 6 roles of US-listed ETF | 5 roles of Korea-listed ETF | BTC spot, optionally ETH |
| **Denominated in** | dollars | **won** | dollars |
| **Account you need** | a US brokerage | a Korean brokerage | none — read-only data |
| **Credentials** | Alpaca key | Toss + 공공데이터포털 keys | **none** |
| **Price history from** | 2016 | 2020 | 2016 |
| **Target volatility** | 10% | 10% | **25%** |
| **No-trade band** | 3% | 3% | **5%** |
| **Cash leg** | `BIL`, a T-bill ETF | a CD-rate ETF | **`cash-weight`** — not an asset |
| **Inverse-vol weighting** | yes | yes | **no** |
| **Correlation scaling** | yes | yes | **no** |

### Why Crypto has less machinery, not worse machinery

Measured over 750 sessions, the ten largest crypto assets run at an average pairwise correlation
of **+0.74** and an effective breadth of **1.68 independent bets**. The same measurement on the US
package's six roles gives **+0.29** and **3.30**. Inverse-volatility weighting cut basket
volatility by 44.7% in the US universe and by 17.3% in crypto.

So the Crypto package holds one asset and sizes it, and does not carry weighting or correlation
machinery that would describe a diversification this market does not have. The measurement is in
[issue #42](https://github.com/untilled/aumos-catalogue/issues/42) with its data sources and
method, so it can be re-run and disagreed with.

### Why KR has five roles and not eight

The products exist; the money does not. Fifteen developed-ex-US ETFs listed in Korea trade about
**31억 원 a day between them** — roughly a thousandth of the US-equity role. Emerging markets are
cut into China, India and Vietnam themes rather than broad exposure, and the safe-asset demand
that would have gone to government bonds went to CD-rate and MMF funds instead.

Developed ex-US, emerging markets and government bonds are therefore **held by the US package
instead**. That is a division of labour, not a gap.

## Running more than one

**US and KR overlap, and the overlap is not small.** `atlas-trend-kr`'s US-equity role holds a
Korea-listed S&P 500 fund; `atlas-trend-us` holds US equity directly. Run both against one
portfolio and that exposure arrives twice, at a size neither package chose — each sizes its own
basket and neither can see the other's.

Two ways to live with that, and the catalogue does not choose for you:

- **Separate funds.** Give each package its own portfolio. Each then sizes what it actually
  controls, and you decide the split between them by how much capital each fund holds. This is the
  shape the packages were designed for.
- **One fund, knowingly.** If both run on one book, treat the doubled exposure as your decision
  rather than theirs, and size the capital accordingly.

Crypto overlaps with neither.

## What they are all bad at

The three share three failure modes, and the differences are of degree.

- **Sideways markets.** The signal carries no information and the crossings still happen. The
  hysteresis and the no-trade band reduce this; nothing removes it. **Crypto pays the most here**,
  because its volatility is three to five times an equity index's.
- **Sharp reversals.** A monthly review learns about a crash a month after it starts.
  **Crypto again pays the most** — it falls further in a month than the others fall in a year.
- **Being uncomfortable exactly when working.** The month a package moves everything to cash is
  the month it looks foolish if the market rebounds.

And one that is not shared:

- **KR carries a currency bet.** Three of its four risk roles are Korea-listed funds of foreign
  assets, so the book earns the dollar as well as the asset. A won rally costs it without any
  trend turning.
- **Crypto rests on a thin record.** Bitcoin has roughly four cycles of history, which cannot
  distinguish *"trend-following works here"* from *"this asset went up a great deal with very deep
  drawdowns."* Time-series momentum has decades of cross-asset evidence; this application does
  not.
