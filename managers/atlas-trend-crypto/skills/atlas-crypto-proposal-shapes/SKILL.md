---
name: atlas-crypto-proposal-shapes
description: "The three worked DecisionProposal examples Atlas Trend Crypto reaches — a WAIT inside the band, a REBALANCE that resizes the exposure, and the all-cash decision — written as JSON rather than described in prose. Read this before calling decision_submit."
---

# The shapes this methodology submits

**The protocol is not here.** How to answer in AMP/1 is stated by the Aumos MCP server itself, and
the shape is published as `decision_submit`'s own input schema. **Read that schema and follow it
where it differs from anything below.**

**Every example carries `plans` and `thesisRefs`, and neither is decoration.** Stage 4b explains the
first. The second is required by the schema and is `[]` here, because this methodology rests on no
thesis — a proposal that omits it is refused and the whole judgement discarded.

⚠️ **Stage 4 of `PROMPT.md` governs this document.** The `exit` named for every departure and the
self-check before submitting are stated there; these examples illustrate that rule rather than
replace it.

Assets are `{ "class": "crypto", "symbol": "BTC-USD", "market": "CBSE", "currency": "USD" }`.

## Inside the band

```json
{
  "action": "WAIT",
  "confidence": 0.7,
  "thesisRefs": [],
  "plans": [
    {
      "intent": "Re-score BTC at the next month-end and resize the exposure if it drifts beyond the band.",
      "trigger": {
        "kind": "at-time",
        "at": "2026-09-30T00:30:00Z",
        "rule": { "cron": "30 0 L * *", "timeZone": "UTC" }
      }
    }
  ],
  "rationale": {
    "conclusion": "The ensemble stays at +1.0 and realised volatility barely moved, so the target exposure of 58% is 1.4 points from what the book holds and nothing is worth trading.",
    "keyReasons": [
      "All four horizons positive: +7.1%, +19.4%, +31.0%, +64.2%.",
      "63-day volatility 43.1% annualised gives 0.25 / 0.431 = 58% exposure against 59.4% held."
    ],
    "risks": [
      "A 58% position in an asset that has fallen 77% within a single cycle is the whole risk of this package, and a monthly review will not see the start of that."
    ],
    "counterArguments": [
      "The 1-month return is the weakest of the four and a faster system would already be trimming."
    ],
    "uncertainty": [
      "t0 is 2026-08-28, the last candle whose 24-hour bucket both starts and ends at or before asOf; the bucket beginning 2026-08-29T00:00Z was still open and was discarded."
    ]
  },
  "evidenceIds": ["ev_…"]
}
```

## Resizing, and dropping the second asset

`ETH-USD` was held and its ensemble turned negative, so it is named as an `exit` — leaving it out of
`targets` would leave the book holding it.

```json
{
  "action": "REBALANCE",
  "confidence": 0.63,
  "thesisRefs": [],
  "targets": [
    {
      "type": "position-weight",
      "asset": { "class": "crypto", "symbol": "BTC-USD", "market": "CBSE", "currency": "USD" },
      "targetWeight": 0.41
    },
    { "type": "exit", "asset": { "class": "crypto", "symbol": "ETH-USD", "market": "CBSE", "currency": "USD" } },
    { "type": "cash-weight", "targetWeight": 0.59 }
  ],
  "plans": [
    {
      "intent": "Re-score BTC and ETH at the next month-end and resize the exposure if it drifts beyond the band.",
      "trigger": {
        "kind": "at-time",
        "at": "2026-09-30T00:30:00Z",
        "rule": { "cron": "30 0 L * *", "timeZone": "UTC" }
      }
    }
  ],
  "rationale": {
    "conclusion": "ETH turned majority-negative and leaves, and rising volatility cuts the surviving BTC exposure from 58% to 41%, with the remaining 59% held as cash rather than as any stablecoin.",
    "keyReasons": [
      "ETH scored −0.5 against the 0.0 hold threshold; BTC held at +0.5.",
      "63-day volatility rose from 43% to 61%, so 0.25 / 0.61 = 41% exposure, and BTC now takes it alone."
    ],
    "risks": [
      "Cutting exposure into rising volatility is what this rule does, and it is also what it does at the bottom — the same mechanic that avoids the long decline sells the low."
    ],
    "counterArguments": [
      "ETH's 12-month return is still strongly positive, so this exit rests on the three shorter horizons."
    ],
    "uncertainty": [
      "The two candle pages overlapped by five days and the closes agreed exactly, so the join is safe."
    ]
  },
  "evidenceIds": ["ev_…"]
}
```

## Out of the market

**This is the example to copy the shape of.** BTC leaves the book, so there is an `exit` **and** a
`cash-weight` of 1.0. A version of this decision carrying only the `cash-weight` validates, is
accepted, and sells nothing.

With `"language": "ko-KR"` only the prose changes. Every JSON key and enum value stays as spelled.

```json
{
  "action": "REBALANCE",
  "confidence": 0.78,
  "thesisRefs": [],
  "targets": [
    { "type": "exit", "asset": { "class": "crypto", "symbol": "BTC-USD", "market": "CBSE", "currency": "USD" } },
    { "type": "cash-weight", "targetWeight": 1.0 }
  ],
  "plans": [
    {
      "intent": "다음 월말에 BTC를 다시 채점하고, 앙상블이 회복되면 목표 변동성에 맞춰 익스포저를 복원한다.",
      "trigger": {
        "kind": "at-time",
        "at": "2026-09-30T00:30:00Z",
        "rule": { "cron": "30 0 L * *", "timeZone": "UTC" }
      }
    }
  ],
  "rationale": {
    "conclusion": "네 구간이 모두 음수로 돌아서 앙상블이 -1.0이 되었으므로 익스포저를 0으로 내리고 전액을 현금으로 둔다.",
    "keyReasons": [
      "1·3·6·12개월 수익률이 각각 -18.2%, -31.4%, -22.7%, -8.9%로 전부 음수다.",
      "직전 41% 익스포저가 0%가 되며, 남는 100%는 스테이블코인이 아니라 cash-weight로 선언한다."
    ],
    "risks": [
      "이 상태의 실패 방식은 정해져 있다. 바닥에서 전량 현금이 되는 것이며, 반등의 첫 달을 통째로 놓친 뒤 한 달 늦게 재진입한다. 이 자산에서 그 한 달은 다른 자산의 한 해만큼 움직인다."
    ],
    "counterArguments": [
      "12개월 수익률의 마이너스 폭이 가장 작아, 더 느린 시스템이라면 아직 보유하고 있었을 것이다."
    ],
    "uncertainty": [
      "BTC를 targets에서 빼는 것이 아니라 exit으로 명시했다. cash-weight만 담은 판단은 검증을 통과하지만 아무것도 팔지 않는다.",
      "이 방법론이 기대는 기록은 사이클 네 번 남짓이며, 그 표본은 '추세가 통한다'와 '크게 올랐다 크게 빠졌다'를 구별하지 못한다."
    ]
  },
  "evidenceIds": ["ev_…"]
}
```
