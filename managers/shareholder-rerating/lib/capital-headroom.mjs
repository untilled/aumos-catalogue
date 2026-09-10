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
 *
 * ── «Financial» is four balance sheets and it was one word (#269) ──────────
 *
 * ⛔ **The refusal above ran across the financial/non-financial line and not inside
 * it.** A CET1 ratio handed in for a shipbuilder was refused; a CET1 ratio handed in
 * for a *life insurer* was accepted and divided into risk-weighted assets, because
 * both are `financial` and nothing here asked which kind. An insurer's solvency is
 * K-ICS, a broker's is the NCR, and a financial holding company is a consolidation of
 * whichever of those it owns. Being financial is not a reason to enter a bank's
 * arithmetic; being a **bank** is.
 *
 * So the issuer kind is five things and no longer two:
 *
 *   `bank`            a bank or a bank-led financial holding company — CET1 headroom
 *   `non-financial`   an operating company — free cash after required investment
 *   `insurance`       ⛔ **not supported.** K-ICS, and it is not a CET1 in other units
 *   `securities`      ⛔ **not supported.** the NCR, and neither is that
 *   `unclassified`    복합·기타·분류 미확인 — a conglomerate, or nobody has said yet
 *
 * ⛔ **The three unsupported kinds return `unevaluated` and never a number.** #269 is
 * explicit that the honest answer is to say so: a solvency ratio's meaning and the
 * arithmetic that turns it into distributable capital both have to be designed, and
 * putting K-ICS or the NCR into the `cet1` slot because both are «capital ratios» is
 * the same defect as the one this file already refuses, wearing a different label. An
 * explicit non-evaluation is a wait; a silent pass is a position.
 *
 * ⚠️ **The legacy word `financial` is now one of the unclassified.** It named the set
 * that contains all three of the supported and unsupported financial kinds, so it
 * cannot select one of them, and a caller still saying it is told which word to say.
 *
 * ⚠️ **The classification carries its own receipts.** `classification.basis` is the
 * filing or business report the kind was read off, and `classification.consolidationBasis`
 * says whether the capital ratio describes the consolidated group or the bank alone —
 * a holding company's consolidated CET1 and its banking subsidiary's are different
 * numbers about different entities, and a headroom quoted without saying which is a
 * number a reader cannot check. Both are reported when absent and both travel in the
 * answer when present.
 */

import { absentFields, diagnostic, finite, isBlocked, round } from './numbers.mjs'

const BANK_ONLY = ['cet1', 'policyTargetCet1', 'regulatoryMinimumCet1', 'riskWeightedAssets']
const NON_FINANCIAL_ONLY = ['netDebt', 'ebitda', 'netDebtToEbitdaCeiling']

/**
 * The five issuer kinds, and what this package can do with each. `supported` is the
 * whole of the difference: two of them have an arithmetic here and three of them are
 * an explicit non-evaluation.
 */
export const ISSUER_KINDS = Object.freeze({
  bank: Object.freeze({ supported: true, basis: 'cet1-headroom-over-policy-target', label: '은행·은행계 금융지주' }),
  'non-financial': Object.freeze({ supported: true, basis: 'free-cash-after-required-investment', label: '일반 비금융' }),
  insurance: Object.freeze({ supported: false, ratio: 'K-ICS', label: '보험' }),
  securities: Object.freeze({ supported: false, ratio: 'NCR', label: '증권' }),
  unclassified: Object.freeze({ supported: false, ratio: null, label: '복합·기타·분류 미확인' }),
})

/** Words a caller may still be saying, and the word to say instead. */
const RETIRED_KINDS = Object.freeze({
  financial: 'bank, insurance, securities or unclassified',
})

const CONSOLIDATION_BASES = Object.freeze(['consolidated', 'standalone'])

/**
 * @param {object} input
 * @param {'bank'|'insurance'|'securities'|'non-financial'|'unclassified'} input.issuerKind
 *   the **issuer kind** — 기업 분석용 업종, which decides *which arithmetic* answers the
 *   question. It is not the fund's risk-management sector; that one belongs to the
 *   host and is folded by `concentration.mjs` under a Mandate ceiling.
 * @param {object} [input.classification] `{ basis, consolidationBasis }` — the filing the kind
 *   was read off, and whether the capital figures are consolidated or standalone
 * @param {object} [input.financial]      `{ cet1, policyTargetCet1, regulatoryMinimumCet1, riskWeightedAssets, marketCap, roe, creditCostRatio, creditCostGuidance, projectFinanceExposureRatio }`
 * @param {object} [input.nonFinancial]   `{ operatingCashFlow, maintenanceCapex, requiredInvestment, netDebt, ebitda, netDebtToEbitdaCeiling, marketCap, plannedReturnCash }`
 */
export function capitalHeadroom(input = {}) {
  const diagnostics = []
  const issuerKind = input.issuerKind
  const classification = readClassification(input.classification, diagnostics)

  if (typeof issuerKind === 'string' && issuerKind in RETIRED_KINDS) {
    /**
     * ⛔ The word that used to select the bank arithmetic. It names the *set* that
     * contains banks, insurers and brokers, so it cannot select any one of them, and
     * a caller who says it has not classified the issuer — they have said it is
     * financial, which is the question rather than the answer.
     */
    diagnostics.push(
      diagnostic(
        'issuer_kind_not_specific',
        'unevaluated',
        `"${issuerKind}" names a set of balance sheets rather than one of them: a bank's solvency is CET1, an insurer's is K-ICS and a broker's is the NCR, and being in the set is not a reason to be read as the first. State ${RETIRED_KINDS[issuerKind]}.`,
        'issuerKind',
        { issuerKind, say: RETIRED_KINDS[issuerKind] },
      ),
    )
    return { data: emptyAnswer(null, classification), diagnostics }
  }
  if (!(typeof issuerKind === 'string' && issuerKind in ISSUER_KINDS)) {
    diagnostics.push(
      diagnostic(
        'issuer_kind_not_stated',
        'unevaluated',
        `Which arithmetic answers this question is a property of the issuer kind, and no recognised one was stated. One of ${Object.keys(ISSUER_KINDS).join(', ')}. Nothing is judged rather than a bank ratio being tried on whatever this is.`,
        'issuerKind',
        { issuerKind: issuerKind ?? null, recognised: Object.keys(ISSUER_KINDS) },
      ),
    )
    return { data: emptyAnswer(null, classification), diagnostics }
  }

  /**
   * ── the cross-kind refusal, before any arithmetic ────────────────────────
   *
   * ⛔ **This runs for every kind that is not `bank`, which is the hole #269 names.**
   * It used to run only for `non-financial`, so an insurer or a broker carrying a
   * `cet1` was inside `financial` and inside the bank arithmetic with it.
   */
  const strayBank = issuerKind === 'bank' ? [] : BANK_ONLY.filter((key) => finite(input.financial?.[key]))
  const strayNonFinancial = issuerKind === 'non-financial' ? [] : NON_FINANCIAL_ONLY.filter((key) => finite(input.nonFinancial?.[key]))
  for (const key of strayBank) {
    diagnostics.push(
      diagnostic(
        'bank_metric_out_of_sector',
        'blocked',
        `${key} is a bank capital figure and this issuer is ${ISSUER_KINDS[issuerKind].label} (${issuerKind}), not a bank. A capital-adequacy verdict reached through it would be a number about nothing, so it is refused rather than read.`,
        `financial.${key}`,
        { issuerKind, key },
      ),
    )
  }
  for (const key of strayNonFinancial) {
    diagnostics.push(
      diagnostic(
        'industrial_metric_out_of_sector',
        'blocked',
        `${key} judges an industrial balance sheet, and a financial issuer's return capacity is a solvency ratio rather than a leverage multiple. Refused rather than read.`,
        `nonFinancial.${key}`,
        { issuerKind, key },
      ),
    )
  }
  if (isBlocked(diagnostics)) return { data: emptyAnswer(issuerKind, classification), diagnostics }

  /**
   * ⛔ **The explicit non-evaluation.** #269's scope keeps the bank and the operating
   * company arithmetic and stops there. An insurer, a broker and an unclassified
   * conglomerate leave here as `unevaluated` with the ratio that *would* answer them
   * named, so the gap is a thing somebody can pick up rather than a silence.
   */
  if (!ISSUER_KINDS[issuerKind].supported) {
    const ratio = ISSUER_KINDS[issuerKind].ratio
    diagnostics.push(
      diagnostic(
        issuerKind === 'unclassified' ? 'issuer_kind_unclassified' : 'capital_headroom_method_unsupported',
        'unevaluated',
        issuerKind === 'unclassified'
          ? 'This issuer is a conglomerate, something else, or nothing anybody has classified yet, so there is no single arithmetic that answers where its return would be paid from. It is left unevaluated rather than read as an operating company because a group with a financial subsidiary is not one.'
          : `${ISSUER_KINDS[issuerKind].label} (${issuerKind}) solvency is measured by ${ratio}, and this package implements the bank and the operating-company arithmetic only. ${ratio} is not a CET1 in other units: what counts as distributable capital under it, and what the ratio means, both have to be designed before a number here would mean anything. Unsupported is stated rather than approximated.`,
        'issuerKind',
        { issuerKind, ratio },
      ),
    )
    return { data: emptyAnswer(issuerKind, classification), diagnostics }
  }

  return issuerKind === 'bank'
    ? financialHeadroom(input.financial ?? {}, diagnostics, classification)
    : industrialHeadroom(input.nonFinancial ?? {}, diagnostics, classification)
}

/**
 * The receipts on the classification: which document it was read off, and whether the
 * capital figures describe the consolidated group or the entity alone.
 *
 * ⚠️ **Both are `warn` and neither refuses**, on `regulatory_minimum_not_stated`'s
 * argument: the ratio is the number it is whichever entity it describes, and what an
 * absent basis costs is the ability to *say* which — so it is reported wherever the
 * capital position is quoted rather than turned into a refusal of the company.
 */
function readClassification(classification, diagnostics) {
  const basis = typeof classification?.basis === 'string' && classification.basis.length > 0 ? classification.basis : null
  const raw = classification?.consolidationBasis
  const consolidationBasis = CONSOLIDATION_BASES.includes(raw) ? raw : null
  if (basis === null) {
    diagnostics.push(
      diagnostic(
        'issuer_classification_basis_not_stated',
        'warn',
        'No filing or business report was named as the reason this issuer is the kind it is said to be. The kind decides which arithmetic runs, so the document it was read off belongs beside it — say the disclosure, not the impression.',
        'classification.basis',
      ),
    )
  }
  if (consolidationBasis === null) {
    diagnostics.push(
      diagnostic(
        'capital_basis_not_stated',
        'warn',
        `Neither ${CONSOLIDATION_BASES.join(' nor ')} was stated, so this answer cannot say which entity its figures describe. A financial holding company's consolidated CET1 and its banking subsidiary's standalone ratio are two different numbers, and a headroom quoted without saying which is one a reader cannot check.`,
        'classification.consolidationBasis',
        { stated: raw ?? null, recognised: CONSOLIDATION_BASES },
      ),
    )
  }
  return { basis, consolidationBasis }
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
function financialHeadroom(financial, diagnostics, classification) {
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
    return { data: emptyAnswer('bank', classification), diagnostics }
  }

  const headroomRatio = financial.cet1 - financial.policyTargetCet1
  const distributableCapital = headroomRatio * financial.riskWeightedAssets
  const returnHeadroomYield = distributableCapital / financial.marketCap

  if (!finite(financial.regulatoryMinimumCet1)) {
    /**
     * ⚠️ Same defect class as findings ①②④: a limit that is absent must not read as a
     * limit that was cleared. It is a `warn` rather than `unevaluated` because the test
     * below it is strictly tighter — an issuer's own policy target sits above the
     * supervisor's floor, so headroom over the policy target implies clearance of the
     * minimum. What the absence costs is the ability to *say* so, and that is reported.
     */
    diagnostics.push(
      diagnostic(
        'regulatory_minimum_not_stated',
        'warn',
        'No regulatory minimum was stated, so this answer cannot say the issuer clears it — only that it is above or below its own policy target. Say so wherever the capital position is quoted.',
        'financial.regulatoryMinimumCet1',
      ),
    )
  }
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

  if (finite(financial.creditCostRatio) && !finite(financial.creditCostGuidance)) {
    diagnostics.push(
      diagnostic(
        'credit_cost_guidance_not_stated',
        'info',
        'A credit cost ratio was given and the issuer\'s own guidance was not, so the comparison that would say whether it is running hot was not made rather than passed.',
        'financial.creditCostGuidance',
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
      issuerKind: 'bank',
      classification,
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
function industrialHeadroom(nonFinancial, diagnostics, classification) {
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
    return { data: emptyAnswer('non-financial', classification), diagnostics }
  }

  /**
   * ⛔ **An unstated commitment used to be treated as zero, and zero is the answer that
   * makes the coverage look best.** The number that kills an industrial's dividend is
   * the plant it has already agreed to build, so defaulting it to nothing is the same
   * defect as an unread book: the most permissive reading, taken silently. It is
   * `unevaluated` — state it as `0` when the filings show no commitment, which is a
   * claim somebody made rather than a gap nobody noticed.
   */
  if (!finite(nonFinancial.requiredInvestment)) {
    diagnostics.push(
      diagnostic(
        'required_investment_not_stated',
        'unevaluated',
        'Committed investment was not stated. Free cash measured after maintenance capex alone is an upper bound, and a coverage ratio computed from an upper bound has not verified the return. State 0 explicitly if the filings show no commitment.',
        'nonFinancial.requiredInvestment',
      ),
    )
    return { data: emptyAnswer('non-financial', classification), diagnostics }
  }
  const requiredInvestment = nonFinancial.requiredInvestment
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
  if (finite(leverage) && !finite(nonFinancial.netDebtToEbitdaCeiling)) {
    diagnostics.push(
      diagnostic(
        'leverage_ceiling_not_stated',
        'info',
        'Leverage was computed and no ceiling — covenant, rating threshold or the issuer\'s own target — was stated to compare it against, so that comparison was not made rather than passed.',
        'nonFinancial.netDebtToEbitdaCeiling',
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
      issuerKind: 'non-financial',
      classification,
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

function emptyAnswer(issuerKind, classification = { basis: null, consolidationBasis: null }) {
  return {
    issuerKind,
    classification,
    basis: null,
    returnHeadroomYield: null,
    /** ⛔ `null` and never `false`: nothing here measured the capital and found it short. */
    adequate: null,
    units: { returnHeadroomYield: 'share-of-market-cap' },
  }
}
