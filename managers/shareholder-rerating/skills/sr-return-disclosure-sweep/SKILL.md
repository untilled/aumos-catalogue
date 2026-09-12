---
name: sr-return-disclosure-sweep
description: Collecting Korean shareholder-return disclosures incrementally — 배당, 자기주식 취득 결정·결과보고서, 소각 결정 and 기업가치 제고 계획 — through the host source cache, joining announcement to execution, filing the issuer's own IR statement as an observation, and writing the roster back under compare-and-swap. Load at the start of any run that is looking for candidates rather than reviewing what is already held.
---

# The sweep is the entrance, and it is incremental or it is the same hundred filings

This desk does not start from a list of names it already knows. It starts from what companies
**filed** since the last successful run: a dividend resolution, a decision to buy treasury stock,
the report saying how much was actually bought, a decision to retire it, and the value-up plan that
claims all of it is policy.

⚠️ **The sweep is the only part of this package that can fail halfway and still look successful.**
A vendor that answered for eight filers and refused for two, read by a run that recorded neither,
produces a confident «nothing qualified» over a market it did not see. So every rule below is about
telling *read* from *not read*.

## Read the store before you read the vendor

⛔ **Do not build a second cache in your own folder.** Aumos already keeps OpenDART per filer, and
the private-memory contract forbids duplicating it. The route is
`source_cache_read` → `source_cache_refresh` → `source_cache_read`, and the field you branch on is
**`state`** — not `status`:

| `state` from `source_cache_read` | what it is | ⚠️ what it is **not** |
|---|---|---|
| `never-fetched` | nobody has ever asked for this filer | not an empty answer — this run is blind on that name |
| `refresh-failed` | the attempt did not reach the vendor; `cached` is what is still on hand | not an empty cache — what is there is behind |
| `stale` | the last success is outside the `freshFor` this call stated | not unusable; refresh, then read |
| `fresh` | the last success is inside it | ⛔ `fresh` with no documents is **the vendor having nothing**, and that is an answer |

`freshFor` is **required and has no default**, deliberately: a default would be the host setting
this methodology's deadline. For this sweep, a business day is the honest number — the disclosures
it reads arrive on a daily cadence and are final when they arrive.

`source_cache_refresh` answers `observed`, `observed-empty`, `satisfied` or `failed`. Map them onto
this run's `filingLaneStatus` and do not invent a fifth word:

| what happened across the filers you attempted | `filingLaneStatus` |
|---|---|
| every filer answered (`observed` / `observed-empty` / `satisfied`) | `open` |
| some answered and some `failed` | `partial` — and every failed filer goes into `symbolsFailed` and `failedRanges` |
| every filer `failed`, or the grant is absent | `dark` |
| you did not attempt the lane at all | `unstated` |

⚠️ **OpenDART status `013` is «no data», not an error.** It comes back as `observed` with zero
documents, and that is the vendor answering. A different non-`000` status is `failed` and carries
the vendor's own message — record which, because one of them means «this company filed nothing
this quarter» and the other means «this desk did not look».

⚠️ **A miss in one tool's list is not a route failure.** If a path is not in `source_cache_read`'s
allowed list, look in `source_request`'s and in `connection_request`'s before concluding the route
is gone. There is no failed call to interpret, so nothing goes into `failedRanges` for it and
nothing is written to the roster about it — a run that files a sibling-route miss as a lane failure
hands every later run a rule that reproduces the same wrong answer.

## The two documents, and the join between them

```text
open-dart/corp-codes   vendorId = the stock code (e.g. 005930), documentKey corpcode:<corp_code>
open-dart/filings      vendorId = corp_code;  /api/list.json index: rcept_no, rcept_dt, report_nm
```

⛔ **Join through `corp-codes` first.** The filings document is keyed by `corp_code` and the market
speaks in stock codes; skipping the join means sweeping whoever happens to share a prefix.

⛔ **The filings index carries no type filter and no `since` cursor.** The request is fixed —
`bgn_de` = `asOf` − 5 years, `end_de` = `asOf`, sorted by date descending, 100 per page — so:

1. **You classify `report_nm` yourself.** Nothing upstream does it.
2. **Incrementality is yours too.** You hold the last `rcept_no` you fully processed and you stop
   when you reach it. That is why this package's cursor kind is `dart-receipt`.
3. ⛔ **A range you could not process leaves the sweep `discovery_incomplete`, even if a name came
   out of the part you did read.** The precedence is `discovery_not_run` > `discovery_incomplete` >
   `candidates_produced` > `no_candidate_qualified`, so the candidate is still counted and still
   written to the ledger, and the cursor stays on the last `rcept_no` you fully processed — the
   unread range is re-attempted rather than stepped over.

`rcept_no` begins with the receipt date and `rcept_dt` repeats it, which makes the receipt number
both the identity and the ordering. A business year is **not** a disclosure date.

