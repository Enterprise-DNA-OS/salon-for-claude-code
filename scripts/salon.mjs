#!/usr/bin/env node
// salon-for-claude-code: the one CLI. Claude Code slash commands call this;
// so can you.
//
//   node scripts/salon.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system is a salon or spa's operating record the way Timely sells it:
// the team and their hours, the client book with its history, the menu, the
// appointment book from booked to checked out, the colour formula record,
// patch tests, retail stock, sales and gift vouchers. It sends nothing and
// connects to nothing: reminders and recalls draft to drafts/, and a person
// sends them.
//
// The gates, and there are no force flags:
//   * a service that needs a patch test is not booked without a clear
//     allergy alert test on record, done at least 48 hours before and inside
//     the validity window (the colour manufacturer's instructions; HSWA 2015
//     s 36 duty of care). A recorded reaction refuses colour outright
//   * nobody is double-booked, and nothing is booked outside the staff
//     member's recorded working hours
//   * checkout confirms what happened; a booking that already resolved
//     refuses a second resolution
//   * retail never sells stock that is not on the shelf; a voucher never
//     redeems past its balance (past its expiry it warns: goodwill is the
//     salon's call)
//   * marketing drafts only address clients who opted in (Unsolicited
//     Electronic Messages Act 2007); appointment reminders are not marketing
//   * no deleting records: appointments cancel with a reason, clients
//     archive, the formula record stays

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table, money, price, hours as fmtHours, isoDate, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'week', 'patch-test', 'opt-in', 'clear', 'walk-in']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));
const hhmm = (v) => String(v ?? '').slice(0, 5);

// ---------------------------------------------------------------------------
// Dates and times

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand exports write DD/MM/YYYY: the first number is the day unless
  // the second is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  throw new CliError(`Cannot read ${what} "${s}". Use YYYY-MM-DD (or today / tomorrow / DD/MM/YYYY).`);
}

function parseTime(v, what = 'time') {
  if (!v || v === true) return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour (or 9:00am).`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) throw new CliError(`Cannot read ${what} "${s}". Use HH:MM, 24-hour.`);
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function addMinutes(hm, minutes) {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) throw new CliError(`That booking runs past midnight (${hm} + ${minutes} minutes). Split it or start earlier.`);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// ---------------------------------------------------------------------------
// Resolvers: partial ids, case-insensitive names, list-and-exit-1 when ambiguous

async function resolveClient(db, query, { includeArchived = false } = {}) {
  if (!query) throw new CliError('Which client? Give a name (partial is fine).');
  const q = String(query).trim();
  const rows = await db.query(
    `select * from v_clients where name ilike $1 ${includeArchived ? '' : `and status = 'active'`} order by name`,
    [`%${q}%`],
  );
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No client matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} clients:\n${rows.map((r) => `  ${r.name}${r.phone ? ` (${r.phone})` : ''}`).join('\n')}\nSay more of the name.`);
}

async function resolveStaff(db, query, { includeFormer = false } = {}) {
  if (!query) throw new CliError('Which team member? Give a name (partial is fine).');
  const q = String(query).trim();
  const rows = await db.query(
    `select * from staff where name ilike $1 ${includeFormer ? '' : `and status = 'active'`} order by name`,
    [`%${q}%`],
  );
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No team member matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} people:\n${rows.map((r) => `  ${r.name} (${r.role})`).join('\n')}\nSay more of the name.`);
}

async function resolveService(db, query) {
  if (!query) throw new CliError('Which service? Give a name (partial is fine).');
  const q = String(query).trim();
  const rows = await db.query(`select * from services where name ilike $1 and active order by name`, [`%${q}%`]);
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No service matches "${q}". See the menu: services`);
  throw new CliError(`"${q}" matches ${rows.length} services: ${rows.map((r) => r.name).join(', ')}. Say more of the name.`);
}

async function resolveProduct(db, query) {
  if (!query) throw new CliError('Which product? Give a name (partial is fine).');
  const q = String(query).trim();
  const rows = await db.query(`select * from products where name ilike $1 and active order by name`, [`%${q}%`]);
  const exact = rows.filter((r) => r.name.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) throw new CliError(`No product matches "${q}".`);
  throw new CliError(`"${q}" matches ${rows.length} products: ${rows.map((r) => r.name).join(', ')}. Say more of the name.`);
}

async function resolveAppointment(db, ref) {
  if (!ref) throw new CliError('Which appointment? Give its reference (APT-...).');
  let q = String(ref).trim().toUpperCase();
  if (/^\d+$/.test(q)) q = `APT-${q}`;
  const rows = await db.query(`select * from v_appointments where upper(ref) = $1`, [q]);
  if (rows.length === 1) return rows[0];
  throw new CliError(`No appointment matches "${ref}".`);
}

async function resolveVoucher(db, ref) {
  if (!ref) throw new CliError('Which voucher? Give its reference (GV-...).');
  let q = String(ref).trim().toUpperCase();
  if (/^\d+$/.test(q)) q = `GV-${q}`;
  const rows = await db.query(`select * from v_vouchers where upper(ref) = $1`, [q]);
  if (rows.length === 1) return rows[0];
  throw new CliError(`No voucher matches "${ref}".`);
}

async function mintRef(db, tableName, prefix, start) {
  const [row] = await db.query(
    `select coalesce(max(substring(ref from ${prefix.length + 2})::int), $1) + 1 as n
     from ${tableName} where ref like '${prefix}-%' and substring(ref from ${prefix.length + 2}) ~ '^[0-9]+$'`,
    [start - 1],
  );
  return `${prefix}-${row.n}`;
}

// ---------------------------------------------------------------------------
// The gates. One place, used by book add (and the importer names what it
// carries in anyway). Violations refuse; there are no force flags.

