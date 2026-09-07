# Evidence-Gated Allocator

<sub><a href="README.ko.md">한국어</a></sub>

> Will not buy anything on a machine signal alone. Requires a written case, the case
> against it, and a record that this *kind* of judgement has worked before it will size
> one large.

## In one paragraph

Most of what looks like an opportunity on a screen is just a screen. This manager treats a
scanner score as a reason to **research** something, never as a reason to buy it. Before
it proposes a new position it wants a claim that could be proved wrong, an explanation of
*why* the thing is cheap, an argument that it beats simply buying the index instead, and
an adversarial review that tried to knock the case down. And it sizes by track record
rather than by confidence: until this *kind* of judgement has accumulated enough
independent forward evidence, the most it will propose is a small controlled experiment — small,
but never so small that it cannot be executed: the experimental ceiling is a percentage of the book
*or* the smallest position worth opening on that exchange, whichever is larger, and on a book too
small for either it says so rather than proposing an order that a tick and a fee would swallow.
It covers Korea and the US in one manager, and returns exactly one proposal per run.

It is a **port** of the methodology and validation loop of `morethanmin/trading-harness` —
not that harness's personal data or order stack. Broker integration, quantities, order
type, limits, approval and execution stay entirely with Aumos; **this package contains no
order code.**

## The methodology

Two questions, asked in this order, before anything in the portfolio changes:

1. **Is there a falsifiable thesis, opposing evidence, and a better case than simply
   buying the benchmark?**
2. **Has this kind of judgement accumulated enough independent forward evidence to deserve
   its size?**

*Words this page uses, in plain terms:*

| | |
|---|---|
| **Thesis** | a written claim about the future, and the condition that would prove it wrong |
| **Lens** | the kind of setup a candidate is being read through — a cheap thing bouncing back, a strong thing dipping, and so on. Each lens keeps its own track record |
| **Falling knife** | something still falling. Blocked in code, not merely discouraged |
| **Basing** | a price that has stopped making new lows and gone flat — the evidence that the fall is over |
| **Benchmark alternative** | the honest comparison: would the index have done as well, with none of this work? |
| **Maturity** | how much closed forward evidence a lens has. Low maturity caps the size, never the confidence |
| **Sleeve** | one market's slice of the book. This manager runs a Korean one and a US one |
| **Paper call** | a research call recorded and scored without any money behind it |

**A scanner score is discovery, not edge.** The package labels its own discovery score
`research-priority-only` in code, so a machine signal cannot be read as a buy signal by a
later reader.

**Four lenses, judged separately.** Mean reversion, trend pullback, quality pullback and
basing are different questions and keep different records. Quality pullback is the 15–35%
-off-high band above the 200-day average that the other two drop between them — where a
quality name gets *less* covered the cheaper it becomes.

**Entry quality is refused in code rather than described.** A falling knife blocks. A
mean-reversion candidate standing alone needs a confirmed basing or pullback state. A
requirement written as prose is a requirement a tired reader waives.

**Risk is capped on four weight axes** — position, sector, theme and factor — **and on
total loss if every stop fired at once**, which none of the weight axes measures. There is
also a ceiling on total risk exposure and a warning when new single names are being added
too quickly.

**Conditions that are not met become machine-evaluable WATCH entries**, with a price, a
date or a filing trigger and an expiry — rather than prose that disappears.

**Size follows evidence, not conviction.** Closed outcomes update each lens's maturity and
calibration in the instance's private memory. Low maturity permits a small controlled
experiment when every research gate is complete; it never licenses confident sizing. And
calibration cannot promote or rewrite a methodology on its own — that takes a reviewed
package or config change.

### Three flows, one manager

The roles are **subagents of this one manager**, dispatched in order.

| flow | what it owns |
|---|---|
| `kr-sleeve` | Korean research and the Korean sleeve's BUY/SELL/RESIZE, inside the recorded budget |
| `us-sleeve` | US research and the US sleeve, including policy-designated liquidity |
| `allocate` | the won/dollar sleeve targets, FX, book-wide cash and concentration, and the cross-market `REBALANCE` |

**Most runs dispatch one of them, not all three.** Each flow has its own wake, timed to the
market it owns:

