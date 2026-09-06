import { diagnostic, finite, round, grandfatherPolicy } from './diagnostics.mjs'
import { laneOutcome } from './input-contracts.mjs'

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
 * - **mismatch**: a decision whose recorded size disagrees with the portfolio.
 *   The denominator every weight is computed against is wrong, and one of the
 *   two records is lying about a book both of them describe.
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
 *
 * ⚠️ **A held position no decision explains is a `warn`, and #109 is the run
 * that proved why.** It was a blocker, and a book connected to a broker
 * satisfies it *by definition* — nine of ten holdings on the observed book,
 * every recorded run `clearToPlan: false`, and with #96 wiring blockers to
 * dispatch the result was a manager that had never evaluated a candidate since
 * the day it was installed. Two states were being read as one:
 *
 * - **cold start** — bought before this manager existed. Not a failure; the
 *   initial condition of every install.
 * - **the investor's own trade** — this manager does not own the book. Aumos
 *   keeps the broker link and every order is human-approved, so a position
 *   outside these decisions is a permanent normal state, not a desync.
 *
 * Neither is a size disagreement, and the old message claimed the denominator
 * was wrong when `portfolio_read` supplies it from the broker. What is missing
 * is the *explanation*, so the finding is carried, not fatal: hold, trim and
 * exit stay available and only new exposure waits for the explanation. That
 * distinction is `config.grandfather`, which the package already declared and
 * nothing read.
 *
 * `managedSince` — the invocation's `mandate.effectiveFrom` — separates the two
 * for the record. It cannot separate them perfectly: Aumos exposes no
 * `positions[].acquiredAt`, so a position with no acquisition date is carried
 * as inherited, which is the safe direction (carried, never expanded).
 */
/**
 * The asset a row is about, whichever of the three names it arrived under.
 *
 * ⚠️ **One call, three spellings** — and that was the defect rather than the
 * style: `positions` were read as `.symbol`, `decisions` and `theses` as
 * `.asset`, and `watches` as `.subject ?? .symbol`. A caller consistent with
 * *any one* of them was silently wrong about the other two, because a row whose
 * key did not match simply fell out of the set. Measured 2026-09-01: a run
 * keyed its decisions one way and was told the book holds ten things no
 * decision explains, with nothing in the answer saying the input was unread.
 *
 * `subject` first because that is the AMP name a `DecisionProposal` carries, and
 * an `AssetRef` passed whole resolves through its own `symbol` — a manager holds
 * `{ assetClass, market, symbol }` and has no reason to know which half this
 * wants.
 */
function subjectOf(row) {
  const value = row?.subject ?? row?.asset ?? row?.symbol ?? null
  if (typeof value === 'string') return value || null
  return typeof value?.symbol === 'string' ? value.symbol || null : null
}

/**
 * The instant an `at-time` WATCH is armed against, or `null` for any other
 * trigger.
 *
 * ⚠️ **This is the distinction `audit_watch_subjectless` did not draw, and the
 * gap it left is a run blocking its own successor.** (#138) A subjectless
 * *price* WATCH really cannot be evaluated — "below what, on what" has no
 * answer — but a time WATCH carries its entire condition in `at`: the firing
 * instant **is** the condition, and it retires by firing. The rule refused both
 * as one, so the market review this package arms every run — `owner`, `flow`,
 * `task`, `at`, `session`, `rule`, `intent`, and by design no `subject`, because
 * a market review is about the sleeve rather than a name — came back as three
 * blockers on the *next* run's pre-flight. Canon armed it and canon then refused
 * to plan because of it. Measured on `run_3a48eaaa505241d5af94fb490d7c23c6`:
 * four of five runs opened with this blocker standing.
 *
 * ⛔ The exemption is keyed on the trigger and not on the `market-review:`
 * marker, which was the other way to close it. The marker would exempt exactly
 * this package's reviews and leave every other subjectless time promise — an
 * earnings checkpoint armed as an `at-time` WATCH, which `PROMPT.md` §4
 * requires — a blocker for a reason that is not true of it either. What makes a
 * time WATCH evaluable is that it is a time WATCH.
 *
 * ⛔ And it is not closed by giving the review a `subject`. The three-way
 * separation the run measured found that a held, claimed symbol passes: an
 * `allocate` review would then be recorded as being about 069500, which is not
 * what it is about. Passing the gate by making the record wrong is worse than
 * the gate.
 *
 * Both shapes are read because both arrive: a proposal's trigger is
 * `{ kind: 'at-time', at }`, and a row straight out of `nextReviewSequence`
 * carries a bare `at` and no trigger at all. A run that passes the sequence
 * through unchanged is the case #138 measured.
 */
