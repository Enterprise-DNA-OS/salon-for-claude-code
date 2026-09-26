-- Demo data for salon-for-claude-code.
-- Tui & Fern Hair Studio, a fictional Wellington salon: six on the team, a
-- fourteen-name client book, a menu, a colour formula record, retail on the
-- shelf, vouchers in the drawer, eight weeks of visits behind and a booked
-- week ahead.
--
-- Deliberately messy, so the attention list has something to say:
--   Mere Kingi is booked for global colour tomorrow and her allergy alert
--     test was 200 days ago, outside the 180-day window (booked in the old
--     system, which never looked)
--   Jessica Park, a brand-new client, is booked for balayage on Saturday
--     with no patch test on record at all
--   Lily Chen's last patch test recorded a REACTION; she is also lapsed
--   Grace Foley's cut two days ago was never checked out: the till does not
--     match the book
--   Priya Sharma is booked tomorrow morning and has not confirmed
--   Daniel Wu no-showed yesterday, his second in three months, and he has
--     never opted in to marketing
--   Olivia Bennett's colour five days ago was checked out with no formula
--     recorded
--   Hannah Reid, the best colour client on the book, usually in every 35
--     days, has been quiet 77 days with nothing booked
--   voucher GV-101 still holds $80 and expires in 21 days; GV-103 expired
--     with its full $50 unspent
--   the repair conditioner and the 7.3 colour tube are at or under their
--     reorder levels
--   tomorrow's chairs are mostly empty, and Grace Foley's birthday is this
--     week
--
-- Dates are relative to current_date so the demo is coherent whatever day
-- you run it. Ids are derived from names with seed_uuid, and every insert is
-- ON CONFLICT DO NOTHING, so running it twice changes nothing.
--
-- Staff, clients, prices and events are DEMO VALUES for a fictional
-- business. No real person or business is depicted.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- Settings ------------------------------------------------------------------------

insert into settings (key, value, note) values
  ('patch_test_valid_days', '180', 'how long a clear allergy alert test stands before the colour manufacturer wants a fresh one'),
  ('patch_test_lead_days', '2', 'the test happens at least this many days before the colour (manufacturer instructions say 48 hours)'),
  ('lapsed_after_days', '56', 'days of silence with nothing booked before a client counts as lapsed'),
  ('unconfirmed_lead_days', '2', 'appointments inside this many days without a confirmation are loud'),
  ('voucher_warn_days', '30', 'days before a voucher expiry the balance is raised'),
  ('gap_alert_minutes', '180', 'open minutes in a chair-day before tomorrow counts as quiet')
on conflict do nothing;

-- Staff ---------------------------------------------------------------------------

insert into staff (id, name, role, phone, email, status) values
  (seed_uuid('staff:donovan'),   'Claire Donovan',  'manager',           '021 555 0601', 'claire@tuiandfern.example.nz', 'active'),
  (seed_uuid('staff:brennan'),   'Ava Brennan',     'senior_stylist',    '021 555 0602', 'ava@tuiandfern.example.nz',    'active'),
  (seed_uuid('staff:ngata'),     'Ruby Ngata',      'stylist',           '021 555 0603', 'ruby@tuiandfern.example.nz',   'active'),
  (seed_uuid('staff:marsh'),     'Leo Marsh',       'barber',            '021 555 0604', 'leo@tuiandfern.example.nz',    'active'),
  (seed_uuid('staff:vermeulen'), 'Isla Vermeulen',  'beauty_therapist',  '021 555 0605', 'isla@tuiandfern.example.nz',   'active'),
  (seed_uuid('staff:petrov'),    'Nina Petrov',     'nail_technician',   '021 555 0606', 'nina@tuiandfern.example.nz',   'active'),
  (seed_uuid('staff:cole'),      'Dana Cole',       'stylist',           '021 555 0607', 'dana.cole@example.nz',         'former')
on conflict do nothing;

