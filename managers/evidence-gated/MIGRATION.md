# Trading Harness migration matrix

This matrix inventories the 65 Python-shebang executables and their shared helpers in the preserved
legacy tree at local commit `1fa18c595baa742f7323366a3c220fec5c6535a7` (2026-08-25 inventory).
That restoration commit is not present on the public remote; the last public pre-removal tree is
`b4db865aced6c5b9c0c80d7f1c3bc661722fdee6` and contains four later executables not in the restored
baseline. Golden inputs and outputs therefore travel in this package and identify both the algorithm
and rule version, so verification does not depend on a private checkout.

No credential, account row, position, thesis text, JSONL ledger, cache or `_workspace` output was
opened or copied to make this inventory. Credential-bearing files are listed by path only.

## Legend

Disposition:

- `AR` — `aumos_replaced`: Aumos owns execution or durable state; preserve its invariant in an
  integration fixture.
- `PP` — `port_pure_logic`: deterministic algorithm moves into `lib/` and is called by the package
  executable.
- `PX` — `port_partial`: remove file/network/credential state and port parsing or calculation only.
- `RT` — `retire`: UI, launcher, local notification or glue is redundant; link its Aumos owner.

Legacy I/O codes: `P` portfolio snapshot; `E` raw market/fundamental evidence; `T` thesis metadata;
`B` book/policy conclusion; `W` gate/schedule; `D` decision/outcome/performance; `C` config/policy;
`H` price history; `U` universe; `O` order/fill lifecycle; `X` generated workspace/report. Global
state is normally `HARNESS_ROOT`, `data/`, `_workspace/` and sibling `bin/`; the matrix calls out
exceptions. “Aumos input/output” names the replacement owner and structured result.

## Executables

