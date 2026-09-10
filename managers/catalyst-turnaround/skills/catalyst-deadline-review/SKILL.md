---
name: catalyst-deadline-review
description: "What to do on the run where a catalyst's window arrives. Adjudicates success, delay or failure; states what a deadline extension costs; and compares holding on against a benchmark alternative. Read this when a registered catalyst's expectedWindow ends at or before asOf, or when a delay is being proposed."
---

# The window arrived. That is a decision, not an observation.

`PROMPT.md` governs. This document is the one stage that only runs when a date this manager wrote
down some months ago has come around — which is the moment the whole methodology is actually tested,
and the moment it is easiest to skip. A position that is never adjudicated is a position that is held
forever with a good story attached.

## 1. Three answers, and there is no fourth

| answer | what you must be able to point at |
|---|---|
| **success** | the confirming indicator, in a document, meeting the success condition written before the window opened |
| **delay** | new evidence that the event is still coming, a new window end, and the two numbers in §2 |
| **failure** | the failure condition met, or the event's own sponsor withdrawing it |

⛔ **A rising share price is not one of the three.** It is not weak evidence of success; it is
evidence about the market's expectation, which is the thing the thesis is supposed to be
*differentiated from*. Recording it here is how a catalyst ledger silently becomes a momentum ledger.

⛔ **Silence is not a delay.** If the window closed and nothing was published, the honest reading is
that the event did not happen on the schedule it was registered on. That may still be a delay — but a
delay costs the three things below, and «nothing was announced» is not one of them.

## 2. Extending a deadline costs three things, every time

1. **New evidence.** A document that did not exist at the last review, saying the event is still
   expected. ⛔ Naming the same threat again is not new evidence, and this is the single rule that
   stops a position being held indefinitely on a threat that has been true for a year.
2. **The remaining expected return, from here.** Not the return expected at entry. The share price has
   moved, the window has moved, and the question is what is left.
3. **The additional downside now being accepted.** Time is not free: the capital is committed for
   longer, the invalidation is further away in months, and the balance-sheet check in `PROMPT.md`
   §Stage 6 has to be re-run against the *new* window end.

Write all three into `uncertainty`. A delay recorded without them is refused by the ledger, and it is
refused deliberately: the missing numbers are exactly the numbers that make an extension look
expensive.

## 3. After `maxDelays`, the question changes

The methodology accepts `maxDelays` extensions on one catalyst. Past that, the question is no longer
*when does this land* — it is *does this capital beat the alternative from here*, and that is a
comparison you have to actually make:

- the **benchmark alternative**: what a Korea-listed broad index fund would be expected to return over
  the remaining window, over the same period, after the same costs;
- against the **remaining expected return** on this position, from §2, discounted by the fact that
  the last two estimates of the date were both wrong.

State both numbers. If you cannot state the first, say so — it is `data_missing`, and it is not a
reason to default to holding.

## 4. What a success is worth, and why the run is not over

A realised catalyst is the beginning of a different question, not the end of the thesis:

- if the recovery is **in the price** — progress along `(price − entry) / (target − entry)` at or past
  `trimPriceProgress` — trim. The recovery is what was bought; what is left is a different bet with a
  different reason;
- if it is **not** in the price, hold and say why the market has not repriced it, in the same terms
  Stage 4 used: a specific assumption, timing or magnitude that consensus still has differently;
- either way, **register the next catalyst or record that there is none.** A position with no open
  catalyst is not a turnaround position any more, whatever it was when it was opened.

## 5. Scoring, afterwards

The adjudication feeds the catalyst ledger's score and **nothing else**. The price outcome feeds the
price ledger. ⛔ They are two ledgers and they never become one: a catalyst that failed under a
position that made money is exactly that, and a single «did this work?» column would be filled in from
whichever of the two numbers was more comfortable.

Fees, tax and dividends stay as separate components on the price side, and a valuation gain, a
realised exit and a forward measurement are three different figures with three different denominators.
Do not add them.
