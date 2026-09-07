import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  LEDGER_TTL_MS,
  MAX_DELEGATION_DEPTH,
  MAX_DISPATCHES_PER_FLOW,
  MAX_DISPATCHES_PER_RUN,
  declaredFlows,
  isDispatch,
  judgeDispatch,
} from '../managers/evidence-gated/hooks/guard-budget.mjs'

/**
 * ── The ceiling this package never had (issue #209 §8-D) ───────────────────
 *
 * `hooks/guard-submit.mjs` limits who may submit and nothing limited how much
 * may be dispatched. One run opened 29 unique subagents — 28 of them
 * `general-purpose`, three tiers deep — spent the subscription on relaying bar
 * arrays between models, and submitted no judgement.
 *
 * Four things are checked, and the last two are the ones a tidy pair of
 * constants could not have faked:
 *
 *  1. **The roster is read, not written.** `declaredFlows()` reads `agents/`,
 *     so a flow added or removed there moves this guard with it. A second list
 *     is the thing that goes stale.
 *  2. **The verdicts, as a pure function** — depth, roster, per-flow and
 *     whole-run budget, in the order the hook applies them.
 *  3. **The hook as the CLI actually runs it**: a real process, a real
 *     `PreToolUse` payload on stdin, exit 2 and the refusal on stderr. Nothing
 *     in this step imports the module, so a wiring mistake between the pure
 *     rule and the executable fails here.
 *  4. **The ledger accumulates across processes**, which is the whole reason
 *     the budget can be counted at all — hooks are separate processes and share
 *     nothing else.
 */

const hook = fileURLToPath(new URL('../managers/evidence-gated/hooks/guard-budget.mjs', import.meta.url))
const flows = declaredFlows()

/* ── ⑴ the roster comes out of `agents/` ─────────────────────────────────── */

assert.deepEqual(
  flows,
  ['allocate', 'kr-sleeve', 'us-sleeve'],
  'the declared flows are the agent files, and adding one is adding a file rather than editing a list here',
)
const hooksConfig = JSON.parse(
  readFileSync(new URL('../managers/evidence-gated/hooks/hooks.json', import.meta.url), 'utf8'),
)
const registered = hooksConfig.hooks.PreToolUse.flatMap((entry) => entry.hooks.map((row) => row.command))
assert.ok(
  registered.some((command) => command.includes('guard-budget.mjs')),
  'a guard nothing registers is a guard that never runs',
)
assert.ok(
  registered.some((command) => command.includes('guard-submit.mjs')),
  'and the submission guard is still registered beside it',
)

/* ── ⑵ what counts as a dispatch ─────────────────────────────────────────── */

for (const name of ['Agent', 'Task', 'mcp__whatever__Agent']) {
  assert.ok(isDispatch(name), `${name} is a dispatch by any of the names this tool has had`)
}
for (const name of ['Read', 'mcp__aumos__decision_submit', 'mcp__evidence-gated-metrics__calculate']) {
  assert.ok(!isDispatch(name), `${name} is not a dispatch and this guard has nothing to say about it`)
}

/* ── ⑶ the verdicts ──────────────────────────────────────────────────────── */

const judge = (payload, spent = []) => judgeDispatch({ payload, spent, flows })

assert.equal(
  judge({ tool_name: 'Read', tool_input: {} }),
  null,
  'silence on everything that is not a dispatch',
)
assert.equal(
  judge({ tool_name: 'Agent', tool_input: { subagent_type: 'kr-sleeve' } }),
  null,
  'the orchestrator dispatching a declared flow is the shape this package is built out of',
)

const deep = judge({
  tool_name: 'Agent',
  agent_id: 'agt_1',
  agent_type: 'kr-sleeve',
  tool_input: { subagent_type: 'general-purpose' },
})
assert.equal(deep.code, 'delegation_depth_exceeded', `depth ${MAX_DELEGATION_DEPTH} is the declared topology`)
assert.match(deep.message, /kr-sleeve may not dispatch/, 'and the refusal names the caller')
assert.match(deep.message, /researchState/, 'a refusal that does not say what to do instead gets routed around')
assert.match(deep.message, /coverage\/research-index/, 'the checkpoint goes to the key the memory contract already owns')

assert.equal(
  judge({ tool_name: 'Agent', agent_id: 'agt_1', tool_input: { subagent_type: 'kr-sleeve' } }).code,
  'delegation_depth_exceeded',
  '⚠️ depth is judged before the roster: a re-delegation to a *declared* name is still a second tier',
)

