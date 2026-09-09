/**
 * ── Where the money for the programme comes from, judged in the sector's own
 *    units ──────────────────────────────────────────────────────────────────
 *
 * A shareholder return is paid out of something. For a bank it is paid out of
 * capital above the ratio the regulator and the issuer's own policy require it to
 * hold; for an industrial it is paid out of cash left after the investment the
 * business needs to stay in business. Those are two different questions with two
 * different arithmetics, and the failure this module is built to prevent is asking
 * one of them everywhere:
 *
 * ⛔ **A CET1 ratio on a shipbuilder is not a conservative reading; it is a number
 * about nothing.** A run that hands `cet1` for a non-financial is refused here, and a
 * run that judges a bank's return capacity on net-debt-to-EBITDA is refused too.
 * Neither is corrected into the other, because the correction would be this package
 * inventing the figure it was not given.
 *
 * ⚠️ **No ratio in here has a number written by this package.** The regulatory
 * minimum, the issuer's own policy target and any leverage ceiling all arrive as
 * inputs, from the filing or the policy statement that declared them, and an absent
 * one is `unevaluated`. That is what keeps the check from ageing: Basel's buffers and
 * an issuer's stated CET1 target both move, and a package carrying last year's copy
 * would refuse a company that had cleared the bar it was actually held to.
 */

import { absentFields, diagnostic, finite, isBlocked, round } from './numbers.mjs'

const FINANCIAL_ONLY = ['cet1', 'policyTargetCet1', 'regulatoryMinimumCet1', 'riskWeightedAssets']
const NON_FINANCIAL_ONLY = ['netDebt', 'ebitda', 'netDebtToEbitdaCeiling']

/**
 * @param {object} input
 * @param {'financial'|'non-financial'} input.sector
 * @param {object} [input.financial]      `{ cet1, policyTargetCet1, regulatoryMinimumCet1, riskWeightedAssets, marketCap, roe, creditCostRatio, creditCostGuidance, projectFinanceExposureRatio }`
 * @param {object} [input.nonFinancial]   `{ operatingCashFlow, maintenanceCapex, requiredInvestment, netDebt, ebitda, netDebtToEbitdaCeiling, marketCap, plannedReturnCash }`
 */
export function capitalHeadroom(input = {}) {
  const diagnostics = []
  const sector = input.sector

  if (sector !== 'financial' && sector !== 'non-financial') {
    diagnostics.push(
      diagnostic(
        'sector_not_stated',
        'unevaluated',
        'Which arithmetic answers this question is a property of the sector, and no sector was stated. Nothing is judged rather than a bank ratio being tried on whatever this is.',
        'sector',
      ),
    )
    return { data: emptyAnswer(null), diagnostics }
  }

  // ── the cross-sector refusal, before any arithmetic ──────────────────────
  const strayFinancial = sector === 'non-financial' ? FINANCIAL_ONLY.filter((key) => finite(input.financial?.[key])) : []
  const strayNonFinancial = sector === 'financial' ? NON_FINANCIAL_ONLY.filter((key) => finite(input.nonFinancial?.[key])) : []
  for (const key of strayFinancial) {
    diagnostics.push(
      diagnostic(
        'bank_metric_out_of_sector',
        'blocked',
        `${key} is a bank capital figure and this issuer is not a bank. A capital-adequacy verdict reached through it would be a number about nothing, so it is refused rather than read.`,
        `financial.${key}`,
      ),
    )
  }
  for (const key of strayNonFinancial) {
    diagnostics.push(
      diagnostic(
        'industrial_metric_out_of_sector',
        'blocked',
        `${key} judges an industrial balance sheet, and a bank's return capacity is a capital ratio rather than a leverage multiple. Refused rather than read.`,
        `nonFinancial.${key}`,
      ),
    )
  }
  if (isBlocked(diagnostics)) return { data: emptyAnswer(sector), diagnostics }

  return sector === 'financial' ? financialHeadroom(input.financial ?? {}, diagnostics) : industrialHeadroom(input.nonFinancial ?? {}, diagnostics)
}

