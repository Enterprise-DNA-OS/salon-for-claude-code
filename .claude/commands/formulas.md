---
description: The colour formula record - read a client's history before mixing, and record today's mix before it leaves the stylist's head.
---

1. Read: `node scripts/salon.mjs formulas CLIENT --json`. Newest first; the last line usually says what to change this time.
2. Record: `formula add CLIENT "7.3 + 8.34 (1:1) with 20vol, 35 min. Next time half a shade cooler" [--staff= --on=]`. The note-to-self at the end is the most valuable part; ask for it.
3. The attention list names any colour visit checked out without a formula inside 14 days. Clear those the same day.
