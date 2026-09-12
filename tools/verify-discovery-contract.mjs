/**
 * The discovery-run contract, across `fundamental-mean-reversion`,
 * `catalyst-turnaround` and `shareholder-rerating`, on one situation table.
 *
 *   node tools/verify-discovery-contract.mjs
 *
 * ── Why field names are asserted *here* and never in `shared-scenarios` ─────
 *
 * `tools/verify-shared-scenarios.mjs` asserts **behaviour** and deliberately
 * asserts **no field names**: on the four boundaries it covers — an unread
 * account, a total and an increment, an open proposal counted once, an unchecked
 * limit — the shape of each package's answer is that package's own, and a
 * cross-package assertion over a name there would be commonisation of policy
 * through the back door (#256, and `COMMONISATION-SURVEY.md` #270).
 *
 * ⚠️ **The discovery run is the one place where the names *are* the contract.**
 * `docs/contracts/discovery-run.md` exists because zero candidates and zero reads
 * are the same output and are opposite facts — `evidence-gated` shipped that
 * failure in `run_ba37a8f6907a49c3a805a4ce3ee10ec6` (#140) — and the only way a
 * reader can tell the two apart across three packages is if all three spell the
 * record the same way and mean the same thing by each word. So this checker
 * asserts what that one does not:
 *
 *   ① the nineteen field names of §7.1, **in order**, in all three;
 *   ② `DISCOVERY_STATUSES` and `LANE_STATUSES` as identical sets;
 *   ③ that `no_candidate_qualified` is reached only under its full condition,
 *      and that `discovery_not_run` and `discovery_incomplete` are three
 *      different answers to three different situations — per package, because a
 *      build where every situation returned one word would pass every
 *      per-situation check;
 *   ④ that `cursorAfter` never advances past a failed range, and equals
 *      `cursorBefore` outside the two complete statuses;
 *   ⑨ the **precedence** of §«`discoveryStatus`, and the only way to say nothing
 *      qualified» — `discovery_not_run` > `discovery_incomplete` >
 *      `candidates_produced` > `no_candidate_qualified` — on situations that satisfy
 *      two rows of the decision table at once, plus the half that is not about the
 *      word: a candidate reported as an incomplete sweep is still counted;
 *   ⑤–⑧ the candidate ledger's read rules: `undefined` is `data_missing` and
 *      `null` seeds, vendor payload and account state are refused, a rerun on
 *      identical input is a fixed point, and the three migration answers
 *      (unknown version refuses, absent version degrades, a document written
 *      after `asOf` refuses).
 *
 * ⛔ **What it still must not assert**, and the list is the load-bearing half:
 * severity words (FMR spells them `info`/`unevaluated`/`blocked`, CT
 * `blocked`/`unevaluated`/`note`, SR its own), diagnostic codes — except the two
 * the contract itself names, `discovery_not_run` and `memory_holds_vendor_payload`
 * — gate conditions, ranking, thresholds, sizing, and the sweep unit. Those are
 * each package's own (`docs/contracts/discovery-run.md`, «What this contract does
 * not decide»), and the adapters below exist precisely so that one *situation*
 * can be put to three packages that take three different inputs: FMR sweeps
 * symbol ranges on a `symbol-index` cursor and requires price + filing; CT and SR
 * sweep OpenDART receipt ranges on a `dart-receipt` cursor and require filing + web.
 *
 * ── Two kinds of difference, reported exactly as `shared-scenarios` reports them ──
 *
 *   **`expectedDisagreement`** — the packages answer differently *by policy*, on a
 *   question the contract leaves to each of them. Recorded against the
 *   situation with a reason, checked against the answer that package actually
 *   gives, and **green**. A situation is never skipped and never softened into an
 *   easier one to make three answers into one.
 *
 *   **`knownDefect`** — an answer that is wrong against the contract. Checked
 *   exactly as everything else is, printed **loudly**, and green — because #256
 *   forbids a fix for something the checks missed from travelling in the same
 *   change as the check that found it. Every one of them wants its own issue
 *   against its own package.
 *
 * ⚠️ **A `knownDefect` that has stopped reproducing is printed loudly too**, and
 * is also green: the package it names has been fixed, and the answer is to delete
 * the entry, not to fail the build of whoever fixed it.
 *
 * ── Plain Node, deliberately ───────────────────────────────────────────────
 *
 * `node:assert/strict` and three `lib/index.mjs` imports. No test framework, no
 * install, no network, no fixtures of its own — the shape `check:allocator` and
 * `check:shared-scenarios` already have, and for the same reason: a dependency
 * added for a checker is a dependency every future submitter installs to lint a
 * directory of prose.
 *
 * ⚠️ **It runs before `check:pins` in the workflow, and that position is
 * load-bearing** for the reason written at the end of `.github/workflows/lint.yml`.
 */

import assert from 'node:assert/strict'

import * as fmr from '../managers/fundamental-mean-reversion/lib/index.mjs'
import * as ct from '../managers/catalyst-turnaround/lib/index.mjs'
import * as sr from '../managers/shareholder-rerating/lib/index.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// The contract, restated as data.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `docs/contracts/discovery-run.md` §7.1, in the order that document prints it.
 *
 * ⛔ **Copied here as literals on purpose.** Reading the names off one of the
 * three packages would make this check say «the three agree with whichever one I
 * read first», which is true of any three implementations of a typo.
 */
const RECORD_FIELDS = Object.freeze([
  'schemaVersion',
  'updatedAtEpochMs',
  'runId',
  'universeDeclared',
  'universeSource',
  'universeCount',
  'symbolsAttempted',
  'symbolsSucceeded',
  'symbolsFailed',
  'gatePassed',
  'newCandidates',
  'resumedCandidates',
  'researchCompleted',
  'cursorBefore',
  'cursorAfter',
  'priceLaneStatus',
  'filingLaneStatus',
  'webLaneStatus',
  'discoveryStatus',
])

const DISCOVERY_STATUSES = Object.freeze([
  'candidates_produced',
  'no_candidate_qualified',
  'discovery_not_run',
  'discovery_incomplete',
])

const LANE_STATUSES = Object.freeze(['open', 'partial', 'dark', 'unstated'])

/** The two statuses that mean «this run read its whole range». */
const COMPLETE_STATUSES = Object.freeze(['candidates_produced', 'no_candidate_qualified'])

