---
name: deterministic-metrics
description: Run versioned scanner, sizing, coverage, evidence, calibration, attribution, source parsing and scheduling calculations without free-form arithmetic.
---

# Deterministic metrics

In an Aumos run, call `mcp__evidence-gated-metrics__calculate` whenever a supported quantitative
result affects a Decision. It exposes the same deterministic core without interactive Bash approval.
Do not recalculate the same algorithm in prose.

The executable below is the equivalent operator/CI interface, not the in-run interface.

```sh
printf '%s' "$INPUT_JSON" | node "${CLAUDE_PLUGIN_ROOT}/bin/evidence-gated-metrics"
```

Both interfaces accept one object with `operation`, invocation `asOf`, and `input`. Neither reads a
file, environment credential, network, database or package-external path. The executable writes
exactly one JSON document to stdout. Exit code `2` means the result contains a blocking diagnostic;
the JSON remains the canonical explanation.

Supported operations are published in an `operation_unknown` diagnostic and include indicators,
both candidate lenses, opportunity/sector/trend scanners, sleeve NAV and specialist/global budgets,
target sizing/concentration, coverage, WATCH validation, consensus/macro/price-conflict and research
validation,
calibration/clusters/Brier/BH-FDR/quintiles/bootstrap/promotion, attribution/TWR/MWR/MDD/turnover,
fill-based net outcome and forward MFE/MAE, mechanical backtests, point-in-time SEC/OpenDART parsing,
adjustment validation, and market/earnings/retry/dedupe/theme-radar scheduling.

## Inputs that are not guessable from the operation name

Most operations take the object their subject implies. These do not, and calling them without the
named field is the difference between a gate that runs and a gate that blocks or silently defaults.

| operation | field | why it is required |
|---|---|---|
| `specialistBudget` | `flow` — `kr-sleeve` or `us-sleeve` | Market lanes belong to flows, not to the manager id. `managerId` defaults to this package's own id and is rejected if it names a retired pre-2026-08-27 package. |
| `concentration` | `caps.factor`, and `factors` on each row | The factor axis is a shared loss path across sectors. An unconfigured cap comes back `concentration_cap_missing` / `unevaluated`, which is not a pass. |
| `validateWatch` | `config.watchExpiryDays`; `expiresAt` on the watch; `threshold` and `baselineWeight` on a `weight-drift` watch | Expiry is enforced, not described. Omitting `expiresAt` derives one from `asOf` and reports `expirySource: 'default'`; omitting the drift baseline leaves the already-met check unevaluated. |
| `crossCheckPrice` | `config.priceConflictTolerance` | The 5% the documents call configured. Passing `tolerance` directly still overrides it. |

Bootstrap output uses the package-owned `mulberry32-v1` PRNG when `seed` is supplied. This is an
explicit Node-port reproducibility rule: changing the PRNG is a methodology-version change, not a
formatting refactor.

Every output carries `spec`, `ruleVersion`, `operation`, `asOf`, status, structured data and
diagnostics. Preserve `missing` and `unevaluated`; never coerce them to zero or false. Cite the
calculation output Evidence id in the proposal. Human prose may explain the result but may not replace
or contradict it.
