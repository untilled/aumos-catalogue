/**
 * ── One situation, three packages, four contracts ───────────────────────────
 *
 * `COMMONISATION-SURVEY.md` («Can a shared scenario suite actually be built?»)
 * refused a shared *library* and asked for a shared *scenario suite* instead.
 * This file is the scenarios half of it: the **situation** and the **answers
 * that matter**, with no package's field names, severities, diagnostic codes or
 * output shapes anywhere in it. The three adapters beside it translate a
 * situation into each package's input shape and normalise its answer down to
 * the handful of things all three genuinely claim.
 *
 * ── The four contracts, and they are the whole of what is asserted ─────────
 *
 *   ① **An unread account must not read as an empty one.** A book nobody could
 *      read authorises no increase, and the reason is an absence (`data_missing`)
 *      rather than a refutation. An account that really is empty is a fact and
 *      passes.
 *   ② **A total and an increment are two numbers.** Whatever each package sizes,
 *      it publishes what the position should *be* and what to *add* today, and
 *      the second is the first less what is already there — never negative.
 *   ③ **An open proposal is counted once.** Exposure to one name is one quantity:
 *      pending totals fold into the holding by `max` and never by sum, a desk's
 *      own restated proposal does not double its own position, and another
 *      desk's pending total is a ceiling rather than a position.
 *   ④ **A limit that could not be checked must not read as a limit that passed.**
 *      A ceiling nobody read withholds the increase it constrains, as an absence.
 *
 * ⛔ **What is never asserted here**, because asserting it would be
 * commonisation of policy through the back door (#256, and the survey's
 * «where the suite must stop»): field names, severity words, diagnostic codes,
 * answer shapes, splitting conditions, sizing formulas, exit logic,
 * classification vocabularies and thresholds. The three sizing formulas are
 * three different methodologies and their **numbers** are expected to differ;
 * only the exposure the caps were measured against is a shared quantity.
 *
 * ── Where they legitimately differ, and where they are wrong ───────────────
 *
 * A scenario the three answer differently is **recorded**, never skipped and
 * never softened into an easier scenario:
 *
 *   `expectedDisagreement` — a policy difference. Each entry carries the answer
 *      that package gives and a `reason` saying why it is that package's to make.
 *   `knownDefect` — an answer that is wrong against one of the four contracts.
 *      It is recorded here, printed loudly by the runner, and **not fixed in the
 *      change that adds this suite**: #256 is explicit that a fix for something
 *      the checks missed does not travel with the check that found it.
 *
 * ── The situation vocabulary ───────────────────────────────────────────────
 *
 *   `holdings` / `pending`  arrays of rows, or the string `'unread'` — which is
 *      «this run never saw that half of the account», not «it is empty».
 *      A holding row is `{ weight, strategy? }`, a pending row is
 *      `{ targetWeight, strategy? }` — the host's own two field names and the
 *      host's own two meanings (`untilled/aumos#813`, `#814`).
 *      `strategy: 'this-desk'` is the manager being run, `'other-desk'` is
 *      another manager, and **no `strategy` at all** is an unattributed row.
 *   `mandate`  `'unread'` — no Mandate reached this run — or the host's own
 *      constraints object. `maxPositionWeight` is the single-name ceiling and
 *      `cashFloor`'s complement is the gross one.
 *   `thesis`  the inputs each package's own sizing needs. They are handed to all
 *      three and each uses what its formula takes; the resulting weights are not
 *      compared to each other.
 *
 * @see ./README.md for how to add one.
 */

/** The name every scenario is about, and the fund sector the host classifies it under. */
export const SYMBOL = 'ACME'
export const SECTOR = 'industrials'

/** The manager being run, and a second one sharing the book with it. */
export const THIS_DESK = 'this-desk'
export const OTHER_DESK = 'other-desk'

/**
 * The thesis every scenario shares, so that a difference between two scenarios is
 * a difference in the *account* and never in the idea.
 *
 * ⚠️ **Each package divides a risk budget by a different loss and arrives at a
 * different weight, on purpose.** `entryPrice` and `invalidationPrice` are the
 * two all three read; `expectedActiveReturn` and `conviction` are quarter-Kelly's
 * and only `catalyst-turnaround` reads them.
 */
export const THESIS = Object.freeze({
  entryPrice: 100,
  invalidationPrice: 80,
  expectedActiveReturn: 0.3,
  conviction: 0.6,
})

/** A Mandate that states both axes the host carries. */
const MANDATE = Object.freeze({
  baseCurrency: 'KRW',
  allowedAssetClasses: ['equity'],
  maxPositionWeight: 0.2,
  cashFloor: 0.2,
})

/**
 * The same Mandate with a single-name ceiling tight enough that the ceiling, and
 * not any package's own risk arithmetic, is the binding number.
 *
 * ⚠️ **That is what makes the two cap scenarios about the cap.** Under the 20%
 * ceiling above, all three size well below it and a full name would be read as a
 * position above target by whichever formula sizes smallest — a difference in
 * sizing policy, which this suite does not assert.
 */
