/**
 * ── One book, one position, one set of limits ──────────────────────────────
 *
 * This package is meant to be installed beside other managers, possibly beside a
 * second copy of itself, and the failure that arrangement produces is arithmetical
 * rather than philosophical: three managers each sized to a 10% single-name cap on
 * the same name hold 30% of one company, and every one of them can show its working.
 *
 * Two rules stop that, and both are here because neither can be stated as prose a
 * model checks itself against:
 *
 *   ⛔ **Exposure is measured over the whole account** — every real holding *and*
 *      every open proposal nobody has approved yet, whoever wrote them. A proposal
 *      that has not been filled is exposure that is about to exist, and leaving it
 *      out is how a book arrives at its limit twice in one morning.
 *
 *   ⛔ **Per-strategy caps never sum into an account cap.** If this package's own
 *      ceiling is 10% and a sibling's is 10%, the account's ceiling is whatever the
 *      account's ceiling is — not 20%. The binding number is the **minimum** of the
 *      caps that apply, and a run that adds them is reported.
 *
 * ⚠️ **A holding is one quantity however many theses are attached to it.** Two rows
 * for one symbol are two claims about one position, and they are counted once. The
 * duplicate is reported, because a book that produced one has two managers who each
 * think they own it.
 *
 * ⚠️ **Derived from `managers/evidence-gated/lib/sizing.mjs`'s `concentration`** in
 * shape only — positions plus proposed rows folded against a cap table, headroom
 * reported per axis. Its sleeve budgets, currency conversion and theme axis are that
 * package's and are not here.
 */

import { diagnostic, finite, round } from './numbers.mjs'
import { THRESHOLDS } from './thresholds.mjs'

/**
 * @param {object} input
 * @param {{symbol:string, sector?:string, weight:number}} input.proposed
 * @param {Array} [input.holdings]       real positions: `{ symbol, sector, weight, strategy }`
 * @param {Array} [input.openProposals]  unapproved proposals: `{ symbol, sector, weight, strategy, decisionId }`
 * @param {object} [input.caps]          `{ accountPositionCap, accountSectorCap, accountGrossCap, strategyPositionCap }`
 * @param {string} [input.strategy]      this package's instance id, for the overlap message
 */