/** One instant for every situation, so a difference is never a difference in the clock. */
const AS_OF = Date.parse('2026-02-27T00:00:00Z')
const DAY = 86_400_000

/** The token the contract requires verbatim in one `uncertainty` entry. */
const DISCLOSURE = ['이번 런은 유니버스를 읽지 못했다 — discovery_not_run.']

// ─────────────────────────────────────────────────────────────────────────────
// The situations. No package's field names, cursor kind or lane names are here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The situation vocabulary, which is deliberately one level above every package:
 *
 *   `universe`       `'declared'` or `'undeclared'` — a positive claim, never an
 *                    absence read as one.
 *   `requiredLanes`  what **this strategy's own required lanes** did. FMR's are
 *                    price and filing; CT's and SR's are filing and web. The
 *                    adapter knows which; the situation never says.
 *   `optionalLane`   the same for the one lane this strategy does not require.
 *   `rangeFailed`    a range of the sweep came back unread. A symbol range for
 *                    FMR, a receipt range for the other two.
 *   `qualifying`     how many names came out of this package's own gate. What
 *                    the gate *is* is never asserted here.
 *   `proposeAdvance` the run handed back a cursor past the one it started from.
 */
const SITUATIONS = [
  {
    id: 'a-complete-sweep-that-qualified-nobody',
    clause: '③ no_candidate_qualified',
    title: 'universe declared, every required lane open, nothing failed, nothing passed the gate',
    universe: 'declared',
    requiredLanes: 'open',
    optionalLane: 'unstated',
    rangeFailed: false,
    qualifying: 0,
    proposeAdvance: true,
    expected: { discoveryStatus: 'no_candidate_qualified', cursorAdvances: true },
    why: 'The only one of the four that is a claim about the **market**. All three guards hold, so the zero is a screen that ran and found nothing — and the cursor has earned the right to move.',
  },
  {
    id: 'a-name-came-out-of-the-gate',
    clause: '③ candidates_produced',
    title: 'the same complete sweep, with one name through this package\'s own gate',
    universe: 'declared',
    requiredLanes: 'open',
    optionalLane: 'unstated',
    rangeFailed: false,
    qualifying: 1,
    proposeAdvance: true,
    expected: { discoveryStatus: 'candidates_produced', cursorAdvances: true },
    why: 'The control for the situation above: without it, «reaches no_candidate_qualified» would be indistinguishable from «never produces a candidate at all».',
  },
  {
    id: 'nobody-declared-a-universe',
    clause: '③ discovery_not_run',
    title: 'no universe was declared, and the lanes were open',
    universe: 'undeclared',
    requiredLanes: 'open',
    optionalLane: 'unstated',
    rangeFailed: false,
    qualifying: 0,
    proposeAdvance: true,
    uncertainty: DISCLOSURE,
    expected: { discoveryStatus: 'discovery_not_run', cursorAdvances: false },
    why: 'No denominator, so no honest way to say nothing qualified. ⚠️ `unevaluated`, never blocked: the book whose universe is undeclared is exactly the book that still has to be watched on the sell side.',
  },
  {
    id: 'the-budget-went-on-reviewing-holdings',
    clause: '③ discovery_not_run',
    title: 'a declared universe, open lanes, and the whole discovery budget spent on the book already held',
    universe: 'declared',
    requiredLanes: 'open',
    optionalLane: 'unstated',
    rangeFailed: false,
    qualifying: 0,
    budgetSpentOnHoldings: true,
    proposeAdvance: false,
    uncertainty: DISCLOSURE,
    expected: { discoveryStatus: 'discovery_not_run', cursorAdvances: false },
    why: '⚠️ Not «no new candidates». The run did not look, and the two read identically in a log.',
  },
  {
    id: 'every-required-lane-was-dark',
    clause: '③ discovery_not_run',
    title: 'the lanes this strategy requires were queried and answered nothing usable',
    universe: 'declared',
    requiredLanes: 'dark',
    optionalLane: 'open',
    rangeFailed: false,
    qualifying: 0,
    proposeAdvance: false,
    uncertainty: DISCLOSURE,
    expected: { discoveryStatus: 'discovery_not_run', cursorAdvances: false },
    why: 'Zero discovery capacity. The optional lane being open changes nothing — a lane that does not open a case here cannot stand in for the ones that do.',
  },
  {
    id: 'nobody-asked-the-required-lanes-at-all',
    clause: '③ discovery_not_run',
    title: 'the required lanes were never queried, and nothing says they were',
    universe: 'declared',
    requiredLanes: 'unstated',
    optionalLane: 'open',
    rangeFailed: false,
    qualifying: 0,
    proposeAdvance: false,
    uncertainty: DISCLOSURE,
    expected: { discoveryStatus: 'discovery_not_run', cursorAdvances: false },
    why: '⛔ `unstated` is not a degenerate `dark` and defaulting it to `open` reproduces #140 exactly: a run that reports three open lanes it did not query is the run that reports «no candidates» after reading nothing.',
  },
  {
    id: 'a-required-lane-answered-for-half-the-range',
    clause: '③ discovery_incomplete',
    title: 'a required lane came back partial and no range was recorded as failed',
    universe: 'declared',
    requiredLanes: 'partial',
    optionalLane: 'unstated',
    rangeFailed: false,
    qualifying: 0,
    proposeAdvance: false,
    expected: { discoveryStatus: 'discovery_incomplete', cursorAdvances: false },
    why: 'A lane that answered for some of the range is not a lane that answered. The sweep is unfinished and says so, rather than reporting a clean screen over the half it reached.',
  },
  {
    id: 'a-range-failed-and-nothing-qualified',
    clause: '③ discovery_incomplete / ④ the cursor rule',
    title: 'the sweep failed on one range, and the run handed back a cursor past it anyway',
    universe: 'declared',
    requiredLanes: 'open',
    optionalLane: 'unstated',
    rangeFailed: true,
    qualifying: 0,
    proposeAdvance: true,
    expected: { discoveryStatus: 'discovery_incomplete', cursorAdvances: false },
    why: '⛔ The cursor marks the last **fully succeeded** range. One that stepped over a transient vendor error would turn it into a permanently unread slice of the market — silently, once, and nothing later ever looks there again.',
  },
  {
    id: 'a-range-failed-while-a-name-qualified',
    clause: '③ the precedence, now stated',
    title: 'one name came through the gate and another range of the same sweep failed',
    universe: 'declared',
    requiredLanes: 'open',
    optionalLane: 'unstated',
    rangeFailed: true,
    qualifying: 1,
    proposeAdvance: true,
    expected: { discoveryStatus: 'discovery_incomplete', cursorAdvances: false },
    why: 'Both rows of the decision table hold at once, and the contract now states which wins: `discovery_incomplete`. A partially unprocessed range is its own status and never a footnote on a productive run — the name is still counted in `newCandidates` / `resumedCandidates` and still reaches the ledger. The cursor, which is the part that can lose a slice of the market, does not move in any of the three.',
  },
]

