---
description: Draft the recall (win-back) messages for lapsed clients who opted in to marketing - one personal message each, worth the most first, in drafts/. The not-opted-in get a call list instead, never a message. Never sends.
---

1. Run `node scripts/salon.mjs lapsed --json`.
2. Split on `marketing_opt_in`. Only the opted-in get drafts (Unsolicited Electronic Messages Act 2007: consent first). The rest go on a call list with their number and the one line about why they are worth the call.
3. For each opted-in client, write `drafts/recall-<name>.md`: two or three lines from their own stylist's chair, naming their usual service and how long it has been, offering two concrete times this week. Read their card first (`client NAME --json`): a birthday, an allergy note or a last-visit note changes the message.
4. One extra file, `drafts/recall-summary.md`: who got a draft, who is on the call list, and the open hours (`gaps --json`) this fills. A person sends these; this system never does.
