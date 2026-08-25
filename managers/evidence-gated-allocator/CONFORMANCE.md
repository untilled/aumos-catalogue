# Conformance record

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
- The stdio metrics MCP server passed initialize/list/call protocol checks directly. After repairing
  this host's Homebrew Node and using Aumos's exported `${AUMOS_MANAGER_PACKAGE}` path in the shipped
  MCP config, a real Claude session called `mcp__evidence-gated-metrics__calculate` once and received
  `status: ok` with two independent date clusters.

These smokes establish non-interactive submission, role fail-closed behavior, role-selected source
degradation, Brief writing and actual model-to-MCP calculation. They are not the consecutive
Toss-connected KR/US/Global shadow evidence required for release.

## AMP/1 conformance suite — 2026-08-25

aumos #420 fixed the invocation-file defect recorded here previously, so the suite was run against
this package for the first time: `pnpm --filter @aumos/manager-runtime conformance <package>`, claude
2.1.241, all six canonical cases.

**All six cases completed and submitted a schema-valid `DecisionProposal`.** Each was parsed directly
by `decisionProposalSchema`; each is a `WAIT`, correctly, because a conformance invocation carries no
`config.managerId` and this package refuses to infer its role from `managerInstanceId`, holdings or
task. Seven of the suite's checks pass on the manifest and the invocations: manifest validity,
immutable version, declared skills, eight in-enum capabilities, no broker-write, `network: deny`, and
no invocation carrying context dated after its `asOf`.

⚠️ **The report nonetheless reads NOT CONFORMANT, and no package can currently make it read
otherwise.** `runConformance` validates each response against `managerResultSchema` — an envelope of
`protocol`, `invocationId`, `artifacts` and `decision` — while `scripts/conformance.ts` hands it
`readSubmittedDecision(paths.decisionPath)?.decision`, which is the bare proposal. Since #255 the
judgement reaches the kernel through `decision_submit`, whose `inputSchema` is derived from
`decisionProposalSchema` and has no field in which a manager could put `protocol`, `invocationId` or
`artifacts`. All six responses therefore fail `produces-decision-proposal` with the same four
messages, and `language-costs-nothing-structural` fails for that reason alone.

⚠️ **Two checks report green about zero responses.** `protocol-declared` and `echoes-invocation-id`
filter on `outcome.result`, which is set only when a payload validated. None did, so both filters are
empty and both print a passing line — *"all responses declare AMP/1"*, *"no response could be
mistaken for another run"* — about nothing. That is the shape this repository names after #196.

Both belong to `untilled/aumos`, not to this package, and the fix is a decision between wrapping the
proposal in the runner (the three missing fields are the runner's own facts) and changing what the
suite reads. Neither is made here.

✅ **One measured result that is about the package.** In the `non-english-output` (`ko-KR`) case the
prose is Korean and the wire is not: `action` is `WAIT`, the rationale keys are English, and
`uncertainty` carries `manager_identity_missing` verbatim beside Korean sentences. That is the
issue's language requirement observed on a real run rather than asserted.

⚠️ **The first attempt produced six timeouts and that was a third harness defect, now fixed
locally.** `scripts/conformance.ts` did not pass `answered` to `runCli`, so an interactive CLI that
had already submitted sat waiting for a person until `timeoutMs`. Measured: `portfolio-review` wrote
a schema-valid WAIT to `decisionPath` 62 seconds in, its gateway audit showed `invocation_read`,
`brief_read` and `decision_submit` all allowed, and the case was reported `timeout` fourteen minutes
later. With the watcher wired in, the same six cases completed in about six minutes. `runCli`'s own
documentation for that option names the cost exactly: *"the run ends on its timeout, which is a fact
about the machine recorded where a fact about the manager belongs."*

The first MCP smoke also exposed that `${CLAUDE_PLUGIN_ROOT}` is not expanded after Aumos merges a
package-owned `.mcp.json` into its strict run config. The shipped config now uses
`${AUMOS_MANAGER_PACKAGE}`, which the Aumos isolation grant exports to every manager run. No personal
or absolute package path is embedded in the artifact.

## Release-gating checks that are not complete

- ✅ *Resolved.* Aumos gained secure SourceSpec query-secret injection (aumos #419, merged as aumos
  #422), so `sources/open-dart` is published in this catalogue and the manifest names it. What is
  **not** yet done is a fixture recorded from the live vendor: the KR parsers are exercised against
  synthetic payloads, and a real `crtfc_key` is needed to confirm the receipt fields, the ZIP
  behaviour of `corpCode.xml` and the `status`-on-200 error path against the vendor itself.
- The three managers have not yet been installed together against the same Toss-connected shadow
  portfolio for consecutive KR close → US close → Global review cycles.
- Real `manager_memory_write` → later `manager_memory_read`, append-only revision audit, historical
  replay and separate-instance/model isolation still need runtime traces. The deterministic fixture
  specifies the contract but is not a substitute for those traces.
- Official IR web research → `at-time` WATCH → scheduled wake → actual release/missing retry →
  Evidence/Thesis/Decision → next WATCH needs a real CLI/web-enabled manager run in both KR and US.
- Planner, mandate, approval and target-weight handoff need shadow runtime evidence. No order code may
  be added to make this check pass.
- Legacy shadow parity, missed/false wake and source-freshness reports need enough consecutive market
  and earnings cycles; historical Harness records are never backfilled as Aumos performance.

The PR must stay Draft and the catalogue index must not publish this package until these items have
runtime evidence or an explicitly reviewed scope decision in the issue.
