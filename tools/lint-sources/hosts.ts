import { SourceSpecError } from './errors.ts'

/**
 * Where a specification is allowed to send a request, and a credential.
 *
 * The roadmap settled the *why* and left the implementation: the gateway fills
 * a declared credential into a header, so a document that points its URL at
 * `attacker.com` has been handed the key. Two rules together answer it, and
 * neither is sufficient alone:
 *
 *   1. **Host pinning.** Every URL in the document must name a host the
 *      document declared, and the credential goes nowhere else. A specification
 *      that reaches two hosts declares two hosts, in the open, at review.
 *   2. **An allowlist of what may be declared at all.** `https` only, and no
 *      loopback, link-local or private address — including by name. Without
 *      this, pinning is satisfied by declaring `localhost` and pointing at
 *      whatever else is listening on the investor's machine, or at a cloud
 *      instance's metadata endpoint, which is the classic way a credential
 *      fetch becomes a credential *theft*.
 *
 * Both are checked when the document is loaded, before any request is made, and
 * the interpolated URL is checked again before every request — a template is a
 * string until it is not, and the second check is the one that holds when a
 * value taken out of a response is put into a path.
 */

/** `{name}` — the only substitution this format has. */
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g
/** The same, unanchored to any `lastIndex`: `test` on a global regex is stateful. */
const HAS_PLACEHOLDER = /\{[A-Za-z][A-Za-z0-9_]*\}/

/** A sentinel with no URL-significant characters, for parsing a template. */
const SENTINEL = 'x'

export function placeholdersIn(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] as string)
}

function isIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

/**
 * Hosts no specification may reach, whatever it declares.
 *
 * Names as well as addresses: `localhost` resolves to the loopback and so does
 * anything an investor's `/etc/hosts` says it does, so this list is a floor and
 * not a proof. What it does prove is that reaching them is not something the
 * document can ask for *in the open*, which is the property a reviewer of a
 * public pull request is actually relying on.
 */
function unsafeHostReason(host: string): string | undefined {
  const lower = host.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) return 'loopback by name'
  if (lower.endsWith('.local') || lower.endsWith('.internal')) return 'a private naming suffix'
  if (lower === '[::1]' || lower === '::1') return 'the IPv6 loopback'
  if (lower.startsWith('[')) return 'a literal IPv6 address'
  if (!isIpv4(lower)) return undefined

  const parts = lower.split('.').map(Number)
  const [a = 0, b = 0] = parts
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return 'not a valid address'
  }
  if (a === 127) return 'the loopback range'
  if (a === 0) return 'the unspecified address'
  if (a === 10) return 'a private range'
  if (a === 192 && b === 168) return 'a private range'
  if (a === 172 && b >= 16 && b <= 31) return 'a private range'
  if (a === 169 && b === 254) return 'the link-local range, which holds cloud metadata'
  return undefined
}

/**
 * Whether a host is on the machine rather than on the internet.
 *
 * The loopback alone, and deliberately **not** the private ranges: a `local`
 * document is one describing a program the investor runs *here*, and `10.0.0.0/8`
 * is somebody's office network, not this machine. Widening it would turn a flag
 * that means *my own computer* into one that means *anything behind my router*,
 * which is the exact reach `unsafeHostReason` exists to refuse. (#220)
 */
export function isLoopbackHost(host: string): boolean {
  const lower = host.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true
  if (lower === '[::1]' || lower === '::1') return true
  return isIpv4(lower) && Number(lower.split('.')[0]) === 127
}

/**
 * Refuses a host a specification may not declare.
 *
 * `local` is the investor's grant arriving here, and it moves exactly one line:
 * a loopback host stops being refused. Everything else `unsafeHostReason` names
 * — private ranges, link-local, `.internal`, a literal IPv6 address — is refused
 * for a `local` document too, because none of those is *this machine* and the
 * cloud metadata endpoint is among them. `spec.ts` carries the full argument for
 * why the reversal is affordable; the short version is that a `local` document
 * is refused any credentials at all, so nothing it could carry to a local
 * address exists. (#220)
 */
