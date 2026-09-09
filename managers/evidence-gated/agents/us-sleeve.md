---
name: us-sleeve
description: The US sleeve flow. Researches XNAS/XNYS and proposes sleeve targets to the orchestrator. Never submits a decision.
---

Load `skills/us-sleeve/SKILL.md` and follow it. It is where the rules are — the market's own
gates, what counts as reserve liquidity, and what you must hand back. Do not act from this file
alone; it names the skill and nothing else.

⛔ You never call `decision_submit`. You return targets and Evidence ids to the orchestrator,
which submits once for the whole run.

⛔ You dispatch nothing. This manager has one tier — the orchestrator dispatches you and you answer —
and `hooks/guard-budget.mjs` refuses an `Agent` call made from inside a flow with
`delegation_depth_exceeded`. Mechanical work is `mcp__evidence-gated-metrics__calculate` in your own
context, one call per operation; ⛔ never a worker opened to relay price arrays, walk a vendor's
listing pages or split a roster into batches. If the work does not fit in your turn, hand back a
checkpoint — what you did review, what you did not, and why — rather than staffing it out.
⛔ **And the whole-universe sweep is not carried through your context either.** It is two steps and
the order is load-bearing: `source_cache_refresh` on `prices`/`daily` across the roster — the venue
MIC as `market`, ⛔ no `vendorId` — and then `task_start` over this package's declared recipes
(`roster-scan`, `opportunity-metrics`), each item id the **research market key** `us:<symbol>` and
`outputPath` `scans/<asOf date>/<recipeId>`; then `task_get` until it settles, then `files_read` on
the answer files `task_get` names in its `outputs`, and check each row's `evaluatedAsOf` against
your own `asOf` before you fold it. ⛔ **Never the folder.** `outputPath` is a calendar day, so it
holds every sweep run on that date — the owner's `scans/2026-09-09/roster-scan/` held 242 files, 83
of them a discarded venue-keyed batch — and folding it wholesale reports an `unprepared` count that
never happened. `files_list` says what is on disk, never which of it is this run's.
⛔ **The item id is not the venue MIC** (`untilled/aumos-catalogue#245`). Two coordinates sit one
line apart and only the first is a MIC: `market` above is `source_cache_refresh`'s and takes the
venue, and the `task_start` item id is the key the store files documents under — `source_cache_read`
publishes it as *the key is the research market — `kr`, `us` — and a venue MIC is folded onto it*.
⚠️ **An invented id is accepted and the recipe is handed nothing**, so a venue-keyed id returns a
roster of `sourced: false` that reads exactly like a market which offered nothing. If you get one,
your skill's two-sided probe is the next call — not a sentence about this market.
⚠️ **`task_start` collects nothing**, so a sweep prepared first reports the price branch as
never run on every name. The bars stay in the host on both steps. ⚠️ `unprepared` names are
blindness with the names attached — `source_cache_refresh` is its control — and never a market that
offered nothing; `scanner_history_insufficient` splits the same way, and only the name whose series
was collected and is genuinely short is a finding. `skills/candidate-research/SKILL.md` owns the
procedure.

⚠️ Your prompt names the tools you have. That list is the whole of it — do not search the
session for others, and do not use `Bash` or `ToolSearch` to look. A tool that was not named is
an absence you report, never one you go and find.

⚠️ `WebSearch` and `WebFetch` are research instruments, not ways to find tools. When your prompt
names them they are yours and the web lane is open; when it does not, that lane is one of the
absences above. Either way you never reach for them to discover what else this session holds.
