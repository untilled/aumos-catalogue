/**
 * The rules an AgentPackage has to keep, as a function rather than as a test.
 * (M10g)
 *
 * ── Why this stopped being a `describe` and became a package ───────────────
 *
 * Every rule below was written in `packages/agent-runtime/src/package.test.ts`,
 * where M10a-1 first established that it held rules rather than a description of
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
 * - **dependency-free** — no zod, no `@aumos/aap`, no `node:fs`. The whole file
 *   is copied verbatim into the submissions repository by
 *   `scripts/vendor.ts`, and a copy that needed this workspace to run would not
 *   be a copy of anything useful.
 *
 * ── What is deliberately **not** here ──────────────────────────────────────
 *
 * The manifest schema. §37 makes the manifest the permission document and
 * `agentPackageManifestSchema` is its only definition; restating it in this file
 * would be the exact fork the file exists to avoid. Both sides read the *same*
 * schema instead — this workspace through zod, the submissions repository
 * through `ajv` over the generated `agent-package-manifest.schema.json`, which
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
 * ⚠️ **`LintOptions` stood here and §E55 emptied it.** (2026-08-21)
 *
 * It carried one member, `decisionActions`, and one rule read it —
 * `worked-example-per-action`, retired below. An option nothing reads is worse
 * than none: its comment argued a staleness the code had stopped checking, and
 * this repository has a rule about indicative comments that no longer hold.
 *
 * Removing it rather than leaving it empty is what makes the vendored copy
 * honest too — `submissions/tools/lint/` no longer needs
 * `decision-proposal.schema.json` to recover an enum nobody compares against.
 */

/** The one substitution a prompt bundle may contain. Mirrors `agent-runtime`. */
export const INVOCATION_MARKER = '{{INVOCATION}}'

/**
 * A locale tag a translation may be keyed by. (§E22)
 *
 * A second implementation of `@aumos/aap`'s `LOCALE_TAG`, and it is here because
 * this file is copied verbatim into a public repository, so it may not import
 * the schema that owns the pattern. What keeps the copy honest is that the rule
 * is one regex, and `rules.test.ts` asserts both directions of it.
 */
const LOCALE_TAG = /^[a-z]{2}(-[A-Z]{2})?$/

interface ManifestView {
  readonly capabilities: readonly string[]
  readonly configSchema: string | undefined
  readonly readme: string | undefined
  /** Contributed agent ids, so a translation cannot name one that is not here. */
  readonly agentIds: readonly string[]
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
    agentIds: Array.isArray(field(field(raw, 'contributes'), 'agents'))
      ? (field(field(raw, 'contributes'), 'agents') as unknown[])
          .map((agent) => text(field(agent, 'id')))
          .filter((id): id is string => id !== undefined)
      : [],
    provenance:
      notice !== undefined && licenseHolder !== undefined && commit !== undefined
        ? { notice, licenseHolder, commit }
        : undefined,
  }
}

/**
 * A path a manifest names, resolved the way `loadAgentPackage` resolves one.
 *
 * The map has no directories and no `..` to walk, so the check is a string
 * check — which is the same posture `bundlePathSchema` takes and for the same
 * reason: a rewritten path is a file that lands somewhere its author did not
 * name.
 */
