/**
 * ── The registry, projected from the one definition (issue #212 ③) ─────────
 *
 * This file used to hold the `operations` map: 107 names, each beside the
 * adapter that calls its leaf function, and each written again in
 * `input-contracts.mjs` for its shape and again in
 * `skills/deterministic-metrics` for its sentence. The map is now a projection
 * of `OPERATIONS`, so a registered operation that nothing documents, or a
 * documented operation nothing registers, is not a state this package can be in.
 *
 * ⛔ **What `operation_unknown` lists changed, and only that.** It names the
 * published operations — the task-unit surface — and says how many others are
 * steps of those and what returns them instead. Every internal operation still
 * runs when it is called by name; `execute` reads `OPERATIONS`, which holds all
 * of them.
 */
import { result, diagnostic } from './diagnostics.mjs'
import { canonicalizeInput, validateInput } from './input-contracts.mjs'
import { OPERATIONS, PUBLISHED_OPERATIONS, INTERNAL_OPERATIONS, SUBSUMED_BY } from './operations.mjs'

const operations = Object.fromEntries(Object.entries(OPERATIONS).map(([name, row]) => [name, row.run]))

export function execute(request) {
  const diagnostics = []
  const operation = request?.operation
  const asOf = request?.asOf
  if (typeof operation !== 'string' || !Object.hasOwn(operations, operation)) {
    /**
     * ⚠️ **The list is the task-unit surface, and the rest is summarised rather
     * than hidden** (#212 ③). `supported` was every registered name, eight of
     * which are steps of other entries — a menu that invites a run to assemble
     * a calculation this package already assembles. `internal` says how many
     * there are and `subsumedBy` says what returns each of their answers, so a
     * run that reaches for one is told where the answer already is instead of
     * being told the name does not exist. ⛔ They all still run.
     */
    diagnostics.push(diagnostic('operation_unknown', 'blocked', 'A supported operation is required', 'operation', {
      supported: PUBLISHED_OPERATIONS,
      internal: INTERNAL_OPERATIONS.length,
      subsumedBy: SUBSUMED_BY,
    }))
    return result(operation ?? null, asOf ?? null, null, diagnostics)
  }
  if (typeof asOf !== 'string' || !Number.isFinite(Date.parse(asOf))) {
    diagnostics.push(diagnostic('as_of_invalid', 'blocked', 'A valid asOf instant is required', 'asOf'))
    return result(operation, asOf ?? null, null, diagnostics)
  }
  try {
    /**
     * ⚠️ A refused shape returns no data; a **reported** one still answers.
     * `input_key_unread` says which part of the call was not read (#158) and
     * the answer it did compute is still the answer — withholding it would
     * turn a published contract into a stricter gate than the operation is.
     */
    /**
     * ⚠️ **Canonicalization runs first, and it is a conversion rather than a
     * gate** (#212 ⑥). The five representations this package used to detect
     * inside whichever function needed them — a MIC for a sleeve, a `Money` for
     * an amount, cash rows for a per-currency object, an aliased trigger, a
     * wrapped memory value — become the internal spelling here, once, so no leaf
     * carries a branch for the second one. ⛔ A value in no recognised shape is
     * handed on untouched, so `validateInput` and the leaf's own gate refuse it
     * exactly as they did.
     */
    const canonical = canonicalizeInput(operation, request.input ?? {})
    diagnostics.push(...canonical.diagnostics)
    const shapeDiagnostics = validateInput(operation, canonical.input, asOf)
    if (shapeDiagnostics.some((row) => row.severity === 'blocked')) return result(operation, asOf, null, [...diagnostics, ...shapeDiagnostics])
    diagnostics.push(...shapeDiagnostics)
    const output = operations[operation](canonical.input, asOf)
    // A rejected calculation must never offer a replacement for durable memory.
    if (output?.data?.nextState && output.diagnostics?.some((row) => row.severity === 'blocked')) output.data.nextState = null
    return result(operation, asOf, output?.data ?? null, [...diagnostics, ...(output?.diagnostics ?? [])])
  } catch (error) {
    diagnostics.push(diagnostic('operation_failed', 'blocked', 'Deterministic operation failed', 'input', { name: error?.name, message: error?.message }))
    return result(operation, asOf, null, diagnostics)
  }
}