function atTimeInstant(watch) {
  const kind = watch?.trigger?.kind ?? watch?.triggerKind ?? null
  if (kind !== null && kind !== 'at-time') return null
  const at = watch?.trigger?.at ?? watch?.at ?? null
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null
  return at
}

/**
 * What this run declared to sweep, whichever shape it was handed.
 *
 * ⚠️ **`null` and `0` are different answers and both are findings.** A run that
 * passes nothing has not told this call whether it declared a universe, and a
 * run that passes empty lists has told it there was none — but the *consequence*
 * is identical, which is why they share one warn and are separated only in the
 * detail. The pre-flight question is "is a discovery denominator standing", and
 * an unanswered question is not a yes.
 *
 * Both shapes arrive because both already exist: `coverage`'s own arguments
 * (`scannerUniverses`, `extensions`) are what a run declares, and
 * `coverage`'s answer (`screenedUniverseCount`) is what it got back. Requiring
 * one of them would make this the second place the universe has to be spelled.
 */
function screenedCount(universe) {
  if (universe === null || universe === undefined) return null
  if (Number.isFinite(universe?.screenedUniverseCount)) return universe.screenedUniverseCount
  const scanners = Array.isArray(universe?.scannerUniverses) ? universe.scannerUniverses : []
  const extensions = Array.isArray(universe?.extensions) ? universe.extensions : []
  if (!Array.isArray(universe?.scannerUniverses) && !Array.isArray(universe?.extensions)) return null
  return new Set([...extensions, ...scanners.flatMap((rows) => (Array.isArray(rows) ? rows : []))]).size
}

/**
 * ── Which decisions were even offered, and where a holding came from ───────
 *
 * ⛔ **`decisions` is a window and this operation used to read it as the
 * journal.** (aumos#688, aumos#691) `history.recentDecisions` carries the
 * latest N; the decision that explains an older holding drifts out of it as the
 * book keeps judging, so from the sixth decision on an inherited position
 * freezes permanently — and the thing that would unfreeze it is the decision
 * that just fell off the end. The measured case: `dec_f0549343…` opened a
 * thesis for `069500` and armed its tranche gate, sat at sequence 2 of 7 with a
 * five-row window, and `audit_position_untracked` reported the book held
 * something no decision explained.
 *
 * Two optional faces answer it, and **absence means different things**:
 *
 * - `totalDecisions` — `history.totalDecisions`, how many judgements this book
 *   has sealed at or before `asOf`. Greater than the number supplied means
 *   there is a part of the journal this run did not see, and it is the older
 *   part. ⚠️ **Absent means the host did not say**, never zero and never "the
 *   window is whole" — a run that assumed the latter keeps the exact defect
 *   this reads around.
 * - `positions[].origin` — `{ decisionId, asOf }` for the earliest decision in
 *   this book that names the asset, read over the **whole** journal rather than
 *   the window, so it is unaffected by window size. Absent means no judgement
 *   in this book names the asset, which is the definition of an inherited
 *   holding — *when the host publishes the face at all*.
 *
 * ⛔ **`origin.asOf` is not an acquisition date.** It is when a judgement was
 * sealed; Aumos holds no tax lots and no fill time is on this line. The
 * inherited/acquired-since question stays where it was, on `acquiredAt` against
 * `managedSince`, and origin only answers *explained or not*.
 */
const originOf = (position) => {
  const id = position?.origin?.decisionId
  if (typeof id !== 'string' || id === '') return null
  const at = position?.origin?.asOf
  return { decisionId: id, asOf: typeof at === 'string' && Number.isFinite(Date.parse(at)) ? at : null }
}

