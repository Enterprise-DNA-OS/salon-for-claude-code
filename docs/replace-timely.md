# Moving off Timely

The promise: export from Timely (or Kitomba, Shortcuts, Fresha, or any salon system whose reports export to CSV), run one command, and the operating record comes with you in a morning. Here is exactly what carries, what starts fresh, and why.

## What to export

Timely's reports export to CSV from the reporting screen. You need up to two files:

1. **Clients.** The Client Overview report (it replaced the old Customer list report): name or first and last name, email, mobile, and the marketing column if your account carries one. Export it as CSV.
2. **Appointments.** An appointment report for the period you want on record, plus the booked weeks ahead: client, date, start time, duration, service, staff member, price, status.

Column names vary between Timely's report layouts; the importer matches the common variants case-insensitively (`Client`, `Customer name`, `Mobile`, `Mobile number`, `Start time`, `Duration (mins)`, `Staff member`, `Employee` all work). Dates in DD/MM/YYYY are read as New Zealand dates.

## Before you run it

Add your team first (`staff add NAME --role=`), spelled the way the Timely export spells them. An appointment row naming a staff member this system does not know is skipped and named, not guessed at.

## Run it

```bash
node scripts/salon.mjs import timely --clients=clients.csv --appointments=appointments.csv --dry-run
node scripts/salon.mjs import timely --clients=clients.csv --appointments=appointments.csv
```

Dry run first, always. The importer is idempotent: it matches clients on name (and keeps Timely's id in `external_ref` when the export carries one), and derives a stable key for every appointment, so running it twice books nothing twice, and a weekly re-run during a transition period is safe.

## What maps

| Timely | Here |
|---|---|
| Client (name, email, mobile, birthday, marketing) | `clients`, consent recorded from the marketing column, Timely id kept in `external_ref` |
| Appointment (client, date, time, duration, service, staff, price, status) | `appointments` + `appointment_services`; past rows land `completed`, future rows `booked`, no-shows and cancellations keep their status |
| Service names | `services`, created on first mention in an `imported` category; move them to real categories and flag the colour ones (`requires_patch_test`) yourself |

## What deliberately does not carry over

- **Patch tests.** Every imported client arrives with **no allergy alert test on record**, on purpose. The old system saying a test happened is not the test. Rebuild the record as colour clients book in (`client patch-test NAME --on=`), and the first `compliance` run after import is your opening audit, on the record.
- **Colour formulas.** Timely's formula notes live in free-text client notes and rarely export cleanly. Bring the paper cards or the old notes across by hand for your top colour clients (`formula add NAME "..." --on=`), best first: twenty minutes per stylist and the record is yours forever.
- **The colour flag on services.** Imported services arrive without `requires_patch_test`. Walk the menu once and flag everything with colourant or tint in it: that flag is what makes the booking gate protect people.
- **SMS credits, payment processing, online booking.** They were Timely features, not your data. Reminders and recalls draft to `drafts/` and a person sends them; the card terminal keeps taking payments.

## The import is the first audit

Every skip is named and every skip is a question about the old data: a row with no date, an appointment for a staff member who left last year. Do not silence them; answer them. Then run the honesty sweep:

```bash
node scripts/salon.mjs compliance --json   # the gaps, named
node scripts/salon.mjs attention --json    # what wants a decision today
node scripts/salon.mjs book --json         # the week ahead, priced
```

A clean book on day one is the point of moving.
