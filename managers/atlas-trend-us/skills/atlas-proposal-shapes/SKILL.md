---
name: atlas-proposal-shapes
description: "The three worked DecisionProposal examples Atlas Trend reaches — a WAIT inside the band, a REBALANCE carrying the whole basket, and the all-cash decision — written as JSON rather than described in prose. Read this before calling decision_submit. The published decision_submit input schema always wins where it differs."
---

# The shapes this methodology submits

**The protocol is not here.** How to answer in AAP/1 — call `invocation_read` first, submit once
through `decision_submit`, what each action means, which action takes which target — is stated by
the Aumos MCP server itself, once per session, and the shape is published as `decision_submit`'s
own input schema. **Read that schema and follow it where it differs from anything below.** These
examples show what this methodology puts in the fields; the server says what the fields are.

**Every example below carries a `plans` entry, and that is not decoration.** Stage 4b explains
why: the next run is not guaranteed by anything outside this decision, so each one arms the
month-end that follows it. A worked example without it would teach the omission.

⚠️ **Stage 4 of `PROMPT.md` governs this document.** The two lists, the `exit` named for every
departure, and the self-check before submitting are stated there, and these examples illustrate
that rule rather than replace it. A decision that drops it validates cleanly and moves nothing.

### The answer this methodology reaches most often

Nothing to do: the rule and the book agree, and the level at which that stops being true is
recorded rather than acted on.

```json
{
  "action": "WAIT",
  "confidence": 0.74,
  "thesisRefs": [],
  "rationale": {
    "conclusion": "Five of six risk assets remain in positive trends and the computed weights differ from the book by at most 1.8 points, so the allocation stands with cash at 22%.",
    "keyReasons": [
      "VWO is the only member below its threshold, at score 0.0 and held, which keeps it eligible.",
      "Largest drift is GLD at 1.8 points against a 3.0-point band."
    ],
    "risks": [
      "VWO and DBC are both within half a horizon of flipping negative, so a single weak month turns this into a two-name exit and a BIL weight near 40%."
    ],
    "counterArguments": [
      "The 1-month return is negative on four of six members, which a faster system would already be acting on."
    ],
    "uncertainty": [
      "DBC's 12-month horizon spans a distribution whose adjustment could not be confirmed against the corporate action record."
    ]
  },
  "plans": [
    {
      "intent": "Re-score the basket at the next month-end and rebalance if any target drifts beyond the band.",
      "trigger": { "kind": "at-time", "at": "2026-09-30T22:00:00Z" }
    }
  ],
  "watches": [
    {
      "intent": "Re-score the basket and exit VWO if it closes a month with a majority-negative ensemble.",
      "subject": { "class": "etf", "symbol": "VWO", "market": "ARCX", "currency": "USD" },
      "trigger": {
        "kind": "price-below",
        "asset": { "class": "etf", "symbol": "VWO", "market": "ARCX", "currency": "USD" },
        "price": { "currency": "USD", "minorUnits": 4180 }
      }
    }
  ],
  "evidenceIds": ["ev_…"]
}
```

### The whole basket, in one judgement

Every target moves together, `config.cashProxy` is a holding among them rather than a
leftover, and the two names leaving the basket are each said out loud. `targetWeight` is a
fraction — `0.18` is 18% — and it is the weight you want **after** the change, not the
change itself.

