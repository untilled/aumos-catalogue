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
| portfolio-wide conclusion | Brief — the book's shared folder, `book/` | regime, sector view, new-entry hold |
| raw research | Evidence | vendor price, filing, news payload |
| revisit commitment | WATCH / plan | price, date, filing trigger and expiry |
| learning aggregate | this instance's private folder, `state/` | lens samples, calibration, repeated failures |
| actual judgement/outcome | Decision journal / Forward Track Record | BUY/WAIT/SELL and forward result |
| permanent rule | package version / config | approved threshold or method change |

⚠️ **Both stores became folders in `untilled/aumos#743`**, and neither the ownership split above nor
the bound below moved with them: the private record is `files_list`/`files_read`/`files_write` over
this instance's own folder where it was `memory_read`/`memory_write`, and the book's shared
conclusions are the `fund_files_*` six over `book/` where they were `brief_read`/`brief_write`.
A folder is a bigger address space and not a bigger licence — a record refused as a key is refused as
a path. So the private folder never contains active theses, raw evidence bodies, shared Brief
content, executable gates, orders/fills, copied stale source data or self-approved rule changes.
Briefs are readable by other managers on the same book; the private folder is scoped to this
manager instance. Different instances do not share it. A model swap is not a different
instance — the folder is keyed by instance alone, so it outlives the model that wrote it,
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

⛔ **Bounded at `asOf` is not the same as «finished».** Toss's `before` is inclusive and a daily bar
is stamped at the venue's local midnight, so a run pinned inside a session that asks for that day's
midnight is handed that day's *incomplete* bar with complete, numeric OHLCV — valid in shape and
wrong in data, which is why every parse check passes it. The prescription lives in
`skills/data-source-contract/SKILL.md`: the instant goes inside the previous day, the first row's
date is checked afterwards, and `newest_bar_may_be_unclosed` reports a newest bar younger than the
24 hours that make a daily bar readable without refusing anything.

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

