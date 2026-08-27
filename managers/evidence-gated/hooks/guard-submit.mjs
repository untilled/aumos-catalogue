#!/usr/bin/env node
/**
 * Refuses `decision_submit` from anything but the orchestrator.
 *
 * ── Why a hook and not a sentence in a prompt ──────────────────────────────
 *
 * A run seals one judgement, and the gateway refuses the second submission of
 * one run. So a flow that reaches for `decision_submit` does not merely break a
 * convention — it seals a judgement the other flows never saw, and takes the
 * orchestrator's own submission down with it. The prompt and all four skills say
 * not to; this is what makes saying it enough.
 *
 * ── The discriminator, measured ───────────────────────────────────────────
 *
 * `PreToolUse` carries `agent_id` and `agent_type` when a **subagent** makes the
 * call, and omits both keys entirely when the lead does (claude 2.1.247,
 * 2026-08-27). So the absence of `agent_id` *is* the orchestrator. An exit code
 * of 2 refuses the call and hands the flow the message on stderr.
 *
 * ⚠️ **It is a vendor payload, so it is read defensively.** Anything this cannot
 * parse is allowed through: a guard that refused on a shape it did not
 * recognise would take down every run the day the payload gains a field.
 */
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
  const tool = typeof payload?.tool_name === 'string' ? payload.tool_name : ''
  const bare = tool.startsWith('mcp__') ? (tool.split('__').pop() ?? '') : tool
  if (bare !== 'decision_submit') process.exit(0)
  // The lead's calls carry no agent id at all; a flow's carry one.
  const agent = payload?.agent_id
  if (typeof agent !== 'string' || agent === '') process.exit(0)
  const role = typeof payload?.agent_type === 'string' && payload.agent_type !== ''
    ? payload.agent_type
    : agent
  process.stderr.write(
    `${role} may not submit a decision. Return your targets and Evidence ids to the ` +
      'orchestrator, which assembles all three flows and submits once for the run.\n',
  )
  process.exit(2)
})