async function bookingGates(db, { client, staffRow, services, onDate, startsAt, endsAt }) {
  const violations = [];

  // The patch test gate. A reaction on record refuses colour outright; a
  // missing or stale test refuses until a clear one is recorded at least 48
  // hours before the appointment (manufacturer instructions; HSWA 2015 s 36).
  if (services.some((s) => s.requires_patch_test)) {
    const [pt] = await db.query(`select * from v_patch_tests where client_id = $1`, [client.client_id ?? client.id]);
    if (pt && pt.state === 'REACTION') {
      violations.push(
        `${client.name}'s last patch test recorded a REACTION (${isoDate(pt.tested_on)}${pt.note ? `: ${pt.note}` : ''}). ` +
        `Colour is not booked for them from here. That is a conversation with the client and their doctor, not a booking.`,
      );
    } else {
      const [ok] = await db.query(`select patch_test_ok($1, $2::date) as ok`, [client.client_id ?? client.id, onDate]);
      if (!ok?.ok) {
        const why = !pt || pt.state === 'none'
          ? 'no allergy alert test on record'
          : `their last clear test was ${isoDate(pt.tested_on)}, ${pt.state === 'expired' ? 'outside the validity window' : 'not 48 hours before this booking'}`;
        violations.push(
          `${services.filter((s) => s.requires_patch_test).map((s) => s.name).join(' + ')} needs a patch test and ${client.name} has ${why}. ` +
          `The colour manufacturer requires an allergy alert test at least 48 hours before (Health and Safety at Work Act 2015 s 36 duty of care). ` +
          `Record one first: client patch-test "${client.name}" --on=DATE`,
        );
      }
    }
  }

  // One chair, one client, one time.
  const clashes = await db.query(
    `select ref, client, starts_at, ends_at from v_appointments
     where staff_id = $1 and on_date = $2::date and status in ('booked', 'completed')
       and starts_at < $4::time and ends_at > $3::time`,
    [staffRow.id, onDate, startsAt, endsAt],
  );
  if (clashes.length) {
    const c = clashes[0];
    violations.push(`${staffRow.name} is double-booked: ${c.ref} (${c.client}, ${hhmm(c.starts_at)} to ${hhmm(c.ends_at)}) overlaps. Pick another time or another chair.`);
  }

  // Inside the working window. No hours on record at all means no gate yet.
  const anyHours = await db.query(`select 1 from staff_hours where staff_id = $1 limit 1`, [staffRow.id]);
  if (anyHours.length) {
    const windows = await db.query(
      `select starts_at, ends_at from staff_hours where staff_id = $1 and weekday = extract(dow from $2::date)::int`,
      [staffRow.id, onDate],
    );
    if (!windows.length) {
      violations.push(`${staffRow.name} does not work that day. Their hours: staff hours "${staffRow.name}"`);
    } else if (!windows.some((w) => hhmm(w.starts_at) <= startsAt && hhmm(w.ends_at) >= endsAt)) {
      violations.push(
        `${startsAt} to ${endsAt} sits outside ${staffRow.name}'s hours that day (${windows.map((w) => `${hhmm(w.starts_at)} to ${hhmm(w.ends_at)}`).join(', ')}). ` +
        `Book inside the window, or change it: staff hours "${staffRow.name}" DAY --start= --end=`,
      );
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// The book

async function cmdBook(db, flags) {
  const from = flags.day ? parseDate(flags.day, '--day') : today();
  const to = flags.day ? from : addDays(today(), 6);
  let sql = `select * from v_appointments where on_date >= $1::date and on_date <= $2::date and status <> 'cancelled'`;
  const params = [from, to];
  if (flags.staff) {
    const st = await resolveStaff(db, flags.staff);
    sql += ` and staff_id = $3`;
    params.push(st.id);
  }
  sql += ` order by on_date, starts_at, staff`;
  const rows = await db.query(sql, params);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading(flags.day ? `The book, ${from}` : `The book, ${from} to ${to}`));
  console.log(table(rows, [
    { key: 'on_date', label: 'day', format: (v) => isoDate(v) },
    { key: 'starts_at', label: 'starts', format: hhmm },
    { key: 'ends_at', label: 'ends', format: hhmm },
    { key: 'staff', label: 'with' },
    { key: 'client', label: 'client' },
    { key: 'services', label: 'services', width: 34 },
    { key: 'total_cents', label: 'price', align: 'right', format: (v) => (v == null ? '' : money(v)) },
    { key: 'state', label: 'state' },
  ]));
  const flagged = rows.filter((r) => ['NO PATCH TEST', 'UNCONFIRMED', 'NOT CHECKED OUT'].includes(r.state));
  if (flagged.length) console.log(`\n  ${flagged.length} booking(s) want something: run attention.`);
}

async function cmdBookAdd(db, args, flags) {
  const [clientQ, staffQ] = args;
  const client = await resolveClient(db, clientQ);
  const staffRow = await resolveStaff(db, staffQ);
  const onDate = parseDate(flags.date ?? flags.on, '--date');
  const startsAt = parseTime(flags.at ?? flags.start, '--at');
  if (!onDate || !startsAt) throw new CliError('A booking needs --date= and --at= (and --services="Style cut, Toner").');
  const serviceNames = str(flags.services).split(',').map((s) => s.trim()).filter(Boolean);
  if (!serviceNames.length) throw new CliError('Which services? --services="Style cut & finish" (comma-separate for more than one).');
  const services = [];
  for (const name of serviceNames) services.push(await resolveService(db, name));
  const duration = services.reduce((t, s) => t + num(s.duration_minutes), 0);
  const endsAt = flags.end ? parseTime(flags.end, '--end') : addMinutes(startsAt, duration);

  const violations = await bookingGates(db, { client, staffRow, services, onDate, startsAt, endsAt });
  if (violations.length) throw new CliError(`Not booked:\n  * ${violations.join('\n  * ')}`);

  const ref = await mintRef(db, 'appointments', 'APT', 1001);
  const [apt] = await db.query(
    `insert into appointments (ref, client_id, staff_id, on_date, starts_at, ends_at, status, source, note)
     values ($1, $2, $3, $4::date, $5::time, $6::time, 'booked', $7, $8) returning id`,
    [ref, client.client_id, staffRow.id, onDate, startsAt, endsAt, str(flags.source) || 'phone', str(flags.note) || null],
  );
  for (let i = 0; i < services.length; i++) {
    await db.query(
      `insert into appointment_services (appointment_id, service_id, price_cents, sort) values ($1, $2, $3, $4)`,
      [apt.id, services[i].id, num(flags.price ? Math.round(Number(flags.price) * 100) : services[i].price_cents), i],
    );
  }
  const [row] = await db.query(`select * from v_appointments where appointment_id = $1`, [apt.id]);
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.ref}: ${row.client} with ${row.staff}, ${isoDate(row.on_date)} ${hhmm(row.starts_at)} to ${hhmm(row.ends_at)} (${row.services}, ${money(row.total_cents)}).`);
}

async function cmdConfirm(db, args, flags) {
  const apt = await resolveAppointment(db, args[0]);
  if (apt.status !== 'booked') throw new CliError(`${apt.ref} is ${apt.status}; only a booked appointment confirms.`);
  await db.query(`update appointments set confirmed_at = now() where id = $1`, [apt.appointment_id]);
  const [row] = await db.query(`select * from v_appointments where appointment_id = $1`, [apt.appointment_id]);
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.ref} confirmed: ${row.client}, ${isoDate(row.on_date)} ${hhmm(row.starts_at)}.`);
}

async function cmdCancel(db, args, flags) {
  const apt = await resolveAppointment(db, args[0]);
  if (!str(flags.reason)) throw new CliError('A cancellation carries its reason: --reason="..."');
  if (['completed', 'cancelled', 'no_show'].includes(apt.status)) throw new CliError(`${apt.ref} is already ${apt.status}.`);
  await db.query(`update appointments set status = 'cancelled', cancel_reason = $2 where id = $1`, [apt.appointment_id, str(flags.reason)]);
  if (flags.json) return console.log(JSON.stringify({ ref: apt.ref, status: 'cancelled', reason: str(flags.reason) }, null, 2));
  console.log(`  ${apt.ref} cancelled: ${str(flags.reason)}`);
}

async function cmdNoShow(db, args, flags) {
  const apt = await resolveAppointment(db, args[0]);
  if (apt.status !== 'booked') throw new CliError(`${apt.ref} is ${apt.status}; only a booked appointment can be marked a no-show.`);
  await db.query(`update appointments set status = 'no_show' where id = $1`, [apt.appointment_id]);
  const [ns] = await db.query(`select * from v_no_shows where ref = $1`, [apt.ref]);
  if (flags.json) return console.log(JSON.stringify(ns, null, 2));
  console.log(`  ${apt.ref} marked no-show: ${ns.client} (${ns.no_shows_6m} in six months). Call while it is fresh; if this is a habit, a deposit next time is fair.`);
}

async function cmdCheckout(db, args, flags) {
  const apt = await resolveAppointment(db, args[0]);
  if (apt.status !== 'booked') throw new CliError(`${apt.ref} is already ${apt.status}; checkout confirms a visit, it never invents one.`);

  // Retail over the counter: --retail="Repair shampoo x1, Silk serum"
  const retailLines = [];
  for (const part of str(flags.retail).split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)(?:\s*x\s*(\d+))?$/i);
    const product = await resolveProduct(db, m[1].trim());
    const qty = Number(m[2] ?? 1);
    if (num(product.stock_on_hand) < qty) {
      throw new CliError(`Only ${product.stock_on_hand} of ${product.name} on the shelf; cannot sell ${qty}. Count it if the shelf disagrees: stock take "${product.name}" --count=`);
    }
    retailLines.push({ product, qty });
  }

  await db.query(`update appointments set status = 'completed' where id = $1`, [apt.appointment_id]);
  let retailCents = 0;
  for (const { product, qty } of retailLines) {
    await db.query(
      `insert into sales (client_id, staff_id, appointment_id, product_id, qty, unit_price_cents, sold_on)
       values ($1, $2, $3, $4, $5, $6, $7::date)`,
      [apt.client_id, apt.staff_id, apt.appointment_id, product.id, qty, num(product.price_cents), isoDate(apt.on_date)],
    );
    await db.query(`update products set stock_on_hand = stock_on_hand - $2 where id = $1`, [product.id, qty]);
    retailCents += qty * num(product.price_cents);
  }

  const [future] = await db.query(
    `select min(on_date) as next_on from appointments where client_id = $1 and status = 'booked' and on_date > $2::date`,
    [apt.client_id, isoDate(apt.on_date)],
  );
  const rebooked = !!future?.next_on;
  const [formula] = await db.query(
    `select 1 as yes from formulas where client_id = $1 and recorded_on = $2::date limit 1`,
    [apt.client_id, isoDate(apt.on_date)],
  );
  const out = {
    ref: apt.ref,
    client: apt.client,
    services: apt.services,
    service_cents: num(apt.total_cents),
    retail_cents: retailCents,
    total_cents: num(apt.total_cents) + retailCents,
    rebooked,
    next_booking_on: future?.next_on ? isoDate(future.next_on) : null,
    formula_recorded: apt.needs_patch_test ? !!formula : null,
  };
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  console.log(`  ${apt.ref} checked out: ${apt.client}, ${apt.services} ${money(out.service_cents)}${retailCents ? ` + retail ${money(retailCents)}` : ''} = ${money(out.total_cents)}.`);
  if (rebooked) console.log(`  Rebooked: next visit ${out.next_booking_on}.`);
  else console.log(`  No future booking on the book: offer one before they leave. Rebooking at the till beats a recall email in a month.`);
  if (apt.needs_patch_test && !formula) console.log(`  Colour with no formula recorded: formula add "${apt.client}" "..." while it is still in someone's head.`);
}

