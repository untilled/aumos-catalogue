# Architecture

<sub><a href="ARCHITECTURE.ko.md">한국어</a></sub>

[README.md](README.md) is the page an investor reads. This is the engineering half of the
same package: who owns which piece of state, what the data and installation contract is,
how memory works, which skills exist, and how the port is held to the original.

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

Private memory never contains active theses, raw evidence bodies, shared Brief content,
executable gates, orders/fills, copied stale source data or self-approved rule changes.
Briefs are readable by other managers on the same book; private memory is scoped to this
manager instance. Different instances do not share it. A model swap is not a different
instance — the row is keyed by instance alone, so memory outlives the model that wrote it,
and deleting the manager is what ends it.

## Data architecture and installation policy

Toss and Alpaca market endpoints are relayed through the connections already linked to this fund;
their credentials remain with those logins and are not entered again as data sources. A complete US
single-name lane links both connections and installs `sec-edgar`. `openbb-fmp` is optional and only
supplements long price history. A complete Korean single-name fundamental lane additionally requires
`open-dart`, published in this catalogue alongside this package. Where it is not
installed, Korean ETF and existing-position price/weight management can run with
fundamental uncertainty stated, but a new Korean single-name fundamental BUY or thesis
promotion is an unable-to-judge WAIT — a machine that has not installed the source, rather
than a capability nobody has.

Every relay call receives invocation `asOf`. Aumos bounds the declared Toss and Alpaca request
parameters to that run; the manager still discards later rows from each unchanged vendor answer and measures
freshness from market availability: SEC `filed`, OpenDART receipt time/number,
publication/announcement time for news/actions, and bar timestamp. Snapshots that always
return current state are not replay sources. Adjusted and unadjusted series are never
mixed and corporate actions are used to explain discontinuities.

| missing | continues | blocked |
|---|---|---|
| Toss connection | existing Evidence/Thesis review | new price signal and target calculation |
| `sec-edgar` | Korean/ETF lane | new US fundamental BUY/promotion |
| Alpaca connection | SEC/Toss review | a new judgement requiring news/action confirmation |
| `open-dart` | Korean ETF and price/weight management | new Korean single-name fundamental BUY/promotion |
| CLI web | core/exit/weight management | theme radar, variant view, consensus-difference and policy/macro claims |

The manifest names Toss and Alpaca on `connection:passthrough`, and `sec-edgar` and `open-dart`
on `source:passthrough`, so the install screen can say which connection this fund lacks and which
source this machine lacks before a run discovers it. `openbb-fmp` is not named because it is
optional. Naming a source does not narrow the source gateway — a run still sees every source
installed on the machine.

Three OpenDART behaviours are the manager's to handle, because Aumos relays unread:
`corpCode.xml` answers with a ZIP (read `corp_code`/`stock_code` off `list.json`
instead), errors arrive as a `status` field on an HTTP 200 (a quota refusal is not an
empty result), and XBRL statements follow the periodic report, so a quarter announced only
preliminarily has no statement — a gap to record, never one to fill with the preliminary
figures.

CLI web is supplementary for IR, consensus, policy, macro and theme context. It is not
canonical replay Evidence: a run records checked URLs, access time and unverified scope.
Failure is explicit and never silently replaced with model knowledge.

Web figures are typed and dated before use, and the deterministic core enforces both
contracts. Consensus, company guidance and reported actuals stay three separate
observations carrying metric, value with unit and currency, period, source URL,
publication time and capture time; an undated snippet is not point-in-time evidence, and
disagreeing aggregators are recorded as a conflict rather than averaged. Macro and policy
readings — VIX, put/call, sentiment, breadth, index level and moving averages,
central-bank and industry policy — need an observation time and a source tier, an official
publisher outranks an aggregator restatement, and an undated reading is refused rather
than treated as current. A web price is cross-checked against Toss; beyond
`priceConflictTolerance`, 5% by default, Toss is the selected price and the difference is
kept as provenance. There is no macro score: a regime call is a Brief judgement at one
`asOf`, not a number this package can hold.

## Memory contract

The package uses fifteen stable keys documented in `skills/memory-contract/SKILL.md`. Values
are JSON objects with schema version, update instant, supporting Decision/Evidence ids,
sample/independent cluster counts, computable metrics, missing fields and maturity status.
Writes reuse a key and create a new revision only when an aggregate changes. A historical
replay reads the newest revision at or before its own `asOf`, not today's head. Empty or
malformed memory is diagnosed and safely ignored, so a first run still returns a valid
WAIT, WATCH or qualified BUY.

Reproduce the reference contract locally:

```sh
node tools/verify-evidence-gated-allocator.mjs
```

