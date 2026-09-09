---
name: degraded-sources
description: "What survives when a source does not answer. Says which findings this methodology can still make without a filing, without price history or without the manager's own register, and which ones collapse to data_missing. Read this before concluding anything from an empty or refused source response."
---

# A source that did not answer said nothing about the company

`PROMPT.md` governs. This document exists because of one recurring mistake with a specific shape: a
request comes back empty, and the run reports the *company* as unremarkable rather than the *source*
as unread. #254 in this catalogue's history is that distinction and this package does not relax it.

## 1. First, say which of the two happened

| what you saw | what it is |
|---|---|
| the tool is **absent** from this session | the investor has not connected it. Not a failure — a capability this fund does not grant |
| the tool answered with an **error code** | a refused request. Read the code; `as-of-missing`, `as-of-in-future` and `post-as-of-timestamp` all mean you asked outside the window and are not transient |
| the tool answered with an **empty result** | the vendor has no row for that query at that instant. This *can* be a fact about the company — a company with no filing in a period genuinely has none — and it is the only one of the three that ever is |

Say which one in `uncertainty`, by name. «Data unavailable» covers all three and distinguishes none.

## 2. What each missing source costs

| missing | still possible | collapses to |
|---|---|---|
| **filings** (`open-dart`) | reading a catalyst from a policy notice; carrying the register forward | every recovery indicator, every survivability number, and therefore every entry decision → `data_missing` |
| **price history** | the whole catalyst ledger, every indicator comparison, the classification | the distance to invalidation, and so the target weight and the trim test → `data_missing` for anything that sizes |
| **the register** (`manager-memory`) | this run's own reading of every catalyst | ⛔ the delay count. Without it a repeated delay is invisible and the position looks like a first slip — treat every open catalyst as **unadjudicable** this run rather than as fresh |
| **the book** (`portfolio`) | research, classification, the thesis chain | the whole-account exposure, and therefore any proposal at all → `data_missing` |

⚠️ **The register row is the dangerous one and it is worth saying why.** Losing a delay count does not
look like a failure: the run produces a clean, complete, first-slip judgement about a position that
has slipped three times. So a run without its register does not size, does not extend a deadline and
does not adjudicate — it records that it could not read its own record.

## 3. What never happens

- ⛔ **A missing number is never `thesis_refuted`.** The lanes are in the code for this reason: absence
  and refutation are different findings, and only a *read* observation that contradicts a
  *pre-declared* condition is the second.
- ⛔ **Do not substitute a different source and carry on.** A price from another vendor, a figure from
  a news summary, a balance from a broker note — none of these are the filing, and a comparison
  between two points in time measured on two different bases is a number nobody can reproduce.
- ⛔ **Do not retry with a different `asOf`.** A refusal on the time window is not a rate limit.
- ⛔ **Do not mint an evidence id** for a reading you could not file. A catalyst with an invented
  citation is worse than an unregistered one.

## 4. What a degraded run should still return

Something. A run that read the register and one policy notice and nothing else can still:

- restate every open catalyst and its window, unchanged;
- say which of the three failures in §1 happened, per source;
- arm the next review — ⚠️ **this one especially**, because a run that returns nothing arms nothing
  and the manager quietly stops waking.

A WAIT carrying the specific source, the specific error and the specific finding it could not make is
a complete run. A WAIT saying «insufficient data» is the same run with the finding removed.
