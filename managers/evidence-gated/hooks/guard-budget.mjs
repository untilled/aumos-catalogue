#!/usr/bin/env node
/**
 * Bounds how much of a run may be spent delegating.
 *
 * ── What this is for, measured ────────────────────────────────────────────
 *
 * `guard-submit.mjs` limits *who may submit*. Nothing limited *how much may be
 * dispatched*, and on 2026-09-07 one run of this package opened **29 unique
 * subagents** — one `kr-sleeve` and **28 `general-purpose` workers** the package
 * declares nowhere — three tiers deep:
 *
 *     orchestrator → kr-sleeve → KR mechanical sweep → batch workers ×13
 *                              → DART registry harvest → page workers ×4
 *                              → KR filings → batch workers ×7
 *
 * 313 model responses, 166 `calculate` calls, ~1.91M characters of tool
 * arguments — bar arrays a model had re-typed so another model could hand them
 * back. **And no `DecisionProposal` was submitted.** The subscription was spent
 * before the methodology was reached (`untilled/aumos-catalogue#209`).
 *
 * Nothing in this package asked for any of that. `agents/` holds three files,
 * `PROMPT.md` §Orchestration names three flows, and `skills/orchestrate/SKILL.md`
 * says *"nothing here fans out"*. The topology was stated and unenforced, and a
 * stated-but-unenforced rule is the shape every other guard in this directory
 * exists to close.
 *
 * ── The three limits, and where each number comes from ────────────────────
 *
 * ⑴ **Depth 1.** The package declares exactly one tier: the orchestrator
 *    dispatches a flow and the flow answers. There is no second tier to
 *    declare a budget for, so a dispatch made *from inside a flow* is
 *    undeclared work by construction and is refused rather than counted.
 *
 * ⑵ **The declared flows and nothing else** — read out of `agents/`, so there
 *    is no second roster here to fall out of step with the first. 28 of the 29
 *    observed subagents were `general-purpose`; a worker with no agent file has
 *    no skill, no market and no rule about what it may not do.
 *
 * ⑶ **6 dispatches a run, and 2 per flow.** The per-flow 2 is the one reason
 *    this package documents for dispatching a flow twice in one run —
 *    `skills/orchestrate/SKILL.md` §"`allocate` has one fallback": a sleeve
 *    whose Brief conclusion is older than that market's close is dispatched
 *    first, and `allocate` follows. 6 is that over the three declared flows.
 *    ⚠️ **The floor is the package and the ceiling is the measurement**: a
 *    manual run dispatches all three, so nothing below 3 is compatible with
 *    what `PROMPT.md` asks for; 29 is what happened without a ceiling. Between
 *    those two, 6 is a judgement — the smallest number that leaves every
 *    documented dispatch reachable.
 *
 * ── A refusal is spoken, never silent ─────────────────────────────────────
 *
 * Exit 2 refuses the call and hands the flow the message on stderr, the same
 * mechanism `guard-submit.mjs` measured. That matters more here than there: a
 * capability that fails **quietly** is what a model routes around, and the run
 * above is the evidence — the OpenDART registry ZIP failed to decode, nothing
 * said so in terms the run could act on, and it invented a page-walking
 * workaround staffed by four more workers. So each refusal names a code to
 * carry verbatim into `uncertainty` and says what to do instead.
 *
 * ⛔ **The codes here are the hook's and are not in `lib/diagnostic-codes.mjs`.**
 * That registry is `mandateExecution`'s cause vocabulary, one row per code
 * naming the `lib/` module that emits it (#171), and no module emits these —
 * registering them would be exactly the unemittable spelling that check exists
 * to refuse.
 *
 * ── Read defensively, like its neighbour ──────────────────────────────────
 *
 * ⚠️ It is a vendor payload. Anything this cannot parse is allowed through: a
 * guard that refused on a shape it did not recognise would take down every run
 * the day the payload gains a field.
 *
 * ⛔ **No `matcher` in `hooks.json`, deliberately.** A matcher that stopped
 * matching would disable this silently, which is the failure mode it is here to
 * prevent; the cost is a process per tool call, and the first thing it does is
 * decide it has nothing to say.
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** ⑶ — see the derivation above. */
export const MAX_DISPATCHES_PER_RUN = 6
export const MAX_DISPATCHES_PER_FLOW = 2
/** ⑴ — the orchestrator dispatches; a flow answers. */
export const MAX_DELEGATION_DEPTH = 1

/**
 * How long a session's ledger is believed.
 *
 * A resumed run reuses its session id (`--resume <uuid>`), so without a window
 * the second judgement of a resumed conversation would start with the first
 * one's budget already spent. 12 hours is above the host's 4-hour ceiling on an
 * interactive run and far below the gap between two scheduled wakes.
 */
export const LEDGER_TTL_MS = 12 * 60 * 60 * 1000

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The declared flows, read from `agents/` rather than listed here.
 *
 * The name is the file's stem, which is what `subagent_type` takes and what
 * `agents/<name>.md` declares in its own front matter. Reading the directory is
 * what keeps this from becoming a second roster.
 */
export function declaredFlows(root = packageRoot) {
  try {
    return readdirSync(join(root, 'agents'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3))
      .sort()
  } catch {
    return []
  }
}

/** `Agent`, `Task`, and whatever either is called behind an `mcp__` prefix. */
export function isDispatch(toolName) {
  const bare = toolName.startsWith('mcp__') ? (toolName.split('__').pop() ?? '') : toolName
  return bare.toLowerCase() === 'agent' || bare.toLowerCase() === 'task'
}

