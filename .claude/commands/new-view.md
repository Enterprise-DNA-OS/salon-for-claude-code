---
description: Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the salon's brand by `npm run view`.
---

The operator will describe a page they want to look at, for example "a Saturday page: every chair by the hour", "a colour clients page with patch test dates", "a retail page by product for the month".

1. Work out which existing SQL views or tables answer each part. If a section needs a new query, write it as a SQL view in the next numbered migration and run `npm run migrate`, so the CLI and the page share one definition.
2. Add an entry to `views.json`: a `name` (kebab-case, becomes the file name), a `title`, an optional `subtitle`, and one `sections` item per block with `title`, `sql`, optional `note` and optional `columns`.
3. Run `npm run view -- <name>` and open `views/<name>.html` to check it reads well. Alias columns into plain words (`select c.name as client`).
4. Add one line to the README command table describing the view.

Report: the file path, the sections it has, and the command to regenerate it. The page is read-only by design. If the operator asks for buttons or editing, explain that changes are made through the slash commands and offer to add one.
