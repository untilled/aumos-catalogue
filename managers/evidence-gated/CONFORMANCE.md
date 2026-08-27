# Conformance record

> ⚠️ **What this document measured was a build of three packages** —
> `evidence-gated-kr`, `-us` and `-global`, before 2026-08-27. They are now three flows of one
> package, and the measurements are **inherited rather than corrected**: *three instances read
> each other's Brief on one book* was true when it was written, and what does that today is
> three subagents inside one instance. What changed and what it cost is in the README and in
> `untilled/aumos#489`.

This file separates reproducible package checks from checks that require an installed Aumos runtime,
credentials or an investor-owned portfolio. Passing the first set is not permission to publish.

## Reproducible in this catalogue

Run:

```sh
npm run lint
npm run lint:sources
npm run check:allocator        # includes the frozen legacy-parity comparison
npm run check:legacy-parity    # that comparison on its own
```

Re-measuring the legacy side needs the private checkout and is an operator step:

```sh
node tools/legacy-parity.mjs --freeze <legacy-harness-root>
```

The verifier covers:

- the 65-entry migration matrix and every named fixture group;
- 21 legacy-parity cases and 59 fields measured from the Python core at `1fa18c59`, with the two
  recorded methodology differences asserted rather than dropped;
- deterministic stdin-JSON/stdout-JSON metrics and blocked exit code;
- legacy indicators, scanners, sizing, outcomes, attribution and mechanical backtests;
- cluster bootstrap, walk-forward OOS, BH-FDR and the combined promotion gate;
- empty/corrupt/future/private-memory rules and one-time canonical-owner migration;
- KR/US/Global ownership, sleeve budgets and the single Global cash denominator;
- SEC/DART point-in-time parsing, future-row removal, missing/stale lane degradation and adjustment
  conflicts;
- exact/BMO/AMC/date-only checkpoints, DST, holiday, early close, schedule drift, bounded retry,
  late fire, outage, dedupe and theme-radar override;
- consensus/guidance/actual provenance, undated-snippet refusal, monetary currency, dated macro and
  policy readings, Toss-versus-web price conflict, the IR preview → actual → sentinel cycle,
  web-absent lane blocking and refusal of copied source prose in private memory;
- the manifest's declared required sources;
- producer-less `event` WATCH rejection and AMP/1 action/target consistency;
- absence of network, broker/order/database capabilities in the manager manifest.

On 2026-08-25 all six proposal fixtures were also parsed directly by
`@aumos/amp` `decisionProposalSchema` version `0.3.2` at Aumos commit
`72cffae67f7fb4db24fe7a0dd1d1ae266abba5b6`: WAIT, WATCH, BUY, SELL, RESIZE and REBALANCE all passed.
SELL uses the current `exit` target shape; the multi-asset REBALANCE is one Decision with three
targets.

## Runtime smoke evidence — 2026-08-25

The current Aumos checkout was exercised with Claude Code 2.1.241 and Node 22.22.2.

- The official `run-basic-investor` lifecycle completed in 76.8 seconds with `outcome: decided`,
  `driver status: completed`, a sealed schema-valid `WAIT` and a valid Decision hash chain. The
  invocation intentionally lacked `config.managerId`; the package correctly refused to infer a role,
  called no market source and named `manager_identity_missing` as uncertainty.
- A role-selected fixture invocation with `managerId: evidence-gated-us` read invocation, portfolio,
  Brief and private memory, made three point-in-time source calls, wrote one shared Brief revision and
  submitted one schema-valid `WATCH`. The temporary launcher timed out after submission because it
  did not install the lifecycle's decision-completion hook; the Decision itself was present after
  285 seconds and parsed successfully.

