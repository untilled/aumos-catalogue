---
name: fmr-damage-separation
description: "How to tell a temporary shock from permanent earnings damage in a Korean filing — a one-off impairment against operating deterioration, and an investment phase against failed monetisation. Read this at Stage 3, before the fall's cause is written down."
---

# The question the whole methodology turns on

A price has fallen. Either the earning power the price fell away from is still there, or it is
not. Everything else this package does is machinery around that one question, and it is the
question a chart cannot answer at any resolution.

Two pairs are confused constantly, and each confusion runs one way:

| the pair | the mistake | what it produces |
|---|---|---|
| a one-off impairment vs operating deterioration | reading a trend as a charge | buying a business that now earns less, at a price that is correct |
| an investment phase vs failed monetisation | reading a failure as a phase | waiting for revenue that is not coming |

Both mistakes are *optimistic*, and both are the mistake this methodology is naturally exposed
to: it goes looking for reasons a fall is excessive.

## The four findings

`classifyCase` takes one of these in `business.damage`, with `business.evidenceIds` behind it.

- **`intact`** — the earning power is still there. Operating profit, operating cash flow and
  the revenue line all sit inside their pre-shock range once the identified one-off is removed.
- **`one-off-impairment`** — a charge that hits the reported figure once and not the cash the
  business earns. Look for it in the notes rather than in the headline number.
- **`investment-phase`** — spending that suppresses reported profit while the revenue it is
  buying is still ahead. The claim is falsifiable or it is not this finding: name the line, the
  quarter it should appear in, and the size.
- **`operating-deterioration`** — the operating business earns less than it did, and not
  because of one charge.
- **`monetisation-failure`** — the spending happened and the revenue it was for did not arrive.

⛔ The last two **refute** this methodology's thesis: the fall is not excessive relative to the
damage, so there is no reversion to take. `classifyCase` answers `structural-earnings-damage`
and `thesis_refuted`.

⛔ **And it does so only with evidence ids behind it.** The same claim asserted with nothing
behind it is `research_incomplete`, not a refutation — #254's rule, and it runs in both
directions: an absence of evidence never establishes damage, and never establishes health.

## What separates them in a Korean filing

Read the filing, not the summary. Through `source_request` against OpenDART, and every reading
is dated: the report's own receipt date, not the day you fetched it.

**Cross-check four things against the same period a year earlier, not against the last
quarter.** Korean quarterly results carry seasonality that a sequential comparison reads as a
trend.

1. **Operating profit against operating cash flow.** An impairment separates the two: the
   reported profit falls and the cash does not. When both fall together, the word "one-off" is
   doing work it cannot do.
2. **The notes on the charge.** A genuine one-off is named, sized and attributed to a
   particular asset or event. A charge that appears as a line with no note has not been
   established as one-off — it has been described as one.
3. **Whether the same charge appeared last year.** The most reliable single test. A one-off
   that recurs is an operating cost with a better name, and this is where the recurring
   "one-off" is caught.
4. **Cost growth against the revenue it was supposed to buy.** For the investment-phase claim:
   if the spending is two years old and the revenue line it was for has not moved, the phase
   has become the failure. Name the quarter by which you expect it to move — that date becomes
   part of the invalidation.

## What to write down

The proposal carries the decomposition **and** the test you applied, not the conclusion alone:

> The Q2 fall carries a 180bn won impairment on a single acquired subsidiary, named and sized
> in note 14. Operating cash flow for the same quarter is within 4% of the year-earlier
> quarter, and the same charge does not appear in the year-earlier notes. Excluding it,
> operating profit is inside its four-year range. Evidence: `ev_…`, `ev_…`.
>
> Refuted if: the same charge appears again in Q3, or operating cash flow falls below the
> four-year range for two consecutive quarters.

Two properties make that paragraph worth writing: a reader can check it, and it says in advance
what would make it wrong.

## The trap specific to this methodology

**A bounce is not evidence about the business.** When the price rises after you have written a
damage finding, nothing about the finding has changed — and the temptation to promote the
finding from `unknown` to `intact` because the market seems to agree is exactly the
extrapolation error this methodology exists to trade against, pointed the other way.