| wake | KST | what has just happened |
|---|---|---|
| `us-sleeve` | 05:45–06:45 | the US session closed and its bar is complete |
| `allocate` | 08:00 | both markets are closed and the Korean one has not opened — the day's sleeve budgets are set here |
| `kr-sleeve` | 16:00 | the Korean session closed and its bar is complete |

A run reads which flow woke it and dispatches that one. When more than one runs — a manual
run, an event review, or an `allocate` wake that finds a sleeve's conclusion older than that
market's last close — they run in order and never in parallel: `allocate` prices the two
sleeves against each other and cannot do that against a sleeve that is still deciding.

A single-sleeve run may act inside its own sleeve's recorded budget. It may not propose the
cross-market `REBALANCE`; a sleeve that never saw the other one cannot claim the shape of the
whole book.

⛔ **Only the orchestrator submits, and exactly once.** A run seals one judgement and a
second submission is refused, so a flow that submitted would seal a judgement the other two
never saw and take the orchestrator's own down with it. This is said in the prompt, in all
four skills, and enforced by a hook that refuses the call when the payload names a
subagent.

⚠️ **This was three packages until 2026-08-27** (`evidence-gated-kr`, `-us`, `-global`),
and the split cost more than it bought: the three shipped byte-identical code and skills,
differing only in four lines of prompt and their manifests — three copies of one
methodology, free to drift, that an investor had to find and install three times. What is
genuinely lost is per-sleeve scoring and per-sleeve approval: the track record's row and
the approval gate are now one manager and one basket.

