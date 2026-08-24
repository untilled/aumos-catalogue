---
name: deterministic-metrics
description: Run versioned scanner, sizing, coverage, evidence, calibration, attribution, source parsing and scheduling calculations without free-form arithmetic.
---

# Deterministic metrics

Use the package executable whenever a supported quantitative result affects a Decision. Do not
recalculate the same algorithm in prose.

```sh
printf '%s' "$INPUT_JSON" | node "${CLAUDE_PLUGIN_ROOT}/bin/evidence-gated-metrics"
```

The input is one JSON object with `operation`, invocation `asOf`, and `input`. The executable reads no
file, environment credential, network, database or package-external path. It writes exactly one JSON
document to stdout. Exit code `2` means the result contains a blocking diagnostic; the JSON remains
the canonical explanation.

Supported operations are published in an `operation_unknown` diagnostic and include indicators,
scan, relative strength, sleeve NAV, target sizing, concentration, coverage, WATCH validation,
consensus/research validation, calibration/clusters/Brier/BH-FDR, attribution/TWR/MWR/MDD/turnover,
point-in-time filtering, SEC/OpenDART parsing, adjustment validation and market/earnings scheduling.

Every output carries `spec`, `ruleVersion`, `operation`, `asOf`, status, structured data and
diagnostics. Preserve `missing` and `unevaluated`; never coerce them to zero or false. Cite the
calculation output Evidence id in the proposal. Human prose may explain the result but may not replace
or contradict it.
