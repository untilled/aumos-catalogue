# The discovery-run contract

<sub><a href="discovery-run.ko.md">한국어</a></sub>

`fundamental-mean-reversion`, `catalyst-turnaround` and `shareholder-rerating` each
know what to measure **once a symbol is in front of them**. None of them had a
contract for the step before that — which symbols this run actually looked at, where
the next run resumes, and what «no candidates» means. This document is that contract
(#305). It is one set of field names and one set of status words; the three packages
vendor their own copy of the code behind it and share none.

## Why this exists

⚠️ **Zero candidates and zero reads are the same output and they are opposite facts.**
A run that swept a declared universe and found nothing passing its gate has done its
job. A run that could not enumerate a universe, or spent its budget reviewing holdings,
has done nothing — and both end as a `WAIT` with no new name in it.

This is measured, not hypothetical. `evidence-gated` shipped exactly that failure: a
book woke six times and never proposed a name it found itself
(`run_ba37a8f6907a49c3a805a4ce3ee10ec6`, #140), because `coverage` was answered
`complete: true, uncovered: []` over a denominator made **entirely of the book's own
holdings**. The fix there is the precedent this contract copies wholesale:

- `complete` is `null`, never `false`, when nothing was screened —
  `managers/evidence-gated/lib/coverage.mjs`;
- discovery capacity is counted as **lanes**, and a lane nobody asked about is
  `unstated` rather than `open` — `discoveryCapacity` in the same file;
- the run is never blocked for it (the sell side still has to run), but a *proposal*
  that had zero discovery capacity and does not say so is — `discovery_lane_dark_undisclosed`.

⛔ **Nothing here is a shared library.** `COMMONISATION-SURVEY.md` (#270) settled that:
the genuinely identical overlap between these three is about twelve lines, and
commonising policy through a shared module means one package's answer wins silently.
What is shared is the **vocabulary** — field names, status words, and what each one is
allowed to claim.

## The discovery-run record

Every run of the three writes this, with these names:

```json
{
  "schemaVersion": 1,
  "updatedAtEpochMs": 1772150400000,
  "runId": "run_…",
  "universeDeclared": true,
  "universeSource": "toss:/api/v1/stocks/all",
  "universeCount": 942,
  "symbolsAttempted": 120,
  "symbolsSucceeded": 117,
  "symbolsFailed": ["005930", "068270", "051910"],
  "gatePassed": 9,
  "newCandidates": 2,
  "resumedCandidates": 3,
  "researchCompleted": 1,
  "cursorBefore": { "kind": "symbol-index", "value": "000660", "atEpochMs": 1771891200000 },
  "cursorAfter":  { "kind": "symbol-index", "value": "011070", "atEpochMs": 1772150400000 },
  "priceLaneStatus":  "open",
  "filingLaneStatus": "partial",
  "webLaneStatus":    "unstated",
  "discoveryStatus":  "discovery_incomplete"
}
```

### Lane status: `open`, `partial`, `dark`, `unstated`

Four words, taken from `discoveryCapacity`, and the fourth is the one that matters.

| status | what it claims |
|---|---|
| `open` | the lane was queried and answered for the whole attempted range |
| `partial` | the lane answered for some of the range and failed or ran out on the rest |
| `dark` | the lane was queried and returned nothing usable — no connection, refusal, empty |
| `unstated` | **nobody asked.** Not open, not dark |

⚠️ **`unstated` is not a degenerate `dark` and defaulting it to `open` reproduces #140
exactly.** A lane a run never reached is a question never put, and a run that reports
three `open` lanes it did not query is the run that reports «no candidates» after
reading nothing.

The host already keeps four words for the same shape and they map rather than compete —
`source_cache_read.state ∈ never-fetched | refresh-failed | fresh | stale` and
`source_cache_refresh.state ∈ observed | observed-empty | satisfied | failed`. ⛔ Do not
build a second cache in `manager-memory` to produce a fifth vocabulary.

### `discoveryStatus`, and the only way to say nothing qualified

A closed set of four. The decision table is the contract:

| `discoveryStatus` | required conditions |
|---|---|
| `candidates_produced` | `newCandidates + resumedCandidates > 0` |
| `no_candidate_qualified` | `universeDeclared === true` **and** every lane this strategy requires is `open` **and** `symbolsFailed.length === 0` **and** no candidate was produced |
| `discovery_not_run` | no universe declared, **or** the run's discovery budget was spent on holdings review, **or** every required lane is `dark` / `unstated` |
| `discovery_incomplete` | a universe was declared and some range failed or was never reached — `symbolsFailed` is non-empty, or a required lane is `partial` |

⛔ **`no_candidate_qualified` is the only one of the four that is a claim about the
market.** The other three are claims about the run. Reporting the first when one of the
others holds is the defect this contract exists to refuse.

`discovery_not_run` additionally has to survive the trip into a `DecisionProposal`,
which carries no diagnostics field (the host discards a judgement with an unknown key).
So it travels as a **token**: the string `discovery_not_run` verbatim in one
`rationale.uncertainty` entry, matched as a token and not as a phrase, because the prose
around it is written in the invocation's `language`. That is
`discovery_lane_dark_undisclosed`'s mechanism, reused rather than reinvented.

⚠️ **An undeclared universe is `unevaluated`, never `blocked`.** The book whose universe
is undeclared is exactly the book that still has to be watched on the sell side. Zero
discovery is a report, not a stop.

### The cursor rule

```text
cursorAfter === cursorBefore
  whenever discoveryStatus ∉ { candidates_produced, no_candidate_qualified }
```

And within a run that did advance: **never past a range that failed.** The cursor marks
the last *fully succeeded* range, so the next run re-attempts the failure instead of
stepping over it. A cursor that advanced past a failed page turns a transient vendor
error into a permanently unread slice of the market, silently, once.

### Required lanes, per package

A lane that is `optional` may be `unstated` without changing the status; a lane that is
`required` may not.

| package | price | filing | web | cursor kind | cursor value |
|---|---|---|---|---|---|
| `fundamental-mean-reversion` | required | required | optional | `symbol-index` | the symbol last swept |
| `catalyst-turnaround` | optional | required | required | `dart-receipt` | `rcept_no` |
| `shareholder-rerating` | optional | required | required | `dart-receipt` | `rcept_no` |

## The candidate ledger

One document per package, in that package's own private memory. `strategy` differs;
every other name does not.

```json
{
  "schemaVersion": 1,
  "strategy": "fundamental-mean-reversion",
  "ruleVersion": "fmr-gate-1",
  "updatedAtEpochMs": 1772150400000,
  "cursor": { "kind": "symbol-index", "value": "011070", "atEpochMs": 1772150400000 },
  "failedRanges": [{ "kind": "symbol-index", "from": "005930", "to": "005935", "reasonCode": "lane_query_failed", "firstFailedAtEpochMs": 1771891200000, "attempts": 2 }],
  "candidates": [
    {
      "symbol": "011070",
      "market": "XKRX",
      "state": "researching",
      "discoveredAtEpochMs": 1771891200000,
      "lastSeenAtEpochMs": 1772150400000,
      "discoveryPath": ["price-sweep"],
      "ruleVersion": "fmr-gate-1",
      "hypothesis": "2024년 일회성 손상차손이 영업 훼손으로 오독됐고 3분기 수주잔고가 그것을 반증한다.",
      "sectionsComplete": ["fall-decomposition"],
      "openQuestions": ["개선된 단가가 3분기 매출에 반영된 시점"],
      "evidenceIds": ["ev_…"],
      "nextReviewAtEpochMs": 1772755200000,
      "nextReviewCondition": "3분기 보고서 접수",
      "excludedReasonCode": null,
      "history": [{ "atEpochMs": 1771891200000, "from": null, "to": "discovered", "ruleVersion": "fmr-gate-1" }]
    }
  ]
}
```

```text
discovered → triaged → researching → watching | proposed | excluded
```

⚠️ **A boolean that was never read is `null`, never `false`.** `false` says the run
looked and the answer was no. Same distinction as `complete: null`, one level down.

### Reading a ledger somebody else wrote

Ported from `managers/evidence-gated/lib/research-state.mjs`, including the reason each
row is a degrade rather than a refusal. The split is between *this operation's own
bookkeeping* (degrade) and *correctness* (refuse).

| what was read | answer | why |
|---|---|---|
| `previous === undefined` | **`data_missing`** — no candidate created, none advanced, cursor untouched | Nobody read the key. That is not an empty ledger, and treating it as one seeds a fresh ledger over a real one |
| `previous === null` | **seed** an empty ledger | Read, and genuinely empty. ⛔ The key can therefore never self-lock: a malformed write is always recoverable |
| `schemaVersion` absent | **degrade** to an empty ledger | The pre-contract hand-written blobs have none, and without `candidates` there is nothing to carry wrongly |
| `schemaVersion` present and unknown | **refuse** | A writer this code does not know. Its rows may be shaped in a way this code misreads or silently drops, and dropping history is the failure the file exists to prevent |
| `updatedAtEpochMs > asOf` | **refuse** | A ledger written by a later run can hold only past-dated rows and still leak that run's judgement backwards. It cannot lock the key either — this operation writes `updatedAtEpochMs: asOf` |
| unparseable | **degrade** | Carries less history, never wrong history |
| unknown sibling keys | **reported by name** in `previousExtraKeys`, never carried | The size cap measures `candidates`; carrying arbitrary caller fields is a hole in it *and* in the rule that this key is a roster and not a source cache |

⛔ **`nextLedger` is `null` whenever a blocking diagnostic fires.** A diagnostic beside a
written ledger is a refusal by another name that still wrote.

### Caps

| | cap |
|---|---|
| candidates | ≤ 200 |
| serialised document | ≤ 60 KB |
| `evidenceIds` per candidate | ≤ 8 |
| `hypothesis` | ≤ 280 characters |
| `symbol` | ≤ 32 characters |

A cap that binds is a signal to exclude or to age out, never to widen the cap.

### What must never be written here

`manager-memory` is not a source cache and not an account database. The host says so;
this is the enforceable list, and a hit is the blocking diagnostic
`memory_holds_vendor_payload`.

| forbidden | read it from, every run |
|---|---|
| `open` / `high` / `low` / `close` / `volume`, `bars`, `rows`, any numeric price array | Toss `connection_request` — `/api/v1/candles`, paged by `nextBefore` |
| filing bodies, an `excerpt`, report text | OpenDART via the **host source cache** (`source_cache_read` / `source_cache_refresh`) |
| `quantity`, `weight`, `cash`, `averageCost`, `targetWeight` | `portfolio_get` |
| `pending`, proposals | `portfolio_get` |

⚠️ **What is kept instead is a pointer and a question:** the symbol, the state, the one
sentence of hypothesis, the `evidenceIds` the host issued, and what has to be true at
the next review. Everything that has a source is re-read from that source.

### Four reruns that must not create a second anything

| case | required behaviour |
|---|---|
| **rerun after failure** | `cursor` unchanged unless the range fully succeeded; `failedRanges` retried before anything new; `attempts` incremented; the record only grows |
| **duplicate discovery** | Key is `(market, symbol)`. Updates `lastSeenAtEpochMs`, appends `history`, folds `discoveryPath` into a set. No second row, no second proposal |
| **rule version change** | `candidate.ruleVersion !== ruleVersion` is returned with `requiresReevaluation: true` and the diagnostic `rule_version_changed` naming both versions. ⛔ Never auto-migrated — a gate that changed is a judgement to redo, not a field to rewrite |
| **excluded re-entry** | An explicit transition carrying new `evidenceIds` and a `reentryReason`. Dropping `excluded` silently is `candidate_state_regressed`, blocked |

`evidenceIds` are monotonic — a candidate cannot lose one — and `history` only appends.

## The host underneath

Measured 2026-09-12 against the running host, not assumed. Where the host cannot do
something, this contract says so rather than pretending.

### `manager-memory` is six file tools and a hash

The legacy `memory_read` / `memory_write` are gone. What exists:

```text
manager-memory:read   files_list, files_read
manager-memory:write  files_mkdir, files_move, files_remove, files_write
```

Paths are relative, `/`-separated, and the root is per **manager instance**; this
contract writes `state/<key>.json`. There is no versioning: concurrency is
`expectedHash` compare-and-swap (sha256 hex, `null` meaning «nothing was there»), a
mismatch is `revision-conflict`, and a concurrent writer is `file-lease-held` — retry.

⛔ **There is no multi-file atomic write**, which decides the document shape: the
cursor lives **inside** the ledger document, not beside it. Two files would mean a run
that crashed between two writes leaves a cursor that claims a sweep the candidate list
does not contain.

⚠️ **Instants are epoch-ms numbers with an `…EpochMs` suffix, and this is not a taste.**
The gateway scans answers for timestamps after `asOf` and refuses **the whole read** on
a hit. A string instant in a stored document is a document that can make itself
unreadable; a number is compared by this code, against `asOf`, deliberately.

### Web reading → `observation_file` → `evidenceId`

Web is not a source of record and never closes a case on its own. The round trip is:

```text
read the source  →  observation_file { url, title, excerpt, publishedAt?, reading?, subject?, asOf }
                 →  evidenceId  →  candidate.evidenceIds[]  →  DecisionProposal.evidenceIds[]
```

`excerpt` is the source's own words, verbatim, ≤ 64000 characters — over the cap is a
refusal, not a truncation — and `reading` (≤ 2000) is where the manager's own
interpretation goes, labelled as such. `publishedAt` after `asOf` is a
`post-as-of-timestamp` refusal. A search-result title or snippet is not an excerpt and
never makes a candidate.

⚠️ **Evidence filed in run N is citable in run N+1, not in run N.** Evidence filed
during a run that has not ended is not committed to the Kernel until the run finishes
(JSONL replay). So the ledger carries the `evidenceId` across the run boundary and the
proposal that cites it is the *next* run's — which is the reason `evidenceIds` on a
candidate is a carried field and not a within-run local.

## Run order and budget

Every scheduled run, in this order:

1. `invocation_read`, `portfolio_get`, held theses, own candidate ledger.
2. Held positions and watches whose review is due.
3. The previous run's unfinished research and `failedRanges`.
4. Incremental collection past the last succeeded cursor.
5. The declared universe through this strategy's own gate → shortlist.
6. A bounded number of candidates researched **to completion**; the rest stored with
   their next question and review condition.
7. Ledger and cursor written so that a rerun is safe.

Initial operating values, to be narrowed by setting once run cost is measured: **at most
3 basic researches per strategy per run, at least 1 carried to completion.**

⛔ **Reading many names shallowly and stopping is forbidden.** It is the behaviour that
looks productive in a log and produces no judgement, and it is the reason the floor is
stated as a completed count rather than as a total.

⚠️ **If holdings review consumed the discovery budget, the answer is
`discovery_not_run`.** Not «no new candidates». The run did not look.

## What this contract does not decide

⛔ Everything below is each package's own, per #256, and a cross-package assertion over
any of it is commonisation of policy through the back door:

- **ranking** — what order a shortlist is in. (FMR's is explicitly *not* drawdown depth.)
- **thresholds** — gate levels, staleness windows, execution-pace floors.
- **sizing** — three different formulas, and no weight is ever compared to another
  package's.
- **exit logic, staged plans, re-arming** — three different sources of truth.
- **severity words and diagnostic codes** — each package's own vocabulary. The three do
  not spell their severities the same way and are not being made to.

## Host gaps

Dependencies, listed so that nothing below is faked in a package:

| | gap | what is **not** done about it |
|---|---|---|
| H-1 | No point-in-time XKRX universe. `/api/v1/stocks/all` is the only whole-market route and its accepted filter values are unmeasured; the list is today's, so it carries survivorship | No invented universe file, no LLM-recalled ticker list. `universeDeclared: false` is written and the run reports `discovery_not_run` |
| H-2 | ≥300 completed bars. `market_bars` caps at 250; `prices/daily` holds ~270 sessions for 400 calendar days. Only manager-paged `connection_request /api/v1/candles` reaches 300, via `nextBefore`, always passing `adjusted` explicitly | No padding a short series, no mixing two adjustment bases |
| H-3 | Whether the source-cache grant reaches these three packages is unverified | No second cache in `manager-memory` as a workaround |
| H-4 | The observation → `evidenceId` round trip spans two runs | No same-run citation of evidence the Kernel has not committed |
| H-5 | `start-run` has no symbol subject; a manual run is always `PORTFOLIO_REVIEW` | No pretended `ASSET_REVIEW`. The only handle on a subject is the mandate's free text |
| H-6 | No atomic multi-file write | Single-document ledger, cursor inside it |
| H-7 | Adjustment basis, halt state, corporate actions, turnover and the calendar shape are unmeasured. Candles carry share volume only; corporate actions are absent | FMR refuses on `adjustment_basis_undeclared` rather than assuming a basis. Turnover is not derived from volume × price |
| H-8 | Two managers in one fund can discover the same name | Nothing here deduplicates across managers. That boundary is #268, and the same symbol under three strategies is three different hypotheses |

## Where it is enforced

| check | what it holds |
|---|---|
| `npm run check:fundamental-mean-reversion` | FMR's discovery record, ledger and fixtures |
| `npm run check:catalyst-turnaround` | CT's, plus the catalyst-register foreign key |
| `npm run check:shareholder-rerating` | SR's, plus the return-programme link |
| `npm run check:discovery-contract` → `tools/verify-discovery-contract.mjs` | the field names and status words **across** the three: that all three spell the record identically, that the closed `discoveryStatus` set is closed, and that no ledger fixture holds a forbidden payload |
| `npm run check:docs` | that this page and its translation have the same section structure |

⚠️ **`tools/shared-scenarios/` cannot hold any of this.** That suite asserts behaviour
and deliberately asserts **no field names** — which is exactly what this contract is. The
two are complementary and the boundary between them is stated in both directions.
