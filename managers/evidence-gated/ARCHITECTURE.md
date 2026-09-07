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

The package uses the stable keys documented in `skills/memory-contract/SKILL.md`, including a
bounded `coverage/research-index` of names and Evidence references. Bundled KR 74 / US 83 rosters
provide a reproducible research scope; host source storage is still needed for a fundamental cache.
A second bounded exception, `research/catalyst-window` (#169), carries the catalyst calendar the
discovery lanes read — event label, window, observation date and Evidence ids, and its instants are
numbers because a window ends after `asOf` by construction and a later string timestamp is the one
shape `memory_read` refuses. ⛔ Event records are not persisted: `sue`, `day1ExcessPct` and
`preAnnouncementClose` are copied vendor numbers, so they are re-read each run.
The review-memory record is what this instance **proposed** and whose instant has not passed —
never a copy of a run's planned sequence, and ⛔ never gated on `decisions[].armed`, which is past
tense and drops a promise from the record precisely while it still stands (#156). What stood at
`asOf` is read from the invocation's `standingPlans` instead, handed to the same call as a
report-only parameter, and reported rather than acted on: it produces `standingArms`, a floor, and
reaches neither the reviews to arm nor the state written back (#201). Values
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
- `theme-radar`: forward research — where an idea comes from, the axis outside the universe every run owes, and what a forward thesis must carry;
- `position-research`: the sell-side watch on what is already held, price and fundamentals in parallel;
- `evidence-gates`: sample independence, maturity and entry gates;
- `data-source-contract`: endpoints, time boundaries, degradation, and what a vendor error may be recorded as;
- `candidate-research`: declaring the universe this run sweeps, then lens-specific why-cheap/trap/variant/benchmark work;
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
- **A manager can arm a WATCH and cannot call for one back.** The grant map publishes
  `portfolio_read`, `brief_read`/`brief_write`, `memory_read`/`memory_write`, `source_request` and
  `connection_request`,
  and carries no watch or plan capability at all — not even a declared-but-empty one like
  `thesis:read`. WATCHes leave in a `DecisionProposal` and no tool returns them; what the host
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
- **A durable key that holds a future or a date cannot be read back.** `memory_read` refuses a
  result carrying any string that is ISO-8601 shaped and later than `asOf`, and the shape it
  matches includes the date-only form — a bare `2026-09-05` is compared against the end of that
  day, because that is what SEC's `filed` means. `run/armed-reviews` is future by construction and
  `run/watch-alerts` named the current session, so both were refused in normal operation. Before
  `untilled/aumos#659` the refusal was per read rather than per key, so one poisoned key took a
  whole keyless namespace read with it; that read now folds per entry and names what it dropped in
  `omitted.keys`. ⚠️ **The key itself is still not read.** What changed is that the rest of the
  namespace survives and the absence is no longer silent — which is why the encoding here changed
  too, and not instead. The package's answer is to stop writing timestamp-shaped strings: epoch
  milliseconds for the instant that is one, a `session-` prefixed label for the field that never
  was. ⛔ The other half was not an exemption, and that was decided rather than left open — which
  field is scheduled is the manager's private schema, and a gateway that knows it is a second table
  of every manager's fields.
  ([#136](https://github.com/untilled/aumos-catalogue/issues/136),
  [untilled/aumos#658](https://github.com/untilled/aumos/issues/658),
  [untilled/aumos#659](https://github.com/untilled/aumos/issues/659))
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
- **There are two lanes, and the maturity gate belongs to one of them.** The source
  methodology ran a mechanical control arm — no variant view required, 1% a name and 6%
  across the lane — *and* a main lane that required a variant view and could size a name to
  the investor's own `maxPositionWeight`. The port applied §4's lens-maturity ceiling to
  both, so a candidate with a variant view was held to `experimentalCeiling` — 0.01345312 on
  a USD 14,866.44 book — exactly like a mechanical one, and a declared `maxPositionWeight` of
  0.20 operated at 0.01. `variantViewCheck` is what tells the lanes apart, and it answers
  from checked inputs rather than a claim: a complete thesis carrying `variantView`, at least
  one dated and sourced consensus citation, and a cleared challenge. Anything unchecked falls
  to the control arm — `variant_view_unverified` — and the control arm's 1% / 6% are the
  source's own approved numbers and are unchanged. ⛔ Nothing here lowers `promotionGate`, and
  `controlArmLane.expansionProhibited` still stands: a control-arm result is never an argument
  for size, and a thesis that cites the mechanical cohort as its evidence is
  `control_arm_evidence_cited` / `blocked` at the lane door. Where the ceiling *does* bind,
  `effectivePositionCap` still computes the comparison, names it as owed on `disclosures`, and
  `proposalDisclosure` refuses a proposal that does not carry it
  (`position_cap_reduced_by_maturity`), which closes the asymmetry against
  `concentration_cap_missing`; what it does not do is shorten the wait.
  ⚠️ **And the neighbouring asymmetry — an empty lane read as a working methodology — is closed by a
  count rather than a code since #212 ④.** `executionRecord` reads the host's research job and result
  (`untilled/aumos#724`, `#730`) and answers `dataPreparation`, `candidateEvaluation` and
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
  `exit_due_unactioned`. ⚠️ `standingPlans` now shows the arms that stood at `asOf`, and it is a
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
- **A venue floor can close the control arm outright.** `experimentalPositionFloor` is the
  smallest order worth placing in a venue, and on a small book it can exceed the lane's
  own 1% cell — USD 200 against USD 148.66 on a USD 14,866.44 book — after which no US name
  enters that lane at any share price. `experimental_floor_exceeds_cap` names it and carries
  the resolving NAV. It is the middle of three nested readings of the same floor;
  `experimental_floor_unreachable` is wider and #149's `experimental_ladder_unreachable` is
  narrower, and the outermost that fires is the one to act on.
- Source vendors relay their own response shapes; this manager, not Aumos, checks dates
  and freshness.
- CLI web observations are not replay-canonical Evidence.
- Calibration cannot promote or rewrite a methodology without a reviewed package/config
  change.
- Actual broker-connected paper/shadow and multi-run isolation checks require an installed
  Aumos runtime and credentials and are not simulated by this catalogue repository.
