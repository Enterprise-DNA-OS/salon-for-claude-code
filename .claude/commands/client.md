---
description: One client's whole card - contact, patch test state, allergy note, visit history, colour formulas, retail bought, notes, and whether they are lapsed - before they are in the chair.
---

1. Run `node scripts/salon.mjs client NAME --json` (partial name is fine; an ambiguous one lists candidates).
2. Present the card top-down: who they are, patch test state and allergy note FIRST (the chair needs those before anything), then rhythm (last in, usual gap, next booked), spend, the last visits, the formula record, notes.
3. Updates while you are there: `client set NAME --phone= --opt-in=yes|no --allergy=`, `note add NAME "..."`.
4. A REACTION patch test state is a red line: colour will refuse at booking, and that is a professional conversation, not an override.
