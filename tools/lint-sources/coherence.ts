import { SourceSpecError } from './errors.ts'
import {
  assertDeclarableHost,
  assertSafeUrlTemplate,
  isLoopbackHost,
  placeholdersIn,
} from './hosts.ts'

/**
 * The half of reading a document that is **not** the schema. (#232 D)
 *
 * ── Why this is its own file, and why it takes a structural type ───────────
 *
 * `parseSourceSpec` has always been two passes answering different questions:
 * the schema asks *is this the format* — a closed vocabulary, no unknown keys,
 * no field that could hold code — and this asks *is this document coherent with
 * itself*: does every name it uses exist, does every URL go where it says, is
 * the `local` bargain kept. Neither is expressible as the other.
 *
 * Splitting them is what lets the **catalogue repository's CI be equal to the
 * merge** rather than weaker than it. That repository is public and this one is
 * private, so a fork's pull request can import nothing from this workspace; the
 * manager half solved it by vendoring readable source, and paid a stated price —
 * *a stale copy can pass a submission the merge will refuse*. Here the price is
 * smaller than it looks, because the schema half travels as a **generated JSON
 * Schema** read by stock ajv, and this half has no dependency to strand: it
 * imports `./errors.js` and `./hosts.js`, and those import nothing at all.
 *
 * Hence the structural parameter. `SourceSpec` is inferred from a zod schema,
 * and a `import type` of it would leave the vendored copy naming a file that is
 * not beside it — stripped at runtime, and a dangling reference to whoever
 * reads it. `CoherentDocument` names exactly the fields this function reads and
 * nothing else, so the copy is self-contained the way `@aumos/package-lint` is,
 * and `parse.ts` passes its parsed value straight in.
 *
 * ⚠️ **What this does not check** is the broker ceiling — that a document may
 * not declare a relay on a host `CONNECTOR_IDS` names. That check reads the
 * broker table and cannot live in this package, so it is the one rule the
 * catalogue's CI genuinely cannot run. `spec.ts` says where it does live.
 */

export interface CoherentDocument {
  readonly id: string
  readonly local?: boolean | undefined
  readonly hosts: readonly string[]
  readonly credentials: readonly {
    readonly name: string
    readonly required?: boolean
    readonly header?: string
    readonly inject?: { readonly location: 'header' | 'query'; readonly name: string }
  }[]
  readonly auth?:
    | {
        readonly tokenUrl: string
        readonly clientId: string
        readonly clientSecret: string
      }
    | undefined
  readonly endpoints: readonly {
    readonly host: string
    readonly path: string
    readonly query?: readonly string[]
  }[]
}

