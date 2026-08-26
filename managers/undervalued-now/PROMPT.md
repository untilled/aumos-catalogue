# The question

Find one listed equity that is undervalued right now, and propose the position you would
take in it. Use whatever you can reach — the web, filings, prices, a shell, your own
judgement — and reach it however you like. Nothing about *how* you get there is prescribed,
scored, or checked. What is measured is the forward return of what you propose.

# What this package asks of the answer

**The protocol is not here.** How to answer in AMP/1 — call `invocation_read` first, submit once
through `decision_submit`, what WAIT and WATCH mean, which action takes which `target`, what a
strict schema does to a translated key — is stated by the Aumos MCP server itself, once per
session, and the shape is published as `decision_submit`'s own input schema. Read both there.

This file is only what is true of **this** package and would be false of another.

## The next time you will be asked — required, and not yours to choose

**Every answer must carry exactly one `watches` entry, and its trigger must be `at-time`, set
to 24 hours after the `asOf` you were given.** Not approximately, not "in a few days", not a
horizon of your own choosing. Copy `asOf`, add one day, keep the same clock time.

```json
{
  "watches": [
    {
      "intent": "The next scheduled review.",
      "trigger": { "kind": "at-time", "at": "<asOf plus exactly 24 hours>" }
    }
  ]
}
```

This is the one place in this package where you are told what to answer, and it is here rather
than in the question because it is not a judgement. **It is the clock.** Nothing else asks this
question again: an armed watch is what wakes the next run, so an answer without one is the last
answer this row ever gives, and a forward record that stops is not a shorter forward record —
it is an ended one.

Two things follow, and both are the reason the interval is fixed rather than yours:

- **A benchmark row is a count as much as it is a return.** A model asked forty times has had
  forty chances; a model that said *"revisit in eighteen months"* has had one. If the interval
  were a judgement, it would be a judgement about how often to be measured, made by the thing
  being measured.
- **It is not the cadence a real manager should have.** `basic-investor` and the others propose
  their own review conditions, because for an investor that *is* the judgement (§34) — a thesis
  that hinges on an earnings date should be revisited on that date and not on a Tuesday. This
  package is a measuring instrument and takes the opposite rule.

You may still say something about timing where it belongs: in `forecast.horizonDays`, which is
how long you think your position needs, and in your prose. Those are yours. The watch is not.

## Nothing you read was recorded, so your prose is the only record

This package asks Aumos for nothing, so nothing you read was observed by it — and nothing you
reach with your CLI's own tools is observed by it either. **No Evidence was filed for any of
it.** The paragraph you write is the only record of what your answer was made of. Put the source
in `keyReasons` in words a person can go and check: a filing and its date, a URL, a price and
when you read it.

That makes two optional fields worth more here than in any other package. `counterArguments` is
the strongest case against your own conclusion. And **`uncertainty` is the only place a reader
learns that a figure was estimated rather than quoted** — a source that would not load, a number
you inferred rather than read, a date you were unsure of.

`targetWeight` is a fraction of this book, and it is checked against a mandate whose cap you
should read before you propose one.

With `"language": "ko-KR"`, only the right-hand side of the prose fields changes:

```json
{
  "action": "WAIT",
  "thesisRefs": [],
  "rationale": {
    "conclusion": "지금 저평가라고 부를 만한 종목을 찾지 못했다.",
    "keyReasons": ["후보 세 곳 모두 최근 3개월 상승분이 실적 개선폭을 넘어섰다."],
    "risks": ["아무것도 사지 않는 동안 시장이 계속 오르면 기회비용이 발생한다."],
    "uncertainty": ["장중 호가를 얻지 못해, 사용한 가격은 전일 종가다."]
  },
  "watches": [
    {
      "intent": "다음 정기 검토.",
      "trigger": { "kind": "at-time", "at": "<asOf plus exactly 24 hours>" }
    }
  ]
}
```
