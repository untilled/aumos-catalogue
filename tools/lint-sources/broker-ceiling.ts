/**
 * At a broker, a document **selects**; it does not declare. (#232, #486)
 *
 * ── Why this rule is here and its table is not ─────────────────────────────
 *
 * A broker credential reads *and* trades with one key, so which paths Aumos will
 * sign at a broker's own API is decided in code — `skill-gateway`'s
 * `adapters/registry.ts`. A document may pick a subset of that decision and
 * nothing else. `spec/relay.ts` enforces it at install and at run.
 *
 * ⚠️ **The rule and the table are separated on purpose.** `adapters/` is the
 * only place in this workspace where a vendor's name appears, and that stays
 * true: this file names no vendor and no host. It takes the ceiling as an
 * argument, which is what lets the same rule run in three places — the
 * interpreter, the catalogue generator, and a public repository's linter that
 * has none of this workspace.
 *
 * ⛔ **That third reader is why this exists.** Until #486 the ceiling was the one
 * rule `catalogue-tools/lint-sources/` could not run, and `VENDORED.md` said so:
 * *"그 검사는 발행되지 않는 Aumos의 커넥터 표를 읽으므로 머지와 설치에서 돈다"*. So a
 * submission relaying a broker was greeted by a green tick and refused later.
 *
 * ✅ **Publishing the table gives nothing away that was withheld.** The refusal
 * `relay.ts` already throws prints the allowed paths to whoever tripped it, so
 * the list reaches any submitter who tries. What it is *not* is a control: the
 * ceiling is enforced by code on the investor's machine, and a linter knowing it
 * only moves the sentence earlier.
 */

import { SourceSpecError } from './errors.ts'

/** One route Aumos will sign at a broker's host. */
export interface BrokerRoute {
  readonly path: string
  readonly query: readonly string[]
}

/**
 * What a broker's hosts are and what may be asked at them.
 *
 * Generated from `skill-gateway/src/adapters/registry.ts` rather than written —
 * `broker-ceiling.json`, and `broker-ceiling.test.ts` over there fails the build
 * when the two disagree. A hand-kept second copy of a security boundary is the
 * one thing this arrangement must not become.
 */
export interface BrokerCeiling {
  /** Hostname (lowercase) → the routes signed there. A host absent is not a broker's. */
  readonly routes: Readonly<Record<string, readonly BrokerRoute[]>>
}

/** Whether a host is one a broker's **orders** can be placed at. */
export function isBrokerHostIn(ceiling: BrokerCeiling, host: string): boolean {
  return Object.hasOwn(ceiling.routes, host.toLowerCase())
}

/**
 * Refuses a document that declares something at a broker we do not sign.
 *
 * Throws like `assertCoherent` rather than returning a list, because the two are
 * one refusal from a reader's side and a caller that had to remember to check a
 * return value is a caller that will one day forget.
 */
export function assertUnderBrokerCeiling(
  spec: {
    readonly id: string
    readonly endpoints: readonly {
      readonly host: string
      readonly path: string
      readonly query?: readonly string[]
    }[]
  },
  ceiling: BrokerCeiling,
): void {
  for (const declared of spec.endpoints) {
    const allowed = ceiling.routes[declared.host.toLowerCase()]
    if (allowed === undefined) continue

    // Compared by **exact path**, never by the `{symbol}` matcher: what is being
    // checked is whether the declaration is one we already made, and a pattern
    // that merely matches one of ours is a different declaration wearing its
    // shape.
    const ours = allowed.find((route) => route.path === declared.path)
    if (ours === undefined) {
      throw new SourceSpecError(
        'unsafe-host',
        `${spec.id} declares "${declared.path}" on "${declared.host}", which is a broker's own ` +
          'API. That credential reads and trades with one key, so which paths Aumos will sign ' +
          `there is decided in code: ${allowed.map((route) => route.path).join(', ') || 'none'}.`,
        { source: spec.id, host: declared.host, path: declared.path },
      )
    }

    const extra = (declared.query ?? []).filter((name) => !ours.query.includes(name))
    if (extra.length > 0) {
      // The half of an allowlist that is easy to forget, one level up from
      // where `source_request` catches it: a path we vetted with an unvetted
      // parameter on it is a path whose behaviour we have not actually pinned.
      throw new SourceSpecError(
        'unsafe-host',
        `${spec.id} adds ${extra.join(', ')} to "${declared.path}", which Aumos signs with ` +
          `${ours.query.join(', ') || 'no parameters'}. A document may take fewer than the ` +
          'code allows at a broker, never more.',
        { source: spec.id, host: declared.host, path: declared.path, refused: extra },
      )
    }
  }
}