| legacy executable | disposition | legacy input → mutation | API / global state | rule version | Aumos input/output, preserved rule and removed side effect | golden fixture |
|---|---|---|---|---|---|---|
| `attribution-report` | PP | D,H,C → X | filesystem | issue-13 identity | Portfolio/Track Record → attribution JSON; exact core beta + noncore benchmark beta + selection + cash/FX identity; remove report files | `attribution` |
| `attribution-selftest` | PP | synthetic → none | none | issue-13 | preserve identity, missing-leg and reconciliation assertions | `attribution` |
| `backtest-mech` | PP | H,U,C → X | filesystem | 2026-07-13 prereg | Evidence bars → backtest JSON; preserve trend/DCA/oversold horizons and sample counts; remove reports | `backtest` |
| `baseline-track` | PP | P,H,D → X/JSONL | Toss read + filesystem | issue-13 | Portfolio/Evidence → passive-baseline comparison; no local ledger | `attribution` |
| `buy-radar` | PP | U,H,P → X | Toss read | lens-v1 | Evidence/config → candidates; RSI/MA/off-high/volume and separate mean-reversion/trend-pullback/quality-pullback lenses. Lens C is the -15%..-35%-off-high band above MA200 the first two drop between them (approved 2026-07-29, implementation anchored to 2026-08-24); its samples accrue under `calibration/quality-pullback` so no existing row is retagged | `scanner` |
| `calibration-selftest` | PP | synthetic → none | none | issue-10 | preserve Brier and scenario scoring assertions | `calibration` |
| `calibration-track` | PP | D snapshots/outcomes → JSONL/X | filesystem | issue-10 | Decision/Track Record → calibration JSON; immutable decision-time probabilities, no rescoring | `calibration` |
| `coverage-check` | PX | U,X,P,W,D → JSON/MD | filesystem, `_sectors` | coverage-v2 | Portfolio/Thesis/WATCH/Decision + scanner output → coverage diagnostics; union denominator, `uncovered=0`, expiry; remove ledger writes | `coverage` |
| `coverage-reason-selftest` | PP | synthetic → none | none | coverage-v2 | preserve disposition reason and universe-drift assertions | `coverage` |
| `daily-check` | AR | P,W,C,X → JSONL/X/notify | OS scheduler/notification | daily-v1 | Wake Engine scheduled run + diagnostics; preserve no-silent-skip and re-arm invariants; retire subprocess/UI/notification glue | `owner-cutover` |
| `decision-log` | AR | X,O,T,D → JSONL/snapshot | `HARNESS_ROOT` | decision-v2 | Decision journal/Forward Track Record owns immutable proposal and outcome linkage; remove local append/snapshot | `owner-cutover` |
| `earnings-event` | PX | E,U → JSONL | filesystem | R3 | Evidence/Thesis/WATCH → normalized preview/actual comparison; preserve primary-release anchor and event types; remove ledger | `earnings` |
| `earnings-event-selftest` | PP | synthetic → none | none | R3 | preserve preview/actual, filing-date and duplicate checks | `earnings` |
| `earnings-schedule` | PX | E,U,W → JSONL | filing cache | T1 | official web/source schedule observation → `at-time` WATCH; preserve provenance and business-day handling, replace cadence estimate as authority | `schedule` |
| `equity-track` | PX | P,O → JSONL | Toss read | issue-16 | Portfolio history → completeness/FX/missing-leg diagnostics; remove local NAV capture | `portfolio` |
| `exit-check` | PX | T,P,E → X/JSONL | Toss read | exit-v2 | Thesis/Portfolio/Evidence → SELL/TRIM/REVIEW diagnostics; preserve price and fundamental invalidation; no signal ledger | `exit` |
| `exit-signal-selftest` | PP | synthetic → none | none | §10-2 | preserve exit symmetry, dedupe and missing-price assertions | `exit` |
| `exit-track` | PX | D,H → JSONL/X | Toss read | §10-1 | Track Record/Evidence → d20/d60, MFE/MAE and capture metrics; remove mutable ledger | `exit` |
| `fundamentals` | PX | U/vendor payload → cache | OpenDART credential, SEC | R2 | source response → point-in-time normalized filing JSON; preserve scope, filed/receipt time, missing-as-null and derived metrics; remove credential/network/cache | `source-parsers` |
| `gate-check` | PX | W,E,C → X | Toss read, `_gates` | gate-v2 | WATCH + Evidence → evaluated diagnostics; preserve met/blocked/unevaluated semantics and the `no_new_low` dual lens — verdict from the intraday-low lens, close lens reported beside it, disagreement surfaced rather than resolved in favour of basing (approved 2026-07-27); no local gate file | `watch` |
| `gate-register` | PX | candidate,W,C → gate file | `_gates`, `_policy` | gate-v3 | proposed WATCH → validation JSON; reject already-met, unreported KPI and prose-only blocks; Aumos performs write | `watch` |
| `gate-register-selftest` | PP | synthetic → none | none | gate-v3 | preserve trigger hygiene and policy assertions | `watch` |
| `harness-app` | RT | all ledgers → HTML/server mutation | localhost server | UI-v1 | Aumos HOME/CALENDAR/portfolio UI; no renderer, server or config POST path | `owner-cutover` |
| `harness-audit` | PX | P,T,W,D,O,C,X → X | `HARNESS_ROOT`, `_sectors` | audit-v3 | Aumos snapshots → semantic diagnostics; preserve orphan, mismatch, stale and unregistered-ready blockers — a blocker stops planning, never reporting — the portfolio heat cap (P4, blocks only when the run adds new non-core risk) and the new-single pacing warnings (P5, warn-only at every sample count); remove filesystem orchestration | `audit` |
| `harness-selftest` | PX | synthetic repo → none | subprocess/filesystem | audit-v3 | port only Aumos-relevant semantic assertions; retire legacy path/executable checks | `audit` |
| `history-seed` | AR | imported H → H files | filesystem | history-v1 | source Evidence/history owner; no one-time local import in manager | `owner-cutover` |
| `history-snapshot` | PX | vendor H → H files | Toss read | history-v2 | source bars → completeness, monotonicity and adjustment diagnostics; remove local append | `source-parsers` |
| `lesson-audit` | PX | lessons,D,C → X | filesystem | learning-v1 | private memory + package/config revision → pending/accepted/rejected counts and stale-pending diagnostics; an unrecognised status is refused rather than bucketed; never auto-apply | `learning` |
| `lifecycle-selftest` | AR | synthetic O → none | none | issue-16 | Kernel order/fill conformance owns lifecycle invariants | `owner-cutover` |
| `market-score-log` | AR | score → JSONL | filesystem | macro-v1 | Evidence/Brief/Decision owns dated regime judgement; no local log | `owner-cutover` |
| `night-gate-check` | AR | W,E → notify | Toss read, notification | gate-v2 | Wake Engine price/at-time checks; preserve hard-block recheck via integration fixture | `owner-cutover` |
| `notify-policy-selftest` | RT | synthetic W → none | notification shell | gate-v2 | Aumos run diagnostics/UI; retire local delivery tests | `owner-cutover` |
| `opportunity-scan` | PP | U,H,P,O → X | Toss read | scanner-v2 (entry quality eq-v2) | normalized bars/portfolio/config → ranked research queue; preserve five axes, held/pending exclusion and the entry-quality gate — `falling_knife` blocks, a mean-reversion-only candidate needs a confirmed pass state (approved 2026-07-13), and sessions-since-new-low is read over the window *and* the last 60 bars with the stricter one winning (eq-v2, approved 2026-07-28); no HTML/files | `scanner` |
| `order-lifecycle` | AR | D,O → JSONL | broker/local ledger | issue-16 | Kernel order/fill record; preserve audit linkage outside manager | `owner-cutover` |
| `order-policy-selftest` | AR | synthetic C,O → none | `_policy` | policy-v2 | Mandate/Planner/Kernel conformance; manager only reports uncovered gaps | `owner-cutover` |
| `order-selftest` | AR | synthetic credential/order → none | Toss order path | order-v1 | broker connector/Planner approval tests; never packaged | `owner-cutover` |
| `outcome-review` | PX | D,O,H → JSONL/X | filesystem | outcome-v2 | Track Record → net/benchmark/process/failure result JSON; remove ledger mutation | `outcome` |
| `paper-log` | PX | candidate,T,D,H → JSONL | filesystem | paper-v2 | Decision/Track Record admission diagnostics; preserve promote/watch/reject and no stale promotion | `learning` |
| `paper-log-selftest` | PP | synthetic → none | none | paper-v2 | preserve admission and evidence-status assertions | `learning` |
| `performance-audit` | PP | D,T,H,C → X | filesystem | maturity-v2 | Decision/Track Record → evidence maturity/failure diagnostics; preserve complete closed-sample rule | `calibration` |
| `performance-sync` | AR | P,D → Markdown mutation | Toss read | performance-v1 | Portfolio/Track Record view; retire Markdown synchronization | `owner-cutover` |
| `pnl-selftest` | PP | synthetic fills/FX → none | none | issue-16 | preserve fee/tax/FX/net-return and missing-leg calculations | `outcome` |
| `policy-lint` | PX | C → diagnostics | `_policy` | policy-v2 | config/Mandate snapshot → versioned semantic diagnostics; no policy-file ownership | `policy` |
| `policy-selftest` | PP | synthetic C → none | none | policy-v2 | preserve threshold origin, hard-block and no-auto-relax checks | `policy` |
| `portfolio-html` | RT | P,T,D,W → HTML | filesystem/browser | UI-v1 | Aumos portfolio UI; retire renderer | `owner-cutover` |
| `portfolio-md` | RT | P,T,D,W → Markdown | Toss read/filesystem | UI-v1 | Aumos portfolio/Thesis/Decision views; retire renderer and snapshot write | `owner-cutover` |
| `promotion-gate` | PP | paper D/H → X | filesystem | issue-12/prereg | Track Record → promotion diagnostics; preserve clusters, walk-forward, costs, bootstrap CI and BH-FDR | `promotion` |
| `promotion-gate-selftest` | PP | synthetic → none | none | issue-12/prereg | preserve independence, OOS, CI, FDR and combined-gate assertions | `promotion` |
| `research-audit` | PP | candidate/challenge/plan → X | `_workspace` | research-v2 | structured research/evidence/challenge → blocker diagnostics; preserve completeness, EV, active edge and unresolved risk | `research` |
| `sector-strength` | PP | U,H → X/JSONL | Toss read | rs-v1 | bars/config → sector rank, regime and research queue; baseline signals are diagnostics, not BUY | `scanner` |
| `shadow-track` | PP | D,H,C → JSONL/X | Toss read | shadow-v1 | Decision/Evidence → virtual-size comparison JSON; no local sleeve ledger | `attribution` |
| `signal-paper` | PP | scanner,H,U → JSONL/X | Toss read | paper-v2 | scanner observations + bars → 5/20/60d, benchmark, sector excess, MFE/MAE; separate from real maturity | `learning` |
| `size-suggest` | PP | candidate,D,C,P → stdout | filesystem | sizing-v2 | research/calibration/portfolio/config → target-weight diagnostics; preserve EV/conviction, experimental ceiling and Kelly gate | `sizing` |
| `snapshot-selftest` | PX | synthetic D snapshots → none | filesystem | decision-v2 | preserve immutable/asOf snapshot semantics; remove local storage assertions | `audit` |
| `status-selftest` | PP | synthetic statuses → none | none | status-v2 | preserve closed enum and unknown-status diagnostics | `audit` |
| `thesis-meta` | PX | T sidecar → file | filesystem | R1 | Thesis input → catalyst/checkpoint/invalidation/provenance diagnostics; Aumos owns revision | `research` |
| `thesis-meta-selftest` | PP | synthetic T → none | none | R1 | preserve required metadata and incomplete-state assertions | `research` |
| `thesis-sentinel` | PX | T,E,P → X | Toss read | sentinel-v1 | Thesis + point-in-time Evidence → `intact|watch|threatened`; no local report | `earnings` |
| `toss-api` | AR | request → vendor response/cache | Toss credential/token | source-v1 | Toss source/broker connector; preserve read-only endpoint boundary, remove credential/cache | `owner-cutover` |
| `toss-order` | AR | order intent → preview/order/ledger | Toss credential, money mutation | order-v2 | Planner/Kernel/broker connector; preserve approval/cap gaps as platform issues, never manager code | `owner-cutover` |
| `trend-check` | PP | H,U → X | Toss read | trend-v1 | normalized bars/config → state and tranche guidance; preserve MA rules and drawdown-control label | `scanner` |
| `upside-radar` | PP | E,H,T,U → X/JSONL | filesystem | ur-v1 | normalized fundamentals/events/bars → research priority and falsification packet; missing remains unevaluated | `scanner` |
| `upside-radar-selftest` | PP | synthetic → none | none | ur-v1 | preserve missingness, ranking and no-price-confirmation assertions | `scanner` |
| `verdict-report` | PP | all learning axes → X | filesystem | prereg §6 | calibration/promotion/attribution outputs → threshold verdict; proposals only, no config mutation | `promotion` |
| `watch-schedule` | AR | W → OS timer/JSONL | systemd/notification | schedule-v1 | Aumos `at-time` WATCH/Wake Engine; preserve future-only and late-fire observability; retire OS timer | `schedule` |

