#!/usr/bin/env node
// Loads supabase/seed.sql: Tui & Fern Hair Studio, a fictional Wellington
// salon with six on the team, fourteen clients, a menu, a formula record,
// retail stock, vouchers, eight weeks of visits behind and a booked week
// ahead. Every row has a derived id and inserts with ON CONFLICT DO NOTHING,
// so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from settings)             as settings,
           (select count(*) from staff)                as staff,
           (select count(*) from staff_hours)          as staff_hours,
           (select count(*) from clients)              as clients,
           (select count(*) from patch_tests)          as patch_tests,
           (select count(*) from services)             as services,
           (select count(*) from appointments)         as appointments,
           (select count(*) from appointment_services) as appointment_services,
           (select count(*) from formulas)             as formulas,
           (select count(*) from products)             as products,
           (select count(*) from sales)                as sales,
           (select count(*) from vouchers)             as vouchers,
           (select count(*) from client_notes)         as client_notes
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const db = await getDb();
  try {
    const counts = await seed(db);
    console.log('seeded:', Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '));
  } finally {
    await db.close();
  }
}
