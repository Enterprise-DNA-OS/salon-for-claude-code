---
description: Bring the salon across from Timely (or any booking system whose reports export to CSV) - clients, then appointments, dry-run first. The import is the first audit.
---

1. Read `docs/replace-timely.md` for what exports, what maps, and what deliberately starts fresh.
2. Dry run first: `node scripts/salon.mjs import timely --clients=clients.csv --appointments=appointments.csv --dry-run --json`. Read the skips out loud: a row with no date or an unknown staff name is a question about the old data, not a rounding error.
3. Run it for real, then re-run it: the second pass must book nothing new. That is the idempotency check.
4. Every imported client arrives with NO patch test on record, deliberately. The old system saying a test happened is not the test. Rebuild the record as colour clients book in: `client patch-test NAME --on=`.
5. Then the honesty sweep: `compliance --json` (the gaps, named), `attention --json`, `book --week --json`. Present created, updated, skipped-and-why, and the three commands to run next.