export function assertDeclarableHost(host: string, where: string, local = false): void {
  if (local && isLoopbackHost(host)) return
  const reason = unsafeHostReason(host)
  if (reason !== undefined) {
    throw new SourceSpecError(
      'unsafe-host',
      `${where} names "${host}", which is ${reason}. A source specification reaches the public internet or nothing.`,
      { host, where },
    )
  }
}

/**
 * Refuses a URL template that could move its own host.
 *
 * A `{placeholder}` before the first `/` of the path is the whole attack: a
 * value taken out of one response would decide where the *next* request — the
 * one carrying the credential — is sent. The check is positional rather than
 * a matter of escaping, because escaping is a claim about a parser and this is
 * a claim about the document.
 */
export function assertSafeUrlTemplate(
  template: string,
  hosts: readonly string[],
  where: string,
  local = false,
): {
  readonly host: string
  readonly placeholders: readonly string[]
} {
  const probe = template.replace(PLACEHOLDER, SENTINEL)
  let url: URL
  try {
    url = new URL(probe)
  } catch {
    throw new SourceSpecError('unsafe-host', `${where} is not a URL: ${template}`, {
      where,
      url: template,
    })
  }
  // `http` is allowed for a `local` document and **only** to a loopback host,
  // which is two conditions rather than one on purpose: the flag is not a licence
  // to send plaintext anywhere. TLS to a process on this machine secures nothing
  // that the machine boundary does not already secure, and no local program has a
  // certificate a client would accept — so requiring `https` here would not make
  // the traffic safer, it would make the source unreachable. (#220)
  const plaintextHere = local && url.protocol === 'http:' && isLoopbackHost(url.hostname)
  if (url.protocol !== 'https:' && !plaintextHere) {
    throw new SourceSpecError(
      'unsafe-host',
      `${where} uses ${url.protocol}//; a source specification is https only.`,
      { where, url: template, protocol: url.protocol },
    )
  }
  if (url.username !== '' || url.password !== '') {
    throw new SourceSpecError(
      'unsafe-host',
      `${where} carries credentials in its authority; credentials come from the gateway, by name.`,
      { where },
    )
  }

  const authorityEnd = template.indexOf('/', template.indexOf('://') + 3)
  const authority = authorityEnd === -1 ? template : template.slice(0, authorityEnd)
  if (HAS_PLACEHOLDER.test(authority)) {
    throw new SourceSpecError(
      'templated-authority',
      `${where} interpolates into its authority (${authority}); a placeholder may only reach the path or the query.`,
      { where, url: template },
    )
  }

  assertDeclarableHost(url.hostname, where, local)
  if (!hosts.includes(url.hostname)) {
    throw new SourceSpecError(
      'host-not-declared',
      `${where} reaches ${url.hostname}, which this specification does not declare in "hosts".`,
      { where, host: url.hostname, declared: hosts },
    )
  }
  return { host: url.hostname, placeholders: placeholdersIn(template) }
}

/**
 * Fills a template, encoding every value, and checks the result again.
 *
 * Encoding means an interpolated value cannot introduce a `/`, a `@` or a `?`,
 * so it cannot leave the path it was put in. The second check is not therefore
 * redundant — it is what makes that sentence something a test can hold rather
 * than something this comment asserts.
 */
export function fillUrlTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
  hosts: readonly string[],
  where: string,
  local = false,
): string {
  const filled = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name]
    if (value === undefined) {
      throw new SourceSpecError(
        'unresolved-reference',
        `${where} uses {${name}}, which is unbound.`,
        {
          where,
          name,
        },
      )
    }
    return encodeURIComponent(value)
  })
  assertSafeUrlTemplate(filled, hosts, where, local)
  return filled
}
