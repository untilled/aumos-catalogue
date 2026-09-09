---
name: memory-contract
description: Read and write the instance-private learning record as files, including empty, malformed and historical-asOf behavior.
---

# Manager memory contract

This manager instance's private record is a compact learning index kept as **files in its own
folder**. It is not a hidden portfolio database and not a source cache.

## What changed, and what did not (`untilled/aumos#743`)

`memory_read` and `memory_write` are gone. The record is a folder now — `files_list`, `files_read`,
`files_write`, `files_mkdir`, `files_move`, `files_remove` — and `brief_read`/`brief_write` became
the book's shared folder under the `fund_files_*` six.

⚠️ **The keys did not change; they became paths.** Every stable key below is that key with `state/`
in front and `.json` behind, so a run reads and writes the same seventeen records it always did.
⛔ **The bounds did not change either** — what may be stored, what may not, the 200-row and 60 KB
ceilings, the isolation, the ownership split in `PROMPT.md` invariant 4. A folder is a bigger address
space and not a bigger licence, and a record that would have been refused as a key is refused as a
path.

⚠️ **Three properties the runtime used to keep are now this package's to keep, and each is named
where it bites:**

| property | who kept it | how it is kept now |
|---|---|---|
| a write appends a revision, history survives | the runtime | a **dated file beside** the stable path, written only where history is the point (§Write) |
| a read is a revision visible at `asOf` | the runtime | ⛔ nothing. A read answers the file as it is **now**; the value's own `updatedAsOf` is the only point-in-time signal (§Read) |
| two writers cannot silently overwrite | the runtime | `expectedHash` on every write (§Write) |

⛔ **The lifetime is unchanged and is still the instance's** — the folder outlives the model, the
CLI vendor, an in-place package update and a config change, no other manager including a second
install of this package can read it, and deleting the manager is what ends it.

## Stable paths

Use only:

- `state/migration/schema-version.json`
- `state/run/theme-radar-last.json`
- `state/run/watch-alerts.json`
- `state/run/armed-reviews.json`
- `state/learning/evidence-maturity.json`
- `state/learning/closed-decision-summary.json`
- `state/calibration/mean-reversion.json`
- `state/calibration/trend-pullback.json`
- `state/calibration/quality-pullback.json`
- `state/calibration/inflection.json`
- `state/calibration/post-event-continuation.json`
- `state/calibration/core-dca.json`
- `state/failures/repeated-patterns.json`
- `state/coverage/universe-state.json`
- `state/coverage/research-index.json`
- `state/research/catalyst-window.json`
- `state/research/evidence-carry.json`
- `state/learning/paper-cohorts.json`

Do not generate a path per run, asset or date — with the one exception §Write names, which is a
dated **sibling** and never a dated stable path.

⚠️ **`files_list` over `state/` with `recursive: true` is one call and answers what is actually
there**, with each file's size and hash. Read it first: it is how a first run learns the folder is
empty without seventeen separate refusals, and it is where the `hash` each write needs comes from.

⛔ **The other two folders are not this record.** `scans/` holds the recipe answers the host writes
and is read, never hand-written; `proposals/` holds what this run assembled. Neither is a learning
key and neither is read as one.

⚠️ **Below, a record is named by its bare key** — `run/armed-reviews`, `coverage/research-index` —
because what those sections are about is the record and not its address. The address is always that
key under `state/` with `.json` behind it.

`state/coverage/research-index.json` is a bounded exception for a research roster, not source
caching.
Use `researchState({previous, observations})` and persist only a non-null `nextState`.

⚠️ **The canonical shape of this key is `{schemaVersion: 1, updatedAsOf, rows[]}` — what
`nextState` is.** Persist that object; hand it straight back as `previous` on the next run. Each
row is `{symbol, market, observedAt, evidenceIds[], sector, extension}`, and an `observations[]`
row you hand in requires **four** of those: `symbol`, `market`, `observedAt` (not after `asOf`)
and a **non-empty** `evidenceIds`. A row missing one is `research_observation_invalid` / blocked;
`inputContracts.nested.researchState` publishes the row.

