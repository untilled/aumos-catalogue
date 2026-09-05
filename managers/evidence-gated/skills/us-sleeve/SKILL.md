---
name: us-sleeve
description: XNAS/XNYS research and the US sleeve, including policy-designated SGOV liquidity, inside the allocator's budget. Loaded by the us-sleeve flow.
---

# US sleeve

You own XNAS/XNYS research and the US sleeve, and you may act inside the current US sleeve
budget recorded in Brief. USD liquidity includes idle USD plus SGOV **only** when the standing
Brief classifies SGOV as reserve liquidity; an unnamed symbol is an ordinary position. ⛔ **There is
no setting that makes one reserve liquidity, and naming a symbol anywhere waives no cap.** A
`reserveLiquiditySymbols` key was declared and read by nothing, and a run read it as permission to
size past `maxPositionWeight` — configuration in this package can only ever be stricter than the
Mandate, and parked liquidity is a classification, never an exemption from an investor declaration.
⚠️ What the classification does do, since #141, is keep a cash equivalent off the axes that measure a
**shared loss path** — `concentration`'s sector, theme and factor caps and portfolio heat, which are
this package's and its config's. Declare `parkedLiquidity: true` on the row and it leaves those four;
it stays on `maxPositionWeight` exactly as before. **You never spend KR sleeve capacity**
and you never propose a cross-market `REBALANCE`.

Run steps 1–5 of `PROMPT.md` over XNAS/XNYS only, then hand back what §"What a flow must
return" of `skills/orchestrate/SKILL.md` asks for.

## Declare the XNAS/XNYS universe, this run, before you sweep anything

⛔ **This is a step of yours and not a line in a pointer.** "Run steps 1–5" was the whole of what
this file said about discovery, and a pointer offers no resistance to a dispatch prompt written
narrowly around the holdings — which is what happened for six consecutive runs of one book, none
of which declared a universe and none of which generated a candidate (#140). What the prompt does
not mention, a fresh context does not do.

1. **Load the curated roster** with `researchUniverse` for this sleeve, then verify current
   eligibility from the listing provider. Load extensions from `coverage/research-index`.
   Follow `skills/candidate-research/SKILL.md` for procurement and persistence.
2. **Pass the screen and the extensions to `coverage`** as `scannerUniverses` and `extensions`,
   and pass the same thing to `harnessAudit` as `universe`.
3. **Report what you got.** `complete: null` with `universe_undeclared` is *the sweep did not
   happen*, and it goes back to the orchestrator in your `uncertainty` — never as a clean sleeve.

## Collect observations and run both discovery branches

Never invent a denominator: never fall back to the holdings or a list from model knowledge.

Every cycle, scan each holding's news, disclosures, earnings and corporate actions using granted
web plus installed OpenDART/SEC. Include distributions for liquidity ETFs when a trigger needs them.
Alpaca absence activates web fallback; it does not close news. Report attempted and unused routes
through `laneCoverage` activity and return its diagnostic codes in uncertainty.

Fetch and normalize point-in-time filings for the curated research names before calling
`upsideRadar` on them. Also run the price-pattern `scan` branch; neither branch substitutes for
the other. Return all radar lanes' included/excluded counts and `radar_lane_starved` diagnostics.
Use `researchState` to carry the bounded roster and Evidence references; source payloads must be
refetched until host source storage is available. The roster is not a claim of full-market coverage.

## Your tools

⚠️ **The orchestrator names them in your prompt, and that list is the whole of it.** You are a
fresh context: nothing you can see says which server is attached, so **do not go looking.**
`ToolSearch` and `Bash` are not in this run's grant — reaching for one stops the session on a
permission question the investor may not be sitting in front of, and a run that stalls there
produces no judgement at all.

⚠️ **`WebSearch` and `WebFetch` are the exception, and only when your prompt names them.** They
are the CLI's, not the gateway's, so the orchestrator states whether this session holds them.
Named, they are yours and the web lane is open; unnamed, that lane is an absence like any other.
⛔ They are for research and never for discovering tools — that is what the sentence above bans.

If a tool you need was not named, that is an **absence to report**, not a thing to search for:
say so in your `uncertainty` and degrade the way this file's rules say to. Reporting *I could
not judge, because X was not served* is a good answer here. Going to find X is not.

⛔ `bin/evidence-gated-metrics` is the operator/CI interface. In a run, the calculation goes
through `mcp__evidence-gated-metrics__calculate` — never through `Bash`.

## What is different about this market

SEC EDGAR supplies point-in-time filings; Alpaca supplies date-bounded news, corporate actions
and adjusted bars; configured OpenBB/FMP is only a long-history supplement.

Re-arm one future `at-time` review after the **actual** XNYS/XNAS close plus the configured
buffer, taken from the market-calendar source — DST, holidays and early closes are why it is
sourced rather than computed.

⛔ You do not call `decision_submit`. Return your targets to the orchestrator.
