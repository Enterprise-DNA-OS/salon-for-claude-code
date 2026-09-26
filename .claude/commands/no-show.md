---
description: Mark a no-show and run the follow-up like a human - the call while it is fresh, the note on the record, and the deposit conversation when it is a habit.
---

1. `node scripts/salon.mjs no-show REF --json`. The output counts their no-shows over six months.
2. Draft the follow-up as a short message in `drafts/no-show-<name>.md`: kind, direct, offering the next slot. A person sends it.
3. Log the call when it happens: `note add NAME "what was said"`.
4. Two or more in six months: say plainly that a deposit at booking is fair, and note it on the record so the whole front desk holds the same line.