⚠️ **`observation:file` is the one capability that puts something *into* the record rather than
reading something out of it** (`untilled/aumos#693`). CLI web is on the degradation table above as
the route for consensus-difference claims, and until #693 that route ended nowhere: `WebSearch` and
`WebFetch` are the CLI's tools, they never reach this gateway, and `evidenceIds` accepts only ids
this gateway minted. `observation_file` takes the URL, the publication date and the source's own
words verbatim, hashes the passage and returns an id. ⛔ Aumos fetches and verifies nothing, so the
row is filed as the manager's testimony and carries two independent markers of it — kind
`observation`, source `manager:web-research`. This package reads that grade in `variantViewCheck`,
carries it through `effectivePositionCap` into the proposal's `rationale.risks`, and audits the
other direction with `observationLedger`: a value read on the web and used in judgement without a
submitted id behind it is refused. ⚠️ **The markers sit on the receipt, so that is where a claim's
grade comes from** — a claim citing an observation passed in the same call is graded by it, and an
id no receipt in the call carries is reported as `claim_grade_unstated` rather than answered
`ungraded`: «nothing here can say» is not a reading (#176).

Three OpenDART behaviours are the manager's to handle, because Aumos relays unread:
`corpCode.xml` answers with a ZIP (read `corp_code`/`stock_code` off `list.json`
instead), errors arrive as a `status` field on an HTTP 200 (a quota refusal is not an
empty result), and XBRL statements follow the periodic report, so a quarter announced only
preliminarily has no statement — a gap to record, never one to fill with the preliminary
figures.

CLI web is the fallback for news, corporate actions, distributions and consensus when Alpaca is
absent, and supplies IR, policy, macro and theme context. Every holding is scanned each cycle.
Granted-but-unused routes are `lane_not_queried`, distinct from absent or failed routes. It is not
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

The package uses the stable paths documented in `skills/memory-contract/SKILL.md`, including a
bounded `coverage/research-index` of names and Evidence references. ⚠️ **The keys did not change;
they became paths** (`untilled/aumos#743`) — every stable key is that key with `state/` in front and
`.json` behind, so a run reads and writes the same seventeen records it always did, at an address
instead of a key. ⛔ **The other two folders this package owns are not that record**: `scans/` holds
the recipe answers the host writes and `proposals/` holds what a run assembled, and neither is read
as a learning key. Bundled KR 74 / US 83 rosters
provide a reproducible research scope; host source storage is still needed for a fundamental cache.
A second bounded exception, `research/catalyst-window` (#169), carries the catalyst calendar the
discovery lanes read — event label, window, observation date and Evidence ids, and its instants are
numbers because a window ends after `asOf` by construction and a later string timestamp was the one
shape `memory_read` refused. ⚠️ **That refusal does not reach a file** — `files_read` hands the
document back as one opaque string and the outgoing scan is anchored, so a JSON body is not a
timestamp and its leaves are never walked — and the encoding stays anyway, as this package's own
canon rather than as an accommodation (§Known limits). ⛔ Event records are not persisted: `sue`, `day1ExcessPct` and
`preAnnouncementClose` are copied vendor numbers, so they are re-read each run.
The review-memory record is what this instance **proposed** and whose instant has not passed —
never a copy of a run's planned sequence, and ⛔ never gated on `decisions[].armed`, which is past
tense and drops a promise from the record precisely while it still stands (#156). What stood at
`asOf` is read from the invocation's `standingPlans` instead, handed to the same call as a
report-only parameter, and reported rather than acted on: it produces `standingArms`, a floor, and
reaches neither the reviews to arm nor the state written back (#201). Values
are JSON objects with schema version, update instant, supporting Decision/Evidence ids,
sample/independent cluster counts, computable metrics, missing fields and maturity status.
Writes reuse a stable path and happen only when an aggregate changes.

⚠️ **Three properties the runtime used to keep are this package's now, and each is kept
explicitly** (`untilled/aumos#743`). A write appended a revision and nothing could be lost; a file is
replaced, so where the predecessor has to stay readable — a calibration series whose trend is the
point, a roster a later run must be able to diff — a **dated sibling** is written beside the stable
path (`state/calibration/mean-reversion.2026-09-08.json`) and never in place of it. ⛔ A read is not
pinned: `memory_read` answered the newest revision at or before `asOf` and `files_read` answers the
bytes that are on disk now, so the value's own `updatedAsOf` is the only point-in-time signal, and a
value later than the invocation's `asOf` is skipped and diagnosed exactly as a future revision always
was. And two writers were held apart by the append; they are held apart by `expectedHash`
compare-and-swap, whose mismatch is `revision-conflict` and whose answer is to read what is actually
there and decide again. Empty or malformed memory is diagnosed and safely ignored — `no-such-file` is
that same empty and a first run has seventeen of them — so a first run still returns a valid
WAIT, WATCH or qualified BUY.

Reproduce the reference contract locally:

```sh
node tools/verify-evidence-gated-allocator.mjs
```

The fixture proves run A → run B persistence, append-only same-key revisions, historical
replay, instance isolation, model-swap continuity, shared-Brief/private-memory separation, audit/Evidence
observability, empty-memory operation and malformed-memory degradation. ⚠️ **Two of those cases model
a runtime property that no longer exists** — the append-only revision and the replay that reads the
newest revision at or before `asOf` were `memory_read`/`memory_write`'s and went with them in
`untilled/aumos#743`. They are kept rather than deleted because what they assert is still owed, only
by this side now: the dated sibling is the append, and the `updatedAsOf` check is the replay. The
case names are the old runtime's and are inherited rather than corrected. It also checks
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
- `theme-radar`: forward research — where an idea comes from, the axis outside the universe every run owes, and what a forward thesis must carry;
- `position-research`: the sell-side watch on what is already held, price and fundamentals in parallel;
- `evidence-gates`: sample independence, maturity and entry gates;
- `data-source-contract`: endpoints, time boundaries, degradation, and what a vendor error may be recorded as;
- `candidate-research`: declaring the universe this run sweeps, then lens-specific why-cheap/trap/variant/benchmark work;
- `thesis-challenge`: adversarial review and unresolved-risk blocking;
- `sizing-and-concentration`: target weights, caps and WATCH hygiene;
- `outcome-calibration`: forward outcome metrics and failure taxonomy;
- `memory-contract`: stable paths, the history and hash rules the runtime no longer keeps, isolation and migration;
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
to Evidence, and only aggregate sample/calibration/failure state to the instance's private folder.
`migration/schema-version` prevents a second import. The public package always starts
empty.

⛔ **This package does not migrate its own pre-`untilled/aumos#743` records, and that is deliberate.**
Aumos exports what `memory_write` and `brief_write` stored into the two folders as a one-time host
step; a package that copied them as well would be a second writer racing the first over paths it does
not own. So an empty `state/` reads as an empty learning state and never as a failed migration —
which is the reading a first run has always been required to survive.

Ported from `morethanmin/trading-harness` at the commit recorded in `aumos.json`. The
mapping is:

| source concept | Aumos destination |
|---|---|
| candidate lenses and research/challenge rules | package skills |
| safe user-tunable thresholds | config schema |
| per-asset authored claims/invalidation | Thesis |
| regime/sector/entry holds | Brief |
| conditional rechecks | WATCH / plan |
| closed-sample and calibration aggregate | the instance's private folder |

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
- **`thesis_read` and `evidence_read` are spellings no build has ever served, and the
  capabilities behind them are not the same thing.** ⚠️ **This entry used to read *«two declared
  capabilities serve nothing»*, and half of it stopped being true**: `thesis:read` and
  `evidence:read` are served, under names this package had never written — `thesis_list`/`thesis_get`
  and `evidence_get`/`evidence_search`. What survives is the point the entry was made for: a
  capability's spelling and a tool's spelling are two vocabularies, the manifest's `optionalSkills`
  names the second, and that field is machine-readable while no run reads it.
  ⚠️ **What a run reads used to say *when available*, and that was not enough** (2026-09-01): a
  real session went looking for `thesis_read`, `evidence_read` and `manager_memory_read` — none of
  which any build has served under those names — and reported the gap itself. *When
  available* reads as *ask and find out*, and asking costs turns. `PROMPT.md` and
  `skills/orchestrate/SKILL.md` name only what is served and say plainly that those three are not
  tools. Where a session does not hold the served pair, asset claims reach a run through the
  invocation payload and through the book's shared folder, and the package says so rather than
  implying a lookup it cannot make.
  `RunProvenance.unservedTools` is where a run records the difference.
- **A manager can arm a WATCH and cannot call for one back.** The grant map publishes
  `portfolio_read`, the `fund_files_*` six over the book's shared folder, the `files_*` six over this
  instance's own, `task_start`/`task_get`/`task_cancel`, `source_request` and
  `connection_request`,
  and carries no watch or plan capability at all — not even a declared-but-empty one.
  WATCHes leave in a `DecisionProposal` and no tool returns them; what the host
  publishes instead is a field on the invocation, `standingPlans`, and it is a floor rather than a
  ceiling — so a run can see promises it is re-arming and still cannot establish that one it does
  **not** see is gone. Since #87 that costs more than it did: every
  wake dispatches one flow, so two `kr-sleeve` reviews half an hour apart each run the Korean
  sleeve and each seal a judgement. `run/armed-reviews` and `reconcileArmedReviews` are the bridge
  — the manager writes down what it promised — and a bridge is what they are: private memory is
  scoped to this instance, so a new instance starts blind and the record can drift from what Aumos
  holds.
  ([#97](https://github.com/untilled/aumos-catalogue/issues/97))
  ⛔ **And the bridge does not carry a dedupe.** `decisions[].armed` is past tense — what became of
  promises that have *ended* — so reading it as a receipt made two runs judge a clean arm a failed
  one and re-arm three market reviews twice over. ⚠️ **What is currently armed is answered now** —
  `ManagerInvocation.standingPlans` landed for `untilled/aumos#690` and carries the promises that
  stood at `asOf` with `planId`, `armedAt`, `armedByDecisionId`, `expiresAt`, `intent` and
  `trigger` — and it changes what may be **reported**, not what is armed: it is a floor, a promise
  it cannot date is left out rather than guessed at, and the field publishes that rule about itself.
  `reconcileArmedReviews` takes it as a report-only parameter and answers `standingArms`, a floor
  that says so in its own shape; ⛔ not handed the field is **unreadable** and handed `[]` is a
  floor of zero, which are two different facts (#201).
  So this package still arms at every judgement and the host folds. ⚠️ **There are two folds now,
  and the ledger one landed second.** Firing time folds an identical instant per instance
  (`untilled/aumos#593`, `untilled/aumos#624`), which was never enough on its own — the duplicate
  row stayed and nothing withdrew it, which is what `untilled/aumos#704` measured 3 / 3 / 2 deep in
  this book. PR `untilled/aumos#712` closed it from the host side with no tool and no AMP field
  added: arming time folds an identical **promise** — `kind`, `subject`, `intent` and `trigger`
  compared as written bytes, `expiresAt` deliberately excluded — inside the transaction that seals
  the judgement, retiring the older row as `rearmed`. ⬜ Merged is not shipped: it landed after
  `v0.3.32`, so a host older than that still keeps the row.
  What the record still answers, and neither fold does, is the same flow promised at a **different**
  instant — identity is not resemblance, so that stays two rows — which is #87's harm exactly, and
  which a floor over live rows cannot distinguish from a promise never made. ⚠️ **Being the only
  duplicate left, it stopped being reportable anonymously**: `review_superseded` now carries the
  orphan's `planId`, matched out of `standingPlans` on this package's own `market-review:<flow>:<at>`
  marker plus the instant, and where no row can be named it says which silence it is —
  `superseded_address_unreadable` (the call had no `standingPlans`) or `superseded_address_unnamed`
  (it had it and matched nothing). ⛔ Neither is evidence the orphan is gone, and neither narrows
  what is armed.
  ([#156](https://github.com/untilled/aumos-catalogue/issues/156),
  [#175](https://github.com/untilled/aumos-catalogue/issues/175),
  [#202](https://github.com/untilled/aumos-catalogue/issues/202))
  A staged single-name entry rides the same bridge for the same reason: `entryTranchePlan` returns
  the `intent` each unfilled rung is armed with, and `resolveTrancheWake` reads that marker back out
  of the fired plan's event summary, because there is nothing else to read.
  ([#120](https://github.com/untilled/aumos-catalogue/issues/120))
- **A durable key that held a future or a date could not be read back — and the record moved rather
  than the rule.** `memory_read` refused a result carrying any string that was ISO-8601 shaped and
  later than `asOf`, and the shape it matched included the date-only form — a bare `2026-09-05` was
  compared against the end of that
  day, because that is what SEC's `filed` means. `run/armed-reviews` is future by construction and
  `run/watch-alerts` named the current session, so both were refused in normal operation. Before
  `untilled/aumos#659` the refusal was per read rather than per key, so one poisoned key took a
  whole keyless namespace read with it; that read folded per entry and named what it dropped in
  `omitted.keys`, and the key itself was still not read. The package's answer was to stop writing
  timestamp-shaped strings: epoch milliseconds for the instant that is one, a `session-` prefixed
  label for the field that never was.
  ✅ **`untilled/aumos#743` ends the refusal, by moving the record out of the guard's reach rather
  than by relaxing the guard.** `files_read` answers the document as one opaque string and the
  outgoing scan is anchored, so a JSON body is not a timestamp and its leaves are never walked; the
  keyless-read collapse cannot recur either, because a folder is listed and read by path instead of
  fetched as one payload of every key at once. ⛔ **The two encodings stay**, and they are this
  package's canon now rather than an accommodation: the meaning was always identical, every reader
  here expects `atEpochMs`, `windowStartEpochMs` and a `session-` label, and re-encoding stored
  records to celebrate a lifted restriction buys nothing and risks a history no reader can parse.
  ⛔ The other half was never an exemption, and that stays decided rather than reopened — which
  field is scheduled is the manager's private schema, and a gateway that knows it is a second table
  of every manager's fields.
  ([#136](https://github.com/untilled/aumos-catalogue/issues/136),
  [untilled/aumos#658](https://github.com/untilled/aumos/issues/658),
  [untilled/aumos#659](https://github.com/untilled/aumos/issues/659),
  [untilled/aumos#743](https://github.com/untilled/aumos/issues/743))
- **The paper track lives in this instance's private folder, because nothing else can hold it.**
  A paper call has no order and no fill, so it is not a Decision; the runtime publishes no
  `thesis:write`, and what `thesis:read` serves is a read path — `thesis_list`/`thesis_get` — with
  nothing to write a paper cohort into. `state/learning/paper-cohorts.json` therefore
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
- **The maturity lane is gone; the Mandate sizes and the evidence gate refuses.** The source
  methodology ran a mechanical control arm — no variant view required, 1% a name and 6%
  across the lane — *and* a main lane that required a variant view and could size a name to
  the investor's own `maxPositionWeight`. The port applied §4's lens-maturity ceiling to
  both, so a declared `maxPositionWeight` of 0.20 operated at 0.01. #153 restored the
  distinction; **#226 removed both caps**, on the investor's decision of 2026-09-08: *"실험
  레인은 없애고 실제로 aumos의 mandate에 따라 매수하면서 실험하는 방향으로 바꿔라."*
  The buying **is** the measurement — a real broker, a person's approval on every order, an
  append-only ledger recording each judgement with its forward return — and a separately
  shrunken lane did not bring that measurement forward. It stopped one from existing:
  measured on `run_c7ad46eea03840bf84ae7a8822ed02c3`, `variantViewCheck` stood at 0/4 for
  want of a `consensusRefs` collection procedure, every candidate was forced to the control
  arm, a flat 1% of a USD 14,937.07 book was **USD 149.37** against a USD 200 minimum ticket,
  and ten runs bought no single name at any price.
  What sizes now is the Mandate as a **ceiling** with two computed things under it: the risk
  budget `(maxDrawdown − heldPortfolioHeat) / |stopLossPct|`, and `targetWeight`'s
  quarter-Kelly arithmetic on the candidate's own expected and downside return. ⛔ 20% is
  never the answer by default — the source capped a single name at 20% and entered KOGAS at
  2.6%.
  `variantViewCheck` is unchanged in what it checks and changed in what it costs: a candidate
  without a complete thesis carrying `variantView`, a dated and sourced consensus citation
  and a cleared challenge is **refused**, not sized twenty times smaller
  (`variant_view_required_for_position` / `blocked`, `targetWeight` → `null`). ⛔ That is not
  a new bar: `challengeCleared` is one of the four and has always been fatal on its own.
  ⛔ Nothing here lowers `promotionGate` — it reports a lens's record and gates no size — and
  `controlArmLane.expansionProhibited` still stands: a control-arm result is never an argument
  for size, and a thesis that cites the mechanical cohort as its evidence is
  `control_arm_evidence_cited` / `blocked`. Where a cap *is* reduced below the declared one,
  `effectivePositionCap` computes the comparison, names it as owed on `disclosures`, and
  `proposalDisclosure` refuses a proposal that does not carry it
  (`position_cap_reduced_below_declared`), which closes the asymmetry against
  `concentration_cap_missing`.
  ⚠️ **The risk transferred rather than disappearing.** With no maturity gate, a first single
  name can reach the Mandate's cap with zero closed outcomes behind it. What is left holding
  it: `maxDrawdown` 0.06 through the risk budget and `portfolioHeat`, `cashFloor` 0.10, the
  per-name stop, every concentration axis, `newSinglePacing`, and the investor's approval on
  each order.
  ([#226](https://github.com/untilled/aumos-catalogue/issues/226))
  ⚠️ **And the neighbouring asymmetry — an empty lane read as a working methodology — is closed by a
  count rather than a code since #212 ④.** `executionRecord` reads the host's task run (`task_get`)
  and the recipe answers this run reads back out of `scans/` with `files_read`, and answers
  `dataPreparation`, `candidateEvaluation` and
  `eligibleCount`; `mandateExecution` decides the cause from that record and no longer from the
  `gate-ran` lane it used to intersect, which is deleted. ⛔ Diagnostics still *withdraw* the positive
  answer and no longer grant it, and `README.md` carries the deleted-to-replacement pairing. `promotionGate` wants
  30 samples, 10 clusters and **3 regimes**, and only the first two respond to a higher
  candidate rate — a regime turns on the calendar. Two questions are recorded as open rather
  than answered here: what total the single-name lanes may reach together, and whether an
  intermediate rung should exist between 1% and full promotion.
  ([#151](https://github.com/untilled/aumos-catalogue/issues/151),
  [#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **Positions close on a rule, and the rule reads the entry date.** The port kept two time
  stops and both are conditional on a `reviewBy` a run had to have written — `exitCheck`'s
  `time_stop` (the review date arrived and price never got above entry) and `timeStopPolicy`
  (the review date arrived, the catalyst never happened and it trailed its benchmark). A
  position nobody wrote a review date for is invisible to both, which is how a book reaches
  **zero closed outcomes** while two time-stop operations report nothing wrong. `exitDiscipline`
  is unconditional: 40 trading days after entry the position is closed whatever it is doing
  (`time_stop_reached`), and where more than one fires this one answers — an exit that is
  already due is not a review to extend. ⚠️ **The stop distance is two numbers now, on
  purpose.** The source's −8% was computed against a 1% cell; in a lane where a name may be
  20% of the book the same −8% is −1.6% of the account on one position, so every lane but the
  control arm derives its stop from the Mandate's `maxDrawdown` against the position's weight,
  with −8% as the ceiling on the answer. ⛔ The investor has declared no `maxDrawdown`, so
  outside the control arm the answer today is `hard_stop_unevaluated` and **no number is
  invented for it**. Registration is the part that must not be prose: `watchesToRegister`
  returns the `price-below` and `at-time` rows an entry copies into its own proposal, an entry
  without them is `exit_rules_unregistered`, and a due stop this run does not act on is
  `exit_due_unactioned`. ⚠️ **And copying them is now the whole of it**: `intent`, `subject`
  and the nested `trigger` are minted on the rows, because those plus `kind` are what Aumos
  compares to fold a re-armed promise into the one already standing, byte for byte
  (`untilled/aumos#704`). A run that wrote any of them itself wrote them differently the next
  time — measured, twice, in one book on 2026-09-09
  ([#244](https://github.com/untilled/aumos-catalogue/issues/244)). ⚠️ `standingPlans` now shows the arms that stood at `asOf`, and it is a
  floor rather than a ceiling — a promise it cannot date is left out rather than guessed at — so
  the discipline is still re-derived from the entry date every run rather than trusted to a WATCH
  armed weeks ago; `HOST-FOLLOWUPS.md` records what that read does and does not settle.
  ([#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **The single-name total is derived from the Mandate, and no constant is left that answers an
  investor's question.** The source capped non-core singles at 28%; that number belonged to an
  allocation carrying a 50% core ETF target, and the investor decided the ETF lane leaves this
  account, so it is **not ported**. `singleNameBudget` derives the range from `cashFloor` and
  holds each name to `maxPositionWeight`, with `concentration` deciding the shape — a change on
  the fund-settings screen moves the manager, and an undeclared number is
  `single_name_budget_unevaluated` rather than an unlimited lane. This finishes the line #133
  began: every value left in `lib/constants.mjs` is a claim about evidence.
  ([#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **The cash floor is the investor's, and this package no longer keeps a copy of it.**
  `coreDca.reserveFloorWeight` held 0.15 while the Mandate declared `cashFloor` 0.10, and the
  package read only its own number — one axis said twice, and unlike the position cap it was
  not even disclosed. The setting is gone and `effectiveCashFloor` reads the Mandate.
  An undeclared floor is `cash_floor_unevaluated` rather than "no floor", the check runs
  against the cash the plan leaves **after** it executes (`cash_floor_projection_missing`
  when that arithmetic is absent, `cash_floor_breach` when it fails), and a floor this
  methodology ever raises above the declared one is published as an
  `effectiveConstraints` row with `field: 'cashFloor'` — the same disclosure
  `effectivePositionCap` makes for `maxPositionWeight`. ⚠️ A floor is not a target: 10%
  says the book *may* go there, never that it should.
  ([#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **A venue minimum refuses a position; it never lifts one.** `minimumExecutablePosition` is
  the smallest order worth placing in a venue — the amount below which tick, lot and the
  round-trip fee leave no result to measure — and `minimumExecutableWeight` is what turns it
  into a weight of this book. ⛔ Before #226 it *raised* an experimental ceiling until a
  position became executable; there is no ceiling to raise now, so a weight the arithmetic
  puts below it is `minimum_executable_not_met` / `blocked` rather than rounded up to it —
  otherwise the size measures the rounding rather than the idea. On a book small enough for
  the minimum to exceed the cap that binds, `minimum_executable_exceeds_cap` names it and
  carries the resolving NAV; #149's `experimental_ladder_unreachable` is narrower, and the
  outer one that fires is the one to act on. ⚠️ Its `policyLint` direction reversed with its
  meaning: a larger minimum refuses more, so it is now `higher-is-stricter` and lowering it is
  `policy_auto_relax`. ⛔ `experimental_floor_unreachable` and `experimental_floor_exceeds_cap`
  are deleted with the band and the lane cell they measured.
- Source vendors relay their own response shapes; this manager, not Aumos, checks dates
  and freshness.
- CLI web observations are not replay-canonical Evidence.
- Calibration cannot promote or rewrite a methodology without a reviewed package/config
  change.
- Actual broker-connected paper/shadow and multi-run isolation checks require an installed
  Aumos runtime and credentials and are not simulated by this catalogue repository.