-- Working hours: seven-day windows keep the demo coherent whatever day you
-- run it; a real salon trims these to its trading days in one command each.
insert into staff_hours (id, staff_id, weekday, starts_at, ends_at)
select seed_uuid('hours:' || s.key || ':' || d.i), s.id, d.i, s.starts, s.ends
from (values
  ('donovan',   seed_uuid('staff:donovan'),   time '09:00', time '18:00'),
  ('brennan',   seed_uuid('staff:brennan'),   time '09:00', time '18:00'),
  ('ngata',     seed_uuid('staff:ngata'),     time '09:00', time '18:00'),
  ('marsh',     seed_uuid('staff:marsh'),     time '10:00', time '18:00'),
  ('vermeulen', seed_uuid('staff:vermeulen'), time '09:00', time '15:00'),
  ('petrov',    seed_uuid('staff:petrov'),    time '09:00', time '15:00')
) as s(key, id, starts, ends)
cross join generate_series(0, 6) as d(i)
on conflict do nothing;

-- Clients ---------------------------------------------------------------------------
-- Daniel Wu and Tom Jacobs never opted in to marketing: recall drafts must
-- leave them out (Unsolicited Electronic Messages Act 2007). Grace Foley's
-- birthday lands inside the coming week.

insert into clients (id, name, phone, email, birthday, referral_source, marketing_opt_in, allergy_note, status) values
  (seed_uuid('client:hall'),    'Sophie Hall',    '021 555 0701', 'sophie.hall@example.nz',    null, 'word of mouth', true,  null, 'active'),
  (seed_uuid('client:kingi'),   'Mere Kingi',     '021 555 0702', 'mere.kingi@example.nz',     null, 'walked past',   true,  'Sensitive scalp: 10 minute strand check before full application', 'active'),
  (seed_uuid('client:park'),    'Jessica Park',   '021 555 0703', 'jess.park@example.nz',      null, 'instagram',     true,  null, 'active'),
  (seed_uuid('client:reid'),    'Hannah Reid',    '021 555 0704', 'hannah.reid@example.nz',    null, 'word of mouth', true,  null, 'active'),
  (seed_uuid('client:wu'),      'Daniel Wu',      '021 555 0705', null,                        null, 'walk in',       false, null, 'active'),
  (seed_uuid('client:sharma'),  'Priya Sharma',   '021 555 0706', 'priya.sharma@example.nz',   null, 'google',        true,  null, 'active'),
  (seed_uuid('client:bennett'), 'Olivia Bennett', '021 555 0707', 'olivia.bennett@example.nz', null, 'word of mouth', true,  null, 'active'),
  (seed_uuid('client:foley'),   'Grace Foley',    '021 555 0708', 'grace.foley@example.nz',    (current_date + 3 - interval '34 years')::date, 'word of mouth', true, null, 'active'),
  (seed_uuid('client:doyle'),   'Marcus Doyle',   '021 555 0709', 'marcus.doyle@example.nz',   null, 'walk in',       true,  null, 'active'),
  (seed_uuid('client:watts'),   'Ellie Watts',    '021 555 0710', 'ellie.watts@example.nz',    null, 'voucher gift',  true,  null, 'active'),
  (seed_uuid('client:simmons'), 'Kate Simmons',   '021 555 0711', 'kate.simmons@example.nz',   null, 'google',        true,  null, 'active'),
  (seed_uuid('client:mete'),    'Aroha Mete',     '021 555 0712', 'aroha.mete@example.nz',     null, 'word of mouth', true,  null, 'active'),
  (seed_uuid('client:jacobs'),  'Tom Jacobs',     '021 555 0713', null,                        null, 'walk in',       false, null, 'active'),
  (seed_uuid('client:chen'),    'Lily Chen',      '021 555 0714', 'lily.chen@example.nz',      null, 'instagram',     true,  null, 'active')
on conflict do nothing;

-- Patch tests ---------------------------------------------------------------------------
-- Mere's clear test is 200 days old, outside the 180-day window, and she is
-- booked for colour tomorrow. Jessica has never had one. Lily's last test
-- recorded a reaction: colour is refused for her at the gate, permanently,
-- until a professional conversation says otherwise.

