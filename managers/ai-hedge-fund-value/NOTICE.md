# Third-party notice

This AgentPackage is a **derivative work**. Its three analyst personas are ported from the
`deep-value` strategy of [`virattt/ai-hedge-fund`](https://github.com/virattt/ai-hedge-fund),
at commit `69e5946dcb7b5fbe739b516455d1b5392cb5f7ac`, and the notice below is retained as that
project's licence requires.

`prompt/10-graham.md`, `prompt/20-buffett.md` and `prompt/30-munger.md` adapt the system prompts in
`hedge_fund/signals/graham.py`, `buffett.py` and `munger.py`. What was changed and why is in
`README.md` §"What was adapted, and why each change was necessary"; what was deliberately **not**
ported is in `harness.json`'s `omitted[]`.

---

MIT License

Copyright (c) 2024 Virat Singh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## The personas are not the people

Carried across from the source's own `VISION.md`, because it is a statement about the thing being
ported and it does not become less true for having been ported:

> The investor agents are *stylized approximations* of these investors' public philosophies — not
> the actual individuals, and not endorsements.

Benjamin Graham, Warren Buffett and Charlie Munger have no connection to this package, to
`ai-hedge-fund`, or to Aumos, and none of them has reviewed or endorsed anything here. The names
identify a **published investment philosophy** being applied, in the way a textbook names a method
after the person who wrote it down. Nothing this package produces is that person's opinion.
