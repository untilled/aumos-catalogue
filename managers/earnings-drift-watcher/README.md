# earnings-drift-watcher

One question, asked the same way every time: **has the market finished reacting to what
was reported?**

Post-earnings-announcement drift is the observation that prices keep moving in the
direction of an earnings surprise for weeks after it lands. It is one of the oldest
documented anomalies and also one of the most heavily arbitraged, which means the
interesting part is not whether the effect exists but **how much of it has already
happened by the time you are looking.** That is the whole of what this manager judges.

## How it reasons

| stage | what it establishes |
|---|---|
| 1 — the surprise | what was reported, what was expected, and the difference — stated as a direction first and a magnitude second, because the direction is the confident part |
| 2 — how much has happened | priced, drifting, or faded. The same fundamental fact produces opposite judgements depending on the answer |
| 3 — whose question it is | drift on a position the book holds is about sizing; drift on one it does not is about entering |

## What makes it different from the other packages in the catalogue

It reasons from **one event and one number**, where a bottom-up analyst reasons from a
company and a top-down allocator reasons from a risk budget. It reads fundamentals and
price history and nothing else — no news, no thesis history — and that narrowness is the
methodology rather than a gap in it: a manager that can only see the reported figure and the
price cannot talk itself into a story.

The consequence is that **its characteristic answer is WATCH**, not a trade. Drift is a
question about timing, and the honest answer to "is there anything left in this" is usually
"ask again in three weeks". A catalogue of managers that all propose trades would be a
catalogue of managers that are all wrong at the same time.

## What it is bad at

- **Anything that is not an earnings event.** Given an asset review with no recent report
  it will correctly say there is no surprise to drift from, which is a WAIT that tells you
  nothing you did not know.
- **Judging whether the business is good.** It never asks. A company can beat expectations
  on its way out of business and this manager will read the beat.
- **Faded moves.** It is instructed to treat a reversal as evidence against its own reading
  rather than as an opportunity, and it will therefore miss the cases where the market was
  wrong and later agreed with it.
- **Short horizons.** Its judgements are approved by a person by hand. Anything that only works if executed within hours is something it is
  told to write as a WATCH instead.

## What it reaches, and what that costs

**It asks Aumos for everything it reasons from**, and every call it makes through the Aumos
Skill Gateway is recorded as evidence you can re-read afterwards.

⚠️ **It is not launched with no shell.** This section said so — *"`tools` is empty, so this
agent is launched with no shell, no web and no filesystem of its own"* — and that stopped
being true when Aumos deleted the `tools` field and the deny list behind it. The sentence is
corrected rather than deleted because it was a **safety claim on a published page**, and a
reader who saw it once should be able to find out that it was withdrawn. What is true now:
this manager's prompt asks the gateway for everything, so everything it *reasons from* is on
the record — and the session it runs in holds whatever its coding CLI ships, which nothing
in this package can narrow. What contains that session is the OS account Aumos launches it
as, on the investor's own machine.

⚠️ **And what the empty tool list stopped buying before that.** Until §E21 it meant the
*closed lane*, and the closed lane meant more than "no shell": the gateway read each
vendor, mapped the answer onto a port, dated every fact and refused anything published
after the instant the judgement was pinned to. There are no ports now. A data source is a
vendor Aumos holds a credential for, `source_request` hands back what that vendor sent —
unread — and nothing clamps it to `asOf`. So for a manager whose entire subject is *what was
knowable when*, the honest statement is that the **prompt** is what keeps the window
honest, and the gateway is what keeps the record of what was asked.

## Capabilities

| | why |
|---|---|
| `source:passthrough` | the reported figure, the expectation, and the price around the announcement — asked of the vendors this machine holds credentials for |
| `portfolio:read` | whether the book holds it, which decides which question is being asked |

No headlines, deliberately. A drift judgement that reads the coverage is a sentiment
judgement wearing a number — and since §E21 that is a restraint the prompt has to keep
rather than one a missing capability enforces, because one capability now reaches every
source the investor installed.
