# basic-investor

**The reference ManagerPackage, and the walkthrough for building one.**

This is not a copy of the documentation — it is the package the documentation is about.
Aumos loads *this* manifest and runs *these* prompt files on every commit to its own test
suite, so a hand-written guide that drifted from the bundle is not possible here: a change
that breaks the description fails the build.

---

## A manager is a manifest and a prompt bundle

That is the whole package. There is no code.

```
manifest.json          identity + permissions. The only file Aumos reads before running you
config.schema.json     JSON Schema for per-instance settings
prompt/                the bundle, concatenated in filename order, sent as one prompt
```

Aumos never analyses what is inside a manager. For this package the inside happens to be
prose, which changes nothing: the prose is read to be *sent*, never to work out what the
package is allowed to do. That comes from the manifest and only from the manifest.

### manifest.json — permissions, not description

```jsonc
"capabilities": [
  { "kind": "market:read",       "reason": "…" },
  { "kind": "fundamentals:read", "reason": "…" },
  { "kind": "news:read",         "reason": "…" },
  { "kind": "portfolio:read",    "reason": "…" }
]
```

Each `kind` unlocks specific tools. A tool outside your capabilities does not appear in the
session's tool list at all — you cannot discover what you were denied, because an ungranted
tool and a nonexistent one return the same error.

**Read what you cannot ask for.** There is no `broker:write`, and no `broker:` capability of
any kind. This is not a denial that could get an exception later; there is no way to spell
the request, so the worst a hostile manifest achieves is failing validation at install time.
The answer object is strict at every level, so there is nowhere to smuggle an order on the
way back out either.

`version` is exact semver with no range operators, because a forward track record attached
to `basic-investor@0.1.0` means nothing if `0.1.0` can be different prose on two machines.

`readme` points at this file. It is the methodology body — the paragraphs a person reads
before installing something that will judge their money — and it is a **path** rather than
prose inside a JSON string, for the same reason the config schema is one. Aumos resolves it
and checks that it exists; nothing validates what is in it, because there is no pass to
establish about prose and a half-check would report one anyway.

Two things a catalogue listing wants are deliberately **not** manifest fields. *Typical
behaviour* is a set of numbers Aumos measures from actual runs, so no package is asked to
declare them; *internal harness* is self-report about the inside of a manager, which Aumos
has no way to check.

### prompt/ — order is the filename

```
00-role.md              the three rules, and what WAIT means
10-data-cot.md          ┐
20-concept-cot.md       ├ FinRobot's three stages, adopted as-is
30-thesis-cot.md        ┘
40-portfolio-context.md ┐ the Aumos extension: an asset view becomes a portfolio view
50-decision.md          ┘
90-output.md            the JSON contract, and where the invocation is substituted
```

The numeric prefixes are the ordering and there is no index file. Adding a stage is adding
a file. The gaps in the numbering are deliberate — `10/20/30` is what FinRobot contributes
and `40/50` is what Aumos adds, and that seam is worth being able to see.

Exactly one file must contain `{{INVOCATION}}`, and Aumos refuses a bundle with none or
several. The failure it is guarding is silent: a bundle missing its marker produces a
beautifully structured prompt about no particular asset, and the run *succeeds* at answering
a question nobody asked.

#### ⚠️ The three stages are prompt structure, not orchestration

There is **one** manager call per run. The stages are sections of one prompt.

Running a process per stage would be building an arbitrary workflow engine, and it would buy
nothing — the stages share one context window, which is the entire reason the decomposition
works. It would also mean claiming to know a manager's internals, and would then be unable to
run any package that does not decompose the same way, which is every package somebody else
writes.

What Aumos knows about the inside of a run is what it *observed* — the tool calls, their
timings, their evidence. That works on a package written to be hostile too, which is the
test of whether it depends on the package cooperating.

---

## Writing the prompt: the three things that are not style

### 1. `asOf` is the frame, not a rule to work around

Every tool call carries `asOf`, there is no default, and absent / malformed / **future** are
separate refusal codes. The prompt's job is to make that feel like the shape of the world
rather than an obstacle, because a prompt that says *"check the current price"* produces an
manager that fights the gate — and a transcript full of refusals reads like a leak that was
blocked rather than a run that never tried.

This bundle is checked for exactly that phrasing. It is a lint on the prose, and it is there
because this is the failure mode that would be easiest to introduce by accident while
improving a sentence.