Extra descriptive fields **may** sit beside `rows` — earlier runs wrote `extensions`,
`universeProvenance`, `usMapping` and friends there — and are permitted, not refused. They are
**ignored**: `researchState` reports their names in `previousExtraKeys` and does not carry them
into `nextState`, so a run that wants them re-writes them itself beside the roster. ⚠️ **A stored
value with no `rows` at all reads as an empty index, not as a refusal** (#222) — the answer's
`previousRead` says which reading was taken (`absent` / `rows` / `no-rows`). ⛔ Two things are
still refused, and both are about correctness rather than shape: a `schemaVersion` that is present
and is not `1` (an unknown writer, whose rows this package may misread), and an `updatedAsOf` that
parses and is **after** `asOf` (an index written by a later run — the per-row date check cannot see
that). Neither can lock the key: `previous: null` always re-seeds it.
It carries at most 200 symbol/market rows with observation dates, up to eight Evidence ids,
sector and an extension flag; no prices, filings, portfolio weights or source bodies.
`researchUniverse` reads the bundled 74-name KR / 83-name US seed and validated extensions.
Refetch filing data from installed sources each run until the host provides queryable source
storage; an Evidence id is a reference, not a promise that its payload can be read back.
Capacity failure preserves the prior revision and requires explicit roster review.

⚠️ **A name the mechanical sweep could not review goes here, and nowhere new.** When an answer file
reports `sourced: false`, or `task_get` reports the item `failed`, or a delegation refusal cut the
turn short, persist the roster you *did* review with `researchState`, name the rest **with the
reason** — `unprepared`, `failed` with its `kind`, or the refusal code verbatim — in one
`uncertainty` entry, and arm the revisit condition as a WATCH/plan the way
`skills/candidate-research/SKILL.md` already requires for a conditionally rejected candidate.
⛔ **Do not add a key for it and do not widen a row.** `researchState` builds each row from a fixed
set of fields and drops anything else, so a reason written onto a row is a reason that is silently
lost; the reason belongs where a reader sees it, and the revisit belongs where the scheduler can
fire it. ⛔ And an `unprepared` name is never written down as a name that was reviewed and declined.

`research/catalyst-window` is the second bounded exception, and it exists because the axis it
carries had no producer at all (#169). `radarCandidates` takes `catalysts` and `events`,
`upsideRadar` reads a window open inside 60 days and an event announced inside 30, and nothing in
this package ever built either — so `inflection` and `post-event-continuation`, the two lenses that
do not require a price fall, excluded every candidate for want of an input and reported it as a
finding about the company. Use `catalystRegister({previous, catalysts, estimated, events, roster})` and persist
only a non-null `nextState`. It carries at most 200 rows of symbol, market, an event label, the
window, the observation date and up to eight Evidence ids — no prices, no filing numbers, no
positions.

⚠️ **Its instants are numbers, for the same reason `run/armed-reviews`' are — and the reason has
changed shape.** A catalyst window ends after `asOf` by construction, and `memory_read` refused a
payload carrying a **string** timestamp later than `asOf`, so the better this key was filled the more
certainly it was refused. ⚠️ **That guard does not reach a file**: `files_read` hands back the
document as one opaque string and the outgoing scan is anchored, so a whole JSON body is not a
timestamp and nothing in it is walked. The encoding stays anyway, and the reason is now this
package's own rather than an accommodation: `windowStartEpochMs`, `windowEndEpochMs` and
`observedAtEpochMs` are what the operation writes, every reader in this package reads them, and
re-encoding a stored record to celebrate a lifted restriction is a migration with no benefit and a
readable-history cost. `catalystRegister` reads either that or the RFC 3339 rows a caller hands it,
and the map it returns to `radarCandidates` is RFC 3339 because that is what `Date.parse` is given
there. Write `nextState` verbatim and do not re-encode it.

`research/evidence-carry` is the third bounded exception, and it exists because the host cannot
answer for this run what it will answer for the next one. Evidence issued during a run is uncommitted
and uncitable until that run ends (`untilled/aumos#727`, `#453`), so a receipt this run paid for —
an `observation_file` consensus reading above all — is citable only from the next wake. This key is
what survives the gap: `{ schemaVersion: 1, updatedAsOf, rows: [{ evidenceId, contentHash, url,
publishedAt, subject, issuedAsOf }] }`, written in §6 before submitting and read in §1 beside
everything else. ⛔ **It is a list of references and never a cache of what they said** — no excerpt,
no payload, no prices — which is the same line `research/catalyst-window` is held to, and it is
bounded by what one run can be issued rather than by a ceiling. ⚠️ Confirm a carried id with
`evidence_get` before citing it: a run that died before it ended committed nothing, and its rows name
ids that will be refused again.

⛔ **Event records are not persisted, and that is this contract rather than an omission.** `sue`,
`day1ExcessPct` and `preAnnouncementClose` are numbers copied off a vendor's answer, which the Write
section below forbids in as many words. They are re-read from the corporate-actions route every run;
what persists is the calendar. A window that has closed leaves the register on the next run and is
reported as `catalyst_window_closed` — score whether the catalyst happened before dropping the name.

⚠️ **A carried row states whether its date was read or derived** (#228). `dateSource` is
`observed` or `estimated_from_filing_cadence`, and an estimated row carries the `cadenceBasis` it was
derived from beside it; both are part of the revision and are persisted verbatim like everything else
here. ⛔ A row written before #228 carries no `dateSource` and is read as observed, which is what it
was. ⛔ **A derived window does not enter the researched count** — `coverage.researched` and
`coverage.derived` are separate, so filling the axis from the cache does not retire
`catalyst_window_unresearched`, and a confirmed window under a key is never replaced by an estimate
however fresh the estimate is.

For `run/armed-reviews`, `reconcileArmedReviews` persists what **this instance proposed** and whose
instant has not passed. ⛔ It is not verified against `decisions[].armed` and cannot be: that field
is past tense, and a review that armed cleanly and one that was never armed produce the same empty
array (#156, aumos#687). Never hand-write epoch values. ⛔ A count taken from this key is never
published as a count of standing reviews, and never as zero. ⚠️ The reportable count is the
invocation's `standingPlans` (aumos#690) and only that — pass it to the same call as
`standingPlans` and it comes back as `standingArms: { atLeast }`, a floor, *at least this many*
(#201). ⛔ Absent and empty are two facts: handed nothing, the answer is `standingArms: null` with
`standingArmsAreUnreadable: true` and the number appears in uncertainty as **unreadable**; handed
`[]`, the floor is **0** and that zero is an answer.
The earlier #136 dedupe diagnosis was refuted in #148; the #148 journal cross-check was refuted in
turn by #156.

⛔ **Three parameter names, and each wrong one is refused rather than ignored** (moved here from
`PROMPT.md` §4). The stored value goes in as `previous` and the invocation's field goes in as
`standingPlans`: passing the arms at the top level as `armed` reads as `previous: null` and is refused
with `armed_state_misplaced`, so the record is lost rather than carried; passing `journalArmed` builds
a receipt out of a field that answers a different question and is refused with
`armed_journal_not_a_receipt`. A state written back smaller than the promises it was built from is
`armed_state_lost`, and a blocked calculation has no writable `nextState` at all.
`review_already_armed` names a same-instant repeat: arm it anyway and report it.

### The key that stands in for a read path

`run/armed-reviews` holds the flow and instant of the three market reviews this instance last
armed. ⚠️ **It exists because a manager can arm a WATCH and cannot read one back** — the grant map
publishes no watch or plan capability at all, not even a declared-but-empty one. WATCHes leave in a
`DecisionProposal` and no tool returns them. ⚠️ The host does publish a **field** — the
invocation's `standingPlans`, what stood at `asOf` (aumos#690) — and it is a floor, not a ceiling,
so it changes what may be reported and never what is armed. ⚠️ It reaches `reconcileArmedReviews`
as a **report-only** parameter (#201): it produces `standingArms` and touches neither `toArm` nor
the state written back.

Since #87 that costs more than it did: every wake dispatches one flow, so two `kr-sleeve` reviews
armed half an hour apart each run the Korean sleeve and each seal a judgement — two rows on the
same book, on the same day, neither saying which one read the close.

Three rows, and the state written back is **first person**: every review this instance has promised
whose instant has not passed. ⛔ Not "what is standing" — this key cannot answer that, and writing
it as though it did is what #156 measured; the field that does answer it is on the invocation and is
read there, not mirrored into memory. ⛔ Not a copy of this run's sequence either: a run with
nothing to arm would then write an empty list over three live promises, and the next run re-arms all
three. A row leaves when its instant passes, and only then.

⛔ **This key no longer suppresses a re-arm, and it never should have.** ⚠️ Neither does
`standingPlans`: a floor establishes what stood, never that what is missing is gone, and the field's
published description says so itself. Every judgement re-arms its reviews and the host folds twice:
an identical **promise** at arming time (aumos#704 — `kind`, `subject`, `intent`, `trigger`, with
`expiresAt` excluded; the older row retires as `rearmed`) and an identical **instant** per instance
at firing time (aumos#593, aumos#624). So a duplicate re-arm costs neither a plan row nor a second
wake — ⬜ on a host carrying that fold, which landed after aumos `v0.3.32`. What the record still answers, and nothing else can, is whether this instance
already promised the same flow at a **different** instant — two wakes, two judgements on one book on
one day (#87) — which is `review_superseded`, the only duplicate left standing and the one that now
carries the orphan's `planId` where `standingPlans` names it, and says which silence it is where it
does not. A row can be stale in exactly one direction: the
promise behind it may already have fired, lapsed or been replaced without this instance seeing it.
That is why it decides nothing on its own.

### The encoding, and why the instant is a number

```json
{ "schemaVersion": 2, "updatedAsOf": "…", "armed": [{ "flow": "kr-sleeve", "atEpochMs": 1788735600000 }] }
```

⚠️ **`atEpochMs`, not RFC 3339, and this is the canonical shape.** `memory_read` refused a result
carrying any **string** timestamp later than `asOf` — `post-as-of-timestamp` — and this key holds
future instants by construction, so the better it was filled the more certainly it was refused.
Measured on `run_3a48eaaa505241d5af94fb490d7c23c6`: three armed rows, three violations, the read
refused; and because the refusal was per read rather than per key, the run's first keyless
`memory_read` died with it and twelve keys had to be fetched one at a time. Only an empty key came
back cleanly.

⚠️ **`untilled/aumos#743` ended that, and by moving the record rather than by relaxing the rule.**
`files_read` answers the document as one opaque string; the outgoing scan is anchored, so a JSON body
is not a timestamp and its leaves are never walked. The refusal this encoding was built against
cannot fire on a file — which also means the keyless-read collapse cannot recur, because a folder is
listed and read by path rather than fetched as one payload of every key at once.

⛔ **The encoding stays, and it is this package's canon now rather than an accommodation.** The
meaning was always identical, every reader in this package reads it, and rewriting seventeen stored
records to celebrate a lifted restriction buys nothing and risks a history no reader can parse.
`reconcileArmedReviews` writes this shape and reads either it or the RFC 3339 rows an earlier version
wrote.

⚠️ **`toArm` keeps RFC 3339.** It leaves in a `DecisionProposal`, where AMP takes strings and this
guard does not run. Only what is written back to memory changes shape.

⛔ **A bridge, not the fix.** Private memory is scoped to this instance, so a new instance starts
blind and this record can drift from the WATCHes Aumos actually holds. Two copies of one fact
diverge. The fix is a read path and it is not this package's to publish. (#97)

### The key that lasts one session

`run/watch-alerts` is what stops the same WATCH from waking somebody four times as a price
wobbles across its level. It holds a `session` label and the `sessionKey`s that already alerted in
**that** session, and when the session rolls the list is replaced rather than appended to.

⚠️ **The label is `session-YYYY-MM-DD`, and the prefix was load-bearing.** The field held a bare
date until 0.4.18, and a bare date was a timestamp to the host: the pattern `memory_read` matched
deliberately included the date-only form, because SEC's `filed` is written that way and *"some time
on the 5th"* can be later than an `asOf` earlier in the 5th — so a date-only value was compared
against the **end** of the day it named. Every session date this manager writes is on or after
`asOf`'s UTC date, so all three flows were refused, and the key survived only by never having been
written. ⚠️ **That guard no longer reaches this record** (`untilled/aumos#743`, above), and the prefix
stays for the reason the epoch encoding does: it costs nothing, every reader here expects it, and it
still says *which session* rather than *which instant*. ⛔ Not epoch milliseconds: a number would
claim a moment this field does not have. `sessionKey` already had this shape.

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

⛔ **And verbatim means unwrapped — this key carries no envelope.** `nextState` is the published
members and nothing else, so whatever was read, the value written back is unwrapped and the next run
reads exactly what `signalPaper`'s `state` takes. ⚠️ **Wrapped on the way in is fine, and it says
so.** Where an older revision was stored inside the envelope the run skeleton asks of a memory
value, pass it as it was read: those fields are carried without being read and each is named back as
`input_state_envelope_ignored` / `info`, which keeps «this record never had that field» and «this
operation ignored it» apart. The accepted members are published as
`inputContracts.nested.signalPaper`. ⚠️ It is the **same** reading as `run/armed-reviews`, whose
`previous` also takes the stored record whole — one sentence covers both keys, which is what the
asymmetry cost until 0.4.49. ⛔ Ignoring stops at the envelope: any other unrecognised field is
still refused by name, `blocked`, *retain the previous record*, because outside the envelope an
unknown key reads as a misspelled member and a misspelled `openWindows` is a track this operation
cannot see.

⛔ **And the two places the run skeleton can put this key's inputs in the wrong slot are refused by
name rather than read as an empty track** (moved here from `PROMPT.md` §5, which now points at this
section). A top-level `openWindows` instead of `state.openWindows` arrives under a key `signalPaper`
does not read — the track looks empty and the `nextState` it returns then deletes it — and that shape
answers `paper_state_misplaced`. And one row of `rows` is **one carried window, not one bar**:
`{ symbol, signalAt, setup, ruleVersion }` copied from that window plus `bars` and `benchmarkBars`
whose rows are `{ timestamp, close }` — ⛔ `timestamp`, not the `date` that `indicators` and
`trendState` also accept, because bars written under `date` come back `forward_base_missing`, which
reads as a window the calendar has not reached. Empty is valid on a first run; an empty answer from a
key that was **not** empty is the failure this names.

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

`files_list` over `state/` first, then `files_read` for each path you need — and carry the `hash` each
listing gives you, because it is what a later write compares against.

⛔ **A read is NOT pinned, and this is the one property the move gave away.** `memory_read` returned
the latest revision at or before `asOf`; a file has no revisions, so `files_read` answers the bytes
that are on disk now. The tool's own description says so. So the point-in-time check that the runtime
used to make is **yours**, and it is the check this section already described: a value whose
`updatedAsOf` is after invocation `asOf` is skipped and diagnosed, exactly as a future revision always
was. ⚠️ In practice only one writer per instance exists — you — so the value later than `asOf` is one
a later run wrote, and reading it would be reading your own future. Treat no result as valid merely
because it parses. Each value must be a JSON object containing:

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
continue as empty for that path. ⚠️ **`no-such-file` is that same empty**, not a failure: an absent
file is an empty learning state and a first run has seventeen of them.

## Write

Write only after a meaningful value changed: a new closed sample, calibration metric, repeated
failure, coverage state or radar completion. Reuse the stable path. Preserve referenced ids,
missingness and status.

⚠️ **Pass `expectedHash` on every write** — the `hash` you read for that path, or `null` where you
read nothing there. It is what the appended revision used to give for free: a write over bytes that
moved since you read them is refused `revision-conflict`, and the answer is to read what is actually
there and decide again. ⛔ Never retry the same bytes over a conflict; that is the overwrite the
check exists to stop.

⚠️ **History is now a decision, and it is made per record.** `memory_write` appended a revision and
nothing could be lost. A file is replaced. So where the predecessor has to stay readable — a
calibration series whose trend is the point, a coverage roster a later run must be able to diff —
write a **dated sibling** first (`state/calibration/mean-reversion.2026-09-08.json`) and then the
stable path. ⛔ Do not date the stable path itself: every reader in this package names it, and a
folder of dated files with no current one is a record nothing can read.
⛔ **Do not write a dated sibling for every record on every run.** Most of these paths are a current
aggregate whose predecessor nothing reads — `run/watch-alerts` is replaced when the session rolls by
design — and a folder that grew a file per run per key would be the ledger three sections up forbids.

Never store:

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
`state/migration/schema-version.json`; refuse a second bootstrap when it exists. Never ship bootstrap
data.

⚠️ **This package does not migrate its own pre-`#743` records and must not try.** Those rows are the
host's to move — Aumos exports what `memory_write` and `brief_write` stored into these folders as a
one-time step — and a package that also copied them would be a second writer racing the first over
paths it does not own. ⛔ So an empty `state/` is read as an empty learning state and never as a
failed migration: it is the correct reading on a fresh install, and on an existing one the records
arrive under the same names without this package doing anything.

## Isolation expectations

Another manager instance cannot read this folder, and another manager on the same book can read the
shared `book/` folder but not these paths. ⚠️ **A model swap is not another instance** — the folder is
keyed by instance alone, so what was written under one model is read back under the next; so are a
CLI vendor change, an in-place package update and a config change. Deleting the manager is what ends
it, and a reinstall is a new instance that starts blind. Reads and writes appear in MCP audit and
Evidence.

⛔ **Historical replay cannot read this folder as it was.** A working folder is the latest state and
has no history to select from, and the host says so rather than pretending: what a past replay can
read is a snapshot frozen for that run, and where there is none the answer is *not supported*. ⚠️ That
is a real loss against `memory_read`, which selected the latest revision at or before replay `asOf`.
It is why a record whose past matters is written as a dated sibling above — those files are the only
history that survives, and they survive because they are addressed rather than versioned.
