# fsc-securities-product

금융위원회의 **증권상품시세정보** — 한국거래소의 일별 ETF 수치를 공공데이터포털을 통해
받습니다. 무료이고, 이용허락범위에 제한이 없습니다.

## 무엇을 얻는가

| | |
|---|---|
| **닿는 곳** | `apis.data.go.kr` |
| **비용** | 무료. `이용허락범위 제한 없음` — 상업적 이용을 포함해 제한이 없습니다 |
| **승인** | 개발단계·운영단계 모두 자동승인 |
| **한도** | 개발계정 하루 10,000회. 운영계정은 증액을 신청할 수 있습니다 |
| **이력** | **2020-01-02** 부터 |

```
/1160100/service/GetSecuritiesProductInfoService/getETFPriceInfo
   ?numOfRows,pageNo,resultType
   ,basDt,beginBasDt,endBasDt,likeBasDt
   ,likeSrtnCd,isinCd,likeIsinCd,itmsNm,likeItmsNm
   ,beginVs,endVs,beginFltRt,endFltRt,beginNav,endNav
   ,beginTrqu,endTrqu,beginTrPrc,endTrPrc,beginMrktTotAmt,endMrktTotAmt
   ,bssIdxIdxNm,likeBssIdxIdxNm
```

같은 서비스에 `getETNPriceInfo`와 `getELWPriceInfo`도 있습니다. **여기에 선언하지
않았습니다.** 벤더 자신의 Swagger에서 파라미터를 읽고 실제 응답과 대조한 것이 ETF
오퍼레이션뿐이기 때문입니다. 그 확인을 한 사람에게는 한 줄 추가입니다.

## 한 행이 담는 것

열여덟 개이고, 중요한 넷은 시세 피드에는 없는 것들입니다.

| | |
|---|---|
| `nav` | 순자산가치. `clpr`과 맞대면 **괴리율** |
| `bssIdxIdxNm` · `bssIdxClpr` | 기초지수의 이름과 종가. `nav`와 맞대면 **추적오차** |
| `nPptTotAmt` · `stLstgCnt` | 순자산총액과 상장좌수 — **펀드 규모와 그 추이** |
| `trqu` · `trPrc` | 거래량과 거래대금 — **유동성** |

나머지는 통상의 모양입니다: `basDt`, `srtnCd`, `isinCd`, `itmsNm`, `mkp`, `hipr`, `lopr`,
`clpr`, `vs`, `fltRt`, `mrktTotAmt`.

⚠️ **지수 이름이 그 지수의 종류를 말해줍니다.** `bssIdxIdxNm`에는 벤더 자신의 접미사가
붙어 옵니다 — `S&P500 Yen Hedged Index(PR)`, `S&P 500 Covered Call 1% OTM Daily Index(TR)`.
총수익지수는 구성종목이 지급한 분배를 이미 담고 있고 가격지수는 담고 있지 않습니다. `nav`와
`bssIdxClpr`의 비교는 두 경우에 서로 다른 것을 뜻하며, 두 번째 소스 없이 그것을 구별하는
방법이 이 필드입니다.

## 이것이 아닌 것

⚠️ **`clpr`은 수정주가가 아닙니다.** 실제로 체결된 가격입니다. 분배나 분할이 이 계열에
계단을 남기고, `nav`도 소급 조정되지 않습니다 — 즉 **두 계열 어느 쪽도 총수익률이 아니며**
보정 없이는 총수익률로 쓸 수 없습니다.

이것은 가정이 아니라 측정입니다. `069500`의 260 거래일에 대해 `clpr / nav` 비율은 ±0.5%
안에서 평균회귀하고 어디에도 레벨 시프트가 없습니다. `nav`는 누구도 소급 조정하지 않으므로,
`clpr`이 조정된 계열이었다면 그에 대해 영구적인 계단이 남았어야 합니다. 남아 있지 않습니다.

**따라서 이 문서는 추세 신호가 나오는 곳이 아닙니다.** 담으려는 펀드가 자기 자산 근처에서
거래되는지, 따르겠다고 한 것을 실제로 따르는지, 거래할 만큼 큰지를 확인하는 곳입니다.
수정주가는 조정한다고 말하는 소스에서 받으십시오.

**분배금 엔드포인트는 없습니다** — 여기에도 없고, 찾아본 어떤 한국 공개 API에도 없습니다.
`nav`를 `bssIdxClpr`에 맞대어 얻는 것은 *탐지*입니다. 분배일에 펀드의 자산은 줄고 가격지수는
줄지 않으므로 그날이 튀어나옵니다. 국내 지수를 추종하는 펀드에서는 잘 작동합니다(같은 260
거래일에서 `069500`의 일간 편차는 표준편차 4.5bp이고, 4시그마를 넘은 사흘이 분기말 분배일에
정확히 떨어졌습니다). 해외 지수를 추종하는 펀드에서는 **작동하지 않습니다.** 한국 종가와
해외 종가는 몇 시간과 환율만큼 떨어져 있고, `360750`에 같은 측정을 하면 표준편차가 127bp에
아무것도 튀어나오지 않습니다.

## 당신이 제공하는 것

공공데이터포털 서비스 키. [data.go.kr/data/15094806](https://www.data.go.kr/data/15094806/openapi.do)
에서 활용신청하면 자동승인되므로 즉시 씁니다.

Aumos가 `serviceKey`로 붙이고 시스템 키체인에 보관하며, 어떤 매니저도 그 값을 보지 못합니다.
입력하기 전까지 이 소스는 자기 호출을 이름과 함께 거부하고, 나머지는 막지 않습니다.

⚠️ **오류가 200으로 옵니다.** HTTP 상태가 답이 아니라 `response.header.resultCode`가 답이고,
동작했다는 뜻인 값은 `00`입니다.
