# Architecture

The maintainer's document. The [README](README.md) is the page an investor chooses from; this
is what somebody changing the package needs, and it is deliberately not on that page.

## What is code here, and why so little of it

The catalogue's default is prose and this package keeps it: what a fall means, whether a
business is intact, which assumption the market over-extrapolated, what the thesis is and
whether the evidence is good enough are all in `PROMPT.md` and in `skills/`.

Six things are arithmetic instead, and the test for admission was narrow — **does this fail
silently when a model does it by eye?**

| operation | what it answers | the silent failure it removes |
|---|---|---|
| `priceState` | the normalised series, the technical state, whether the discovery gate opened | a drawdown taken over a history that steps by a factor, or over an unadjusted series |
| `stabilisation` | `confirmed` / `falling-knife` / `stabilization-unconfirmed` / `data-missing` | a condition re-derived per run, and quietly loosened on the run that wants the trade |
| `reversionTarget` | the range, and **what kind of claim it is** | a moving average written up as a valuation |
| `positionSizing` | the weight, the effective loss, the binding constraint | a stop price treated as a fill; per-strategy limits summed into an account limit |
| `stagedPlan` | the ledger of what has already been proposed under a plan | a re-run adding the same rung twice |
| `classifyCase` | one outcome, one verdict, one diagnosis code | an absence recorded as a refutation |

Everything is pure: no clock, no network, no filesystem, no `process`. `asOf` is an argument of
every call and a call without one is refused.

## The thresholds, and where they live

All of them are in `lib/core.mjs` as one frozen `THRESHOLDS` object, and
`tools/verify-fundamental-mean-reversion.mjs` pins them **again as literals**. That second copy
is deliberate and is the only one in the checker: #259 fixes these conditions in the pull
request that adds the package and forbids adjusting them to make a case pass, so a later edit
has to arrive as a diff in a file whose only subject is that they did not move.

| threshold | value | unit | formula |
|---|---|---|---|
| `discovery.drawdownWindowBars` | 252 | completed bars | window for the reference high |
| `discovery.drawdownFloor` | −0.30 | fraction of price | `close / max(high, 252) − 1 ≤ −0.30` |
| `discovery.rsiCeiling` | 35 | RSI 0–100 | Wilder RSI(14) on adjusted closes |
| `discovery.ma200DistanceCeiling` | −0.15 | fraction of price | `close / ma200 − 1` |
| `stabilisation.baseWindowBars` | 120 | completed bars | window the base low is taken from |
| `stabilisation.knifeWindowBars` | 5 | completed bars | a low this recent is a knife |
| `stabilisation.minSessionsSinceLow` | 15 | completed bars | bars since the base low |
| `stabilisation.minReclaimAboveBaseLow` | 0.05 | fraction of price | `close / baseLow − 1` |
| `stabilisation.minRsi` | 35 | RSI 0–100 | at the decision bar |
| `integrity.*` | see #248 | ratio / log return | unchanged from `evidence-gated` |
| `history.minBars` | 250 | completed bars | below it, nothing above can be computed |
| `sizing.perThesisRiskBudget` | 0.0075 | fraction of NAV | numerator of the weight |
| `sizing.gapHaircutFloor / Cap` | 0.03 / 0.15 | fraction of price | clamp on the measured worst session |
| `sizing.haltHaircut` | 0.02 | fraction of price | added on a halt or a daily price limit |
| `sizing.participationRate / Days` | 0.10 / 3 | fraction / sessions | the liquidity ceiling |
| `wait.maxWaitDaysDefault` | 120 | calendar days | ceiling on a thesis's own deadline |

`config` may **narrow** `perThesisRiskBudget` and may never widen it: `narrowingOnly` refuses a
looser value, reports `config_loosens_preregistered_threshold`, and returns the pre-registered
number. The entry gate reads no configuration at all.

## Derived from `evidence-gated`, and what changed

There is no shared library in this repository and no cross-package import: the published format
is a path→contents map, so a path outside this directory does not survive publication. What was
taken was copied and adapted, and the inventory is here so that a later commonisation pass has
something to work from.