insert into patch_tests (id, client_id, tested_on, outcome, staff_id, note) values
  (seed_uuid('pt:hall'),    seed_uuid('client:hall'),    current_date - 100, 'clear',    seed_uuid('staff:brennan'), null),
  (seed_uuid('pt:kingi'),   seed_uuid('client:kingi'),   current_date - 200, 'clear',    seed_uuid('staff:brennan'), null),
  (seed_uuid('pt:bennett'), seed_uuid('client:bennett'), current_date - 60,  'clear',    seed_uuid('staff:ngata'),   null),
  (seed_uuid('pt:reid'),    seed_uuid('client:reid'),    current_date - 90,  'clear',    seed_uuid('staff:brennan'), null),
  (seed_uuid('pt:chen'),    seed_uuid('client:chen'),    current_date - 30,  'reaction', seed_uuid('staff:ngata'),   'Redness and itching at 48 hours. PPD suspected. Do not colour.')
on conflict do nothing;

-- Services ---------------------------------------------------------------------------

insert into services (id, name, category, duration_minutes, price_cents, requires_patch_test, active) values
  (seed_uuid('svc:cut-style'), 'Style cut & finish',     'cut',       60,  9500,  false, true),
  (seed_uuid('svc:cut-men'),   'Men''s cut',             'barber',    30,  4500,  false, true),
  (seed_uuid('svc:beard'),     'Beard trim',             'barber',    15,  2500,  false, true),
  (seed_uuid('svc:blow'),      'Blow wave',              'styling',   45,  5500,  false, true),
  (seed_uuid('svc:colour'),    'Global colour',          'colour',    105, 16000, true,  true),
  (seed_uuid('svc:foils'),     'Half head foils',        'colour',    120, 19000, true,  true),
  (seed_uuid('svc:balayage'),  'Balayage',               'colour',    180, 26000, true,  true),
  (seed_uuid('svc:toner'),     'Toner & gloss',          'colour',    30,  4500,  true,  true),
  (seed_uuid('svc:treatment'), 'Deep repair treatment',  'treatment', 30,  4000,  false, true),
  (seed_uuid('svc:keratin'),   'Keratin smoothing',      'treatment', 150, 25000, false, true),
  (seed_uuid('svc:manicure'),  'Manicure',               'nails',     45,  6500,  false, true),
  (seed_uuid('svc:pedicure'),  'Pedicure',               'nails',     60,  7500,  false, true),
  (seed_uuid('svc:facial'),    'Signature facial',       'beauty',    60,  11000, false, true),
  (seed_uuid('svc:brow'),      'Brow shape & tint',      'beauty',    30,  4000,  true,  true)
on conflict do nothing;

-- Appointments: the weeks behind ---------------------------------------------------
-- Completed visits carry their services below; formulas for the colour work
-- are in the formula record, except Olivia's five days ago, deliberately.