### Classifying `report_nm`

| the string carries | what it is | where it goes |
|---|---|---|
| 자기주식 취득 결정 / 자기주식취득 신탁계약 체결 결정 | an **announcement** | `announcements[]` — opens a programme |
| 자기주식 취득 결과보고서 / 신탁계약 해지 결과 | an **execution** | `executions[].executedAmount` |
| 자기주식 소각 결정 | a **retirement** | `executions[].retiredAmount` — ⛔ never folded into `executedAmount` |
| 자기주식 취득 결정 **철회** / 취득 금액 감액 | a **cancellation** | `cancellations[].cancelledAmount` |
| 현금·현물배당 결정 | a dividend decision | the payout leg, not the buyback programme |
| 기업가치 제고 계획 (공정공시) | the **policy** | the ratio-or-amount promise behind the programmes |

⚠️ **A trust-account buyback is a mandate to a broker, not a purchase.** The signed contract is the
announcement; the acquisition report is the execution. A run that counts the contract as execution
has counted an intention.

### The announcement ↔ execution key

```text
programmeId = the rcept_no of the 취득 결정 that opened the programme
key         = (symbol, programmeId)
```

Every execution, retirement and cancellation receipt is joined to the decision it descends from by
that pair, and `returnProgramme` refuses any other route. Korean result reports name the decision
they report on; where a receipt does not, the resolution date and amount in the report body are what
identify it, and if neither does, the receipt is an **orphan**.

⛔ **An orphan is a cursor instruction, not a programme.** `execution_without_announcement` means the
sweep started after the decision. Walk the cursor back past that `rcept_no` and read the 결정 공시;
do **not** create a programme around the receipt, because its announced amount and its window would
both be invented and every pace computed afterwards would be against a schedule nobody published.

## The web half: the policy in the issuer's own words

The 기업가치 제고 계획 is filed, but the *policy* — the board's stated total-return ratio, the
three-year plan, the target — usually lives in IR material that is not a filing. That is the web
lane, and it is **required** for this package.

⛔ **A search-result title or snippet never makes a candidate.** File the document through
`observation_file` and carry back what it returns:

```text
observation_file { url, title, excerpt, publishedAt?, reading?, subject?, asOf }  →  evidenceId
```

- `url` — the document. A result list or a homepage is refused: its content changes with the query
  or with the day, so an auditor cannot go back to it.
- `excerpt` — the source's **own words, verbatim**, ≤ 64,000 characters. ⛔ Over the cap is a
  refusal and **not** a truncation: a hash over a fragment filed as a whole document leaves an
  auditor unable to tell a trimmed row from a fabricated one.
- `reading` — ≤ 2,000 characters, and it is where *your* interpretation goes, labelled as yours.
- `publishedAt` after `asOf` is a `post-as-of-timestamp` refusal.

Record it as `{ url, publisher, publishedAtEpochMs, observedAtEpochMs, claim, sourceType, evidenceId }`
with `sourceType` one of `filing`, `company-announcement`, `press`, `manager-interpretation`.

⚠️ **Evidence filed in run N is citable in run N+1.** A run that has not ended has not committed its
evidence to the Kernel, so the id goes onto the candidate's `evidenceIds` and the proposal that
cites it is the *next* run's. That is a host property and not something to work around.

## Writing it back

One document, `state/candidates/shareholder-rerating.json`, with the cursor **inside** it.

```text
files_list state/ recursive:true   →  the path, its size and its hash
files_read  state/candidates/shareholder-rerating.json
files_write state/candidates/shareholder-rerating.json  { content, expectedHash }
```

⛔ **`expectedHash` on every write.** It is a sha256 hex of what you read, and `null` means «nothing
was there». A mismatch is `revision-conflict`: re-read, re-fold, re-write — never force. A
`file-lease-held` is a concurrent writer and is retried.

⛔ **There is no multi-file atomic write**, which is why the cursor is a field of this document and
not a second file. Two files means a crash between two writes leaves a cursor claiming a sweep the
candidate list does not contain, and every later run resumes past names nobody looked at.

⛔ **Instants are epoch-ms numbers with an `…EpochMs` suffix.** The gateway scans a stored answer for
string timestamps later than `asOf` and refuses **the whole read** on a hit, so a string instant is a
document that can make itself unreadable.

⚠️ **`files_read` answers the file as it is now, not as it was at `asOf`.** The only point-in-time
signal is the document's own `updatedAtEpochMs`, and a value later than `asOf` is refused rather than
carried.

## What never goes in

Prices, candles, filing bodies, an `excerpt`, holdings, cash, average cost, pending proposals. Every
one of them has a source that is re-read on every run — the broker connection, the host source cache,
`portfolio_get` — and a roster carrying any of them is refused with `memory_holds_vendor_payload`.
What is kept is a pointer and a question.
