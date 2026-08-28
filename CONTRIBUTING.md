# Submitting to the Aumos catalogue

<sub><a href="docs/contributing/CONTRIBUTING.ko.md">한국어</a></sub>

Two kinds of thing arrive here and they are not alike. A **ManagerPackage** is an
investment methodology written as prose. A **data source** is one JSON document naming
a vendor, its endpoints, and what you have to supply to reach it. The first half of
this page is the package; [the second](#submitting-a-data-source) is the source.

## The shape

One directory under `managers/`, named exactly what your `aumos.json` says its `id`
is. The directory name **is** the package id, so that a reviewer reading the tree is
reading the catalogue.

```
managers/your-package-id/
  aumos.json                    the manifest. This filename, not another
  PROMPT.md                     the methodology, and the entry point
  README.md                     the page a person reads before installing
  .claude-plugin/plugin.json    required when `runtimes` lists `claude`
  AGENTS.md                     required when `runtimes` lists `codex`
  skills/<name>/SKILL.md        optional
  .mcp.json                     optional — servers this package brings
  icon.svg                      optional
  config.schema.json            optional
  README.ko.md + translations/ko.json    optional, and a pair
  NOTICE.md                     required if this is a port
```

⚠️ **This shape replaced one that some older issues still describe.** A `manifest.json`
and a numbered `prompt/00-….md … 90-….md` bundle were the shape until #286 retired the
`prompt-bundle` rule; the manifest constant is `aumos.json` (`rules.ts` →
`MANIFEST_FILENAME`) and the prompt default is `PROMPT.md` (`DEFAULT_PROMPT_PATH`). A
package built to the old description fails `manifest-present` and `prompt-present` at
once, which is a first pull request refused for reading our own documentation.

### `PROMPT.md` is an entry point, not a size limit

One file replaced a numbered directory, and that is **not** an instruction to write a
shorter methodology. What changed is *when* the material is read: `PROMPT.md` is what a
session always loads, and everything conditional belongs in `skills/<name>/SKILL.md`,
which the prompt names and the model loads only when it reaches the case. A stage that
applies to one market, one task or one degraded source is a skill; a stage every run
walks through is prose in `PROMPT.md`.

`manifest.prompt` may name a different path if you want one — `PROMPT.md` is the
default, not a requirement. The filename is the only part of this that is free.

### The runtime files, which the lint requires and nothing else mentions

`runtimes` in your manifest says which loader your files are for, and the lint checks
that the files that loader reads are actually there — **the absence only**, never the
presence of extras. A package may legitimately ship both sets.

| `runtimes` contains | the file that must exist | what its absence costs |
|---|---|---|
| `claude` | `.claude-plugin/plugin.json` | `--plugin-dir` loads a directory with no plugin in it, and the session starts with none of your skills, hooks or MCP servers |
| `codex` | `AGENTS.md` | it is the only convention codex reads, and Aumos does not translate the claude plugin for it |

If you ship a `.mcp.json`, it must parse, and **no server in it may be named `aumos`** —
the gateway is written under that name and one would silently replace the other. Aumos
reads that file only as far as the server names, because `--strict-mcp-config` means a
server it does not write into the run's config does not exist.

Run the checks before you open the pull request:

```bash
npm install
npm run lint
```

That is the same lint the Aumos repository runs at merge — the files under
`tools/lint/` are copied out of it, and a test there fails Aumos's build the moment
the copy differs. See [`tools/lint/VENDORED.md`](tools/lint/VENDORED.md).

## The rules, and why each one is there

Every rule below is enforced by `npm run lint`. Each one was written after something
broke.

### Your manifest is the permission document

Aumos never reads your prompts to work out what your manager might do. The inside of an
manager is treated as opaque, so what a package may do comes from `capabilities` and
from nowhere else — and that list is shown to the investor, with **your** reason
beside each entry, on the screen where they decide.

There is no `broker:write` capability. Not "it is denied" — the enum does not contain
it, and a capability whose name reads like a way to trade is refused.

### Say what your bundle costs

⚠️ **There was a `lane` field and there is not one any more.** A manifest used to declare
`tools` — `web`, `shell`, `files`, `fanout` — and a `closed` package was one that declared
none: no shell, no web, everything through the Aumos Skill Gateway. **Aumos withholds none
of that any longer.** Whatever the coding CLI your manager is launched on happens to ship, the
session holds; there is no field that takes a tool away, and no screen says there is.

That is not a relaxation Aumos made lightly. What it replaced was a hand-written list of
one vendor's built-in tool names, at one version, and it was measured: a built-in nobody
had written down ran **without so much as asking**, and the check built to keep the list
current could not see names the CLI's own inventory omits. A permission a host does not
enforce is the author's prose wearing a permission document's clothes.

So every bundle has to say out loud what its reach costs — it must name `evidenceIds` and
`asOf`. The two mistakes a model makes when nothing stops it are filing evidence it never
received and treating `asOf` as decoration, and both failures are silent.

**Do not write that your manager has no shell, no web, or no filesystem.** It has whatever
its CLI ships. What actually contains it is the OS account Aumos launches that CLI as, and
that is a property of the investor's machine rather than of your package.

### Show the shape. Never describe it.

This is the rule that has cost the most, three times, always the same way: a real
`claude` run reached `invalid-proposal` and a strict schema discarded an entire
judgement.

| | what was missing |
|---|---|
| 1 | `watches` was described in prose and never shown → the model invented field names |
| 2 | only a `WAIT` example was given, so `target` was described and never shown |
| 3 | `uncertainty` was named in one sentence → the model guessed a string; the schema wants a list |

⚠️ **The lint used to require you to fix this yourself, and it does not any more.**
Three rules stood here — a worked JSON example for every action, every `rationale`
field you name shown as an array, and a non-English example with ASCII keys. They
existed because `decision_submit` published `{"type":"object"}` and nothing else, so
the only specification a model could read was whatever prose its package carried.

**#269 published the specification instead.** `decision_submit`'s input schema is
`decisionProposalSchema` itself, derived at run time from the object the judge
validates against, and it states all three directly — what `watches` members are,
which actions take a `target`, that `uncertainty` is a list. So the rules did not
become wrong; they became a demand that every package **duplicate a published
schema**. They were retired against a measurement rather than an argument: a real
`claude` run against a trimmed bundle reached `decided`.

What that means for you: **do not copy the protocol into your package.** Write what is
true of *your* methodology and let the host state the wire format — the Aumos MCP
server returns it from `initialize`, once per session. Every merged package says so in
one line, and the sentence is worth stealing: *"The protocol is not here."*

Show a shape when the shape is **yours** — a `targets` array your REBALANCE always
carries, a `watches` trigger your methodology fixes rather than chooses (see
`undervalued-now`, which pins its interval and says why). Those are decisions the
schema cannot make for you.

### Multi-position proposals carry `targets`, not `target`

A judgement about one position carries `target`; a `REBALANCE` that moves several
carries `targets`, an array of the same members. It is the field a manager that
proposes a whole book needs, and it is easy to miss because the singular is what the
single-asset examples show.

```jsonc
{ "action": "REBALANCE",
  "targets": [
    { "type": "position-weight", "asset": { … }, "targetWeight": 0.4 },
    { "type": "cash-weight", "targetWeight": 0.1 }
  ] }
```

⚠️ **There was a `{{INVOCATION}}` marker and there is not one any more.** A rule here
required exactly one of them in the bundle, #270 relaxed it to at most one, and #286
deleted the substitution itself. There is no templating in a prompt file: `invocation_read`
is the only way a manager gets the AMP document, and that was the trade — a prompt that
was interpolated leaves no row, and a tool call does.

### If it is somebody else's work, ship their notice

Porting a prompt makes a derivative work. If your package is one, `aumos.json`
carries a `provenance` block — and the licence obligation is about the copyright
*line*, not the SPDX id, so:

- `provenance.notice` names a file **in your package**, and it is there;
- that file contains `provenance.licenseHolder` verbatim;
- `provenance.commit` is a full 40-character commit. A branch name moves, and then
  names nothing.

A package that declares a provenance it did not ship does not load. This is not
politeness — it is the licence.

### Your README is the page an investor chooses from, and it has a shape

The catalogue deliberately shows no returns, so what a person decides on is your README.
It is rendered verbatim on your catalogue page, and it is read by people who are not
engineers — so it carries **six sections, with these headings, in this order**:

| `README.md` | `README.ko.md` | what belongs there |
|---|---|---|
| `## In one paragraph` | `## 한 문단 요약` | what this manager does, in plain words, with no jargon left undefined |
| `## The methodology` | `## 방법론` | the principles it judges by, what it deliberately does not do, and a short glossary of any term you had to use |
| `## How a run works` | `## 실행 흐름` | the run drawn as a **`mermaid` diagram**, plus its cadence |
| `## What it needs` | `## 필요한 것` | markets, data sources, what a key costs, settings, and where a person has to approve |
| `## What it is bad at` | `## 약한 지점` | the shape of market it is wrong in, and who should *not* install it |
| `## Notes` | `## 덧붙임` | everything else — provenance, known limits, withdrawn claims, install detail |

`npm run check:docs` refuses a package README that answers five of the six, answers them
in another order, or carries no fenced `mermaid` block. Sub-headings under a section are
free.

**The order is not a style preference.** Two managers compared side by side have to answer
the same question in the same place, or a catalogue of eight is eight essays. Before this
was fixed, three of the eight packages had no flow section at all and no two of them named
the same heading twice.

Three things to keep off that page:

- **Do not claim a track record.** Typical behaviour is a set of numbers Aumos measures
  from actual runs. A README that quotes a return is quoting a backtest.
- **Do not draw the package's file tree.** [The shape](#the-shape) is this document's job,
  and a tree copied into a README is the thing that went stale last time.
- **Do not write it for the person maintaining it.** Port audits, state ownership tables,
  operation names and fixture inventories belong in a second document beside the README —
  `evidence-gated` keeps its in `ARCHITECTURE.md`, and `basic-investor` keeps its authoring
  walkthrough in `WALKTHROUGH.md`. Both are linked from the `## Notes` section, and both
  are guarded: any `X.md` with an `X.ko.md` beside it is held to the same structure.

### Everything is text

Every file in your directory is UTF-8 text. No binaries, no symlinks. The published
format is a map of path to file contents, and it cannot carry anything else.

### Another language, if you have one

`aumos.app` is read in English and in Korean, and until now the *chrome* was
translated and everything a package carried was not: your summary, your methodology
and your README arrived in whatever language you wrote them in, on a page whose
headings were in the reader's. A package may now carry its own translations, and it is
never required to — a page draws the original and **says** which case it is in.

**Both halves are files.** Nothing goes into `aumos.json`, and that is a
measurement rather than a style: the manifest schema is strict, so a key that a
*shipped* copy of Aumos does not know makes your package `unreadable` on that
machine — not "installs with a warning", unreadable, a catalogue row nobody can get.
Files are free: nothing validates the set of files a package contains.

```
managers/your-package-id/
  README.md
  README.ko.md            ← the declared `readme` path with the locale before the extension
  translations/ko.json    ← the short strings
```

```jsonc
// translations/ko.json
{
  "description": "카탈로그 격자에 실리는 한 줄.",
  "managers": [{ "id": "your-package-id", "description": "방법론 문단." }]
}
```

- The **filename** is a language and optionally a region: `ko.json`, `pt-BR.json`. A
  name that is not one is refused, because nothing can draw a translation it cannot
  find.
- A document carries **two keys** and no others — `description` and `managers` — so a
  `summary` you wrote is refused here rather than silently never drawn.
- Each entry in `managers` is matched **by `id`**, so reordering `contributes.managers`
  never reattaches a paragraph to the wrong manager. An id your package does not
  contribute is refused for the same reason: that paragraph would be drawn for nobody.
- The translated README's path is **derived, not declared** — `README.md` becomes
  `README.ko.md`, and a manifest declaring `docs/METHOD.md` translates it at
  `docs/METHOD.ko.md`. A file in that shape whose middle segment is not a locale is
  refused, because it would be published and read by nothing.
- **Your package's `name` is not translatable and there is no field for it.** One id
  means one thing across the catalogue, the kill list and the investor's own log.
- Neither is `NOTICE.md`. A translated licence notice is not the notice.

Translate one half and not the other if that is what you have time for. A Korean
summary over an English README is an ordinary state and the page says so.

## Submitting a data source

A data source is a vendor Aumos holds a credential for and will make requests to. It is
**one document**, not a directory of prose, and what it can say is deliberately small:
an id, the hosts it reaches, what the investor has to supply, and the endpoints an
manager may ask for.

```
sources/your-source-id/
  source.json
  README.md
```

```bash
npm install
npm run lint:sources
```

⚠️ That command is **not** the ManagerPackage lint's counterpart, and the difference is
in your favour. The package lint is fast feedback and the real rules run again at the
merge. This one runs both halves of the real check — a schema generated from the same
zod source Aumos parses with, and `coherence.ts`, which is the same file Aumos runs.
A green tick here means what the merge means, minus one rule named below.

### What a source may and may not say

`source.json` is `SourceSpec/1`. Every field is a literal, a number, or a member of a
closed enum, and an unanticipated key does not parse — so **a document cannot express
an executable**, by shape rather than by inspection. There is no field whose contents
are evaluated, no regular expression you supply, and no way to name an environment
variable: Aumos composes the variable your credential arrives in, because the process
that reads it is the one holding broker keys.

What a document also cannot say is **what shape the answer should be**. Aumos does not
map, rename, date or trim a vendor's response; the manager receives what the vendor sent
and makes whatever it needs out of it, with its own code.

### It reaches only where it declared

`https` only. No loopback, link-local or private address — a credential pointed at a
local address is how a credential *fetch* becomes a credential *theft*, and cloud
metadata lives in exactly that range. Every endpoint's host must be one your `hosts`
declares, no path may contain a `..` segment, and the filled URL is re-checked before
every request rather than trusted from parse time.

The one exception is a document that declares `"local": true`, and it is a bargain
rather than a hole: such a document may declare loopback hosts **only**, so it is never
a bridge, and may declare **no credentials at all**, so there is nothing to carry to
that address. It also does not run until the investor names its id on their own
machine.

### It may not relay a broker

A broker is the one vendor where the credential that reads is the credential that
trades. A document declaring an endpoint on a broker's host is refused — and this is
the **one rule `npm run lint:sources` cannot run**, because it reads Aumos's own
connector table, which is not published. It runs at the merge and at the install, so it
can never publish anything; it can only refuse a submission that tried.

### If the vendor issues a session

`auth` names one behaviour — RFC 6749 client credentials — and the flow is Aumos's,
written once. You name the token endpoint and which two of your declared credentials
are the client id and secret; both must be `required`, because a document whose session
cannot be established is one that stands up and then fails every request with a 401,
which reads on screen as a broken vendor rather than as a missing key. Cursor
pagination is **not** expressible, and that is not a near miss of the same thing: a
cursor loop's termination depends on a response, so there is no fixed behaviour to
name.

### Your README is for a person

It is required, and nothing checks what is in it. It is the page an investor reads
before they type a credential into their keychain — so say what the vendor is, what an
manager gets from it, what a key costs and where to get one, and what the data does not
cover.

### And a source may be read in two languages too

The same two files, and a document carries the one string in `SourceSpec/1` that a
person reads and the interpreter does not — `caveat`. Everything else in that format
is a host, a path, a header or a credential name, which is the wire and is never
translated. It does **not** go into `source.json`, for the reason it does not go into
a manifest: that schema is strict too, and an installed source that stops parsing is a
source that stops answering on a machine that was working.

```
sources/your-source-id/
  README.md
  README.ko.md
  translations/ko.json      // { "caveat": "이 주장이 깨지는 지점." }
```

## Review

We merge. That is a bottleneck by design at this size, and it is written down as one:
a pull request review is a human gate, and a human gate is worth exactly the attention
the reviewer had that day. It holds because there is no code here to hide anything in.
The day this repository accepts anything executable, that reasoning stops working and
the gate has to be rebuilt before the door opens.

What review is for:

- **Is the methodology distinguishable?** Two packages that reason the same way are
  one package installed twice, and Aumos measures them as separate rows — which
  reports a difference that came from sampling rather than from method.
- **Does the README describe how it reasons?** It is the page an investor chooses
  from, and the catalogue leads with methodology because it deliberately shows no
  returns.
- **Do the capabilities match the prompt?** Asking for data the bundle never uses is
  a permission an investor is granting for nothing.

## The publisher name

`metadata.publisher` is who wrote it, and it is **yours**. Use a name you can be
reached at — a GitHub handle is the ordinary answer — and use the same one across
your packages, because a collection is `publisher` **and** `collection.id`, so two
spellings are two collections.

⛔ **`aumos` is reserved and a submission may not claim it.** It names the packages
untilled publishes here, and those are listed in `.aumos/first-party.json`;
`npm run check:publisher` refuses an entry that wears the name without a line in
that file. If your pull request needs to touch that file, it is doing something
other than adding a package.

⚠️ Attribution used to be structural — this repository held `first-party/` beside
`agents/` and the path was the provenance — and #48 merged them into `managers/`.
The roster and that check are what stand in its place, and `tools/check-publisher.mjs`
is deliberately blunt that they are **not** enforcement: a pull request can edit
them. What they buy is that the claim shows up as its own diff instead of as a
field inside one you were writing anyway.

## Versions

`version` is semver. Publishing `0.2.0` does not remove `0.1.0` — the index carries
whatever is in this repository, and an id-and-version pair is published once and dated
once. Bump it in the same pull request that changes the package.

## What we do not do here

- **We do not edit your package on the way past.** The published artifact is every
  file in your directory, exactly as you wrote it, and your README is rendered
  verbatim on your catalogue page.
- **We do not sign packages yet.** What binds a published artifact to its index entry
  today is a SHA-256 in `registry.json`, generated in one place from the same bytes
  that are served. A signature becomes necessary when the index and the artifacts can
  be served by parties that are not the same party; until then a digest is doing that
  job and the withdrawal list covers everything after publication.