| taken from | what | what changed |
|---|---|---|
| `lib/diagnostics.mjs` | `finite`, `round`, `diagnostic` | unchanged, minus the market/currency tables this package does not need |
| `lib/indicators.mjs` | `sma`, `rsi`, `normalizeBars`, `unclosedNewestBar`, `BAR_CLOSE_LAG_MS` | `normalizeBars` refuses a zero or negative OHLC value, and raises `newest_bar_may_be_unclosed` as **`blocked`** rather than `info` — this methodology reviews on completed bars and every reading is taken off the newest rows |
| `lib/indicators.mjs` (#248) | `priceSeriesDiscontinuity` and `PRICE_DISCONTINUITY_BOUNDS` | bounds unchanged; severity raised from `info` to `blocked`, because there the corrupted number feeds a ranking and here it *is* the entry signal |
| `lib/indicators.mjs` | `indicatorPacket` | reworked into `technicalState`: a 252-bar reference high instead of a 200-bar one, `ma120`, `ma200Rising`, a volume-drying ratio, and no legacy volume window |
| `lib/source-parsers.mjs` | `adjustment_basis_conflict` | generalised into `adjustmentBasis`, which judges by **declaration** and refuses an undeclared basis outright — the ex-dividend case leaves no shape in the bars, so nothing but a declaration can see it |
| `lib/price-levels.mjs` | the idea that a level states its **purpose** and is never inferred | not the code. AMP's `Money` encoding, the exponent arithmetic and the armed-key link checks are the host contract and belong to that package; here the same principle appears as `reversionTarget`'s `kind`, derived from `basis` |
| `lib/sizing.mjs` | the shape of a ceiling-and-budget calculation | rewritten. None of `evidence-gated`'s lane, calibration or mandate-execution policy came across; what is shared is the argument that the cap is not the order |

Nothing was taken from `evidence-gated`'s allocator, learning, calibration, catalyst, coverage,
memory or recipe modules, and no fixture was copied.

## Fixtures

Synthetic bars, generated once and committed. ⛔ **They are shapes, not prices.** No vendor data
is redistributed and no assertion over them is evidence about a market.

`fixtures/series.json` holds eleven series, each 300 weekday sessions ending 2026-08-28, as
compact `[date, open, high, low, close, volume]` rows. The other three files reference them by
name.

| fixture case | reaches |
|---|---|
| `temporary-shock-plus-stabilisation` | `mean-reversion-candidate` → BUY |
| `continuing-new-lows` | `falling-knife` → WATCH |
| `structural-earnings-damage` | `structural-earnings-damage` → WAIT, `thesis_refuted` |
| `damage-asserted-without-evidence` | `research-incomplete` — a claim of damage with no evidence is not a refutation |
| `business-question-unanswered` | `research-incomplete` |
| `data-missing-short-history` | `data-missing` |
| `data-missing-undeclared-basis` | `data-missing` |
| `unadjusted-split-declared-adjusted` | `price-artifact-suspected` — the #248 regression |
| `ex-dividend-unadjusted-series` | `data-missing` |
| `ex-dividend-same-rows-called-adjusted` | the same rows mislabelled: the gate **opens** on a fall the price never took |
| `ex-dividend-truly-adjusted-series` | `out-of-scope` — the truly adjusted series never fell that far |
| `uptrend-pullback` | `uptrend-pullback-not-this-strategy` |
| `reference-plan-shape` | `stabilization-unconfirmed` → WATCH |
| `target-reached-staged-trim` | `target-reached-trim` → TRIM |
| `invalidation-triggered` | `invalidated-re-adjudicate` → RESIZE/SELL only |
| `deadline-elapsed` | `deadline-elapsed-re-adjudicate` → RESIZE/SELL only |
| `risk-limit-exceeded` | `risk-limit-exceeded` → WAIT |
| `no-future-rows-across-an-earnings-date` | identical technical state to the clean series |

`sizing.json` carries eight cases: the calm baseline, a gap-down history, a halted name, a name
held by another strategy plus an open proposal from a third, a per-strategy cap larger than the
account cap, no headroom left, a `config` value trying to widen the risk budget, and an
invalidation above the entry.

`staged-plan.json` carries nine: the first stage firing, the re-run refusing to double-add,
price alone, price-and-time alone, a broken stabilisation, an exhausted loss budget, the
cumulative ceiling, an expired plan, and a staged trim.

`reversion.json` carries seven: each basis, a technical band labelled as a valuation, an
earning-power range missing its inputs, a band above the prior high, and no basis at all.

Every case's `measured` block is committed, so a change in the arithmetic shows up as a fixture
diff rather than as a quiet re-ranking.

## Running the checks

```bash
npm run check:fundamental-mean-reversion
```

Plain Node over committed JSON. No test framework is installed in this repository and this does
not add one.

## What no check here establishes

These are #256's host-integration criteria and every one of them needs a running Aumos:

- that a proposal is stored, and that a `WATCH` re-arms and actually wakes a later run;
- that a decision links to a real fill, and that fees, taxes and dividends are separated in the
  forward record;
- that exposure attribution works when two managers on one book hold the same name, and that
  the host can report open proposals from another manager at all — `positionSizing` counts them
  correctly *when it is handed them*, which is a different claim;
- that the Toss connection's daily candles arrive with a stated adjustment basis, which this
  package requires and refuses without;
- benchmark comparison against a Korean equity index over the same holding period.

Until the third of those is verified, running this package alongside another that can hold the
same name is best done on a separate fund. That is stated on the README too, because it is a
limit an investor is affected by rather than only a maintainer.
