---
name: memory-contract
description: Read and append instance-private learning revisions safely, including empty, malformed and historical-asOf behavior.
---

# Manager memory contract

Private manager memory is a compact, append-only learning index for this **manager instance**. It
is not a hidden portfolio database and not a source cache.

## Stable keys

Use only:

- `migration/schema-version`
- `run/theme-radar-last`
- `run/watch-alerts`
- `run/armed-reviews`
- `learning/evidence-maturity`
- `learning/closed-decision-summary`
- `calibration/mean-reversion`
- `calibration/trend-pullback`
- `calibration/quality-pullback`
- `calibration/inflection`
- `calibration/post-event-continuation`
- `calibration/core-dca`
- `failures/repeated-patterns`
- `coverage/universe-state`
- `coverage/research-index`
- `learning/paper-cohorts`

Do not generate a key per run, asset or date.

`coverage/research-index` is a bounded exception for a research roster, not source caching.
Use `researchState({previous, observations})` and persist only a non-null `nextState`.
It carries at most 200 symbol/market rows with observation dates, up to eight Evidence ids,
sector and an extension flag; no prices, filings, portfolio weights or source bodies.
`researchUniverse` reads the bundled 74-name KR / 83-name US seed and validated extensions.
Refetch filing data from installed sources each run until the host provides queryable source
storage; an Evidence id is a reference, not a promise that its payload can be read back.
Capacity failure preserves the prior revision and requires explicit roster review.

