---
description: Make this system yours in plain language. Add a field, change a rule's number, rename a category, add a column to a document. Writes the migration, applies it, updates the commands that touch it.
---

The operator will describe a change in their own words, for example "add a preferred stylist to every client", "our patch tests stand for a year", "lapsed for us is ten weeks", "put the client's phone number on the day sheet".

1. Read `CLAUDE.md`, the current schema in `supabase/migrations/`, and any command or document that touches the thing being changed. Say back in one line what you are about to change and where.
2. A number the rules read (patch test window, lapsed line, voucher warning) is a settings change: `settings set KEY VALUE`, done, no migration.
3. A real schema change: write the next numbered migration in `supabase/migrations/` (never edit an applied one). Default new columns sensibly so existing rows stay valid. Run `npm run migrate`; fix and rerun if it fails.
4. Update every place the change shows up: the CLI output, the affected slash commands, `views.json`, `documents.json`, the import mapping, and the README command table.
5. Run `npm test`. Add an assertion for the new behaviour if the change is visible in a command's output.
6. Branding (name, logo, colours) lives in `brand.json`: change it and rerun `npm run docs` or `npm run view`.

Report in three lines: what changed, the migration file (or setting), the commands that now show it. Never delete a column or a table without an explicit yes in this session.
