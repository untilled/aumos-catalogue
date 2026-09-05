import { diagnostic } from './diagnostics.mjs'

export const PAPER_SETUP_COHORTS = {
  thesis_call: 'llm-research', thesis_watch: 'llm-research', thesis_rejected: 'llm-research',
  rs_leader_pullback: 'mechanical-baseline', rs_breakout: 'mechanical-baseline',
  mean_reversion: 'mechanical-baseline', trend_pullback: 'mechanical-baseline',
}

export const INPUT_VOCABULARY = {
  sentinelKinds: ['price_below', 'price_above', 'metric', 'time'],
  sentinelOperators: ['above', 'below'],
  markets: ['XKRX', 'XNAS', 'XNYS'],
  paperSetups: Object.keys(PAPER_SETUP_COHORTS),
}

export const INPUT_KEYS = {
  thesisSentinel: ['invalidations', 'evidence', 'priorVerdicts'],
  concentration: ['positions', 'proposed', 'caps', 'config'],
  exitCheck: ['symbol', 'price', 'rules', 'thesis', 'sentinel', 'asOf'],
  globalAllocation: ['targets', 'availableWeight', 'currentWeights'],
  harnessAudit: ['positions', 'watches', 'theses', 'decisions', 'universe', 'researchActivity', 'gateStaleDays', 'managedSince', 'config', 'asOf'],
  signalPaper: ['rows', 'state', 'admissions', 'horizons', 'asOf', 'openWindows', 'closed', 'schemaVersion', 'updatedAsOf', 'maturedThisRun'],
  reconcileArmedReviews: ['previous', 'sequence', 'armed', 'journalArmed', 'asOf'],
  entryQualityGate: ['bars', 'lenses', 'noNewLow'],
  paperAdmission: ['setup', 'challengeVerdict', 'thesis', 'priceHistoryLatestDate', 'asOf'],
  researchState: ['previous', 'observations', 'asOf'],
  researchUniverse: ['market', 'extensions', 'asOf'],
}

export function validateInput(operation, input) {
  const diagnostics = []
  const reject = (path, message) => diagnostics.push(diagnostic('input_shape_invalid', 'blocked', message, path))
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reject('input', 'Operation input must be an object')
    return diagnostics
  }
  const allowed = INPUT_KEYS[operation]
  if (!allowed) return diagnostics
  for (const key of Object.keys(input)) if (!allowed.includes(key)) reject(`input.${key}`, `Unknown input key for ${operation}; supported: ${allowed.join(', ')}`)
  for (const key of ['invalidations', 'evidence', 'priorVerdicts', 'positions', 'proposed', 'targets', 'watches', 'theses', 'decisions', 'rows', 'admissions', 'horizons', 'sequence', 'journalArmed', 'observations', 'extensions', 'bars', 'lenses', 'researchActivity']) {
    if (allowed.includes(key) && input[key] !== undefined && !Array.isArray(input[key])) reject(`input.${key}`, 'Expected an array')
  }
  for (const key of ['state', 'previous', 'caps', 'config', 'currentWeights', 'rules', 'thesis', 'noNewLow']) {
    if (allowed.includes(key) && input[key] !== undefined && input[key] !== null && (typeof input[key] !== 'object' || Array.isArray(input[key]))) reject(`input.${key}`, 'Expected an object')
  }
  if (operation === 'signalPaper' && input.state) {
    for (const key of Object.keys(input.state)) if (!['schemaVersion', 'updatedAsOf', 'closed', 'openWindows', 'maturedThisRun'].includes(key)) reject(`input.state.${key}`, 'Unknown paper state field; retain the previous record')
    if (input.state.openWindows !== undefined && !Array.isArray(input.state.openWindows)) reject('input.state.openWindows', 'Expected an array')
    if (input.state.closed !== undefined && (!input.state.closed || typeof input.state.closed !== 'object' || Array.isArray(input.state.closed))) reject('input.state.closed', 'Expected an object')
  }
  if (operation === 'reconcileArmedReviews' && input.previous && !Array.isArray(input.previous.armed)) reject('input.previous.armed', 'Expected the complete stored record with an armed array')
  if (operation === 'thesisSentinel' && Array.isArray(input.invalidations)) input.invalidations.forEach((row, i) => {
    if (!INPUT_VOCABULARY.sentinelKinds.includes(row?.kind)) reject(`input.invalidations[${i}].kind`, `Expected ${INPUT_VOCABULARY.sentinelKinds.join(', ')}`)
    if (row?.kind === 'metric' && !INPUT_VOCABULARY.sentinelOperators.includes(row.operator)) reject(`input.invalidations[${i}].operator`, 'Expected above or below')
  })
  if (operation === 'concentration') for (const key of ['positions', 'proposed']) {
    if (Array.isArray(input[key])) input[key].forEach((row, i) => {
      if (row?.theme !== undefined) reject(`input.${key}[${i}].theme`, 'Use themes: an array of theme names')
      if (row?.themes !== undefined && !Array.isArray(row.themes)) reject(`input.${key}[${i}].themes`, 'Expected an array of theme names')
    })
  }
  if (operation === 'exitCheck' && input.price !== undefined && input.price !== null && (typeof input.price !== 'number' || !Number.isFinite(input.price))) reject('input.price', 'Expected a finite scalar price; pass the observation value, not its envelope')
  return diagnostics
}
