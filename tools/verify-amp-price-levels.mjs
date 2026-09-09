/**
 * ── Do these proposals actually parse as AMP? (aumos#756) ──────────────────
 *
 *   AUMOS_AMP_SCHEMA=…/packages/amp/schema/decision-proposal.schema.json \
 *     node tools/verify-amp-price-levels.mjs
 *
 * `check:allocator` already runs every `fixtures/amp-decision-proposals.json`
 * case through this package's own copy of the host's price-level rules — the
 * four defects and the five link problems. That is the strongest thing this
 * repository can say **offline**, and it is not the same claim as *«the wire
 * accepts these bytes»*: a copy of a rule is a copy, and the schema carries
 * things no copy of ours does (`instantSchema`'s pattern, `additionalProperties:
 * false` at six depths, `minorUnits`' integer bounds).
 *
 * So this validates the fixtures against the **generated** schema — the same
 * document `aumos.app/docs/schema/decision-proposal.schema.json` serves and the
 * same one `decision_submit` derives its published `inputSchema` from.
 *
 * ── Why it is an operator step and not a CI step ───────────────────────────
 *
 * The schema is produced by a private repository, and a pull request from a
 * fork is given no secrets — the same constraint that made `tools/lint/` a
 * vendored copy. The two ways out were both worse than a named gap: vendoring
 * the schema adds a second copy of a 45KB generated document that goes stale
 * silently and is *already* covered by the host's own byte-comparison tests, and
 * fetching it at CI time makes every submission's result depend on a network
 * round trip. `tools/legacy-parity.mjs --freeze` sits in exactly this position
 * for the same reason, and `.github/workflows/lint.yml` says so where the two
 * lints are compared.
 *
 * ⚠️ **It reports what it could not establish.** With no `AUMOS_AMP_SCHEMA` it
 * prints the gap and exits 0 rather than passing quietly — a check that cannot
 * run must not look like one that ran.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
/**
 * ⚠️ `ajv/dist/2020.js`, not ajv's default entry point — the generated schema
 * declares draft 2020-12 and stock ajv is draft-07 and refuses it. Same import
 * and same reason as `tools/lint-sources/main.ts`.
 */
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { execute } from '../managers/evidence-gated/lib/index.mjs'

const fixture = new URL('../managers/evidence-gated/fixtures/amp-decision-proposals.json', import.meta.url)
const proposals = JSON.parse(await readFile(fixture, 'utf8'))
const schemaPath = process.env.AUMOS_AMP_SCHEMA

if (!schemaPath) {
  console.log('--  AUMOS_AMP_SCHEMA is unset, so no proposal was validated against the wire schema.')
  console.log('    Point it at packages/amp/schema/decision-proposal.schema.json in an untilled/aumos checkout.')
  console.log(`    ${proposals.cases.length} case(s) were left unvalidated; check:allocator judged them by this package's own copy of the rules.`)
  process.exit(0)
}

const schema = JSON.parse(await readFile(schemaPath, 'utf8'))
assert.equal(
  schema.$id,
  'https://aumos.app/spec/amp/1/decision-proposal.schema.json',
  'the document handed over is AMP/1\'s DecisionProposal schema and not another one',
)
/**
 * ⚠️ The field has to be **in** the schema, or every assertion below passes for
 * the wrong reason: an older schema is a strict object that would refuse
 * `priceLevels`, and `ajv` with `strictSchema` off would happily validate the
 * rest of a proposal whose new field it never looked at.
 */
assert.ok(schema.properties?.priceLevels, 'this schema declares priceLevels — an older one refuses the field outright')
assert.deepEqual(
  schema.properties.priceLevels.items.properties.purpose.enum,
  ['entry', 'stop', 'take-profit'],
  'and the three purposes are the three this package builds',
)

/** `strict: false`: the schema is generated from zod and carries annotations ajv warns about. */
const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validate = ajv.compile(schema)

let stated = 0
for (const fixtureCase of proposals.cases) {
  const ok = validate(fixtureCase.proposal)
  assert.ok(
    ok,
    `${fixtureCase.name} is a valid AMP DecisionProposal:\n${(validate.errors ?? []).map((error) => `  ${error.instancePath || '/'} ${error.message}`).join('\n')}`,
  )
  if (fixtureCase.proposal.priceLevels !== undefined) stated += 1
}

/**
 * ── The bytes the operations actually produce, not only the ones we typed ───
 *
 * ⚠️ **A fixture is what an author believed and an operation is what the code
 * does.** The two cases above were written by hand, so validating them says the
 * *fixture* is valid AMP — and #756's completion criterion is about the real
 * assembly path. So the proposal below is built from `exitDiscipline`'s and
 * `entryTranchePlan`'s own returned rows, folded by `priceLevels`, and put
 * through the same validator. Nothing here is retyped.
 */
