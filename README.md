# aumos-catalogue

<sub><a href="docs/readme/README.ko.md">한국어</a></sub>

The submission path for the [Aumos](https://aumos.app) catalogue. Two kinds of thing
are published from here, and neither contains code.

A **ManagerPackage** is an investment methodology written as prose: a manifest that
declares what data it may read, and a prompt bundle that says how it reasons. The
published form is a JSON document of file paths to text, so there is no field an
executable could live in.

```
managers/
  your-package-id/
    aumos.json                  what it may read, and the author's reason for each
    PROMPT.md                   the methodology — one file, and the entry point
    README.md                   how it reasons — the page a person chooses from
    .claude-plugin/plugin.json  required when `runtimes` lists `claude`
    skills/…/SKILL.md           optional — what PROMPT.md loads only when it needs it
    icon.svg                    optional — the catalogue card's mark
    config.schema.json          optional
    README.ko.md                optional — with translations/ko.json beside it
    NOTICE.md                   required if this is a port of somebody else's work
```

⚠️ **There was a `manifest.json` and a numbered `prompt/` directory, and there is
neither any more.** The manifest is `aumos.json`; the bundle is one `PROMPT.md`. No
package in this repository has ever had the old shape, and `npm run lint` refuses it —
[CONTRIBUTING.md](CONTRIBUTING.md) is where the current shape is stated in full.

A **data source** is a vendor Aumos holds a credential for and will make requests to:
one document naming the hosts it reaches, what the investor has to supply, and the
endpoints a manager may ask for. Aumos keeps the key, signs the request, refuses any
path the document did not declare, and hands back exactly what the vendor sent —
unread. Every field is a literal, a number or a member of a closed enum, so a document
cannot express an executable any more than a package can.

```
sources/
  your-source-id/
    source.json            id, hosts, credentials, endpoints
    README.md              what the vendor is, and what a key costs
```

Open a pull request that adds one directory, and it becomes an entry in the catalogue
an installed copy of Aumos reads. **This repository was `aumos-agents` until it took
its second kind of submission** (2026-08-16); GitHub redirects the old name, so an
existing clone or link still resolves.

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening one — [한국어](docs/contributing/CONTRIBUTING.ko.md).
It is short, and it is where the rules are argued rather than merely listed.

## What happens to a merged submission

**The merge is the publication.** Since untilled/aumos#323 an installed Aumos reads the
two index documents in this repository **directly, over HTTPS, at `HEAD`** — no build
step, no queue, nothing to press:

| what is read | where it comes from |
|---|---|
| `raw.githubusercontent.com/untilled/aumos-catalogue/HEAD/.claude-plugin/marketplace.json` | this repository, at whatever `HEAD` is when the machine fetches it |
| `raw.githubusercontent.com/untilled/aumos-catalogue/HEAD/.aumos/sources.json` | the same, for data sources |
| `codeload.github.com/<owner>/<repository>/tar.gz/<sha>` | a package's **bytes** — the address is composed from the entry, never named by it |

`HEAD` rather than `main` deliberately: a catalogue whose default branch is called
something else would otherwise be unreachable for a reason nobody could see.

⚠️ **So a merged submission is live to every machine that fetches after it, and an entry
that machine cannot parse is skipped rather than reported to you.** That is what
`tools/check-index.mjs` exists to prevent — it is the only place that judges these two
documents before they are served.

Aumos also publishes two faces of each catalogue from one generator, in one pass:

| | |
|---|---|
| `releases.aumos.app/agents/registry.json` | the machine index of packages, with a SHA-256 of each published artifact |
| `aumos.app/managers` | the page a person reads before installing one |
| `releases.aumos.app/sources/sources.json` | the machine index of data sources, the same way |
| `aumos.app/sources` | and its page |

⚠️ **The two `releases.aumos.app` rows are a mirror, not the publication path, and this
page said otherwise until untilled/aumos-catalogue#116.** They are the **frozen** index —
what copies of Aumos older than #323 fetch — and Aumos's own generator is explicit about
which of the two is the real one: *"this is not where a package is published: publication
is a commit to the catalogue repository's `marketplace.json`, and this only mirrors that
document onto the frozen host."* The two `aumos.app` rows are the human face of the same
list.

Neither pair can describe different catalogues, because each is written from one list —
and this repository is one of the two places every list is built from. The other is
what Aumos itself ships. **Packages and sources share one id namespace across both
indexes**, which is what lets a single withdrawal list govern both: one id means one
thing, and a source may not be called what a package is called.

## What this repository is not

- **Not a place for code.** There is no runtime here, no build, no dependency you can
  add. If your methodology needs to execute something, it is not a ManagerPackage yet;
  if your data source needs to reshape a response, that is not a document's job —
  say so in an issue rather than working around the format.
- **Not a leaderboard, and not a claim about returns.** Nothing here records how a
  package performed. Aumos measures every installed manager forward on the investor's
  own book, and the catalogue carries no performance figure at all — so there is
  nothing on these pages anything could be ranked by.

## Withdrawal

A merged package or source can be stopped on machines that already have it, without
touching them, through the **one** withdrawal list Aumos publishes and every installed
copy checks — one list because one id means one thing. Judgements already sealed are
never rewritten.

## Licence

Each package carries its own `license` field, and a ported one carries the original
notice inside it. This repository's own files (`tools/`, workflows, documentation)
are MIT.
