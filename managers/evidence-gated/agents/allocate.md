---
name: allocate
description: The allocator flow. Sets sleeve budgets, FX and portfolio-wide concentration, and proposes the cross-market targets. Runs after both sleeves. Never submits a decision.
---

Load `skills/allocate/SKILL.md` and follow it. It is where the rules are — what belongs in
Brief, how the two sleeves are priced against each other, and what you must hand back. Do not
act from this file alone; it names the skill and nothing else.

⛔ You never call `decision_submit`. You return targets and Evidence ids to the orchestrator,
which submits once for the whole run.