const undeclared = judge({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose' } })
assert.equal(undeclared.code, 'delegation_flow_undeclared', '28 of the 29 measured subagents were this')
assert.match(undeclared.message, /allocate, kr-sleeve, us-sleeve/, 'and the message names the roster it read')

assert.equal(
  judge({ tool_name: 'Agent', tool_input: {} }),
  null,
  '⚠️ an unreadable payload is allowed through — a guard that refused an unrecognised shape would take down every run the day the payload gains a field',
)

const perFlow = judge(
  { tool_name: 'Agent', tool_input: { subagent_type: 'us-sleeve' } },
  ['us-sleeve', 'us-sleeve'],
)
assert.equal(perFlow.code, 'delegation_budget_exhausted', `${MAX_DISPATCHES_PER_FLOW} a flow is the stale-sleeve fallback and nothing beyond it`)
assert.equal(
  judge({ tool_name: 'Agent', tool_input: { subagent_type: 'allocate' } }, ['us-sleeve', 'us-sleeve']),
  null,
  'and one flow spending its two does not spend another flow’s',
)

const spentAll = ['kr-sleeve', 'kr-sleeve', 'us-sleeve', 'us-sleeve', 'allocate', 'allocate']
assert.equal(spentAll.length, MAX_DISPATCHES_PER_RUN, 'the whole-run budget is the three flows twice each')
const exhausted = judge({ tool_name: 'Agent', tool_input: { subagent_type: 'kr-sleeve' } }, spentAll)
assert.equal(exhausted.code, 'delegation_budget_exhausted')
assert.match(exhausted.message, /uncertainty/, 'the budget ends a run in a stated WAIT, never in silence')

assert.equal(
  judge({ tool_name: 'Agent', tool_input: { subagent_type: 'allocate' } }, ['kr-sleeve', 'us-sleeve']),
  null,
  'the documented all-three run is reachable, which is the floor under the number',
)

assert.ok(LEDGER_TTL_MS > 4 * 60 * 60 * 1000, 'the ledger outlives the host’s 4-hour ceiling on one run')

/* ── ⑷ the hook as a process, and the ledger between two of them ─────────── */

const session = `verify-${process.pid}-${Date.now()}`
function run(payload, env = {}) {
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ session_id: session, ...payload }),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { status: result.status, stderr: result.stderr }
}

assert.equal(run({ tool_name: 'Read', tool_input: {} }).status, 0, 'a non-dispatch leaves without a word')

const refused = run({
  tool_name: 'Agent',
  agent_id: 'agt_9',
  agent_type: 'us-sleeve',
  tool_input: { subagent_type: 'general-purpose' },
})
assert.equal(refused.status, 2, 'exit 2 is what refuses the call and hands the flow the reason')
assert.match(refused.stderr, /delegation_depth_exceeded/, 'and the code the run must carry is in the message')

// Six allowed dispatches, then the seventh over the same session id.
for (const flow of spentAll) {
  assert.equal(run({ tool_name: 'Agent', tool_input: { subagent_type: flow } }).status, 0, `${flow} is within budget`)
}
const seventh = run({ tool_name: 'Agent', tool_input: { subagent_type: 'kr-sleeve' } })
assert.equal(seventh.status, 2, '⚠️ seven processes, one ledger — the count is what nothing else could carry')
assert.match(seventh.stderr, /delegation_budget_exhausted/)

// A different session starts with its own budget.
const other = spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ session_id: `${session}-other`, tool_name: 'Agent', tool_input: { subagent_type: 'kr-sleeve' } }),
  encoding: 'utf8',
})
assert.equal(other.status, 0, 'the ledger is keyed by session, so one run cannot spend another run’s budget')

// A host that sends no session id keeps depth and the roster and loses the count.
const sessionless = spawnSync(process.execPath, [hook], {
  input: JSON.stringify({ tool_name: 'Agent', agent_id: 'agt_3', tool_input: { subagent_type: 'kr-sleeve' } }),
  encoding: 'utf8',
})
assert.equal(sessionless.status, 2, 'depth does not need a ledger')

console.log(
  `evidence-gated delegation budget: depth ${MAX_DELEGATION_DEPTH}, flows [${flows.join(', ')}], ` +
    `${MAX_DISPATCHES_PER_FLOW} per flow and ${MAX_DISPATCHES_PER_RUN} per run — enforced by the hook the CLI runs`,
)