// ---------------------------------------------------------------------------
// Clients

async function cmdClients(db, flags) {
  let rows;
  if (flags.lapsed) rows = await db.query(`select * from v_lapsed`);
  else rows = await db.query(`select * from v_clients where status = 'active' ${flags.all ? '' : ''} order by name`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  if (flags.lapsed) {
    console.log(heading('Lapsed: worth the most first'));
    console.log(table(rows, [
      { key: 'name', label: 'client' },
      { key: 'last_visit_on', label: 'last in', format: isoDate },
      { key: 'days_since_visit', label: 'quiet days', align: 'right' },
      { key: 'usual_gap_days', label: 'usual gap', align: 'right' },
      { key: 'spend_cents_12m', label: 'spend 12m', align: 'right', format: (v) => money(v) },
      { key: 'marketing_opt_in', label: 'recall ok', format: (v) => (v ? 'yes' : 'NO (call, not campaign)') },
    ]));
    return;
  }
  console.log(heading('The client book'));
  console.log(table(rows, [
    { key: 'name', label: 'client' },
    { key: 'phone', label: 'phone' },
    { key: 'last_visit_on', label: 'last in', format: isoDate },
    { key: 'next_booking_on', label: 'next booked', format: isoDate },
    { key: 'visits_12m', label: 'visits 12m', align: 'right' },
    { key: 'spend_cents_12m', label: 'spend 12m', align: 'right', format: (v) => money(v) },
    { key: 'patch_test', label: 'patch test' },
    { key: 'lapsed', label: 'lapsed', format: (v) => (v ? 'LAPSED' : '') },
  ]));
}

async function cmdClient(db, args, flags) {
  const c = await resolveClient(db, args[0], { includeArchived: true });
  const visits = await db.query(
    `select ref, on_date, staff, services, total_cents, state from v_appointments where client_id = $1 order by on_date desc limit 12`,
    [c.client_id],
  );
  const forms = await db.query(
    `select f.recorded_on, s.name as staff, f.formula from formulas f left join staff s on s.id = f.staff_id
     where f.client_id = $1 order by f.recorded_on desc limit 6`,
    [c.client_id],
  );
  const tests = await db.query(`select tested_on, outcome, note from patch_tests where client_id = $1 order by tested_on desc limit 5`, [c.client_id]);
  const notes = await db.query(`select noted_on, note from client_notes where client_id = $1 order by noted_on desc limit 6`, [c.client_id]);
  const retail = await db.query(
    `select sl.sold_on, p.name, sl.qty, sl.unit_price_cents from sales sl join products p on p.id = sl.product_id
     where sl.client_id = $1 order by sl.sold_on desc limit 6`,
    [c.client_id],
  );
  const out = { client: c, visits, formulas: forms, patch_tests: tests, retail, notes };
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  console.log(heading(c.name));
  console.log(`  ${[c.phone, c.email].filter(Boolean).join('  ')}${c.birthday ? `  birthday ${isoDate(c.birthday).slice(5)}` : ''}`);
  console.log(`  patch test: ${c.patch_test}${c.patch_tested_on ? ` (${isoDate(c.patch_tested_on)})` : ''}   marketing: ${c.marketing_opt_in ? 'opted in' : 'NOT opted in (UEMA 2007: no campaigns)'}${c.allergy_note ? `\n  ALLERGY NOTE: ${c.allergy_note}` : ''}`);
  console.log(`  last in ${isoDate(c.last_visit_on) || 'never'}${c.usual_gap_days ? `, usually every ${c.usual_gap_days} days` : ''}; spend 12m ${money(c.spend_cents_12m)}; next booked ${isoDate(c.next_booking_on) || 'nothing'}${c.lapsed ? '  LAPSED' : ''}`);
  console.log(heading('Visits'));
  console.log(table(visits, [
    { key: 'ref', label: 'ref' },
    { key: 'on_date', label: 'day', format: isoDate },
    { key: 'staff', label: 'with' },
    { key: 'services', label: 'services', width: 34 },
    { key: 'total_cents', label: 'price', align: 'right', format: (v) => (v == null ? '' : money(v)) },
    { key: 'state', label: 'state' },
  ]));
  if (forms.length) {
    console.log(heading('Formula record'));
    for (const f of forms) console.log(`  ${isoDate(f.recorded_on)}  ${f.staff || ''}  ${f.formula}`);
  }
  if (notes.length) {
    console.log(heading('Notes'));
    for (const n of notes) console.log(`  ${isoDate(n.noted_on)}  ${n.note}`);
  }
}

async function cmdClientAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('client add NAME [--phone= --email= --birthday= --opt-in --allergy= --source=]');
  const dup = await db.query(`select name from clients where lower(name) = lower($1)`, [name]);
  if (dup.length) throw new CliError(`${dup[0].name} is already on the book. client "${name}" shows them.`);
  const optIn = flags['opt-in'] === true ? true : yesNo(flags['opt-in'], false);
  const [row] = await db.query(
    `insert into clients (name, phone, email, birthday, marketing_opt_in, allergy_note, referral_source)
     values ($1, $2, $3, $4::date, $5, $6, $7) returning *`,
    [name, str(flags.phone) || null, str(flags.email) || null, flags.birthday ? parseDate(flags.birthday, '--birthday') : null,
     optIn, str(flags.allergy) || null, str(flags.source) || null],
  );
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.name} added${optIn ? ', opted in to marketing' : ' (not opted in: reminders yes, campaigns no)'}. No patch test on record yet.`);
}

async function cmdClientSet(db, args, flags) {
  const c = await resolveClient(db, args[0], { includeArchived: true });
  const sets = [];
  const params = [c.client_id];
  const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (flags.phone !== undefined) add('phone', str(flags.phone) || null);
  if (flags.email !== undefined) add('email', str(flags.email) || null);
  if (flags.birthday !== undefined) add('birthday', parseDate(flags.birthday, '--birthday'));
  if (flags['opt-in'] !== undefined) add('marketing_opt_in', flags['opt-in'] === true ? true : yesNo(flags['opt-in'], false));
  if (flags.allergy !== undefined) add('allergy_note', str(flags.allergy) || null);
  if (flags.archive !== undefined) add('status', 'archived');
  if (!sets.length) throw new CliError('Nothing to change. Flags: --phone --email --birthday --opt-in=yes|no --allergy --archive');
  await db.query(`update clients set ${sets.join(', ')} where id = $1`, params);
  const [row] = await db.query(`select * from v_clients where client_id = $1`, [c.client_id]);
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.name} updated.`);
}