insert into appointments (id, ref, client_id, staff_id, on_date, starts_at, ends_at, status, confirmed_at, source, cancel_reason, note) values
  -- Sophie Hall: colour + cut with Ava every six weeks, formula on record
  (seed_uuid('apt:1001'), 'APT-1001', seed_uuid('client:hall'), seed_uuid('staff:brennan'), current_date - 94, '10:00', '12:45', 'completed', null, 'rebook', null, null),
  (seed_uuid('apt:1002'), 'APT-1002', seed_uuid('client:hall'), seed_uuid('staff:brennan'), current_date - 52, '10:00', '12:45', 'completed', null, 'rebook', null, null),
  (seed_uuid('apt:1003'), 'APT-1003', seed_uuid('client:hall'), seed_uuid('staff:brennan'), current_date - 10, '10:00', '12:45', 'completed', null, 'rebook', null, null),
  -- Mere Kingi: global colour with Ava
  (seed_uuid('apt:1004'), 'APT-1004', seed_uuid('client:kingi'), seed_uuid('staff:brennan'), current_date - 119, '13:00', '14:45', 'completed', null, 'phone', null, null),
  (seed_uuid('apt:1005'), 'APT-1005', seed_uuid('client:kingi'), seed_uuid('staff:brennan'), current_date - 56,  '13:00', '14:45', 'completed', null, 'rebook', null, null),
  -- Hannah Reid: balayage with Ava every five weeks, then silence
  (seed_uuid('apt:1006'), 'APT-1006', seed_uuid('client:reid'), seed_uuid('staff:brennan'), current_date - 147, '09:30', '12:30', 'completed', null, 'rebook', null, null),
  (seed_uuid('apt:1007'), 'APT-1007', seed_uuid('client:reid'), seed_uuid('staff:brennan'), current_date - 112, '09:30', '12:30', 'completed', null, 'rebook', null, null),
  (seed_uuid('apt:1008'), 'APT-1008', seed_uuid('client:reid'), seed_uuid('staff:brennan'), current_date - 77,  '09:30', '12:30', 'completed', null, 'rebook', null, null),
  -- Olivia Bennett: colour with Ruby; the recent one has no formula recorded
  (seed_uuid('apt:1009'), 'APT-1009', seed_uuid('client:bennett'), seed_uuid('staff:ngata'), current_date - 61, '13:00', '14:45', 'completed', null, 'phone', null, null),
  (seed_uuid('apt:1010'), 'APT-1010', seed_uuid('client:bennett'), seed_uuid('staff:ngata'), current_date - 5,  '13:00', '14:45', 'completed', null, 'rebook', null, null),
  -- Kate Simmons: cuts with Claire
  (seed_uuid('apt:1011'), 'APT-1011', seed_uuid('client:simmons'), seed_uuid('staff:donovan'), current_date - 45, '14:00', '15:00', 'completed', null, 'phone', null, null),
  (seed_uuid('apt:1012'), 'APT-1012', seed_uuid('client:simmons'), seed_uuid('staff:donovan'), current_date - 3,  '14:00', '15:00', 'completed', null, 'rebook', null, null),
  -- Grace Foley: blow waves with Claire; two days ago was never checked out
  (seed_uuid('apt:1013'), 'APT-1013', seed_uuid('client:foley'), seed_uuid('staff:donovan'), current_date - 34, '12:00', '12:45', 'completed', null, 'phone', null, null),
  (seed_uuid('apt:1014'), 'APT-1014', seed_uuid('client:foley'), seed_uuid('staff:donovan'), current_date - 6,  '12:00', '12:45', 'completed', null, 'rebook', null, null),
  (seed_uuid('apt:1026'), 'APT-1026', seed_uuid('client:foley'), seed_uuid('staff:donovan'), current_date - 2,  '16:00', '17:00', 'booked', (current_date - 3)::timestamptz, 'phone', null, null),
  -- Marcus Doyle: barber regular with Leo
  (seed_uuid('apt:1015'), 'APT-1015', seed_uuid('client:doyle'), seed_uuid('staff:marsh'), current_date - 35, '16:30', '17:15', 'completed', null, 'rebook', null, null),
  (seed_uuid('apt:1016'), 'APT-1016', seed_uuid('client:doyle'), seed_uuid('staff:marsh'), current_date - 14, '16:30', '17:00', 'completed', null, 'rebook', null, null),
  -- Daniel Wu: one visit, two no-shows, the second yesterday
  (seed_uuid('apt:1017'), 'APT-1017', seed_uuid('client:wu'), seed_uuid('staff:marsh'), current_date - 35, '11:00', '11:30', 'completed', null, 'walk_in', null, null),
  (seed_uuid('apt:1018'), 'APT-1018', seed_uuid('client:wu'), seed_uuid('staff:marsh'), current_date - 70, '11:00', '11:30', 'no_show', null, 'phone', null, null),
  (seed_uuid('apt:1019'), 'APT-1019', seed_uuid('client:wu'), seed_uuid('staff:marsh'), current_date - 1,  '11:00', '11:30', 'no_show', null, 'phone', null, null),
  -- Lily Chen: manicures with Isla, then quiet
  (seed_uuid('apt:1020'), 'APT-1020', seed_uuid('client:chen'), seed_uuid('staff:vermeulen'), current_date - 120, '10:00', '10:45', 'completed', null, 'instagram', null, null),
  (seed_uuid('apt:1021'), 'APT-1021', seed_uuid('client:chen'), seed_uuid('staff:vermeulen'), current_date - 63,  '10:00', '10:45', 'completed', null, 'rebook', null, null),
  -- Tom Jacobs: one cut, ninety days ago
  (seed_uuid('apt:1022'), 'APT-1022', seed_uuid('client:jacobs'), seed_uuid('staff:marsh'), current_date - 90, '12:00', '12:30', 'completed', null, 'walk_in', null, null),
  -- Ellie Watts: pedicure a month ago
  (seed_uuid('apt:1023'), 'APT-1023', seed_uuid('client:watts'), seed_uuid('staff:vermeulen'), current_date - 30, '13:00', '14:00', 'completed', null, 'phone', null, null),
  -- Aroha Mete: treatment three months back (her keratin is booked ahead)
  (seed_uuid('apt:1024'), 'APT-1024', seed_uuid('client:mete'), seed_uuid('staff:brennan'), current_date - 84, '15:00', '15:30', 'completed', null, 'phone', null, null),
  -- Priya Sharma: a cut with Ruby six weeks back
  (seed_uuid('apt:1025'), 'APT-1025', seed_uuid('client:sharma'), seed_uuid('staff:ngata'), current_date - 40, '10:00', '11:00', 'completed', null, 'google', null, null)
