---
description: The shelf and the dispensary - what is on hand, what is at reorder, counter sales, and the stocktake that keeps the numbers honest.
---

1. Run `node scripts/salon.mjs stock --json`. Present retail and professional separately; anything at or under reorder is the order list.
2. A counter sale outside a visit: `sale CLIENT PRODUCT [--qty= --staff=]`. Retail at checkout belongs on the checkout (`checkout REF --retail=`) so the chair gets the credit.
3. The shelf disagrees with the record: `stock take PRODUCT --count=` with what was actually counted. Never invent a sale to make the numbers match.
4. New line: `product add NAME --price= [--kind=retail|professional --stock= --reorder=]`.
