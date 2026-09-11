---
name: fmr-staged-entry
description: "How to design the staged entry once stabilisation is confirmed — the cumulative target, what a stage's condition may and may not be, the expiry, and why a re-run must consult the ledger. Read this at Stage 4, before the first rung is proposed."
---

# A plan, not a habit

A staged entry is one decision with a cumulative target and several conditional rungs. It is
**not** a decision to keep buying, and the difference lives entirely in what each rung is
conditional on.

## Design the whole position first

`positionSizing` answers with `plannedTotalWeight` — the whole intended position, decided once,
from this thesis's loss budget. The rungs divide that number; they never grow it.

⛔ **Do not copy a ratio.** A 40/35/25 ladder carried from another book is a number with no
argument behind it. Divide the target by what each rung is *waiting for*: if the second rung
waits for a quarterly result, it is worth what that result is worth resolving, and that is a
judgement about this thesis.

Three rungs is usually the most a weeks-to-months thesis can justify. If you cannot name a
distinct thing each rung is waiting for, you have fewer rungs than you wrote down.

## What a stage's condition may be

| kind | may carry a stage alone |
|---|---|
| `stabilisation-held` | yes |
| `thesis-evidence` | yes |
| `earnings-confirmation` | yes |
| `target-reached` | yes — for a `trim` stage |
| `price` | **no** |
| `elapsed-time` | **no** |

⛔ **A stage satisfied only by a price level or an elapsed period is refused**
(`stage_condition_price_or_time_only`). Adding because the price fell further is averaging into
a thesis that is losing, and it is the mechanism by which a bounded mean-reversion position
becomes an unbounded one. The refusal is not a lint on your wording: the run that does this
always has a rule written in advance, and the rule is what makes it feel disciplined.

A price level may still appear **beside** a real condition — *"the Q3 result confirms the
recovery in the segment, and the price is inside the band we sized for"* is a legitimate
stage, because the first half is what carries it.

## Every stage is re-gated

`applyStage` demands all three at the moment the stage fires, not at the moment the plan was
written:

- `thesisIntact` — you confirmed it this run;
- `stabilisationOutcome === 'confirmed'` — the base that opened the entry still holds. A plan
  written a month ago on a base that has since broken is not a plan that continues;
- `lossBudgetRemaining > 0` — what is left of the budget after what is already committed.

## The expiry, and why it is not optional

A plan carries `expiresAt`. Past it, every stage is refused with `plan_expired` and the
position is re-judged in the open.

A ladder with no expiry is a standing instruction to buy, and it survives the reason it was
written. Give it a date related to what the rungs are waiting for — usually the next result
plus a margin, never *"the end of the year"* because that was easy to type.

## The ledger, and the re-run

The failure this exists to prevent is not a bad stage — it is the **second good one**. A run
wakes, reads the same conditions, finds them still true, and adds again. Nothing about it looks
wrong from inside.

So: read the ledger from your private folder, pass it as `plan`, and write back the `plan` the
answer returns — **verbatim**. A stage already in `filled` is refused with
`stage_already_filled`, and on any refusal the plan comes back unchanged rather than absent, so
following that instruction can never erase your own record.

⛔ **`filled` has three states and the third one refuses.** `[]` and `null` both say *«the ledger
was read and holds nothing»* — open a plan with `"filled": []` — and **anything else, including
the field simply not being there, is nobody having read it**. That used to read as an empty
ledger, so the rung that was already committed fired a second time, `ok`, and the increment left
as a BUY. It is now `data_missing` / `staged_ledger_unread`: nothing is added, `committedWeight`
comes back `null` rather than `0`, and the plan is handed back untouched. If your memory read
failed, say so and re-read it — do not build a plan without the field.

⚠️ **The ledger is what *this manager has proposed*, not what the fund holds.** Aumos Portfolio
owns holdings and executions. If a proposal was refused or a fill never happened, the ledger
and the book disagree — and the book is right. Reconcile against `portfolio_read` before
proposing a further rung, and say in the proposal when the two disagreed.

## What the proposal says

The cumulative target, each rung with its weight and its condition, the expiry, and which rung
this proposal is. An investor reading a 1.5% buy should be able to see that it is the first
third of a 3.5% position and what has to happen before the rest of it exists.
