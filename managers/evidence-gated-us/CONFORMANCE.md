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

This package is one member of the `evidence-gated` collection, and the cycle that exercised all three
is recorded once, in **`managers/evidence-gated-global/CONFORMANCE.md`** — kept in one place rather
than copied, because three copies of one measurement are three things that can disagree later.

What it establishes about *this* package: it ran on a Toss-connected book, read the briefs its
siblings had written, wrote its own, sealed a Decision, and reached no order path. The four defects
that had to be fixed first — all of them in `untilled/aumos`, none in any of these three packages —
are listed there too.

## Release-gating checks that are not complete

- ✅ *Resolved.* Aumos gained secure SourceSpec query-secret injection (aumos #419, merged as aumos
  #422), so `sources/open-dart` is published in this catalogue and the manifest names it. What is
  **not** yet done is a fixture recorded from the live vendor: the KR parsers are exercised against
  synthetic payloads, and a real `crtfc_key` is needed to confirm the receipt fields, the ZIP
  behaviour of `corpCode.xml` and the `status`-on-200 error path against the vendor itself.
- The three packages of this collection have not yet been installed together against the same Toss-connected shadow
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
