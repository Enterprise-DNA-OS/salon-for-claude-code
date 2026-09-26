---
description: The empty chair - open hours per stylist per day for the week ahead, and what to do about tomorrow's quiet.
---

1. Run `node scripts/salon.mjs gaps --json`.
2. Present tomorrow first: each chair's window, booked hours, open hours. Then the rest of the week only where it is quiet.
3. The fix for an empty day is a list, not a hope: `lapsed --json` is who to call first (worth the most, quiet the longest), and the waitlist lives in client notes. Offer to draft the recall (`/draft-recall`) for the opted-in ones.
