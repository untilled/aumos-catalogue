---
name: degraded-data-and-failed-runs
description: What to do when a source is down, a previous run failed or left work unfinished, or the material available is contaminated with information later than asOf. Load when any input is missing, stale or suspect.
---

# An absence is a finding about the run, not about the company

The rule this skill exists to enforce is short and it is broken under time pressure: **do not
record what you could not see as evidence of what is not there.**

| what happened | the finding | what the record gets |
|---|---|---|
| the filing is not published, the source errored, the field is empty | `data_missing` | what was missing, and a re-check armed |
| everything was available and this run did not finish | `research_incomplete` | which sections are unwritten, so the next run resumes |
| something was measured and it says the claim is wrong | `thesis_refuted` | the measurement and its evidence |
| the claim may hold and the account cannot carry it | `risk_limit_exceeded` | the exposure arithmetic, and the thesis untouched |

A `data_missing` filed as `thesis_refuted` is worse than no entry at all: it is a rejection with no
evidence behind it, and every later run reads it as a name this desk has already judged.

## Which absences stop the run and which do not

- **Core** — the price, the account state, the fair-value basis, or the evidence that the return
  programme exists at all. Without these there is nothing to judge or nothing to size, and the
  answer is `WAIT` or `WATCH` with the gap named.
- **Secondary** — a peer multiple, a sector median yield, one quarter of credit-cost history. Carry
  it in `uncertainty`, say what it would have changed, and continue. A methodology that stops on
  every missing input never reaches a decision, which is its own failure mode.

## Resuming after a failed run

Read your own folder first. If the last run ended `research_incomplete`, its unfinished sections
are this run's first task, and the run says in `uncertainty` that it resumed. If the last run ended
mid-plan, `stagedIncrement` against the current book tells you what is genuinely left — do not
re-derive it from the plan alone, and do not assume the ledger entry was written.

⚠️ **A repeated run must not double a position.** The plan's stages are cumulative for exactly this
case, and open unapproved proposals count as exposure. If you cannot read the open proposals, you
cannot safely propose an increment: that is `data_missing`, and it is one of the few places where a
missing input stops an otherwise complete thesis.

## Data that is the wrong kind of available

- **An API that only serves the present.** A vendor that returns *today's* ratio and no history
  cannot answer a question dated at `asOf`. Do not use it as evidence for a past state; say the
  series was unavailable.
- **A restated figure.** A number the issuer later corrected is not the number that was known at
  the time. Preserve the original, the correction and both dates.
- **A thesis document edited after the fact.** Reconstructing a historical case from a note that
  has been updated since mixes information the decision could not have had into the decision. Mark
  such material **unsuitable for replay** and say so rather than quietly using it; a reconstruction
  that fails this test proves nothing about the methodology.
- **An incomplete daily bar.** The last bar of a session that has not closed moves signals and
  prices. Exclude it and say `t0` is the last completed session.

## Retries

If a tool refuses you, read the error and stop. `as-of-missing`, `as-of-in-future` and a
post-`asOf` timestamp all mean the same thing — you asked for something outside the window — and
none of them is transient. Retrying with a shifted date is not a workaround; it is the failure this
package's first rule is about.
