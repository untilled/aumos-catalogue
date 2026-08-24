# Evidence-Gated Allocator

Evidence-Gated Allocator is one package containing three long-only Aumos managers for equities, ETFs
and cash on XKRX, XNAS and XNYS. It ports the methodology and validation loop of
`morethanmin/trading-harness`, not its personal
state or execution stack. It asks two questions before changing a portfolio:

1. Is there a falsifiable thesis, opposing evidence and a better case than the benchmark alternative?
2. Has this kind of judgement accumulated enough independent forward evidence to deserve its size?

It handles `PORTFOLIO_REVIEW`, `ASSET_REVIEW`, `THESIS_REVIEW` and `EVENT_REVIEW`, and can propose a
single-asset BUY/SELL/RESIZE or a multi-asset REBALANCE. It submits exactly one AMP/1
`DecisionProposal` per manager run. Toss broker integration, quantities, order type, limits, approval and
execution remain entirely with Aumos Kernel and Planner; this package contains no order code.

## Three-manager topology

| manager | ownership |
|---|---|
| `evidence-gated-kr` | XKRX research and KR sleeve BUY/SELL/RESIZE inside the Global Brief budget |
| `evidence-gated-us` | XNAS/XNYS research and US sleeve, including policy-designated SGOV liquidity |
| `evidence-gated-global` | KRW/USD sleeve targets, FX, global cash/concentration and cross-market REBALANCE |

Each is a separate manager instance with separate private memory. They collaborate through Evidence,
Thesis, Brief and WATCH. Specialists cannot borrow the other market's budget; they raise a shared
Brief/WATCH agenda for Global. Urgent thesis invalidation exits do not wait for the next Global run.

## What makes it different

A scanner score is discovery, not edge. Mean reversion and trend pullback are evaluated as different
lenses. A new single-name BUY requires why-cheap, structural trap risk, a falsifiable variant view,
benchmark alternative and adversarial thesis challenge. Conditions that are not met become
machine-evaluable WATCH/plan entries rather than prose that disappears. Closed Aumos outcomes update
per-lens maturity and calibration in instance-private memory. Low maturity permits a small controlled
experiment when every research gate is complete; it never licenses confident sizing.

## State ownership

| information | canonical owner | example |
|---|---|---|
| live positions, cash, fills | Portfolio / Toss broker connector | weight and available cash |
| asset claim | Thesis | stance and testable invalidation |
| portfolio-wide conclusion | Brief | regime, sector view, new-entry hold |
| raw research | Evidence | vendor price, filing, news payload |
| revisit commitment | WATCH / plan | price, date, filing trigger and expiry |
| learning aggregate | private manager memory | lens samples, calibration, repeated failures |
| actual judgement/outcome | Decision journal / Forward Track Record | BUY/WAIT/SELL and forward result |
| permanent rule | package version / config | approved threshold or method change |

Private memory never contains active theses, raw evidence bodies, shared Brief content, executable
gates, orders/fills, copied stale source data or self-approved rule changes. Briefs are readable by
other managers on the same book; private memory is scoped to this package instance/model. Different
instances and models do not share it.

## Data architecture and installation policy