### 2. WAIT has to be stated as a peer, repeatedly

That WAIT is a first-class judgement is a claim about the product, and a model will not
infer it. Left alone, an analyst-shaped prompt produces analyst-shaped output: something to
do. The role file says an unjustified BUY and a well-reasoned WAIT are not close to equally
good, and the portfolio-context file closes by asking "does this change what the portfolio
should hold?" rather than "is this a good company" — because those questions have different
answers, and only the first one is the product.

### 3. The Thesis is not the manager's

It arrives as read-only context and goes back as a proposal. Long-term memory belongs to
Aumos rather than to the manager: a manager that kept its own would take the reason a position
exists with it when it was swapped out. The thesis stage says to propose the *next revision*
of an existing thesis rather than restate it, because a revision chain full of no-op
restatements loses the property that makes it worth keeping — that every version transition
has a reason and a decision behind it.

### 4. The prose is translated; the format never is

The invocation carries `language` (BCP-47 — `ko-KR`, `en-US`), and it is required, so every
package has to have an answer for it. It governs the sentences an investor reads and nothing
else: field names and enum values are the wire format and stay English, and quoted sources
stay in the language they were published in.

The output file **shows** the Korean version of the same object rather than describing it.
That is a lesson paid for once: the first real run against a live model was discarded whole
because a field was explained in prose and never demonstrated, and a strict schema throws
away an entire judgement over one key it does not recognise. A model told to answer in
Korean is being invited to make exactly that mistake on `action`. So the rule is checked:
there must be a worked non-English example in the bundle, and every JSON key in the bundle
must still be ASCII.

Evidence is never translated. A Korean rationale citing an English filing is the correct
shape — a translated quotation is one no auditor can check against the original.

---

## What happens to what you return

```
your JSON
   │
   ▼  validated against the answer schema
   │
   ├── fails ──► Run recorded, outcome: invalid-proposal, your answer kept verbatim
   │              **no Decision is sealed**
   ▼
the Kernel decides
   │
   ├── judged against the mandate — a breach is recorded verbatim and ruled a WAIT
   ▼
sealed Decision, hash-chained
```

Three things about that diagram are decisions rather than mechanics:

- **A schema failure does not become a WAIT.** WAIT is a judgement; minting one from a parse
  failure would put the Kernel's words in your mouth, and the track record could then no
  longer tell "decided to do nothing" from "could not be understood" — opposite facts about
  a manager. It is recorded as a fact *about you* instead, with the raw answer and the exact
  validation issues, so there is something to fix rather than a verdict to argue with.
- **A mandate breach is not an error.** Your proposal is stored exactly as you made it and
  the Kernel's ruling stands beside it, because a manager's track record is scored on what it
  *proposed*, not on what it was allowed to do. Propose what you think is right.
- **There is no retry.** One invocation, one Run. Whether to try again is a scheduling
  decision that belongs to whatever woke you, and it would be a second Run with its own
  record.

## Evidence, and what "it saw" means

A Decision's evidence is what Aumos **observed you fetch**, not what you claimed to have
read. Your citation is self-report; the observation is not. So a Decision leads to its
evidence and its evidence to its provenance, answering *"what did this judgement look at,
where did it come from, and when was it published"* whether or not you were honest — which
is what makes it an audit trail rather than a bibliography.

Cite ids anyway. An id you invent is worse than no citation, because it looks like
provenance.

---

## How it is exercised

Every run in the test suite goes against a fixture world: earnings released at
`2026-05-27T20:05:00Z`, every run pinned to five minutes before. Post-event values sit
nowhere near pre-event ones — closes of 412 against 100, revenue 999,999 against 100,000 —
so a rationale mentioning a 412 close is visibly reading the future.

The automated half is not a mock: a real coding CLI is spawned, it spawns the real gateway
from the real configuration, and every tool call goes over the real protocol through the
real time gate. The only faked thing is the judgement itself. The other half is the same
bundle in front of a real model on a real subscription.

## What this does not establish

That the judgement is any good.

One run against fixture data says nothing about whether this manager invests well, and no
number of runs against fixture data would. That is what a forward track record is for, and
the reason it takes calendar time rather than compute. What is established here is narrower
and worth stating exactly: that a package shaped like this loads, runs inside its
permissions, cannot see past `asOf`, and produces something the Kernel will seal.
