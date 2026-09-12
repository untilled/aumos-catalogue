---
name: return-policy-evidence
description: Turning a shareholder return policy into filed evidence — what was announced, what has been executed, and the pace test between them. Load whenever a candidate's return programme is being assessed.
---

# Announced is a sentence; executed is a transaction

This is the distinction the whole methodology turns on, and it is the one a run gets wrong by
reading a headline.

```
executionRate = executedAmount / announcedAmount
elapsedShare  = min(1, elapsedDays / windowDays)     ← the issuer's own declared window
pace          = executionRate / elapsedShare
```

`classifyCase` refuses a programme running below **0.5** of its own straight-line schedule once at
least **0.25** of its window has passed, and reaches `announced-not-executed` — which routes to
`WATCH`, not to a rejection, because a programme that starts is a different case next quarter.
Before a quarter of the window has run, the pace is arithmetic rather than a fact and the answer is
`unevaluated`.

⚠️ **Both thresholds are properties of disclosure and mechanics, not of any company.** A quarter of
the window is the shortest interval at which Korean progress reporting makes the shortfall a filed
fact. Half of straight-line is a shortfall larger than the daily volume limits and results-release
blackout days can explain, and it is measured against the issuer's own window so a three-month
programme and a twelve-month one are read on one scale.

## Where each fact lives

| the fact | where it is filed |
|---|---|
| a buyback decided | 주요사항보고서 (자기주식 취득 결정) |
| a buyback actually bought | 자기주식 취득 결과보고서, and the treasury holding in the quarterly report |
| shares retired | 주요사항보고서 (자기주식 소각 결정), and the change in shares outstanding |
| a dividend decided | 현금·현물배당 결정, and the board and general-meeting resolutions |
| the policy itself | the issuer's IR material and its value-up disclosure — a **web reading**, not a filing |

Read the receipts through OpenDART. Read the price series and corporate actions through the
broker connection. Read the policy from the issuer and **file it as an observation** with its URL
and publication date: a policy target you remember is not evidence, and the observation route is
the only way a reading reaches `evidenceIds` at all.

## The programme record, and the key that joins its two halves

`lib/programme.mjs` writes one row per programme, and the row is the announcement and its receipts
in one place:

```json
{
  "symbol": "316140",
  "programmeId": "prog-2026-buyback-1",
  "announcedAmount": 200000000000,
  "announcedKind": "amount",
  "windowStartEpochMs": 1767571200000,
  "windowEndEpochMs": 1799107200000,
  "executedAmount": 110000000000,
  "retiredAmount": 110000000000,
  "cancelledAmount": 0,
  "executionRate": 0.55,
  "elapsedShare": 0.48,
  "pace": 1.14,
  "status": "on-pace",
  "announcementRceptNo": "20260105000111",
  "executionReceipts": ["20260630000742"],
  "evidenceIds": ["ev_decision_2601", "ev_result_2606"]
}
```

```text
programmeId = the rcept_no of the 취득 결정 that opened the programme
key         = (symbol, programmeId)
```

Every 결과보고서, every 소각 결정 and every 철회 is joined back to the decision it descends from by
that pair. ⛔ **A receipt whose programme has no decision behind it is not a new programme.** Its
announced amount and its window would both be invented, and every pace measured afterwards would be
against a schedule nobody published — so `execution_without_announcement` is an instruction to walk
the disclosure cursor back and read the 결정 공시. That is a different finding from
`announcement_without_execution_receipt`, which says the company has filed nothing, and the two ask
for different repairs.

⛔ **Bought, retired and cancelled are three counters and a sum of them is a number about nothing.**
`announcedKind` says whether the promise was an amount or a ratio; a ratio has no execution rate to
divide into, and saying so is the answer rather than producing a pace out of a percentage.

## The traps, in the order they catch people

1. **A cancellation is not a buyback.** Shares bought and held in treasury can be sold again, used
   in a merger, or handed out as compensation. Shares retired cannot. A programme that buys and
   never cancels raises the per-share figures only until the treasury stock comes back out, and
   the thesis is weaker than the headline number.
2. **A buyback is not the investor's income.** `returnComposition` refuses adding it to the cash
   dividend, and the reason is in that module's own note. Report it beside the return, never
   inside it.
3. **A trust-account buyback is a mandate to a broker, not a purchase.** The signed contract is
   the announcement; the acquisition report is the execution.
4. **A ratio and an amount are different promises.** "35% of consolidated profit" falls with
   profit; "300 billion won a year" does not. Say which this issuer has committed to, because the
   bear case turns on it.
5. **A dividend the investor cannot be on the register for is not in the return.** Check the
   ex-date against the holding period. Korea's record dates and the interval to the actual
   payment are long enough that this genuinely changes a twelve-month number.

## What a completed `returnPolicyEvidence` output contains

The policy in the issuer's own words with its date; the amounts announced and executed with their
receipt references; the pace the arithmetic produced; whether purchases were retired; and — where
the programme is behind — whether the issuer has said why. A programme that is behind **and**
explained is a different finding from one that is behind and silent, and the difference belongs in
the record even though this package's arithmetic treats them the same.
