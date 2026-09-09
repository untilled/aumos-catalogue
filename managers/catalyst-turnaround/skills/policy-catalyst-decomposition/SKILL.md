---
name: policy-catalyst-decomposition
description: "For a company whose recovery runs through a policy or a regulated price. Separates the policy's announcement, its execution and its appearance in results, and keeps the receivable balance, the tariff, the input cost and the overseas result as four channels that are never netted against each other. Read this before registering a catalyst of kind policy-decision or tariff-or-price-revision."
---

# Three stages, four channels, and the two ways this goes wrong

`PROMPT.md` governs. This document is the part of the method that only applies when a policy sits
between the state of the world and this company's income statement — which is most of the reference
case this methodology was written from, and none of an ordinary operational turnaround.

## 1. The policy has three stages and they are three different facts

| stage | what exists | what does **not** yet exist |
|---|---|---|
| **announced** | a decision, a gazette notice, a press release | any statement of what this issuer bills or receives |
| **executing** | the revised price is in force and is being billed | any reported quarter containing it |
| **in results** | a filing shows the effect in a revenue, cost or receivable line | the *next* one, which is where the recurrence is proved |

⛔ **A policy at the announcement stage with no traced path to this issuer's earnings is a research
candidate and not a position.** That is `PROMPT.md`'s rule and this is where it usually breaks: the
programme is real, it is funded, the industry is named, and the share of it that reaches *this*
company is an assumption nobody has written down. Name the filing or the notice that carries the
mechanism — the billed unit price, the recovery schedule, the contract — or record the absence.

⚠️ **The stage is a fact about the policy, not a gate on the position.** A tariff that is executing
is not thereby a purchase, and a tariff that is only announced is not thereby excluded if the
mechanism is documented. What the stage buys you is that your `uncertainty` says which of the three
you are relying on, and a reader can tell the difference between «being billed» and «expected to be
billed».

## 2. Four channels, and they are never netted

In a 가스공사-shaped case at least four things are moving at once, and three of them can move against
each other in the same quarter:

| channel | the question it answers | the trap |
|---|---|---|
| `receivable-balance` | is the accumulated shortfall being recovered? | the balance can fall because of a write-off rather than a recovery |
| `regulated-price` | is the price being normalised? | a revision announced is not a revision billed |
| `input-cost` | what does the company pay for what it sells? | a falling input cost flatters the same quarter a tariff rise does, and the two are not one improvement |
| `overseas-result` | what do the non-regulated businesses contribute? | it can worsen enough to consume the whole regulated gain |

Three rules:

1. **Record every channel you can read, including the ones moving the wrong way.** An improving
   receivable balance beside a deteriorating overseas result is the honest picture; reporting only
   the first is a thesis that has chosen its evidence.
2. ⛔ **Do not net them into one number.** «Net effect positive» hides which channel is carrying the
   thesis, and therefore which observation would refute it.
3. ⛔ **Do not count a derived effect as an independent one.** The interest that stops accruing on a
   falling receivable balance is *that* balance, one line down. Mark it as derived; it is real, it is
   worth stating, and it is not a second channel. `minImprovingChannels` counts channels, and the
   whole reason it counts *distinct* ones is this.

## 3. What the catalyst row looks like for a policy case

The `confirmingIndicator` is the hardest field to get right here, and the test is simple: **name the
line in the filing where it will be read.** «The tariff normalises» is not confirmable. «The
recovery-adjusted receivable balance in the Q3 report's receivable note» is.

The `failureCondition` for a policy case should almost always name the *offset* rather than the
reversal, because an outright reversal is rare and an offset is common:

> The revision is billed for the full quarter **and** the balance still rises, because the
> recovery-adjusted cost rose by at least as much.

That condition is falsifiable in one filing, and it is the condition that would actually have been
met in the cases where this kind of thesis failed.

## 4. Where the estimated window comes from, and where it does not

A regulated price review usually has a **cadence** and not a date. That is a legitimate basis for an
estimated window, and it is written down as one:

> `basis`: the ministry's stated quarterly review of the regulated unit price, whose effective date
> is set at each review rather than in advance.

⛔ What is **not** a basis: a broker's expectation, a newspaper's «as early as», or the fact that a
review happened in the same month last year. The last one is the most tempting and it is the one that
turns into `catalyst_source_stale` on the next run, because the thing being cited is last year's
story.
