---
description: Draft tomorrow's appointment reminders - one short message per unconfirmed booking, ready for a person to send. Reminders about a booked visit are service messages, not marketing; they go to anyone with a booking. Never sends.
---

1. Run `node scripts/salon.mjs book --day=tomorrow --json` (and the day after when the operator asks). Reminders go to every booking; the UNCONFIRMED ones are the point.
2. For each, write `drafts/reminder-<name>-<date>.md`: two lines in the salon's voice with the day, time, chair and services, asking for a yes. Plain words, no exclamation marks. Include the phone number from the client card so a person can text it.
3. A colour booking with state NO PATCH TEST gets a different message: the patch test comes first, offer times today or tomorrow morning.
4. One extra file, `drafts/reminders-summary-<date>.md`, lists every draft. Report the list. A person sends these, then runs `confirm REF` as answers land.
