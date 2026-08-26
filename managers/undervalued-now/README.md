# Undervalued Now

> Find one listed equity that is undervalued right now, and propose the position you would
> take in it.

That sentence is the whole methodology. There is no data-gathering stage, no risk-budget
step, no persona panel and no capability list. This package exists to measure **the model**;
the packages beside it exist to measure **a methodology**.

## What it is

| | |
|---|---|
| prompt | one paragraph, plus the output contract every package carries |
| capabilities | **none.** It asks Aumos for nothing |
| tools | whatever the coding CLI ships — the web, a shell, files. There is no manifest field, and Aumos withholds none of them |
| mode | SHADOW, and structurally unable to be anything else useful (see below) |
| cadence | **every 24 hours, stated in the package rather than chosen** — twice over, since 0.1.3: an armed watch on every answer, and `cadence.json` (see below) |

It is the *"draw a pelican riding a bicycle"* of investing. That prompt became an
image-model benchmark not because anyone specified how to draw a pelican, but because
everybody could run the same sentence against a different model and compare what came back.
Put *"find something undervalued"* in front of four models, score the forward return, and
the comparison is the benchmark. How each one got there is its own business: when the manager
does its own reading, the data pipeline is **part of the manager**, so a model that found
better sources and made more money is the better system rather than a confounded
measurement of one.

## What it gives up, stated plainly

Everything a package that reads through Aumos gets. ⚠️ Since #258 the *first two* are given
up by every package rather than by this one — Aumos withholds no tool from any session — and
they are still listed here because this is the package that gave them up first and on
purpose, by asking Aumos for nothing at all.

- **No Evidence.** A request made through Aumos is recorded — the source, the moment it was
  asked about, what came back. This package asks Aumos for nothing, so its Decision cites a
  paragraph the model wrote instead. Models invent sources wholesale, so when the position
  loses money there is no way to tell a bad source from a bad reading of a good one.
- **Nothing pinned to a moment.** A request through Aumos carries the instant it asked
  about, and a request without one is refused — which is what makes *what did it ask, and
  about when* answerable afterwards. Nothing here answers it. The package is worthless for
  replaying history and for asking a new manager about last quarter, and the reproduction
  that costs was never really on offer (a model answers differently on Tuesday).
- **No broker credential in the run.** ⚠️ Its portfolio *is* allowed a broker account since
  #258 — the refusal that stopped that read a manifest field which no longer exists. What did
  not change is the reason behind it: this manager has a shell, a shell can read a keychain, and
  the person approving an order would not recognise an API key in the middle of a paragraph of
  rationale. So the run still holds no broker credential, and a machine that runs managers under
  your own account refuses to run this at all while it holds a live broker login. It is not
  that the model is not trusted — it is that a page it reads can tell it what to do.

## What it does not give up

- **The approval gate.** Nothing this proposes reaches an order without a person.
- **No way to trade.** There is no broker-write capability in the protocol to ask for, and
  no tool in the session that could place an order.
- **The output contract.** The freedom is in the method, not the protocol — Aumos can only
  seal and score one shape of answer, so this package's output section is the same contract
  every package carries.
- **Its own row.** Every run records the conditions it was made under, so runs of the same
  package made under different ones can never average into one line of the track record.
  ⚠️ It used to record the lane too, and #258 took that term out of the fingerprint along
  with the lane itself.

## The one thing it is told to answer

Every other package proposes its own next review condition, because for an investor's manager
that *is* part of the judgement — it is the only thing that decides when Aumos looks again.
This one is told: **one timed watch, exactly 24 hours after the instant it judged, on every
answer whatever the action.**

It is the difference between a manager and an instrument.

- **Without it the row stops.** Nothing else asks this question again. An armed watch is
  the only thing that wakes the next run, so an answer with no watch is the last judgement
  that row will ever contain — and the asset this package exists to accumulate is elapsed
  time.
- **With a chosen interval the axis is confounded.** A row is a count of independent
  judgements as much as it is a return, and letting the model set its own interval lets the
  thing being measured decide how often it is measured. Fixing the interval makes two rows
  comparable in the one dimension the run record cannot capture.

### ✅ And since 0.1.3 the chain is no longer the only thing holding it up

The paragraph that stood here said the chain is one link at a time — *a run that fails
before sealing arms nothing, and that row's clock stops until somebody starts it by hand* —
and named the fix it was not getting: *a cadence the mandate owns, which would survive a
failed run … is not being built for a benchmark's sake.*

It was built, for a general reason rather than for this one (#257), so this package can
simply ask for it. The manifest carries it (it was a `cadence.json` file until #286, when
the manifest schema stopped refusing unknown keys):

```json
"cadence": { "days": 1 }
```

That is a **request, not a guarantee**: it pre-fills a box on the install screen and what
governs is what the investor confirms there, as `manager_instances.cadence_days`.

⚠️ It was also a **ceiling** until #355. The period that governed was
`max(this, the book's minReviewIntervalDays)`, so this package could ask to be looked at
*less* often than its book required and never more; a mandate saying "every 30 days" beat
this line, and the install screen said which one won. #355 removed the mandate's interval —
a schedule is a property of a methodology rather than of money — so this number, confirmed,
is the whole answer.

What it is **for** has not changed: this package arms a 24-hour `at-time` watch on every
answer, and the cadence is the net under that chain when a run fails and arms nothing. A
failed run costs a day rather than the rest of the row. #356 is where that division of
labour is written down for every package, and `AMP_MANAGER_INSTRUCTIONS` §Schedule is what
every manager reads about it.

⚠️ **The armed watch is still there and is still the primary thing.** It is what makes the
interval a property of *the judgement* — the sentence above about a confounded axis is
unchanged. This is the floor under it, and the leaderboard still demotes itself and names
the row when nothing is armed.
