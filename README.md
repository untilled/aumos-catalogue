# aumos-agents

The submission path for the [Aumos](https://aumos.app) agent catalogue.

An **AgentPackage** is an investment methodology written as prose: a manifest that
declares what data it may read, and a prompt bundle that says how it reasons. It
contains no code and cannot contain any — the published form is a JSON document of
file paths to text, so there is no field an executable could live in.

Open a pull request that adds one directory under `agents/`, and it becomes an entry
in the catalogue an installed copy of Aumos reads.

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

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening one. It is short, and it is
where the rules are argued rather than merely listed.

## What happens to a merged package

Aumos publishes two faces of the same catalogue from one generator, in one pass:

| | |
|---|---|
| `releases.aumos.app/agents/registry.json` | the machine index, with a SHA-256 of your package's published artifact |
| `aumos.app/agents` | the page a person reads before installing |

They cannot describe different catalogues, because they are written from one list —
and this repository is one of the two sources that list is built from. The other is
the four packages Aumos itself ships.

## What this repository is not

- **Not a place for code.** There is no runtime here, no build, no dependency you can
  add. If your methodology needs to execute something, it is not an AgentPackage
  yet — say so in an issue rather than working around the format.
- **Not a leaderboard, and not a claim about returns.** Nothing here records how a
  package performed. Aumos measures every installed agent forward on the investor's
  own book, and the catalogue carries no performance figure at all — so there is
  nothing on these pages anything could be ranked by.

## Withdrawal

A merged package can be stopped on machines that already have it, without touching
them, through the withdrawal list Aumos publishes and every installed copy checks.
Judgements it already sealed are never rewritten.

## Licence

Each package carries its own `license` field, and a ported one carries the original
notice inside it. This repository's own files (`tools/`, workflows, documentation)
are MIT.
