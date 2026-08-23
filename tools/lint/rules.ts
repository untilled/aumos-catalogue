/**
 * The rules an ManagerPackage has to keep, as a function rather than as a test.
 * (#183)
 *
 * ── Why this stopped being a `describe` and became a package ───────────────
 *
 * Every rule below was written in `packages/manager-runtime/src/package.test.ts`,
 * where #173 first established that it held rules rather than a description of
 * `basic-investor`. It is moved here for one reason: **the repository these
 * rules live in is private, and the repository third-party packages arrive in
 * cannot be.** `untilled/aumos` is private (2026-08-09), so a submission is a
 * pull request against a *different* repository, and the CI that greets a
 * contributor there has no access to any of this.
 *
 * A rule with two implementations is two rules — this codebase says so about
 * `broker-book.ts` and about `closedPortfolioIds`, and it is more true here than
 * in either: a submissions checker that drifted from the real lint would greet a
 * contributor with a green tick and then be refused at the merge, which is the
 * one failure mode a submission path exists to prevent.
 *
 * So the rules are:
 *
 * - **pure**, and take a map of path → text rather than a directory. That map is
 *   `@aumos/registry`'s bundle format exactly (`bundle.ts`), so what is linted is
 *   the *published form* of the package rather than a working copy of it. A
 *   directory reduces to it through `readPackageFiles`; so does a downloaded
 *   artifact, with no second reader.
 * - **dependency-free** — no zod, no `@aumos/amp`, no `node:fs`. The whole file
 *   is copied verbatim into the submissions repository by
 *   `scripts/vendor.ts`, and a copy that needed this workspace to run would not
 *   be a copy of anything useful.
 *
 * ── What is deliberately **not** here ──────────────────────────────────────
 *
 * The manifest schema. §37 makes the manifest the permission document and
 * `managerPackageManifestSchema` is its only definition; restating it in this file
 * would be the exact fork the file exists to avoid. Both sides read the *same*
 * schema instead — this workspace through zod, the submissions repository
 * through `ajv` over the generated `manager-package-manifest.schema.json`, which
 * is a stock validator reading our document rather than a second opinion about
 * it. Everything below assumes that check has already passed and reads the
 * manifest defensively anyway, because a linter that throws on the input it was
 * given to judge tells a contributor nothing.
 */

/**
 * ── The documents are bilingual and these messages are not, on purpose ─────
 *
 * `untilled/aumos-catalogue` carries its README, its contributing guide and its
 * pull request template in English and Korean, because a submission path
 * somebody cannot read is not a path. A problem message is a different kind of
 * string and takes the treatment `CLAUDE.md`'s conventions give
 * `verbatim()`: almost every one of these names a field, a capability, an enum
 * value or a rule id — `portfolio:read`, `evidenceIds`, `provenance.commit` —
 * and those spellings are the wire format, which is exactly what a package must
 * **not** translate. A message that put `portfolio:read` inside a Korean
 * sentence would be teaching the mistake the `language-is-shown` rule exists to
 * prevent, one layer up.
 *
 * There is also no dictionary to reach for: this file has no dependencies at
 * all, which is what lets it be copied into a repository that has none of
 * `@aumos/i18n`. If that ever changes the rule ids are the seam — they are
 * stable, and a translation would key off them rather than off the prose.
 *
 * ⚠️ This paragraph lived in the **vendored copy** until 2026-08-13, added by
 * `untilled/aumos-catalogue` PR #2 — an edit to a generated file, which is the one
 * thing `VENDORED.md` tells a contributor not to do. It was right about the
 * content and wrong about the place: the next `vendor` run would have deleted
 * it, and this branch is the run that nearly did. Moved to the source, where it
 * survives.
 */

/** A package as its published bundle carries it: relative path → file text. */
export interface PackageFiles {
  readonly [path: string]: string
}

export interface Problem {
  /** Stable id, so a contributor can be pointed at the paragraph that argues it. */
  readonly rule: string
  readonly message: string
}

