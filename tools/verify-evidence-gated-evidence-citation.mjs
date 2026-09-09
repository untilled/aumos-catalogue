import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execute } from '../managers/evidence-gated/lib/index.mjs'

/**
 * ── What §6 may tell a run about Evidence, checked (`untilled/aumos#773`) ───
 *
 * `PROMPT.md` §6 said *"include only Evidence ids actually returned in this
 * run"*. The host requires the opposite and says so by name: Evidence scope is
 * derived from the `manager_runs` row, that row does not exist until the run
 * ends (`untilled/aumos#727`, `#453`), and an id the gateway issued mid-run is
 * therefore uncommitted and uncitable.
 *
 * Measured on `run_bb689b6199084b04afd8b0e1d1528cda`: **24 of 24** ids issued
 * during the run were refused `unknown-evidence` while the **3** carried over
 * from the previous run were accepted. A run that obeyed the sentence and
 * submitted would have lost its whole judgement to `invalid-proposal`.
 *
 * ⚠️ **The failure is silent up to the door and total after it**, which is why
 * the second rule — rehearse with `proposal_validate` before spending the one
 * `decision_submit` — is checked here beside the first: the measured run only
 * escaped because it happened to validate first.
 *
 * ⛔ **Not a grep for prose this file's author wrote.** Three of the four
 * checks are structural — a retracted sentence's *absence*, an ordering by
 * position, two lists compared as sets — and the fourth reads `lib/` rather
 * than a document, so that the claim §6 makes about `observationLedger` cannot
 * drift away from what `observationLedger` does.
 */

const packageRoot = new URL('../managers/evidence-gated/', import.meta.url)
const prompt = await readFile(new URL('PROMPT.md', packageRoot), 'utf8')
const memoryContract = await readFile(new URL('skills/memory-contract/SKILL.md', packageRoot), 'utf8')

/**
 * ⑴ The retracted sentence is gone rather than qualified.
 *
 * ⚠️ Checked as an absence on purpose: a document that states the rule *and*
 * keeps the sentence it replaces is a document a run can satisfy either way,
 * and the one it will pick is the shorter, more confident one.
 */
assert.ok(
  !/Include only Evidence ids actually returned in this run/i.test(prompt),
  'PROMPT.md no longer tells a run to cite the ids issued during it — the host refuses every one of them and the run loses its whole judgement (untilled/aumos#773)',
)
assert.ok(
  /already committed/i.test(prompt) && /has not ended yet/i.test(prompt),
  'and it states the rule that replaced it: only Evidence this host already holds, which is what a run that has ended issued',
)

/**
 * ⑵ The rehearsal is named, and named **before** the door.
 *
 * ⚠️ Position rather than presence, the rule `verify-evidence-gated-recipes.mjs`
 * applies to collect-before-sweep and for the same reason: an instruction that
 * mentions both calls in the wrong order reads as correct to a skimmer and
 * produces exactly the failure it was written against.
 */
const rehearse = prompt.indexOf('proposal_validate')
const submit = prompt.lastIndexOf('Call `decision_submit` exactly once')
assert.notEqual(rehearse, -1, 'PROMPT.md names proposal_validate; nothing else tells a run that the one door refuses silently and totally')
assert.notEqual(submit, -1, 'PROMPT.md still names the one door')
assert.ok(rehearse < submit, 'the rehearsal is instructed before the submission; in the other order it is a post-mortem')

/**
 * ⑶ The carry file is a stable path in **both** lists, which are one list.
 *
 * §1 publishes the paths a run may read and `skills/memory-contract/SKILL.md`
 * publishes the same set; a key in one and not the other is a key half the
 * package believes in. The rule this slice adds — record what this run was
 * issued so the next run can cite it — is worth nothing if the file it names is
 * not a path a run is allowed to keep.
 */
const paths = (text) => new Set([...text.matchAll(/`(state\/[a-z0-9/-]+\.json)`/g)].map((match) => match[1]))
/**
 * ⚠️ **Read from §1's list and not from the whole file.** Every prose mention of
 * a path would satisfy this, including the two §6 makes of the carry file
 * itself — so the check would have passed on a document that told a run to
 * write somewhere §1 forbids, which is the state this slice must not create.
 */
const listStart = prompt.indexOf('Read these stable paths only')
assert.notEqual(listStart, -1, 'PROMPT.md §1 still publishes the stable paths as one list')
const declared = paths(prompt.slice(listStart, prompt.indexOf('`files_list` with', listStart)))
const contracted = paths(memoryContract)
assert.ok(declared.has('state/research/evidence-carry.json'), 'the carry file is one of §1\'s stable paths; a run told to write somewhere else is told to invent a per-run path')
assert.deepEqual(
  [...declared].sort(),
  [...contracted].sort(),
  'PROMPT.md §1 and skills/memory-contract/SKILL.md publish one list of stable paths, not two that drift',
)

/**
 * ⑷ The claim §6 makes about `observationLedger` is read out of `lib/`.
 *
 * §6 now says that a receipt filed this run and cited next run comes back as
 * `observation_filed_not_cited`, that this is expected, and that it refuses
 * nothing. The last clause is a statement about code: if the finding were ever
 * promoted to `blocked`, every run obeying §6 would be blocked by the very
 * bookkeeping §6 tells it to do, and the document would still read as correct.
 */
const filedNotCited = execute({
  operation: 'observationLedger',
  asOf: '2026-09-09T00:00:00.000Z',
  input: {
    observations: [{
      evidenceId: 'ev_carried',
      contentHash: 'sha256:abc',
      url: 'https://example.invalid/consensus',
      publishedAt: '2026-09-01T00:00:00.000Z',
      evidenceKind: 'manager-observation',
      source: 'manager',
    }],
    citedEvidenceIds: [],
  },
})
const finding = filedNotCited.diagnostics.find((row) => row.code === 'observation_filed_not_cited')
assert.ok(finding, 'a receipt this run filed and did not cite is still reported — that is the one thing §6 must not make invisible')
assert.equal(
  finding.severity,
  'unevaluated',
  'and it refuses nothing: under the committed-only rule every receipt a run files is uncited by that run, so a blocked severity here would block every run that obeyed §6',
)
assert.equal(
  filedNotCited.diagnostics.some((row) => row.severity === 'blocked'),
  false,
  'filing a receipt and carrying it forward is not itself a refusable shape',
)

console.log('evidence-gated citation contract: the run cites what is committed, records what it was issued, and rehearses before the one door')
