# SEC EDGAR

Company fundamentals for US-listed companies, read from the SEC's own filings.

This source serves the `fundamentals` port: when an agent asks Aumos for a company's
revenue, net income, assets, liabilities, equity, cash or shares outstanding, the numbers
come from `data.sec.gov` — the filings themselves, not a vendor's copy of them.

## What you get

| | |
|---|---|
| **Serves** | EDGAR's own endpoints, relayed unread |
| **Reaches** | `www.sec.gov`, `data.sec.gov` |
| **Fidelity** | as-filed |
| **Coverage** | US filers with a CIK, annual and quarterly periods |
| **Cost** | free; SEC publishes this data and asks only that callers identify themselves |

**As-filed** is the strong claim, and it is what makes this source usable for judging the
past. Every figure carries the date it was *filed*, and Aumos will not hand an agent a
figure filed after the instant it is judging. Where a period was filed more than once —
an original and then a restatement — this source hands over the **earliest** filing, so a
question about last March is answered with what was actually known last March rather than
with what the company said about it a year later.

What that does not do is check whether the filing was *true*. A company that misstated its
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

## The other half: EDGAR as a library

An agent can ask this source for EDGAR's own endpoints and get
back exactly what SEC sent — no mapping, no summary, no rewriting. Aumos still holds the
contact address and signs the request; what it stops doing is reading the answer.

| the agent may ask | and receives |
|---|---|
| `/files/company_tickers.json` | SEC's whole ticker→CIK table |
| `/api/xbrl/companyfacts/{CIK……….json}` | every XBRL fact SEC holds for that filer |

The difference is not small and it is the reason this exists: the `fundamentals` port
answers with **seven metrics for one period**, chosen and dated by rules written into the
document. The same filer's `companyfacts` document carries **503 US-GAAP tags** with every
period and every restatement in it, and an agent that wants to do its own arithmetic over
that can now have it.

What it costs is everything the mapping bought, and none of it comes back:

- **No dates Aumos checked.** The port's answers carry `knownAt` and are cut off at the
  instant being judged. A relayed response carries whatever SEC put in it, and Aumos does
  not look. An agent reading this is responsible for its own point-in-time discipline.
- **It is EDGAR-shaped.** An agent written against these two endpoints cannot be pointed
  at another filings source; one written against the `fundamentals` port can.
- **Nothing is dated by Aumos.** Reading the filing dates out of the response is the
  caller's work, and the moment a request asked about is recorded rather than enforced.

The paths above are the whole list — a request to anything else is refused by name. What a
source may declare there has a ceiling it cannot raise: no document may relay to a
**broker's** API, because at a broker the credential that reads is the credential that
trades.

## What it will not do

- **It maps one thing.** Prices, news, filings-as-text and analyst estimates are other
  ports and other sources. The `fundamentals` port answers questions about the accounts.
- **It has no prose.** A data source hands Aumos numbers, dates and currency codes, and
  cannot hand it a sentence. There is no summary field for a source to write into, which
  is deliberate: a paragraph is where an unbounded claim about the future would enter a
  judgement that is supposed to be bounded by a date.
- **It reaches nowhere else.** The two hosts above are declared in the document Aumos
  installed and are the only ones it can request; a redirect elsewhere is refused rather
  than followed.

## A disclosure about currency

A filer reports its figures in a unit, and a company that reports in more than one leaves
the question of which to call the statement's currency. This source answers **last** — the
currency of the last metric read. That is a choice rather than a fact about the filing, and
it is written into the document rather than left to whichever number happened to be read
most recently, which is what the code this replaced did without saying so.
