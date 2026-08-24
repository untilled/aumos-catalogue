# Implementation tracker

This is the package-local mirror of issue #50's Phase 0–7 plan. A checked item means code plus a
reproducible catalogue fixture exists. Runtime-only acceptance remains unchecked even when its
deterministic contract is complete.

## Phase 0 — platform and contracts

- [x] Three-manager manifest and market/task ownership
- [x] Toss connector/source boundary, source freshness/conflict/degradation matrix
- [x] Sleeve-budget Brief ownership and Global-only cross-market allocation
- [x] Producer-less `event` WATCH refusal; earnings use official web research plus `at-time`
- [x] Timezone/DST/session input, bounded retry and schedule-drift contracts
- [ ] Secure OpenDART `crtfc_key` query-secret injection and published source
- [ ] Installed KR/US market-calendar endpoint verified against real sessions

## Phase 1 — common methodology and legacy code

- [x] 65 Python entry points/helpers inventoried with disposition and owners
- [x] Deterministic executable with no file/network/credential/database/order access
- [x] Non-interactive stdio MCP wrapper over the same deterministic core
- [x] Explicit per-instance `config.managerId`; no role inference from AMP instance ids
- [x] Evidence gate, two lenses, research/challenge, thesis metadata/sentinel and WATCH hygiene
- [x] Scanner, sizing, coverage, calibration, promotion, outcome, attribution and backtest core
- [x] Memory value/replay/isolation contract and canonical-owner migration mapper
- [x] Synthetic legacy-golden and KR/US/Global fixtures
- [ ] Every retained numeric field compared to a frozen Python output, including bootstrap CI

## Phase 2 — US specialist

- [x] Toss-shaped bars, Alpaca adjustment boundary, SEC companyfacts/submissions `asOf` parsing
- [x] Consensus provenance, preview/actual anchor, BMO/AMC/date-only scheduling and bounded retry
- [x] USD cash plus policy-designated SGOV liquidity
- [x] US source-missing/stale BUY degradation and lens calibration contracts
- [ ] Real US official-source fixture and full Thesis/WATCH/SELL/RESIZE/controlled-BUY runtime cycle

## Phase 3 — KR specialist

- [x] DART corp mapping/list/full-financial parsers and preliminary/correction/periodic distinction
- [x] KR source-missing/stale BUY degradation, schedule and lens calibration contracts
- [ ] Executable OpenDART source and real vendor fixture
- [ ] Real KR preliminary/correction/periodic Thesis/WATCH/SELL/RESIZE/controlled-BUY runtime cycle

## Phase 4 — Global allocator

- [x] KRW/USD/SGOV sleeve NAV, FX requirement and one global budget denominator
- [x] Specialist boundary, urgent exit, concentration and cross-market REBALANCE fixture
- [x] AMP/1 multi-target REBALANCE conformance
- [ ] Shared Brief revision and allocation calibration observed in installed runtime

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
- [ ] Three-manager Toss-connected shadow installation and sufficient consecutive cycles
- [ ] Legacy parity, coverage, missed/false wake and freshness reports
- [ ] Planner/mandate/approval boundary runtime verification
- [ ] Legacy retirement checklist and reviewed cutover
- [ ] Remove WIP/Draft status and add catalogue index entry
