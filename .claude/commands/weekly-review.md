---
description: The Monday review, written from four commands - what needs a decision, the week's book, the money, and the client risks (patch tests, lapsed regulars, vouchers).
---

1. Run four commands, `--json` each: `node scripts/salon.mjs attention`, `book`, `takings`, `rebooking`. Add `lapsed` and `gaps` when the week looks quiet.
2. Write the review in four short sections, prose plus small tables, nothing invented:
   - **Today's decisions.** The attention list, worst first, one action each. A patch test breach is the first line of the whole review.
   - **The week's book.** Day by day: how full each chair is, what is unconfirmed, where the gaps are.
   - **The money.** Last week's takings by chair, average ticket, retail per visit, and the rebooking rate against the week before.
   - **The clients.** Who lapsed, whose voucher is on the clock, whose birthday lands this week.
3. End with at most five actions for the week, each doable with a single command or phone call.
4. On paper: `npm run view` renders the week and money pages in the salon's brand.
