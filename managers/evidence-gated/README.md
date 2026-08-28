# Evidence-Gated Allocator

`evidence-gated` runs one methodology as three market flows: a Korean sleeve, a US sleeve, and
the allocator that sets their budgets and proposes the cross-market `REBALANCE`.

It is a long-only Aumos manager for equities, ETFs and cash. It ports the methodology and validation loop of
`morethanmin/trading-harness`, not its personal
state or execution stack. It asks two questions before changing a portfolio:

1. Is there a falsifiable thesis, opposing evidence and a better case than the benchmark alternative?
2. Has this kind of judgement accumulated enough independent forward evidence to deserve its size?

It handles `PORTFOLIO_REVIEW`, `ASSET_REVIEW`, `THESIS_REVIEW` and `EVENT_REVIEW`, and can propose a
single-asset BUY/SELL/RESIZE or a multi-asset REBALANCE. It submits exactly one AMP/1
`DecisionProposal` per run. Toss broker integration, quantities, order type, limits, approval and
execution remain entirely with Aumos Kernel and Planner; this package contains no order code.

## The three flows

The roles are **subagents of this one manager**, dispatched in order by the orchestrator:

| flow | ownership |
|---|---|
| `kr-sleeve` | XKRX research and KR sleeve BUY/SELL/RESIZE inside the recorded budget |
| `us-sleeve` | XNAS/XNYS research and US sleeve, including policy-designated SGOV liquidity |
| `allocate` | KRW/USD sleeve targets, FX, book-wide cash/concentration and the cross-market REBALANCE |

The rules of each are in `skills/<flow>/SKILL.md`; `agents/<flow>.md` is the thin file that
names the skill. Sequential and not parallel: `allocate` prices the two sleeves against each
other and cannot do that against a sleeve that is still deciding.

⛔ **Only the orchestrator calls `decision_submit`, and exactly once.** A run seals one
judgement and the second submission of a run is refused, so a flow that submitted would seal a
judgement the other two never saw and take the orchestrator's own down with it. Said in the
prompt, in all four skills, and enforced by `hooks/guard-submit.mjs` — a `PreToolUse` hook that
refuses the call when the payload names a subagent.

⚠️ **This was three packages until 2026-08-27** (`evidence-gated-kr`, `-us`, `-global`), and the
split cost more than it bought: the three shipped byte-identical `lib/`, `bin/`, `fixtures/` and
`skills/`, differing only in four lines of prompt and their manifests — three copies of one
methodology, free to drift, that an investor had to find and install three times. What is
genuinely lost is per-sleeve scoring and per-sleeve approval: the track record's row and the
approval gate are now one manager and one basket. `untilled/aumos#489` argues the trade.

## What makes it different

A scanner score is discovery, not edge. Mean reversion, trend pullback and quality pullback are
evaluated as different lenses — the last one is the 15–35%-off-high band above the MA200 that the
other two drop between them, where a quality name gets *less* covered the cheaper it becomes. A new
single-name BUY requires why-cheap, structural trap risk, a falsifiable variant view, benchmark
alternative and adversarial thesis challenge. Entry quality is refused in code rather than described:
a falling knife blocks, and a mean-reversion candidate standing alone needs a confirmed basing or
pullback state. Risk is capped on four weight axes — position, sector, theme and factor — and on
total loss if every stop fired at once, which none of the weight axes measures. Conditions that are not met become
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
Korean single-name fundamental lane additionally requires `open-dart`, published in this catalogue
alongside this package. Where it is not installed, Korean ETF and existing-position price/weight
management can run with fundamental uncertainty stated, but a new Korean single-name fundamental BUY
or thesis promotion is an unable-to-judge WAIT — a machine that has not installed the source, rather
than a capability nobody has.

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
| `open-dart` | Korean ETF and price/weight management | new Korean single-name fundamental BUY/promotion |
| CLI web | core/exit/weight management | theme radar, variant view, consensus-difference and policy/macro claims |

The manifest names `toss`, `sec-edgar`, `alpaca` and `open-dart` on its `source:passthrough`
capability, so the install screen can say which of them this machine is missing before a run
discovers it. `openbb-fmp` is not named because it is optional. Naming a source does not narrow the
gateway — a run still sees every source installed on the machine.

Three OpenDART behaviours are the manager's to handle, because Aumos relays unread: `corpCode.xml`
answers with a ZIP (read `corp_code`/`stock_code` off `list.json` instead), errors arrive as a
`status` field on an HTTP 200 (a quota refusal is not an empty result), and XBRL statements follow
the periodic report, so a quarter announced only preliminarily has no statement — a gap to record,
never one to fill with the preliminary figures.

