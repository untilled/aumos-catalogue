---
name: atlas-kr-proposal-shapes
description: "The three worked DecisionProposal examples Atlas Trend KR reaches — a WAIT inside the band, a REBALANCE carrying the whole basket including a share-class switch, and the all-cash decision — written as JSON rather than described in prose. Read this before calling decision_submit."
---

# The shapes this methodology submits

**The protocol is not here.** How to answer in AMP/1 — call `invocation_read` first, submit once
through `decision_submit`, what each action means, which action takes which target — is stated by the
Aumos MCP server itself, and the shape is published as `decision_submit`'s own input schema. **Read
that schema and follow it where it differs from anything below.**

**Every example carries a `plans` entry and a `thesisRefs`, and neither is decoration.** Stage 4b
explains the first: the next run is not guaranteed by anything outside this decision. The second is
required by the schema and is `[]` here, because this methodology rests on no thesis — a proposal
that omits it is refused and the whole judgement discarded.

⚠️ **Stage 4 of `PROMPT.md` governs this document.** The two lists, the `exit` named for every
departure, and the self-check before submitting are stated there, and these examples illustrate that
rule rather than replace it.

Assets are `{ "class": "etf", "symbol": "<6-digit code>", "market": "XKRX", "currency": "KRW" }`.

## The answer this methodology reaches most often

```json
{
  "action": "WAIT",
  "confidence": 0.71,
  "thesisRefs": [],
  "plans": [
    {
      "intent": "Re-score the five roles at the next month-end and rebalance if any target drifts beyond the band.",
      "trigger": { "kind": "at-time", "at": "2026-09-30T08:00:00Z" }
    }
  ],
  "rationale": {
    "conclusion": "Four of the five roles remain in positive trends and the computed weights differ from the book by at most 1.9 points, so the allocation stands with the cash proxy at 18%.",
    "keyReasons": [
      "Gold is the only role below its threshold, at score 0.0 and held, which keeps it eligible.",
      "Largest drift is 411060 at 1.9 points against a 3.0-point band."
    ],
    "risks": [
      "Three of the four risk roles hold Korea-listed funds of US assets, so this allocation is a won-dollar position as much as an asset position; a sharp won rally costs it without any trend turning."
    ],
    "counterArguments": [
      "The 1-month return is negative on three of four risk roles, which a faster system would already be acting on."
    ],
    "uncertainty": [
      "The distribution detector could not be run on 360750 or 453850 — their indices are foreign, and the daily nav-versus-index deviation is too noisy at that horizon to separate a distribution from the close-to-close gap."
    ]
  },
  "evidenceIds": ["ev_…"]
}
```

## The whole basket, with a share class switching

`449180` wins US equity from `360750` this month, so the incoming class is a `position-weight` **and
the outgoing class is an `exit`**. Without that second entry the book holds both, which is the one
thing the universe rule forbids.

```json
{
  "action": "REBALANCE",
  "confidence": 0.66,
  "thesisRefs": [],
  "targets": [
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "278530", "market": "XKRX", "currency": "KRW" },
      "targetWeight": 0.26
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "449180", "market": "XKRX", "currency": "KRW" },
      "targetWeight": 0.22
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "411060", "market": "XKRX", "currency": "KRW" },
      "targetWeight": 0.19
    },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "459580", "market": "XKRX", "currency": "KRW" },
      "targetWeight": 0.33
    },
    { "type": "exit", "asset": { "class": "etf", "symbol": "360750", "market": "XKRX", "currency": "KRW" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "453850", "market": "XKRX", "currency": "KRW" } }
  ],
  "plans": [
    {
      "intent": "Re-score the five roles at the next month-end and rebalance if any target drifts beyond the band.",
      "trigger": { "kind": "at-time", "at": "2026-09-30T08:00:00Z" }
    }
  ],
  "rationale": {
    "conclusion": "US long Treasuries turned majority-negative and leave the basket, and the hedged class wins US equity on a won-return basis, so the three surviving roles are re-weighted by inverse volatility and the cash proxy takes the residual 33%.",
    "keyReasons": [
      "453850 scored −0.5 on the four-horizon ensemble, below the 0.0 hold threshold.",
      "449180 scored +1.0 against 360750's +0.5 — the same US equities, and the difference is the dollar."
    ],
    "risks": [
      "Switching share class inside a role pays the spread on both legs for an exposure that did not change; if the won reverses next month the switch is paid for twice."
    ],
    "counterArguments": [
      "The unhedged class has outperformed over 12 months, so this is a 1-and-3-month decision overriding the longer horizons within the role."
    ],
    "uncertainty": [
      "The 토스증권 pages for 449180 overlapped by five sessions and agreed to the won, so the stitched series is usable; 453850's second page differed by 3 won on the overlap and its 12-month horizon is therefore reported as computed on the most recent page only."
    ]
  },
  "evidenceIds": ["ev_…"]
}
```

## The all-cash state, which is a decision and not a gap

**This is the example to copy the shape of, and the one where getting it wrong costs the most.** Four
risk roles leave the book, so there are four `exit` entries and then the cash proxy at 1.0. A version
of this decision carrying only the `459580` target validates, is accepted, and sells nothing.

With `"language": "ko-KR"` only the prose changes. Every JSON key and enum value stays as spelled.

```json
{
  "action": "REBALANCE",
  "confidence": 0.8,
  "thesisRefs": [],
  "targets": [
    { "type": "exit", "asset": { "class": "etf", "symbol": "278530", "market": "XKRX", "currency": "KRW" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "360750", "market": "XKRX", "currency": "KRW" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "453850", "market": "XKRX", "currency": "KRW" } },
    { "type": "exit", "asset": { "class": "etf", "symbol": "411060", "market": "XKRX", "currency": "KRW" } },
    {
      "type": "position-weight",
      "asset": { "class": "etf", "symbol": "459580", "market": "XKRX", "currency": "KRW" },
      "targetWeight": 1.0
    }
  ],
  "plans": [
    {
      "intent": "다음 월말에 다섯 역할을 다시 채점하고, 자격을 얻은 역할이 생기면 위험자산 비중을 복원한다.",
      "trigger": { "kind": "at-time", "at": "2026-09-30T08:00:00Z" }
    }
  ],
  "rationale": {
    "conclusion": "네 개 위험 역할이 모두 음의 앙상블 점수를 기록해, 전량을 CD금리 ETF 459580으로 옮긴다.",
    "keyReasons": [
      "네 역할의 점수가 각각 -1.0, -1.0, -0.5, -0.5로 보유 기준선 0.0을 모두 밑돈다.",
      "직전 배분의 위험자산 비중 82%가 0%가 되고, 현금성 비중은 100%가 된다."
    ],
    "risks": [
      "이 상태의 실패 방식은 정해져 있다. 바닥에서 전량 현금이 되는 것이며, 반등의 첫 달을 통째로 놓친 뒤 한 달 늦게 재진입한다."
    ],
    "counterArguments": [
      "12개월 수익률만 보면 411060은 아직 양수이고, 더 느린 시스템이라면 금을 유지했을 것이다."
    ],
    "uncertainty": [
      "떠나는 네 종목을 targets에서 빼는 것이 아니라 각각 exit으로 명시했다. 아무 target도 언급하지 않은 보유분은 아무도 팔지 않는다.",
      "459580은 합성 ETF이므로 이 상태의 100%는 거래상대방 위험 위에 놓인다."
    ]
  },
  "evidenceIds": ["ev_…"]
}
```