on conflict do nothing;

-- Appointments: the booked week ahead -----------------------------------------------
-- Priya has not confirmed tomorrow morning. Mere's colour tomorrow sits on
-- an expired patch test; Jessica's balayage on Saturday has none at all
-- (both keyed into the old system, which never looked). Marcus is booked
-- before Leo's day starts, straight from the Timely import.

insert into appointments (id, ref, client_id, staff_id, on_date, starts_at, ends_at, status, confirmed_at, source, cancel_reason, note) values
  (seed_uuid('apt:1030'), 'APT-1030', seed_uuid('client:sharma'),  seed_uuid('staff:ngata'),   current_date + 1,  '10:00', '11:00', 'booked', null, 'phone', null, null),
  (seed_uuid('apt:1031'), 'APT-1031', seed_uuid('client:kingi'),   seed_uuid('staff:brennan'), current_date + 1,  '13:00', '14:45', 'booked', (current_date - 2)::timestamptz, 'rebook', null, null),
  (seed_uuid('apt:1032'), 'APT-1032', seed_uuid('client:simmons'), seed_uuid('staff:donovan'), current_date + 1,  '14:00', '15:00', 'booked', (current_date - 1)::timestamptz, 'rebook', null, null),
  (seed_uuid('apt:1033'), 'APT-1033', seed_uuid('client:doyle'),   seed_uuid('staff:marsh'),   current_date + 3,  '09:00', '09:30', 'booked', (current_date - 5)::timestamptz, 'import', null, 'Came across in the Timely import: 9am is before Leo starts'),
  (seed_uuid('apt:1034'), 'APT-1034', seed_uuid('client:park'),    seed_uuid('staff:ngata'),   current_date + 5,  '10:00', '13:00', 'booked', (current_date - 4)::timestamptz, 'instagram', null, 'New client'),
  (seed_uuid('apt:1035'), 'APT-1035', seed_uuid('client:mete'),    seed_uuid('staff:brennan'), current_date + 10, '10:00', '12:30', 'booked', (current_date - 6)::timestamptz, 'rebook', null, null),
  (seed_uuid('apt:1036'), 'APT-1036', seed_uuid('client:hall'),    seed_uuid('staff:brennan'), current_date + 32, '10:00', '13:00', 'booked', (current_date - 10)::timestamptz, 'rebook', null, null)
on conflict do nothing;

-- Services on each appointment (price captured at booking) ---------------------------