⚠️ **The two observations above were measured on the one-package build, where a run selected its role
through `config.managerId`.** The collection split (aumos #447) removed that mechanism — one package
is one manager, so there is nothing to select and nothing to refuse to infer. What the first
observation established still holds in the form that matters (a package that cannot establish its
scope calls no market source and says why); the second one exercised a selector this package no
longer has. **Neither has been re-measured against the split shape**, and the runtime gate below is
where that happens.

- The stdio metrics MCP server passed initialize/list/call protocol checks directly. After repairing
  this host's Homebrew Node and using Aumos's exported `${AUMOS_MANAGER_PACKAGE}` path in the shipped
  MCP config, a real Claude session called `mcp__evidence-gated-metrics__calculate` once and received
  `status: ok` with two independent date clusters.

These smokes establish non-interactive submission, role fail-closed behavior, role-selected source
degradation, Brief writing and actual model-to-MCP calculation. They are not the consecutive
Toss-connected KR/US/Global shadow evidence required for release.

## AMP/1 conformance suite — 2026-08-25

**AMP/1 CONFORMANT.** All six canonical cases, claude 2.1.245, against Aumos `main` at
`caba795`:

```
AMP/1 CONFORMANT — aumos/evidence-gated-allocator@0.1.0

✓ produces-decision-proposal   6/6 response(s) valid; 6 arrived as a bare proposal
– protocol-declared            No response carried an AMP envelope … (#255)
– echoes-invocation-id         No response carried an AMP envelope … (#255)
✓ supports-wait · wait-is-reasoned · watch-carries-trigger
✓ language-costs-nothing-structural · no-direct-broker-execution
✓ manifest-valid · immutable-version · declares-skills · declares-permissions
✓ no-broker-write · network-declared · timegate-clean-context
```

Every case is a `WAIT`, correctly: a conformance invocation carries no portfolio, no mandate and no
source, and this package does not turn an absent scope into a position. ⚠️ **As measured, the reason
recorded was `manager_identity_missing`** — the run had no `config.managerId` and the build under test
needed one. The split removed that selector; the verdict is unchanged and the wording of the reason
is what a re-measurement would move. The two skipped checks
are about an envelope no `decision_submit` transport can carry; they name the transport rather than
this package.

✅ **The `ko-KR` case is the language requirement observed rather than asserted.** The prose is
Korean and the wire is not: `action` is `WAIT`, the rationale keys are English, and `uncertainty`
carries `manager_identity_missing` verbatim beside Korean sentences.

⚠️ **Getting here required fixing three defects in the harness, none of them in this package.** They
are recorded because the first report this file carried was produced by the broken harness and read
NOT CONFORMANT:

| defect | what the report said instead | fixed by |
|---|---|---|
| the runner never passed `answered` to `runCli`, so an interactive CLI that had already submitted waited for a person until `timeoutMs` | six `timeout`s; measured, `portfolio-review` wrote a schema-valid WAIT **62 seconds** in and was reported `timeout` fourteen minutes later | aumos #423 / #424 |
| `runConformance` validated against `managerResultSchema` while the runner handed it a bare proposal — and since #255 `decision_submit` has no field for `protocol`, `invocationId` or `artifacts` | six identical failures no package could fix | aumos #440 / #442 |
| three checks filtered validated responses and read an empty list as "pass" | `✓ protocol-declared — all responses declare AMP/1`, about **zero** responses | aumos #440 / #442 |

The third is the one worth remembering: a red line gets read and a green one does not, so a check
that passes over nothing is worse than one that fails.

## Three-manager runtime cycle — 2026-08-25

The three managers were installed on **one Toss-connected book** (KRW, live account, ₩21.9M) as
SHADOW instances and run in order from the desktop app. All three completed and sealed a Decision.

| | KR | US | Global |
|---|---|---|---|
| run | `run_a4da6704…` | `run_7ad68201…` | `run_458397c0…` |
| decision | `dec_ef41c49b…` | `dec_b53049d8…` | `dec_2b1482d1…` |
| action | `WAIT` 0.72 | `WATCH` 0.62 | `WATCH` 0.62 |
| `source_request` | 4 | **11** | 5 |
| briefs read | 0 (first) | KR's | **KR's and US's** |
| `brief_write` | 1 | 1 | 1 |
| `memory_write` | 3 | 2 | 2 |

✅ **The collaboration this package was designed around happened.** KR wrote
`kr-sleeve-baseline`; US started already holding it and wrote `us-sleeve-baseline`; Global started
holding **both** and wrote `global-allocation-policy`. The three instances share no session, no
prompt and no private memory — only the book.

✅ **And Global did the work only Global can do.** Both specialists stopped at the same wall and said
so: *"브리프에 기록된 KR 슬리브 예산이 존재하지 않아 비중을 늘리는 행동은 승인 근거 자체가 없다."*
Global closed it — recording sleeve budgets of KR `0.549677` / US `0.127304`, classifying SGOV as
reserve liquidity (which moved the US sleeve's spendable USD from `$0` to `$1,710.72`, a policy call
outside the US manager's authority), and rejecting *"is 72.6% cash under-invested?"* as a wrongly
grouped number.

✅ **Private memory stayed isolated and used the declared namespace.** Each instance wrote its own
keys — none invented per-run — and no instance can read another's:

```
KR      migration/schema-version · coverage/universe-state · learning/evidence-maturity
US      coverage/universe-state · learning/evidence-maturity
Global  migration/schema-version · learning/evidence-maturity
```

✅ **`WAIT` and unable-to-judge stayed apart, in the manager's own words.** The KR rationale's first
`uncertainty` entry is the distinction itself: *"만다트 위반 없음과 예산 부재는 '증거가 충분한 적극적
WAIT'이고, 아래 항목들은 '종목 단위 판단 불가'를 만드는 결손이다. 두 가지는 같은 것이 아니다."*

✅ **The `at-time` WATCH was armed off a sourced calendar, not off arithmetic.** KR's first watch
fires at `2026-08-26T07:00:00Z` and says why: *"다음 실제 XKRX 정규장 마감(2026-08-26 15:30 KST) 이후
30분 버퍼. 소스 캘린더에서 확인한 개장일이며 24시간 가산이 아니다."* That path —
`/api/v1/market-calendar/KR` — is one of the sixteen aumos #451 added hours earlier; without it the
manager would have fallen back to adding hours, which is the failure #356 named.

⛔ **No order left, and nothing reached the approval queue.** All three are SHADOW, every proposal
carried no target, and the book was untouched.

⚠️ **Getting here required fixing four defects, none of them in this package, and every one of them
was invisible to the checks above.** Package lint, the conformance suite and the unit suites were all
green while each of these was live:

| defect | what it did | fixed by |
|---|---|---|
| the conformance runner never passed `answered` | six cases timed out after answering in 62 seconds | aumos #423 / #424 |
| `runConformance` judged a bare proposal as a `ManagerResult`, and three checks passed over zero responses | NOT CONFORMANT for a reason no package could fix, beside two green lines about nothing | aumos #440 / #442 |
| `ManagerInvocation.config` had no writer | a package with `required` config installed cleanly and fail-closed on every run, silently | aumos #444 / #445 |
| the published `toss` source declared twenty paths and this build signed four | the gateway exited before listening, so **every run on the machine died** | aumos #449 / #451 |

⬜ Two more were found and are not fixed: a refused source document takes the whole gateway down
(aumos #450), and a run whose worker dies leaves a directory and no store row, so the app truthfully
reports no session at all (aumos #453).

## Release-gating checks that are not complete

- ✅ *Resolved.* Aumos gained secure SourceSpec query-secret injection (aumos #419, merged as aumos
  #422), so `sources/open-dart` is published in this catalogue and the manifest names it. What is
  **not** yet done is a fixture recorded from the live vendor: the KR parsers are exercised against
  synthetic payloads, and a real `crtfc_key` is needed to confirm the receipt fields, the ZIP
  behaviour of `corpCode.xml` and the `status`-on-200 error path against the vendor itself.
- The three packages of this collection have not yet been installed together against the same Toss-connected shadow
  portfolio for consecutive KR close → US close → Global review cycles.
- ✅ *Partly resolved by the cycle above.* Real `manager_memory_write` reached the store from all
  three instances, each into its own namespace, and the seeds handed to each run were projected from
  what the earlier runs had written. What is **still** unmeasured is the pair that needs a second run
  of the *same* instance: a later `manager_memory_read` of a key that instance itself wrote, and a
  historical replay proving a past `asOf` does not see a later revision.
- Official IR web research → `at-time` WATCH → scheduled wake → actual release/missing retry →
  Evidence/Thesis/Decision → next WATCH needs a real CLI/web-enabled manager run in both KR and US.
- Planner, mandate, approval and target-weight handoff need shadow runtime evidence. No order code may
  be added to make this check pass.
- Legacy shadow parity, missed/false wake and source-freshness reports need enough consecutive market
  and earnings cycles; historical Harness records are never backfilled as Aumos performance.

The PR must stay Draft and the catalogue index must not publish this package until these items have
runtime evidence or an explicitly reviewed scope decision in the issue.