## Shared helpers and non-Python wrappers

| legacy path | disposition | dependency / mutation | Aumos owner or port target |
|---|---|---|---|
| `bin/_common.py` | PP/PX | canonical indicators, return math, clusters, lifecycle helpers plus file I/O | split pure functions across `lib/`; delete file/path and JSONL helpers |
| `bin/_gates.py` | PX | gate parsing/evaluation plus file access | `lib/evidence/watch`; Aumos owns WATCH storage |
| `bin/_policy.py` | PX | policy loading, validation and provenance | `lib/evidence/policy`; Mandate/config own values |
| `bin/_sectors.py` | PP | market/sector normalization | `lib/coverage` and `lib/scanners` |
| `bin/_notify.sh`, `night-gate-notify`, `watch-notify` | RT | local desktop/WSL notification | Aumos diagnostics and UI |
| `schedule-install`, `session-task-install` | RT | launchd/systemd mutation | Aumos schedule/Wake Engine |
| `session-launch` | RT | `HARNESS_ROOT` session orchestration | Aumos manager run |
| `bin/README.md` | PX | legacy operator documentation | this matrix and package README |
| `toss-credentials.example.json` | RT | credential shape | Toss connector/source install surface |
| `toss-credentials.json`, `dart-credentials.json` | RT | **sensitive; contents not inspected** | Aumos credential store; never package |
| `toss-order-limits.json` | AR | money-movement limits | Mandate/Planner/Kernel; no manager write |

