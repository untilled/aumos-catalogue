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
- `learning/paper-cohorts`

Do not generate a key per run, asset or date.

### The key that stands in for a read path

`run/armed-reviews` holds the flow and instant of the three market reviews this instance last
armed. ⚠️ **It exists because a manager can arm a WATCH and cannot read one back** — the grant map
publishes no watch or plan capability at all, not even a declared-but-empty one. WATCHes leave in a
`DecisionProposal` and there is no return path.

Since #87 that costs more than it did: every wake dispatches one flow, so two `kr-sleeve` reviews
armed half an hour apart each run the Korean sleeve and each seal a judgement — two rows on the
same book, on the same day, neither saying which one read the close.

Three rows, replaced every run rather than appended to, so the key does not grow.

⛔ **A bridge, not the fix.** Private memory is scoped to this instance, so a new instance starts
blind and this record can drift from the WATCHes Aumos actually holds. Two copies of one fact
diverge. The fix is a read path and it is not this package's to publish. (#97)

### The key that lasts one session

`run/watch-alerts` is what stops the same WATCH from waking somebody four times as a price
wobbles across its level. It holds `sessionDate` and the `sessionKey`s that already alerted in
**that** session, and when the date changes the list is replaced rather than appended to.

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
- a gate that must execute;
- copied current filing/news data;
- an automatically adopted rule or threshold.

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
