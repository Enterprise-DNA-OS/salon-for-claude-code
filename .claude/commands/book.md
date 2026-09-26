---
description: The appointment book - today, tomorrow, or the week - with every booking's state on one line (confirmed, unconfirmed, no patch test, not checked out).
---

1. Default to the week: `node scripts/salon.mjs book --json`. One day: `book --day=YYYY-MM-DD --json` (today/tomorrow work). One chair: add `--staff=NAME`.
2. Present it day by day, morning first: time, chair, client, services, price, state. States in capitals (NO PATCH TEST, UNCONFIRMED, NOT CHECKED OUT) get named under the table with their one-line fix.
3. If the operator asks "who is in today", today's list plus each client's allergy note and patch test state from `client NAME --json` for the colour clients.
