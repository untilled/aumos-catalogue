# ai-hedge-fund-value

**A port, and the first manager here whose knowledge is not ours.**

Three analyst personas lifted out of
[`virattt/ai-hedge-fund`](https://github.com/virattt/ai-hedge-fund) (MIT, © 2024 Virat Singh) at
commit `69e5946dcb7b5fbe739b516455d1b5392cb5f7ac`, and reassembled to run on Aumos. `NOTICE.md`
carries the attribution; `harness.json` records what was taken and — more usefully — **what was
deliberately left behind**.

| | `basic-investor` | `prudent-allocator` | `ai-hedge-fund-value` |
|---|---|---|---|
| origin | ours | ours | **ported**, MIT |
| starts from | the asset | the book | **the filings** |
| reads | filings, news, prices, the book | the book, prices, the theses | **filings and prices only** |
| readers | one | one | **three, independent** |
| its usual answer | WAIT, or BUY with a thesis | WAIT, or RESIZE | WATCH, on a price that would create a margin of safety |

---

## Methodology

Three value analysts read the same point-in-time fundamentals **without seeing each other's
answers**, and one reconciliation weighs their convictions into a single judgement.

- **Graham** — margin of safety, balance-sheet strength, earnings stability, and deep suspicion of
  paying for growth. Overvaluation is a bearish fact, not a neutral one. His view counts
  **double**, which is the source's own configuration and not a preference of this port.
- **Buffett** — circle of competence, moat, capital allocation visible in the numbers, and
  ten-year comfort. A wonderful company at a fair price over a fair company at a wonderful price.
- **Munger** — invert; find what would make it fail; and put most things on the too-hard pile.
- **The blend** — a weighted mean over the analysts who *voted*, then sized against your mandate.
  Abstentions are excluded from both halves of the average, so "no opinion" never arrives as
  "opinion: neutral".
- **The mandate check** — and an explanation of why the manager must respect a limit the source's
  harness would have clamped for it.

**The independence is the whole methodology.** Three analysts who converge because the third read
the first two are one analyst with extra steps, and the blend would then be weighing a view against
its own echo. The stage files say so out loud, twice.

It is given **no news access and no access to your theses**, and that is the port being faithful
rather than the port being lazy. The source hands its value analysts a rendered fundamentals
snapshot and nothing else; a port that quietly added a news feed would be an improvement filed
under somebody else's name. Where that costs the judgement something, the manager is required to say
so in its stated uncertainty.

### What is different from the source, and why each change was necessary

Not a list of liberties taken. Each of these is something that **could not** be carried across, and
the Aumos rule that made it impossible.

| the source does | this package does | because |
|---|---|---|
| sizes cross-sectionally: `conviction / Σ\|convictions\| × gross_target` | `conviction × your maximum position weight` | Aumos asks about one subject at a time. Divide one conviction by its own absolute value and the answer is `1.0` for *any* conviction, so a barely-positive view and an overwhelming one size identically. The source names this exact wart itself |
| clamps a target above the cap, silently | proposes inside the mandate, or explains that the mandate stopped it | Aumos does not clamp — it records the proposal verbatim and rules it a **WAIT**. A target over the cap costs the whole judgement, not some exposure |
| an all-neutral cycle produces zero weights and the fund closes to flat | returns **WAIT or WATCH** with reasons | closing to flat is a *trade*, and one nobody decided to make. WAIT is a first-class judgement here |
| shorts its least-liked names in market-neutral mode | drops the short side and says so | shorting is a mandate constraint and is normally off. Approximating a short with a hedge would be inventing an instruction |
| states the point-in-time discipline as a prompt rule the model is asked to keep | states it as a description of machinery | Aumos enforces `asOf` and refuses a result stamped after it. A prompt that *asks* a manager not to look ahead produces a manager that tries |
| has no minimum-conviction floor (its own docstring calls this the obvious next knob) | `config.convictionFloor`, default `0.2` | upstream, the risk stage caught the consequence by clamping. With no clamp, the floor stops being an improvement and becomes a requirement |
| places its own orders | cannot | there is no broker-write capability in the protocol to ask for. Orders reach a venue through your approval and nowhere else |

What is **not** ported is as deliberate: eleven nodes of the source harness are recorded in
`harness.json` as omitted, each with the reason and with what in Aumos answers the same question
instead — or nothing, where the port simply loses the capability. A node declined and a node
missed are opposite facts, and a reader is entitled to tell them apart.

---

## The first shadow run

Fixture data, `asOf` five minutes before an NVDA earnings release. Outcome: a sealed WATCH, four
tool calls all allowed, hash chain valid. What makes it evidence that the *port* works rather than
that a model works:

> Graham bearish on price alone, Buffett **abstained** for want of any balance-sheet or returns
> data, Munger neutral on the too-hard pile — blended conviction **-0.43** over the two who voted.
> That clears the 0.20 floor, but only one voting analyst sits on either side of zero, so the
> majority requirement fires and the desk does not move the existing 5% position. […] The single
> most important fact here is timing: fiscal Q1 is reported five minutes after `asOf` and this
> judgement is made without it.
>
> · Arithmetic: `(2.0 × -0.65 + 1.0 × 0.00) / (2.0 + 1.0) = -1.30 / 3.0 = -0.43`. Buffett is
> excluded from both numerator and denominator.

Four things in that are the port rather than the model:

- **The abstain/neutral distinction held.** Buffett did not vote and was removed from *both* halves
  of the average; Munger's too-hard-pile neutral did vote and diluted. That is the source's own
  rule — *"no opinion must not masquerade as opinion: neutral"* — surviving a translation from
  Python into prose.
- **Graham's double weight is visible in the arithmetic**, and the arithmetic is written out, so a
  reader can recompute the number the judgement rests on.
- **The replacement sizing rule was reached and reported**: `-0.065`, and then not proposed,
  because shorting is off. The source would have shorted here.
- **The point-in-time bound is in the manager's own words**, unprompted, as the thing it most wants
  recorded.

Everything the run saw is filed as evidence stamped at `asOf`, so the claim is checkable rather
than taken on the transcript's word.

---

## Installing it

Exactly like any other package — from the catalogue, against a book, with the same capability
consent screen. The install screen shows this package's **provenance** above its capabilities,
because who wrote the methodology is something you are entitled to know before you agree to run
it.

## Files

```
manifest.json          identity, capabilities, and provenance — where the attribution is drawn from
harness.json           what was taken, what was authored, what was omitted
NOTICE.md              the retained MIT notice, and the personas-are-not-the-people statement
config.schema.json     analyst blend weights (the source's own), the conviction floor, majority rule
prompt/00-role.md      the desk, the independence rule, and what may be known
prompt/10-graham.md    ─┐
prompt/20-buffett.md    ├─ the fanout: three extracted personas, read independently
prompt/30-munger.md    ─┘
prompt/50-blend.md      the aggregate — authored, because the source's is Python
prompt/60-mandate.md    the constraint check the source did by clamping and Aumos does not
prompt/90-output.md     what the published schema cannot say: the blend’s own vocabulary
```
