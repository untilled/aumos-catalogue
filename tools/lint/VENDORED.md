# Vendored

Everything in this directory except this file is **generated**. It is copied out of
the Aumos repository by `packages/package-lint/scripts/vendor.ts`, and a test there
fails Aumos's own build the moment the copy differs from its source.

Do not edit it here. A fix made here would pass this repository's CI and be
refused at the merge, which is the exact failure this arrangement exists to
prevent.

| file | source |
|---|---|
| `rules.ts` | `packages/package-lint/src/rules.ts` |
| `read.ts` | `packages/package-lint/src/read.ts` |
| `agent-package-manifest.schema.json` | `packages/aap/schema/` — generated from zod |
| `decision-proposal.schema.json` | `packages/aap/schema/` — generated from zod |
| `main.ts` | written by `vendor.ts`; it is the only glue |

**This lint is not the gate.** It is your fast feedback. The catalogue is
generated in the Aumos repository, and the same rules run there — from source
rather than from this copy — over every submitted package, as part of producing
`registry.json`. A green tick here is what a reviewer starts from, not what
publishes anything.