async function cmdPatchTest(db, args, flags) {
  const c = await resolveClient(db, args[0]);
  const testedOn = flags.on ? parseDate(flags.on, '--on') : today();
  const outcome = (str(flags.outcome) || 'clear').toLowerCase();
  if (!['clear', 'reaction'].includes(outcome)) throw new CliError('--outcome is clear or reaction.');
  const staffRow = flags.staff ? await resolveStaff(db, flags.staff) : null;
  await db.query(
    `insert into patch_tests (client_id, tested_on, outcome, staff_id, note) values ($1, $2::date, $3, $4, $5)`,
    [c.client_id, testedOn, outcome, staffRow?.id ?? null, str(flags.note) || null],
  );
  const [pt] = await db.query(`select * from v_patch_tests where client_id = $1`, [c.client_id]);
  if (flags.json) return console.log(JSON.stringify(pt, null, 2));
  if (outcome === 'reaction') console.log(`  Reaction recorded for ${c.name}, ${testedOn}. Colour is refused for them from here on; that is now a professional conversation, not a booking.`);
  else console.log(`  Patch test recorded for ${c.name}: clear, ${testedOn}. Colour books from ${addDays(testedOn, 2)}.`);
}

// ---------------------------------------------------------------------------
// Formulas and notes

async function cmdFormula(db, sub, args, flags) {
  if (sub === 'add') {
    const c = await resolveClient(db, args[0]);
    const text = args.slice(1).join(' ').trim() || str(flags.formula);
    if (!text) throw new CliError('formula add CLIENT "the mix, the timing, what to change next time"');
    const staffRow = flags.staff ? await resolveStaff(db, flags.staff) : null;
    const on = flags.on ? parseDate(flags.on, '--on') : today();
    await db.query(
      `insert into formulas (client_id, recorded_on, staff_id, formula) values ($1, $2::date, $3, $4)`,
      [c.client_id, on, staffRow?.id ?? null, text],
    );
    if (flags.json) return console.log(JSON.stringify({ client: c.name, recorded_on: on, formula: text }, null, 2));
    return console.log(`  Formula recorded for ${c.name} (${on}).`);
  }
  const c = await resolveClient(db, args[0], { includeArchived: true });
  const rows = await db.query(
    `select f.recorded_on, s.name as staff, f.formula from formulas f left join staff s on s.id = f.staff_id
     where f.client_id = $1 order by f.recorded_on desc`,
    [c.client_id],
  );
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading(`Formula record: ${c.name}`));
  if (!rows.length) return console.log('  (none yet)');
  for (const f of rows) console.log(`  ${isoDate(f.recorded_on)}  ${f.staff || ''}  ${f.formula}`);
}

async function cmdNote(db, sub, args, flags) {
  if (sub === 'add') {
    const c = await resolveClient(db, args[0], { includeArchived: true });
    const text = args.slice(1).join(' ').trim();
    if (!text) throw new CliError('note add CLIENT TEXT');
    await db.query(`insert into client_notes (client_id, note) values ($1, $2)`, [c.client_id, text]);
    return console.log(`  Noted on ${c.name}'s record.`);
  }
  const c = await resolveClient(db, args[0], { includeArchived: true });
  const rows = await db.query(`select noted_on, note from client_notes where client_id = $1 order by noted_on desc`, [c.client_id]);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading(`Notes: ${c.name}`));
  for (const n of rows) console.log(`  ${isoDate(n.noted_on)}  ${n.note}`);
  if (!rows.length) console.log('  (none)');
}

// ---------------------------------------------------------------------------
// The numbers

async function cmdRebooking(db, flags) {
  const rows = await db.query(`select * from v_rebooking order by rate_pct desc, staff`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('Rebooking, last 28 days'));
  console.log(table(rows, [
    { key: 'staff', label: 'stylist' },
    { key: 'visits', label: 'visits', align: 'right' },
    { key: 'rebooked', label: 'rebooked', align: 'right' },
    { key: 'rate_pct', label: 'rate', align: 'right', format: (v) => `${v}%` },
  ]));
  const visits = rows.reduce((t, r) => t + num(r.visits), 0);
  const rebooked = rows.reduce((t, r) => t + num(r.rebooked), 0);
  if (visits) console.log(`\n  Whole team: ${rebooked} of ${visits} visits left holding the next appointment (${Math.round((100 * rebooked) / visits)}%). The cheapest marketing you will ever run happens at the till.`);
}

async function cmdGaps(db, flags) {
  const rows = await db.query(`select * from v_gaps where on_date >= current_date order by on_date, staff`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('The empty chair, next 7 days'));
  console.log(table(rows, [
    { key: 'on_date', label: 'day', format: isoDate },
    { key: 'staff', label: 'chair' },
    { key: 'starts_at', label: 'from', format: hhmm },
    { key: 'ends_at', label: 'to', format: hhmm },
    { key: 'booked_minutes', label: 'booked', align: 'right', format: (v) => fmtHours(v) },
    { key: 'free_minutes', label: 'open', align: 'right', format: (v) => fmtHours(v) },
  ]));
  console.log('\n  Open hours are the recall list\'s job: lapsed shows who to call first.');
}

async function cmdNoShows(db, flags) {
  const rows = await db.query(`select * from v_no_shows where on_date >= current_date - 60 order by on_date desc`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('No-shows, last 60 days'));
  console.log(table(rows, [
    { key: 'ref', label: 'ref' },
    { key: 'on_date', label: 'day', format: isoDate },
    { key: 'client', label: 'client' },
    { key: 'staff', label: 'with' },
    { key: 'services', label: 'services', width: 30 },
    { key: 'total_cents', label: 'value', align: 'right', format: (v) => money(v) },
    { key: 'no_shows_6m', label: 'in 6m', align: 'right' },
  ]));
  console.log('\n  Two or more in six months: take a deposit at booking. Say it kindly, mean it.');
}

async function cmdTakings(db, flags) {
  const days = num(flags.days) || 7;
  const rows = await db.query(
    `select staff, sum(service_cents)::bigint as service_cents, sum(retail_cents)::bigint as retail_cents,
            sum(visits)::int as visits, sum(retail_units)::int as retail_units
     from v_takings where on_date > current_date - $1::int and on_date <= current_date
     group by staff order by sum(service_cents) + sum(retail_cents) desc`,
    [days],
  );
  const totals = rows.reduce(
    (t, r) => ({ service: t.service + num(r.service_cents), retail: t.retail + num(r.retail_cents), visits: t.visits + num(r.visits) }),
    { service: 0, retail: 0, visits: 0 },
  );
  const out = { days, by_staff: rows, service_cents: totals.service, retail_cents: totals.retail, total_cents: totals.service + totals.retail, visits: totals.visits };
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  console.log(heading(`Takings, last ${days} days`));
  console.log(table(rows, [
    { key: 'staff', label: 'chair' },
    { key: 'visits', label: 'visits', align: 'right' },
    { key: 'service_cents', label: 'services', align: 'right', format: (v) => money(v) },
    { key: 'retail_units', label: 'retail units', align: 'right' },
    { key: 'retail_cents', label: 'retail', align: 'right', format: (v) => money(v) },
  ]));
  console.log(`\n  Services ${money(totals.service)} + retail ${money(totals.retail)} = ${money(totals.service + totals.retail)} across ${totals.visits} visit(s).`);
  if (totals.visits) console.log(`  Average ticket ${money(Math.round((totals.service + totals.retail) / totals.visits))}; retail per visit ${money(Math.round(totals.retail / totals.visits))}.`);
}

// ---------------------------------------------------------------------------
// Team, menu, stock, vouchers

async function cmdTeam(db, flags) {
  const rows = await db.query(
    `select st.name, st.role, st.phone, st.status,
       (select count(*) from appointments a where a.staff_id = st.id and a.status = 'booked' and a.on_date >= current_date and a.on_date < current_date + 7) as booked_next_7,
       (select string_agg(distinct h.starts_at::text || '-' || h.ends_at::text, ', ') from staff_hours h where h.staff_id = st.id) as windows
     from staff st ${flags.all ? '' : `where st.status = 'active'`} order by st.name`,
  );
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('The team'));
  console.log(table(rows, [
    { key: 'name', label: 'name' },
    { key: 'role', label: 'role' },
    { key: 'phone', label: 'phone' },
    { key: 'booked_next_7', label: 'booked next 7d', align: 'right' },
    { key: 'windows', label: 'hours', width: 24, format: (v) => (v ? String(v).replace(/:00(?=[-,]|$)/g, '') : '(not set)') },
    { key: 'status', label: 'status' },
  ]));
}

