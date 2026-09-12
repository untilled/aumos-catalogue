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
 * ⚠️ **Two of these are shared *contracts* rather than shared code
 * (`aumos-catalogue#305`).** `discoveryRun` and `candidateLedger` produce records
 * whose field names are identical to `fundamental-mean-reversion`'s and
 * `shareholder-rerating`'s, so a reader can compare three runs; the gate, the
 * sweep unit and the cursor kind inside them are this package's own. They are
 * vendored rather than imported for the reason in the next paragraph.
 *
 * ⚠️ **Nothing in this directory imports across package boundaries.** The
 * published artifact is a path→contents map rooted at this package, so a
 * relative path that escapes it does not survive publication. Where arithmetic
 * came from `managers/evidence-gated/lib/`, it was copied and adapted, and each
 * file says which one and what changed.
 */

export { METHODOLOGY, CATALYST_STATES, CATALYST_TRANSITIONS, TERMINAL_STATES, RECOVERY_CHANNELS, CASE_CLASSES, INTENTS, INTENT_WEIGHT_ROLES, INTENT_WEIGHT_ROLE_NAMES } from './constants.mjs'
export { CAUSE_CODES, CAUSE_LANES, cause, diagnostic, isRefutation, round, finite } from './diagnostics.mjs'
export { catalystLedger, LEDGER_VOCABULARY } from './ledger.mjs'
export {
  discoveryRun,
  DISCOVERY_STATUSES,
  DISCOVERY_VOCABULARY,
  LANE_STATUSES,
  LANE_FROM_CACHE_STATE,
  REQUIRED_LANES,
  OPTIONAL_LANES,
  CURSOR_KIND,
  SWEEP_EVENT_KINDS,
  SWEEP_EVENT_KIND_NAMES,
} from './discovery.mjs'
export {
  candidateLedger,
  CANDIDATE_STATES,
  CANDIDATE_TRANSITIONS,
  TERMINAL_CANDIDATE_STATES,
  CANDIDATE_CAPS,
  CANDIDATE_SCHEMA_VERSION,
  CANDIDATE_VOCABULARY,
} from './candidate-memory.mjs'
export { recoveryComparison, financialSurvivability } from './recovery.mjs'
export { lossToInvalidation, targetWeight, accountConcentration } from './sizing.mjs'
export { stagedPlan } from './staging.mjs'
export { caseClassification } from './classify.mjs'
export { scoreboards } from './scoreboard.mjs'
export { runVerdict } from './verdict.mjs'