/**
 * The verdict, as a pure function of the payload and what this session has
 * already spent. `null` is «say nothing».
 *
 * ⚠️ The order is the point: depth first, then the roster, then the budget. A
 * re-delegation to `general-purpose` is refused for being a re-delegation, and
 * the message says so — telling it instead that the roster is closed invites it
 * to retry the same tier with a declared name.
 */
export function judgeDispatch({ payload, spent = [], flows }) {
  const tool = typeof payload?.tool_name === 'string' ? payload.tool_name : ''
  if (!isDispatch(tool)) return null

  const caller = typeof payload?.agent_type === 'string' && payload.agent_type !== ''
    ? payload.agent_type
    : typeof payload?.agent_id === 'string' && payload.agent_id !== ''
      ? payload.agent_id
      : null

  // The lead's calls carry no agent id at all; a flow's carry one. Same
  // discriminator `guard-submit.mjs` measured (claude 2.1.247, 2026-08-27).
  if (caller !== null) {
    return {
      code: 'delegation_depth_exceeded',
      message:
        `${caller} may not dispatch a subagent. This manager declares one tier — the orchestrator ` +
        `dispatches a flow and the flow answers — so re-delegation is work no part of this package ` +
        `asked for, and the run that measured this opened 29 subagents and submitted no judgement. ` +
        'Do the sweep in your own context: the arithmetic is ' +
        '`mcp__evidence-gated-metrics__calculate`, which takes one call per operation and needs no ' +
        'worker to relay bars or walk pages. If it does not fit in this turn, stop where you are ' +
        'and hand back a checkpoint: persist what you did review with `researchState` to ' +
        '`coverage/research-index`, and return the unreviewed names and this code in your ' +
        '`uncertainty` so the WAIT says the data was not prepared rather than that nothing qualified.',
    }
  }

  const requested = typeof payload?.tool_input?.subagent_type === 'string'
    ? payload.tool_input.subagent_type
    : ''
  // An unreadable shape is allowed through, per the doctrine above.
  if (requested === '') return null

  if (!flows.includes(requested)) {
    return {
      code: 'delegation_flow_undeclared',
      message:
        `\`${requested}\` is not a flow this manager declares. The roster is ${flows.join(', ')} — ` +
        'one agent file each, each naming the skill that carries its rules. A worker outside it has ' +
        'no skill, no market and no rule about what it may not do, and 28 of the 29 subagents in the ' +
        'run that measured this were exactly that. Dispatch a declared flow, or do the work here.',
    }
  }

  const forThisFlow = spent.filter((row) => row === requested).length
  if (forThisFlow >= MAX_DISPATCHES_PER_FLOW) {
    return {
      code: 'delegation_budget_exhausted',
      message:
        `\`${requested}\` has already been dispatched ${forThisFlow} times in this run, which is the ` +
        'ceiling. The one reason this package documents for dispatching a flow twice is the stale-sleeve ' +
        'fallback in `skills/orchestrate/SKILL.md`; a third is a loop. Assemble the proposal from what ' +
        'it returned, and carry this code and what is still unreviewed in `uncertainty`.',
    }
  }

  if (spent.length >= MAX_DISPATCHES_PER_RUN) {
    return {
      code: 'delegation_budget_exhausted',
      message:
        `This run has dispatched ${spent.length} flows, which is its whole budget ` +
        `(${MAX_DISPATCHES_PER_RUN} = the three declared flows, twice each). Stop dispatching and ` +
        'close the run: persist the roster you did review with `researchState` to ' +
        '`coverage/research-index`, name the unreviewed scope and this code in `uncertainty`, and ' +
        'submit — a `WAIT` that says the data was not prepared is a different answer from one that ' +
        'says nothing qualified, and invariant 5 asks you to tell them apart.',
    }
  }

  return null
}

/** One line per allowed dispatch. Appends under `PIPE_BUF` are atomic, so two
 *  concurrent dispatches cannot lose each other's row — which a read-modify-write
 *  counter would, in the direction that lets the budget be overspent. */
function ledgerPath(sessionId) {
  return join(tmpdir(), `evidence-gated-dispatch-${sessionId.replace(/[^A-Za-z0-9_-]/g, '')}.log`)
}

function readLedger(path) {
  try {
    if (Date.now() - statSync(path).mtimeMs > LEDGER_TTL_MS) return []
    return readFileSync(path, 'utf8').split('\n').filter((line) => line !== '')
  } catch {
    return []
  }
}

function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    raw += chunk
  })
  process.stdin.on('end', () => {
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      process.exit(0)
    }
    if (!isDispatch(typeof payload?.tool_name === 'string' ? payload.tool_name : '')) process.exit(0)

    const session = typeof payload?.session_id === 'string' && payload.session_id !== ''
      ? payload.session_id
      : null
    // No session to key a ledger by: depth and the roster still answer, and the
    // count does not. Refusing here would refuse every dispatch on a host that
    // does not send the field.
    const path = session === null ? null : ledgerPath(session)
    const spent = path === null ? [] : readLedger(path)
    const verdict = judgeDispatch({ payload, spent, flows: declaredFlows() })

    if (verdict !== null) {
      process.stderr.write(`${verdict.message}\nCarry \`${verdict.code}\` verbatim in one \`uncertainty\` entry.\n`)
      process.exit(2)
    }

    if (path !== null) {
      try {
        appendFileSync(path, `${payload?.tool_input?.subagent_type ?? ''}\n`)
      } catch {
        /* An unwritable tmpdir loses the count and keeps depth and the roster. */
      }
    }
    process.exit(0)
  })
}

// Importable for the checker, executable for the CLI. `process.stdin` is not
// touched on import, so reading this file costs nothing.
if (process.argv[1] === fileURLToPath(import.meta.url)) main()