/**
 * ⚠️ **`LintOptions` stood here and #269 emptied it.** (2026-08-21)
 *
 * It carried one member, `decisionActions`, and one rule read it —
 * `worked-example-per-action`, retired below. An option nothing reads is worse
 * than none: its comment argued a staleness the code had stopped checking, and
 * this repository has a rule about indicative comments that no longer hold.
 *
 * Removing it rather than leaving it empty is what makes the vendored copy
 * honest too — `catalogue-tools/lint/` no longer needs
 * `decision-proposal.schema.json` to recover an enum nobody compares against.
 */

/**
 * The one file in a package Aumos parses. Mirrors `manager-runtime`. (#286)
 *
 * A second copy of the name for `LOCALE_TAG`'s reason below — this file is
 * vendored verbatim into a public repository and may not import from the
 * workspace. `rules.test.ts` is what keeps the two in step.
 */
export const MANIFEST_FILENAME = 'aumos.json'

/** The prompt a package ships when its manifest names none. Mirrors `manager-runtime`. */
export const DEFAULT_PROMPT_PATH = 'PROMPT.md'

/**
 * A locale tag a translation may be keyed by. (#233)
 *
 * A second implementation of `@aumos/amp`'s `LOCALE_TAG`, and it is here because
 * this file is copied verbatim into a public repository, so it may not import
 * the schema that owns the pattern. What keeps the copy honest is that the rule
 * is one regex, and `rules.test.ts` asserts both directions of it.
 */
const LOCALE_TAG = /^[a-z]{2}(-[A-Z]{2})?$/