async function cmdStaffAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name) throw new CliError('staff add NAME [--role= --phone= --email=]');
  const [row] = await db.query(
    `insert into staff (name, role, phone, email) values ($1, $2, $3, $4) returning *`,
    [name, str(flags.role) || 'stylist', str(flags.phone) || null, str(flags.email) || null],
  );
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.name} added (${row.role}). Set their hours: staff hours "${row.name}" mon --start=9:00 --end=17:00`);
}

async function cmdStaffHours(db, args, flags) {
  const staffRow = await resolveStaff(db, args[0]);
  const dayArg = (args[1] || '').toLowerCase().slice(0, 3);
  if (!dayArg) {
    const rows = await db.query(`select weekday, starts_at, ends_at from staff_hours where staff_id = $1 order by weekday`, [staffRow.id]);
    if (flags.json) return console.log(JSON.stringify(rows, null, 2));
    console.log(heading(`${staffRow.name}'s hours`));
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const r of rows) console.log(`  ${names[r.weekday]}  ${hhmm(r.starts_at)} to ${hhmm(r.ends_at)}`);
    if (!rows.length) console.log('  (none set: bookings are ungated for them)');
    return;
  }
  const days = dayArg === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [WEEKDAYS[dayArg]];
  if (days[0] === undefined) throw new CliError('Which day? mon tue wed thu fri sat sun, or all.');
  if (flags.clear) {
    await db.query(`delete from staff_hours where staff_id = $1 and weekday = any($2)`, [staffRow.id, days]);
    return console.log(`  ${staffRow.name}: ${dayArg} cleared.`);
  }
  const start = parseTime(flags.start, '--start');
  const end = parseTime(flags.end, '--end');
  if (!start || !end) throw new CliError('staff hours NAME DAY --start=9:00 --end=17:00 (or --clear)');
  for (const d of days) {
    await db.query(`delete from staff_hours where staff_id = $1 and weekday = $2`, [staffRow.id, d]);
    await db.query(`insert into staff_hours (staff_id, weekday, starts_at, ends_at) values ($1, $2, $3::time, $4::time)`, [staffRow.id, d, start, end]);
  }
  console.log(`  ${staffRow.name}: ${dayArg} ${start} to ${end}.`);
}

async function cmdServices(db, flags) {
  const rows = await db.query(`select * from services ${flags.all ? '' : 'where active'} order by category, name`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('The menu'));
  console.log(table(rows, [
    { key: 'category', label: 'category' },
    { key: 'name', label: 'service' },
    { key: 'duration_minutes', label: 'minutes', align: 'right' },
    { key: 'price_cents', label: 'price', align: 'right', format: (v) => price(v) },
    { key: 'requires_patch_test', label: 'patch test', format: (v) => (v ? 'required' : '') },
  ]));
}