/**
 * A bank's return capacity is the capital it holds above what it is required and has
 * promised to hold, converted into money by the risk-weighted assets that ratio is a
 * ratio *of*.
 *
 *   headroomRatio        = cet1 − policyTargetCet1                   [ratio]
 *   distributableCapital = headroomRatio × riskWeightedAssets        [currency]
 *   returnHeadroomYield  = distributableCapital / marketCap          [share of market cap]
 *
 * ⚠️ The policy target, not the regulatory minimum, is what sizes the headroom. A bank
 * that has told the market it runs at 13% has 13% as its floor whatever Basel permits,
 * and a package sizing a programme out of the gap between 13% and the regulatory
 * minimum would be spending capital the issuer has already promised not to spend.
 */
function financialHeadroom(financial, diagnostics) {
  const missing = absentFields(financial, ['cet1', 'policyTargetCet1', 'riskWeightedAssets', 'marketCap'])
  if (missing.length > 0) {
    diagnostics.push(
      diagnostic(
        'capital_inputs_missing',
        'unevaluated',
        `Return headroom needs ${missing.join(', ')}. This is an absence — it says nothing about whether the capital is there.`,
        'financial',
        { missing },
      ),
    )
    return { data: emptyAnswer('financial'), diagnostics }
  }

  const headroomRatio = financial.cet1 - financial.policyTargetCet1
  const distributableCapital = headroomRatio * financial.riskWeightedAssets
  const returnHeadroomYield = distributableCapital / financial.marketCap

  if (finite(financial.regulatoryMinimumCet1) && financial.cet1 < financial.regulatoryMinimumCet1) {
    diagnostics.push(
      diagnostic(
        'capital_below_regulatory_minimum',
        'blocked',
        'Common equity is below the minimum this issuer is required to hold. There is no return programme to judge: the supervisor is ahead of the shareholder in the queue.',
        'financial.cet1',
        { cet1: round(financial.cet1), regulatoryMinimumCet1: round(financial.regulatoryMinimumCet1) },
      ),
    )
  } else if (headroomRatio <= 0) {
    diagnostics.push(
      diagnostic(
        'return_headroom_absent',
        'blocked',
        'Common equity is at or below the ratio the issuer itself says it runs to, so there is no capital above the promise out of which an incremental return could be paid. A programme announced from here is funded by breaking the policy or by not happening.',
        'financial.cet1',
        { cet1: round(financial.cet1), policyTargetCet1: round(financial.policyTargetCet1), headroomRatio: round(headroomRatio) },
      ),
    )
  }

  if (finite(financial.creditCostRatio) && finite(financial.creditCostGuidance) && financial.creditCostRatio > financial.creditCostGuidance) {
    diagnostics.push(
      diagnostic(
        'credit_cost_above_guidance',
        'warn',
        'The credit cost ratio is running above the issuer\'s own guidance, which is where a capital ratio goes next. It does not refuse the programme; it is the first place to look when the next quarter\'s headroom is smaller.',
        'financial.creditCostRatio',
        { creditCostRatio: round(financial.creditCostRatio), guidance: round(financial.creditCostGuidance) },
      ),
    )
  }
  if (finite(financial.projectFinanceExposureRatio) && financial.projectFinanceExposureRatio > 0) {
    diagnostics.push(
      diagnostic(
        'project_finance_exposure_reported',
        'info',
        'Property project-finance exposure is carried as a stated share of the loan book so that the bear case is written against a number rather than against a mood.',
        'financial.projectFinanceExposureRatio',
        { projectFinanceExposureRatio: round(financial.projectFinanceExposureRatio) },
      ),
    )
  }

  return {
    data: {
      sector: 'financial',
      basis: 'cet1-headroom-over-policy-target',
      headroomRatio: round(headroomRatio),
      distributableCapital: round(distributableCapital, 2),
      returnHeadroomYield: round(returnHeadroomYield),
      returnOnEquity: finite(financial.roe) ? round(financial.roe) : null,
      adequate: !isBlocked(diagnostics),
      units: {
        headroomRatio: 'ratio-of-risk-weighted-assets',
        distributableCapital: 'currency-major-units',
        returnHeadroomYield: 'share-of-market-cap',
        returnOnEquity: 'ratio',
      },
    },
    diagnostics,
  }
}

