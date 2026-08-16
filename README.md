# aumos-catalogue

<sub><a href="docs/readme/README.ko.md">한국어</a></sub>

The submission path for the [Aumos](https://aumos.app) catalogue. Two kinds of thing
are published from here, and neither contains code.

An **AgentPackage** is an investment methodology written as prose: a manifest that
declares what data it may read, and a prompt bundle that says how it reasons. The
published form is a JSON document of file paths to text, so there is no field an
executable could live in.

```
agents/
  your-package-id/
    manifest.json          what it may read, and the author's reason for each
    prompt/                the methodology, in numbered Markdown stages
      00-role.md
      …
      90-output.md
    README.md              how it reasons — the page a person chooses from
    config.schema.json     optional
    NOTICE.md              required if this is a port of somebody else's work
```

A **data source** is a vendor Aumos holds a credential for and will make requests to:
one document naming the hosts it reaches, what the investor has to supply, and the
endpoints an agent may ask for. Aumos keeps the key, signs the request, refuses any
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

Aumos publishes two faces of each catalogue from one generator, in one pass:

| | |
|---|---|
| `releases.aumos.app/agents/registry.json` | the machine index of packages, with a SHA-256 of each published artifact |
| `aumos.app/agents` | the page a person reads before installing one |
| `releases.aumos.app/sources/sources.json` | the machine index of data sources, the same way |
| `aumos.app/sources` | and its page |

Neither pair can describe different catalogues, because each is written from one list —
and this repository is one of the two places every list is built from. The other is
what Aumos itself ships. **Packages and sources share one id namespace across both
indexes**, which is what lets a single withdrawal list govern both: one id means one
thing, and a source may not be called what a package is called.

## What this repository is not

- **Not a place for code.** There is no runtime here, no build, no dependency you can
  add. If your methodology needs to execute something, it is not an AgentPackage yet;
  if your data source needs to reshape a response, that is not a document's job —
  say so in an issue rather than working around the format.
- **Not a leaderboard, and not a claim about returns.** Nothing here records how a
  package performed. Aumos measures every installed agent forward on the investor's
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
