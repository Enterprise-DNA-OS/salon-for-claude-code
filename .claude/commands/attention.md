---
description: Everything that wants a decision this morning, worst first. A client booked for colour without a valid patch test outranks everything, then bookings never checked out, unconfirmed appointments, fresh no-shows, missing formulas, lapsed regulars, voucher money on the clock, low stock, tomorrow's empty chairs and this week's birthdays.
---

1. Run `node scripts/salon.mjs attention --json`.
2. Present it worst first, grouped by reason, in the salon's words. Lead with anything rank 1 or 2 (a patch test breach, a booking left open): those are today's first phone calls, say so plainly.
3. For each group, say the one action that clears it: `client patch-test NAME --on=`, `checkout REF`, `no-show REF`, `confirm REF`, `formula add NAME "..."`, `/draft-recall`, order the stock, call the birthday.
4. If the list is empty, say so in one line and stop.
