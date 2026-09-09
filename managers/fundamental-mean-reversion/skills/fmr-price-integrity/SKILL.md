---
name: fmr-price-integrity
description: "What to do when the price series is refused — an undeclared adjustment basis, an unadjusted series with a corporate action, or a history that steps by a factor. Read this when priceState or classifyCase answers data-missing or price-artifact-suspected."
---

# The fall that no session printed

This methodology measures a fall, so an artefact in the price series is not noise in a ranking
— it **is** the entry signal. That is why this package refuses where the sibling it borrowed
the readings from only reports, and it is why the answer to a refusal is a better series and
never a workaround.

⛔ **Never re-base a series yourself.** Deriving an adjustment factor from a step makes this
manager the second author of a price history whose first author is the vendor, and a silently
re-based series is exactly the failure being caught.

## ⑴ `adjustment_basis_undeclared`

The series did not say whether it is adjusted. **Do not assume it is**, even when your request
asked for adjustment: what you know is what you asked for, and what matters is what arrived.

What to do: ask the vendor again and record what it says. Through the Toss connection the daily
candles are requested with the adjustment flag set and the answer is what you declare; where a
vendor genuinely does not state a basis, the honest declaration is `"unadjusted"` plus its
corporate-action list, not `"adjusted"` because it looked continuous.

## ⑵ `adjustment_basis_unusable` — the ex-dividend case, and why the bars cannot show it

The series says it is unadjusted and either declares a corporate action inside the window or
does not claim its action list is complete.

**This is the case that has no visible shape, and it is worth understanding before you argue
with the refusal.** A split leaves a step and any reading of the bars can find it. A
distribution does not: a 2–3% ex-dividend gap is an ordinary session, indistinguishable from an
ordinary down day. What it does is **accumulate** — over twelve months, an unadjusted series of
a high-payout Korean name carries a measured drawdown deeper than the price ever fell by the
whole year's yield, with no step, no outlier, and nothing for a discontinuity check to catch.
A name that never fell 30% then clears a 30% research gate.

So the basis is judged by **declaration** and not by shape, because declaration is the only
thing that can see it. The package's own fixtures carry both halves of exactly that pair: the
same rows read as adjusted open the gate, and the truly adjusted series never fell that far.

The one route through: an unadjusted series is accepted when the vendor states its
corporate-action list for the window is **complete and empty**. Then the two series are the
same rows and there is nothing to adjust.

## ⑶ `price_series_discontinuity_suspected`

A derived level disagrees with the price it was derived from by a factor. Three readings over
the last 200 bars, any one of which fires it:

| reading | bound |
|---|---|
| `close / ma200` | outside [0.1, 10] |
| `high200 / low200` | outside [1, 20] |
| adjacent-session `ln(close₂/close₁)` | beyond ±0.5 |

This is the shape an unadjusted split leaves, **including one shipped by a vendor that says the
series is adjusted** — which is the case the fixtures carry, because a declaration is a claim
and this is the reading that checks it.

⚠️ **A name that really did split has exactly this shape and its history is exactly right.** So
the finding is `price-artifact-suspected` and the fix is to check the series against a second
adjusted source, not to conclude the company is fine. What you may **not** do is read
`drawdownFromHigh`, `ma200Distance` or the base low off it in the meantime.

## ⑷ `newest_bar_may_be_unclosed`

The newest bar is younger than the 24 hours after its own opening stamp that make a daily bar
readable. This methodology reviews **after the close on completed bars**, so this refuses.

The usual cause is an inclusive upper bound: a daily bar stamped at local midnight means that
asking for *"before today's midnight"* returns today's partial bar. Ask for an instant inside
the previous day and check the first row's date.

## What every one of these is, and is not

All four are `data_missing`. None of them is `thesis_refuted`, none of them is a reason to
lower a threshold, and none of them says anything at all about the company. Record which one
fired, what you asked the vendor for, and the condition under which you will look again.