For `run/armed-reviews`, `reconcileArmedReviews` persists what **this instance proposed** and whose
instant has not passed. ⛔ It is not verified against `decisions[].armed` and cannot be: that field
is past tense, and a review that armed cleanly and one that was never armed produce the same empty
array (#156, aumos#687). Never hand-write epoch values. What cannot be read must appear in
uncertainty as **unreadable**, never as a count and never as zero.
The earlier #136 dedupe diagnosis was refuted in #148; the #148 journal cross-check was refuted in
turn by #156.

### The key that stands in for a read path

`run/armed-reviews` holds the flow and instant of the three market reviews this instance last
armed. ⚠️ **It exists because a manager can arm a WATCH and cannot read one back** — the grant map
publishes no watch or plan capability at all, not even a declared-but-empty one. WATCHes leave in a
`DecisionProposal` and there is no return path.

Since #87 that costs more than it did: every wake dispatches one flow, so two `kr-sleeve` reviews
armed half an hour apart each run the Korean sleeve and each seal a judgement — two rows on the
same book, on the same day, neither saying which one read the close.

Three rows, and the state written back is **first person**: every review this instance has promised
whose instant has not passed. ⛔ Not "what is standing" — nothing anywhere answers that, and writing
it as though it did is what #156 measured. ⛔ Not a copy of this run's sequence either: a run with
nothing to arm would then write an empty list over three live promises, and the next run re-arms all
three. A row leaves when its instant passes, and only then.

⛔ **This key no longer suppresses a re-arm, and it never should have.** Standing promises are
unreadable, so every judgement re-arms its reviews and the host folds an identical instant per
instance (aumos#593). What the record still answers, and nothing else can, is whether this instance
already promised the same flow at a **different** instant — two wakes, two judgements on one book on
one day (#87) — which is `review_superseded`. A row can be stale in exactly one direction: the
promise behind it may already have fired, lapsed or been replaced without this instance seeing it.
That is why it decides nothing on its own.

### The encoding, and why the instant is a number

```json
{ "schemaVersion": 2, "updatedAsOf": "…", "armed": [{ "flow": "kr-sleeve", "atEpochMs": 1788735600000 }] }
```

⚠️ **`atEpochMs`, not RFC 3339, and this is the canonical shape.** `memory_read` refuses a result
carrying any **string** timestamp later than `asOf` — `post-as-of-timestamp` — and this key holds
future instants by construction, so the better it was filled the more certainly it was refused.
Measured on `run_3a48eaaa505241d5af94fb490d7c23c6`: three armed rows, three violations, the read
refused; and because the refusal is per read rather than per key, the run's first keyless
`memory_read` died with it and twelve keys had to be fetched one at a time. Only an empty key came
back cleanly.

The guard walks strings, so the instant is written as a number. The meaning is identical and the
key becomes readable. `reconcileArmedReviews` writes this shape and reads either it or the RFC 3339
rows an earlier version wrote. ⛔ It is not agreement with the rule — a key whose whole content is
scheduled is a shape the guard has no good answer for, and that half is `untilled/aumos`'s.

⚠️ **`toArm` keeps RFC 3339.** It leaves in a `DecisionProposal`, where AMP takes strings and this
guard does not run. Only what is written back to memory changes shape.

⛔ **A bridge, not the fix.** Private memory is scoped to this instance, so a new instance starts
blind and this record can drift from the WATCHes Aumos actually holds. Two copies of one fact
diverge. The fix is a read path and it is not this package's to publish. (#97)

### The key that lasts one session

`run/watch-alerts` is what stops the same WATCH from waking somebody four times as a price
wobbles across its level. It holds a `session` label and the `sessionKey`s that already alerted in
**that** session, and when the session rolls the list is replaced rather than appended to.

⚠️ **The label is `session-YYYY-MM-DD`, and the prefix is load-bearing.** The field held a bare
date until 0.4.18, and a bare date is a timestamp to the host: the pattern `memory_read` matches
deliberately includes the date-only form, because SEC's `filed` is written that way and *"some time
on the 5th"* can be later than an `asOf` earlier in the 5th — so a date-only value is compared
against the **end** of the day it names. Every session date this manager writes is on or after
`asOf`'s UTC date, so all three flows were refused, and the key survived only by never having been
written. ⛔ Not epoch milliseconds: this field answers *which session*, not *which instant*, and a
number would claim a moment it does not have. `sessionKey` already had this shape.

That bound is the whole design. A key that accumulated every alert ever raised would be the
ledger this document forbids two sections up, and it would grow without limit for a fact that
stops being interesting at the closing bell. `watchAlertState` returns `changed: false` when
nothing new alerted, and a run that reads it then writes no revision — a revision records that an
aggregate moved, not that a run happened.

### The one key that carries rows, and why it is still not a ledger

`learning/paper-cohorts` is the paper track's home, and it exists because nothing else could be one.
A paper call has no order and no fill, so it is not a Decision and the Decision journal will not hold
it; Aumos publishes no `thesis:write`, so Thesis cannot either. Without this key `signalPaper` scores
whatever a run happens to hand it and the sample never accumulates — which is the second reason the
promotion gate stayed shut.

Its shape is what keeps it inside the rule above:

- `closed` — running sums per cohort and horizon. A matured window folds into these and its row is
  **dropped**, so the key does not grow with history.
- `openWindows` — symbol, setup, rule version and the instant of registration. No prices, no prose,
  no positions, no cash. It is an index of what is being measured; the observations stay in Evidence
  and are re-read each run.

That distinction is the whole of why this is not the hidden portfolio database the section above
forbids. If a field would let you reconstruct the book from this key, it does not belong here.

⚠️ **Write `signalPaper`'s `nextState` verbatim and assemble nothing.** It already is *what was
carried, minus what matured, plus what this run registered* — the merge, the duplicate refusal and
the `signalAt`-after-`asOf` refusal are inside the function. A hand-built value for this key is the
one shape that can silently lose a window, and it did: registration lived only in a sentence and the
track held zero rows across every run.

⚠️ **What it costs, and what it does not.** Private memory is namespaced by manager instance, so
this track is invisible to any other manager on the same book. That is a worse home than a shared
record, and it is the only one the runtime serves. ⚠️ **The lifetime is the instance's, not the
model's** — swapping the model, editing the instance config or updating the package in place all
keep the same row, so a d60 window is worth opening. What ends the track is deleting the manager:
a reinstall is a new instance and starts at zero.

### Retracting a rule this package has refuted

⛔ **`failures/repeated-patterns` is the one key a package upgrade cannot fix by itself.** It is
read on every wake, a row in it is what a run trusts on sight, and it decides how the code gets
called — so a wrong rule filed there survives every version that would have corrected it. This
instance carries one: *"cross-check `run/armed-reviews` against `history.recentDecisions[].armed`
… when they disagree, the journal wins"*, filed `CONFIRMED` / `blocks-every-future-wake`, which is
the **cause** of the duplicate arming it was filed about — the journal cannot win a question it does
not answer.

So the retraction is computed, not remembered. Pass the whole value read from the key to
`refutedMemoryRules` as `patterns`; it matches the package's closed registry of refuted claims
against the rows and returns a `writeAs` row for each. Write those as a new revision **in the same
run**. ⛔ Retract, never delete: this key is append-only, and a rule that merely vanished is
re-derived by the next run that sees the same empty `armed[]`. ⛔ The registry is the package's, and
a run may not add to it — "this durable rule is wrong", decided inside the run that dislikes the
rule, is the mechanism this section exists to stop.

⚠️ **A false durable claim is not only ever a failure pattern** (#160). The second retracted rule is
in `run/theme-radar-last` — *"gaps `expectedUpsidePct` and `fairValueRange` that no granted source
can fill"*, written 2026-09-04. True of an ETF, false of a listed company, and self-sealing either
way: a run that reads it does not attempt the fetch, observes the same empty gaps, and writes it
again. So the key belongs to the rule, and the values of the other keys are passed under `memory`:
`refutedMemoryRules({ patterns, memory: { 'run/theme-radar-last': … } })`. `keysUnread` names any
key the registry has a rule under that this run did not pass; the value there is prose and fields
rather than a row list, and is matched as one value.

## Read

Read with invocation `asOf`. The runtime must return only revisions visible to this exact instance
at that instant. Treat no result as valid merely because it parses. Each value must be a JSON
object containing:

```json
{
  "schemaVersion": 1,
  "updatedAsOf": "an instant no later than invocation asOf",
  "decisionIds": [],
  "evidenceIds": [],
  "sampleCount": 0,
  "independentDateClusterCount": 0,
  "metrics": {},
  "missingFields": [],
  "status": "insufficient"
}
```

Additional key-specific fields are allowed. Reject a future `updatedAsOf`, unsupported
`schemaVersion`, wrong types, unknown status, or untraceable aggregate. Record a diagnostic and
continue as empty for that key. Empty memory on the first run is valid.

## Write

Write only after a meaningful value changed: a new closed sample, calibration metric, repeated
failure, coverage state or radar completion. Reuse the stable key; the gateway appends a revision and
must not overwrite history. Preserve referenced ids, missingness and status. Never store:

- active Thesis/invalidation or raw Evidence body;
- portfolio-wide Brief content;
- order/fill state;
- a gate that must execute — ⚠️ **including the exit discipline's stop and review date.** The
  source kept them in `data/exit_rules.json`; this package has no such file, may not build one
  here, and would be building a per-position table that is both a hidden portfolio database and a
  gate. `exitDiscipline` re-derives them from the entry date every run and returns
  `watchesToRegister` for the entry's own proposal instead;
- copied current filing/news data;
- an automatically adopted rule or threshold;
- an unconfirmed diagnosis of a source or a route.

⚠️ **That last one is why `failures/repeated-patterns` has a boundary at all.** The key holds what
was *observed to repeat*, and a run that files a cause there — *this route is down* — has written a
claim no later run will retest, because a repeated failure is exactly the thing a run trusts on
sight. What confirms such a diagnosis is not this document's to say:
`skills/data-source-contract/SKILL.md` carries the sibling-route test, and until it has been passed
the finding goes in `uncertainty` and nowhere durable.

If a write fails, do not change the Decision to compensate. Report the learning-state persistence
failure in diagnostics/uncertainty and still submit one valid proposal.

## Migration

Public installs begin empty. A private authored instance may import aggregate state once after assets,
briefs, evidence and watches are migrated to their canonical stores. Write
`migration/schema-version`; refuse a second bootstrap when it exists. Never ship bootstrap data.

## Isolation expectations

Another manager instance cannot read this memory, and another manager on the same book can read
shared Brief revisions but not these keys. ⚠️ **A model swap is not another instance** — the row is
keyed by instance alone, so memory written under one model is read back under the next. Deleting
the manager is what ends it. Reads and writes must appear in MCP audit and Evidence. Historical
replay must select the latest revision at or before replay `asOf`, never the current head.