The fixture proves run A → run B persistence, append-only same-key revisions, historical
replay, instance isolation, model-swap continuity, shared-Brief/private-memory separation, audit/Evidence
observability, empty-memory operation and malformed-memory degradation. It also checks
future-row removal, staleness, source conflict and adjusted/unadjusted mixing. The fixture
is a deterministic contract model; a release candidate must additionally repeat the same
cases in paper/shadow runs against its installed Aumos runtime and a Toss-connected paper
portfolio.

`IMPLEMENTATION.md` mirrors issue #50's Phase 0–7 checklist, and `CONFORMANCE.md`
separates checks that run in this repository from release gates that require an installed
runtime and investor-owned connections. The package stays unpublished while any release
gate remains open.

## Skills and workflow

`PROMPT.md` contains only the invariant run skeleton. Conditional detail lives in:

- `orchestrate`: which flow this wake is for, what a single-sleeve run may propose, how a flow is dispatched, and which lanes this session actually holds when it is;
- `theme-radar`: forward research — where an idea comes from, and what a forward thesis must carry;
- `position-research`: the sell-side watch on what is already held, price and fundamentals in parallel;
- `evidence-gates`: sample independence, maturity and entry gates;
- `data-source-contract`: endpoints, time boundaries, degradation, and what a vendor error may be recorded as;
- `candidate-research`: lens-specific why-cheap/trap/variant/benchmark work;
- `thesis-challenge`: adversarial review and unresolved-risk blocking;
- `sizing-and-concentration`: target weights, caps and WATCH hygiene;
- `outcome-calibration`: forward outcome metrics and failure taxonomy;
- `memory-contract`: keys, revisions, isolation and migration;
- `deterministic-metrics`: the versioned deterministic calculation interface.

Scanner, sizing, coverage, evidence admission, calibration, attribution, point-in-time
parsing and scheduling calculations run through the package's `evidence-gated-metrics` MCP
server; they do not depend on LLM prose or an interactive Bash approval.
`bin/evidence-gated-metrics` exposes the same core as stdin-JSON/stdout-JSON for operators
and CI. Neither interface has filesystem-ledger, credential, network, database or order
access. See `MIGRATION.md` for all 65 legacy executables/helpers and their disposition,
and `fixtures/legacy-golden` for parity cases.

The executable also owns promotion-gate cluster bootstrap/walk-forward/FDR, fill-cost
outcome and forward MFE/MAE calculations, mechanical trend/DCA/oversold backtests,
specialist sleeve enforcement, the single Global allocation denominator, and schedule
drift/late-fire/dedupe diagnostics. Fixtures are split into `kr`, `us`, and `global` so
market-specific failures cannot be hidden by a package-wide happy path.

The compact examples in `sizing-and-concentration` cover WAIT, WATCH, BUY, SELL, RESIZE
and REBALANCE. Wire keys and enum values remain English even when invocation `language` is
Korean; only investor-facing prose is translated.

## Migration and provenance

For a private authored instance only, a one-time bootstrap may route active asset claims
to Thesis, book conclusions to Brief, live review conditions to WATCH/plan, raw research
to Evidence, and only aggregate sample/calibration/failure state to private memory.
`migration/schema-version` prevents a second import. The public package always starts
empty.

Ported from `morethanmin/trading-harness` at the commit recorded in `aumos.json`. The
mapping is:

| source concept | Aumos destination |
|---|---|
| candidate lenses and research/challenge rules | package skills |
| safe user-tunable thresholds | config schema |
| per-asset authored claims/invalidation | Thesis |
| regime/sector/entry holds | Brief |
| conditional rechecks | WATCH / plan |
| closed-sample and calibration aggregate | private memory |

No credentials, account/position data, `data/*.jsonl`, SQLite, cache, backup,
`_workspace`, personal thesis text, order implementation or historical performance is
included. Historical Harness results are not Aumos Forward Track Record. See `NOTICE.md`
for attribution.

## Parity with the original harness

The methodology was ported, not paraphrased. `tools/legacy-parity.mjs` runs the original
Python core and this package's deterministic core over the same synthetic inputs and
compares them field by field — 21 cases and 59 fields at the time of writing. The legacy
numbers are measured once and frozen into `fixtures/legacy-golden/parity.json`, so the
comparison runs here without Python and without the private checkout. Where the two
deliberately part, `MIGRATION.md` says which field, which direction and why, and the
fixture asserts the difference so it cannot be undone silently.

## Known limits

