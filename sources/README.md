# Data sources

A **data source** is a vendor Aumos holds a credential for and will make requests to.
You describe one in a single JSON document; Aumos keeps the key, signs the request,
refuses any path you did not declare, and hands the agent back exactly what the vendor
sent — unread.

Open a pull request that adds one directory here:

```
sources/your-source-id/
  source.json           the document
  README.md             what this vendor is, and what an agent gets from it
```

The rules, and how to check them before you open the pull request, are in
**[CONTRIBUTING.md](../CONTRIBUTING.md#submitting-a-data-source)** —
[한국어](../docs/contributing/CONTRIBUTING.ko.md).

⚠️ **This directory is empty on purpose.** The sources Aumos itself publishes
(`sec-edgar`, `alpaca`, `openbb-fmp`, `toss`) live in **`first-party-sources/`** in
this repository and are listed beside whatever is here in
[`.aumos/sources.json`](../.aumos/sources.json) — the same arrangement `agents/` and
`first-party/` are in. A separate directory because the publisher name `aumos` is
reserved, and one directory holding both would let a submission claim it.
Nothing has been submitted yet; yours would be the first.
