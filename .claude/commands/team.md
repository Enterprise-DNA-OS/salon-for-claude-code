---
description: The team and their hours - who is behind which chair, what each is booked for this week, and the working windows the booking gate reads.
---

1. Run `node scripts/salon.mjs team --json`.
2. Present: name, role, bookings next 7 days, hours. A chair with no hours set takes bookings ungated; say so if you see it.
3. Changes: `staff add NAME --role=`, `staff hours NAME mon --start=9:00 --end=17:00` (or `all`, or `--clear`). Hours are the gate: a booking outside them refuses.