export function harnessAudit({ positions = [], watches = [], theses = [], decisions = [], universe = null, researchActivity = null, gateStaleDays = GATE_STALE_DAYS, managedSince = null, totalDecisions = null, config = {}, asOf } = {}) {
  const diagnostics = []
  const issues = []
  const add = (severity, code, subject, message, detail = {}) => {
    issues.push({ severity, code, subject, message, ...detail })
    diagnostics.push(diagnostic(code, severity === 'blocker' ? 'blocked' : severity === 'info' ? 'info' : 'unevaluated', message, 'input', { subject, ...detail }))
  }

  const held = new Set(positions.map(subjectOf).filter(Boolean))
  if (researchActivity === null) add('warn', 'audit_research_unverified', null, 'No collection activity was supplied; a WAIT cannot claim that news and filings were checked')
  /**
   * ⚠️ **`succeeded` is read as a count as well as a flag** (issue #157).
   * `PROMPT.md` §2b writes it beside `attempts`, so a run that queried three
   * routes and got three answers wrote `succeeded: 3` and was told all three
   * had failed — measured against the same call with booleans, three
   * `lane_query_failed` warnings that should not exist and a `warningCount` of
   * 6 against 3. `audit_research_unverified` and `lane_query_failed` mean *this
   * WAIT cannot claim it checked news and filings*, so the run did the
   * research and reported that it had not, and that sentence is inherited
   * through the Brief. `laneOutcome` reads either form; `attempts` alone still
   * decides `lane_not_queried`, which keeps §2b's two facts apart.
   */
  for (const row of researchActivity ?? []) {
    if (row?.granted !== true) continue
    const outcome = laneOutcome(row)
    if (!(outcome.attempts > 0)) add('warn', 'lane_not_queried', row.source ?? null, 'This research route was granted but not queried; do not report source absence')
    else if (outcome.succeeded !== true) {
      add('warn', 'lane_query_failed', row.source ?? null, 'This research route was queried but yielded no usable response', { attempts: outcome.attempts, successCount: outcome.successCount })
    } else if (outcome.successCount !== null && outcome.successCount < outcome.attempts) {
      add('info', 'lane_query_partial', row.source ?? null, 'This research route answered some of the queries it was sent; the lane is not failed and the shortfall is worth reporting', { attempts: outcome.attempts, successCount: outcome.successCount })
    }
  }
  const claimed = new Set(theses.filter((row) => row?.status !== 'closed').map(subjectOf).filter(Boolean))

  for (const watch of watches) {
    const subject = subjectOf(watch)
    if (!subject) {
      const at = atTimeInstant(watch)
      if (at === null) {
        add('blocker', 'audit_watch_subjectless', null, 'A revisit promise with no subject can never be evaluated or retired')
        continue
      }
      add('warn', 'audit_watch_subjectless_at_time', null, 'A time-triggered promise carries no subject; the firing instant is its whole condition, so it is evaluable and it retires by firing — but nothing in it says what it is about', { at })
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
  for (const [index, decision] of decisions.entries()) {
    const subject = subjectOf(decision)
    if (!subject) {
      // ⛔ This used to `continue` with nothing said. A `decisions` list keyed
      // the wrong way then accounted for nothing, every position came back
      // unexplained, and the answer named the book rather than the input.
      diagnostics.push(diagnostic('audit_decision_subjectless', 'unevaluated', 'A decision names no asset, so nothing can be accounted to it', `decisions[${index}]`, { keys: Object.keys(decision ?? {}) }))
      continue
    }
    accountedFor.set(subject, decision)
    if (decision?.orderReady === true && decision?.exitRegistered !== true) {
      add('blocker', 'audit_unregistered_ready', subject, 'A decision reached order-ready without its exit registered; the original measured this leaking two of seven orders')
    }
  }
  const grandfather = grandfatherPolicy(config)
  const managedFrom = typeof managedSince === 'string' && Number.isFinite(Date.parse(managedSince)) ? managedSince : null
  const grandfathered = []
  const unexplained = []
  const explainedOutsideWindow = []
  /**
   * `true` the journal was supplied whole, `false` it was cut, `null` the host
   * did not say — and the third is not the second. `<=` rather than `===`
   * because a caller may pass more rows than the total it read.
   */
  const windowIsWhole = finite(totalDecisions) ? totalDecisions <= decisions.length : null
  for (const position of positions) {
    const symbol = subjectOf(position)
    const decision = symbol === null ? undefined : accountedFor.get(symbol)
    const origin = originOf(position)
    if (!decision && origin) {
      /**
       * ⛔ Explained, and the window is what was short. Read over the whole
       * journal, so this is never "the window did not reach it" — it is the
       * earliest judgement that named the asset, whether or not that judgement
       * is one of the rows this run was handed.
       */
      explainedOutsideWindow.push({ symbol, ...origin })
      add('info', 'audit_position_origin_outside_window', symbol, 'No decision in the window explains this holding and the journal names one anyway; the earliest judgement about this asset is older than the rows this run was given, so this is the edge of the window and not a missing explanation', { origin, suppliedDecisions: decisions.length, totalDecisions: finite(totalDecisions) ? totalDecisions : null })
      continue
    }
    if (!decision) {
      /**
       * ⚠️ Two different questions, and they were one line until the review of
       * #109 pulled them apart. `inherited` is a **fact** about when the
       * position arrived; `carried` is a **policy** about what to do with it.
       * Deciding the message from the policy made the record say "acquired
       * under this manager" about a position whose acquisition date nobody
       * knows, purely because the investor had switched the tolerance off.
       * Turning grandfathering off is not learning when something was bought.
       */
      const acquired = Date.parse(position?.acquiredAt)
      const inherited = managedFrom && Number.isFinite(acquired) ? acquired <= Date.parse(managedFrom) : true
      const carried = grandfather.enabled && inherited
      unexplained.push(symbol)
      if (carried) grandfathered.push(symbol)
      /**
       * ⚠️ **The finding stays; the certainty behind it is what changed.**
       * Without `origin` and without a whole journal, "no decision explains
       * this" is not something this run read — it is what it failed to read.
       * The action is identical either way and it is the conservative one, so
       * the row keeps its severity; the sentence stops asserting a fact the
       * input never carried, and `explanationReadable` says which it is.
       */
      const readable = windowIsWhole === true
      add(
        'warn',
        'audit_position_untracked',
        symbol,
        readable
          ? inherited
            ? 'The book holds something no decision in its whole journal explains and nothing says it was bought under this manager; carry it, reduce it or exit it, and do not expand it'
            : 'The book holds something no decision in its whole journal explains and it was acquired under this manager; the investor also trades this book directly, so this is a missing explanation rather than a size disagreement'
          : 'No decision this run was given explains this holding, and nothing says the decisions it was given are the whole journal — so this is an unread explanation as easily as a missing one. Carry it, reduce it or exit it, do not expand it, and do not report it as unexplained',
        { inherited, grandfathered: carried, managedSince: managedFrom, acquiredAt: position?.acquiredAt ?? null, explanationReadable: readable, originStated: false },
      )
      continue
    }
    if (decision.quantity !== undefined) {
      diagnostics.push(diagnostic('audit_decision_quantity_unsupported', 'unevaluated', 'DecisionProposal specifies target weights; execution quantities belong to the Planner and cannot be reconciled from a proposal', 'decisions', { subject: symbol }))
    }
  }
  if (unexplained.length && !managedFrom) {
    diagnostics.push(diagnostic('audit_managed_since_missing', 'unevaluated', 'Without the mandate effective date, a position inherited at cold start cannot be told from one bought since; both are carried and neither is expanded', 'managedSince', { unexplained }))
  }
  if (unexplained.length && windowIsWhole === false) {
    diagnostics.push(diagnostic('audit_decision_window_truncated', 'unevaluated', 'The book has sealed more judgements than this run was given, and the ones it was not given are the older ones — exactly where the explanation of an older holding lives. Ask for `positions[].origin`, which is read over the whole journal, before calling a holding unexplained', 'decisions', { suppliedDecisions: decisions.length, totalDecisions, unexplained }))
  }
  if (unexplained.length && windowIsWhole === null) {
    diagnostics.push(diagnostic('audit_decision_window_unstated', 'unevaluated', 'Nothing says whether the decisions supplied are this book’s whole journal: `history.totalDecisions` was not passed and none of these holdings carried `positions[].origin`. An absent face is the host not saying, never a statement that no decision explains the holding — carry them and do not report them as unexplained', 'totalDecisions', { suppliedDecisions: decisions.length, unexplained }))
  }

  /**
   * ── Is a discovery denominator standing at all (issue #140) ─────────────
   *
   * ⚠️ **This is the one pre-flight finding whose absence nothing downstream
   * discovers, and the circularity is why.** `PROMPT.md` §3 names the lens when
   * there are candidates; candidates come out of the sweep §3 defines; the
   * sweep needs a declared universe — so a missing universe is never found,
   * because the only step that would notice it sits downstream of it. The six
   * measured runs never reached §3 and never reported not reaching it.
   *
   * `coverage` says the same thing better, and says it only when it is called.
   * That was the whole gap: the run that measured this called `coverage` of its
   * own accord and got `universe_undeclared`; a run that did not would have
   * produced no diagnostic and no `uncertainty` entry at all. `harnessAudit`
   * runs in every pre-flight, so the question is asked here whether or not
   * anybody thought to ask it.
   *
   * ⛔ **A `warn`, never a blocker, and this is not caution about severity.**
   * An inherited book with no universe still has to be managed on the sell
   * side, and every reduction available to it needs no universe at all. A
   * blocker here would stop a book from trimming a position because nobody
   * screened the market it is not buying in.
   */
  const screened = screenedCount(universe)
  if (screened === null || screened === 0) {
    add(
      'warn',
      'audit_universe_undeclared',
      null,
      screened === null
        ? 'Nothing says whether this run declared a discovery universe; an unasked question is not a denominator, and the sweep §3 defines cannot report its own absence'
        : 'This run declared no discovery universe, so the mechanical sweep has nothing to sweep and coverage has nothing to be complete over; sell-side management continues',
      { stated: screened !== null, screenedUniverseCount: screened },
    )
  }

  const blockers = issues.filter((row) => row.severity === 'blocker')
  /** ⚠️ An `info` row is a report and not a warning; counting it as one would put a partially answered lane back into the warning total #157 measured. */
  const notes = issues.filter((row) => row.severity === 'info')
  /**
   * ⛔ New exposure **to these names** waits for the explanation; reducing risk
   * never waits at all. Blocking a trim of a position already over its cap is
   * the inversion #109 recorded — a safety gate that refuses the safe
   * direction.
   *
   * ⚠️ The hold is per symbol, not per book, and the review of #109 is why.
   * A book-wide freeze keyed off "any unexplained holding exists" would be a
   * permanent freeze: this manager does not own the book, so the investor's
   * own trades keep that set non-empty forever — the hard deadlock traded for
   * a soft one. It also disagreed with its own message, which says *do not
   * expand **it***. What keeps new risk off an unexamined book is the rest of
   * the pre-flight: a new single still needs a thesis, evidence, a stop and
   * headroom under a cap `concentration` grandfathers per axis.
   */
  const blocksExpansionOf = grandfather.blocksNewNonCoreWhenBreached ? unexplained : []
  return {
    data: {
      issues,
      blockerCount: blockers.length,
      warningCount: issues.length - blockers.length - notes.length,
      noteCount: notes.length,
      clearToPlan: blockers.length === 0,
      grandfathered,
      unexplained,
      explainedOutsideWindow,
      decisionWindowWhole: windowIsWhole,
      suppliedDecisions: decisions.length,
      totalDecisions: finite(totalDecisions) ? totalDecisions : null,
      managedSince: managedFrom,
      universeDeclared: screened === null ? null : screened > 0,
      screenedUniverseCount: screened,
      blocksExpansionOf,
      riskReducingAlwaysAllowed: true,
      meaning: 'a blocker stops planning, never reporting — say what is broken and WAIT; a warn is carried, and reducing risk is never blocked',
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