- Not installing `open-dart` blocks the Korean single-name fundamental entry/promotion
  lane. The source is published
  ([#51](https://github.com/untilled/aumos-catalogue/issues/51)); a machine that has not
  installed it, or has no API key for it, is a machine that cannot judge Korean
  fundamentals.
- **`thesis:read` and `evidence:read` are declared and serve nothing in the current Aumos
  build.** The manifest vocabulary carries both, and `grant.ts` maps each to an empty tool
  list, so a run gets no `thesis_read`/`evidence_read` tool. The manifest lists them under
  `optionalSkills` for exactly that reason — that field is machine-readable and no run reads it.
  ⚠️ **What a run reads used to say *when available*, and that was not enough** (2026-09-01): a
  real session went looking for `thesis_read`, `evidence_read` and `manager_memory_read` — the
  last of which is a spelling no build has ever had — and reported the gap itself. *When
  available* reads as *ask and find out*, and asking costs turns. `PROMPT.md` and
  `skills/orchestrate/SKILL.md` now name only what is served and say plainly that those are not
  tools. Until Aumos serves them, asset claims reach a run through the invocation payload and
  through Brief, and the package says so rather than implying a lookup it cannot make.
  `RunProvenance.unservedTools` is where a run records the difference.
- **A manager can arm a WATCH and cannot read one back.** The grant map publishes
  `portfolio_read`, `brief_read`/`brief_write`, `memory_read`/`memory_write`, `source_request` and
  `connection_request`,
  and carries no watch or plan capability at all — not even a declared-but-empty one like
  `thesis:read`. WATCHes leave in a `DecisionProposal` and there is no return path, so a run cannot
  tell whether it is arming a review it already armed. Since #87 that costs more than it did: every
  wake dispatches one flow, so two `kr-sleeve` reviews half an hour apart each run the Korean
  sleeve and each seal a judgement. `run/armed-reviews` and `reconcileArmedReviews` are the bridge
  — the manager writes down what it armed — and a bridge is what they are: private memory is scoped
  to this instance, so a new instance starts blind and the record can drift from what Aumos holds.
  ([#97](https://github.com/untilled/aumos-catalogue/issues/97))
  A staged single-name entry rides the same bridge for the same reason: `entryTranchePlan` returns
  the `intent` each unfilled rung is armed with, and `resolveTrancheWake` reads that marker back out
  of the fired plan's event summary, because there is nothing else to read.
  ([#120](https://github.com/untilled/aumos-catalogue/issues/120))
- **The paper track lives in instance-private memory, because nothing else can hold it.**
  A paper call has no order and no fill, so it is not a Decision; the runtime publishes no
  `thesis:write` and `thesis:read` grants no tool. `learning/paper-cohorts` therefore
  carries running sums and an index of open measurement windows. Two consequences follow
  and neither is hidden: another manager on the same book cannot see this evidence, and a
  new manager instance starts the track over. A shared record would be the right home;
  this is the one the runtime serves. What does *not* end the track is a model swap, a
  config edit or an in-place package update: the row is keyed by instance alone, so a d60
  window is worth opening. ([untilled/aumos#638](https://github.com/untilled/aumos/pull/638))
- The forward-research and sell-side layers are ported, but their track record is not.
  `theme-radar` produces `thesis_call` paper positions and `sectorStrength` logs the two
  mechanical baselines they are measured against; the comparison that answers "do the
  team's calls beat the index *and* the bot?" needs months of closed windows before it
  says anything. Until then the research layer's edge is a hypothesis, exactly as the
  baseline's is.
- **The intraday wake arrives, and the runtime is more general than the harness this was
  ported from.** Aumos's Wake Engine ticks every 60 seconds and evaluates `price-below`,
  `price-above` and `weight-drift` against live quotes, with no market-hours gate — where the
  original harness ran one US-only script during the US session. With no market credentials it
  reports a trigger `unevaluated` rather than "not fired", which is the same distinction
  `evaluateWatch` returns as `unevaluable`. What the manager owes on its side is not to treat a
  live reading as a confirmed number, which is `confirmationPending`.
  ([#88](https://github.com/untilled/aumos-catalogue/issues/88))
- **A run seals a judgement or is recorded as a failure; there is no third answer.**
  `ManagerRunOutcomeKind` is `decided`, `invalid-proposal`, `no-proposal`, `refused`,
  `unsound` — and `no-proposal` means no JSON could be recovered at all, which is a failure row
  in the Forward Track Record rather than a manager declining to propose. So a run woken by a
  touched level **submits a `WAIT`**: one that says it was woken, what it found, what still
  needs a closed bar, and what it re-armed. Staying silent is available in mechanism and is
  scored as a crash.
- Source vendors relay their own response shapes; this manager, not Aumos, checks dates
  and freshness.
- CLI web observations are not replay-canonical Evidence.
- Calibration cannot promote or rewrite a methodology without a reviewed package/config
  change.
- Actual broker-connected paper/shadow and multi-run isolation checks require an installed
  Aumos runtime and credentials and are not simulated by this catalogue repository.
