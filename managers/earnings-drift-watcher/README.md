# Earnings Drift Watcher

<sub><a href="README.ko.md">한국어</a></sub>

> After a company reports results, has the market finished reacting — or is there still
> some of the move left?

## In one paragraph

When a company reports earnings that beat or miss what analysts expected, the share price
does not finish adjusting on the day. It tends to keep drifting in the same direction for
weeks. That is a well-documented pattern, and it is also one of the most heavily traded,
which means the interesting question is not *does it exist* but **how much of it has
already happened by the time you are looking**. That is the whole of what this manager
judges. Because the honest answer is usually "most of it, ask again later", its
characteristic answer is WATCH rather than a trade.

## The methodology

**Post-earnings-announcement drift.** One event, one number, and three questions in a
fixed order.

*Words this page uses, in plain terms:*

| | |
|---|---|
| **Surprise** | the gap between what a company reported and what analysts expected |
| **Drift** | the tendency of a price to keep moving in the direction of that surprise for weeks afterwards |
| **Priced in** | the move has already happened, so there is nothing left to capture |
| **Faded** | the price moved and then went back. Evidence against the reading, not an opportunity |
| **WATCH** | a judgement that arms a condition to look again, rather than proposing a trade now |

| stage | what it establishes |
|---|---|
| 1 — the surprise | what was reported, what was expected, and the difference — stated as a **direction** first and a magnitude second, because the direction is the confident part |
| 2 — how much has happened | priced, drifting, or faded. The same fundamental fact produces opposite judgements depending on the answer |
| 3 — whose question it is | drift on a position the book already holds is about **sizing**; drift on one it does not is about **entering**. They are not the same judgement |

**What makes it different from the other packages in the catalogue.** It reasons from one
event and one number, where a bottom-up analyst reasons from a company and a top-down
allocator reasons from a risk budget. It reads fundamentals and price history and nothing
else — no news, no thesis history — and that narrowness is the methodology rather than a
gap in it: a manager that can only see the reported figure and the price cannot talk
itself into a story.

The consequence is that **its characteristic answer is WATCH**, not a trade. Drift is a
question about timing, and the honest answer to "is there anything left in this" is
usually "ask again in three weeks". A catalogue of managers that all propose trades would
be a catalogue of managers that are all wrong at the same time.

## How a run works

One run, one proposal. Nothing below places an order.

```mermaid
flowchart TB
    classDef reads fill:#1e2a44,stroke:#6f9bf0,color:#cfe0ff
    classDef judges fill:#2f2f38,stroke:#9aa0b4,color:#e8eaf2
    classDef proposes fill:#1b4332,stroke:#40916c,color:#d8f3dc
    classDef person fill:#5c4813,stroke:#f6a609,color:#ffe8b0

    WAKE["Aumos wakes it on an earnings event,<br/>or on an asset review"]:::reads

    subgraph IN["What it reads"]
        direction TB
        FUND["The reported figure and<br/>what was expected"]:::reads
        PX["Price history around<br/>the announcement"]:::reads
        BOOK["Whether the book holds it"]:::reads
    end

    S0{"Is there a recent report<br/>to drift from?"}:::judges
    NONE["WAIT<br/>no surprise to read"]:::proposes

    S1["1 · The surprise<br/>direction first, magnitude second"]:::judges
    S2{"2 · How much has<br/>already happened?"}:::judges

    PRICED["Priced<br/>the move is spent"]:::judges
    DRIFT["Drifting<br/>some of it is left"]:::judges
    FADED["Faded<br/>evidence against the reading"]:::judges

    S3{"3 · Does the book<br/>already hold it?"}:::judges
    SIZE["A question about sizing"]:::judges
    ENTER["A question about entering"]:::judges

    OUT["One judgement — most often WATCH,<br/>with the condition to look again"]:::proposes

    subgraph HUMAN["Where a person decides"]
        direction TB
        MAND["Aumos judges it against your Mandate"]:::person
        YOU["You approve, or you do not"]:::person
        ORD["Only then does an order exist"]:::person
    end

    WAKE --> IN --> S0
    S0 -- no --> NONE
    S0 -- yes --> S1 --> S2
    S2 --> PRICED
    S2 --> DRIFT
    S2 --> FADED
    PRICED --> S3
    DRIFT --> S3
    FADED --> S3
    S3 -- yes --> SIZE --> OUT
    S3 -- no --> ENTER --> OUT
    OUT --> MAND --> YOU --> ORD
```

**Legend** — 🟦 what it reads · ⬜ what it works out on its own · 🟩 what it hands back ·
🟧 where a person decides.

**Cadence.** It is woken by an earnings event or an asset review rather than by a
calendar, and the condition it arms on a WATCH is what brings it back.

## What it needs

| | |
|---|---|
| **Market** | US-listed equities (`XNAS`, `XNYS`) |
| **Data** | `source:passthrough` — the reported figure, the expectation it is measured against, and the price history around the announcement, asked of the data sources this machine holds credentials for |
| **The book** | `portfolio:read` — whether you already hold it, which decides which of the two questions is being asked |
| **Settings** | none. There is no config schema; the thresholds are the methodology |
| **Your approval** | **it proposes and never trades.** Every judgement enters your approval queue and a person approves it |

**No headlines, deliberately.** A drift judgement that reads the coverage is a sentiment
judgement wearing a number. ⚠️ Since §E21 that is a restraint the prompt has to keep
rather than one a missing capability enforces, because one capability now reaches every
source the investor installed.

## What it is bad at

- **Anything that is not an earnings event.** Given an asset review with no recent report
  it will correctly say there is no surprise to drift from, which is a WAIT that tells you
  nothing you did not know.
- **Judging whether the business is good.** It never asks. A company can beat expectations
  on its way out of business and this manager will read the beat.
- **Faded moves.** It is instructed to treat a reversal as evidence against its own
  reading rather than as an opportunity, and it will therefore miss the cases where the
  market was wrong and later agreed with it.
- **Short horizons.** Its judgements are approved by a person by hand. Anything that only
  works if executed within hours is something it is told to write as a WATCH instead.

**Do not install this** if you want a manager that will propose trades often, or one that
forms a view about a company rather than about one number it reported.

## Notes

Two safety claims that used to stand on this page were withdrawn, and are kept visible
rather than deleted, because a reader who saw one once should be able to find out that it
was withdrawn.

⚠️ **It is not launched with no shell.** This page said *"`tools` is empty, so this agent
is launched with no shell, no web and no filesystem of its own"*, and that stopped being
true when Aumos deleted the `tools` field and the deny list behind it. What is true now:
this manager's prompt asks the gateway for everything, so everything it *reasons from* is
on the record — and the session it runs in holds whatever its coding CLI ships, which
nothing in this package can narrow. What contains that session is the OS account Aumos
launches it as, on the investor's own machine.

⚠️ **And what the empty tool list stopped buying before that.** Until §E21 it meant the
*closed lane*, and the closed lane meant more than "no shell": the gateway read each
vendor, mapped the answer onto a port, dated every fact and refused anything published
after the instant the judgement was pinned to. There are no ports now. A data source is a
vendor Aumos holds a credential for, `source_request` hands back what that vendor sent —
unread — and nothing clamps it to `asOf`. So for a manager whose entire subject is *what
was knowable when*, the honest statement is that the **prompt** is what keeps the window
honest, and the gateway is what keeps the record of what was asked.

Aumos shows no returns for this package until it has earned some. A forward track record
takes calendar time rather than compute, and nothing on this page is one.
