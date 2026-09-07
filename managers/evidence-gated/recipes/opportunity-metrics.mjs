/**
 * `opportunityMetrics`, run by the host over one symbol. (#209 §8-D)
 *
 * The larger half of the measured cost: 45 `calculate` calls, ~960,000
 * characters of tool argument, all of it a daily bar series a model had just
 * read out of a vendor relay. The arithmetic is unchanged — `execute({
 * operation: 'opportunityMetrics' })`, the same call the MCP tool makes.
 *
 * ⚠️ **The ranking is not here.** `opportunityUniverse` folds the roster into
 * sector cohorts and percentiles, and one recipe process sees one symbol; that
 * fold stays a `calculate` call, over the metric rows read back with
 * `research_result_get`. Those rows carry no bars, so relaying them costs a page
 * of numbers rather than a roster of series — which is the whole shape of this
 * change: the heavy input never leaves the host, the light output does.
 *
 * ⚠️ **`sector` comes from `parameters.sectors` and is not guessed.**
 * `opportunityUniverse` groups by it and drops any row whose sector is not a
 * string, so a recipe that defaulted the label would quietly move a name into
 * `unclassified` and change its cohort. Unstated, it is left unstated and
 * `opportunityMetrics` applies its own default in the one place that default is
 * written down.
 */

import { runRecipe, scannerAnswer } from './request.mjs'

runRecipe((request) => scannerAnswer('opportunityMetrics', request))