async function cmdServiceAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name || !flags.price || !flags.minutes) throw new CliError('service add NAME --category= --minutes= --price= [--patch-test]');
  const [row] = await db.query(
    `insert into services (name, category, duration_minutes, price_cents, requires_patch_test) values ($1, $2, $3, $4, $5) returning *`,
    [name, str(flags.category) || 'cut', num(flags.minutes), Math.round(Number(flags.price) * 100), !!flags['patch-test']],
  );
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.name}: ${row.duration_minutes} minutes, ${price(row.price_cents)}${row.requires_patch_test ? ', patch test required' : ''}.`);
}

async function cmdStock(db, sub, args, flags) {
  if (sub === 'take') {
    const product = await resolveProduct(db, args[0]);
    if (flags.count === undefined) throw new CliError('stock take PRODUCT --count=N (what the shelf actually holds)');
    await db.query(`update products set stock_on_hand = $2 where id = $1`, [product.id, num(flags.count)]);
    return console.log(`  ${product.name}: ${num(flags.count)} on hand (was ${product.stock_on_hand}).`);
  }
  const rows = await db.query(`select * from products where active order by kind, name`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('Stock'));
  console.log(table(rows, [
    { key: 'kind', label: 'kind' },
    { key: 'name', label: 'product' },
    { key: 'price_cents', label: 'price', align: 'right', format: (v) => price(v) },
    { key: 'stock_on_hand', label: 'on hand', align: 'right' },
    { key: 'reorder_level', label: 'reorder at', align: 'right' },
  ]));
  const low = rows.filter((r) => num(r.stock_on_hand) <= num(r.reorder_level));
  if (low.length) console.log(`\n  ${low.length} at or under reorder: ${low.map((r) => r.name).join(', ')}.`);
}

async function cmdProductAdd(db, args, flags) {
  const name = args.join(' ').trim();
  if (!name || flags.price === undefined) throw new CliError('product add NAME --price= [--kind=retail|professional --stock= --reorder=]');
  const [row] = await db.query(
    `insert into products (name, kind, price_cents, stock_on_hand, reorder_level) values ($1, $2, $3, $4, $5) returning *`,
    [name, str(flags.kind) || 'retail', Math.round(Number(flags.price) * 100), num(flags.stock), num(flags.reorder)],
  );
  if (flags.json) return console.log(JSON.stringify(row, null, 2));
  console.log(`  ${row.name} added: ${price(row.price_cents)}, ${row.stock_on_hand} on hand.`);
}

async function cmdSale(db, args, flags) {
  const c = await resolveClient(db, args[0]);
  const product = await resolveProduct(db, args[1]);
  const qty = num(flags.qty) || 1;
  if (num(product.stock_on_hand) < qty) {
    throw new CliError(`Only ${product.stock_on_hand} of ${product.name} on the shelf; cannot sell ${qty}. Count it if the shelf disagrees: stock take "${product.name}" --count=`);
  }
  const staffRow = flags.staff ? await resolveStaff(db, flags.staff) : null;
  await db.query(
    `insert into sales (client_id, staff_id, product_id, qty, unit_price_cents, sold_on) values ($1, $2, $3, $4, $5, current_date)`,
    [c.client_id, staffRow?.id ?? null, product.id, qty, num(product.price_cents)],
  );
  await db.query(`update products set stock_on_hand = stock_on_hand - $2 where id = $1`, [product.id, qty]);
  const total = qty * num(product.price_cents);
  if (flags.json) return console.log(JSON.stringify({ client: c.name, product: product.name, qty, total_cents: total }, null, 2));
  console.log(`  ${c.name}: ${qty} x ${product.name} = ${price(total)}. ${num(product.stock_on_hand) - qty} left on the shelf.`);
}

async function cmdVoucher(db, sub, args, flags) {
  if (sub === 'sell') {
    if (flags.value === undefined) throw new CliError('voucher sell --value=100 [--client= --recipient= --months=12]');
    const c = flags.client ? await resolveClient(db, flags.client) : null;
    const months = num(flags.months) || 12;
    const ref = await mintRef(db, 'vouchers', 'GV', 101);
    const cents = Math.round(Number(flags.value) * 100);
    const [row] = await db.query(
      `insert into vouchers (ref, client_id, recipient, value_cents, balance_cents, sold_on, expires_on)
       values ($1, $2, $3, $4, $4, current_date, (current_date + ($5 || ' months')::interval)::date) returning *`,
      [ref, c?.client_id ?? null, str(flags.recipient) || c?.name || null, cents, String(months)],
    );
    if (flags.json) return console.log(JSON.stringify(row, null, 2));
    return console.log(`  ${row.ref}: ${money(row.value_cents)}, expires ${isoDate(row.expires_on)}. That balance is a liability until the work is done.`);
  }
  if (sub === 'redeem') {
    const v = await resolveVoucher(db, args[0]);
    const amount = Math.round(Number(flags.amount ?? 0) * 100);
    if (!amount || amount < 0) throw new CliError('voucher redeem REF --amount=50');
    if (amount > num(v.balance_cents)) throw new CliError(`${v.ref} holds ${money(v.balance_cents)}; cannot redeem ${money(amount)}.`);
    const expired = v.days_left !== null && num(v.days_left) < 0;
    await db.query(`update vouchers set balance_cents = balance_cents - $2 where ref = $1`, [v.ref, amount]);
    const out = { ref: v.ref, redeemed_cents: amount, balance_cents: num(v.balance_cents) - amount, expired_honoured: expired };
    if (flags.json) return console.log(JSON.stringify(out, null, 2));
    if (expired) console.log(`  ${v.ref} expired ${isoDate(v.expires_on)} (${-num(v.days_left)} days ago). Honouring it is your goodwill call, and it is on the record.`);
    return console.log(`  ${v.ref}: ${money(amount)} redeemed, ${money(out.balance_cents)} left.`);
  }
  const rows = await db.query(`select * from v_vouchers ${flags.all ? '' : `where balance_cents > 0`} order by expires_on`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('Vouchers'));
  console.log(table(rows, [
    { key: 'ref', label: 'ref' },
    { key: 'recipient', label: 'holder' },
    { key: 'value_cents', label: 'value', align: 'right', format: (v) => money(v) },
    { key: 'balance_cents', label: 'balance', align: 'right', format: (v) => money(v) },
    { key: 'expires_on', label: 'expires', format: isoDate },
    { key: 'state', label: 'state' },
  ]));
  const liability = rows.reduce((t, r) => t + num(r.balance_cents), 0);
  console.log(`\n  Outstanding: ${money(liability)} of work already paid for.`);
}

// ---------------------------------------------------------------------------
// Attention, compliance, settings

async function cmdAttention(db, flags) {
  const rows = await db.query(`select * from v_attention order by rank, days desc nulls last`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('Needs a decision, worst first'));
  if (!rows.length) return console.log('  Nothing. Enjoy it.');
  for (const r of rows) {
    console.log(`\n  [${r.rank}] ${r.reason}  ${r.label}${r.who ? `  ${r.who}` : ''}  ${r.place}`);
    console.log(`      ${r.detail}`);
  }
}

const RULES = [
  {
    rule: 'patch-tests',
    source: 'Colour manufacturer instructions (allergy alert test 48 hours before); Health and Safety at Work Act 2015 s 36',
    sql: `select va.ref || ': ' || va.client || ', ' || va.services || ' on ' || to_char(va.on_date, 'YYYY-MM-DD') || ' with patch test state ' || pt.state as issue
          from v_appointments va join v_patch_tests pt on pt.client_id = va.client_id
          where va.status = 'booked' and va.on_date >= current_date and va.needs_patch_test
            and not patch_test_ok(va.client_id, va.on_date)`,
  },
  {
    rule: 'formulas',
    source: 'The record that makes the next visit repeatable; the professional standard every colour house teaches',
    sql: `select va.ref || ': ' || va.client || ', ' || va.services || ' on ' || to_char(va.on_date, 'YYYY-MM-DD') || ' checked out with no formula recorded' as issue
          from v_appointments va
          where va.status = 'completed' and va.needs_patch_test and va.on_date >= current_date - 30
            and not exists (select 1 from formulas f where f.client_id = va.client_id and f.recorded_on = va.on_date)`,
  },
  {
    rule: 'consent',
    source: 'Unsolicited Electronic Messages Act 2007 ss 9-11: commercial messages need consent and an unsubscribe',
    sql: `select c.name || ': in the chair ' || to_char(max(a.on_date), 'YYYY-MM-DD') || ' and never opted in to marketing. Ask at the basin and record the answer (client set NAME --opt-in=yes)' as issue
          from clients c join appointments a on a.client_id = c.id and a.status = 'completed'
          where c.status = 'active' and not c.marketing_opt_in and a.on_date >= current_date - 90
          group by c.name`,
  },
  {
    rule: 'double-booked',
    source: 'One chair, one client, one time; the gate refuses new ones, this catches what an import carried in',
    sql: `select a.ref || ' and ' || b.ref || ': ' || sa.name || ' holds both on ' || to_char(a.on_date, 'YYYY-MM-DD') as issue
          from appointments a join appointments b on b.staff_id = a.staff_id and b.on_date = a.on_date and b.id > a.id
            and b.status in ('booked','completed') and a.status in ('booked','completed')
            and b.starts_at < a.ends_at and b.ends_at > a.starts_at
          join staff sa on sa.id = a.staff_id`,
  },
  {
    rule: 'hours',
    source: 'The booking gate refuses new ones; this catches what an import carried in outside a working window',
    sql: `select va.ref || ': ' || va.client || ' with ' || va.staff || ' at ' || to_char(va.on_date + va.starts_at, 'HH24:MI') || ' on ' || to_char(va.on_date, 'Dy YYYY-MM-DD') || ', outside their hours' as issue
          from v_appointments va
          where va.status = 'booked' and va.on_date >= current_date
            and exists (select 1 from staff_hours h where h.staff_id = va.staff_id)
            and not exists (select 1 from staff_hours h where h.staff_id = va.staff_id
              and h.weekday = extract(dow from va.on_date)::int
              and h.starts_at <= va.starts_at and h.ends_at >= va.ends_at)`,
  },
  {
    rule: 'vouchers',
    source: 'Fair Trading Act 1986: honour what the voucher said. An expired unspent balance is a decision, not a silence',
    sql: `select v.ref || ': expired ' || to_char(v.expires_on, 'YYYY-MM-DD') || ' with ' || (v.balance_cents / 100) || ' dollars unspent. Honour it, extend it, or write it off, on the record' as issue
          from v_vouchers v where v.state = 'EXPIRED UNSPENT'`,
  },
  {
    rule: 'stock',
    source: 'A colour week with an empty dispensary is a cancelled appointment; an empty shelf sells nothing',
    sql: `select name || ' (' || kind || '): ' || stock_on_hand || ' on hand, reorder at ' || reorder_level as issue from v_stock_low`,
  },
];

async function cmdCompliance(db, args, flags) {
  const only = (args[0] || '').toLowerCase();
  const rules = only ? RULES.filter((r) => r.rule === only) : RULES;
  if (!rules.length) throw new CliError(`No rule "${only}". Rules: ${RULES.map((r) => r.rule).join(', ')}`);
  const out = [];
  for (const r of rules) {
    const issues = await db.query(r.sql);
    out.push({ rule: r.rule, source: r.source, issues: issues.map((i) => i.issue) });
  }
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  console.log(heading('The rule book, run against the records'));
  for (const r of out) {
    console.log(`\n  ${r.issues.length ? 'FAIL' : 'ok  '} ${r.rule}  (${r.source})`);
    for (const i of r.issues) console.log(`       * ${i}`);
  }
  const fails = out.reduce((t, r) => t + r.issues.length, 0);
  console.log(`\n  ${fails ? `${fails} issue(s). Sources are in docs/compliance.md.` : 'All clear. Sources are in docs/compliance.md.'}`);
}

async function cmdSettings(db, args, flags) {
  if ((args[0] || '').toLowerCase() === 'set') {
    const [, key, value] = args;
    if (!key || value === undefined) throw new CliError('settings set KEY VALUE');
    await db.query(
      `insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = $2`,
      [key, String(value)],
    );
    return console.log(`  ${key} = ${value}`);
  }
  const rows = await db.query(`select key, value, note from settings order by key`);
  if (flags.json) return console.log(JSON.stringify(rows, null, 2));
  console.log(heading('Settings: the numbers the rules read'));
  console.log(table(rows, [
    { key: 'key', label: 'key' },
    { key: 'value', label: 'value', align: 'right' },
    { key: 'note', label: 'what it does', width: 70 },
  ]));
}

// ---------------------------------------------------------------------------
// Moving in and out

async function cmdImport(db, args, flags) {
  if ((args[0] || '').toLowerCase() !== 'timely') throw new CliError('import timely --clients=FILE [--appointments=FILE] [--dry-run]');
  if (!flags.clients && !flags.appointments) throw new CliError('Point at least one export at me: --clients=clients.csv --appointments=appointments.csv');
  const dryRun = !!flags['dry-run'];
  const created = [];
  const updated = [];
  const skipped = [];

  async function findClient(name) {
    const rows = await db.query(`select * from clients where lower(name) = lower($1)`, [name]);
    return rows[0] ?? null;
  }

  if (flags.clients) {
    const file = str(flags.clients);
    if (!existsSync(file)) throw new CliError(`No file at ${file}.`);
    for (const row of parseCsv(readFileSync(file, 'utf8'))) {
      const name = (pick(row, 'Name', 'Client', 'Client name', 'Customer name') ||
        `${pick(row, 'First name', 'FirstName', 'First')} ${pick(row, 'Last name', 'LastName', 'Last', 'Surname')}`).trim();
      if (!name) { skipped.push({ row, why: 'client row with no name' }); continue; }
      const phone = pick(row, 'Mobile', 'Mobile number', 'Phone', 'Phone number');
      const email = pick(row, 'Email', 'Email address');
      const optIn = yesNo(pick(row, 'Accepts marketing', 'Marketing', 'Accepts email marketing', 'Email marketing'), false);
      let birthday = null;
      const bday = pick(row, 'Birthday', 'Date of birth', 'DOB');
      if (bday) { try { birthday = parseDate(bday, 'birthday'); } catch { /* a month-day only export stays blank */ } }
      const externalRef = pick(row, 'Customer ID', 'Client ID', 'Id') ? `timely:${pick(row, 'Customer ID', 'Client ID', 'Id')}` : null;
      const existing = await findClient(name);
      if (existing) {
        if (!dryRun) {
          await db.query(
            `update clients set phone = coalesce(nullif($2, ''), phone), email = coalesce(nullif($3, ''), email),
               birthday = coalesce($4::date, birthday), external_ref = coalesce($5, external_ref) where id = $1`,
            [existing.id, phone, email, birthday, externalRef],
          );
        }
        updated.push({ what: 'client', name });
      } else {
        if (!dryRun) {
          await db.query(
            `insert into clients (name, phone, email, birthday, marketing_opt_in, external_ref, referral_source)
             values ($1, nullif($2, ''), nullif($3, ''), $4::date, $5, $6, 'timely import')`,
            [name, phone, email, birthday, optIn, externalRef],
          );
        }
        created.push({ what: 'client', name });
      }
    }
  }

  if (flags.appointments) {
    const file = str(flags.appointments);
    if (!existsSync(file)) throw new CliError(`No file at ${file}.`);
    for (const row of parseCsv(readFileSync(file, 'utf8'))) {
      const clientName = pick(row, 'Client', 'Customer', 'Client name', 'Customer name');
      const dateRaw = pick(row, 'Date', 'Appointment date', 'Start date');
      const startRaw = pick(row, 'Start time', 'Time', 'Start');
      const serviceName = pick(row, 'Service', 'Service name', 'Services');
      const staffName = pick(row, 'Staff', 'Staff member', 'Employee', 'With');
      if (!dateRaw) { skipped.push({ row, why: `appointment row with missing date (${clientName || 'no client'})` }); continue; }
      if (!clientName) { skipped.push({ row, why: `appointment row with no client on ${dateRaw}` }); continue; }
      let onDate;
      try { onDate = parseDate(dateRaw, 'date'); } catch (e) { skipped.push({ row, why: e.message }); continue; }
      const startsAt = startRaw ? parseTime(startRaw, 'start time') : '09:00';
      const staffRows = staffName ? await db.query(`select * from staff where lower(name) = lower($1)`, [staffName]) : [];
      if (!staffRows.length) { skipped.push({ row, why: `no team member named "${staffName || '(blank)'}" for ${clientName} on ${onDate}: add them first (staff add)` }); continue; }
      const staffRow = staffRows[0];

      let client = await findClient(clientName);
      if (!client) {
        if (!dryRun) {
          [client] = await db.query(`insert into clients (name, referral_source) values ($1, 'timely import') returning *`, [clientName]);
        }
        created.push({ what: 'client', name: clientName });
      }

      const durationRaw = pick(row, 'Duration (mins)', 'Duration', 'Minutes');
      const priceRaw = pick(row, 'Price', 'Amount', 'Total');
      const duration = Number(durationRaw) || 60;
      const priceCents = priceRaw ? Math.round(Number(String(priceRaw).replace(/[^0-9.]/g, '')) * 100) : 0;
      let service = null;
      if (serviceName) {
        const svc = await db.query(`select * from services where lower(name) = lower($1)`, [serviceName]);
        service = svc[0] ?? null;
        if (!service && !dryRun) {
          [service] = await db.query(
            `insert into services (name, category, duration_minutes, price_cents) values ($1, 'imported', $2, $3) returning *`,
            [serviceName, duration, priceCents],
          );
          created.push({ what: 'service', name: serviceName });
        } else if (!service) {
          created.push({ what: 'service', name: serviceName });
        }
      }

      const statusRaw = (pick(row, 'Status', 'Appointment status') || '').toLowerCase();
      const status = /no.?show|dna/.test(statusRaw) ? 'no_show'
        : /cancel/.test(statusRaw) ? 'cancelled'
        : /complete|checked out|paid/.test(statusRaw) || onDate < today() ? 'completed'
        : 'booked';
      const key = `timely:${clientName.toLowerCase()}:${onDate}:${startsAt}`;
      const existing = await db.query(`select id from appointments where external_ref = $1`, [key]);
      if (existing.length) { updated.push({ what: 'appointment', name: `${clientName} ${onDate} ${startsAt}` }); continue; }
      if (!dryRun) {
        const ref = await mintRef(db, 'appointments', 'APT', 1001);
        const [apt] = await db.query(
          `insert into appointments (ref, client_id, staff_id, on_date, starts_at, ends_at, status, source, cancel_reason, external_ref)
           values ($1, $2, $3, $4::date, $5::time, $6::time, $7, 'import', $8, $9) returning id`,
          [ref, client.id, staffRow.id, onDate, startsAt, addMinutes(startsAt, duration), status,
           status === 'cancelled' ? 'cancelled in Timely' : null, key],
        );
        if (service) {
          await db.query(`insert into appointment_services (appointment_id, service_id, price_cents) values ($1, $2, $3)`, [apt.id, service.id, priceCents || num(service.price_cents)]);
        }
      }
      created.push({ what: 'appointment', name: `${clientName} ${onDate} ${startsAt} (${status})` });
    }
  }

  const out = { dry_run: dryRun, created, updated, skipped: skipped.map((s) => ({ why: s.why })) };
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  console.log(heading(dryRun ? 'Import, dry run: nothing written' : 'Imported'));
  console.log(`  created: ${created.length}  matched and updated: ${updated.length}  skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`    skip: ${s.why}`);
  console.log(`\n  Every imported client arrives with NO patch test on record, deliberately: the old system saying a test happened is not the test.`);
  console.log(`  Next: compliance --json, attention --json, book --week.`);
}

