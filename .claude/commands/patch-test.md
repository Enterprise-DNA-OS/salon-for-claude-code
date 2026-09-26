---
description: Record an allergy alert (patch) test - the record that lets colour book lawfully - and handle a reaction like a professional.
---

1. Record: `node scripts/salon.mjs client patch-test NAME [--on=DATE] [--outcome=clear|reaction] [--staff=] [--note=]`. The test must be at least 48 hours before the colour; a test recorded today does not clear tomorrow's appointment, and the system will say so.
2. A `reaction` outcome permanently refuses colour bookings for that client from here. Record what was seen in `--note=`, put the conversation in `note add`, and never soften the record.
3. Booking colour for someone without a valid test refuses with the fix in the message. The validity window and lead time live in settings (`patch_test_valid_days`, `patch_test_lead_days`).