The Toss broker connector is not the `toss` source. The connector owns account state and execution;
the source relays public market endpoints. A complete US single-name lane installs `toss`,
`sec-edgar` and `alpaca`. `openbb-fmp` is optional and only supplements long price history. A complete
Korean single-name fundamental lane additionally requires OpenDART, which is not yet published in the
catalogue ([tracking issue #51](https://github.com/untilled/aumos-catalogue/issues/51)). Until it is,
Korean ETF and existing-position price/weight management can run, with
fundamental uncertainty stated, but a new Korean single-name fundamental BUY or thesis promotion is
an unable-to-judge WAIT.

Every source call receives invocation `asOf`. The manager discards later rows and measures freshness
from market availability: SEC `filed`, OpenDART receipt time/number, publication/announcement time
for news/actions, and bar timestamp. Snapshots that always return current state are not replay
sources. Adjusted and unadjusted series are never mixed and corporate actions are used to explain
discontinuities.

| missing | continues | blocked |
|---|---|---|
| `toss` market source | existing Evidence/Thesis review | new price signal and target calculation |
| `sec-edgar` | Korean/ETF lane | new US fundamental BUY/promotion |
| `alpaca` news/actions | SEC/Toss review | a new judgement requiring news/action confirmation |
| OpenDART | Korean ETF and price/weight management | new Korean single-name fundamental BUY/promotion |
| CLI web | core/exit/weight management | theme radar, variant view and consensus-difference claims |

CLI web is supplementary for IR, consensus, policy and theme context. It is not canonical replay
Evidence: a run records checked URLs, access time and unverified scope. Failure is explicit and never
silently replaced with model knowledge.

## Memory contract

The package uses nine stable keys documented in `skills/memory-contract/SKILL.md`. Values are JSON
objects with schema version, update instant, supporting Decision/Evidence ids, sample/independent
cluster counts, computable metrics, missing fields and maturity status. Writes reuse a key and create
a new revision only when an aggregate changes. A historical replay reads the newest revision at or
before its own `asOf`, not today's head. Empty or malformed memory is diagnosed and safely ignored,
so a first run still returns a valid WAIT, WATCH or qualified BUY.

Reproduce the reference contract locally:

```sh
node tools/verify-evidence-gated-allocator.mjs
```

The fixture proves run A → run B persistence, append-only same-key revisions, historical replay,
instance/model isolation, shared-Brief/private-memory separation, audit/Evidence observability,
empty-memory operation and malformed-memory degradation. It also checks future-row removal,
staleness, source conflict and adjusted/unadjusted mixing. The fixture is a deterministic contract
model; a release candidate must additionally repeat the same cases in paper/shadow runs against its
installed Aumos runtime and a Toss-connected paper portfolio.

`IMPLEMENTATION.md` mirrors issue #50's Phase 0–7 checklist, and `CONFORMANCE.md` separates checks
that run in this repository from release gates that require an installed runtime and investor-owned
connections. The package stays unpublished while any release gate remains open.

## Skills and workflow

`PROMPT.md` contains only the invariant run skeleton. Conditional detail lives in:

- `evidence-gates`: sample independence, maturity and entry gates;
- `data-source-contract`: endpoints, time boundaries and degradation;
- `candidate-research`: lens-specific why-cheap/trap/variant/benchmark work;
- `thesis-challenge`: adversarial review and unresolved-risk blocking;
- `sizing-and-concentration`: target weights, caps and WATCH hygiene;
- `outcome-calibration`: forward outcome metrics and failure taxonomy;
- `memory-contract`: keys, revisions, isolation and migration.
- `deterministic-metrics`: the versioned stdin-JSON/stdout-JSON calculation executable.

Scanner, sizing, coverage, evidence admission, calibration, attribution, point-in-time parsing and
scheduling calculations run through `bin/evidence-gated-metrics`; they do not depend on LLM prose.
The executable has no filesystem-ledger, credential, network, database or order access. See
`MIGRATION.md` for all 65 legacy executables/helpers and their disposition, and `fixtures/legacy-golden`
for parity cases.

The executable also owns promotion-gate cluster bootstrap/walk-forward/FDR, fill-cost outcome and
forward MFE/MAE calculations, mechanical trend/DCA/oversold backtests, specialist sleeve enforcement,
the single Global allocation denominator, and schedule drift/late-fire/dedupe diagnostics. Fixtures
are split into `kr`, `us`, and `global` so market-specific failures cannot be hidden by a package-wide
happy path.

The compact examples in `sizing-and-concentration` cover WAIT, WATCH, BUY, SELL, RESIZE and
REBALANCE. Wire keys and enum values remain English even when invocation `language` is Korean; only
investor-facing prose is translated.

## Migration and provenance

For a private authored instance only, a one-time bootstrap may route active asset claims to Thesis,
book conclusions to Brief, live review conditions to WATCH/plan, raw research to Evidence, and only
aggregate sample/calibration/failure state to private memory. `migration/schema-version` prevents a
second import. The public package always starts empty.

Ported from `morethanmin/trading-harness` at the commit recorded in `aumos.json`. The mapping is:

| source concept | Aumos destination |
|---|---|
| candidate lenses and research/challenge rules | package skills |
| safe user-tunable thresholds | config schema |
| per-asset authored claims/invalidation | Thesis |
| regime/sector/entry holds | Brief |
| conditional rechecks | WATCH / plan |
| closed-sample and calibration aggregate | private memory |

No credentials, account/position data, `data/*.jsonl`, SQLite, cache, backup, `_workspace`, personal
thesis text, order implementation or historical performance is included. Historical Harness results
are not Aumos Forward Track Record. See `NOTICE.md` for attribution.

## Known limits

- OpenDART absence ([#51](https://github.com/untilled/aumos-catalogue/issues/51)) blocks the Korean
  single-name fundamental entry/promotion lane.
- OpenDART accepts its API key only as query parameter `crtfc_key`, while the currently published
  `SourceSpec/1` secret injector supports headers. A source is not claimed executable until Aumos can
  inject this query secret without exposing it to the manager.
- Source vendors relay their own response shapes; this manager, not Aumos, checks dates and freshness.
- CLI web observations are not replay-canonical Evidence.
- Calibration cannot promote or rewrite a methodology without a reviewed package/config change.
- Actual broker-connected paper/shadow and multi-run isolation checks require an installed Aumos
  runtime and credentials and are not simulated by this catalogue repository.
