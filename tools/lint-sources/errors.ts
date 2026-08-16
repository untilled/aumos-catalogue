/**
 * Every way a specification can be refused, as a closed set.
 *
 * Refusals happen at **load**, not at call time, for `assertAsOfCapable`'s
 * reason one level up: a source that will fail is better refused before it is
 * registered than caught by whoever happens to call it first. The codes are
 * what the tests assert on — a refusal recognisable only by reading English
 * prose is not a control anyone can check (`errors.ts` in `skill-gateway`).
 */
export type SourceSpecErrorCode =
  /** The document is not a `SourceSpec/1` at all. Carries the schema issues. */
  | 'not-a-source-spec'
  /** A URL names a host the specification did not declare. */
  | 'host-not-declared'
  /**
   * A declared host, or a URL, that no specification may reach: a non-`https`
   * scheme, a loopback or link-local address, a private range, or credentials
   * in the authority.
   */
  | 'unsafe-host'
  /** A `{placeholder}` sits in the authority, where it could move the host. */
  | 'templated-authority'
  /** A name referenced before anything defines it — a request, or a binding. */
  | 'unresolved-reference'
  /** The `fidelity` claimed is not one the rest of the document can support. */
  | 'fidelity-unsupported'
  /** A credential the specification requires, with no value and no default. */
  | 'credential-missing'

export class SourceSpecError extends Error {
  readonly code: SourceSpecErrorCode
  readonly detail: Readonly<Record<string, unknown>>

  constructor(code: SourceSpecErrorCode, message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'SourceSpecError'
    this.code = code
    this.detail = detail
  }
}

export function isSourceSpecError(error: unknown): error is SourceSpecError {
  return error instanceof SourceSpecError
}
