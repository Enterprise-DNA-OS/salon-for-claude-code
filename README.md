<h1 align="center">Salon for Claude Code</h1>

<p align="center">
  <strong>The open-source salon and spa management system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Timely data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=timely">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/timely?utm_source=github&utm_medium=readme&utm_campaign=timely">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-timely">Instead of Timely</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Salon for Claude Code does the job you pay Timely for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Timely dashboard cannot.

The bill this replaces grows with every stylist. Timely prices per bookable staff member per month: Build at US$26, Elevate at US$39, Innovate at US$47 ([gettimely.com/pricing](https://www.gettimely.com/pricing/); the AU/NZ card is charged in local dollars at roughly A$42 / A$65 / A$79). A 10-chair salon on Elevate pays about US$4,700 a year before SMS charges and payment fees; a three-site group on Innovate clears US$15,000 a year, every year, for an appointment book.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=timely).

This one covers the operating record of a salon, barbershop, or spa: the team and their hours, the client book with its history, the menu, appointments from booked to checked out, the colour formula record, patch tests, retail stock, sales and gift vouchers. The rules of the trade are built in as gates with their sources cited: no colour books without a valid allergy alert test (and a recorded reaction refuses outright), nobody is double-booked or booked outside their hours, retail never sells an empty shelf, and marketing drafts only ever address clients who opted in. Payments stay on the card terminal and payroll in the payroll system, deliberately.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/salon-for-claude-code.git
cd salon-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo salon has a colour client booked tomorrow on an expired patch test, a brand-new client booked for balayage with no test at all, a booking from two days ago nobody checked out, an unconfirmed appointment, a fresh no-show, a colour visit with no formula recorded, the best client on the book quietly lapsed, a voucher expiring with $80 on it, and an empty dispensary shelf; the answer shows you exactly how this system thinks.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first. A colour booking without a valid patch test outranks everything |
| `/book` | The appointment book: today, tomorrow, the week, per chair, every state loud |
| `/new-booking` | Book a client in; the gates speak and their refusals carry the fix |
| `/checkout` | Services plus retail, then the two nudges: the rebooking offer and the formula |
| `/no-show` | Mark it, draft the follow-up, hold the deposit line when it is a habit |
| `/rebooking` | Who leaves holding their next appointment, per chair. The number that decides the year |
| `/gaps` | The empty chair, next 7 days, and what fills it |
| `/lapsed` | The recall list, worth the most first, consent line drawn |
| `/no-shows` | The 60-day record with each client's habit counted |
| `/takings` | Services and retail by chair, average ticket, retail per visit |
| `/client` | One client's whole card before they are in the chair |
| `/formulas` | The colour record: read before mixing, record before it leaves the head |
| `/patch-test` | Record the allergy alert test; handle a reaction like a professional |
| `/stock` | The shelf and the dispensary, counter sales, honest stocktakes |
| `/vouchers` | Sell, redeem, and watch the liability and the clock |
| `/team` `/services` | The chairs and the menu |
| `/compliance` | The rule book run against the records, sources cited |
| `/weekly-review` | The Monday review written from four commands |
| `/log` | The conversation onto the client's record |
| `/draft-reminders` `/draft-recall` | Drafts to `drafts/`; a person sends them |
| `/import` | Bring the salon across from Timely, dry-run first |
| `/customise` | Change a field, a number, a rule, in plain language |
| `/new-view` | A new read-only dashboard page, described in plain language |

## Instead of Timely

Export your clients and appointments from Timely (or Kitomba, Shortcuts, Fresha, or any salon system that exports reports to CSV), then:

```bash
node scripts/salon.mjs import timely --clients=clients.csv --appointments=appointments.csv --dry-run
node scripts/salon.mjs import timely --clients=clients.csv --appointments=appointments.csv
```

The importer matches common column-name variants, is idempotent (re-running books nothing twice), and names every row it skips. Every imported client deliberately arrives with no patch test on record: the allergy alert record gets rebuilt as colour clients book in, not assumed from the old system. [docs/replace-timely.md](docs/replace-timely.md) covers exactly what carries over and what starts fresh, and why.

### Ten questions your salon dashboard cannot answer

Each of these is one plain-language ask away in Claude Code, because the record is a database you own:

1. Which colour clients booked in the next two weeks have no valid patch test, and which of those has a reaction on record?
2. Whose rebooking rate dropped this month, and which exact visits walked out unbooked?
3. Which clients are past their usual visit rhythm with nothing booked, ranked by what they spent this year?
4. Which completed colour visits this month left no formula behind, and whose chair did they sit in?
5. What does tomorrow's empty chair time cost at menu prices, and who on the recall list fits it?
6. Which clients no-showed twice or more in six months, and what was each miss worth?
7. How much gift voucher money is unspent right now, and how much of it expires inside 30 days?
8. What is each chair's retail per visit, and who sells at the basin versus not at all?
9. Which clients have been in the chair recently but never answered the marketing consent question?
10. If the conditioner sells at this week's rate, what runs out before the next order lands?

## Your first hour: ten things to ask for

1. "Walk me through everything on the attention list and what clears each one."
2. "Who is in tomorrow, and what do the colour clients need before they arrive?"
3. "Book Sophie in with Ava for a cut and toner next Tuesday at ten."
4. "Check out APT-1032 with a repair shampoo, and tell me if she rebooked."
5. "Record Mere's patch test from Monday: clear."
6. "What is our rebooking rate by chair this month?"
7. "Draft the recall messages for the lapsed clients who opted in."
8. "Our patch tests stand for a year, not six months." (a one-line settings change)
9. "Import our clients and appointments from Timely, dry run first."
10. "Add a page that shows every colour client with their patch test date."

## Architecture

```
salon-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Salon for Claude Code for your business, migrates your Timely data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=timely)
- Read more: [enterprisedna.co/omni/instead-of/timely](https://enterprisedna.co/omni/instead-of/timely?utm_source=github&utm_medium=readme&utm_campaign=timely)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
