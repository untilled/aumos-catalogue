# Implementation tracker

This is the package-local mirror of issue #50's Phase 0–7 plan. A checked item means code plus a
reproducible catalogue fixture exists. Runtime-only acceptance remains unchecked even when its
deterministic contract is complete.

## Phase 0 — platform and contracts

- [x] Three-manager manifest and market/task ownership
- [x] Toss connector/source boundary, source freshness/conflict/degradation matrix
- [x] Manifest names its required sources on `source:passthrough`; vendored catalogue lint refreshed to the build that reads the field
- [x] Sleeve-budget Brief ownership and Global-only cross-market allocation
- [x] Producer-less `event` WATCH refusal; earnings use official web research plus `at-time`
- [x] Timezone/DST/session input, bounded retry and schedule-drift contracts
- [x] Secure OpenDART `crtfc_key` query-secret injection (aumos #419/#422) and a published
      `sources/open-dart` document named by this manifest
- [x] KR/US market-calendar endpoints declared by the installed `toss` source and consumed by
      `nextMarketReview` instead of a 24-hour addition
- [ ] Those two endpoints called against real sessions — needs Toss credentials

## Phase 1 — common methodology and legacy code

- [x] 65 Python entry points/helpers inventoried with disposition and owners
- [x] Deterministic executable with no file/network/credential/database/order access
- [x] Non-interactive stdio MCP wrapper over the same deterministic core
- [x] ⚠️ ~~Explicit per-instance `config.managerId`; no role inference from AMP instance ids~~ — **superseded by the collection split** (aumos #447): the role is the package, so there is no selector and no inference to refuse
- [x] Evidence gate, two lenses, research/challenge, thesis metadata/sentinel and WATCH hygiene
- [x] Scanner, sizing, coverage, calibration, promotion, outcome, attribution and backtest core
- [x] Memory value/replay/isolation contract and canonical-owner migration mapper
- [x] Synthetic legacy-golden and KR/US/Global fixtures
- [x] Every retained numeric field compared to a frozen Python output, including bootstrap CI — 21 cases, 59 fields, two recorded methodology differences (`MIGRATION.md`)

## Phase 2 — US specialist

- [x] Toss-shaped bars, Alpaca adjustment boundary, SEC companyfacts/submissions `asOf` parsing
- [x] Consensus provenance, preview/actual anchor, BMO/AMC/date-only scheduling and bounded retry
- [x] Web-research layer: consensus/guidance/actual kept as three typed observations, dated macro and policy readings, Toss-versus-web price conflict, IR preview → actual → sentinel cycle and web-absent lane blocking
- [x] Private memory refuses copied IR/news/consensus prose and cites Evidence ids instead
- [x] USD cash plus policy-designated SGOV liquidity
- [x] US source-missing/stale BUY degradation and lens calibration contracts
- [ ] Real US official-source fixture and full Thesis/WATCH/SELL/RESIZE/controlled-BUY runtime cycle

## Phase 3 — KR specialist

- [x] DART corp mapping/list/full-financial parsers and preliminary/correction/periodic distinction
- [x] KR source-missing/stale BUY degradation, schedule and lens calibration contracts
- [x] Executable OpenDART source (`sources/open-dart`, query-injected credential)
- [ ] Fixture recorded from the live vendor with a real `crtfc_key`
- [ ] Real KR preliminary/correction/periodic Thesis/WATCH/SELL/RESIZE/controlled-BUY runtime cycle

## Phase 4 — Global allocator

- [x] KRW/USD/SGOV sleeve NAV, FX requirement and one global budget denominator
- [x] Specialist boundary, urgent exit, concentration and cross-market REBALANCE fixture
- [x] AMP/1 multi-target REBALANCE conformance
- [x] Shared Brief revision and allocation calibration observed in installed runtime — three
      instances on one Toss-connected book, Global closing both specialists' open questions

## Phase 5 — scheduling and events

- [x] Exact/BMO/AMC/date-only, DST, holiday and early-close fixtures
- [x] Schedule change/stale WATCH, delay/retry, late fire, dedupe, outage and theme-radar fixtures
- [x] No `event: earnings` proposal in accepted AMP fixtures
- [ ] Consecutive KR close → US close → Global runtime trace
- [ ] Real official-web earnings schedule and actual/missing/fallback cycles for both specialists

## Phase 6 — state cutover

- [x] Thesis/Brief/WATCH/Evidence/memory mapping and one-time marker contract
- [x] No Forward Track Record backfill; post-cutover legacy mode is read-only
- [x] No credential, account, raw ledger, cache, backup or personal thesis included
- [ ] Investor-owned active state migration, owner audit and rollback timestamp

## Phase 7 — shadow and publication

- [x] Catalogue lint and deterministic package verification
- [x] Six AMP/1 proposal shapes parsed by the current Aumos schema
- [x] All six canonical conformance cases run against a real CLI: completed, schema-valid `WAIT`,
      Korean prose with an English wire (`CONFORMANCE.md`)
- [x] A conformant *report* — **AMP/1 CONFORMANT**, six of six, after three harness defects in
      `untilled/aumos` were fixed (aumos #424, #442); see `CONFORMANCE.md`
- [x] Three-manager Toss-connected shadow installation — one full KR → US → Global cycle
- [ ] *Sufficient consecutive* cycles across real session boundaries — calendar-bound, not effort-bound
- [ ] Legacy parity, coverage, missed/false wake and freshness reports
- [ ] Planner/mandate/approval boundary runtime verification
- [ ] Legacy retirement checklist and reviewed cutover
- [ ] Remove WIP/Draft status and add catalogue index entry
