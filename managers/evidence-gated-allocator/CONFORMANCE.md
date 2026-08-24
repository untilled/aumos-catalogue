# Conformance record

This file separates reproducible package checks from checks that require an installed Aumos runtime,
credentials or an investor-owned portfolio. Passing the first set is not permission to publish.

## Reproducible in this catalogue

Run:

```sh
npm run lint
npm run lint:sources
node tools/verify-evidence-gated-allocator.mjs
```

The verifier covers:

- the 65-entry migration matrix and every named fixture group;
- deterministic stdin-JSON/stdout-JSON metrics and blocked exit code;
- legacy indicators, scanners, sizing, outcomes, attribution and mechanical backtests;
- cluster bootstrap, walk-forward OOS, BH-FDR and the combined promotion gate;
- empty/corrupt/future/private-memory rules and one-time canonical-owner migration;
- KR/US/Global ownership, sleeve budgets and the single Global cash denominator;
- SEC/DART point-in-time parsing, future-row removal, missing/stale lane degradation and adjustment
  conflicts;
- exact/BMO/AMC/date-only checkpoints, DST, holiday, early close, schedule drift, bounded retry,
  late fire, outage, dedupe and theme-radar override;
- producer-less `event` WATCH rejection and AMP/1 action/target consistency;
- absence of network, broker/order/database capabilities in the manager manifest.

On 2026-08-25 all six proposal fixtures were also parsed directly by
`@aumos/amp` `decisionProposalSchema` version `0.3.2` at Aumos commit
`72cffae67f7fb4db24fe7a0dd1d1ae266abba5b6`: WAIT, WATCH, BUY, SELL, RESIZE and REBALANCE all passed.
SELL uses the current `exit` target shape; the multi-asset REBALANCE is one Decision with three
targets.

## Release-gating checks that are not complete

- Aumos does not yet have a secure SourceSpec query-secret injector for OpenDART's mandatory
  `crtfc_key`; the structured KR single-name lane therefore remains blocked.
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
