---
name: theme-radar
description: Forward research — find the sector or theme that will lead in three to six months, register it as a paper thesis call, and refuse the ones that are already consensus.
---

# Theme radar

This is the layer the rest of the package exists to discipline. Every other gate here makes an idea
survive scrutiny; none of them produces one. A scanner ranks what is already cheap or already
strong, which means it is a report on a move that has happened. Mechanical relative strength
confirmed the 2026 semiconductor leadership only after the leaders had run 44% and 73%, and the
pullback rule never caught the name that went up 567% at all. The claim that would have found it —
HBM capacity sold out, so the pure-play beneficiary earns more than the market has priced — was
writable from public information months earlier. Writing that claim is what this skill is for.

Run it when `themeRadarDue` says the interval has elapsed or a dislocation shortened it, and record
the run under `run/theme-radar-last` whether or not it produced anything.

## Inputs

- `sectorStrength.researchQueue` — where to look. It is a list of questions, not of candidates: a
  sector is queued because it leads, jumped rank or sits at a 200-day high, and none of those is a
  reason to own anything.
- The events in the invocation, and the earnings and policy calendar reachable through the source
  contract.
- Web research. **A silent fallback is forbidden.** If the web lane is unavailable, this run
  produces no forward thesis and says the lane was missing — an unresearched theme is not a
  cautious one, it is an unknown one asserted as safe.

## The question

For each queued area: what leads in three to six months, and what is the evidence that is *not*
already consensus? Supply and demand imbalance, capacity cycles, a policy inflection, the
second-order beneficiary nobody has connected yet — and how much of it the current price already
carries.

## What a forward thesis must contain

Zero to three per run. Zero is a normal outcome and a better one than a narrative written to fill
the slot. Each one carries, and `validateThesis` refuses it without them:

| element | why it is required |
|---|---|
| a falsifiable core claim | "HBM capacity sells out and shows up in second-half earnings" can be wrong on a date. "AI is big" cannot. |
| checkpoint dates and `horizonEnd` | a claim with no clock is never scored, and an unscored claim never teaches anything |
| invalidation conditions | what would make you drop it, decided before you are attached to it |
| a variant view against named consensus refs | if it is what everyone already thinks, the price has it. Being right and being early are different, and only the second one pays |
| expected upside and a fair value range | a prediction you did not write down is one you cannot be wrong about |

## The two refusals

**A thesis is registered as a paper call before it is anything else.** Call `paperAdmission` with the
challenge verdict; a cleared one becomes `thesis_call`, a conditional one `thesis_watch`, an
unresolved high risk `thesis_rejected`. The verdict decides the setup and you do not get to choose —
logging a conditional idea as a call would put an unchallenged claim into the cohort that unlocks
size. Only the call pays the full evidence cost, and a promote is refused outright when the price
history is stale, because a forward record started from a stale price measures the pipeline rather
than the idea. Admission returns the `openWindow` row; append it to `learning/paper-cohorts` and it accrues a forward record through `signalPaper` from that instant. This is what makes the layer
measurable: the team's calls are scored against the index *and* against the mechanical baseline
signals `sectorStrength` logs, so "our research beats a dumb momentum bot" is a number rather than a
belief. Until that number exists, the team's edge is a hypothesis exactly as the bot's is.

**Nothing reaches the watchlist before `thesis-challenge` clears it.** A forward claim is the most
attractive kind of wrong: it is unfalsified precisely because it has not happened yet. Paper
registration is unconditional; promotion is not. Load `skills/thesis-challenge/SKILL.md` and let it
run against the claim before the candidate is anywhere an allocation decision can see it.

## What this skill does not do

It does not size, propose or buy. A cleared forward thesis enters the same path every other
candidate does — `candidate-research`, `evidence-gates`, `sizing-and-concentration`, and the
investor's per-order approval. What changes here is only where the idea came from.
