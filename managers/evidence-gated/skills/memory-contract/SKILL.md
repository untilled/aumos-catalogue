---
name: memory-contract
description: Read and append instance-private learning revisions safely, including empty, malformed and historical-asOf behavior.
---

# Manager memory contract

Private manager memory is a compact, append-only learning index for this package instance/model. It
is not a hidden portfolio database and not a source cache.

## Stable keys

Use only:

- `migration/schema-version`
- `run/theme-radar-last`
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

Do not generate a key per run, asset or date.

## Read

Read with invocation `asOf`. The runtime must return only revisions visible to this exact instance
and model at that instant. Treat no result as valid merely because it parses. Each value must be a
JSON object containing:

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

Another instance/model cannot read this memory. Another manager on the same book can read shared
Brief revisions but not these keys. Reads and writes must appear in MCP audit and Evidence. Historical
replay must select the latest revision at or before replay `asOf`, never the current head.
