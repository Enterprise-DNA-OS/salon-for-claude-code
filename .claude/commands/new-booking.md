---
description: Book a client in - resolve the client, the chair, the services and the time, and let the gates speak. A refused booking is the system doing its job; relay the reason and the fix, never work around it.
---

1. `node scripts/salon.mjs book add CLIENT STAFF --date= --at= --services="Style cut & finish, Toner & gloss" [--source=phone|walk_in|rebook] --json`. Duration and price come off the menu; `--end=` overrides duration if the operator says so.
2. If it refuses, read the reason back in plain words and offer the fix it names: a patch test first (`client patch-test`), another time (the clash is named), another chair, or a change to the working hours. There are no force flags, and that is deliberate.
3. A brand-new client: `client add NAME --phone= [--opt-in]` first, then book. Ask about marketing opt-in while they are on the phone and record the answer honestly.
4. Confirm back: ref, client, chair, day, time, services, price.
