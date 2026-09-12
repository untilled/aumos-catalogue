---
name: fmr-universe-sweep
description: "How to read a Korea-listed roster from the Toss connection, page enough completed daily bars to compute the gate, join OpenDART through the host source cache, and resume the sweep next run from your own ledger. Read this at Stage 2, before the first connection_request, and whenever a sweep has to be resumed after a failure."
---

# Reading a market you cannot enumerate cheaply

This desk's entrance is a price sweep, so the sweep is the part of the run most likely to be
faked. There is no host universe concept, no instrument search and no screening store — Aumos
removed the idea deliberately — so the roster has to be pulled, paged and resumed by this
manager, and every step of it is a place where a plausible number can be produced instead of
read.

⛔ **Nothing in this file licenses a guess.** Where a vendor's accepted values were never
measured, the instruction is to state that and to declare the universe narrowly — not to invent
a filter that looks right.

## ⑴ The roster — `/api/v1/stocks/all`

One call, through `connection_request` with `source: "toss-market"`. It is the **only**
whole-market endpoint on the allowlist, and the allowlist names exactly four query parameters:

| parameter | what it selects |
|---|---|
| `market` | which Korean venue the name is listed on |
| `status` | the listing/trading state of the name |
| `securityType` | what kind of security the row is |
| `commonShare` | whether the row is the common share |

⚠️ **The accepted *values* of all four are unmeasured and undeclared** — the relay passes them
through and neither Aumos nor this package has ever seen the vendor's vocabulary for them. So:

- Send the filters you are willing to defend, and **read back what arrived**. The answer's own
  rows tell you which venue codes and which type words the vendor actually uses.
- ⛔ Do not write a filter value into your record as though it were a documented one, and do not
  report a universe as "KOSPI common shares" because that is what you asked for. Report
  `universeSource` as the route (`toss:/api/v1/stocks/all`) and `universeCount` as the number of
  rows you actually received.
- If the answer is refused or the filters are rejected, the universe is **undeclared** for this
  run. That is `discovery_not_run`, and it is not "no candidates".

⚠️ **Survivorship.** The roster is today's. A company delisted last year is not in it, and this
methodology's whole subject is companies whose price fell a long way — which is the population
delisting selects from. Nothing in the sweep corrects for it and nothing can; say so where you
report a pass rate, and never present a gate-pass count as a historical base rate.

Names arrive in an order the vendor chose. Sort them yourself into a stable order — the symbol
string — because the cursor is a **`symbol-index`**: a position in *your* ordering, and an
ordering that changes between runs makes the cursor meaningless.

## ⑵ The bars — `/api/v1/candles`, paged

The gate needs a 252-bar high and a 200-bar average, and `normalizeBars` refuses short history:
**at least 300 completed daily bars**, per symbol.

```
path:  /api/v1/candles
query: symbol, interval=1d, count, before, adjusted
```

Four things, and three of them are traps.

- ⛔ **Always pass `adjusted` explicitly, and say in your record which basis you asked for and
  which arrived.** Omitting it defaults to `true` at the relay, but what you know then is what
  you *assumed*. `priceState` refuses an undeclared basis outright (`adjustment_basis_undeclared`),
  which is the correct outcome and not a workaround to route around.
- ⛔ **`before` is inclusive and it is an instant.** `before = <today 00:00+09:00>` returns
  **today's partial bar**, and every reading this methodology takes is off the newest rows — the
  base low, the sessions since it, the reclaim above it. Pass an instant strictly inside the
  previous session so the newest row is a completed one.
- **Page with `nextBefore`.** The host adapter fetches `count=200` at a time and the vendor
  returns a `nextBefore` offset instant (e.g. `2026-08-21T00:00:00.000+09:00`). Pass it back as
  `before` for the next page and concatenate. Two pages reach ~400 bars, which clears 300.
- ⛔ **`market_bars` is not an alternative.** It caps at 250 bars, which is below what the gate
  needs, and a 250-bar answer would compute a 200-bar average off 50 rows of context.

### The cheaper path, and why it does not quite reach