CLI web is supplementary for IR, consensus, policy, macro and theme context. It is not canonical
replay Evidence: a run records checked URLs, access time and unverified scope. Failure is explicit and
never silently replaced with model knowledge.

Web figures are typed and dated before use, and the deterministic core enforces both contracts.
Consensus, company guidance and reported actuals stay three separate observations carrying metric,
value with unit and currency, period, source URL, publication time and capture time; an undated
snippet is not point-in-time evidence, and disagreeing aggregators are recorded as a conflict rather
than averaged. Macro and policy readings — VIX, put/call, sentiment, breadth, index level and moving
averages, central-bank and industry policy — need an observation time and a source tier, an official
publisher outranks an aggregator restatement, and an undated reading is refused rather than treated as
current. A web price is cross-checked against Toss; beyond `priceConflictTolerance`, 5% by default, Toss is the
selected price and the difference is kept as provenance. There is no macro score: a regime call is a
Brief judgement at one `asOf`, not a number this package can hold.

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

- `theme-radar`: forward research — where an idea comes from, and what a forward thesis must carry;
- `position-research`: the sell-side watch on what is already held, price and fundamentals in parallel;
- `evidence-gates`: sample independence, maturity and entry gates;
- `data-source-contract`: endpoints, time boundaries and degradation;
- `candidate-research`: lens-specific why-cheap/trap/variant/benchmark work;
- `thesis-challenge`: adversarial review and unresolved-risk blocking;
- `sizing-and-concentration`: target weights, caps and WATCH hygiene;
- `outcome-calibration`: forward outcome metrics and failure taxonomy;
- `memory-contract`: keys, revisions, isolation and migration.
- `deterministic-metrics`: the versioned deterministic calculation interface.

Scanner, sizing, coverage, evidence admission, calibration, attribution, point-in-time parsing and
scheduling calculations run through the package's `evidence-gated-metrics` MCP server; they do not
depend on LLM prose or an interactive Bash approval. `bin/evidence-gated-metrics` exposes the same
core as stdin-JSON/stdout-JSON for operators and CI. Neither interface has filesystem-ledger,
credential, network, database or order access. See
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

## Parity with the original harness

The methodology was ported, not paraphrased. `tools/legacy-parity.mjs` runs the original Python core
and this package's deterministic core over the same synthetic inputs and compares them field by field
— 21 cases and 59 fields at the time of writing. The legacy numbers are measured once and frozen into
`fixtures/legacy-golden/parity.json`, so the comparison runs here without Python and without the
private checkout. Where the two deliberately part, `MIGRATION.md` says which field, which direction
and why, and the fixture asserts the difference so it cannot be undone silently.

## Known limits

- Not installing `open-dart` blocks the Korean single-name fundamental entry/promotion lane. The
  source is published ([#51](https://github.com/untilled/aumos-catalogue/issues/51)); a machine that
  has not installed it, or has no API key for it, is a machine that cannot judge Korean fundamentals.
- **`thesis:read` and `evidence:read` are declared and serve nothing in the current Aumos build.**
  The manifest vocabulary carries both, and `grant.ts` maps each to an empty tool list, so a run gets
  no `thesis_read`/`evidence_read` tool. The prompt reads them *when available* and the manifest lists
  them under `optionalSkills` for exactly that reason. Until Aumos serves them, asset claims reach a
  run through the invocation payload and through Brief, and the package says so rather than implying
  a lookup it cannot make. `RunProvenance.unservedTools` is where a run records the difference.
- **The paper track lives in instance-private memory, because nothing else can hold it.** A paper
  call has no order and no fill, so it is not a Decision; the runtime publishes no `thesis:write`
  and `thesis:read` grants no tool. `learning/paper-cohorts` therefore carries running sums and an
  index of open measurement windows. Two consequences follow and neither is hidden: another manager
  on the same book cannot see this evidence, and a new manager instance starts the track over. A
  shared record would be the right home; this is the one the runtime serves.
- The forward-research and sell-side layers are ported, but their track record is not. `theme-radar`
  produces `thesis_call` paper positions and `sectorStrength` logs the two mechanical baselines they
  are measured against; the comparison that answers "do the team's calls beat the index *and* the
  bot?" needs months of closed windows before it says anything. Until then the research layer's edge
  is a hypothesis, exactly as the baseline's is.
- Source vendors relay their own response shapes; this manager, not Aumos, checks dates and freshness.
- CLI web observations are not replay-canonical Evidence.
- Calibration cannot promote or rewrite a methodology without a reviewed package/config change.
- Actual broker-connected paper/shadow and multi-run isolation checks require an installed Aumos
  runtime and credentials and are not simulated by this catalogue repository.
