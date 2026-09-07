import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── The last step of the same wiring (issue #160) ──────────────────────────
 *
 * #146 was read as *the fundamental branch is starved*, and #164 built the
 * feeding path for it — registry, join, cache, `radarCandidates`. That fixed
 * **discovery**. The 2026-09-06 sizing measurement is the other end of the same
 * wire and it was never connected:
 *
 *   `variantViewCheck` → `satisfied: [variantView, consensusRefs,
 *   challengeCleared]`, `missing: [thesisComplete]`, and the thesis gaps that
 *   produced it are `catalysts`, `invalidationTriggers`, **`expectedUpsidePct`
 *   and `fairValueRange`** — whereupon `effectivePositionCap` turns a declared
 *   `0.2` into an effective `0.01`, a `reductionMultiple` of **20**.
 *
 * ⇒ Three of four requirements were met. The main lane is not shut; it has
 * never once been opened.
 *
 * ── ⚠️ Where the fair value comes from, and where it does not ──────────────
 *
 * ⛔ **This module invents no valuation method.** A package-chosen multiple or
 * DCF would be exactly #141's defect — a number the run made up becoming an
 * allocation limit — arriving through the door that limit is measured at. So
 * the derivation is read out of what this methodology *already* demands, which
 * turns out to say it in two places and to have never joined them:
 *
 * | where | the sentence |
 * |---|---|
 * | `skills/candidate-research/SKILL.md` §Candidate record 5 | *"**Scenarios** — bear/base/bull probabilities totaling 100, **target**, return and factual drivers. Compute probability-weighted return only when inputs exist."* |
 * | `skills/evidence-gates/SKILL.md` §Entry gates | *"bear/base/bull scenario inputs whose probabilities sum to 100; **positive probability-weighted return** and expected active return at least `minimumExpectedActiveReturn`"* |
 * | `researchGate` (`lib/evidence.mjs`) | already **computes** `Σ p·return` and blocks without it |
 * | `skills/candidate-research/SKILL.md` §What a thesis has to carry | `fairValueRange` — *"the low and the high, so the upside has something under it"* |
 *
 * So the methodology's own answer to *"what is this worth"* is **the scenario
 * table**: the bear and bull targets are the low and the high, and the
 * probability-weighted return is the expected upside. `researchGate` has been
 * computing the second number since the port and `validateThesis` has been
 * refusing the thesis for not carrying it. ⛔ **The number was never missing;
 * it was never carried across.** That is the whole finding, and nothing here
 * lowers a gate to act on it.
 *
 * ⚠️ **What the methodology does not say is also recorded.** There is no
 * sentence anywhere in `PROMPT.md` or `skills/` that names a multiple, a
 * discount rate or a DCF, so this package cannot compute a target from a
 * filing on its own authority and does not pretend to. What it can do — and
 * what #160 asks for — is make the filings *reach* the place the targets are
 * written: every scenario names the filing facts it rests on, and a target
 * standing on nothing is reported as standing on nothing.
 */

/** The three cases, in the order low → high they are read in. */
export const SCENARIO_CASES = Object.freeze(['bear', 'base', 'bull'])

/**
 * Filing facts a scenario driver may point at, and the field on a
 * `radarCandidates` filing that answers it. ⚠️ The list is what #164 actually
 * normalizes — a driver naming anything else is *unmatched*, never invented.
 */
export const FILING_FACTS = Object.freeze({
  revenue: 'revenue',
  operatingIncome: 'operatingIncome',
  operatingIncomeYoy: 'operatingIncomeYoy',
  marginDeltaYoy: 'marginDeltaYoy',
})

const num = (value) => (finite(value) ? value : null)

function scenarioReturnFromTarget(target, price) {
  if (!finite(target) || !finite(price) || price <= 0) return null
  return (target - price) / price
}

/**
 * Fair value and expected upside, out of the scenario table and the filings
 * under it.
 *
 * ⛔ It **derives** and does not decide. The output is offered as
 * `thesisFields` for the run to write into the Thesis; `validateThesis` still
 * refuses the thesis if they are absent, and nothing here writes them.
 *
 * ⚠️ `grounded` is about the *drivers*, not about the arithmetic. A scenario
 * whose target rests on no readable filing fact still produces a number — the
 * number is the run's — and the report says the number is unsupported rather
 * than silently ranking it beside a supported one.
 */
export function thesisValuation({ asset = null, market = null, price = null, currency = null, scenarios = {}, filings = [], asOf = null } = {}) {
  const diagnostics = []
  if (!finite(price) || price <= 0) {
    diagnostics.push(diagnostic('valuation_price_missing', 'blocked', 'A positive point-in-time price is required: a fair value with nothing to compare it against is not an upside', 'price', { asset }))
    return { data: null, diagnostics }
  }
  const usableFilings = (Array.isArray(filings) ? filings : []).filter((row) => row && typeof row === 'object')
  const latest = usableFilings
    .slice()
    .sort((a, b) => Date.parse(a.availableAt ?? 0) - Date.parse(b.availableAt ?? 0))
    .at(-1) ?? null

  const rows = []
  for (const name of SCENARIO_CASES) {
    const given = scenarios?.[name] ?? null
    const probability = num(given?.probability)
    const target = num(given?.target)
    const statedReturn = num(given?.return)
    const derivedReturn = scenarioReturnFromTarget(target, price)
    if (given === null || given === undefined) {
      diagnostics.push(diagnostic('scenario_case_absent', 'blocked', `The ${name} case is required: a range with one end missing is a point estimate wearing a range's name`, `scenarios.${name}`))
    } else if (target === null) {
      diagnostics.push(diagnostic('fair_value_target_absent', 'unevaluated', `The ${name} case carries no target, and a target is where this methodology's fair value comes from — candidate-research §Candidate record 5 asks for "target/return and factual drivers". ⛔ This package does not substitute a multiple or a discount rate of its own choosing`, `scenarios.${name}.target`))
    }
    if (statedReturn !== null && derivedReturn !== null && Math.abs(statedReturn - derivedReturn) > 0.005) {
      diagnostics.push(diagnostic('scenario_target_return_disagree', 'unevaluated', `The ${name} case states a return and a target that do not describe the same price; both are reported and neither is averaged into the other`, `scenarios.${name}`, { statedReturn: round(statedReturn), impliedByTarget: round(derivedReturn), price }))
    }
    /** ⚠️ The stated return wins where both exist: it is what `researchGate` already gates on. */
    const effectiveReturn = statedReturn !== null ? statedReturn : derivedReturn

    const drivers = (Array.isArray(given?.drivers) ? given.drivers : []).map((driver) => {
      const metric = typeof driver === 'string' ? driver : driver?.metric ?? null
      const field = metric && Object.hasOwn(FILING_FACTS, metric) ? FILING_FACTS[metric] : null
      const observed = field && latest ? num(latest[field]) : null
      return {
        metric: metric ?? null,
        matchedFilingFact: field !== null,
        observed,
        periodEnd: field && latest ? latest.periodEnd ?? null : null,
        sourceType: field && latest ? latest.sourceType ?? null : null,
        evidenceId: typeof driver === 'object' ? driver?.evidenceId ?? null : null,
      }
    })
    const grounded = drivers.some((driver) => driver.matchedFilingFact && driver.observed !== null)
    if (!grounded) {
      diagnostics.push(diagnostic(
        'scenario_driver_ungrounded',
        'unevaluated',
        `The ${name} case names no driver this run can read off a filing, so its target is the run's own number rather than a reading of the statements. ⛔ It is reported as unsupported rather than dropped: a target nobody can trace is still the target the size was computed from`,
        `scenarios.${name}.drivers`,
        { readableFacts: Object.keys(FILING_FACTS), filingsSupplied: usableFilings.length },
      ))
    }
    rows.push({ case: name, probability, target, statedReturn, impliedByTarget: derivedReturn === null ? null : round(derivedReturn), effectiveReturn: effectiveReturn === null ? null : round(effectiveReturn), drivers, grounded })
  }

  const probabilities = rows.map((row) => row.probability)
  const probabilitySum = probabilities.every((value) => value !== null) ? probabilities.reduce((sum, value) => sum + value, 0) : null
  if (probabilitySum !== null && Math.abs(probabilitySum - 1) > 1e-9) {
    diagnostics.push(diagnostic('scenario_probability_sum', 'blocked', 'Scenario probabilities must sum to 1 — the same rule researchGate applies, applied to the same table', 'scenarios', { probabilitySum: round(probabilitySum) }))
  }

  const targets = rows.map((row) => row.target).filter((value) => value !== null)
  const fairValueRange = targets.length === SCENARIO_CASES.length
    ? { low: round(Math.min(...targets), 6), high: round(Math.max(...targets), 6), currency: currency ?? latest?.currency ?? null }
    : null
  if (fairValueRange && fairValueRange.low === fairValueRange.high) {
    diagnostics.push(diagnostic('fair_value_range_degenerate', 'unevaluated', 'The three cases name one price, so the range has no width; `fairValueRange` exists to carry the disagreement between the cases and a zero-width one carries none', 'scenarios', fairValueRange))
  }

  const weighted = rows.every((row) => row.probability !== null && row.effectiveReturn !== null)
    ? rows.reduce((sum, row) => sum + row.probability * row.effectiveReturn, 0)
    : null
  const expectedUpsidePct = weighted === null ? null : round(weighted * 100, 6)
  if (weighted === null) {
    diagnostics.push(diagnostic('expected_upside_unevaluated', 'unevaluated', 'The probability-weighted return needs a probability and either a return or a target on every case; "compute probability-weighted return only when inputs exist" is the methodology\'s own instruction and an absent input is not a zero', 'scenarios'))
  }

  const groundedCases = rows.filter((row) => row.grounded).length
  if (!usableFilings.length) {
    diagnostics.push(diagnostic(
      'valuation_filings_absent',
      'unevaluated',
      'No filing was supplied, so nothing in this valuation is anchored to a statement. ⚠️ For a filer this is the feeding path not having been run — `radarCandidates` produces exactly the `filings` array this reads; for an instrument with no filer it is a fact about the instrument, and `thesisGapSources` is what tells the two apart',
      'filings',
      { asset, market },
    ))
  }

  return {
    data: {
      asset,
      market,
      price,
      /** ⚠️ Read out of the methodology, not chosen here. */
      basis: 'scenario-targets',
      basisSource: 'skills/candidate-research/SKILL.md §Candidate record 5 — bear/base/bull target, return and factual drivers',
      fairValueRange,
      expectedUpsidePct,
      probabilityWeightedReturn: weighted === null ? null : round(weighted),
      probabilitySum: probabilitySum === null ? null : round(probabilitySum),
      scenarios: rows,
      groundedCases,
      grounded: groundedCases === SCENARIO_CASES.length,
      filingsRead: usableFilings.length,
      latestPeriodEnd: latest?.periodEnd ?? null,
      /** What the run writes into the Thesis; `validateThesis` still judges it. */
      thesisFields: fairValueRange && expectedUpsidePct !== null ? { expectedUpsidePct, fairValueRange: { low: fairValueRange.low, high: fairValueRange.high } } : null,
      asOf,
    },
    diagnostics,
  }
}

/**
 * ── «채울 소스가 없다» and «채울 소스가 있는데 안 불렀다» are different facts (issue #160, ask 3) ──
 *
 * `validateThesis` hands the same four-item `gaps` list to a KR sector ETF and
 * to a listed operating company, and this instance's `run/theme-radar-last`
 * generalized from the first to the second — *"gaps expectedUpsidePct and
 * fairValueRange that no granted source can fill"*. For an ETF that sentence is
 * true. For a single name it is false: `fnlttSinglAcntAll` answers, and the
 * targets are written on top of what it says.
 *
 * ⛔ Collapsing the two is precisely the swap `radarCandidates` refuses one
 * layer down — *never fetched* rendered as *did not qualify* — so the same
 * refusal is made here, and by the same means: a **computed** distinction
 * rather than an asserted one.
 *
 * The instrument class is read off the registry, which is a fact the run
 * already holds after `mapCorporationCodes`:
 *
 * | mapping | class | what a missing valuation gap means |
 * |---|---|---|
 * | symbol resolved to a `corp_code` / CIK | `single-name-filer` | a filer exists and was not read — **`unfetched`** |
 * | registry read, symbol absent from it | `non-filer-instrument` | nothing publishes statements for it — **`no-source-exists`** |
 * | registry never read | `unknown` | ⛔ **not classified**; guessing here is the defect being fixed |
 *
 * ⚠️ Registry membership is evidence of a filer, not an instrument taxonomy,
 * and the answer says so. A caller that knows better may declare
 * `instrumentType`, and a declaration and a registry that disagree are both
 * reported rather than reconciled.
 */
const VALUATION_GAPS = new Set(['expectedUpsidePct', 'fairValueRange'])

/** Which kind of source answers each thesis gap. */
export const GAP_SOURCES = Object.freeze({
  variantView: 'run-authored',
  consensusRefs: 'web-consensus',
  catalysts: 'issuer-disclosure-calendar',
  invalidationTriggers: 'run-authored',
  expectedUpsidePct: 'issuer-financial-statements',
  fairValueRange: 'issuer-financial-statements',
})

const NON_FILER_TYPES = new Set(['etf', 'fund', 'index', 'cash', 'bond-etf'])

export function thesisGapSources({ asset = null, market = null, gaps = [], mapping = null, instrumentType = null, feed = null, filings = [], asOf = null } = {}) {
  const diagnostics = []
  const requested = (Array.isArray(gaps) ? gaps : []).filter((row) => typeof row === 'string')

  const mapped = Array.isArray(mapping?.mapped) ? mapping.mapped : null
  const unmapped = Array.isArray(mapping?.unmapped) ? mapping.unmapped : null
  const registryRead = finite(mapping?.registrySize) ? mapping.registrySize > 0 : mapped !== null || unmapped !== null
  const isMapped = mapped !== null && mapped.some((row) => (typeof row === 'string' ? row : row?.symbol) === asset)
  const isUnmapped = unmapped !== null && unmapped.includes(asset)

  const declared = typeof instrumentType === 'string' ? instrumentType.toLowerCase() : null
  const declaredNonFiler = declared !== null ? NON_FILER_TYPES.has(declared) : null

  let instrumentClass = 'unknown'
  let classBasis = 'registry-never-read'
  if (isMapped) {
    instrumentClass = 'single-name-filer'
    classBasis = 'registry-resolved-a-filer-id-for-this-symbol'
  } else if (registryRead && isUnmapped) {
    instrumentClass = 'non-filer-instrument'
    classBasis = 'registry-was-read-and-does-not-carry-this-symbol'
  } else if (declaredNonFiler === true) {
    instrumentClass = 'non-filer-instrument'
    classBasis = 'declared-by-the-caller'
  } else if (declaredNonFiler === false) {
    instrumentClass = 'single-name-filer'
    classBasis = 'declared-by-the-caller'
  }

  if (instrumentClass === 'unknown') {
    diagnostics.push(diagnostic(
      'instrument_class_unknown',
      'unevaluated',
      'Nothing here establishes whether this instrument has a filer at all, so a valuation gap cannot be read either as unfetched or as unfillable. ⛔ It is left unclassified rather than assumed: run `mapCorporationCodes` against the registry, or declare `instrumentType`',
      'mapping',
      { asset, market },
    ))
  }
  if (declaredNonFiler !== null && instrumentClass !== 'unknown' && classBasis.startsWith('registry') && declaredNonFiler === (instrumentClass === 'single-name-filer')) {
    diagnostics.push(diagnostic(
      'instrument_class_disputed',
      'unevaluated',
      'The declared instrument type and the registry disagree about whether this symbol has a filer; both readings are reported and neither overrides the other',
      'instrumentType',
      { declared, registryReading: instrumentClass },
    ))
  }

  const feedFetched = finite(feed?.fedCount) ? feed.fedCount > 0 : null
  const filingCount = Array.isArray(filings) ? filings.length : 0
  const statementsRead = filingCount > 0 || feedFetched === true

  const rows = requested.map((gap) => {
    const source = GAP_SOURCES[gap] ?? 'unknown'
    if (!VALUATION_GAPS.has(gap)) {
      return {
        gap,
        fillableBy: source,
        state: source === 'run-authored' ? 'run-authored-and-unwritten' : 'not-a-valuation-gap',
        instrumentClass,
      }
    }
    if (instrumentClass === 'non-filer-instrument') {
      return { gap, fillableBy: source, state: 'no-source-exists-for-this-instrument', instrumentClass, remedy: 'This is a cash-allocation decision, not a single-name one: candidate-research §Core DCA forbids fabricating a variant view about owning the index, and the control arm is where an instrument with no statements belongs' }
    }
    if (instrumentClass === 'single-name-filer') {
      return statementsRead
        ? { gap, fillableBy: source, state: 'source-answered-and-the-value-was-not-derived', instrumentClass, remedy: 'Call thesisValuation with the filings already fetched and the scenario table; the targets are what this methodology means by a fair value' }
        : { gap, fillableBy: source, state: 'source-exists-and-was-never-called', instrumentClass, remedy: market === 'us' ? 'sec-edgar /files/company_tickers.json \u2192 cik_str \u2192 /api/xbrl/companyfacts/CIK{10-digit zero-padded}.json (\u26d4 never the ticker \u2014 that address is a 404), then radarCandidates, then thesisValuation' : 'open-dart /api/corpCode.xml → corp_code → fnlttSinglAcntAll, then radarCandidates, then thesisValuation' }
    }
    return { gap, fillableBy: source, state: 'unclassified-instrument', instrumentClass }
  })

  const unfetched = rows.filter((row) => row.state === 'source-exists-and-was-never-called')
  if (unfetched.length) {
    diagnostics.push(diagnostic(
      'valuation_gap_is_unfetched_not_unfillable',
      'unevaluated',
      'These thesis gaps are the ones the main lane turns on, a source that fills them exists for this instrument, and it has not been called. ⛔ Recording them as "no granted source can fill" is a generalization from an instrument that has no filer to one that does, and it is what has kept the lane shut',
      'gaps',
      { gaps: unfetched.map((row) => row.gap), instrumentClass, market },
    ))
  }
  const unfillable = rows.filter((row) => row.state === 'no-source-exists-for-this-instrument')
  if (unfillable.length) {
    diagnostics.push(diagnostic(
      'valuation_gap_has_no_source_for_this_instrument',
      'unevaluated',
      'This instrument publishes no financial statements, so these gaps stay open however many times the feed is run; that is a fact about the instrument and never a reading about a company',
      'gaps',
      { gaps: unfillable.map((row) => row.gap), instrumentClass },
    ))
  }

  return {
    data: {
      asset,
      market,
      instrumentClass,
      classBasis,
      instrumentTypeDeclared: declared,
      registryRead,
      statementsRead,
      gaps: rows,
      /** The split #160 asks for, counted rather than described. */
      unfetchedCount: unfetched.length,
      unfillableCount: unfillable.length,
      asOf,
    },
    diagnostics,
  }
}
