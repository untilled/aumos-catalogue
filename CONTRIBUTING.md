# Submitting an AgentPackage

<sub><a href="docs/contributing/CONTRIBUTING.ko.md">한국어</a></sub>

## The shape

One directory under `agents/`, named exactly what your `manifest.json` says its `id`
is. The directory name **is** the package id, so that a reviewer reading the tree is
reading the catalogue.

```
agents/your-package-id/
  manifest.json
  prompt/00-….md … 90-….md
  README.md
```

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

Aumos never reads your prompts to work out what your agent might do. The inside of an
agent is treated as opaque, so what a package may do comes from `capabilities` and
from nowhere else — and that list is shown to the investor, with **your** reason
beside each entry, on the screen where they decide.

There is no `broker:write` capability. Not "it is denied" — the enum does not contain
it, and a capability whose name reads like a way to trade is refused.

### Say which lane you run in

| `lane` | what your agent gets | what it gives up |
|---|---|---|
| `closed` (default) | everything through the Aumos Skill Gateway | nothing — every figure it reads is recorded as evidence the investor can re-read, and none of it is dated later than the moment being judged |
| `open` | the web and a shell, on the investor's machine | evidence, the as-of bound, and the ability to be linked to a broker account at all |

A **closed** bundle has to state the frame it is inside: it must mention `asOf`, and
it must not tell the agent to go and look at today's price. An agent told to do
something it structurally cannot produces a transcript that reads like a blocked leak
rather than a run that never tried.

A **closed** package must also ask for `portfolio:read`. Without it, a closed agent
can see nothing at all, and a bundle that reasons about a book is describing a book it
was never shown.

An **open** bundle has to say out loud what the lane costs — it must name
`evidenceIds`, `asOf` and the open lane itself. The two mistakes a model makes when
nothing stops it are filing evidence it never received and treating `asOf` as
decoration, and both failures are silent.

### Show the shape. Never describe it.

This is the rule that has cost the most, three times, always the same way: a real
`claude` run reached `invalid-proposal` and a strict schema discarded an entire
judgement.

| | what was missing |
|---|---|
| 1 | `watches` was described in prose and never shown → the model invented field names |
| 2 | only a `WAIT` example was given, so `target` was described and never shown |
| 3 | `uncertainty` was named in one sentence → the model guessed a string; the schema wants a list |

So the lint checks **shape**, and never prose:

- a worked JSON example for **every** decision action — `WAIT`, `WATCH`, `BUY`,
  `SELL`, `RESIZE`, `HEDGE`, `REBALANCE`. A mention in a sentence is what all three
  lost runs already had.
- any `rationale` field you *name* (`counterArguments`, `uncertainty`) shown as an
  array in a fenced JSON block.
- `language` mentioned, and a worked example in another language — with every JSON
  **key** still ASCII. An example that translated its keys would teach the failure
  rather than the rule.

### Exactly one `{{INVOCATION}}`

Across the whole bundle. A bundle that forgot it sends a beautifully structured set of
instructions about no particular asset, and the run succeeds at answering a question
nobody asked.

### If it is somebody else's work, ship their notice

Porting a prompt makes a derivative work. If your package is one, `manifest.json`
carries a `provenance` block — and the licence obligation is about the copyright
*line*, not the SPDX id, so:

- `provenance.notice` names a file **in your package**, and it is there;
- that file contains `provenance.licenseHolder` verbatim;
- `provenance.commit` is a full 40-character commit. A branch name moves, and then
  names nothing.

A package that declares a provenance it did not ship does not load. This is not
politeness — it is the licence.

### Everything is text

Every file in your directory is UTF-8 text. No binaries, no symlinks. The published
format is a map of path to file contents, and it cannot carry anything else.

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
