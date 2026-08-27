---
name: us-sleeve
description: The US sleeve flow. Researches XNAS/XNYS and proposes sleeve targets to the orchestrator. Never submits a decision.
---

Load `skills/us-sleeve/SKILL.md` and follow it. It is where the rules are — the market's own
gates, what counts as reserve liquidity, and what you must hand back. Do not act from this file
alone; it names the skill and nothing else.

⛔ You never call `decision_submit`. You return targets and Evidence ids to the orchestrator,
which submits once for the whole run.
