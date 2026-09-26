# Salon for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "what needs my attention", "what's wrong this morning" | `/attention` |
| "show me the book", "who is in today / tomorrow" | `/book` |
| "book X in", "can Ava fit a colour Thursday" | `/new-booking` |
| "check X out", "she took a shampoo too" | `/checkout` |
| "X didn't show" | `/no-show` |
| "how's rebooking", "who leaves without rebooking" | `/rebooking` |
| "how quiet is tomorrow", "where are the gaps" | `/gaps` |
| "who's gone quiet", "who should we call" | `/lapsed` |
| "who keeps no-showing" | `/no-shows` |
| "what did we take", "how's the week" | `/takings` |
| "pull up X", "what do we know about X" | `/client` |
| "what's her formula", "record the mix" | `/formulas` |
| "record the patch test", "she had a reaction" | `/patch-test` |
| "what's low", "sell a serum", "stocktake" | `/stock` |
| "sell a voucher", "how much voucher money is out" | `/vouchers` |
| "show me the team", "change Ruby's hours" | `/team` |
| "the menu", "add a service" | `/services` |
| "are we compliant", "check the rules" | `/compliance` |
| "Monday review", "how are we set for the week" | `/weekly-review` |
| "note that X said...", "log the call" | `/log` |
| "remind tomorrow's clients", "confirmations" | `/draft-reminders` |
| "win back the quiet ones", "recall messages" | `/draft-recall` |
| "bring our Timely data across" | `/import` |
| "add a field", "change a rule", "our patch tests last a year" | `/customise` |
| "a page that shows..." | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run <cli> -- --help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Timely.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/timely