⚠️ **Per-sleeve *dispatch* was lost too, and that was not intended.** Before the merge each
market's wake belonged to a different manager, so a Korean wake ran the Korean package. After
it, all three wakes reached the same manager and it ran all three flows on each of them —
three times the work, with each sleeve judged twice a day, once on a bar that had not closed
yet. The scheduler had kept the distinction the whole time; nothing read it. Fixed in
[#87](https://github.com/untilled/aumos-catalogue/issues/87).

## How a run works

One run, one proposal. Nothing below places an order.

```mermaid
flowchart TB
    classDef reads fill:#1e2a44,stroke:#6f9bf0,color:#cfe0ff
    classDef judges fill:#2f2f38,stroke:#9aa0b4,color:#e8eaf2
    classDef proposes fill:#1b4332,stroke:#40916c,color:#d8f3dc
    classDef person fill:#5c4813,stroke:#f6a609,color:#ffe8b0

    WAKE["Aumos wakes it on a portfolio, asset,<br/>thesis or event review"]:::reads

    subgraph IN["1 · Scope and state"]
        direction TB
        BOOK["The book, cash and fills"]:::reads
        SRC["Vendor data — Korean and US prices,<br/>filings, news, corporate actions"]:::reads
        MEM["What this instance has learned:<br/>lens maturity, calibration, repeated failures"]:::reads
        PRE["Pre-flight before any trade is planned"]:::judges
    end

    WHICH{"2 · Which flow was this wake for?"}:::judges

    subgraph FLOWS["The three flows — one per wake, in order when several run"]
        direction TB
        KR["kr-sleeve · 16:00 KST<br/>Korean research and sleeve"]:::judges
        US["us-sleeve · 05:45 KST<br/>US research and sleeve"]:::judges
        AL["allocate · 08:00 KST<br/>prices the two sleeves against each other"]:::judges
    end

    HOLD["2b · Watch what is already held<br/>price and fundamentals in parallel,<br/>sell-side only"]:::judges

    LENS["3 · Name the lens<br/>mean reversion · trend pullback ·<br/>quality pullback · basing"]:::judges

    GATE{"Entry gates — refused in code<br/>falling knife · basing confirmation ·<br/>why-cheap · variant view ·<br/>benchmark alternative · challenge"}:::judges

    SIZE["4 · Size and schedule<br/>four weight caps, total-stop-loss cap,<br/>and the lens's own maturity"]:::judges

    WATCH["WATCH / plan<br/>the unmet condition, with a<br/>price, date or filing trigger"]:::proposes
    ACT["BUY / SELL / RESIZE / REBALANCE<br/>one proposal, from the orchestrator only"]:::proposes

    LEARN["5 · Update durable state sparingly<br/>6 · Re-arm the next review"]:::proposes

    subgraph HUMAN["Where a person decides"]
        direction TB
        MAND["Aumos judges it against your Mandate"]:::person
        YOU["You approve, or you do not"]:::person
        ORD["Only then does an order exist"]:::person
    end

    WAKE --> IN --> PRE --> WHICH
    WHICH -- "kr-sleeve" --> KR
    WHICH -- "us-sleeve" --> US
    WHICH -- "allocate" --> AL
    WHICH -- "no flow: manual or event — all three, in order" --> FLOWS
    KR --> HOLD
    US --> HOLD
    AL --> HOLD
    HOLD --> LENS --> GATE
    GATE -- "a gate is unmet" --> WATCH
    GATE -- "every gate cleared" --> SIZE --> ACT
    WATCH --> LEARN
    ACT --> LEARN
    LEARN --> MAND --> YOU --> ORD
```

**Legend** — 🟦 what it reads · ⬜ what it works out on its own · 🟩 what it hands back ·
🟧 where a person decides.

**Cadence.** It is woken by a review or an event rather than by a calendar. What brings it
back is the WATCH it armed — with a price, a date or a filing as the trigger — and the
research schedule it keeps for looking ahead.

**The arithmetic is not the model's.** Scanning, sizing, coverage, evidence admission,
calibration, attribution, point-in-time parsing and scheduling all run through the
package's own deterministic core rather than through prose. That core has no filesystem
ledger, credential, network, database or order access.

## What it needs

| | |
|---|---|
| **Markets** | Korean and US equities, ETFs and cash. Long-only |
| **Connections and data sources** | the US single-name lane links Toss and installs `sec-edgar`; Alpaca supplies news/actions, with granted web research as fallback. A complete Korean single-name fundamental lane additionally requires `open-dart`, published in this catalogue alongside this package. `openbb-fmp` is optional and only supplements long price history |
| **The book** | live positions, cash and fills, which stay owned by Aumos and the broker connector — not by this package |
| **Settings** | thresholds the methodology compares against, including the price-conflict tolerance (5% by default). None of them can loosen your Mandate |
| **Your approval** | **it proposes and never trades.** Quantities, order type, limits, approval and execution are Aumos's, and a person approves every order |

**What a missing input costs, stated before a run discovers it.** The manifest names Toss and
Alpaca as broker connections and `sec-edgar` and `open-dart` as data sources, so the install screen
can say which of them this fund or machine lacks.

| missing | continues | blocked |
|---|---|---|
| Toss connection | existing evidence and thesis review | new price signal and target calculation |
| `sec-edgar` | the Korean and ETF lane | a new US fundamental BUY or promotion |
| Alpaca connection | SEC and Toss review; news/actions through granted web research with dated URLs | news/action claims if web is also unavailable or cannot confirm the observation |
| `open-dart` | Korean ETF and price/weight management | a new Korean single-name fundamental BUY or promotion |
| CLI web | core, exit and weight management | theme radar, variant view, consensus difference, policy and macro claims |

A fund without a required connection, or a machine without a required source, is missing a named
input — not a capability nobody has. Where the lane is blocked, the answer is an unable-to-judge
WAIT that says which one.

## What it is bad at

- **Being quick.** Every gate exists to slow a new position down, and most runs end in
  WATCH rather than a trade. If that reads as indecision, this is the wrong package.
- **Buying a single name at the size you declared, without a variant view.** ⚠️ **Read this
  before you install, because it is the thing most likely to surprise you.** There are two
  lanes and they are sized very differently. A candidate whose **variant view is
  established** — a complete thesis that says where its view differs from the market, at
  least one dated and sourced citation of what the market's view *is*, and a cleared
  adversarial challenge — may be sized up to the `maxPositionWeight` you declared, subject to
  your sector, theme and factor caps. A candidate without one is a **mechanical control
  arm** entry: around **1% of the book**, at most 3%, and 6% across that whole lane. Those
  numbers are the source methodology's own approved limits, and the trade they encode is
  explicit — the control arm does not have to argue an edge, so it is not allowed to be big.
  ⚠️ **Most candidates land in the control arm, and that is the normal state.** The scanners
  find price patterns, which are public information, and a price pattern is not a variant
  view. "Not established" is never treated as established: a missing citation, an
  unfinished thesis or a conditional challenge verdict all fall to the control arm
  (`variant_view_unverified`), and the manager says on every run it applies which cap is
  operating and why (`position_cap_reduced_by_maturity`).
  **Promotion is still measured in years, not weeks.** Where the maturity ceiling does bind,
  a lens is promoted on 30 closed outcomes, 10 independent date clusters and **3 distinct
  market regimes**. The first two respond to finding more candidates; the third does not — a
  regime turns on the calendar, so three of them is a multi-year wait no rate of activity
  shortens. If you want a manager that will put 20% of your book into one conviction name
  this quarter without one of them clearing that bar, it is not this one.
- **Holding a name for as long as you like.** Every non-core position is closed **40 trading
  days after it was entered**, whatever it is doing, and closed again earlier if it falls
  through its registered stop. That is not a defect being disclosed: the whole methodology
  sizes on closed outcomes, and a book that never closes anything keeps its own gates shut
  forever — which is exactly the state this package was in, with zero closed samples. A loss
  is a valid output here, because the output being bought is the record. ⚠️ An entry that does
  not register its stop and its review date is refused, and a run that reports a due stop
  without proposing the exit is refused too. If you want a manager that will sit in a position
  for two years while the thesis matures, this is the wrong one.
- **Short positions and leverage.** It is long-only.
- **Its own newest layers.** The forward-research and sell-side layers are ported, but
  their track record is not: the comparison that answers *"do the team's calls beat the
  index **and** the mechanical baseline?"* needs months of closed windows before it says
  anything. Until then the research layer's edge is a hypothesis, exactly as the
  baseline's is.
- **Korean fundamentals without `open-dart`.** The source is published; a machine without
  it, or without an API key for it, cannot judge them.
- **Anything a vendor got wrong.** Vendors relay their own response shapes; **this
  manager, not Aumos, checks dates and freshness.**

**Do not install this** if you want frequent trades, a single-market manager, or something
that will act on a screen result.

## Notes

**Where the details live.** [ARCHITECTURE.md](ARCHITECTURE.md) is the engineering half of
this package — who owns which piece of state, the data and installation contract, the
memory contract, the skills, and the parity check against the original Python harness.
`MIGRATION.md` records all 65 legacy executables and their disposition; `IMPLEMENTATION.md`
tracks the build checklist and `CONFORMANCE.md` separates checks that run in this
repository from release gates that need an installed runtime. `INCIDENTS.md` holds what each rule in
`PROMPT.md` was measured against — the run that failed and the number it produced — so that the
prompt itself can stay an execution contract a run reads in one pass.

**The fundamental discovery branch is fed from host source storage, and this is new.**
`source-cache:read` / `source-cache:write` (Aumos 0.3.30) hold OpenDART and SEC filings per filer,
trimmed at each invocation's `asOf`, so this package no longer re-procures the same statements every
run — and, more importantly, can tell a cache nobody has ever filled from a refresh that failed.
Both were one empty payload before, and the branch that reads them reported *starved* either way.
`engines.aumos` therefore requires `>=0.3.30`; an older build refuses the whole manifest rather than
ignoring an unknown capability. ⛔ Private memory is not and never becomes the cache.

**And the other end of the same starvation: the 20% lane finally has a supply route.**
`variantViewCheck` opens the main single-name lane on four requirements, and one of them —
`consensusRefs`, a dated consensus observation — takes an input that exists **on the web and
nowhere else**. Broker estimates and price targets are in no filing and on no exchange feed, and a
manager's `WebSearch`/`WebFetch` are the CLI's tools: they never reach Aumos, so they issue no
evidence id, and `evidenceIds` accepts nothing else. This methodology was requiring an input whose
only supply route it had closed, and the account bought no single name in eight runs
(`untilled/aumos#692`). `observation:file` (Aumos 0.3.32, `untilled/aumos#693`) is that route: the
`observation_file` tool files the URL, the publication date and **the source's own words verbatim**,
hashes the passage and returns an evidence id. `engines.aumos` therefore requires `>=0.3.32`.

⚠️ **The row is this manager's testimony, and the package never lets that go quiet.** Aumos fetched
nothing and verified nothing; the row is graded `observation` / `manager:web-research` at every step.
So `variantViewCheck` publishes the grade of each accepted consensus row, and when the main lane
opens on one the manager filed itself, `effectivePositionCap` returns
`main_lane_rests_on_manager_attestation` and the proposal must carry that code verbatim in one
`rationale.risks` entry with the source URL and in one `uncertainty` entry — `risks` because that is
what the approval screen renders. Missing either is `main_lane_attestation_undisclosed` / `blocked`.
⛔ Nothing about the four requirements, the caps or the control arm's 1% / 6% changes: what is
refused is opening the lane **quietly**. And `observationLedger` closes the loop the other way — a
value read on the web, used in judgement and supported by none of the submitted ids is
`claim_evidence_missing` / `blocked`, which is the 2026-09-06 BOK-rate failure made into a finding.
⚠️ The grade travels there too, and by evidence id: a claim citing a receipt passed in the same call
is graded by that receipt, and an id nothing in the call filed is named `claim_grade_unstated` —
because «nothing here can say» and «ungraded» are two different answers, and the main lane's
disclosure is built on which one it is.

**And the requirement behind that lane could not be met honestly until now: a real falsifier had
nowhere to go.** The main lane's first requirement is a *complete* thesis, and a thesis is complete
only with `invalidationTriggers` — what would make you drop the name, decided before you are
attached to it. `validateThesis` refused `kind: 'event'` outright, with a diagnostic that read
*"producer-less event is forbidden"* and then refused every event, produced or not. The clause it
turns on was never implemented. So *"자사주 매입 중단"* and *"PF 손실 대규모 인식"* — the two conditions
under which a bank thesis is actually wrong — had to be dropped, or dressed as a `metric` with a
level nobody measures, which is worse because it reads as machine-checked. An `event` invalidation is
now accepted **with a `producer: { publisher, document }` and a `checkBy`**: who announces the fact,
in which document, read by when. ⛔ This narrows the gate rather than widening it — the same trigger
without a producer is still `blocked` (`invalidation_producer_missing`), a producer without a
deadline is `blocked` too (`invalidation_event_undated`, because *"not announced yet"* is a true
answer forever), and no WATCH kind, cap, promotion gate or control-arm number moved.

**The core tranche gate now reads bars its own sibling would refuse.** `trendState` decides whether
core deployment continues, and it was handed two hundred Toss candle rows in the vendor's shape —
`closePrice`, `highPrice`, every value a **string** — and answered `status: ok`, `state: "DOWNTREND"`,
`trancheGuidance: "stop"`, with **zero diagnostics** and `ma20`/`ma50`/`ma200` all `null`. Not one
moving average had been computed: the comparisons that decide the state are `undefined > null`, all
false, and false is `DOWNTREND`, and `DOWNTREND` halts core tranches. `bars.length` reads 200
whichever shape the rows hold, so the history check never fired either. The same series in
`{date, open, high, low, close, volume}` numeric form answers `UPTREND` / `small_or_wait` with
`ma200` 92,704.055 — corroborated to the cent by a plan armed three days earlier off a different bar
set. ⛔ The validator was already in this package: `indicators` runs `normalizeBars` over the
byte-identical rows and refuses every one as `bar_value_invalid`. This gate simply never called it,
and now it does. ⚠️ **A rejected row is not a dropped row here** — `indicators` reports per row
because its answer *is* the report, but a gate that stops capital deployment cannot average over the
subset it happened to parse: one unreadable row and the answer is `state: "insufficient_data"` with
the rows named. A second belt stands behind it — no computed `ma200`, no `state` and no
`trancheGuidance`, whatever left it null — and `inputContracts.nested.trendState` now publishes the
row shape, since `bars: "array"` was the whole contract and a vendor payload satisfies it.

**One table now decides what a diagnostic code means, because it was being spelled twice.**
`mandateExecution` answers *«is this book empty because the methodology worked, or because its gates
never received their inputs?»* by intersecting the codes a run reports with a vocabulary — and the
vocabulary was written out by hand beside the reader while the codes are emitted by five other
modules. They drifted, silently, because a code that matches nothing simply does not match. A run
reporting `corp_code_unmapped_symbols` (the join read the registry and missed roster names),
`radar_lane_starved` (*"unfed rather than empty"*, in the radar's own words) and `lane_query_failed`
(the research lane was queried and answered nothing usable) intersected the list at **zero**, and was
told `no-candidate-cleared-the-gates` / `info` — *the methodology is working* — over a book whose
wiring had lost its inputs at three separate stages. The list was looking for
`corp_code_mapping_pending` and `radar_feed_produced_nothing`: real codes, emitted by *different*
operations in different modules. ⛔ **The vocabulary is not a list any more**, it is a projection of
`lib/diagnostic-codes.mjs`, where each row names the code, the operation that emits it, the module
that must contain it and the lane it is read in; `tools/verify-evidence-gated-diagnostic-codes.mjs`
opens those modules and fails the build on a spelling only the reader knows, then runs
`mapCorporationCodes`, `upsideRadar` and `laneCoverage` for real and hands their diagnostics to
`mandateExecution` unedited. ⚠️ **And `info` is no longer the fall-through.** It was the branch every
unmatched set of codes reached, so a vocabulary out of step did not fail — it reassured. It is earned
now, by at least one code from a gate that actually ran and refused; a run reporting codes this
operation cannot read at all says `unreported`, the answer it already had for a run that reported
nothing. ⛔ Nothing about the three causes, their severities or the rule that holding cash is never an
argument for buying moved.

**And once a falsifier is registered, the sentinel has to read the right number against it.** It did
not. `thesisSentinel` looked its evidence up under `rule.evidenceId`, and every evidence row carrying
no `id` was filed under the same missing key — so a rule that named no row did not go unevaluated, it
borrowed **whichever id-less row came last** and was compared against it. Measured: four rules and
four readings, and *"USDKRW above 1,543.40"* answered `met` on a share price of 113,320, which is
indeed above 1,543.40. Dropping the price row moved the same wrong answer onto the price rule, which
is the proof that position was doing the joining. ⛔ The error only ever pointed one way — a borrowed
number clears a threshold it was never scaled to, `met` is `threatened`, and three of those set
`escalationRequired`, which this prompt turns into an owed resize or liquidation. **The defect could
manufacture forced selling on an invalidation that never fired.** Evidence now joins by key —
`evidenceId`, an evidence row's `invalidationId`, or the shared `metric` of a metric rule, all three
published under `inputContracts` — and a rule that joins to nothing or to two rows at once answers
`unevaluated`. That makes the verdict `watch`, which a person reads. ⛔ It is never `met`, which
invents a breach, and never `not-met`, which would report an invalidation as checked and clear on
evidence nobody supplied.

**And the caps that book is measured against have to reach the axis they name.** Two of the three
label axes were guarded and one was not. `concentration` reads `sector` as a single string and
`themes`/`factors` as arrays; the singular `theme` had been refused since #147, and the plural
`sectors` was read by nothing and refused by nothing. A run that wrote it got `exposures.sector: {}`,
**no diagnostic**, and `status: ok` — a declared sector cap compared against nothing. The control is
one field wide: changing that spelling to the singular and nothing else fills the axis. ⛔ The run
that measured it held one labelled core ETF and was harmless, and the direction is not — the axis a
cap is not applied to is the axis a breach passes on, and a sector cap only ever binds a book that
holds several single names. All three spellings are now refused as `input_shape_invalid` rather than
normalised, because the caller who wrote the wrong one wrote it elsewhere too and a quiet rewrite
leaves both spellings alive with nothing to say which was meant. **And the other half of the same
silence:** a cap the investor *did* declare, over rows carrying no label on that axis, produced the
same empty map as a cap nobody declared. That is `concentration_labels_unstated` / `unevaluated`
now, naming the symbols and their weight — never `blocked`, because this package declares no labels
of its own and refusing a book for the absence of one would be inventing the classification. The row
shape is published under `inputContracts.nested.concentration`, which said only `caps` before.

**And a budget the book cannot pay for is not a budget it is inside.** `specialistBudget` compared
two portfolio weights and answered `withinBriefBudget`, which on a two-currency book is not the
question the sleeve asked. The measured call — `us-sleeve`, `XNYS`, current 0.11370454, Brief budget
0.26488897 — came back `allowed: true`, `withinBriefBudget: true` and **no diagnostic** over a budget
of roughly USD 3,979 on a book holding USD 294.02 in idle dollars; the difference is reachable only
by converting won or selling a KR asset. The aggregate is what hid it: `portfolio_read`'s `cash` read
USD 8,596.10 and **96.6% of it was won**, and the standing `allocate` plan was asking the investor
about *"idle USD 8,514.73"* that did not exist. The currency goes on the **cash**, not on the budget:
a limit expressed as a ratio has no currency, because one FX rate scales its numerator and its
denominator alike, and the host settled that beside this one (aumos#689) — what has a currency is a
level, and procurement is a level. So the funding currency is derived from the market (`XKRX` → KRW,
`XNAS`/`XNYS` → USD) and never declared by the caller, the cash is read per currency from
`portfolio.cashByCurrency`, and the rate is `portfolio.fxRates` with the answer naming where it came
from — this package sources none of its own. ⚠️ Unfundable is a **warning**: converting currency and
selling the other sleeve are legitimate moves, and both are `allocate`'s judgement and the investor's
approval. ⛔ What is not allowed is silence — a call carrying no procurement is
`sleeve_budget_fundability_unevaluated` / `unevaluated` naming the key it waits for, with
`budgetFundableInSleeveCurrency: null` beside `withinBriefBudget`, where it used to be `status: ok`
and an empty diagnostics array.

**Four more calls came back as answers about something else.** (#177) The pattern this package
records most often — *a wrong input is not refused and comes back looking like a pass* — was measured
four more times on one run, and the costliest was a **1,338.848×** NAV. `sleeveNav` read a position
row's `currency` as two facts at once: which sleeve the name belongs to, and which unit `marketValue`
is counted in. The host's `portfolio_read` marks **every** holding in the book's base currency, so a
KRW listing on a USD book arrives as a dollar figure with `valueCurrency: "USD"` beside it — a key
this operation did not read, sitting in a row where a `named` operation's unknown-key report cannot
see it. USD 4,717.16 went into the won bucket at face value: `krwSleeveNav` **11,119,948.16** against
a true 17,430,791.23, `status: ok`, no diagnostic. The two facts are separated now rather than a
spelling being guessed at: `currency` stays the currency the asset quotes in and `valueCurrency`
states the unit of the mark, converted at the rate this package is **handed** (aumos#689, the same
rule #174 settled next door), with `marketValueBasis` saying which reading was taken and
`fxUsed`/`fxBasis` where the rate came from. ⛔ A row whose value cannot be put in its sleeve's
currency is dropped and named, never counted at face value. The other three are all one shape —
a field the operation does not read, answered with a verdict. `validateMacro`'s rows are keyed by
`indicator` and not `metric`, and its ten kebab-case values were the one closed vocabulary
`inputContracts.vocabulary` did not publish; written under `metric`, every row is unusable and
`macroLaneAvailable` comes back `false`, which reads as *the policy lane is empty*. `thesisSentinel`
compares against `level` and reads `value`/`availableAt`; written as `threshold` and
`observed`/`observedAt` a price 20% through a registered invalidation joined its evidence and came
back *"Rule and evidence are not comparable"*, making the verdict `watch` instead of `threatened`.
And `specialistBudget`'s `managerId` is the literal `evidence-gated` — a run that passed its own
`inst_…`, the id every other surface of the host addresses this manager by, had the whole call
refused against a contract that said only `managerId: "string"`. All four spellings are
`input_shape_invalid` rather than dropped, and all four shapes are published.

**Two declared capabilities currently serve nothing.** `thesis:read` and `evidence:read`
are in the manifest vocabulary, and the current Aumos build maps each to an empty tool
list, so a run gets no such tool. The prompt reads them *when available* and the manifest
lists them under `optionalSkills` for exactly that reason. Until Aumos serves them, asset
claims reach a run through the invocation payload and through the book's briefs, and the
package says so rather than implying a lookup it cannot make.

**The paper track lives in instance-private memory, because nothing else can hold it.** A
paper call has no order and no fill, so it is not a Decision. Two consequences follow and
neither is hidden: another manager on the same book cannot see this evidence, and a new
manager instance starts the track over. A shared record would be the right home; this is
the one the runtime serves. What does *not* start it over is a model swap, a config edit
or an in-place package update — the row is keyed by manager instance alone, so the d60
window survives all three, and only deleting the manager resets it.

**Provenance.** Ported from `morethanmin/trading-harness` at the commit recorded in the
manifest. No credentials, account or position data, caches, backups, personal thesis text,
order implementation or historical performance came across. **Historical harness results
are not an Aumos forward track record**, and this package does not claim them as one. See
`NOTICE.md` for attribution.

Aumos shows no returns for this package until it has earned some. A forward track record
takes calendar time rather than compute, and nothing on this page is one.
