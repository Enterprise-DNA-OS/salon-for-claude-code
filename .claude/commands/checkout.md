---
description: Check a finished visit out - services plus retail over the counter - and act on the two nudges that matter: the rebooking offer and the colour formula.
---

1. `node scripts/salon.mjs checkout REF [--retail="Repair shampoo x1, Silk serum"] --json`.
2. Read the output's two flags out loud:
   - `rebooked: false` means the client is about to leave without their next visit booked. Offer the date that matches their usual gap (`client NAME --json` shows it) and book it now: rebooking at the till is the cheapest marketing the salon will ever run.
   - a colour visit with `formula_recorded: false` gets the formula recorded this minute: `formula add CLIENT "the mix, the timing, what to change next time"`.
3. Retail past what the shelf holds refuses; a stocktake (`stock take PRODUCT --count=`) fixes a wrong count, never a made-up sale.