export function assertCoherent(spec: CoherentDocument): void {
  const local = spec.local === true

  // A query credential is not manager input. Keeping its name out of every
  // endpoint allowlist means the public tool contract never advertises a slot
  // in which a manager could place the secret (or a value that shadows it).
  const protectedQueryNames = new Set<string>()
  for (const credential of spec.credentials) {
    if (credential.inject?.location !== 'query') continue
    const parameter = credential.inject.name
    if (protectedQueryNames.has(parameter)) {
      throw new SourceSpecError(
        'unresolved-reference',
        `${spec.id} injects more than one credential into the protected query parameter "${parameter}". One outbound parameter can have one owner.`,
        { id: spec.id, parameter },
      )
    }
    protectedQueryNames.add(parameter)
  }

  for (const host of spec.hosts) assertDeclarableHost(host, `hosts[] of ${spec.id}`, local)

  // ── The `local` bargain, checked where the document is read ───────────────
  //
  // `spec.ts` argues the reversal; these are the two halves that make it
  // affordable, and they are here rather than in the schema because each is a
  // relation between fields rather than a shape.
  if (local) {
    if (spec.credentials.length > 0) {
      throw new SourceSpecError(
        'unsafe-host',
        `${spec.id} is local and declares credentials. A local document may reach this machine, so a credential in it is a key pointed at whatever else is listening here — which is the theft the host rules exist to refuse. A local source holds no key: the program it talks to holds its own.`,
        { id: spec.id, credentials: spec.credentials.map((entry) => entry.name) },
      )
    }
    const outward = spec.hosts.filter((host) => !isLoopbackHost(host))
    if (outward.length > 0) {
      throw new SourceSpecError(
        'unsafe-host',
        `${spec.id} is local and also declares ${outward.join(', ')}. A document is local or public and never a bridge between them, because a bridge is how something read from this machine reaches the internet.`,
        { id: spec.id, hosts: outward },
      )
    }
  } else {
    // A public document that names a loopback host is refused by
    // `assertDeclarableHost` above; this catches the inverse mistake, where an
    // author writes loopback URLs and forgets the flag. Refusing by the same
    // name keeps one answer to "why was my host rejected".
    for (const host of spec.hosts) {
      if (isLoopbackHost(host)) {
        throw new SourceSpecError(
          'unsafe-host',
          `${spec.id} names the loopback host "${host}" without declaring "local": true.`,
          { id: spec.id, host },
        )
      }
    }
  }

  // ── The session, if the vendor issues one (#232 slice 2) ──────────────────
  //
  // Three relations between fields, which is why they are here and not in the
  // schema. The third is the one that matters most and is the least obvious:
  // the credentials the token endpoint is given must be **required**, because
  // the whole document is unreachable without them — an optional client secret
  // is a source that stands up and then fails every request with a 401, which
  // reads on screen as a broken vendor rather than as a missing key.
  if (spec.auth !== undefined) {
    if (local) {
      // Unreachable through the credential check below — a local document is
      // already refused any credentials at all — but refused in its own words,
      // because *"names a credential this document does not declare"* would send
      // an author looking for a typo instead of reading the local bargain.
      throw new SourceSpecError(
        'unsafe-host',
        `${spec.id} is local and declares an OAuth session. A local document holds no credentials — the program it talks to holds its own — so there is nothing for a token endpoint to be given.`,
        { id: spec.id },
      )
    }
    assertSafeUrlTemplate(spec.auth.tokenUrl, spec.hosts, `auth.tokenUrl of ${spec.id}`, local)
    if (placeholdersIn(spec.auth.tokenUrl).length > 0) {
      // Every other URL in this document may interpolate a machine value the
      // gateway composed. This one may not, and the reason is that it has no
      // call to be composed *from*: a token is issued for the document, once per
      // process, before any manager has asked anything. A placeholder here would be
      // a session whose identity depends on which question happened to be first.
      throw new SourceSpecError(
        'templated-authority',
        `auth.tokenUrl of ${spec.id} interpolates. A session is issued for the document, not for a call, so there is no value to fill in.`,
        { id: spec.id, url: spec.auth.tokenUrl },
      )
    }
    for (const [field, name] of [
      ['clientId', spec.auth.clientId],
      ['clientSecret', spec.auth.clientSecret],
    ] as const) {
      const declared = spec.credentials.find((credential) => credential.name === name)
      if (declared === undefined) {
        throw new SourceSpecError(
          'unresolved-reference',
          `auth.${field} of ${spec.id} names the credential "${name}", which this document does not declare.`,
          { id: spec.id, field, name },
        )
      }
      if (!declared.required) {
        throw new SourceSpecError(
          'unresolved-reference',
          `auth.${field} of ${spec.id} names "${name}", which is optional. Nothing this document does works without a session, so a credential the session needs cannot be one the investor may leave out.`,
          { id: spec.id, field, name },
        )
      }
    }
    if (spec.auth.clientId === spec.auth.clientSecret) {
      throw new SourceSpecError(
        'unresolved-reference',
        `auth of ${spec.id} uses "${spec.auth.clientId}" as both the client id and the client secret.`,
        { id: spec.id, name: spec.auth.clientId },
      )
    }
  }

  // ── The relay, whose rules are the request rules minus the template ───────
  //
  // A relay route reaches nowhere the document could not otherwise: the host
  // must be one it declared, and `assertDeclarableHost` judges it exactly as it
  // judges the `hosts[]` entry. What is *not* checked here is the broker
  // ceiling — see the note above for why that one cannot live in this package.
  const relayPaths = new Set<string>()
  for (const route of spec.endpoints) {
    if (!spec.hosts.includes(route.host)) {
      throw new SourceSpecError(
        'host-not-declared',
        `relay[] of ${spec.id} names the host "${route.host}", which this specification does not declare in "hosts".`,
        { where: `relay[${route.path}]`, host: route.host, declared: spec.hosts },
      )
    }
    assertDeclarableHost(route.host, `relay[${route.path}] of ${spec.id}`, local)
    const exposed = (route.query ?? []).filter((name) => protectedQueryNames.has(name))
    if (exposed.length > 0) {
      throw new SourceSpecError(
        'unresolved-reference',
        `relay[${route.path}] of ${spec.id} exposes the protected query parameter ${exposed.join(', ')} to the manager. Credential query parameters are injected by the gateway and must not appear in endpoints[].query.`,
        { id: spec.id, path: route.path, parameters: exposed },
      )
    }
    // One path is one host, because the manager names only the path. Two hosts
    // for one path would make *which vendor answered* a fact about the order of
    // this array — which is the defect `loadSourceSpecsFromEnv` refuses one
    // element up, at the same granularity the Evidence records.
    if (relayPaths.has(route.path)) {
      throw new SourceSpecError(
        'unresolved-reference',
        `relay[] of ${spec.id} declares "${route.path}" twice. A manager names a path, so a path names one host.`,
        { id: spec.id, path: route.path },
      )
    }
    relayPaths.add(route.path)
  }
}