## Canonical algorithm groups

The 65 entry points collapse into eight deterministic groups rather than 65 copied scripts:

1. indicators and scanners;
2. sizing and sleeve concentration;
3. coverage and WATCH validation;
4. source parsers and point-in-time filtering;
5. research/evidence admission;
6. calibration, promotion and statistical correction;
7. outcome and attribution;
8. structured diagnostics and owner-cutover conformance.

The executable accepts Aumos JSON snapshots on stdin and writes one JSON document on stdout. It has
no credential, order, network, database, filesystem-ledger or personal-path access. Every result
includes `ruleVersion`, `asOf`, units/currency/market where relevant, and explicit
`missing`/`unevaluated` diagnostics rather than zero/false substitution.

## What the last column names, and what stands behind it

The `golden fixture` column names a **coverage group**, not a file. Seven of the nineteen groups
have a file of frozen numbers behind them in `fixtures/legacy-golden/`; the other twelve are
verified by contract cases built inside `tools/verify-evidence-gated-allocator.mjs`. Reading the
column as a filename made twelve groups look unported, and they are not — the two kinds of check
answer different questions:

| | what it holds | what it can be wrong about |
|---|---|---|
| frozen file — `core`, `scanner`, `promotion`, `outcomes`, `backtest`, `methodology`, `parity` | numbers measured once from the Python core, because that checkout is private | the port drifting away from a number the original produced |
| in-file case | a contract this port has to keep, built from synthetic inputs | the port breaking a rule the methodology states |

