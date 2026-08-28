import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── Pre-flight: what has to be true before a run plans a trade (issue #70 §7) ─
 *
 * The methodology this is ported from opens every session with a checklist,
 * and the reason it is a checklist rather than advice is that each item is a
 * thing the run would otherwise discover *after* proposing. Three of the seven
 * had no operation here at all, and the run skeleton had no step to hold them:
 * the package could compute the answers and never be asked the questions.
 *
 * Two of the three are below. The third — reporting exits before new buys —
 * needed `exitCheck`, which now exists; the ordering is stated in `PROMPT.md`
 * because it is an ordering, not a calculation.
 */

const GATE_STALE_DAYS = 30
const PROPOSAL_STATUSES = new Set(['pending_user_review', 'accepted', 'rejected', 'watch_only', 'superseded'])
const PROPOSAL_STALE_DAYS = 60

function ageDays(from, to) {
  const start = Date.parse(from)
  const end = Date.parse(to)
  return Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 86_400_000 : null
}

/**
 * The four blockers the migration matrix promises, and nothing else.
 *
 * Each is a way the book's own records have come apart from each other, and
 * each is invisible from inside a single decision — which is why it is checked
 * once, before planning, rather than inside the gate for one candidate.
 *
 * - **orphan**: a revisit promise about something the book no longer holds and
 *   has no claim on. It will keep firing and nobody will know what it was for.
 * - **mismatch**: a position the book holds that no decision accounts for, or
 *   a decision whose recorded size disagrees with the portfolio. Either way the
 *   denominator every weight is computed against is wrong.
 * - **stale**: a WATCH registered a month ago that has never fired and never
 *   expires. It is not watching; it is a promise that quietly stopped being a
 *   promise.
 * - **unregistered-ready**: a decision that reached order-ready without its
 *   exit registered. The original measured this one — of seven order-ready
 *   single names, two never reached the broker at all — and made it a blocker
 *   because a prose rule had not stopped it.
 *
 * ⛔ Blockers stop planning; they do not stop *reporting*. A run that finds
 * one says so and proposes `WAIT`, which is the point: the failure mode being
 * prevented is a well-formed proposal built on a book that does not add up.
 */
export function harnessAudit({ positions = [], watches = [], theses = [], decisions = [], gateStaleDays = GATE_STALE_DAYS, asOf } = {}) {
  const diagnostics = []
  const issues = []
  const add = (severity, code, subject, message, detail = {}) => {
    issues.push({ severity, code, subject, message, ...detail })
    diagnostics.push(diagnostic(code, severity === 'blocker' ? 'blocked' : 'unevaluated', message, 'input', { subject, ...detail }))
  }

  const held = new Set(positions.map((row) => row?.symbol).filter(Boolean))
  const claimed = new Set(theses.filter((row) => row?.status !== 'closed').map((row) => row?.asset).filter(Boolean))

  for (const watch of watches) {
    const subject = watch?.subject ?? watch?.symbol ?? null
    if (!subject) {
      add('blocker', 'audit_watch_subjectless', null, 'A revisit promise with no subject can never be evaluated or retired')
      continue
    }
    if (!held.has(subject) && !claimed.has(subject)) {
      add('blocker', 'audit_watch_orphan', subject, 'A WATCH survives something the book neither holds nor claims; it will keep firing with nothing behind it')
    }
    const age = ageDays(watch?.registeredAt, asOf)
    if (finite(age) && age >= gateStaleDays && !watch?.firedAt && !watch?.expiresAt) {
      add('warn', 'audit_watch_stale', subject, 'A WATCH registered long ago has never fired and cannot expire; it stopped being a promise', { ageDays: round(age, 1), gateStaleDays })
    }
  }

  const accountedFor = new Map()
  for (const decision of decisions) {
    if (!decision?.asset) continue
    accountedFor.set(decision.asset, decision)
    if (decision?.orderReady === true && decision?.exitRegistered !== true) {
      add('blocker', 'audit_unregistered_ready', decision.asset, 'A decision reached order-ready without its exit registered; the original measured this leaking two of seven orders')
    }
  }
  for (const position of positions) {
    const decision = accountedFor.get(position?.symbol)
    if (!decision) {
      add('blocker', 'audit_position_untracked', position?.symbol ?? null, 'The book holds something no decision accounts for; every weight is computed against a denominator that is wrong')
      continue
    }
    if (finite(decision.quantity) && finite(position.quantity) && decision.quantity !== position.quantity) {
      add('blocker', 'audit_position_mismatch', position.symbol, 'The recorded decision and the portfolio disagree about the size held', { decided: decision.quantity, held: position.quantity })
    }
  }

  const blockers = issues.filter((row) => row.severity === 'blocker')
  return {
    data: {
      issues,
      blockerCount: blockers.length,
      warningCount: issues.length - blockers.length,
      clearToPlan: blockers.length === 0,
      meaning: 'a blocker stops planning, never reporting — say what is broken and WAIT',
    },
    diagnostics,
  }
}

/**
 * What is waiting for the investor, before this run adds to the pile.
 *
 * Rule proposals are the one thing this methodology produces that it cannot
 * act on, so they accumulate silently and a run can propose the same change a
 * fourth time without noticing the first three are still open. Reading them
 * first is cheap; the alternative is a manager that repeats itself.
 *
 * ⛔ An unrecognised status is refused rather than bucketed. The statuses are a
 * closed set and a typo would silently drop a proposal out of `pending` — which
 * is the same as deciding it, without anyone deciding it.
 */
export function lessonAudit({ proposals = [], staleDays = PROPOSAL_STALE_DAYS, asOf } = {}) {
  const diagnostics = []
  const counts = Object.fromEntries([...PROPOSAL_STATUSES].map((status) => [status, 0]))
  const pending = []
  for (const [index, proposal] of proposals.entries()) {
    const status = proposal?.status ?? 'pending_user_review'
    if (!PROPOSAL_STATUSES.has(status)) {
      diagnostics.push(diagnostic('proposal_status_unknown', 'blocked', 'A rule proposal status must come from the published set; a typo silently decides a proposal nobody decided', `proposals[${index}].status`, { status, supported: [...PROPOSAL_STATUSES] }))
      continue
    }
    counts[status] += 1
    if (status !== 'pending_user_review') continue
    const age = ageDays(proposal?.raisedAt, asOf)
    pending.push({ id: proposal?.id ?? null, subject: proposal?.subject ?? null, raisedAt: proposal?.raisedAt ?? null, ageDays: finite(age) ? round(age, 1) : null })
    if (finite(age) && age >= staleDays) {
      diagnostics.push(diagnostic('proposal_pending_stale', 'unevaluated', 'A proposal has been waiting long enough that repeating it is more likely than acting on it', `proposals[${index}]`, { id: proposal?.id ?? null, ageDays: round(age, 1), staleDays }))
    }
  }
  if (pending.length) {
    diagnostics.push(diagnostic('proposals_pending', 'info', 'Rule proposals are open; do not raise the same one again, and remember this run cannot apply any of them', 'proposals', { count: pending.length }))
  }
  return { data: { counts, pending, pendingCount: pending.length, canApply: false }, diagnostics }
}
