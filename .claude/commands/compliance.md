---
description: The rule book run against the records - patch tests, formulas, marketing consent, double-bookings, hours, expired vouchers, stock - each rule citing its source.
---

1. Run `node scripts/salon.mjs compliance --json` (one rule: `compliance patch-tests`).
2. Present rule by rule: pass or the named issues. Lead with any patch-test issue: that one is a person's scalp, not paperwork.
3. Each rule's source is in the output and in `docs/compliance.md`. When the operator's own policy differs (a longer validity window, a different lapsed line), change the number in `settings`, not the rule.