async function cmdExport(db, flags) {
  const outDir = path.resolve(REPO_ROOT, str(flags.out) || 'export');
  mkdirSync(outDir, { recursive: true });
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? isoDate(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const writeCsv = (file, rows) => {
    if (!rows.length) { writeFileSync(path.join(outDir, file), ''); return { file, rows: 0 }; }
    const cols = Object.keys(rows[0]);
    const body = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    writeFileSync(path.join(outDir, file), body + '\n');
    return { file, rows: rows.length };
  };
  const written = [];
  written.push(writeCsv('clients.csv', await db.query(
    `select name, phone, email, birthday, marketing_opt_in, allergy_note, referral_source, status from clients order by name`)));
  written.push(writeCsv('appointments.csv', await db.query(
    `select ref, on_date, starts_at, ends_at, client, staff, services, total_cents, status, cancel_reason from v_appointments order by on_date`)));
  written.push(writeCsv('formulas.csv', await db.query(
    `select c.name as client, f.recorded_on, s.name as staff, f.formula from formulas f join clients c on c.id = f.client_id left join staff s on s.id = f.staff_id order by f.recorded_on`)));
  written.push(writeCsv('products.csv', await db.query(
    `select name, kind, price_cents, stock_on_hand, reorder_level from products order by name`)));
  written.push(writeCsv('sales.csv', await db.query(
    `select sl.sold_on, c.name as client, st.name as staff, p.name as product, sl.qty, sl.unit_price_cents
     from sales sl join products p on p.id = sl.product_id left join clients c on c.id = sl.client_id left join staff st on st.id = sl.staff_id order by sl.sold_on`)));
  written.push(writeCsv('vouchers.csv', await db.query(
    `select ref, recipient, value_cents, balance_cents, sold_on, expires_on from vouchers order by sold_on`)));
  const out = { out_dir: outDir, written };
  if (flags.json) return console.log(JSON.stringify(out, null, 2));
  console.log(`  ${written.length} file(s) in ${outDir}: ${written.map((w) => `${w.file} (${w.rows})`).join(', ')}. Plain CSV: no lock-in, in either direction.`);
}

async function cmdStats(db, flags) {
  const one = async (sql) => (await db.query(sql))[0];
  const s = {
    active_clients: num((await one(`select count(*) as n from clients where status = 'active'`)).n),
    team: num((await one(`select count(*) as n from staff where status = 'active'`)).n),
    booked_ahead: num((await one(`select count(*) as n from appointments where status = 'booked' and on_date >= current_date`)).n),
    unconfirmed_soon: num((await one(`select count(*) as n from v_appointments where state = 'UNCONFIRMED' and on_date >= current_date`)).n),
    not_checked_out: num((await one(`select count(*) as n from v_appointments where state = 'NOT CHECKED OUT'`)).n),
    patch_test_flags: num((await one(`select count(*) as n from v_appointments where state = 'NO PATCH TEST'`)).n),
    no_shows_30: num((await one(`select count(*) as n from appointments where status = 'no_show' and on_date >= current_date - 30`)).n),
    lapsed: num((await one(`select count(*) as n from v_lapsed`)).n),
    low_stock: num((await one(`select count(*) as n from v_stock_low`)).n),
    vouchers_open: num((await one(`select count(*) as n from v_vouchers where balance_cents > 0 and expires_on >= current_date`)).n),
    takings_7d_cents: num((await one(
      `select coalesce(sum(service_cents + retail_cents), 0) as n from v_takings where on_date > current_date - 7 and on_date <= current_date`)).n),
  };
  const rb = await db.query(`select sum(visits) as v, sum(rebooked) as r from v_rebooking`);
  s.rebooking_pct_28 = num(rb[0]?.v) ? Math.round((100 * num(rb[0].r)) / num(rb[0].v)) : null;
  if (flags.json) return console.log(JSON.stringify(s, null, 2));
  console.log(heading('The salon at a glance'));
  for (const [k, v] of Object.entries(s)) console.log(`  ${k.padEnd(20)} ${k.endsWith('_cents') ? money(v) : v}`);
}

// ---------------------------------------------------------------------------
// Help

function help() {
  console.log(`salon-for-claude-code: the salon's operating record as one CLI.

  the book
    book [--day=DATE|--week] [--staff=]     the appointment book
    book add CLIENT STAFF --date= --at= --services="a, b" [--source= --note=]
    confirm REF        cancel REF --reason=        no-show REF
    checkout REF [--retail="Repair shampoo x1, Silk serum"]

  clients
    clients [--lapsed]           client NAME            lapsed
    client add NAME [--phone= --email= --birthday= --opt-in --allergy=]
    client set NAME [--phone= --opt-in=yes|no --allergy= --archive]
    client patch-test NAME [--on= --outcome=clear|reaction --staff= --note=]
    formula add NAME TEXT [--staff= --on=]      formulas NAME
    note add NAME TEXT           notes NAME

  the numbers
    rebooking          who leaves holding their next appointment
    gaps               the empty chair, next 7 days
    no-shows           the habit, named
    takings [--days=7] services + retail by chair

  team and menu
    team [--all]       staff add NAME [--role=]
    staff hours NAME [DAY --start= --end= | DAY --clear]
    services           service add NAME --category= --minutes= --price= [--patch-test]

  stock and vouchers
    stock              stock take PRODUCT --count=
    product add NAME --price= [--kind= --stock= --reorder=]
    sale CLIENT PRODUCT [--qty= --staff=]
    vouchers [--all]   voucher sell --value= [--client= --months=]
    voucher redeem REF --amount=

  the rules
    attention          everything that wants a decision, worst first
    compliance [RULE]  the rule book, run against the records
    settings [set KEY VALUE]

  moving in and out
    import timely --clients=FILE [--appointments=FILE] [--dry-run]
    export [--out=DIR]           stats

Any read command takes --json. Money in NZD. There are no force flags.`);
}

// ---------------------------------------------------------------------------
// Main

const { args: argv, flags } = parseArgv(process.argv.slice(2));
const [cmd, ...rest] = argv;

const db = await getDb();
try {
  switch ((cmd || 'help').toLowerCase()) {
    case 'help': help(); break;
    case 'book': {
      if ((rest[0] || '').toLowerCase() === 'add') await cmdBookAdd(db, rest.slice(1), flags);
      else await cmdBook(db, flags);
      break;
    }
    case 'confirm': await cmdConfirm(db, rest, flags); break;
    case 'cancel': await cmdCancel(db, rest, flags); break;
    case 'no-show': case 'noshow': await cmdNoShow(db, rest, flags); break;
    case 'checkout': await cmdCheckout(db, rest, flags); break;
    case 'clients': await cmdClients(db, flags); break;
    case 'lapsed': await cmdClients(db, { ...flags, lapsed: true }); break;
    case 'client': {
      const sub = (rest[0] || '').toLowerCase();
      if (sub === 'add') await cmdClientAdd(db, rest.slice(1), flags);
      else if (sub === 'set') await cmdClientSet(db, rest.slice(1), flags);
      else if (sub === 'patch-test') await cmdPatchTest(db, rest.slice(1), flags);
      else await cmdClient(db, rest, flags);
      break;
    }
    case 'formula': {
      const sub = (rest[0] || '').toLowerCase();
      if (sub === 'add') await cmdFormula(db, 'add', rest.slice(1), flags);
      else await cmdFormula(db, 'list', rest, flags);
      break;
    }
    case 'formulas': await cmdFormula(db, 'list', rest, flags); break;
    case 'note': {
      if ((rest[0] || '').toLowerCase() !== 'add') throw new CliError('note add NAME TEXT (lists: notes NAME)');
      await cmdNote(db, 'add', rest.slice(1), flags);
      break;
    }
    case 'notes': await cmdNote(db, 'list', rest, flags); break;
    case 'rebooking': await cmdRebooking(db, flags); break;
    case 'gaps': await cmdGaps(db, flags); break;
    case 'no-shows': case 'noshows': await cmdNoShows(db, flags); break;
    case 'takings': await cmdTakings(db, flags); break;
    case 'team': await cmdTeam(db, flags); break;
    case 'staff': {
      const sub = (rest[0] || '').toLowerCase();
      if (sub === 'add') await cmdStaffAdd(db, rest.slice(1), flags);
      else if (sub === 'hours') await cmdStaffHours(db, rest.slice(1), flags);
      else throw new CliError('staff add|hours (lists: team)');
      break;
    }
    case 'services': await cmdServices(db, flags); break;
    case 'service': {
      if ((rest[0] || '').toLowerCase() !== 'add') throw new CliError('service add NAME --category= --minutes= --price= [--patch-test]');
      await cmdServiceAdd(db, rest.slice(1), flags);
      break;
    }
    case 'stock': await cmdStock(db, (rest[0] || '').toLowerCase(), rest.slice(1), flags); break;
    case 'product': {
      if ((rest[0] || '').toLowerCase() !== 'add') throw new CliError('product add NAME --price= [--kind= --stock= --reorder=]');
      await cmdProductAdd(db, rest.slice(1), flags);
      break;
    }
    case 'sale': await cmdSale(db, rest, flags); break;
    case 'voucher': await cmdVoucher(db, (rest[0] || '').toLowerCase(), rest.slice(1), flags); break;
    case 'vouchers': await cmdVoucher(db, 'list', rest, flags); break;
    case 'attention': await cmdAttention(db, flags); break;
    case 'compliance': await cmdCompliance(db, rest, flags); break;
    case 'settings': await cmdSettings(db, rest, flags); break;
    case 'import': await cmdImport(db, rest, flags); break;
    case 'export': await cmdExport(db, flags); break;
    case 'stats': await cmdStats(db, flags); break;
    default:
      throw new CliError(`Unknown command "${cmd}". Run with no arguments for the list.`);
  }
} catch (e) {
  if (e instanceof CliError) {
    console.error(e.message);
    process.exitCode = e.code;
  } else {
    throw e;
  }
} finally {
  await db.close();
}