/**
 * An industrial's return capacity is cash, after the investment the business cannot
 * skip.
 *
 *   freeCashAfterInvestment = operatingCashFlow − maintenanceCapex − requiredInvestment
 *   coverage                = freeCashAfterInvestment / plannedReturnCash
 *   returnHeadroomYield     = max(0, freeCashAfterInvestment) / marketCap
 *   leverage                = netDebt / ebitda
 *
 * ⚠️ `requiredInvestment` is separate from maintenance capex on purpose: the thing
 * that kills an industrial's dividend is not the lathe it replaces every year, it is
 * the plant it has already committed to build.
 */
function industrialHeadroom(nonFinancial, diagnostics) {
  const missing = absentFields(nonFinancial, ['operatingCashFlow', 'maintenanceCapex', 'plannedReturnCash', 'marketCap'])
  if (missing.length > 0) {
    diagnostics.push(
      diagnostic(
        'cash_flow_inputs_missing',
        'unevaluated',
        `Return headroom needs ${missing.join(', ')}. This is an absence, and an absent cash flow statement is not a deteriorating one.`,
        'nonFinancial',
        { missing },
      ),
    )
    return { data: emptyAnswer('non-financial'), diagnostics }
  }

  const requiredInvestment = finite(nonFinancial.requiredInvestment) ? nonFinancial.requiredInvestment : 0
  if (!finite(nonFinancial.requiredInvestment)) {
    diagnostics.push(
      diagnostic(
        'required_investment_not_stated',
        'warn',
        'No committed investment was stated, so the free cash below is measured after maintenance capex only. If there is a committed build, this figure is too high.',
        'nonFinancial.requiredInvestment',
      ),
    )
  }
  const freeCash = nonFinancial.operatingCashFlow - nonFinancial.maintenanceCapex - requiredInvestment
  const coverage = nonFinancial.plannedReturnCash > 0 ? freeCash / nonFinancial.plannedReturnCash : null
  const leverage = finite(nonFinancial.netDebt) && finite(nonFinancial.ebitda) && nonFinancial.ebitda > 0 ? nonFinancial.netDebt / nonFinancial.ebitda : null

  if (finite(coverage) && coverage < 1) {
    diagnostics.push(
      diagnostic(
        'return_not_covered_by_cash_flow',
        'blocked',
        'The planned return is larger than the cash left after the investment this business has to make, so it would be paid out of the balance sheet. That is a distribution, not a return programme a thesis can rest on.',
        'nonFinancial.plannedReturnCash',
        { freeCashAfterInvestment: round(freeCash, 2), coverage: round(coverage) },
      ),
    )
  }
  if (finite(leverage) && finite(nonFinancial.netDebtToEbitdaCeiling) && leverage > nonFinancial.netDebtToEbitdaCeiling) {
    diagnostics.push(
      diagnostic(
        'leverage_above_declared_ceiling',
        'blocked',
        'Net debt to EBITDA is above the ceiling this issuer or its covenants declared. Debt reduction has first claim on the cash, and a return programme competing with it is the one that gets cut.',
        'nonFinancial.netDebt',
        { leverage: round(leverage), ceiling: round(nonFinancial.netDebtToEbitdaCeiling) },
      ),
    )
  }

  return {
    data: {
      sector: 'non-financial',
      basis: 'free-cash-after-required-investment',
      freeCashAfterInvestment: round(freeCash, 2),
      returnCoverage: finite(coverage) ? round(coverage) : null,
      leverage: finite(leverage) ? round(leverage) : null,
      returnHeadroomYield: round(Math.max(0, freeCash) / nonFinancial.marketCap),
      adequate: !isBlocked(diagnostics),
      units: {
        freeCashAfterInvestment: 'currency-major-units',
        returnCoverage: 'times-planned-return',
        leverage: 'times-ebitda',
        returnHeadroomYield: 'share-of-market-cap',
      },
    },
    diagnostics,
  }
}

function emptyAnswer(sector) {
  return {
    sector,
    basis: null,
    returnHeadroomYield: null,
    adequate: null,
    units: { returnHeadroomYield: 'share-of-market-cap' },
  }
}