const asOf = '2026-09-08T00:00:00Z'
const asset = { class: 'equity', symbol: '035420', market: 'XKRX' }
const stop = execute({
  operation: 'exitDiscipline',
  asOf,
  input: { symbol: '035420', asset, lane: 'control-arm', entryDate: '2026-08-25', entryPrice: 180_000, price: 179_000, entryProposed: true, registration: { stopPct: 0.08, reviewBy: '2026-10-20' } },
})
assert.equal(stop.status, 'ok', `the entry registers its discipline: ${JSON.stringify(stop.diagnostics)}`)
const ladder = execute({
  operation: 'entryTranchePlan',
  asOf,
  input: {
    symbol: '035420',
    asset,
    lens: 'mean-reversion',
    maturity: 'observing',
    price: 180_000,
    plannedTotalWeight: 0.03,
    execution: { portfolioNav: 30_000_000, portfolioNavCurrency: 'KRW', positionCurrency: 'KRW', lotSize: 1 },
    tranches: [
      { label: 'T1', weight: 0.01, condition: { kind: 'immediate' }, filled: true },
      { label: 'T2', weight: 0.01, condition: { kind: 'price-below', threshold: 170_000 }, expiresAt: '2026-11-01T00:00:00Z' },
      { label: 'T3', weight: 0.01, condition: { kind: 'price-below', threshold: 160_000 }, expiresAt: '2026-11-01T00:00:00Z' },
    ],
  },
})
assert.equal(ladder.status, 'ok', `the ladder is a plan: ${JSON.stringify(ladder.diagnostics)}`)

/**
 * The one translation the run owns: this package writes a watch flat and AMP
 * nests it. ⚠️ The `key` and the `Money` are **not** rewritten here — they come
 * off `watchesToRegister` as `exitDiscipline` built them, which is the property
 * that makes `armed-price-mismatch` unreachable.
 */
const watches = stop.data.watchesToRegister.map((row) => ({
  ...(row.key ? { key: row.key } : {}),
  subject: { ...asset, currency: 'KRW' },
  intent: row.reason === 'exit-discipline-hard-stop' ? 'Exit on the registered stop.' : 'Close on the time stop.',
  trigger: row.kind === 'price-below'
    ? { kind: 'price-below', asset: row.asset, price: row.price }
    : { kind: 'at-time', at: `${row.at}T00:00:00Z` },
  ...(row.expiresAt ? { expiresAt: `${row.expiresAt}T00:00:00Z` } : {}),
}))
const folded = execute({
  operation: 'priceLevels',
  asOf,
  input: { levels: [...stop.data.priceLevelsToRegister, ...ladder.data.priceLevelsToRegister], watches },
})
assert.equal(folded.status, 'ok', `the standing set folds clean: ${JSON.stringify(folded.diagnostics)}`)

const assembled = {
  action: 'BUY',
  subject: { ...asset, currency: 'KRW' },
  thesisRefs: ['thesis-1@1'],
  rationale: {
    conclusion: 'Open the first rung of the ladder and register how it closes.',
    keyReasons: ['The lens fired and the entry gates cleared.'],
    risks: ['The range may be crossed on a gap.'],
  },
  target: { type: 'position-weight', asset: { ...asset, currency: 'KRW' }, targetWeight: 0.01 },
  watches,
  priceLevels: folded.data.priceLevels,
}
assert.ok(
  validate(assembled),
  `a proposal assembled from the operations' own rows is valid AMP:\n${(validate.errors ?? []).map((error) => `  ${error.instancePath || '/'} ${error.message}`).join('\n')}`,
)
assert.deepEqual(
  assembled.priceLevels.map((row) => `${row.purpose}:${row.price.kind}`),
  ['stop:point', 'entry:point', 'entry:point'],
  'the stop the discipline derived and one entry per priced rung — the two numbers #756 says had nowhere to go',
)
const stopLevel = assembled.priceLevels.find((row) => row.purpose === 'stop')
const stopWatch = assembled.watches.find((row) => row.trigger.kind === 'price-below')
assert.equal(stopLevel.armedKey, stopWatch.key, 'and the link the host checks is the one the operation minted')
assert.deepEqual(stopLevel.price.value, stopWatch.trigger.price)

/**
 * ⛔ And the negative case, because a validator that accepts everything accepts
 * these too. The schema is strict at every depth, so an invented field on a
 * level is refused — which is the whole reason a manager cannot bolt
 * `stopLoss` onto a proposal for itself and why #756 needed a wire change.
 */
const [withLevels] = proposals.cases.filter((row) => (row.proposal.priceLevels ?? []).length > 0)
assert.ok(withLevels, 'one fixture states levels, or the refusal below proves nothing')
const invented = structuredClone(withLevels.proposal)
invented.priceLevels[0].stopLoss = 8500
assert.equal(validate(invented), false, 'a field this package invented on a level is refused rather than stripped')
const quantified = structuredClone(withLevels.proposal)
quantified.priceLevels[0].quantity = 10
assert.equal(validate(quantified), false, 'and there is nowhere on a level to put the other half of an order')

console.log(`ok  ${proposals.cases.length + 1} proposal(s) validate against ${schema.$id} — ${stated} fixtures stating priceLevels, plus one assembled from the operations' own rows`)