const MANDATE_TIGHT = Object.freeze({
  baseCurrency: 'KRW',
  allowedAssetClasses: ['equity'],
  maxPositionWeight: 0.02,
  cashFloor: 0.2,
})

/** The same Mandate with the single-name axis left undeclared. */
const MANDATE_NO_SINGLE_NAME = Object.freeze({
  baseCurrency: 'KRW',
  allowedAssetClasses: ['equity'],
  cashFloor: 0.2,
})

/** The same Mandate with no cash floor, so the gross axis is undeclared. */
const MANDATE_NO_GROSS = Object.freeze({
  baseCurrency: 'KRW',
  allowedAssetClasses: ['equity'],
  maxPositionWeight: 0.2,
})

export const SCENARIOS = [
  // ── ① an unread account is not an empty one ──────────────────────────────
  {
    id: 'unread-holdings',
    contract: 1,
    title: 'the holdings half of the account was never read',
    situation: { holdings: 'unread', pending: [], mandate: MANDATE },
    expected: {
      approvesIncrease: false,
      cause: 'data_missing',
      exposure: null,
      why: 'A book nobody read is not a book with nothing in it, and an absence is not a refutation.',
    },
  },
  {
    id: 'unread-pending',
    contract: 1,
    title: 'the open-proposal half of the account was never read',
    situation: { holdings: [], pending: 'unread', mandate: MANDATE },
    expected: {
      approvesIncrease: false,
      cause: 'data_missing',
      exposure: null,
      why: 'Half an account is not an account. The pending half is exposure that is about to exist.',
    },
  },
  {
    id: 'empty-book-is-a-fact',
    contract: 1,
    title: 'an account that really is empty, stated as empty',
    situation: { holdings: [], pending: [], mandate: MANDATE },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0,
      why: 'The control for ①: an empty account is a legitimate state and must still reach a sized increase, or «refuses on an unread book» would be indistinguishable from «refuses always».',
    },
  },

  // ── ③ an open proposal is counted once ───────────────────────────────────
  {
    id: 'own-pending-restated',
    contract: 3,
    title: 'this desk holds 1% and its own open proposal restates the name at 1.5%',
    situation: {
      holdings: [{ weight: 0.01, strategy: THIS_DESK }],
      pending: [{ targetWeight: 0.015, strategy: THIS_DESK }],
      mandate: MANDATE,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.015,
      why: 'A pending total is what the position is asked to become, so a desk re-running on its own name is exposed to 0.015 and never to 0.025. The survey\'s §5.3 scenario B.',
    },
  },
  {
    id: 'other-pending-is-a-ceiling',
    contract: 3,
    title: 'another desk holds 0.6% and has an unapproved proposal taking the name to 0.8%',
    situation: {
      holdings: [{ weight: 0.006, strategy: OTHER_DESK }],
      pending: [{ targetWeight: 0.008, strategy: OTHER_DESK }],
      mandate: MANDATE,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.008,
      why: 'The survey\'s §5.3 scenario A. `max(held, the largest pending total)`, and the pending total is a ceiling this desk must stay under rather than a position it may trim.',
    },
  },
  {
    id: 'empty-pending-versus-unknown-pending',
    contract: 3,
    title: 'a holding with an explicitly empty pending list',
    situation: {
      holdings: [{ weight: 0.006, strategy: OTHER_DESK }],
      pending: [],
      mandate: MANDATE,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.006,
      why: 'The pair to `unread-pending`: the same book with the pending list stated as empty answers, and answers 0.006 rather than refusing.',
    },
  },
  {
    id: 'duplicate-holding-rows',
    contract: 3,
    title: 'one position carrying two theses arrives as two holding rows',
    situation: {
      holdings: [
        { weight: 0.01, strategy: THIS_DESK },
        { weight: 0.006, strategy: OTHER_DESK },
      ],
      pending: [],
      mandate: MANDATE,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.01,
      why: '#256: «보유 종목에 복수 thesis가 붙어도 포지션 수량은 하나다». Two rows for one symbol are two claims about one position.',
    },
    /**
     * ⚠️ **This was a contract-③ violation in two of the three when the suite
     * was written** — `catalyst-turnaround` and `fundamental-mean-reversion`
     * summed the rows and read one position as 0.016 of the account. Recorded
     * here as `knownDefect`, fixed in their own PRs (#300 and #299: the larger
     * row wins, the duplicate is reported), and the entries deleted once the
     * runner reported them stale. The scenario now asserts the folded answer
     * for all three.
     */
  },
  {
    id: 'unattributed-holding',
    contract: 3,
    title: 'the account holds 0.6% of the name and no manager is assigned to it',
    situation: {
      holdings: [{ weight: 0.006 }],
      pending: [],
      mandate: MANDATE,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.006,
      why: 'An unattributed row is exposure for the ceiling and is nobody\'s position to move (`untilled/aumos#785`). This desk may still buy into the name; what it may not do is read the 0.6% as its own.',
    },
  },

  // ── ② a total and an increment are two numbers ───────────────────────────
  {
    id: 'own-holding-and-an-increase',
    contract: 2,
    title: 'this desk already holds 1% and the thesis is intact',
    situation: {
      holdings: [{ weight: 0.01, strategy: THIS_DESK }],
      pending: [],
      mandate: MANDATE,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.01,
      why: 'The pair (total, increment) has to arrive as two fields: the increment is the total less what is already carried, and a host reading either one for the other is wrong.',
    },
  },

  // ── ④ an uncheckable limit is not a passed limit ─────────────────────────
  {
    id: 'mandate-absent',
    contract: 4,
    title: 'no Mandate reached this run at all',
    situation: { holdings: [], pending: [], mandate: 'unread' },
    expected: {
      approvesIncrease: false,
      cause: 'data_missing',
      exposure: 0,
      why: 'The ceiling this weight is measured against was never read. An absent cap is nobody having said, which is not permission.',
    },
    expectedDisagreement: {
      'catalyst-turnaround': {
        exposure: null,
        reason: 'It publishes no account reading at all when the limit is unread — `readable: false` covers the book **and** the cap together — where the other two answer «the book was read and this name is 0 of it» beside the same refusal. Both are «no increase, because something was not read»; they differ on whether a readable book is still worth reporting under an unreadable cap. Nothing downstream of either may size, so neither is unsafe.',
      },
    },
  },
  {
    id: 'cap-already-taken',
    contract: 4,
    title: 'another desk holds 2.5% of the name under a 2% single-name ceiling',
    situation: {
      holdings: [{ weight: 0.025, strategy: OTHER_DESK }],
      pending: [],
      mandate: MANDATE_TIGHT,
    },
    expected: {
      approvesIncrease: false,
      cause: 'risk_limit_exceeded',
      exposure: 0.025,
      why: 'There is no room for this one whatever the thesis says, and the finding is about the account rather than about the company.',
    },
    expectedDisagreement: {
      'shareholder-rerating': {
        cause: null,
        reason: 'All three withhold the increase; this one does not reach any of the four codes because on a name already past its ceiling it stops asking the buying question and asks the **reduction** one instead (`aumos-catalogue#284`, `#286`: a ceiling withholds an addition and never deletes the order that fixes an excess). The excess is reported — as a finding about the account, on a proposal that adds nothing — and the run\'s answer is a trim rather than a refusal. That is this package\'s judgement to make and #256 assigns it to the package; what the suite asserts is that none of the three authorises an increase here, and none does.',
      },
    },
  },
  {
    id: 'cap-with-thin-headroom',
    contract: 4,
    title: 'another desk holds 1.8% under a 2% ceiling, leaving 0.2pp',
    situation: {
      holdings: [{ weight: 0.018, strategy: OTHER_DESK }],
      pending: [],
      mandate: MANDATE_TIGHT,
    },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0.018,
      why: 'The pair to `cap-already-taken`: a cap that binds hard is still a cap that passed, and the increase it allows is the headroom rather than nothing.',
    },
  },
  {
    id: 'mandate-declares-no-single-name-cap',
    contract: 4,
    title: 'the Mandate was read and declares no single-name ceiling',
    situation: { holdings: [], pending: [], mandate: MANDATE_NO_SINGLE_NAME },
    expected: {
      approvesIncrease: false,
      cause: 'data_missing',
      exposure: 0,
      why: 'The survey\'s ③.2 row 2. Two of the three cannot express «read, and declares none» at all and refuse; refusing is the safe direction, so the third\'s extra capability is recorded as a disagreement rather than as their defect.',
    },
    expectedDisagreement: {
      'catalyst-turnaround': {
        approvesIncrease: true,
        cause: null,
        reason: 'It alone carries a three-state reading of a declared limit — a number, the literal «read and declares none», or unread — so a Mandate that genuinely declines to constrain this axis is a statement it can act on: its own pre-registered ceiling binds and the declared absence is recorded so that it cannot leave the same trace as an unread field. The other two have no such sentinel, cannot tell «declared none» from «nobody read it», and refuse. ⚠️ **Refusing is the safe direction**, so this is a capability gap and not a defect in either of them — but it is a real limitation: neither can serve a Mandate that declines to constrain the single-name axis.',
      },
    },
  },
  {
    id: 'mandate-declares-no-gross-cap',
    contract: 4,
    title: 'the Mandate was read, states a single-name ceiling and no cash floor',
    situation: { holdings: [], pending: [], mandate: MANDATE_NO_GROSS },
    expected: {
      approvesIncrease: true,
      cause: null,
      exposure: 0,
      why: 'The survey\'s ③.2 row 3, which has since been settled the same way in all three: an axis a read Mandate declares nothing on constrains nothing, and only an *unread* one withholds.',
    },
  },
]
