---
name: atlas-kr-windows
description: "The source_request calls Atlas Trend KR makes in Stage 1 — 토스증권 candles for the adjusted won signal and 금융위원회 getETFPriceInfo for NAV, index, size and turnover — and the traps each vendor has. Read this before requesting any window."
---

# Two windows, two vendors, and what each one gets wrong

This document carries **the shape of the calls and the behaviour of the vendors**. What to do with
the answers is in `PROMPT.md`, and `PROMPT.md` governs wherever the two meet.

`source_request`'s description carries an **`Allowed:` list** of every `source path ?parameters` on
this machine. Read it and work from it — a guessed path is refused, and a refusal looks like the
vendor being down.

## 1. The signal — 토스증권

```
toss /api/v1/candles ?symbol=<6-digit code>
                     &interval=1d
                     &count=200
                     &adjusted=true
                     &before=<ISO 8601, optional>
```

- **`count` is capped at 200.** A 420-day window is three calls. The response carries `nextBefore`;
  pass it back as `before` for the next page. A `+` in a timezone offset must be `%2B` in the query
  string.
- **`interval` is `1d` or `1m` only.** `1m` is one *minute*, not one month. There is no monthly
  candle — every horizon in Stage 2 is derived from daily bars.
- ⚠️ **The vendor does not document what `adjusted=true` is measured from.** The US sibling could
  rely on Alpaca's documented "adjusted from the request's start"; here that guarantee does not
  exist. **Overlap consecutive pages by at least five sessions and compare the closes on the
  overlap.** Agreement means the pages share a basis and may be stitched. Disagreement means they do
  not, and a stitched series would be a number nobody can reproduce.
- `toss /api/v1/market-calendar/KR ?date` exists if you need to confirm a closure. Prefer the
  presence of a bar.

## 2. The instrument — 금융위원회 증권상품시세정보

```
fsc-securities-product /1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo
    ?isinCd=<ISIN>            (or likeSrtnCd=<6-digit code>)
    &beginBasDt=YYYYMMDD &endBasDt=YYYYMMDD
    &numOfRows=1000 &pageNo=1 &resultType=json
```

- **A date range works, and one call covers the whole window** for one instrument — roughly 260
  rows for a year. This vendor has no 200-row cap.
- History begins **2020-01-02**. Older than that returns nothing, which is a fact about the source
  and not about the fund.
- ⚠️ **An error arrives on a 200.** The HTTP status is not the answer; `response.header.resultCode`
  is, and `00` is the one that means it worked.
- ⚠️ **`clpr` here is the traded close and is not adjusted, and `nav` is not back-adjusted either.**
  Neither is a total return. **Never compute a horizon return from this source.** It answers what
  the fund *is*, not how it has travelled.

What each field is for:

| | |
|---|---|
| `nav` | assets per unit. Against `clpr`, the premium or discount |
| `bssIdxIdxNm` · `bssIdxClpr` | the underlying index by name and close. Against `nav`, the tracking |
| `nPptTotAmt` · `stLstgCnt` | net assets and units outstanding — size, and whether it is growing |
| `trqu` · `trPrc` | volume and value traded — liquidity |

**`bssIdxIdxNm` is also how you classify a fund into a role.** `KODEX 200` and `TIGER 200` do not
contain the word 코스피; their index does. And the field carries the vendor's own `(TR)`, `총수익`
or `(PR)` suffix, which is how a total-return share class is told from a distributing one without a
second source.

## The comparison that only works half the time

`nav` return minus `bssIdxClpr` return, day by day, is a distribution detector: on a distribution
day the fund's assets fall and its price index does not, so the day stands out.

**It works for a fund tracking a Korean index and it does not work for a fund tracking a foreign
one.** Measured over 60 sessions:

```
069500  코스피 200 추종     daily deviation σ = 4.5bp   — quarter-end distributions stand out at 4σ
360750  S&P 500 추종        daily deviation σ = 127bp   — nothing stands out at all
```

The Korean close and the US close are hours and a currency apart, and that gap swamps a 20–50bp
distribution. So: **run the detector on the Korean-index roles, and for the foreign-index roles say
in `uncertainty` that you could not run it.** Do not lower the threshold until something appears.

⚠️ **A distribution detected is reported, never repaired.** There is no distribution endpoint in any
Korean public API. You cannot get the amount, so you cannot correct the series — and a series
corrected by an estimate is worse than one whose defect is named. Where the role holds a total-return
share class the question does not arise: a TR class pays no distribution.
