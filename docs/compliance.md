# The rule book /compliance checks

Seven rules, each with its source, what a breach looks like in the data, and where the CLI already refuses at the gate. `node scripts/salon.mjs compliance` runs them all; add a rule key to run one.

Nothing here is legal advice. It is the rule book the operator has pointed the system at, with sources, and the operator changes it to match their business. When the rules move, update the check and this file together. The defaults are written for New Zealand; the numbers themselves live in `settings` so an operator anywhere changes them without touching code.

## 1. `patch-tests` - no colour without a valid allergy alert test

Every colour manufacturer's instructions require an allergy alert (patch) test, typically at least 48 hours before applying colourant or tint, because PPD and related dyes can sensitise and a reaction on the scalp or face is a medical event. The salon's legal footing is the duty of care to the people it serves. **Source: the manufacturer's own instructions for use; Health and Safety at Work Act 2015 s 36 (duty to other persons at the workplace).** The validity window (`patch_test_valid_days`, default 180) and lead time (`patch_test_lead_days`, default 2) live in settings; set them to what your colour house's instructions actually say.

Breach in the data: a booked appointment carrying a `requires_patch_test` service where the client's latest test is missing, expired, a reaction, or fewer than 48 hours before the appointment. **Gate: `book add` refuses, with the fix named. A recorded reaction refuses colour outright, permanently: there is no force flag, because the fix is a professional conversation, not a checkbox.**

## 2. `formulas` - every colour visit leaves a formula behind

The formula record is what makes the next visit repeatable when the stylist is away, and it is the record clients feel locked into a salon over. Not statute: **the professional standard every colour house teaches**, enforced here because a missing formula six weeks later is a redo at the salon's cost.

Breach in the data: a completed appointment carrying a colour service, inside 30 days, with no formula recorded for that client on that day. **Check only: the attention list asks for it inside 14 days, while the mix is still in someone's head.**

## 3. `consent` - marketing only to people who said yes

A commercial electronic message needs the recipient's consent, must identify the sender, and must carry an unsubscribe. A reminder about an appointment the client booked is a service message, not marketing; a recall, birthday offer or campaign is marketing. **Source: Unsolicited Electronic Messages Act 2007 ss 9-11.** AU: the Spam Act 2003 says the same thing.

Breach in the data: none possible by sending, because this system never sends. The rule lists active clients seen in the last 90 days whose consent was never asked, so the front desk asks at the basin and records the answer. **Gate: `/draft-recall` drafts only for `marketing_opt_in` clients; everyone else lands on a call list.**

## 4. `double-booked` - one chair, one client, one time

Not statute: arithmetic. **Gate: `book add` refuses an overlap.** The check exists because an import can carry a clash in from the old system, and the day sheet should not be the place it is discovered.

## 5. `hours` - bookings sit inside working windows

**Gate: `book add` refuses a booking outside the staff member's recorded hours** (a person with no hours recorded is ungated, deliberately, until someone sets them). The check catches what an import carried in, so the 9am booking for a barber who starts at 10 is a decision made this week, not a surprise on the day.

## 6. `vouchers` - the printed promise is honoured

A gift voucher is money taken for work not done. Misleading customers about their rights, or refusing what the voucher on its face promised, is where trouble starts. **Source: Fair Trading Act 1986 (misleading conduct; honour what you advertised).** New Zealand law sets no minimum expiry, so the terms you sold are the terms that bind you.

Breach in the data: a voucher past its expiry with a balance still on it. Honour it, extend it, or write it off, on the record. **Gate: `voucher redeem` refuses past the balance; past the expiry it warns and proceeds, because goodwill is the salon's call and it belongs on the record.** The attention list raises balances expiring inside `voucher_warn_days` (default 30) so the conversation happens before the argument.

## 7. `stock` - the dispensary and the shelf hold what the week needs

Not statute: a colour week with an empty dispensary is a cancelled appointment, and an empty retail shelf sells nothing. Breach in the data: any active product at or under its `reorder_level`. **Gate: `checkout --retail` and `sale` refuse selling more than the shelf holds; `stock take` corrects the count to what was actually there.**

## Premises rules this system cannot check

Hairdressing premises in New Zealand are registered with the local council and follow the **Health (Hairdressers) Regulations 1980** (cleaning and disinfection of instruments, condition of the premises) under the **Health Act 1956**. Those live in the room, not in a database: keep the registration current and the steriliser log on paper or ask `/customise` to add one as a table if you want it on the record here.
