# The shared scenario suite

One set of scenarios, three packages, four contracts.

```
npm run check:shared-scenarios
```

`COMMONISATION-SURVEY.md` (#270, PR #271) compared `shareholder-rerating`,
`catalyst-turnaround` and `fundamental-mean-reversion` by executing them, and
reached two conclusions at once: **keep the three implementations independent**
— the genuinely identical overlap is two functions and about twelve lines — **and
open a follow-up for a shared *scenario* suite**, because on three of the four
boundaries all three packages promise to hold, they did not return the same
answer, and nothing in this repository would ever have said so. This directory is
that follow-up (#256).

⛔ **It is not a step towards a shared library.** A shared library would have made
the three agree by construction: one of the three readings of «an open proposal's
weight» would have won silently and nobody would have decided which. The
disagreement is the information, and this suite exists to make it visible without
touching a line of any package's code.

## The shape

One scenario file holds the **situation** and the **answers that matter**. Three
thin adapters translate a situation into each package's input shape and normalise
its answer down to what all three genuinely claim.

```
tools/shared-scenarios/scenarios.mjs                        the situations
tools/shared-scenarios/adapters/shareholder-rerating.mjs     ~60 lines each
tools/shared-scenarios/adapters/catalyst-turnaround.mjs
tools/shared-scenarios/adapters/fundamental-mean-reversion.mjs
tools/verify-shared-scenarios.mjs                            the runner
```

⚠️ **The adapters are the cost and they are also the risk.** An adapter is a
place where a scenario can be quietly translated into something the package finds
easy. The mitigations are that each one lives beside the scenarios, that a
scenario the three answer differently is recorded rather than skipped, and that
each adapter says in its own header what it adds to the situation and why.

## The four contracts

① **An unread account must not read as an empty one.** A book nobody could read
authorises no increase, and the reason is an absence (`data_missing`) rather than
a refutation. An account that really is empty is a fact and still sizes.

② **A total and an increment are two numbers.** Each package publishes what the
position should *be* and what to *add* today; the increment is the total less
what is already carried, and it is never negative — a reduction is a different
judgement, not a negative purchase.

③ **An open proposal is counted once.** Exposure to one name is one quantity:
pending totals fold into the holding by `max` and never by sum, a desk's own
restated proposal does not double its own position, another desk's pending total
is a ceiling rather than a position, and two holding rows for one symbol are two
claims about one position.

④ **A limit that could not be checked must not read as a limit that passed.** A
ceiling nobody read withholds the increase it constrains, as an absence.

## What is asserted, and what is not

| asserted, per scenario × package | **not** asserted |
|---|---|
| did it authorise an increase (yes / no) | field names |
| which of #256's four causes, if it refused (`data_missing`, `research_incomplete`, `thesis_refuted`, `risk_limit_exceeded`) | severity words |
| the exposure the caps were measured against | diagnostic codes |
| the (total, increment) **relation** — two fields, and `increment = max(0, total − what is already carried)` | the answer's shape |

⛔ **And nothing else, ever.** Splitting conditions, sizing policy, exit logic,
classification vocabularies and thresholds are each package's own (#256). A
cross-package assertion over any of them is commonisation of policy through the
back door — which is the thing the survey refused. The three sizing formulas
(risk-budget-over-loss, quarter-Kelly, risk-budget-over-*effective*-loss) produce
three different weights on every scenario here and **no weight is ever compared
to another package's**. Only the exposure is a shared quantity, because only the
exposure is a fact about the account rather than about a methodology.

⚠️ **The adapters stop below the verdict.** Each wires the account fold and the
sizing — the two places the four contracts live — and none of them runs
`evaluateCase` / `runVerdict` / `classifyCase`. Reaching the verdict would mean
writing a shareholder-return case, a catalyst ledger and a mean-reversion
technical state into one scenario: three different situations wearing one id,
which is exactly the silent translation this suite is supposed to prevent.

## Two kinds of difference

**`expectedDisagreement`** — the three answer differently *by policy*. The entry
carries the answer that package gives and a `reason` saying why it is that
package's to make. It is checked exactly like any other expectation, so a
recorded disagreement is a claim under test and not an exemption. The suite is
green.

**`knownDefect`** — an answer that is wrong against one of the four contracts.
Recorded here, printed **loudly** by the runner, and green — because #256 is
explicit that a fix for something the checks missed must not travel in the same
change as the check that found it. Every entry wants its own issue against its own
package. ⚠️ A `knownDefect` that stops reproducing is printed loudly as *stale*
and is also green: the package has been fixed, and the answer is to delete the
entry rather than to fail the build of whoever fixed it.

⛔ **A scenario the three answer differently is never skipped, and never softened
into an easier scenario.** That is the one rule the suite cannot bend: the point
of it is the disagreements.

The runner exits non-zero for exactly one thing — a contract violation that is
not recorded as a `knownDefect`.

## Adding a scenario

1. **Write the situation, in the shared vocabulary** (`scenarios.mjs` documents
   it in full): `holdings` and `pending` as rows or the string `'unread'`,
   `mandate` as the host's constraints object or `'unread'`. A holding row is
   `{ weight, strategy? }` and a pending row is `{ targetWeight, strategy? }` —
   the host's own two field names and the host's own two meanings
   (`untilled/aumos#813`). No `strategy` at all means an unattributed row.
2. **State which contract it is about** (`contract: 1…4`) and what the answer
   that matters is: `approvesIncrease`, `cause`, `exposure`, and a `why` in
   prose. ⚠️ Nothing else. If the expectation you want to write needs a field
   name, a severity or a weight from one package, it is not a shared contract.
3. **Keep the numbers away from the sizing formulas.** Where the scenario is
   about the *account*, every weight in it should sit below all three packages'
   own targets, so that «no increase» means the account refused and not that one
   formula happened to size smaller. Where it is about a *cap*, make the cap tight
   enough to bind in all three — `MANDATE_TIGHT` is there for that.
4. **Run it and read what comes back before writing the expectation.**
   `npm run check:shared-scenarios`. The runner prints every package's answer on
   every scenario, so the expectation is written from what the packages do.
5. **Where they differ, decide which kind of difference it is.** A defensible
   policy difference is an `expectedDisagreement` with a reason; an answer that is
   wrong against one of the four contracts is a `knownDefect` with a note and its
   own issue. ⛔ Do not change the scenario until the three agree.

## What this suite cannot see

- ⬜ **No host.** Every claim here is read off the packages' own input contracts.
  The suite can say the three disagree about what a host payload means; it cannot
  say which meaning the host actually sends (`untilled/aumos#789`).
- ⬜ **No verdict.** See above: the adapters stop below each package's own
  classification, so nothing here judges a route, an intent or an outcome code.
- ⬜ **No prose.** `PROMPT.md` and `skills/` are the methodologies and are meant
  to differ.
- ⬜ **No field names, so no discovery contract.** #305 asks the three to spell one
  discovery-run record and one candidate ledger the *same way* — which is an assertion
  over field names and status words, the one thing the table above says is never
  asserted here. It therefore lives in `tools/verify-discovery-contract.mjs`, and what
  it holds is [`docs/contracts/discovery-run.md`](../../docs/contracts/discovery-run.md).
- ⬜ **No staged plans, no exits, no re-arming.** Three different sources of truth
  (the book, a carried register, the plan's own ledger), which is a difference in
  mechanism rather than in answer, and #256 assigns each to its package.
