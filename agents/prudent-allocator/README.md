# prudent-allocator

**A second opinion that is actually a second opinion.**

Installing two agents that read the same event the same way tells you nothing: you get one
answer twice and a track record that cannot separate them. This package exists to be
genuinely different from a bottom-up reader — **it reaches a different answer to the same
event, for a reason you can state in one sentence**, which is the only kind of second agent
worth installing.

| | `basic-investor` | `prudent-allocator` |
|---|---|---|
| starts from | the asset | **the book** |
| reads | filings, news, prices, the book | the book, prices, the theses |
| the question | what does this event say about this company | what does this event do to this portfolio's downside |
| its usual answer | WAIT, or BUY with a thesis | WAIT, or **RESIZE** |
| the trigger it arms | a price level | **a drift in weights** |
| shape | Data → Concept → Thesis, plus portfolio context and a decision | Exposure → Downside → Risk Budget → Verdict |

---

## Methodology

Top-down, and risk-budget-first.

An event arrives attached to a company. This agent treats that as the *occasion* for a
review rather than as its subject: what it is being asked is what the event does to the
book you actually hold, under the mandate you actually wrote.

The four stages are one prompt file each, read in order.

**1 — Exposure.** Inventory before opinion. Total and cash, the three largest positions by
weight, where the event's subject sits in that ranking, and the shape of the book by asset
class and market. Then price history over a longer window than a bottom-up reader would ask
for, because the question is not *is this a good price* but **how far has this already
travelled**. Drift that nobody decided is the most common way a portfolio ends up outside
its own mandate, and it is invisible on any screen that draws returns instead of weights.

**2 — Downside.** The event read the wrong way round: if the optimistic reading is wrong,
what does the *book* lose, in points of total value? A 40% fall on a 3% position costs 1.2
points; a 15% fall on a 22% position costs 3.3. The second is the bigger problem, and every
bottom-up reading of those two facts gets it backwards, because it reads the 40% and stops.

This stage also checks your theses against their own invalidation conditions. A thesis
whose stated stop has been met and which is still marked active is the portfolio lying to
you, and correcting it is worth doing inside a decision that otherwise concludes WAIT.

**3 — Risk Budget.** The mandate's constraints read as *budgets*: how many points a name
may still gain, how much cash may still be spent, what may be held at all. Three rules come
out of it, and the third changes what gets proposed — a budget spent by **drift** is
`RESIZE` back to the weight you would have chosen, not to the cap, because returning to
exactly the cap re-arms the same problem on the next good week.

**4 — Verdict.** One action from the closed set of seven, with a bias toward the smaller
instrument: if `RESIZE` and `SELL` both address the finding, `RESIZE` keeps your original
judgement and corrects only the part that drifted. `SELL` claims the thesis is dead, and
that is a different claim.

---

## It asks for less, and that is the point

```jsonc
"capabilities": [
  { "kind": "portfolio:read", "reason": "…" },
  { "kind": "market:read",    "reason": "…" },
  { "kind": "thesis:read",    "reason": "…" }
]
```

No `fundamentals:read` and no `news:read`. `basic-investor` has both.

This is a real difference and not a saving. Aumos builds each agent's toolbox from its
declared capabilities, so this agent's session does not contain a filings tool or a news
tool at all. It cannot read a filing. Where the judgement turns on one, the prompt requires
it to say so in its stated uncertainty — which is what a narrower agent owes you, and what
the install screen shows before anything is installed.

`thesis:read` is declared and serves no tool: theses arrive with the question rather than
through a call. It is declared anyway, because the manifest is the permission document, and
a package that reads your theses should say so in the one file you read.

There is no way to write a capability to trade. No such capability exists in the protocol —
it is the absence of the spelling, not a denial that could get an exception later.

---

## What it is not

- **Not a risk model.** There is no VaR, no covariance and no factor decomposition. Stage 2
  asks for an order of magnitude and says so; a number with three decimal places produced
  from a price series and a plausible story is a fabricated number in a lab coat.
- **Not a rebalancer.** It does not run on a calendar and it does not restore target weights
  as a matter of routine. It is woken by an event like every other agent, and `REBALANCE` is
  the answer it reaches least often.
- **Not a second-opinion service.** It is not told what any other agent concluded, and there
  is no way to tell it. Two agents judging one event independently is what makes the
  comparison mean anything; showing one the other's answer would make them one agent with
  extra steps.

---

## Installing it

Browse the catalogue in Aumos, install it against a book, and consent to the three
capabilities above — they are shown before anything is installed.

LIVE means proposals enter the approval queue against your real book. **A book may have
more than one LIVE agent**, and Aumos does not merge them: two agents proposing conflicting
targets for one book have no resolution rule, and inventing one would be Aumos deciding
something nobody approved. So each seals its own judgement, each arrives in your approvals
naming itself, and you decide the order — including deciding not to. Installing this one
beside another is how you compare them; **shadow** is the mode for comparing without any of
it reaching an order at all.

Its shadow book opens as a copy of your own, dated at the moment the instance was created.
From that instant the two diverge, and the divergence is the measurement.