The host source cache holds `prices/daily` (`source_cache_refresh` with a `days` parameter,
default 400 calendar days). ⚠️ **400 calendar days is roughly 270 trading sessions, which is
below 300.** Use the cache to triage — a name whose 270-session drawdown is nowhere near −0.30
does not need a second call — and page `/api/v1/candles` for anything that might pass. Where you
compute the gate off the cache alone, the answer is `unevaluated`, not a pass.

Read the cache's own words for the lane status rather than inventing a parallel vocabulary:

| `source_cache_read.state` | lane |
|---|---|
| `fresh` | `open` |
| `stale` | `open` if you refreshed, `partial` if you used it as-is |
| `never-fetched` | `dark` for that symbol |
| `refresh-failed` | `dark` for that symbol, and the range goes into `failedRanges` |

## ⑶ Partial failure, and the cursor

⛔ **There is no per-symbol failure envelope.** One `connection_request` is one path, and a
vendor refusal arrives as a `VenueFailure` for that call. So the sweep fails a *symbol at a
time*, and what a run owes the next run is the difference between "read and nothing qualified"
and "never read".

- Collect every symbol whose bars you could not get into `symbolsFailed`, and the contiguous
  span into `failedRanges` as `{ kind: "symbol-index", from, to, reasonCode, attempts }`.
- ⛔ **Move `cursorAfter` no further than the last symbol you fully succeeded on.** A cursor past
  an unread range deletes it permanently — nothing later ever looks at it again, and
  `discoveryRun` and `candidateLedger` both refuse the write.
- Retry `failedRanges` **first** on the next run, before anything after the cursor. Each retry
  increments `attempts` on the same range; it never becomes a second row.

## ⑷ The filing join — OpenDART

Use the **host source cache**, not a second cache of your own: `source_cache_read` for
`open-dart/filings` and `open-dart/financials`, `source_cache_refresh` when the state says
`stale` or `never-fetched`. Pass `freshFor` — it is required — and project `metrics` rather than
pulling a whole company's facts.

Two vendor statuses that mean different things and read the same from a distance:

| OpenDART status | what it means | lane |
|---|---|---|
| `013` | the query was accepted and there is **no matching document** | `open`, zero rows. An absence, and absence is never refutation |
| `020` | the request was **refused** — rate limit or key | `dark`. The name goes into `failedRanges` and the cursor stays put |

⚠️ The filings index carries `rcept_no`, `rcept_dt` and `report_nm` and **no figures, no
normalised statements and no type filter**; the request window is fixed at `asOf − 5y … asOf`.
There is no `since` cursor, so incrementality is store-side: the cache's four states are the
only thing that says whether this run added anything.

## ⑸ The ledger — one document, compare-and-swap

`manager-memory` has no multi-file atomic write, so the cursor lives **inside the same document
as the candidates**. Two files would mean a cursor that advanced while the candidates it
describes did not get written.

```
files_read  { path: "state/candidates.json", asOf }      → bytes + hash
files_write { path: "state/candidates.json", content, expectedHash, asOf }
```

- Pass the **`expectedHash`** you read, every time. A mismatch is `revision-conflict` — another
  writer got there first — and the answer is to re-read and re-apply, never to write without the
  hash.
- `expectedHash: null` means "nothing was there", which is the correct value on a first write
  only.
- A `file-lease-held` refusal is a concurrent writer on a 60-second advisory lease. Retry.
- ⛔ **If you did not read the file, do not pass `previous` to `candidateLedger` at all.** Passing
  `null` says you read it and it was empty. That difference is the whole of `data_missing`.

## What this sweep cannot do, and is not to pretend to

- There is **no point-in-time roster**. Today's list, read today, with the survivorship note above.
- There is **no traded-value field** anywhere: candles carry share volume only, so the liquidity
  haircut in `positionSizing` is computed from what the vendor gives and its basis is stated.
- There is **no corporate-action feed**. The `adjusted` flag is the whole of it, which is why an
  undeclared basis is refused rather than assumed.
- There is **no modelled halt or trading status**. `/stocks/all?status=` and
  `/stocks/{symbol}/warnings` are relayed unread; treat what they say as text you are quoting.
- A manual run's task is always `PORTFOLIO_REVIEW` — there is no symbol argument on `start-run`
  — so the sweep is how this desk reaches a name at all.
