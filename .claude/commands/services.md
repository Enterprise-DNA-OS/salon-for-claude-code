---
description: The menu - services, durations, prices, and which ones gate on a patch test - and how to change it in one line.
---

1. Run `node scripts/salon.mjs services --json`. Present by category with duration, price, and the patch test flag.
2. New service: `service add NAME --category= --minutes= --price= [--patch-test]`. Anything with colourant or tint in it gets `--patch-test`; that is what makes the booking gate work.
3. A price change is `/customise` territory (it writes the migration); a one-off price on a booking is `book add ... --price=`.
