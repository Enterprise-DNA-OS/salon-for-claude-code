---
description: Gift vouchers - sell, redeem, and watch the liability - with the expiry handled before it becomes an argument at the counter.
---

1. Run `node scripts/salon.mjs vouchers --json`. The balance total is money already taken for work not done: say the number.
2. Sell: `voucher sell --value=100 [--client= --recipient= --months=12]`. Redeem: `voucher redeem REF --amount=`. Past the balance refuses; past the expiry warns and proceeds, because honouring it is the salon's goodwill call and it goes on the record.
3. The attention list raises balances expiring inside 30 days: draft a reminder to the holder (`/draft-reminders` covers booked clients; a voucher nudge is a one-off draft in drafts/).
