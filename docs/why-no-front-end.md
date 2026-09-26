# Why there is no front end

Timely is a database with a subscription. The tables underneath it are ordinary: a few entities, a few relationships, a handful of workflows you repeat every week. What you pay for is the layer on top that lets people who do not write SQL get at those tables. Screens, filters, dashboards, forms.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, describe what you want, and it writes the query, runs it, and explains the answer. Ask a question the dashboard never had a chart for and you still get an answer.

## What you gain

- **Better answers.** A dashboard shows what the vendor decided to chart. Here you ask your own question, in your own words, and get it answered against your own data.
- **No seats.** Everyone who needs to look can look. The bill does not grow with headcount.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time. There is no export step because there is nothing to leave.
- **A process that matches you.** When your way of working changes, you add a command. You do not wait for a feature request to clear.

## What you give up

- **The drag-and-drop calendar.** The book is a table you ask about and a printed day sheet, not columns you drag bookings across. `npm run view` renders the week as a page; moving a booking is one sentence.
- **Client self-booking online.** In the free version the phone rings and a person books it. A booking page that writes into these same tables is exactly the kind of thing Enterprise DNA builds into a customised version.
- **Automatic SMS sending.** Reminders and recalls draft as messages a person sends from their own phone. Wired-up sending is a customisation, and the consent rules are already built in.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for salons that want someone to call.

## Who this fits

Owner-run salons, barbershops and clinics where one or two people run the book, or anyone who would rather learn to ask than learn another interface. If your front desk needs a screen to look at all day, keep Timely. If you need the answers, the record and the money more than the screens, this is cheaper, faster and yours.

Installed and run for you: https://enterprisedna.co/omni/instead-of/timely
