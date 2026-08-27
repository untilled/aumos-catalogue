# fsc-securities-product

<sub><a href="README.ko.md">한국어</a></sub>

금융위원회's **증권상품시세정보** — the Korea Exchange's daily ETF numbers, served through
Korea's public data portal. Free, and the licence puts no restriction on what you do with it.

## What you get

| | |
|---|---|
| **Reaches** | `apis.data.go.kr` |
| **Cost** | free. `이용허락범위 제한 없음` — no restriction on use, commercial included |
| **Approval** | automatic, at both the development and the operating tier |
| **Quota** | 10,000 calls a day on a development key; an operating key can ask for more |
| **History** | from **2020-01-02** |

```
/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo
   ?numOfRows,pageNo,resultType
   ,basDt,beginBasDt,endBasDt,likeBasDt
   ,likeSrtnCd,isinCd,likeIsinCd,itmsNm,likeItmsNm
   ,beginVs,endVs,beginFltRt,endFltRt,beginNav,endNav
   ,beginTrqu,endTrqu,beginTrPrc,endTrPrc,beginMrktTotAmt,endMrktTotAmt
   ,bssIdxIdxNm,likeBssIdxIdxNm
```

The same service also publishes `getETNPriceInfo` and `getELWPriceInfo`. **They are not
declared here**, because only the ETF operation's parameters were read off the vendor's own
Swagger and checked against live responses. Adding them is a one-line change for whoever
needs them and has done that reading.

## What one row carries

Eighteen fields, and the four that matter are the ones a price feed does not have.

| | |
|---|---|
| `nav` | net asset value. Against `clpr` this is the **premium or discount** |
| `bssIdxIdxNm` · `bssIdxClpr` | the underlying index by name and close. Against `nav` this is **tracking** |
| `nPptTotAmt` · `stLstgCnt` | net assets and units outstanding — **fund size, and whether it is growing** |
| `trqu` · `trPrc` | volume and value traded — **liquidity** |

The rest is the ordinary shape: `basDt`, `srtnCd`, `isinCd`, `itmsNm`, `mkp`, `hipr`, `lopr`,
`clpr`, `vs`, `fltRt`, `mrktTotAmt`.

⚠️ **The index name tells you what kind of index it is.** `bssIdxIdxNm` carries the vendor's
own suffix — `S&P500 Yen Hedged Index(PR)`, `S&P 500 Covered Call 1% OTM Daily Index(TR)`. A
total-return index already contains the distributions its constituents paid; a price index does
not. Any comparison between `nav` and `bssIdxClpr` means something different in the two cases,
and this field is how you tell them apart without a second source.

## What this is not

⚠️ **`clpr` is not adjusted.** It is the price that traded. A distribution or a split leaves a
step in it, and `nav` is not back-adjusted either — so **neither series is a total return** and
neither can be used for one without repair.

That was measured rather than assumed: over 260 sessions of `069500` the ratio `clpr / nav`
stays inside ±0.5% and mean-reverts, with no level shift anywhere. `nav` is never back-adjusted
by anybody, so a `clpr` that had been adjusted would have left a permanent step against it. None
is there.

**So this document is not where a trend signal comes from.** It is where you find out whether
the fund you are about to hold trades near its assets, tracks what it claims to track, and is
big enough to trade. For adjusted prices, use a source that says it adjusts them.

There is **no distribution endpoint** — not here and not in any Korean public API we could
find. What `nav` against `bssIdxClpr` gives you is *detection*: on a distribution the fund's
assets fall and its price index does not, and the day stands out. That works well for a fund
tracking a Korean index (over the same 260 sessions the daily deviation for `069500` has a
standard deviation of 4.5bp, and three days past four sigma landed on the quarter-end
distribution dates). It does **not** work for a fund tracking a foreign index, where the
Korean close and the foreign close are hours and a currency apart — the same measurement on
`360750` gives a standard deviation of 127bp and nothing stands out at all.

## What you supply

A 공공데이터포털 service key. Get one at
[data.go.kr/data/15094806](https://www.data.go.kr/data/15094806/openapi.do) — 활용신청 is
approved automatically, so the key works immediately.

Aumos appends it as `serviceKey` and keeps it in the system keychain; no manager ever sees it.
Until you enter it, this source refuses its own calls by name and stops nothing else.

⚠️ **An error arrives on a 200.** The HTTP status is not the answer — `response.header.resultCode`
is, and `00` is the one that means it worked.