export function concentration(input = {}) {
  const diagnostics = []
  const proposed = input.proposed ?? {}
  const caps = input.caps ?? {}
  const symbol = proposed.symbol
  const sector = proposed.sector ?? null

  if (typeof symbol !== 'string' || symbol.length === 0 || !finite(proposed.weight)) {
    diagnostics.push(
      diagnostic('proposal_not_readable', 'unevaluated', 'A concentration check needs the symbol and the weight being proposed.', 'proposed'),
    )
    return { data: emptyAnswer(), diagnostics }
  }

  // ── what the account already holds, counted once per symbol ──────────────
  const heldBySymbol = new Map()
  for (const row of input.holdings ?? []) {
    if (typeof row?.symbol !== 'string' || !finite(row?.weight)) continue
    const existing = heldBySymbol.get(row.symbol)
    if (existing === undefined) {
      heldBySymbol.set(row.symbol, { ...row })
      continue
    }
    diagnostics.push(
      diagnostic(
        'duplicate_position_rows',
        'warn',
        `${row.symbol} arrived as more than one holding row. A position is one quantity however many theses are attached to it, so the larger row is counted and the rest are not added.`,
        'holdings',
        { symbol: row.symbol },
      ),
    )
    if (row.weight > existing.weight) heldBySymbol.set(row.symbol, { ...row })
  }

  const held = heldBySymbol.get(symbol)?.weight ?? 0
  let openSame = 0
  for (const row of input.openProposals ?? []) {
    if (typeof row?.symbol !== 'string' || !finite(row?.weight)) continue
    if (row.symbol !== symbol) continue
    openSame += row.weight
    if (input.strategy !== undefined && row.strategy !== undefined && row.strategy !== input.strategy) {
      diagnostics.push(
        diagnostic(
          'overlapping_open_proposal',
          'warn',
          `${row.strategy} already has an unapproved proposal on ${symbol} for ${round(row.weight)} of the book. It is exposure that is about to exist and it is counted here; if both are approved the account holds the sum, and neither manager would have seen it.`,
          'openProposals',
          { symbol, strategy: row.strategy, weight: round(row.weight), decisionId: row.decisionId ?? null },
        ),
      )
    }
  }

  const existingExposure = held + openSame
  const projected = existingExposure + proposed.weight

  // ── the caps, folded by minimum and never by sum ─────────────────────────
  const positionCaps = [
    ['accountPositionCap', caps.accountPositionCap],
    ['strategyPositionCap', caps.strategyPositionCap],
  ].filter(([, value]) => finite(value))
  if (positionCaps.length === 0) {
    diagnostics.push(
      diagnostic('position_cap_not_stated', 'unevaluated', 'No single-name ceiling was stated for this account, so there is nothing to check the projection against.', 'caps.accountPositionCap'),
    )
    return { data: emptyAnswer({ existingExposure, projected }), diagnostics }
  }
  if (positionCaps.length > 1) {
    const sum = positionCaps.reduce((total, [, value]) => total + value, 0)
    diagnostics.push(
      diagnostic(
        'strategy_caps_do_not_sum',
        'info',
        `Two ceilings apply to this name and the binding one is the smaller. They are not added: ${round(sum)} of the book is what a run gets by summing limits that were each written as a limit on the whole.`,
        'caps',
        { caps: Object.fromEntries(positionCaps.map(([name, value]) => [name, round(value)])), sum: round(sum) },
      ),
    )
  }
  const positionCap = positionCaps.reduce(
    (lowest, [name, value]) => (value < lowest.value ? { name, value } : lowest),
    { name: positionCaps[0][0], value: positionCaps[0][1] },
  )

  const symbolHeadroom = positionCap.value - existingExposure
  if (projected > positionCap.value + THRESHOLDS.weightTolerance) {
    diagnostics.push(
      diagnostic(
        'concentration_limit_exceeded',
        'blocked',
        `${symbol} would reach ${round(projected)} of the account against a ${positionCap.name} of ${round(positionCap.value)}, counting ${round(held)} held and ${round(openSame)} already proposed. The claim may be right; the book cannot carry this much of it.`,
        'proposed.weight',
        { symbol, held: round(held), openProposals: round(openSame), proposed: round(proposed.weight), projected: round(projected), cap: round(positionCap.value), capName: positionCap.name },
      ),
    )
  }

  // ── the sector axis, on the same two sources ─────────────────────────────
  let sectorExposure = null
  let sectorHeadroom = null
  if (sector !== null && finite(caps.accountSectorCap)) {
    sectorExposure = 0
    for (const row of heldBySymbol.values()) if (row.sector === sector) sectorExposure += row.weight
    for (const row of input.openProposals ?? []) {
      if (row?.sector === sector && finite(row?.weight)) sectorExposure += row.weight
    }
    sectorHeadroom = caps.accountSectorCap - sectorExposure
    if (sectorExposure + proposed.weight > caps.accountSectorCap + THRESHOLDS.weightTolerance) {
      diagnostics.push(
        diagnostic(
          'sector_limit_exceeded',
          'blocked',
          `This sector would reach ${round(sectorExposure + proposed.weight)} against a ceiling of ${round(caps.accountSectorCap)}. A shareholder-return thesis is unusually likely to find several names in one sector at once, which is exactly when this limit is doing work.`,
          'proposed.sector',
          { sector, sectorExposure: round(sectorExposure), cap: round(caps.accountSectorCap) },
        ),
      )
    }
  }

  const blocked = diagnostics.some((row) => row.severity === 'blocked')
  return {
    data: {
      symbol,
      held: round(held),
      openProposals: round(openSame),
      existingExposure: round(existingExposure),
      projectedExposure: round(projected),
      bindingPositionCap: round(positionCap.value),
      bindingPositionCapName: positionCap.name,
      symbolHeadroom: round(Math.max(0, symbolHeadroom)),
      sectorExposure: finite(sectorExposure) ? round(sectorExposure) : null,
      sectorHeadroom: finite(sectorHeadroom) ? round(Math.max(0, sectorHeadroom)) : null,
      withinLimits: !blocked,
      outcomeCode: blocked ? 'risk_limit_exceeded' : null,
      units: {
        held: 'portfolio-weight',
        projectedExposure: 'portfolio-weight',
        symbolHeadroom: 'portfolio-weight',
        sectorHeadroom: 'portfolio-weight',
      },
    },
    diagnostics,
  }
}

function emptyAnswer(partial = {}) {
  return {
    symbol: null,
    held: null,
    openProposals: null,
    existingExposure: finite(partial.existingExposure) ? round(partial.existingExposure) : null,
    projectedExposure: finite(partial.projected) ? round(partial.projected) : null,
    bindingPositionCap: null,
    bindingPositionCapName: null,
    symbolHeadroom: null,
    sectorExposure: null,
    sectorHeadroom: null,
    withinLimits: null,
    outcomeCode: null,
    units: { projectedExposure: 'portfolio-weight' },
  }
}
