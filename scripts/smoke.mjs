#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.
//
// The seed anchors everything to current_date offsets, so every assertion
// here holds whatever day you run it.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'salon-smoke-'));
const scratch = mkdtempSync(path.join(tmpdir(), 'salon-smoke-files-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json && !expectFail ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);
const iso = (d) => {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const addDays = (base, days) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
const now = new Date();
const day = (offset) => iso(addDays(now, offset));

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the numbers, before anything moves ------------------------------------

  const stats = run('stats', ['salon.mjs', 'stats']);
  assert(n(stats.active_clients) === 14, `fourteen clients on the book (${stats.active_clients})`);
  assert(n(stats.team) === 6, `six on the team (${stats.team})`);
  assert(n(stats.booked_ahead) === 7, `seven bookings ahead (${stats.booked_ahead})`);
  assert(n(stats.unconfirmed_soon) === 1, `one unconfirmed inside the window (${stats.unconfirmed_soon})`);
  assert(n(stats.not_checked_out) === 1, `one booking left open past its day (${stats.not_checked_out})`);
  assert(n(stats.patch_test_flags) === 2, `two colour bookings without a valid patch test (${stats.patch_test_flags})`);
  assert(n(stats.no_shows_30) === 1, `one no-show this month (${stats.no_shows_30})`);
  assert(n(stats.lapsed) === 3, `three lapsed clients (${stats.lapsed})`);
  assert(n(stats.low_stock) === 2, `two products at reorder (${stats.low_stock})`);
  assert(n(stats.vouchers_open) === 1, `one live voucher holding a balance (${stats.vouchers_open})`);
  assert(n(stats.takings_7d_cents) === 35400, `the week took $354 (${stats.takings_7d_cents})`);
  assert(n(stats.rebooking_pct_28) === 80, `four of five visits left rebooked (${stats.rebooking_pct_28})`);

  // ---- attention: every deliberate mess in the seed fires ---------------------

  const attention = run('attention', ['salon.mjs', 'attention']);
  const reasons = new Set(attention.map((r) => r.reason));
  for (const expected of ['patch_test', 'not_checked_out', 'unconfirmed', 'no_show', 'formula_missing',
    'lapsed', 'voucher', 'low_stock', 'gap', 'birthday']) {
    assert(reasons.has(expected), `attention includes ${expected} (${[...reasons].join(', ')})`);
  }
  assert(attention[0].reason === 'patch_test', 'the patch test breach outranks everything');
  assert(attention.filter((r) => r.reason === 'patch_test').length === 2, 'Mere and Jessica both flagged');
  assert(attention.filter((r) => r.reason === 'lapsed').length === 3, 'three lapsed clients raised');

  // ---- the book ----------------------------------------------------------------

  const tomorrow = run('the book, tomorrow', ['salon.mjs', 'book', `--day=${day(1)}`]);
  assert(tomorrow.length === 3, `three bookings tomorrow (${tomorrow.length})`);
  assert(tomorrow.find((a) => a.ref === 'APT-1031').state === 'NO PATCH TEST', `Mere's colour is loud`);
  assert(tomorrow.find((a) => a.ref === 'APT-1030').state === 'UNCONFIRMED', `Priya's silence is loud`);
  assert(tomorrow.find((a) => a.ref === 'APT-1032').state === 'confirmed', `Kate's cut is quiet`);

  const week = run('the book, the week', ['salon.mjs', 'book']);
  assert(week.length >= 5, `the week holds the bookings ahead (${week.length})`);

  const gaps = run('the empty chair', ['salon.mjs', 'gaps']);
  const tomorrowGaps = gaps.filter((g) => iso(new Date(g.on_date)) === day(1));
  assert(tomorrowGaps.length === 6, `six chairs have windows tomorrow (${tomorrowGaps.length})`);
  assert(n(tomorrowGaps.find((g) => g.staff === 'Ava Brennan').booked_minutes) === 105, `Ava holds Mere's colour (${tomorrowGaps.find((g) => g.staff === 'Ava Brennan').booked_minutes}m)`);

  // ---- clients -------------------------------------------------------------------

  const clients = run('the client book', ['salon.mjs', 'clients']);
  assert(clients.length === 14, `fourteen clients (${clients.length})`);

  const hannah = run('client card by partial name', ['salon.mjs', 'client', 'hann']);
  assert(hannah.client.name === 'Hannah Reid', 'resolved by partial name');
  assert(hannah.client.lapsed === true, 'Hannah reads as lapsed');
  assert(n(hannah.client.usual_gap_days) === 35, `her rhythm is 35 days (${hannah.client.usual_gap_days})`);
  assert(n(hannah.client.spend_cents_12m) === 78000, `she spent $780 this year (${hannah.client.spend_cents_12m})`);
  assert(hannah.formulas.length === 1, 'her balayage formula is on record');

  const nobody = run('an unknown client exits 1', ['salon.mjs', 'client', 'nobody at all'], { json: false, expectFail: true });
  assert(/No client matches/.test(nobody.stderr), 'and says so plainly');

  const lapsed = run('the recall list', ['salon.mjs', 'lapsed']);
  assert(lapsed.length === 3, `three lapsed (${lapsed.length})`);
  assert(lapsed[0].name === 'Hannah Reid', 'worth the most first');
  assert(lapsed.find((l) => l.name === 'Tom Jacobs').marketing_opt_in === false, 'Tom never opted in: a call, not a campaign');

  const rebooking = run('rebooking', ['salon.mjs', 'rebooking']);
  const ruby = rebooking.find((r) => r.staff === 'Ruby Ngata');
  assert(n(ruby.rate_pct) === 0, `Ruby's visit left without rebooking (${ruby.rate_pct}%)`);
  assert(rebooking.filter((r) => n(r.rate_pct) === 100).length === 3, 'Ava, Claire and Leo sent theirs out rebooked');

  const takings = run('takings', ['salon.mjs', 'takings']);
  assert(n(takings.service_cents) === 31000 && n(takings.retail_cents) === 4400, `the week: $310 services, $44 retail (${takings.service_cents}, ${takings.retail_cents})`);

  // ---- the gates refuse, and say why ------------------------------------------

  const reactionGate = run('gate: a recorded reaction refuses colour', ['salon.mjs', 'book', 'add', 'Lily Chen', 'Ava', `--date=${day(8)}`, '--at=10:00', '--services=Global colour'], { expectFail: true });
  assert(/REACTION/.test(reactionGate.stderr), 'and names the reaction');

  const noTestGate = run('gate: colour with no patch test refuses', ['salon.mjs', 'book', 'add', 'Jessica', 'Ava', `--date=${day(8)}`, '--at=10:00', '--services=Toner'], { expectFail: true });
  assert(/Health and Safety at Work Act 2015/.test(noTestGate.stderr), 'and cites the Act');

  const doubleGate = run('gate: a double-booking refuses', ['salon.mjs', 'book', 'add', 'Kate', 'Ava', `--date=${day(1)}`, '--at=13:30', '--services=Blow wave'], { expectFail: true });
  assert(/double-booked/.test(doubleGate.stderr), 'and names the clash');

  const hoursGate = run('gate: outside the working window refuses', ['salon.mjs', 'book', 'add', 'Kate', 'Leo', `--date=${day(2)}`, '--at=09:00', `--services=Men's cut`], { expectFail: true });
  assert(/outside/.test(hoursGate.stderr), 'and names the window');

  // ---- the patch test flow ------------------------------------------------------

  run('record a fresh test for Mere today', ['salon.mjs', 'client', 'patch-test', 'Mere', '--outcome=clear'], { json: false });
  const stillFlagged = run('tomorrow is still inside 48 hours', ['salon.mjs', 'attention']);
  assert(stillFlagged.some((r) => r.reason === 'patch_test' && r.label === 'Mere Kingi'), `a test done today does not clear tomorrow's colour`);

  run(`record Jessica's test three days back`, ['salon.mjs', 'client', 'patch-test', 'Jessica', `--on=${day(-3)}`, '--staff=Ruby'], { json: false });
  const jessBooking = run('now her toner books', ['salon.mjs', 'book', 'add', 'Jessica', 'Ava', `--date=${day(8)}`, '--at=10:00', '--services=Toner, Blow wave']);
  assert(jessBooking.status === 'booked' && n(jessBooking.total_cents) === 10000, `booked at $100 (${jessBooking.total_cents})`);
  const onePatchFlag = run(`and her Saturday balayage flag clears`, ['salon.mjs', 'attention']);
  assert(onePatchFlag.filter((r) => r.reason === 'patch_test').length === 1, 'only Mere remains flagged');

  // ---- confirm, checkout, no-show, cancel ---------------------------------------

  run('confirm the unconfirmed', ['salon.mjs', 'confirm', 'APT-1030'], { json: false });
  const afterConfirm = run('the silence clears', ['salon.mjs', 'attention']);
  assert(!afterConfirm.some((r) => r.reason === 'unconfirmed'), 'nothing unconfirmed inside the window');

  const checkedOut = run('check out the forgotten visit, with retail', ['salon.mjs', 'checkout', 'APT-1026', '--retail=Repair shampoo x1']);
  assert(n(checkedOut.service_cents) === 9500 && n(checkedOut.retail_cents) === 4200, `$95 service + $42 retail (${checkedOut.service_cents}, ${checkedOut.retail_cents})`);
  assert(checkedOut.rebooked === false, 'and Grace left without her next visit booked');
  run('gate: a second checkout refuses', ['salon.mjs', 'checkout', 'APT-1026'], { expectFail: true });

  const overStock = run('gate: retail past the shelf refuses', ['salon.mjs', 'checkout', 'APT-1032', '--retail=Silk serum x99'], { expectFail: true });
  assert(/on the shelf/.test(overStock.stderr), 'and names the count');

  const newBooking = run('a booking for next week', ['salon.mjs', 'book', 'add', 'Kate', 'Ruby', `--date=${day(2)}`, '--at=09:00', '--services=Blow wave']);
  run('gate: cancelling without a reason refuses', ['salon.mjs', 'cancel', newBooking.ref], { expectFail: true });
  run('cancel with the reason on record', ['salon.mjs', 'cancel', newBooking.ref, '--reason=Kate rang: sick'], { json: false });

  const marked = run('mark a no-show', ['salon.mjs', 'book', 'add', 'Tom Jacobs', 'Leo', `--date=${day(2)}`, '--at=11:00', `--services=Men's cut`]);
  run('confirm then miss it', ['salon.mjs', 'no-show', marked.ref], { json: false });
  const noShows = run('the habit is on record', ['salon.mjs', 'no-shows']);
  assert(noShows.some((s) => s.client === 'Tom Jacobs' && n(s.no_shows_6m) === 1), 'Tom now has one');

  // ---- the formula record ---------------------------------------------------------

  run(`record Olivia's missing formula`, ['salon.mjs', 'formula', 'add', 'Olivia', '6.35 with 20vol (1:1), 35 min. Half a shade cooler achieved', `--on=${day(-5)}`, '--staff=Ruby'], { json: false });
  const afterFormula = run('the formula gap clears', ['salon.mjs', 'attention']);
  assert(!afterFormula.some((r) => r.reason === 'formula_missing'), 'nothing missing inside 14 days');
  const formulas = run('the record reads back', ['salon.mjs', 'formulas', 'Olivia']);
  assert(formulas.length === 2, `two formulas on Olivia's card (${formulas.length})`);

  // ---- vouchers -------------------------------------------------------------------

  run('gate: redeeming past the balance refuses', ['salon.mjs', 'voucher', 'redeem', 'GV-101', '--amount=90'], { expectFail: true });
  const redeemed = run('redeem against the live voucher', ['salon.mjs', 'voucher', 'redeem', 'GV-101', '--amount=30']);
  assert(n(redeemed.balance_cents) === 5000, `$50 left (${redeemed.balance_cents})`);
  const goodwill = run('an expired voucher warns, and honours', ['salon.mjs', 'voucher', 'redeem', 'GV-103', '--amount=10']);
  assert(goodwill.expired_honoured === true, 'the goodwill call is on the record');
  const sold = run('sell a voucher', ['salon.mjs', 'voucher', 'sell', '--value=100', '--client=Kate', '--months=6']);
  assert(sold.ref === 'GV-104' && n(sold.balance_cents) === 10000, `GV-104 for $100 (${sold.ref})`);

  // ---- retail and stock -----------------------------------------------------------

  run('gate: a sale past the shelf refuses', ['salon.mjs', 'sale', 'Marcus', 'Silk serum', '--qty=99'], { expectFail: true });
  const sale = run('a counter sale', ['salon.mjs', 'sale', 'Marcus', 'Silk serum', '--staff=Leo']);
  assert(n(sale.total_cents) === 3800, `$38 over the counter (${sale.total_cents})`);
  run('a stocktake corrects the dispensary', ['salon.mjs', 'stock', 'take', 'Colour tube', '--count=12'], { json: false });
  const lowAfter = run('one product still at reorder', ['salon.mjs', 'stats']);
  assert(n(lowAfter.low_stock) === 1, `the conditioner alone (${lowAfter.low_stock})`);

  // ---- team and menu grow ----------------------------------------------------------

  const newStaff = run('a new stylist', ['salon.mjs', 'staff', 'add', 'Mia Torrance', '--role=stylist', '--phone=021 555 0699']);
  assert(newStaff.name === 'Mia Torrance', 'added');
  run('her hours, all week', ['salon.mjs', 'staff', 'hours', 'Mia', 'all', '--start=9:00', '--end=17:00'], { json: false });
  const miaBooking = run('and she takes a booking', ['salon.mjs', 'book', 'add', 'Priya', 'Mia', `--date=${day(4)}`, '--at=10:00', '--services=Style cut']);
  assert(miaBooking.staff === 'Mia Torrance', 'in her chair');

  const newService = run('a new service, patch-tested', ['salon.mjs', 'service', 'add', 'Lash tint', '--category=beauty', '--minutes=20', '--price=35', '--patch-test']);
  assert(newService.requires_patch_test === true, 'the tint gates like colour');
  run('gate: the new tint refuses without a test', ['salon.mjs', 'book', 'add', 'Priya', 'Isla', `--date=${day(5)}`, '--at=10:00', '--services=Lash tint'], { expectFail: true });

  run('a new client', ['salon.mjs', 'client', 'add', 'Ben Ford', '--phone=021 555 0800', '--opt-in'], { json: false });
  run('gate: adding them twice refuses', ['salon.mjs', 'client', 'add', 'Ben Ford'], { expectFail: true });

  // ---- the rules move with settings -----------------------------------------------

  run('stretch the lapsed line', ['salon.mjs', 'settings', 'set', 'lapsed_after_days', '100'], { json: false });
  const noLapsed = run('nobody lapses at 100 days', ['salon.mjs', 'lapsed']);
  assert(noLapsed.length === 0, `the list empties (${noLapsed.length})`);
  run('settings back', ['salon.mjs', 'settings', 'set', 'lapsed_after_days', '56'], { json: false });

  const consent = run('one rule runs alone', ['salon.mjs', 'compliance', 'consent']);
  assert(consent.length === 1 && consent[0].rule === 'consent', 'a single rule runs alone');
  assert(consent[0].issues.length === 2, `Daniel and Tom never opted in (${consent[0].issues.length})`);

  const compliance = run('the whole rule book', ['salon.mjs', 'compliance']);
  assert(compliance.length === 7, `seven rules (${compliance.length})`);
  const byRule = Object.fromEntries(compliance.map((r) => [r.rule, r.issues.length]));
  assert(byRule['patch-tests'] === 1, `Mere's colour tomorrow is still the open breach (${byRule['patch-tests']})`);
  assert(byRule['formulas'] === 0, `the formula record is whole (${byRule['formulas']})`);
  assert(byRule['hours'] === 1, `the imported 9am barber cut is named (${byRule['hours']})`);
  assert(byRule['vouchers'] === 1, `the expired unspent balance is named (${byRule['vouchers']})`);
  assert(byRule['double-booked'] === 0, 'nobody holds two chairs');

  // ---- moving in and out ---------------------------------------------------------

  const clientsCsv = path.join(scratch, 'clients.csv');
  writeFileSync(clientsCsv, [
    'First name,Last name,Email,Mobile,Accepts marketing',
    'Zoe,Adams,zoe.adams@example.nz,021 555 0901,Yes',
    'Kate,Simmons,kate.s@newmail.example.nz,,No',
  ].join('\n'));
  const aptsCsv = path.join(scratch, 'appointments.csv');
  writeFileSync(aptsCsv, [
    'Client,Date,Start time,Duration (mins),Service,Staff member,Price,Status',
    `Zoe Adams,${day(9)},10:00,60,Swedish massage,Isla Vermeulen,120,Booked`,
    `Zoe Adams,,10:00,60,Swedish massage,Isla Vermeulen,120,Booked`,
    `Zoe Adams,${day(11)},14:00,30,Brow shape & tint,Somebody Unknown,40,Booked`,
  ].join('\n'));

  const dry = run('import: dry run first', ['salon.mjs', 'import', 'timely', `--clients=${clientsCsv}`, `--appointments=${aptsCsv}`, '--dry-run']);
  assert(dry.dry_run === true && dry.created.some((c) => c.what === 'client' && c.name === 'Zoe Adams'), 'the dry run names who would land');
  assert(dry.skipped.some((s) => /missing date/.test(s.why)), `and names the row with no date (${JSON.stringify(dry.skipped.map((s) => s.why))})`);
  assert(dry.skipped.some((s) => /Somebody Unknown/.test(s.why)), 'and the staff member nobody knows');

  const statsBefore = run('nothing was written', ['salon.mjs', 'stats']);
  assert(n(statsBefore.active_clients) === 15, `still fifteen after the dry run (${statsBefore.active_clients})`);

  const imported = run('import for real', ['salon.mjs', 'import', 'timely', `--clients=${clientsCsv}`, `--appointments=${aptsCsv}`]);
  assert(imported.created.some((c) => c.what === 'client' && c.name === 'Zoe Adams'), 'Zoe Adams arrived');
  assert(imported.created.some((c) => c.what === 'service' && c.name === 'Swedish massage'), 'her service arrived with her');
  assert(imported.updated.some((u) => u.what === 'client' && u.name === 'Kate Simmons'), 'Kate matched, not duplicated');

  const again = run('import again (idempotent)', ['salon.mjs', 'import', 'timely', `--clients=${clientsCsv}`, `--appointments=${aptsCsv}`]);
  assert(!again.created.some((c) => c.what === 'appointment'), `the second pass books nothing new (${JSON.stringify(again.created)})`);

  const zoe = run('and Zoe has no patch test, deliberately', ['salon.mjs', 'client', 'Zoe']);
  assert(zoe.client.patch_test === 'none', 'the old system saying a test happened is not the test');

  const exported = run('export', ['salon.mjs', 'export', `--out=${path.join(scratch, 'out')}`]);
  assert(exported.written.length === 6, `six files (${exported.written.length})`);
  for (const w of exported.written) {
    assert(existsSync(path.join(scratch, 'out', w.file)), `${w.file} exists`);
    assert(readFileSync(path.join(scratch, 'out', w.file), 'utf8').split('\n').length > 2, `${w.file} has rows`);
  }

  console.log(`\nPASS: ${step} steps.`);
} finally {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
