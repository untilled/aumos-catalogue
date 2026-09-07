# SEC EDGAR

SEC EDGAR's own endpoints, handed to an agent unread.

Aumos holds the contact address SEC requires and signs the request; what comes back is
exactly what SEC sent. There is no mapping and no summary in between — this source
declares no port, and the `source.json` beside this page is the whole of what it does.

## What you get

| | |
|---|---|
| **Serves** | EDGAR's own endpoints, relayed unread |
| **Reaches** | `www.sec.gov`, `data.sec.gov` |
| **Fidelity** | `none` — Aumos neither reads the answer nor dates it |
| **Coverage** | US filers with a CIK |
| **Cost** | free; SEC publishes this data and asks only that callers identify themselves |

**`none` is the honest fidelity, and it is what this source is for.** Aumos does not fold
the answer into a shape of its own and does not stamp it with a date: the response is
SEC's bytes, carrying every period and every restatement SEC holds. Judging *when*
something was known is therefore the reading agent's work rather than the host's, and what
that costs is listed under **EDGAR as a library** below.

What no source can do is check whether a filing was *true*. A company that misstated its
own accounts is reported as it filed; no data source can tell you otherwise, and this one
does not pretend to.

## What it needs from you

SEC requires every caller to identify itself and answers `403` to anyone who does not. So
this source asks for one thing: a **contact address** — a name and an email — sent as the
`User-Agent` on every request.

It ships with the package author's address as a default, so it works the moment you install
it. Supplying your own is the honest arrangement if you are going to use it regularly:
SEC's rate limits and any complaint about traffic follow the address in the header. Enter
it in SETTINGS → Data sources; Aumos keeps it in the system keychain, and no agent ever
sees it.

## EDGAR as a library

An agent can ask this source for EDGAR's own endpoints and get
back exactly what SEC sent — no mapping, no summary, no rewriting. Aumos still holds the
contact address and signs the request; what it does not do is read the answer.

| the agent may ask | and receives |
|---|---|
| `/files/company_tickers.json` | SEC's whole ticker→CIK table — the first call, not an optional one |
| `/api/xbrl/companyfacts/CIK{ten digits}.json` | every XBRL fact SEC holds for that filer |

The allowlist published to an agent reads `/api/xbrl/companyfacts/{symbol}`, and **`{symbol}`
there is a filename rather than a ticker.** `SourceSpec/1` has exactly one placeholder and it
is spelled that way in every document; what goes in the slot for this endpoint is `CIK` plus
the ten-digit zero-padded CIK plus `.json` — `CIK0000050863.json`, not `INTC`. A ticker in
that slot answers `404 NoSuchKey`, which reads like *SEC holds nothing for this filer* and is
not that. So the registry call above is a **precondition** of the facts call and not a
convenience, and the `cik_str` it returns is an integer (`50863`) the caller pads itself.

`companyfacts` is a filer's whole XBRL history: every tag SEC holds for it, every period,
and every restatement of a period. An agent that wants to do its own arithmetic over that
can have it. An agent that wanted a handful of chosen, dated numbers instead cannot get
them here, because nothing in this path chooses and nothing dates.

What that leaves to the caller, and none of it is done for you:

- **No dates Aumos checked.** A relayed response carries whatever SEC put in it, and Aumos
  does not look. An agent reading this is responsible for its own point-in-time discipline.
- **It is EDGAR-shaped.** An agent written against these two endpoints is written against
  EDGAR, and pointing it at another filings source is rewriting it.
- **Restatements are not resolved.** Where a period was filed more than once, the response
  carries all of them; which one answers a question about last March is a decision the
  reading agent makes and records, not one this source made before handing the bytes over.

The paths above are the whole list — a request to anything else is refused by name. What a
source may declare there has a ceiling it cannot raise: no document may relay to a
**broker's** API, because at a broker the credential that reads is the credential that
trades.

## What it will not do

- **It relays two paths.** Prices, news, filings as text and analyst estimates are other
  sources; the two paths above are the whole of this one.
- **It does not summarise.** Aumos hands the response over as it arrived. The one sentence
  this source writes for a reader is the `caveat` in `source.json`, and that is a warning
  about how to address the endpoint rather than an interpretation of what it returns.
- **It reaches nowhere else.** The two hosts above are declared in the document Aumos
  installed and are the only ones it can request; a redirect elsewhere is refused rather
  than followed.

## A note about currency

A filer reports its figures in a unit, and a company that reports in more than one leaves
the question of which to call the statement's currency. Nothing here answers it: in
`companyfacts` the facts hang under a `units` object keyed by the unit SEC recorded, and
Aumos hands that over exactly as it arrived. Picking one — or declining to, and saying so
in the judgement — belongs to the agent doing the reading.
