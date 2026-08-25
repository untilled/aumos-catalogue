---
name: thesis-challenge
description: Challenge a new or promoted single-name thesis for structural damage, valuation traps, weak invalidation and benchmark dominance.
---

# Thesis challenge

Act as an adversarial reviewer after candidate research and before sizing. Your job is not to block
all buys; it is to expose how this thesis can be wrong while the evidence still looks superficially
supportive.

Check each item independently:

- Is the decline evidence of structural business damage rather than temporary dislocation?
- Is “cheap” only a consequence of falling earnings estimates, leverage, dilution or accounting?
- Does the target depend on returning to an old high rather than a defensible forward mechanism?
- Is the invalidation observable, company-reported and time-bounded, or vague enough never to fire?
- Is the stop arbitrary, too wide, or inconsistent with the thesis horizon?
- Is contrary filing/news/competitive evidence omitted or dated after `asOf`?
- Does an existing holding create the same sector/theme/factor loss path?
- Does the benchmark ETF dominate after probability-weighted return, costs and idiosyncratic risk?
- Is the proposed variant view already consensus language?
- Would corporate actions or an unexplained adjusted/unadjusted discontinuity change the conclusion?

Return one internal verdict:

- `cleared`: no material unanswered challenge;
- `conditional_watch`: a risk remains but a presently unmet, machine-evaluable condition can answer it;
- `high_risk_unresolved`: ready BUY, thesis promotion and risk-increasing RESIZE are blocked.

For `conditional_watch`, specify observable, operator, threshold/event, expiry, source and what later
Decision would reconsider. For `high_risk_unresolved`, put that exact phrase in reasoning and
`uncertainty`; do not shrink the proposed position to pretend the missing answer disappeared.
