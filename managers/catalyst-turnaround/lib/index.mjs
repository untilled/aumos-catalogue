/**
 * The deterministic core of `catalyst-turnaround`, in one place.
 *
 * ⛔ **This is not the methodology.** The methodology is `PROMPT.md` and the
 * skills beside it; what is here is the small set of things #258's and #256's
 * completion criteria require to be *checkably* right rather than
 * model-judged — a ledger and its state machine, a comparison between two
 * points in time, the arithmetic that turns a distance-to-invalidation into a
 * weight, a staged plan that does not add twice, and a classification a fixture
 * can assert. Everything a model is better at than a table stayed prose.
 *
 * ⚠️ **Nothing in this directory imports across package boundaries.** The
 * published artifact is a path→contents map rooted at this package, so a
 * relative path that escapes it does not survive publication. Where arithmetic
 * came from `managers/evidence-gated/lib/`, it was copied and adapted, and each
 * file says which one and what changed.
 */

export { METHODOLOGY, CATALYST_STATES, CATALYST_TRANSITIONS, TERMINAL_STATES, RECOVERY_CHANNELS, CASE_CLASSES, INTENTS } from './constants.mjs'
export { CAUSE_CODES, CAUSE_LANES, cause, diagnostic, isRefutation, round, finite } from './diagnostics.mjs'
export { catalystLedger, LEDGER_VOCABULARY } from './ledger.mjs'
export { recoveryComparison, financialSurvivability } from './recovery.mjs'
export { lossToInvalidation, targetWeight, accountConcentration } from './sizing.mjs'
export { stagedPlan } from './staging.mjs'
export { caseClassification } from './classify.mjs'
export { scoreboards } from './scoreboard.mjs'
export { runVerdict } from './verdict.mjs'