`fixtures/legacy-golden/group-coverage.json` registers which checks stand behind each group, and
since #70 that registry has to be earned: `covers()` marks the assertions behind each case name,
and the verifier fails when a registered name has no marker, a marker names an unregistered case,
or a marker is followed by no assertion at all. Before that, `blendedSectorStrength` was registered
under `scanner` while no test touched it, and nothing could have noticed.

## Golden parity against the Python core

The dispositions above say what each executable's rules became. This section says how that claim is
checked: `tools/legacy-parity.mjs` drives the frozen Python and the port with the same synthetic
inputs and compares them field by field.

```sh
node tools/legacy-parity.mjs --freeze <legacy-harness-root>   # measure, then write
node tools/legacy-parity.mjs                                  # compare against what was written
```

`tools/legacy-parity.py` is the bridge. It imports `bin/_common.py` and the pure `suggest()` in
`bin/size-suggest` from a checkout the operator names on the command line, and it holds no algorithm
of its own — a bridge that restated the calculation could only ever agree with the port. Nothing else
in the legacy tree is reachable from it: the `bin/*-credentials.json` files and the `data/` ledger of
real positions are named nowhere, and every parity input is synthetic.

The legacy side is measured once and frozen into `fixtures/legacy-golden/parity.json`, because the
legacy checkout is private and a check that only runs beside it is a check this repository cannot
make. **21 cases, 59 fields** currently match, covering the core/selection/cash-FX decomposition,
time- and money-weighted return, independent date clusters, the categorical Brier score, quintile
spread, Benjamini-Hochberg, cluster bootstrap, all five sizing modes, KRW and USD round-trip net
return, maximum drawdown, turnover and exposure.

⚠️ **The bootstrap interval cannot be exact and the fixture says so.** The legacy resamples with
`random.Random` and the port with `mulberry32-v1`, so the two draw different resamples from the same
distribution. Point estimate, cluster count, resample count and percentile indices are exact; the
interval bounds are compared against the envelope the *legacy implementation itself* produces across
ten seeds, which is what a Monte-Carlo bound can honestly claim. An envelope written by hand would be
a tolerance chosen to make the test pass, so it is measured too. Changing either PRNG is a
methodology-version change.

### Differences that are on purpose

A recorded difference is still a test: the fixture asserts that the port produces exactly the
recorded value, so a later change that quietly restores the legacy behaviour fails here.

| case | field | legacy | port | why |
|---|---|---|---|---|
| `sizing-invalid-risk-reward` | `suggestedWeight` | `0.0` | `null` + blocked | A non-positive reward:risk ratio is not a zero-sized position; it is an input the sizer cannot act on. `0.0` reads as a suggestion and can be averaged or drawn as a bar |
| `sizing-invalid-risk-reward` | `mode` | `"invalid"` | absent | A refused call has no sizing mode. The refusal travels in the diagnostics with its reason |

Two more differences were found and are **not** methodology: the legacy rounds the money-weighted
return to four decimals before returning it, and this repository spells enum values in kebab case.
Both are recorded in the fixture as a rounding rule and a value map so the comparison stays exact
rather than being loosened with a tolerance.