/**
 * ── ⑨ the precedence, as the contract now states it ─────────────────────────
 *
 * `docs/contracts/discovery-run.md`, «`discoveryStatus`, and the only way to say
 * nothing qualified»:
 *
 *   discovery_not_run > discovery_incomplete > candidates_produced > no_candidate_qualified
 *
 * ⛔ **Stated because more than one row of the decision table holds at once.** The
 * table gives each word a *condition*, and a run whose universe was never declared
 * and whose range also failed, or one that produced a name and lost a range, meets
 * two of them. Without a precedence the three packages were each free to pick, and
 * #305's whole reason for writing the contract down is that a reader cannot tell
 * «part of the market is unread» from «the run was productive» after the fact.
 *
 * Each case below is a situation that satisfies **both** words' conditions, put to
 * all three packages, and the higher-ranked word has to be the one reported.
 */
const PRECEDENCE = Object.freeze([
  'discovery_not_run',
  'discovery_incomplete',
  'candidates_produced',
  'no_candidate_qualified',
])

const PRECEDENCE_CASES = [
  {
    id: 'an-undeclared-universe-outranks-a-failed-range',
    higher: 'discovery_not_run',
    lower: 'discovery_incomplete',
    situation: {
      id: 'precedence-not-run-over-incomplete',
      universe: 'undeclared',
      requiredLanes: 'open',
      optionalLane: 'unstated',
      rangeFailed: true,
      qualifying: 0,
      proposeAdvance: false,
      uncertainty: DISCLOSURE,
    },
    why: 'A run with no denominator cannot report how much of a universe it failed to read, because there is no universe to have read part of.',
  },
  {
    id: 'a-failed-range-outranks-a-produced-candidate',
    higher: 'discovery_incomplete',
    lower: 'candidates_produced',
    situation: {
      id: 'precedence-incomplete-over-produced',
      universe: 'declared',
      requiredLanes: 'open',
      optionalLane: 'unstated',
      rangeFailed: true,
      qualifying: 1,
      proposeAdvance: false,
    },
    why: '⚠️ The one #305 names: a partially unprocessed range is left as its own distinct status, and the candidate is reported by the counts rather than by the word.',
  },
  {
    id: 'a-partial-required-lane-outranks-a-produced-candidate',
    higher: 'discovery_incomplete',
    lower: 'candidates_produced',
    situation: {
      id: 'a-required-lane-partial',
      universe: 'declared',
      requiredLanes: 'partial',
      optionalLane: 'unstated',
      rangeFailed: false,
      qualifying: 1,
      proposeAdvance: false,
    },
    why: '⚠️ The other half of the row above, and the one the packages disagreed on: the contract says `discovery_incomplete` covers **a required lane that is not `open`** as well as a failed range, so a name that came through the gate beside a lane that answered for only part of its range is reported by the unfinished sweep and not by the candidate. No range failed here, which is exactly what makes it a separate case — a package that reached the word through `symbolsFailed` alone answers `candidates_produced` to this one.',
  },
  {
    id: 'a-produced-candidate-outranks-an-empty-screen',
    higher: 'candidates_produced',
    lower: 'no_candidate_qualified',
    situation: {
      id: 'precedence-produced-over-nothing-qualified',
      universe: 'declared',
      requiredLanes: 'open',
      optionalLane: 'unstated',
      rangeFailed: false,
      qualifying: 1,
      proposeAdvance: true,
    },
    why: 'The bottom of the order, and the control for the other two: without it «reports the higher word» would be satisfied by a package that reports the same word to everything.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// The ledger cases. Same shape, same two escape hatches.
// ─────────────────────────────────────────────────────────────────────────────

/** One candidate row, in the only vocabulary all three actually share. */
const ROW = Object.freeze({
  symbol: '011070',
  market: 'XKRX',
  hypothesis: '2024년 일회성 손상차손이 영업 훼손으로 오독됐고 3분기 수주잔고가 그것을 반증한다.',
  openQuestions: ['개선된 단가가 3분기 매출에 반영된 시점'],
  evidenceIds: ['ev_0601'],
  nextReviewCondition: '3분기 보고서 접수',
  nextReviewAtEpochMs: AS_OF + 30 * DAY,
})

/** ⛔ `bars` / a `close` array / an `excerpt`: the source cache, copied into a roster. */
const VENDOR_ROW = Object.freeze({
  ...ROW,
  bars: [{ t: '2026-02-26T00:00:00Z', close: 41_300, volume: 120_400 }],
  close: [41_300, 41_050, 40_900],
  excerpt: '당사는 2026년 2월 26일 이사회에서 자기주식 취득을 결의하였습니다.',
})

/** ⛔ `quantity` / `weight` / `cash` / `targetWeight`: `portfolio_get`, copied into a roster. */
const ACCOUNT_ROW = Object.freeze({
  ...ROW,
  quantity: 1_200,
  weight: 0.018,
  cash: 4_100_000,
  targetWeight: 0.02,
})

const LEDGER_CASES = [
  {
    id: 'nobody-read-the-ledger',
    clause: '⑤ previous === undefined',
    title: 'the key was never read',
    previous: 'undefined',
    rows: [ROW],
    expected: { writes: false, rows: 0, dataMissing: true },
    why: '⛔ Not an empty ledger. Seeding a fresh roster over a real one loses every hypothesis, every open question and every discovery date this desk has — and the loss reads, next run, as a market nobody has looked at.',
  },
  {
    id: 'read-and-genuinely-empty',
    clause: '⑤ previous === null',
    title: 'the key was read and holds nothing',
    previous: 'null',
    rows: [ROW],
    expected: { writes: true, rows: 1, dataMissing: false },
    why: 'The pair to the case above, and the reason the key can never self-lock: a malformed write is always recoverable by reading it and seeding.',
  },
  {
    id: 'a-copied-price-series-is-refused',
    clause: '⑥ memory_holds_vendor_payload',
    title: 'a candidate row carries bars, a close array and a filing excerpt',
    previous: 'null',
    rows: [VENDOR_ROW],
    expected: { writes: false, vendorPayload: true },
    why: '`manager-memory` is not a source cache. A private copy is stale the moment it is written and answers anyway, and it reads exactly like a fresh one a month later.',
  },
  {
    id: 'a-copied-holding-is-the-same-refusal',
    clause: '⑥ memory_holds_vendor_payload',
    title: 'a candidate row carries a quantity, a weight, cash and a target weight',
    previous: 'null',
    rows: [ACCOUNT_ROW],
    expected: { writes: false, vendorPayload: true },
    why: '`manager-memory` is not an account database either. Holdings and open proposals come back from `portfolio_get` every run; a second copy here is a source of truth nothing reconciles.',
  },
  {
    id: 'a-schema-version-this-code-does-not-know',
    clause: '⑧ schemaVersion ≠ 1',
    title: 'the stored document says it was written by a schema this code has never read',
    previous: 'unknown-version',
    rows: [ROW],
    expected: { writes: false },
    why: 'A writer this code does not know may have shaped its rows in a way this one silently drops, and dropping research history is the failure the document exists to prevent.',
  },
  {
    id: 'a-document-with-no-schema-version-degrades',
    clause: '⑧ schemaVersion absent',
    title: 'the pre-contract hand-written blob, with no version on it',
    previous: 'no-version',
    rows: [ROW],
    expected: { writes: true },
    why: 'Nothing to misread, so it carries less history rather than refusing — and refusing here would lock the key against the very write that fixes it.',
  },
  {
    id: 'a-document-written-after-as-of',
    clause: '⑧ updatedAtEpochMs > asOf',
    title: 'the stored document was written by a run later than this one',
    previous: 'after-as-of',
    rows: [ROW],
    expected: { writes: false },
    why: 'Its rows can all be past-dated and still carry a later run\'s judgement backwards, which is the point-in-time failure no per-row check catches.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// The adapters: one situation, three input shapes. They translate and nothing more.
// ─────────────────────────────────────────────────────────────────────────────

const declaredUniverse = { source: 'toss:/api/v1/stocks/all', count: 942 }

/**
 * ⚠️ **An adapter may translate a situation and may never make one easier.**
 * What comes from here is the input shape — a symbol range or a receipt range, a
 * lane name, a cursor kind, this package's own way of saying «the gate passed» —
 * and never a universe, a lane status, a failure or a cursor the situation did
 * not state.
 */

/** `fundamental-mean-reversion`: symbol ranges, a `symbol-index` cursor, price + filing required. */
const fmrAdapter = {
  PACKAGE: 'fundamental-mean-reversion',
  statuses: fmr.DISCOVERY_STATUSES,
  lanes: fmr.LANE_STATUSES,
  cursorKind: fmr.CURSOR_KIND,
  discovery(situation) {
    const failed = situation.rangeFailed ? ['005930'] : []
    const gateResults = [
      ...(situation.qualifying > 0
        ? [{ symbol: '011070', market: 'XKRX', researchOpen: true, rankBasis: 'decomposable-cause', researchCompleted: true }]
        : []),
      { symbol: '051910', market: 'XKRX', researchOpen: false, rankBasis: 'decomposable-cause' },
    ]
    const answer = fmr.discoveryRun({
      runId: 'run_contract',
      universe: situation.universe === 'declared' ? { declared: true, ...declaredUniverse } : undefined,
      failed,
      gateResults,
      laneStatuses: { price: situation.requiredLanes, filing: situation.requiredLanes, web: situation.optionalLane },
      budgetSpentOnHoldings: situation.budgetSpentOnHoldings === true,
      rangeComplete: !situation.rangeFailed,
      previousCursor: { kind: 'symbol-index', value: '000660', atEpochMs: AS_OF - DAY },
      proposedCursor: situation.proposeAdvance ? { kind: 'symbol-index', value: '011070' } : undefined,
      uncertainty: situation.uncertainty,
      asOf: AS_OF,
      config: { researchShortlistSize: 3, discoveryBudgetSymbols: 120, researchCompletionFloor: 1 },
    })
    const { shortlist, ...record } = answer.data
    return record
  },
  ledger({ previous, rows }) {
    const answer = fmr.candidateLedger({
      previous,
      observations: rows.map((row) => ({ ...row, discoveryPath: ['price-sweep'], sectionsComplete: ['fall-decomposition'] })),
      cursor: { kind: 'symbol-index', value: '011070' },
      asOf: AS_OF,
      ruleVersion: 'fmr-gate-1',
    })
    return {
      nextLedger: answer.data.nextLedger,
      rows: answer.data.rows,
      dataMissing: answer.causes.some((row) => row.code === 'data_missing'),
      codes: [...answer.diagnostics.map((row) => row.code), ...answer.causes.map((row) => row.code)],
    }
  },
  storedLedger: (extra) => ({ strategy: 'fundamental-mean-reversion', ruleVersion: 'fmr-gate-1', cursor: null, failedRanges: [], candidates: [], ...extra }),
}

/** `catalyst-turnaround`: OpenDART receipt ranges, a `dart-receipt` cursor, filing + web required. */
const ctAdapter = {
  PACKAGE: 'catalyst-turnaround',
  statuses: ct.DISCOVERY_STATUSES,
  lanes: ct.LANE_STATUSES,
  cursorKind: ct.CURSOR_KIND,
  discovery(situation) {
    /**
     * ⚠️ **CT measures its filing lane off the ranges it actually swept** and
     * honours a stated one only when it swept none. So a situation whose required
     * lanes are `dark` or `unstated` is put to it as a run that swept no range —
     * which is what that situation is: a run whose lanes did not answer at all.
     *
     * ⚠️ **`partial` is the one that does sweep.** A lane that answered for some of
     * the range is a lane that answered, so the receipt ranges are handed over and
     * they succeed — which makes CT's *measured* filing lane `open` — and the
     * situation's `partial` lands on `web`, the required lane this package states
     * rather than measures. ⛔ Translating `partial` as «swept nothing» instead
     * would make the situation easier: it would delete the candidate the situation
     * asks for, and the whole point of the case is a required lane that is not
     * `open` standing beside a name that came through the gate.
     */
    const sweeps =
      (situation.requiredLanes === 'open' || situation.requiredLanes === 'partial') && situation.budgetSpentOnHoldings !== true
    const event = {
      eventId: 'ev-tariff',
      symbol: '036460',
      market: 'XKRX',
      kind: 'tariff-or-price-normalisation',
      publishedAt: AS_OF - 5 * DAY,
      hypothesis: '억눌려 있던 규제 단가가 정상화되면서 미수금 잔액이 3분기부터 감소로 돌아선다.',
      tracedPath: {
        event: 'The ministry gazette raises the regulated unit price from Q3',
        revenueOrCost: 'The revised unit price is billed on the same delivered volume, so quarterly revenue rises without a volume assumption',
        cashFlow: 'The receivable balance in the Q3 note stops accruing and begins to draw down',
      },
      confirmablePeriod: '2026 Q3 report, receivable note',
      evidenceIds: ['ev_gazette_0602'],
    }
    const ranges = !sweeps
      ? []
      : [
          {
            cursor: { kind: 'dart-receipt', value: situation.proposeAdvance ? '20260226000742' : '20260105000111' },
            from: '20260105000111',
            to: '20260226000742',
            dartStatus: '000',
            symbols: ['001570'],
            events: situation.qualifying > 0 ? [event] : [],
          },
          ...(situation.rangeFailed
            ? [{ cursor: { kind: 'dart-receipt', value: '20260227000004' }, from: '20260226000742', to: '20260227000004', dartStatus: '020', symbols: ['005930'], events: [] }]
            : []),
        ]
    const answer = ct.discoveryRun({
      previous: {
        schemaVersion: 1,
        strategy: 'catalyst-turnaround',
        ruleVersion: 'ct-event-1',
        updatedAtEpochMs: AS_OF - DAY,
        cursor: { kind: 'dart-receipt', value: '20260105000111', atEpochMs: AS_OF - DAY },
        failedRanges: [],
        candidates: [],
      },
      runId: 'run_contract',
      universe: situation.universe === 'declared' ? { declared: true, ...declaredUniverse } : null,
      ranges,
      lanes: { filing: situation.requiredLanes, web: situation.requiredLanes, price: situation.optionalLane },
      researchCompleted: situation.qualifying,
      filingsSpentOnHoldings: situation.budgetSpentOnHoldings === true ? 400 : 0,
      uncertainty: situation.uncertainty,
      asOf: AS_OF,
    })
    return answer.data.run
  },
  ledger({ previous, rows }) {
    const answer = ct.candidateLedger({
      previous,
      observations: rows.map((row) => ({ ...row, discoveryPath: ['dart:tariff-or-price-normalisation'], lastSeenAtEpochMs: AS_OF })),
      cursor: { kind: 'dart-receipt', value: '20260226000742', atEpochMs: AS_OF },
      asOf: AS_OF,
      ruleVersion: 'ct-event-1',
    })
    return {
      nextLedger: answer.data.nextLedger,
      rows: answer.data.candidates,
      dataMissing: answer.causes.some((row) => row.code === 'data_missing'),
      codes: [...answer.diagnostics.map((row) => row.code), ...answer.causes.map((row) => row.code)],
    }
  },
  storedLedger: (extra) => ({ strategy: 'catalyst-turnaround', ruleVersion: 'ct-event-1', cursor: null, failedRanges: [], candidates: [], ...extra }),
}

/** `shareholder-rerating`: OpenDART receipt ranges, a `dart-receipt` cursor, filing + web required. */
const srAdapter = {
  PACKAGE: 'shareholder-rerating',
  statuses: sr.DISCOVERY_STATUSES,
  lanes: sr.LANE_STATUSES,
  cursorKind: sr.CURSOR_KIND,
  discovery(situation) {
    const symbolsFailed = situation.rangeFailed ? ['005930'] : []
    const answer = sr.discoveryRun({
      runId: 'run_contract',
      asOf: AS_OF,
      universe: situation.universe === 'declared' ? declaredUniverse : null,
      symbolsSucceeded: 60,
      symbolsFailed,
      symbolsAttempted: 60 + symbolsFailed.length,
      filingsRead: 80,
      researchCompleted: situation.qualifying,
      budgetSpentOnHoldings: situation.budgetSpentOnHoldings === true,
      lanes: { price: situation.optionalLane, filing: situation.requiredLanes, web: situation.requiredLanes },
      screened:
        situation.qualifying > 0
          ? [{ symbol: '316140', market: 'XKRX', resumed: false, axes: { discount: true, earningsQuality: true, execution: true } }]
          : [],
      cursorBefore: { kind: 'dart-receipt', value: '20260105000111', atEpochMs: AS_OF - DAY },
      cursorAfter: situation.proposeAdvance ? { kind: 'dart-receipt', value: '20260226000742', atEpochMs: AS_OF } : null,
      uncertainty: situation.uncertainty,
    })
    return answer.data.record
  },
  ledger({ previous, rows }) {
    const answer = sr.candidateLedger({
      previous,
      discovered: rows.map((row) => ({ ...row, state: 'researching', discoveryPath: ['disclosure-sweep'] })),
      cursor: { kind: 'dart-receipt', value: '20260226000742', atEpochMs: AS_OF },
      advanceCursor: true,
      asOf: AS_OF,
      ruleVersion: 'sr-gate-1',
    })
    return {
      nextLedger: answer.data.nextLedger,
      rows: answer.data.candidates,
      dataMissing: answer.data.outcomeCode === 'data_missing',
      codes: answer.diagnostics.map((row) => row.code),
    }
  },
  storedLedger: (extra) => ({ strategy: 'shareholder-rerating', ruleVersion: 'sr-gate-1', cursor: null, failedRanges: [], candidates: [], ...extra }),
}

const ADAPTERS = [fmrAdapter, ctAdapter, srAdapter]

// ─────────────────────────────────────────────────────────────────────────────
// The runner. Same reporting as `tools/verify-shared-scenarios.mjs`.
// ─────────────────────────────────────────────────────────────────────────────

const failures = []
const defects = []
const staleDefects = []
const disagreements = []
let checks = 0

const show = (value) => (value === null || value === undefined ? 'null' : String(value))
const cursorValue = (cursor) => (cursor === null || cursor === undefined ? null : (cursor.value ?? null))

/**
 * ⚠️ **The shared answer, then the recorded difference from it.** A package with
 * neither entry is held to the situation's own expectation; one with an entry is
 * held to *that* answer, so a recorded disagreement is a checked claim rather
 * than an exemption.
 */
function expectationFor(entry, name) {
  const disagreement = entry.expectedDisagreement?.[name] ?? null
  const defect = entry.knownDefect?.[name] ?? null
  return { expected: { ...entry.expected, ...(disagreement ?? {}), ...(defect ?? {}) }, disagreement, defect }
}

function record(entry, name, problems, disagreement, defect, observed) {
  const mark = problems.length === 0 ? (defect ? 'DEFECT' : disagreement ? 'differs' : 'ok') : 'FAIL'
  console.log(`   ${mark.padEnd(8)}${name.padEnd(28)} ${observed}`)
  for (const problem of problems) console.log(`             ⛔ ${problem}`)
  if (problems.length > 0) {
    /**
     * ⛔ **A `knownDefect` whose observed answer has moved is not a failure.** The
     * recorded answer is what that package gave when the entry was written; a
     * package that now answers something else has been changed, and the entry is
     * stale rather than the build broken.
     */
    if (defect) staleDefects.push({ id: entry.id, package: name, problems, note: defect.note })
    else failures.push({ id: entry.id, package: name, problems })
  } else if (defect) {
    defects.push({ id: entry.id, package: name, note: defect.note })
  } else if (disagreement) {
    disagreements.push({ id: entry.id, package: name, reason: disagreement.reason })
  }
}

// ── ① and ② the vocabulary itself, before any situation is put to anything ───

console.log('\n══ ① the nineteen field names of §7.1, in order, in all three ══')
for (const adapter of ADAPTERS) {
  const observed = Object.keys(adapter.discovery(SITUATIONS[0]))
  const problems = []
  checks += 1
  try {
    assert.deepEqual(observed, [...RECORD_FIELDS])
  } catch {
    const missing = RECORD_FIELDS.filter((field) => !observed.includes(field))
    const extra = observed.filter((field) => !RECORD_FIELDS.includes(field))
    problems.push(
      `the discovery-run record is not docs/contracts/discovery-run.md §7.1${missing.length > 0 ? ` — missing ${missing.join(', ')}` : ''}${extra.length > 0 ? ` — carries ${extra.join(', ')}` : ''}${missing.length === 0 && extra.length === 0 ? ` — same names, different order: ${observed.join(', ')}` : ''}`,
    )
  }
  record({ id: 'record-field-names' }, adapter.PACKAGE, problems, null, null, `${observed.length} field(s)`)
}

console.log('\n══ ② the two closed vocabularies, as sets ══')
for (const adapter of ADAPTERS) {
  const problems = []
  checks += 2
  const statuses = [...adapter.statuses].sort()
  const lanes = [...adapter.lanes].sort()
  if (statuses.join('|') !== [...DISCOVERY_STATUSES].sort().join('|')) {
    problems.push(`DISCOVERY_STATUSES is ${adapter.statuses.join(', ')} and the contract's closed set is ${DISCOVERY_STATUSES.join(', ')}`)
  }
  if (lanes.join('|') !== [...LANE_STATUSES].sort().join('|')) {
    problems.push(`LANE_STATUSES is ${adapter.lanes.join(', ')} and the contract's closed set is ${LANE_STATUSES.join(', ')}`)
  }
  record({ id: 'closed-vocabularies' }, adapter.PACKAGE, problems, null, null, `statuses=${adapter.statuses.length} lanes=${adapter.lanes.length} cursorKind=${adapter.cursorKind}`)
}

// ── ③ and ④ the decision table and the cursor rule ──────────────────────────

const reachedByPackage = new Map(ADAPTERS.map((adapter) => [adapter.PACKAGE, new Map()]))

for (const situation of SITUATIONS) {
  console.log(`\n── ${situation.id} — ${situation.clause} ───────────────`)
  console.log(`   ${situation.title}`)
  console.log(`   expected: status=${situation.expected.discoveryStatus} cursorAdvances=${situation.expected.cursorAdvances}`)

  for (const adapter of ADAPTERS) {
    const name = adapter.PACKAGE
    const { expected, disagreement, defect } = expectationFor(situation, name)
    const run = adapter.discovery(situation)
    const problems = []

    const before = cursorValue(run.cursorBefore)
    const after = cursorValue(run.cursorAfter)
    const advanced = after !== before

    checks += 4
    if (!DISCOVERY_STATUSES.includes(run.discoveryStatus)) {
      problems.push(`discoveryStatus ${show(run.discoveryStatus)} is outside the closed set`)
    }
    if (run.discoveryStatus !== expected.discoveryStatus) {
      problems.push(`discoveryStatus: ${show(run.discoveryStatus)}, expected ${show(expected.discoveryStatus)}`)
    }
    /**
     * ⛔ **The cursor rule, restated rather than inherited from the status.**
     * `cursorAfter === cursorBefore` whenever the status is anything but the two
     * words that mean «this run read its whole range».
     */
    if (!COMPLETE_STATUSES.includes(run.discoveryStatus) && advanced) {
      problems.push(`a ${run.discoveryStatus} run moved its cursor from ${show(before)} to ${show(after)}`)
    }
    if (situation.rangeFailed && advanced) {
      problems.push(`the cursor advanced from ${show(before)} to ${show(after)} with a failed range behind it — that range is now permanently unread`)
    }
    if (advanced !== (expected.cursorAdvances ?? false)) {
      problems.push(`cursor advanced: ${advanced}, expected ${expected.cursorAdvances ?? false}`)
    }
    /** ⚠️ A cursor of another kind was written by another strategy; resuming from it reads a different market. */
    for (const [field, cursor] of [['cursorBefore', run.cursorBefore], ['cursorAfter', run.cursorAfter]]) {
      if (cursor !== null && cursor !== undefined) {
        checks += 1
        if (cursor.kind !== adapter.cursorKind) problems.push(`${field}.kind is ${show(cursor.kind)} and this package resumes on ${adapter.cursorKind}`)
        if (!Number.isFinite(cursor.atEpochMs)) problems.push(`${field}.atEpochMs is ${show(cursor.atEpochMs)} and an instant in a stored document is an epoch-ms number`)
      }
    }
    /** ⛔ Every lane word the record publishes is one of the four. */
    for (const field of ['priceLaneStatus', 'filingLaneStatus', 'webLaneStatus']) {
      checks += 1
      if (!LANE_STATUSES.includes(run[field])) problems.push(`${field} is ${show(run[field])}, outside ${LANE_STATUSES.join(' / ')}`)
    }

    reachedByPackage.get(name).set(situation.id, run.discoveryStatus)
    record(
      situation,
      name,
      problems,
      disagreement,
      defect,
      `status=${run.discoveryStatus.padEnd(24)} cursor ${show(before)} → ${show(after)}  lanes=${run.priceLaneStatus}/${run.filingLaneStatus}/${run.webLaneStatus}`,
    )
  }
}

/**
 * ── The assertion this section exists for ──────────────────────────────────
 *
 * ⛔ **Three situations, three answers, per package.** A checker that only ever
 * asserted per-situation fields would pass a build where one package answered
 * `discovery_incomplete` to everything for a different reason each time, which is
 * exactly the collapse #305 exists to refuse.
 */
console.log('\n══ ③ the four statuses are four different answers, per package ══')
for (const adapter of ADAPTERS) {
  const reached = reachedByPackage.get(adapter.PACKAGE)
  const problems = []
  checks += 2
  const distinct = new Set(reached.values())
  for (const status of DISCOVERY_STATUSES) {
    if (!distinct.has(status)) problems.push(`no situation reaches ${status}, so it cannot be shown to be distinguishable`)
  }
  const triple = [
    reached.get('a-complete-sweep-that-qualified-nobody'),
    reached.get('nobody-declared-a-universe'),
    reached.get('a-range-failed-and-nothing-qualified'),
  ]
  if (new Set(triple).size !== 3) {
    problems.push(`a complete screen, a run with no universe and a failed range collapsed onto ${new Set(triple).size} answer(s): ${triple.join(' | ')}`)
  }
  record({ id: 'three-situations-three-answers' }, adapter.PACKAGE, problems, null, null, `reached ${distinct.size} of 4: ${[...distinct].join(', ')}`)
}

console.log(`\n══ ⑨ the precedence — ${PRECEDENCE.join(' > ')} ══`)
for (const entry of PRECEDENCE_CASES) {
  console.log(`\n── ${entry.id} — ${entry.higher} beats ${entry.lower} ───────────────`)
  console.log(`   ${entry.why}`)
  for (const adapter of ADAPTERS) {
    const run = adapter.discovery(entry.situation)
    const problems = []
    checks += 2
    if (run.discoveryStatus !== entry.higher) {
      problems.push(
        `both conditions hold and this run reported ${show(run.discoveryStatus)}; the contract ranks ${entry.higher} above ${entry.lower}`,
      )
    }
    /**
     * ⛔ **The rank is checked as a rank, not as one expected word.** A package that
     * answered some *third* status here would satisfy «is not the lower word» and
     * still be outside the contract.
     */
    const rank = PRECEDENCE.indexOf(run.discoveryStatus)
    if (rank < 0 || rank > PRECEDENCE.indexOf(entry.lower)) {
      problems.push(`${show(run.discoveryStatus)} ranks below ${entry.lower}, and one of the two conditions that hold here is ${entry.lower}'s`)
    }
    record(entry, adapter.PACKAGE, problems, null, null, `status=${run.discoveryStatus}`)
  }
}

/**
 * ⚠️ **And the half that is not about the word.** Whatever the precedence reports,
 * a candidate that came out of the gate is still *counted* — the contract keeps it
 * in `newCandidates` / `resumedCandidates` precisely so that reporting the unfinished
 * sweep never hides the name. A package that resolved the tie by dropping the count
 * would pass every check above.
 */
console.log('\n══ ⑨ a candidate reported as an incomplete sweep is still counted ══')
/** Both ways of reaching the word over a productive run: a failed range, and a lane that is not `open`. */
const COUNTED_SITUATIONS = [
  SITUATIONS.find((row) => row.id === 'a-range-failed-while-a-name-qualified'),
  PRECEDENCE_CASES.find((row) => row.id === 'a-partial-required-lane-outranks-a-produced-candidate').situation,
]
for (const adapter of ADAPTERS) {
  const problems = []
  const shown = []
  for (const situation of COUNTED_SITUATIONS) {
    const run = adapter.discovery(situation)
    checks += 1
    if (run.newCandidates + run.resumedCandidates < 1) {
      problems.push(
        `${situation.id}: reported ${run.discoveryStatus} with newCandidates=${run.newCandidates} resumedCandidates=${run.resumedCandidates} — the name that came through the gate was dropped along with the word`,
      )
    }
    shown.push(`${situation.id}: new=${run.newCandidates} resumed=${run.resumedCandidates} gatePassed=${run.gatePassed}`)
  }
  record({ id: 'the-name-survives-the-precedence' }, adapter.PACKAGE, problems, null, null, shown.join('  '))
}

console.log('\n══ ③ no_candidate_qualified is reported only under its full condition ══')
for (const adapter of ADAPTERS) {
  const problems = []
  for (const situation of SITUATIONS) {
    const run = adapter.discovery(situation)
    if (run.discoveryStatus !== 'no_candidate_qualified') continue
    checks += 3
    if (run.universeDeclared !== true) problems.push(`${situation.id}: claimed nothing qualified with universeDeclared ${show(run.universeDeclared)}`)
    if (run.symbolsFailed.length > 0) problems.push(`${situation.id}: claimed nothing qualified with ${run.symbolsFailed.length} failed symbol(s)`)
    const required = { 'fundamental-mean-reversion': ['priceLaneStatus', 'filingLaneStatus'] }[adapter.PACKAGE] ?? ['filingLaneStatus', 'webLaneStatus']
    for (const field of required) {
      if (run[field] !== 'open') problems.push(`${situation.id}: claimed nothing qualified with ${field} = ${show(run[field])}`)
    }
  }
  record({ id: 'no-candidate-qualified-is-earned' }, adapter.PACKAGE, problems, null, null, 'checked over every situation')
}

// ── ⑤ ⑥ ⑦ ⑧ the candidate ledger ────────────────────────────────────────────

for (const ledgerCase of LEDGER_CASES) {
  console.log(`\n── ${ledgerCase.id} — ${ledgerCase.clause} ───────────────`)
  console.log(`   ${ledgerCase.title}`)

  for (const adapter of ADAPTERS) {
    const name = adapter.PACKAGE
    const { expected, disagreement, defect } = expectationFor(ledgerCase, name)
    const previous = {
      undefined: undefined,
      null: null,
      'unknown-version': adapter.storedLedger({ schemaVersion: 7, updatedAtEpochMs: AS_OF - DAY }),
      'no-version': adapter.storedLedger({ updatedAtEpochMs: AS_OF - DAY }),
      'after-as-of': adapter.storedLedger({ schemaVersion: 1, updatedAtEpochMs: AS_OF + DAY }),
    }[ledgerCase.previous]

    const answer = adapter.ledger({ previous, rows: ledgerCase.rows })
    const problems = []

    checks += 2
    const writes = answer.nextLedger !== null && answer.nextLedger !== undefined
    if (writes !== expected.writes) {
      problems.push(`wrote a ledger: ${writes}, expected ${expected.writes}. ⛔ nextLedger is null whenever a blocking diagnostic fires — a diagnostic beside a written ledger is a refusal by another name that still wrote`)
    }
    if (expected.rows !== undefined && answer.rows.length !== expected.rows) {
      problems.push(`carried ${answer.rows.length} row(s), expected ${expected.rows}`)
    }
    if (expected.dataMissing !== undefined) {
      checks += 1
      if (answer.dataMissing !== expected.dataMissing) {
        problems.push(`reported the absence as data_missing: ${answer.dataMissing}, expected ${expected.dataMissing}`)
      }
    }
    /**
     * ⚠️ **The one diagnostic code asserted across the three**, because the
     * contract names it: `docs/contracts/discovery-run.md`, «What must never be
     * written here». Every other code, and every severity word, is each
     * package's own and is never compared.
     */
    if (expected.vendorPayload === true) {
      checks += 1
      if (!answer.codes.includes('memory_holds_vendor_payload')) {
        problems.push(`refused without memory_holds_vendor_payload — the contract names that code. Got: ${answer.codes.join(', ') || '(none)'}`)
      }
    }

    record(ledgerCase, name, problems, disagreement, defect, `wrote=${String(writes).padEnd(5)} rows=${answer.rows.length} dataMissing=${answer.dataMissing}`)
  }
}

/**
 * ── ⑦ a rerun makes no second anything ─────────────────────────────────────
 *
 * Three runs over one row: seed, then the seeded document read back, then that
 * one read back. ⛔ **The second and third must be the same document.** A ledger
 * that grows on every rerun grows a history nobody wrote and a roster nobody
 * discovered, and it does it only on the runs that changed nothing — which is
 * every run of a desk that is waiting.
 */
console.log('\n── a rerun on identical input is a fixed point — ⑦ idempotency ───────────────')
for (const adapter of ADAPTERS) {
  const name = adapter.PACKAGE
  const problems = []
  checks += 3

  const first = adapter.ledger({ previous: null, rows: [ROW] })
  const firstAgain = adapter.ledger({ previous: null, rows: [ROW] })
  try {
    assert.deepEqual(firstAgain.nextLedger, first.nextLedger)
  } catch {
    problems.push('the same call twice produced two different documents')
  }

  const second = adapter.ledger({ previous: first.nextLedger, rows: [ROW] })
  const third = adapter.ledger({ previous: second.nextLedger, rows: [ROW] })
  try {
    assert.deepEqual(third.nextLedger, second.nextLedger)
  } catch {
    problems.push('reading the written document back and rewriting it produced a third, different document — the rerun is not a fixed point')
  }

  const historyOf = (answer) => answer.nextLedger?.candidates?.[0]?.history?.length ?? null
  const rowsOf = (answer) => answer.nextLedger?.candidates?.length ?? null
  if (rowsOf(second) !== 1 || rowsOf(third) !== 1) {
    problems.push(`a rediscovered name made a second row: ${rowsOf(second)} then ${rowsOf(third)} — the key is (market, symbol)`)
  }
  if (historyOf(second) !== historyOf(third)) {
    problems.push(`history grew on a rerun that changed nothing: ${historyOf(second)} → ${historyOf(third)}`)
  }

  record(
    { id: 'a-rerun-is-a-fixed-point' },
    name,
    problems,
    null,
    null,
    `rows=${rowsOf(third)} history=${historyOf(third)}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// The report.
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══ documented disagreements — a policy difference, recorded and checked ══')
if (disagreements.length === 0) console.log('   (none)')
for (const row of disagreements) {
  console.log(`   • ${row.id} / ${row.package}`)
  console.log(`     ${row.reason}`)
}

console.log('\n══ ⛔ KNOWN DEFECTS — the contract answered wrongly, recorded and NOT fixed here ══')
if (defects.length === 0) console.log('   (none)')
for (const row of defects) {
  console.log(`   ⛔ ${row.id} / ${row.package}`)
  console.log(`      ${row.note}`)
}

if (staleDefects.length > 0) {
  console.log('\n══ ⚠️ STALE KNOWN DEFECTS — the package no longer answers what was recorded ══')
  for (const row of staleDefects) {
    console.log(`   ⚠️ ${row.id} / ${row.package} — ${row.note}`)
    for (const problem of row.problems) console.log(`      ${problem}`)
    console.log('      Delete the `knownDefect` entry, or correct it to what the package now answers.')
  }
}

if (failures.length > 0) {
  console.log('\n══ ⛔ CONTRACT VIOLATIONS ══')
  for (const row of failures) {
    console.log(`   ⛔ ${row.id} / ${row.package}`)
    for (const problem of row.problems) console.log(`      ${problem}`)
  }
  console.log(
    `\ndiscovery contract FAILED — ${failures.length} unrecorded contract violation(s) across ${SITUATIONS.length} situation(s) and ${LEDGER_CASES.length} ledger case(s) × ${ADAPTERS.length} package(s).`,
  )
  process.exit(1)
}

console.log(
  `\ndiscovery contract ok — ${checks} check(s), ${RECORD_FIELDS.length} field name(s), ${SITUATIONS.length} situation(s) and ${LEDGER_CASES.length} ledger case(s) × ${ADAPTERS.length} package(s), ${disagreements.length} documented disagreement(s), ${defects.length} known defect(s)${staleDefects.length > 0 ? `, ${staleDefects.length} stale known defect(s)` : ''}.`,
)