interface ManifestView {
  readonly capabilities: readonly string[]
  readonly configSchema: string | undefined
  readonly readme: string | undefined
  /** `manifest.prompt`, unresolved. Absent means the conventional `PROMPT.md`. (#286) */
  readonly prompt: string | undefined
  /** Which CLI loaders this package's files are written for. (#286) */
  readonly runtimes: readonly string[] | undefined
  /** The package id, so a credential rule can say whether it is spellable. (#286) */
  readonly id: string | undefined
  /** Contributed manager ids, so a translation cannot name one that is not here. */
  readonly managerIds: readonly string[]
  readonly provenance:
    | { readonly notice: string; readonly licenseHolder: string; readonly commit: string }
    | undefined
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readManifest(raw: unknown): ManifestView {
  const provenance = field(raw, 'provenance')
  const notice = text(field(provenance, 'notice'))
  const licenseHolder = text(field(provenance, 'licenseHolder'))
  const commit = text(field(provenance, 'commit'))

  return {
    capabilities: Array.isArray(field(raw, 'capabilities'))
      ? (field(raw, 'capabilities') as unknown[])
          .map((capability) => text(field(capability, 'kind')))
          .filter((kind): kind is string => kind !== undefined)
      : [],
    configSchema: text(field(field(raw, 'config'), 'schema')),
    readme: text(field(raw, 'readme')),
    prompt: text(field(raw, 'prompt')),
    id: text(field(raw, 'id')),
    // Members that are not strings are dropped rather than reported: the schema
    // owns the shape of this field, and a linter that re-litigates it would give
    // one mistake two messages that do not agree.
    runtimes: Array.isArray(field(raw, 'runtimes'))
      ? (field(raw, 'runtimes') as unknown[]).filter(
          (runtime): runtime is string => typeof runtime === 'string',
        )
      : undefined,
    managerIds: Array.isArray(field(field(raw, 'contributes'), 'managers'))
      ? (field(field(raw, 'contributes'), 'managers') as unknown[])
          .map((manager) => text(field(manager, 'id')))
          .filter((id): id is string => id !== undefined)
      : [],
    provenance:
      notice !== undefined && licenseHolder !== undefined && commit !== undefined
        ? { notice, licenseHolder, commit }
        : undefined,
  }
}

/**
 * A path a manifest names, resolved the way `loadManagerPackage` resolves one.
 *
 * The map has no directories and no `..` to walk, so the check is a string
 * check — which is the same posture `bundlePathSchema` takes and for the same
 * reason: a rewritten path is a file that lands somewhere its author did not
 * name.
 */
function normalise(path: string): string {
  return path.replace(/^\.\//, '')
}

export function lintManagerPackage(files: PackageFiles): readonly Problem[] {
  const problems: Problem[] = []
  const problem = (rule: string, message: string): void => {
    problems.push({ rule, message })
  }

  // ── the manifest exists and is JSON ──────────────────────────────────────
  const manifestText = files[MANIFEST_FILENAME]
  if (manifestText === undefined) {
    return [{ rule: 'manifest-present', message: `there is no ${MANIFEST_FILENAME}` }]
  }
  let raw: unknown
  try {
    raw = JSON.parse(manifestText)
  } catch (error) {
    return [
      {
        rule: 'manifest-present',
        message: `${MANIFEST_FILENAME} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]
  }
  const manifest = readManifest(raw)

  /**
   * ── the prompt ───────────────────────────────────────────────────────────
   *
   * ⚠️ **`prompt-bundle` is retired and this replaced it (#286).** The rule was
   * *there is a `prompt/` directory with `.md` sections in it*, and the
   * directory no longer exists: a package's prompt is one file, and everything
   * a manager should read *conditionally* is a skill the CLI loads and Aumos
   * never sees. The check that survives is the one the bundle rule was really
   * making — **a package must ship the file it will be run from** — because a
   * package whose prompt path is dead fails on its first run rather than at
   * lint, which is the failure this tool exists to move earlier.
   */
  const promptPath = normalise(manifest.prompt ?? DEFAULT_PROMPT_PATH)
  const bundle = files[promptPath]
  if (bundle === undefined) {
    problem('prompt-present', `the prompt file ${promptPath} is not in the package`)
  } else if (bundle.trim().length === 0) {
    problem('prompt-present', `the prompt file ${promptPath} is empty`)
  }
  const jsonBlocks = ((bundle ?? '').match(/```json\n[\s\S]*?```/g) ?? []).join('\n')

  // ── the paths the manifest names lead somewhere ──────────────────────────
  //
  // `loadManagerPackage` refuses a dead path at load, and refuses one that escapes
  // the package directory. Here the escape is not expressible — a bundle has no
  // path outside itself — so what is left is the failure a path field actually
  // has, which is pointing at nothing.
  for (const [name, path] of [
    ['readme', manifest.readme],
    ['config.schema', manifest.configSchema],
    ['provenance.notice', manifest.provenance?.notice],
  ] as const) {
    if (path === undefined) continue
    if (files[normalise(path)] === undefined) {
      problem('declared-path-resolves', `${name} points at ${path}, which is not in the package`)
    }
  }

  // ── the package in another language ──────────────────────────────────────
  //
  // A translation is `translations/<locale>.json` beside `README.<locale>.md`,
  // and **neither is a manifest field**. That is a measurement rather than a
  // preference: the manifest schema is strict, so a key a shipped binary's own
  // copy predates makes the whole package `unreadable` on that machine — all
  // five published packages refused under `0.2.4`'s schema when this was tried
  // as a field. Files are free; nothing validates the set of them.
  //
  // Nothing here requires a package to be translated. What is checked is the
  // ways a translation fails **silently** — each symptom being a document that
  // ships inside the artifact and is drawn for nobody.
  for (const path of Object.keys(files)) {
    if (!path.startsWith('translations/') || !path.endsWith('.json')) continue
    const locale = path.slice('translations/'.length, path.length - '.json'.length)

    // (1) A locale that is not one. `translations/korean.json` passes every
    //     other rule and is read by nothing, because the catalogue looks a
    //     locale tag up rather than listing the directory and guessing.
    if (!LOCALE_TAG.test(locale)) {
      problem(
        'translation-locale-tag',
        `${path} is not named for a locale — a language, optionally a region, as in translations/ko.json or translations/pt-BR.json. Nothing draws a translation it cannot find`,
      )
      continue
    }

    let translation: unknown
    try {
      translation = JSON.parse(files[path] ?? '')
    } catch (error) {
      problem(
        'translation-is-a-document',
        `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }

    // (2) A key nobody reads. There are two, and a `descriptions` or a
    //     `summary` is a translation the author wrote and the catalogue will not
    //     draw — which is what a strict schema exists to refuse, made by hand
    //     here because this file has no zod to reach for.
    for (const key of Object.keys(
      (typeof translation === 'object' && translation !== null ? translation : {}) as Record<
        string,
        unknown
      >,
    )) {
      if (key !== 'description' && key !== 'managers') {
        problem(
          'translation-is-a-document',
          `${path} has a key called ${key}, and a translation carries two: description, and managers[] matched by id`,
        )
      }
    }

    // (3) A methodology filed against a manager this package does not
    //     contribute. The entries are matched by id precisely so a reordered
    //     `contributes.managers` cannot reattach a paragraph to the wrong manager;
    //     an id matching nothing is that same defect arriving as a typo.
    const managers = field(translation, 'managers')
    if (Array.isArray(managers)) {
      for (const entry of managers) {
        const id = text(field(entry, 'id'))
        if (id !== undefined && !manifest.managerIds.includes(id)) {
          problem(
            'translation-names-an-manager',
            `${path} names the manager ${id}, which this package does not contribute — so that paragraph is drawn for nobody`,
          )
        }
      }
    }
  }

  // (4) A translated README whose locale is not a locale. The path is
  //     **derived** rather than declared — `./README.md` translated into Korean
  //     is `./README.ko.md` — which is what keeps a long document out of a JSON
  //     string, and it is also what makes a misspelling invisible:
  //     `README.KO.md` ships inside the artifact, passes every other rule, and
  //     is read by nothing. There is no rule the other way round (a translation
  //     document with no translated README), because translating the one-line
  //     summary and leaving the body alone is a legitimate thing to do and the
  //     catalogue says so, per field.
  const readmePath = normalise(manifest.readme ?? 'README.md')
  const dot = readmePath.lastIndexOf('.')
  if (dot > 0) {
    const base = readmePath.slice(0, dot)
    const extension = readmePath.slice(dot)
    for (const path of Object.keys(files)) {
      if (!path.startsWith(`${base}.`) || !path.endsWith(extension)) continue
      const middle = path.slice(base.length + 1, path.length - extension.length)
      if (middle.length === 0 || middle.includes('.')) continue
      if (!LOCALE_TAG.test(middle)) {
        problem(
          'translated-readme-locale',
          `${path} reads as ${base}${extension} in "${middle}", which is not a locale tag — the catalogue looks for ${base}.<locale>${extension}, so this document would be published and never drawn`,
        )
      }
    }
  }

  // ── capabilities ─────────────────────────────────────────────────────────
  //
  // Not a fixed list: packages ask for deliberately different sets, and that
  // difference is what the install screen shows. What is common to all of them
  // is that none goes looking for a way to trade. Invariant 5 is enforced by the
  // capability enum having no such member; this asserts no package is written as
  // though it might one day gain one. Nothing about a session's own tools bears
  // on it: the CLI's tools are the vendor's and never ours.
  for (const kind of manifest.capabilities) {
    if (/broker|order|execut|trade/.test(kind)) {
      problem(
        'no-execution-capability',
        `capability ${kind} reads as a way to trade. There is no broker:write capability and there will not be one (design invariant 5)`,
      )
    }
  }

  // ⚠️ **`closed-lane-sees-the-book` stood here and #258 deleted it.**
  //
  // It required `portfolio:read` of a package that declared no CLI tools, on the
  // argument that such a manager could see nothing at all, so a bundle reasoning
  // about a book without it was describing a book it was never shown. There is
  // no such package: every session reaches the web and a shell whatever the
  // manifest says, and a package may legitimately ask for zero capabilities.
  //
  // ⚠️ **`invocation-marker` stood here and #286 retired it.**
  //
  // The rule required exactly one `{{INVOCATION}}` in the bundle, #270 relaxed
  // it to *at most* one, and #286 deleted the substitution itself. There is no
  // templating in a prompt file: `invocation_read` is the only way a manager gets
  // the AMP document, which is the trade #270 made deliberately — a prompt that
  // was interpolated leaves no row, and a tool call does.
  //
  // Nothing replaces it. A rule about a marker no reader substitutes would be
  // this file asserting a property nothing enforces, which is the failure the
  // repository's own comment convention names.

  // ⚠️ **`worked-example-per-action` and `rationale-field-shape` stood here, and
  // #269 retired them.** (2026-08-21)
  //
  // They existed because `decision_submit` published `{"type":"object"}` and
  // nothing else, so the only specification a model could read was whatever
  // prose the package happened to carry. Three real `claude` runs reached
  // `invalid-proposal` that way, one field along each time:
  //
  // | | what was missing |
  // |---|---|
  // | #265 | `watches` described in prose and never *shown* → the model invented `note` |
  // | #163  | a WAIT example only, so `target` was described and never shown → invented `target.type` |
  // | #196 | `uncertainty` named in one sentence → guessed a string where the schema wants a list |
  //
  // The reading was right — *prose beside a strict schema is not a
  // specification* — and the conclusion was the affordable one at the time:
  // make every package write the specification out again, in JSON, in its own
  // words. #269 published the specification instead. `decision_submit`'s input
  // schema is `decisionProposalSchema` itself, derived at run time from the
  // object `judgeProposal` validates against, and it states every one of the
  // three things above directly — `watches`' members, which actions take a
  // `target`, that `uncertainty` is an array.
  //
  // So the rules did not become wrong; they became a demand that each package
  // **duplicate a published schema**, which is the cost #269 exists to remove.
  // Enforcing them now would mean a package cannot both pass lint and stop
  // repeating the contract.
  //
  // ✅ **Retired against a measurement, not an argument** — a real `claude` run
  // against a trimmed bundle reached `decided`. Without that this paragraph
  // would be a hypothesis about what models do with a schema they have never
  // been shown before, and the three rows above are what hypotheses of that
  // shape have cost.
  //
  // What replaces them is not nothing: `packages/skill-gateway`'s
  // `decision-submit.test.ts` asserts the schema is still published, still
  // strict, and still the judge's own. If that stops being true, every package
  // is back to prose — and these rules would be right again.

  // ⚠️ **`language-is-shown` stood here, and #286 retired it.**
  //
  // It required the bundle to mention `language`, to carry a worked example in a
  // non-English language, and to keep every JSON key in that example ASCII. The
  // failure it guarded is real and unchanged — a model told to answer in Korean
  // has every reason to translate `action` too, and one translated enum discards
  // the judgement entirely.
  //
  // What changed is where that instruction belongs. #286 makes the prompt file
  // the run's **entry point** and moves everything read conditionally into
  // skills the CLI loads and Aumos never reads. A rule that greps the entry
  // point for a Korean worked example is a rule that forces content back into
  // the one file the format exists to keep short — and it cannot follow the
  // content into `skills/`, because the whole point is that Aumos does not
  // interpret what is in there.
  //
  // It is also no longer the only channel, which is the argument
  // `bundle-says-what-it-costs` made two rules down: the Aumos MCP server
  // returns `instructions` from `initialize`, so what stays English is stated
  // once by the host to every package rather than re-asserted by each one.
  //
  // ⛔ **This is the weakest of the three retirements and it is worth saying so.**
  // `invocation-marker` went because the mechanism was deleted, and
  // `prompt-bundle` because the directory was; this one goes because the rule
  // sits in the wrong place, and nothing yet checks the place it moved to.

  // ⚠️ **`bundle-says-what-it-costs` stood here, and #271 retired it.**
  // (2026-08-21)
  //
  // It required the bundle to mention `evidenceIds` and `asOf` by name. The two
  // failures it guarded are real and both are silent — filing Evidence the manager
  // did not receive, and treating `asOf` as decoration — and the rule was the
  // only thing saying so, because the bundle was the only channel to the model.
  //
  // It is not any more. The Aumos MCP server returns `instructions` from
  // `initialize` (MCP's own slot for *"how to use this server"*), and
  // `AMP_MANAGER_INSTRUCTIONS` states both, once per session, before any tool
  // call. ✅ Measured on claude 2.1.238: a probe server's instructions came back
  // quoted verbatim by the model without any tool call. So the rule became a
  // demand that every package restate what the host now says — #269's shape
  // exactly, one channel over.
  //
  // ⚠️ **It was also passing for the wrong reason.** After the #271 trim, three
  // of the four first-party bundles still satisfied it — because their Korean
  // worked example happens to contain `"evidenceIds": ["ev_…"]`. A rule met by
  // an illustrative JSON block is a rule about the presence of a string, not
  // about what the bundle taught.
  //
  // What is *not* replaced: a bundle can still teach the opposite of the
  // instructions. Nothing here checks for that, and nothing did before.

  // ── attribution, by shape ────────────────────────────────────────────────
  //
  // `harness-porting.md` §5 makes a ported prompt a derivative work.
  // `harness-spec` enforces that by shape — `provenance.license` has no
  // `.optional()` and `provenance.notice` is a path — and this is the same
  // enforcement one repository over: declaring a provenance is not a claim a
  // package can make cheaply. The licence obligation is about the copyright
  // *line* rather than the SPDX id, so the holder's name being in the text is
  // the smallest thing that distinguishes a retained notice from a placeholder.
  const provenance = manifest.provenance
  if (provenance !== undefined) {
    const notice = files[normalise(provenance.notice)]
    if (notice !== undefined && !notice.includes(provenance.licenseHolder)) {
      problem(
        'notice-travels-with-the-derivative',
        `${provenance.notice} does not contain ${provenance.licenseHolder}, so it is a placeholder rather than the retained notice the licence obliges this package to ship`,
      )
    }
    if (!/^[0-9a-f]{40}$/.test(provenance.commit)) {
      problem(
        'notice-travels-with-the-derivative',
        `provenance.commit is ${provenance.commit}, which is not a full 40-character commit — a branch name moves and then names nothing`,
      )
    }
  }

  /**
   * ── the runtime a package's files are written for (#286) ─────────────────
   *
   * The one real constraint the plugin format costs us, so it is the one new
   * rule. A package carrying `.claude-plugin/plugin.json` is loaded by
   * `claude --plugin-dir`; codex has no counterpart and reads `AGENTS.md`. Aumos
   * interprets neither — it hands the directory to the CLI whole — so the
   * *manifest* is the only place that can say which loader the files are for,
   * and a mismatch between the declaration and what is on disk is a package that
   * installs and then starts a session with none of its own material in it.
   *
   * ⚠️ **Only the absence is checked, never the presence of extra files.** A
   * package may legitimately ship both sets, and a package listing `claude` that
   * also carries `AGENTS.md` is not making a mistake — codex reads that file
   * whether or not this manifest mentions it.
   */
  const runtimes = manifest.runtimes ?? []
  if (runtimes.includes('claude') && files['.claude-plugin/plugin.json'] === undefined) {
    problem(
      'runtime-files-are-present',
      'runtimes lists "claude" but there is no .claude-plugin/plugin.json, so ' +
        '`--plugin-dir` loads a directory with no plugin in it and the session starts without ' +
        'this package’s skills, hooks or MCP servers',
    )
  }
  if (runtimes.includes('codex') && files['AGENTS.md'] === undefined) {
    problem(
      'runtime-files-are-present',
      'runtimes lists "codex" but there is no AGENTS.md, which is the only convention codex ' +
        'reads. Aumos does not translate the claude plugin for it',
    )
  }

  /**
   * ── the servers a package brings, and what it asks the investor for (#286 3) ─
   *
   * Aumos parses `.mcp.json` only as far as the server names, because
   * `--strict-mcp-config` means a server it does not write into the run's config
   * does not exist. That makes two mistakes possible that nothing else catches,
   * and both are silent at run time:
   *
   * - a file that will not parse — the loader **refuses the package**, and this
   *   is where the author hears which line;
   * - a server named `aumos` — the gateway is written under that name, so one of
   *   the two would silently replace the other.
   *
   * ⛔ **What is deliberately not checked is whether the servers are safe.** A
   * `command` pointing into `bin/`, a `url` on the open internet — both are
   * legal, and #286 settled that this cannot be prevented and is disclosed
   * instead. A linter that graded them would be asserting a judgement the host
   * does not make.
   */
  const mcpText = files['.mcp.json']
  if (mcpText !== undefined) {
    let mcp: unknown
    try {
      mcp = JSON.parse(mcpText)
    } catch (error) {
      problem(
        'mcp-config-is-readable',
        `.mcp.json is not JSON: ${error instanceof Error ? error.message : String(error)}. ` +
          'Aumos refuses a package whose server list it cannot read, because a server the ' +
          'investor approved and that then does not start is a run doing less than they agreed to',
      )
      mcp = undefined
    }
    const servers =
      typeof mcp === 'object' && mcp !== null
        ? (mcp as { readonly mcpServers?: unknown }).mcpServers
        : undefined
    if (servers !== undefined) {
      if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
        problem(
          'mcp-config-is-readable',
          '.mcp.json has an "mcpServers" member that is not an object',
        )
      } else {
        for (const [name, body] of Object.entries(servers as Record<string, unknown>)) {
          if (name === 'aumos') {
            problem(
              'mcp-config-is-readable',
              'the server name "aumos" is the one Aumos writes its own gateway under, so one of ' +
                'the two would silently replace the other. Rename it',
            )
          }
          if (typeof body !== 'object' || body === null || Array.isArray(body)) {
            problem(
              'mcp-config-is-readable',
              `.mcp.json server ${JSON.stringify(name)} is not an object`,
            )
          }
        }
      }
    }
  }

  /**
   * A credential a package asks for has to be spellable as a variable. (#286 3)
   *
   * The host composes `AUMOS_MANAGER_CREDENTIAL_<ID>__<NAME>` and **refuses**
   * rather than composing a name two ids could share — so a package declaring a
   * credential it can never be given would install, and fail at the first run
   * with a message about environment variables. This is where the author hears
   * it instead.
   *
   * The shape is `SOURCE_ID_PATTERN`'s, restated rather than imported for
   * `LOCALE_TAG`'s reason: this file is vendored verbatim into a public
   * repository and may not import the workspace.
   */
  const CREDENTIAL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const declaredCredentials = Array.isArray(field(raw, 'credentials'))
    ? (field(raw, 'credentials') as unknown[])
    : []
  if (declaredCredentials.length > 0 && !CREDENTIAL_NAME.test(manifest.id ?? '')) {
    problem(
      'credential-is-nameable',
      `this package asks for credentials, but its id ${JSON.stringify(manifest.id)} is not ` +
        'lowercase letters, digits and single hyphens. A scoped id cannot be composed into an ' +
        'environment variable without two ids becoming one, so the host refuses at run time',
    )
  }
  for (const credential of declaredCredentials) {
    const name = text(field(credential, 'name'))
    if (name !== undefined && !CREDENTIAL_NAME.test(name)) {
      problem(
        'credential-is-nameable',
        `credential ${JSON.stringify(name)} has to be lowercase letters, digits and single ` +
          'hyphens, beginning and ending with a letter or digit — the host composes an ' +
          'environment variable from it and refuses a name it cannot make unique',
      )
    }
  }

  // ⚠️ **`cadence-is-readable` stood here, and #286 retired it.** (#257 path A)
  //
  // The rule existed because the cadence suggestion was a **file** —
  // `cadence.json` — and it was a file for one reason: the manifest schema was a
  // `strictObject`, so a new key made a shipped binary refuse the whole
  // document, and #257 measured that `engines.aumos` could not gate it either
  // because the manifest is parsed *before* engines is read. The file was
  // invisible to the schema, which meant the **app** could not complain about a
  // bad one either — a pre-fill must never stop an install — so this was the
  // only reader that could tell the author their file said nothing.
  //
  // #286 released `strictObject`, so the value is `manifest.cadence` and zod
  // rejects a bad one at the manifest, where refusing is right. The rule is not
  // replaced because it has nothing left to say: `readManifest` below already
  // reports an unparseable manifest, and a cadence outside range is now a
  // `manifest-present` problem rather than a silent drop.

  return problems
}
