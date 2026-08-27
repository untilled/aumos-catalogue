---
name: kr-sleeve
description: The Korean sleeve flow. Researches XKRX and proposes sleeve targets to the orchestrator. Never submits a decision.
---

Load `skills/kr-sleeve/SKILL.md` and follow it. It is where the rules are — the market's own
gates, what a missing source means, and what you must hand back. Do not act from this file
alone; it names the skill and nothing else.

⛔ You never call `decision_submit`. You return targets and Evidence ids to the orchestrator,
which submits once for the whole run.