function normalise(path: string): string {
  return path.replace(/^\.\//, '')
}

export function lintAgentPackage(files: PackageFiles): readonly Problem[] {
  const problems: Problem[] = []
  const problem = (rule: string, message: string): void => {
    problems.push({ rule, message })
  }

  // ── the manifest exists and is JSON ──────────────────────────────────────
  const manifestText = files['manifest.json']
  if (manifestText === undefined) {
    return [{ rule: 'manifest-present', message: 'there is no manifest.json' }]
  }
  let raw: unknown
  try {
    raw = JSON.parse(manifestText)
  } catch (error) {
    return [
      {
        rule: 'manifest-present',
        message: `manifest.json is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    ]
  }
  const manifest = readManifest(raw)

  // ── the prompt bundle ────────────────────────────────────────────────────
  //
  // Lexical filename order and nothing else — the numeric prefixes *are* the
  // ordering, so a renamed file reorders the reasoning and a reader can see it
  // in the diff.
  const sections = Object.keys(files)
    .filter((path) => path.startsWith('prompt/') && path.endsWith('.md'))
    .sort()
  if (sections.length === 0) {
    problem('prompt-bundle', 'there is no prompt/ directory with .md sections in it')
  }
  const bundle = sections.map((path) => files[path] ?? '').join('\n')
  const lowered = bundle.toLowerCase()
  const jsonBlocks = (bundle.match(/```json\n[\s\S]*?```/g) ?? []).join('\n')

  // ── the paths the manifest names lead somewhere ──────────────────────────
  //
  // `loadAgentPackage` refuses a dead path at load, and refuses one that escapes
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
      if (key !== 'description' && key !== 'agents') {
        problem(
          'translation-is-a-document',
          `${path} has a key called ${key}, and a translation carries two: description, and agents[] matched by id`,
        )
      }
    }

    // (3) A methodology filed against an agent this package does not
    //     contribute. The entries are matched by id precisely so a reordered
    //     `contributes.agents` cannot reattach a paragraph to the wrong agent;
    //     an id matching nothing is that same defect arriving as a typo.
    const agents = field(translation, 'agents')
    if (Array.isArray(agents)) {
      for (const entry of agents) {
        const id = text(field(entry, 'id'))
        if (id !== undefined && !manifest.agentIds.includes(id)) {
          problem(
            'translation-names-an-agent',
            `${path} names the agent ${id}, which this package does not contribute — so that paragraph is drawn for nobody`,
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

  // ⚠️ **`closed-lane-sees-the-book` stood here and §E48 deleted it.**
  //
  // It required `portfolio:read` of a package that declared no CLI tools, on the
  // argument that such an agent could see nothing at all, so a bundle reasoning
  // about a book without it was describing a book it was never shown. There is
  // no such package: every session reaches the web and a shell whatever the
  // manifest says, and a package may legitimately ask for zero capabilities.
  //
  // ── the marker ───────────────────────────────────────────────────────────
  //
  // What makes a bundle a *prompt* rather than an essay. The failure it guards
  // is silent: a run against a markerless bundle produces a beautifully
  // structured set of instructions about no particular asset, and succeeds.
  const markers = bundle.split(INVOCATION_MARKER).length - 1
  if (markers !== 1) {
    problem(
      'invocation-marker',
      `the bundle carries ${markers} ${INVOCATION_MARKER} markers and must carry exactly one`,
    )
  }

  // ⚠️ **`worked-example-per-action` and `rationale-field-shape` stood here, and
  // §E55 retired them.** (2026-08-21)
  //
  // They existed because `decision_submit` published `{"type":"object"}` and
  // nothing else, so the only specification a model could read was whatever
  // prose the package happened to carry. Three real `claude` runs reached
  // `invalid-proposal` that way, one field along each time:
  //
  // | | what was missing |
  // |---|---|
  // | M6.5 | `watches` described in prose and never *shown* → the model invented `note` |
  // | M8s  | a WAIT example only, so `target` was described and never shown → invented `target.type` |
  // | M11d | `uncertainty` named in one sentence → guessed a string where the schema wants a list |
  //
  // The reading was right — *prose beside a strict schema is not a
  // specification* — and the conclusion was the affordable one at the time:
  // make every package write the specification out again, in JSON, in its own
  // words. §E55 published the specification instead. `decision_submit`'s input
  // schema is `decisionProposalSchema` itself, derived at run time from the
  // object `judgeProposal` validates against, and it states every one of the
  // three things above directly — `watches`' members, which actions take a
  // `target`, that `uncertainty` is an array.
  //
  // So the rules did not become wrong; they became a demand that each package
  // **duplicate a published schema**, which is the cost §E55 exists to remove.
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

  // ── another language, shown rather than described ────────────────────────  // ── another language, shown rather than described ────────────────────────
  //
  // `language` invites M6.5's mistake one level worse: a model told to answer in
  // Korean has every reason to translate `action` too, and one translated enum
  // discards the judgement entirely. The second half of this is the load-bearing
  // one — an example that translated its keys would teach the failure rather
  // than the rule.
  if (!bundle.includes('language')) {
    problem('language-is-shown', 'the bundle never mentions language')
  }
  if (!/[가-힣]/.test(bundle)) {
    problem(
      'language-is-shown',
      'the bundle has no worked example in a non-English language, so a model answering in one has to guess what stays English',
    )
  }
  for (const key of bundle.match(/"[^"\n]+"\s*:/g) ?? []) {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the ASCII range is the point
    if (!/^[\x00-\x7f]+$/.test(key)) {
      problem('language-is-shown', `a JSON key in the bundle is not English: ${key}`)
    }
  }

  // ── what the bundle has to say out loud ──────────────────────────────────
  //
  // ⚠️ **This was two branches until §E48**, split on the lane. The closed one
  // required the bundle to state the `asOf` frame and refused phrases that
  // invited the agent around a TimeGate (`closed-lane-states-the-frame`); the
  // open one required it to name what the lane cost. There is no lane, so there
  // is one branch — and it is the second one, because the frame the first one
  // described stopped binding at §E21.
  //
  // The two failures below are the ones a model makes when nothing stops it, and
  // both are silent: filing Evidence it did not receive, and treating `asOf` as
  // decoration. ⚠️ The third needle was the literal words *open lane*, and it
  // went with the lane rather than being reworded — a bundle naming a concept
  // this host no longer has would be a bundle the lint taught to lie.
  //
  // That needle had already been measured doing harm before §E48 reached it: on
  // 2026-08-20 it failed `undervalued-now` **for no longer saying the word**,
  // which is a lint demanding vocabulary the project had stopped using. Removing
  // a needle can only turn a red bundle green, so no submission that passed
  // before can fail now.
  for (const [needle, why] of [
    [
      'evidenceids',
      'the bundle never mentions evidenceIds, so nothing stops the model inventing one',
    ],
    ['asof', 'the bundle never mentions asOf'],
  ] as const) {
    if (!lowered.includes(needle)) problem('bundle-says-what-it-costs', why)
  }

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

  // ── the cadence suggestion, when there is one (§E47 path A) ───────────────
  //
  // ⚠️ **A file, not a manifest field, and the linter is the only reader that
  // reports on it.** `agentPackageManifestSchema` is a `strictObject`, so a new
  // key makes a shipped binary refuse the whole document; §E47 measured that
  // `engines.aumos` cannot gate it either, because the manifest is parsed
  // *before* engines is read. So the value lives in `cadence.json`, which an
  // old binary simply does not look at.
  //
  // The cost of that invisibility is that the **app** cannot complain: a
  // suggestion that will not parse is dropped there, because a pre-fill must
  // never be able to stop an install. This is where the author hears about it,
  // which is the only place the message can reach the person who wrote the file.
  const cadenceText = files['cadence.json']
  if (cadenceText !== undefined) {
    let cadence: unknown
    try {
      cadence = JSON.parse(cadenceText)
    } catch (error) {
      problem(
        'cadence-is-readable',
        `cadence.json is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
      cadence = undefined
    }
    if (cadence !== undefined) {
      const value =
        typeof cadence === 'object' && cadence !== null
          ? (cadence as { readonly cadenceDays?: unknown }).cadenceDays
          : undefined
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        problem(
          'cadence-is-readable',
          'cadence.json has to be {"cadenceDays": n} where n is a number of days greater than ' +
            'zero. Aumos drops a file it cannot read rather than refusing the package, so a ' +
            'typo here is a suggestion that silently never appears. Delete the file to suggest ' +
            'nothing — that is what an absent one means.',
        )
      }
    }
  }

  return problems
}
