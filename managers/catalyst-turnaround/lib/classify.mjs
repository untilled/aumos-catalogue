import { CASE_CLASSES } from './constants.mjs'
import { cause, diagnostic } from './diagnostics.mjs'

/**
 * ── What kind of case is this, and the one exclusion this package refuses ──
 *
 * Two completion criteria in #258 meet here and they pull in opposite
 * directions, which is why the answer is a table rather than a paragraph:
 *
 *   ⑴ «정책 기대만 있고 회사 수익으로 연결되는 경로가 없으면 추가 연구 대상으로
 *      남긴다» — a policy story with no traced path to *this company's* earnings
 *      is research, not a position. It is the most common way a turnaround
 *      thesis is wrong: the policy is real, the company's share of it is
 *      assumed.
 *
 *   ⑵ «낮은 PER이 아니라는 이유만으로 제외하지 않는다» — and a turnaround is
 *      precisely where a valuation multiple lies. A company whose earnings are
 *      near zero has an enormous PER on the way *into* the recovery and a small
 *      one on the way out; excluding on the first is excluding the whole case
 *      class. So a multiple is **recorded and never read as a gate**, and this
 *      module says so in its output rather than in a comment, because a caller
 *      can check an output.
 *
 * ⛔ **The policy's three stages are reported separately and none of them is a
 * gate either.** Announcement, execution, and appearance in results are three
 * different facts, and conflating them is the 가스공사-shaped mistake: a tariff
 * decision that has been announced has not yet been billed, and a tariff that
 * has been billed has not yet been reported.
 */

const POLICY_STAGES = Object.freeze(['none', 'announced', 'executing', 'in-results'])

export function caseClassification({
  policyDependent = false,
  policyStage = 'none',
  earningsPathTraced = null,
  earningsPathNote = null,
  improvingChannelCount = 0,
  cashFlowLinked = false,
  valuationMultiple = null,
  deteriorationCauseIdentified = null,
} = {}) {
  const diagnostics = []
  const causes = []

  if (!POLICY_STAGES.includes(policyStage)) {
    diagnostics.push(diagnostic('policy_stage_unknown', 'blocked', `A policy stage is one of ${POLICY_STAGES.join(' / ')}; the three are different facts and the recovery is only real at the third`, 'policyStage', { policyStage }))
  }

  if (valuationMultiple !== null) {
    diagnostics.push(
      diagnostic('valuation_multiple_recorded_not_gating', 'note', 'The valuation multiple is recorded and does not decide anything here. A company whose earnings are near zero has a meaningless multiple on the way into a recovery and a flattering one on the way out; excluding on the first would exclude the case class this package exists for', 'valuationMultiple', {
        valuationMultiple,
      }),
    )
  }

  if (deteriorationCauseIdentified !== true) {
    causes.push(
      cause('research_incomplete', 'The thesis chain starts at what caused the deterioration, and this run has not named it. Without that, «recovery» is a direction rather than a mechanism', 'deteriorationCauseIdentified'),
    )
  }

  let classification
  let reason
  if (earningsPathTraced !== true) {
    classification = 'research-candidate'
    reason =
      policyDependent === true
        ? 'A policy expectation with no traced path to this company’s own earnings. Real, and not yet a position'
        : 'No traced path from the recovery indicators to this company’s own earnings'
    causes.push(cause('research_incomplete', reason, 'earningsPathTraced', { policyStage, earningsPathNote }))
  } else if (policyDependent === true) {
    classification = 'policy-financial-turnaround'
    reason = 'The recovery runs through a policy or regulated price, and the path to this company’s earnings has been traced'
  } else if (improvingChannelCount > 0 || cashFlowLinked) {
    classification = 'operational-turnaround'
    reason = 'The recovery is in the company’s own operations rather than in a policy'
  } else {
    classification = 'not-a-turnaround'
    reason = 'Nothing is recovering: no improving channel and no traced link to cash'
  }

  return {
    data: {
      classification,
      reason,
      /** ⛔ Always false. The field exists so a fixture can assert that it is. */
      excludedByValuationMultiple: false,
      valuationMultiple,
      policyDependent: policyDependent === true,
      policyStage,
      /** The three-way separation, carried so a reader sees which one is claimed. */
      policyAnnounced: ['announced', 'executing', 'in-results'].includes(policyStage),
      policyExecuting: ['executing', 'in-results'].includes(policyStage),
      policyInResults: policyStage === 'in-results',
      earningsPathTraced: earningsPathTraced === true,
      qualifiesAsPosition: classification === 'policy-financial-turnaround' || classification === 'operational-turnaround',
      classes: CASE_CLASSES,
    },
    diagnostics,
    causes,
  }
}