```json
{
  "action": "REBALANCE",
  "confidence": 0.68,
  "targets": [
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "VTI", "market": "ARCX", "currency": "USD" },
      "targetWeight": 0.24
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "VEA", "market": "ARCX", "currency": "USD" },
      "targetWeight": 0.18
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "IEF", "market": "XNAS", "currency": "USD" },
      "targetWeight": 0.3
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "GLD", "market": "ARCX", "currency": "USD" },
      "targetWeight": 0.16
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "BIL", "market": "ARCX", "currency": "USD" },
      "targetWeight": 0.12
    },
    { "type": "exit", "asset": { "class": "etf", "symbol": "VWO", "market": "ARCX", "currency": "USD" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "DBC", "market": "ARCX", "currency": "USD" } }
  ],
  "thesisRefs": [],
  "rationale": {
    "conclusion": "VWO and DBC turned majority-negative and leave the basket; the four surviving members are re-weighted by inverse volatility and scaled to the 10% volatility target, leaving BIL at the residual 12%.",
    "keyReasons": [
      "VWO scored −0.5 and DBC −1.0 on the four-horizon ensemble, both below the 0.0 hold threshold.",
      "IEF is the largest weight at 30% because it is the least volatile eligible asset, not because it is the most attractive one.",
      "VWO and DBC are named as exits rather than left out of the targets, because a position no target mentions is a position nobody sells."
    ],
    "risks": [
      "Exiting two members after a single negative month is the whipsaw case: if commodities and emerging markets turn back up in the next four weeks, this rebalance pays the spread twice and misses the recovery."
    ],
    "counterArguments": [
      "DBC's 12-month return is still positive, so the exit rests entirely on the three shorter horizons."
    ],
    "uncertainty": [
      "VWO's bars were re-requested with asof=2026-08-21 after a name_change appeared in the corporate action record; the pre-change segment is the vendor's mapping and not independently checked."
    ]
  },
  "plans": [
    {
      "intent": "Re-score the basket at the next month-end and rebalance if any target drifts beyond the band.",
      "trigger": { "kind": "at-time", "at": "2026-09-30T22:00:00Z" }
    }
  ],
  "evidenceIds": ["ev_…"]
}
```

### The all-cash state, which is a decision and not a gap

**This is the example to copy the shape of, and the one where getting it wrong costs the
most.** Six risk assets leave the book, so there are six `exit` entries and then the cash
proxy at 1.0. A version of this decision carrying only the `BIL` target validates, is
accepted, and sells nothing: the book would still hold every one of the six.

With `"language": "ko-KR"`, only the right-hand side of the prose fields changes. Every JSON
key and every enum value stays exactly as it is spelled here.

```json
{
  "action": "REBALANCE",
  "confidence": 0.81,
  "targets": [
    { "type": "exit", "asset": { "class": "etf", "symbol": "VTI", "market": "ARCX", "currency": "USD" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "VEA", "market": "ARCX", "currency": "USD" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "VWO", "market": "ARCX", "currency": "USD" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "IEF", "market": "XNAS", "currency": "USD" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "GLD", "market": "ARCX", "currency": "USD" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "DBC", "market": "ARCX", "currency": "USD" } },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "BIL", "market": "ARCX", "currency": "USD" },
      "targetWeight": 1.0
    }
  ],
  "thesisRefs": [],
  "rationale": {
    "conclusion": "유니버스의 여섯 위험자산이 모두 음의 앙상블 점수를 기록해, 전량을 단기 국채 BIL로 옮긴다.",
    "keyReasons": [
      "여섯 종목의 점수가 각각 -1.0, -1.0, -0.5, -0.5, -1.0, -0.5로 보유 기준선 0.0을 모두 밑돈다.",
      "직전 배분의 위험자산 비중 78%가 0%가 되고, BIL 비중은 100%가 된다.",
      "떠나는 여섯 종목을 targets에서 빼는 것이 아니라 각각 exit으로 명시한다. 아무 target도 언급하지 않은 보유분은 아무도 팔지 않는다."
    ],
    "risks": [
      "이 상태의 실패 방식은 정해져 있다. 바닥에서 전량 현금이 되는 것이며, 반등의 첫 달을 통째로 놓친 뒤 한 달 늦게 재진입한다."
    ],
    "counterArguments": [
      "12개월 수익률만 보면 IEF와 GLD는 아직 양수이고, 더 느린 시스템이라면 두 종목을 유지했을 것이다."
    ],
    "uncertainty": [
      "DBC는 2026-07-31 이후 거래일 봉이 없어 대체 종목 PDBC로 점수를 계산했다."
    ]
  },
  "plans": [
    {
      "intent": "다음 월말에 바스켓을 다시 채점하고, 자격을 얻은 자산이 생기면 위험자산 비중을 복원한다.",
      "trigger": { "kind": "at-time", "at": "2026-09-30T22:00:00Z" }
    }
  ],
  "evidenceIds": ["ev_…"]
}
```

### What this desk does not do

- **No single-name action.** `BUY`, `SELL`, `RESIZE` and `HEDGE` are discretionary
  instruments and this is not a discretionary desk. If one asset needs to change, the basket
  needs to change, and the basket is a `REBALANCE`.
- **No forecast.** There is no view here about what any of these assets will do. The claim is
  narrower and it is the whole methodology: what has been trending tends to keep trending for
  a while, and when it stops, this system will find out a month late and sell.