insert into appointment_services (id, appointment_id, service_id, price_cents, sort) values
  (seed_uuid('as:1001a'), seed_uuid('apt:1001'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1001b'), seed_uuid('apt:1001'), seed_uuid('svc:cut-style'), 9500,  1),
  (seed_uuid('as:1002a'), seed_uuid('apt:1002'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1002b'), seed_uuid('apt:1002'), seed_uuid('svc:cut-style'), 9500,  1),
  (seed_uuid('as:1003a'), seed_uuid('apt:1003'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1003b'), seed_uuid('apt:1003'), seed_uuid('svc:cut-style'), 9500,  1),
  (seed_uuid('as:1004a'), seed_uuid('apt:1004'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1005a'), seed_uuid('apt:1005'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1006a'), seed_uuid('apt:1006'), seed_uuid('svc:balayage'),  26000, 0),
  (seed_uuid('as:1007a'), seed_uuid('apt:1007'), seed_uuid('svc:balayage'),  26000, 0),
  (seed_uuid('as:1008a'), seed_uuid('apt:1008'), seed_uuid('svc:balayage'),  26000, 0),
  (seed_uuid('as:1009a'), seed_uuid('apt:1009'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1010a'), seed_uuid('apt:1010'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1011a'), seed_uuid('apt:1011'), seed_uuid('svc:cut-style'), 9500,  0),
  (seed_uuid('as:1012a'), seed_uuid('apt:1012'), seed_uuid('svc:cut-style'), 9500,  0),
  (seed_uuid('as:1013a'), seed_uuid('apt:1013'), seed_uuid('svc:blow'),      5500,  0),
  (seed_uuid('as:1014a'), seed_uuid('apt:1014'), seed_uuid('svc:blow'),      5500,  0),
  (seed_uuid('as:1026a'), seed_uuid('apt:1026'), seed_uuid('svc:cut-style'), 9500,  0),
  (seed_uuid('as:1015a'), seed_uuid('apt:1015'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1015b'), seed_uuid('apt:1015'), seed_uuid('svc:beard'),     2500,  1),
  (seed_uuid('as:1016a'), seed_uuid('apt:1016'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1017a'), seed_uuid('apt:1017'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1018a'), seed_uuid('apt:1018'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1019a'), seed_uuid('apt:1019'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1020a'), seed_uuid('apt:1020'), seed_uuid('svc:manicure'),  6500,  0),
  (seed_uuid('as:1021a'), seed_uuid('apt:1021'), seed_uuid('svc:manicure'),  6500,  0),
  (seed_uuid('as:1022a'), seed_uuid('apt:1022'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1023a'), seed_uuid('apt:1023'), seed_uuid('svc:pedicure'),  7500,  0),
  (seed_uuid('as:1024a'), seed_uuid('apt:1024'), seed_uuid('svc:treatment'), 4000,  0),
  (seed_uuid('as:1025a'), seed_uuid('apt:1025'), seed_uuid('svc:cut-style'), 9500,  0),
  (seed_uuid('as:1030a'), seed_uuid('apt:1030'), seed_uuid('svc:cut-style'), 9500,  0),
  (seed_uuid('as:1031a'), seed_uuid('apt:1031'), seed_uuid('svc:colour'),    16000, 0),
  (seed_uuid('as:1032a'), seed_uuid('apt:1032'), seed_uuid('svc:cut-style'), 9500,  0),
  (seed_uuid('as:1033a'), seed_uuid('apt:1033'), seed_uuid('svc:cut-men'),   4500,  0),
  (seed_uuid('as:1034a'), seed_uuid('apt:1034'), seed_uuid('svc:balayage'),  26000, 0),
  (seed_uuid('as:1035a'), seed_uuid('apt:1035'), seed_uuid('svc:keratin'),   25000, 0),
  (seed_uuid('as:1036a'), seed_uuid('apt:1036'), seed_uuid('svc:foils'),     19000, 0),
  (seed_uuid('as:1036b'), seed_uuid('apt:1036'), seed_uuid('svc:cut-style'), 9500,  1)
on conflict do nothing;

-- Formulas ---------------------------------------------------------------------------
-- Olivia's visit five days ago has no formula, deliberately: the attention
-- list asks for it while the mix is still in someone's head.

insert into formulas (id, client_id, appointment_id, recorded_on, staff_id, formula) values
  (seed_uuid('fm:hall1'),    seed_uuid('client:hall'),    seed_uuid('apt:1001'), current_date - 94,  seed_uuid('staff:brennan'), '7.3 + 8.34 (1:1) with 20vol, 35 min at roots, 15 through ends'),
  (seed_uuid('fm:hall2'),    seed_uuid('client:hall'),    seed_uuid('apt:1002'), current_date - 52,  seed_uuid('staff:brennan'), '7.3 + 8.34 (1:1) with 20vol, 35 min. Ends refreshed with 8.34 gloss 10 min'),
  (seed_uuid('fm:hall3'),    seed_uuid('client:hall'),    seed_uuid('apt:1003'), current_date - 10,  seed_uuid('staff:brennan'), '7.3 + 8.34 (1:1) with 20vol, 35 min. Toner 9.1 five minutes, cool rinse'),
  (seed_uuid('fm:kingi1'),   seed_uuid('client:kingi'),   seed_uuid('apt:1004'), current_date - 119, seed_uuid('staff:brennan'), '5.4 with 20vol (1:1.5), 30 min. Strand check at 10 min: scalp fine'),
  (seed_uuid('fm:kingi2'),   seed_uuid('client:kingi'),   seed_uuid('apt:1005'), current_date - 56,  seed_uuid('staff:brennan'), '5.4 with 20vol (1:1.5), 30 min. Slight warmth at roots, next time 5.41'),
  (seed_uuid('fm:reid1'),    seed_uuid('client:reid'),    seed_uuid('apt:1008'), current_date - 77,  seed_uuid('staff:brennan'), 'Freehand balayage, lightener with 30vol to level 8, 45 min with heat. Toner 9.13, 10 min'),
  (seed_uuid('fm:bennett1'), seed_uuid('client:bennett'), seed_uuid('apt:1009'), current_date - 61,  seed_uuid('staff:ngata'),   '6.35 with 20vol (1:1), 35 min. Client wants it half a shade cooler next visit')
on conflict do nothing;

-- Products ---------------------------------------------------------------------------

insert into products (id, name, kind, price_cents, stock_on_hand, reorder_level, active) values
  (seed_uuid('prod:shampoo'),   'Repair shampoo 300ml',      'retail',       4200, 8,  5, true),
  (seed_uuid('prod:cond'),      'Repair conditioner 300ml',  'retail',       4400, 3,  5, true),
  (seed_uuid('prod:serum'),     'Silk serum 50ml',           'retail',       3800, 6,  3, true),
  (seed_uuid('prod:saltspray'), 'Sea salt spray 200ml',      'retail',       2900, 12, 4, true),
  (seed_uuid('prod:tube73'),    'Colour tube 7.3 60ml',      'professional', 1900, 2,  6, true),
  (seed_uuid('prod:dev20'),     'Developer 20vol 1L',        'professional', 1600, 9,  4, true)
on conflict do nothing;

-- Sales ---------------------------------------------------------------------------

insert into sales (id, client_id, staff_id, appointment_id, product_id, qty, unit_price_cents, sold_on) values
  (seed_uuid('sl:1'), seed_uuid('client:hall'),    seed_uuid('staff:brennan'),   seed_uuid('apt:1003'), seed_uuid('prod:shampoo'),   1, 4200, current_date - 10),
  (seed_uuid('sl:2'), seed_uuid('client:bennett'), seed_uuid('staff:ngata'),     seed_uuid('apt:1010'), seed_uuid('prod:cond'),      1, 4400, current_date - 5),
  (seed_uuid('sl:3'), seed_uuid('client:watts'),   seed_uuid('staff:vermeulen'), seed_uuid('apt:1023'), seed_uuid('prod:serum'),     1, 3800, current_date - 30),
  (seed_uuid('sl:4'), seed_uuid('client:doyle'),   seed_uuid('staff:marsh'),     seed_uuid('apt:1016'), seed_uuid('prod:saltspray'), 1, 2900, current_date - 14)
on conflict do nothing;

-- Vouchers ---------------------------------------------------------------------------

insert into vouchers (id, ref, client_id, recipient, value_cents, balance_cents, sold_on, expires_on, note) values
  (seed_uuid('gv:101'), 'GV-101', seed_uuid('client:watts'), 'Ellie Watts',  10000, 8000, current_date - 340, current_date + 21,  'Birthday gift from her sister'),
  (seed_uuid('gv:102'), 'GV-102', null,                      'Joan Mercer',  5000,  0,    current_date - 200, current_date + 165, null),
  (seed_uuid('gv:103'), 'GV-103', null,                      'Sam Whitford', 5000,  5000, current_date - 400, current_date - 35,  'Bought at the Christmas market')
on conflict do nothing;

-- Client notes ---------------------------------------------------------------------------

insert into client_notes (id, client_id, noted_on, note) values
  (seed_uuid('cn:1'), seed_uuid('client:reid'),  current_date - 70, 'Hannah mentioned she might try the new place near her work. Worth a personal note from Ava, not a template.'),
  (seed_uuid('cn:2'), seed_uuid('client:wu'),    current_date - 69, 'Called Daniel about the missed cut. Says he forgot. No deposit taken; next time ask for one.'),
  (seed_uuid('cn:3'), seed_uuid('client:kingi'), current_date - 4,  'Mere rang to move her colour to tomorrow. Reminder: her patch test needs re-doing first, it is past the window.')
on conflict do nothing;
