-- salon-for-claude-code: core schema.
-- A salon or spa's operating record the way Timely sells it: the team and
-- their working hours, the client book with its history, the services and
-- their prices, the appointment book from booked to checked out, the colour
-- formula record, patch tests, retail stock, sales and gift vouchers.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
-- Money is in cents, NZD. Prices here are what the client pays; wages and
-- GST stay in payroll and accounting, deliberately.
--
-- Deliberately NOT here: payments processing, online booking pages, SMS
-- sending, payroll, commissions. Reminders and recalls draft to drafts/
-- and a person sends them. The card terminal keeps taking payments.
--
-- The sharp edges are deliberate:
--   * a service flagged as needing a patch test is not booked for a client
--     without a clear allergy alert test on record, done at least 48 hours
--     before and inside the validity window (the colour manufacturer's own
--     instructions require the test; the Health and Safety at Work Act 2015
--     s 36 duty to other persons is why the record matters), and there is
--     no force flag
--   * a client whose latest patch test recorded a reaction is never booked
--     for that service again from here; that is a conversation, not a booking
--   * nobody is double-booked: one chair, one client, one time
--   * a booking outside the staff member's recorded working hours is refused
--   * checkout confirms what happened; it never invents a visit, and a
--     no-show or cancellation keeps its record and its reason
--   * retail never sells stock that is not on the shelf
--   * marketing drafts only ever address clients who opted in (Unsolicited
--     Electronic Messages Act 2007); reminders about a booked appointment
--     are not marketing and go to anyone with a booking
--   * no deleting records: appointments cancel with a reason, clients
--     archive, the formula record stays

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Settings ------------------------------------------------------------------------
-- The handful of numbers the rules and views read. Change them with
-- `settings set`.

create table if not exists settings (
  key         text primary key,
  value       text not null,
  note        text,
  updated_at  timestamptz not null default now()
);

-- Staff ---------------------------------------------------------------------------
-- The team behind the chairs. Working hours live in staff_hours; the booking
-- gate reads them.

create table if not exists staff (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  role          text not null default 'stylist',  -- stylist | senior_stylist | barber | beauty_therapist | nail_technician | manager | apprentice
  phone         text,
  email         text,
  status        text not null default 'active',   -- active | former
  note          text,
  external_ref  text unique,                      -- the Timely staff id, for import
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists staff_name_lower_idx on staff (lower(name));

-- Working hours: the standing weekly windows each person takes bookings in.
create table if not exists staff_hours (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff(id) on delete cascade,
  weekday     int not null,                       -- 0 = Sunday ... 6 = Saturday
  starts_at   time not null,
  ends_at     time not null,
  created_at  timestamptz not null default now()
);
create index if not exists staff_hours_staff_idx on staff_hours (staff_id);

-- Clients ---------------------------------------------------------------------------
-- The book of business. marketing_opt_in gates every recall and campaign
-- draft (Unsolicited Electronic Messages Act 2007: consent first). The
-- allergy note travels onto every day sheet.

create table if not exists clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text,
  email             text,
  birthday          date,                          -- the month and day are what matter
  referral_source   text,
  marketing_opt_in  boolean not null default false,
  allergy_note      text,
  note              text,
  status            text not null default 'active', -- active | archived
  external_ref      text unique,                    -- the Timely client id, for import
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists clients_name_lower_idx on clients (lower(name));

-- Patch tests ---------------------------------------------------------------------------
-- The allergy alert test record. Colour manufacturers require the test at
-- least 48 hours before colouring; recording it is how the booking gate can
-- refuse the appointment that skips it (HSWA 2015 s 36: the salon's duty to
-- the people it serves). A recorded reaction is permanent history.

create table if not exists patch_tests (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  tested_on   date not null default current_date,
  outcome     text not null default 'clear',      -- clear | reaction
  staff_id    uuid references staff(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists patch_tests_client_idx on patch_tests (client_id);

-- Services ---------------------------------------------------------------------------
-- The menu. requires_patch_test marks everything with colourant or tint in
-- it: global colour, foils, balayage, toner, brow and lash tints.

create table if not exists services (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  category            text not null default 'cut',  -- cut | colour | styling | treatment | nails | beauty | barber | imported
  duration_minutes    int not null default 60,
  price_cents         bigint not null default 0,
  requires_patch_test boolean not null default false,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists services_name_lower_idx on services (lower(name));

-- Appointments ---------------------------------------------------------------------------
-- The book. One appointment, one chair, one client; the services on it live
-- in appointment_services with the price captured at booking. `confirmed_at`
-- is the reminder answered; checkout turns booked into completed. A booking
-- still `booked` after its date is a till that does not match the book.

create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  ref           text unique,                      -- APT-1001
  client_id     uuid not null references clients(id),
  staff_id      uuid not null references staff(id),
  on_date       date not null,
  starts_at     time not null,
  ends_at       time not null,
  status        text not null default 'booked',   -- booked | completed | no_show | cancelled
  confirmed_at  timestamptz,
  source        text not null default 'phone',    -- phone | walk_in | rebook | import
  cancel_reason text,
  note          text,
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists appointments_date_idx on appointments (on_date);
create index if not exists appointments_client_idx on appointments (client_id);
create index if not exists appointments_staff_idx on appointments (staff_id);

create table if not exists appointment_services (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null references appointments(id) on delete cascade,
  service_id      uuid not null references services(id),
  price_cents     bigint not null default 0,      -- captured at booking; the menu can move later
  sort            int not null default 0
);
create index if not exists apt_services_apt_idx on appointment_services (appointment_id);

-- Formulas ---------------------------------------------------------------------------
-- The colour record: what went on this head, in what mix, for how long. This
-- is the record that makes the next visit repeatable and the record clients
-- feel locked in over. It lives in your database now.

create table if not exists formulas (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  appointment_id  uuid references appointments(id),
  recorded_on     date not null default current_date,
  staff_id        uuid references staff(id),
  formula         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists formulas_client_idx on formulas (client_id);

-- Products and retail ---------------------------------------------------------------------------
-- Retail on the shelf and professional stock in the dispensary. A sale
-- decrements stock; `stock take` corrects it to what a count actually found.

create table if not exists products (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kind           text not null default 'retail',  -- retail | professional
  price_cents    bigint not null default 0,
  stock_on_hand  int not null default 0,
  reorder_level  int not null default 0,
  active         boolean not null default true,
  external_ref   text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists products_name_lower_idx on products (lower(name));

create table if not exists sales (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references clients(id),
  staff_id         uuid references staff(id),
  appointment_id   uuid references appointments(id),
  product_id       uuid not null references products(id),
  qty              int not null default 1,
  unit_price_cents bigint not null default 0,
  sold_on          date not null default current_date,
  created_at       timestamptz not null default now()
);
create index if not exists sales_date_idx on sales (sold_on);
create index if not exists sales_client_idx on sales (client_id);

-- Vouchers ---------------------------------------------------------------------------
-- Gift vouchers are money you have been paid for work you have not done yet.
-- The balance is the liability; the expiry is the conversation. Redeeming
-- past the printed expiry is the salon's goodwill call, so it warns, never
-- refuses; redeeming past the balance refuses.

create table if not exists vouchers (
  id           uuid primary key default gen_random_uuid(),
  ref          text unique,                       -- GV-101
  client_id    uuid references clients(id),
  recipient    text,
  value_cents  bigint not null,
  balance_cents bigint not null,
  sold_on      date not null default current_date,
  expires_on   date not null,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Client notes ---------------------------------------------------------------------------
-- The conversation record: the no-show call, the complaint made right, the
-- "always books with Ava" that a new receptionist needs.

create table if not exists client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  noted_on    date not null default current_date,
  note        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists client_notes_client_idx on client_notes (client_id);

-- updated_at triggers ------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['settings','staff','clients','services','appointments','products','vouchers']
  loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- =====================================================================================
-- Views: the questions an owner asks every week, as SQL anyone can read.
-- =====================================================================================

-- One settings read, typed.
create or replace view v_settings as
select
  coalesce((select value::int from settings where key = 'patch_test_valid_days'), 180) as patch_test_valid_days,
  coalesce((select value::int from settings where key = 'patch_test_lead_days'), 2) as patch_test_lead_days,
  coalesce((select value::int from settings where key = 'lapsed_after_days'), 56) as lapsed_after_days,
  coalesce((select value::int from settings where key = 'unconfirmed_lead_days'), 2) as unconfirmed_lead_days,
  coalesce((select value::int from settings where key = 'voucher_warn_days'), 30) as voucher_warn_days,
  coalesce((select value::int from settings where key = 'gap_alert_minutes'), 180) as gap_alert_minutes;

-- The latest patch test per client, with its state today.
create or replace view v_patch_tests as
select
  c.id as client_id,
  pt.tested_on,
  pt.outcome,
  pt.note,
  case
    when pt.client_id is null then 'none'
    when pt.outcome = 'reaction' then 'REACTION'
    when pt.tested_on < current_date - (select patch_test_valid_days from v_settings) then 'expired'
    else 'clear'
  end as state
from clients c
left join lateral (
  select * from patch_tests p where p.client_id = c.id order by p.tested_on desc, p.created_at desc limit 1
) pt on true;

-- Clients with the story worked out: last visit, the usual gap between
-- visits, spend over the last year, the next booking, the patch test state,
-- and whether they have quietly lapsed.
create or replace view v_clients as
select
  c.id as client_id,
  c.name,
  c.phone,
  c.email,
  c.birthday,
  c.marketing_opt_in,
  c.allergy_note,
  c.referral_source,
  c.status,
  lv.last_visit_on,
  (current_date - lv.last_visit_on) as days_since_visit,
  lv.visits_12m,
  gap.usual_gap_days,
  coalesce(sp.service_cents_12m, 0) + coalesce(rt.retail_cents_12m, 0) as spend_cents_12m,
  nb.next_booking_on,
  pt.state as patch_test,
  pt.tested_on as patch_tested_on,
  (c.status = 'active'
    and lv.last_visit_on is not null
    and (current_date - lv.last_visit_on) > (select lapsed_after_days from v_settings)
    and nb.next_booking_on is null) as lapsed
from clients c
left join lateral (
  select max(a.on_date) as last_visit_on,
         count(*) filter (where a.on_date >= current_date - 365) as visits_12m
  from appointments a where a.client_id = c.id and a.status = 'completed'
) lv on true
left join lateral (
  select round(avg(diff))::int as usual_gap_days from (
    select a.on_date - lag(a.on_date) over (order by a.on_date) as diff
    from appointments a where a.client_id = c.id and a.status = 'completed'
  ) d where diff is not null
) gap on true
left join lateral (
  select sum(s.price_cents)::bigint as service_cents_12m
  from appointments a join appointment_services s on s.appointment_id = a.id
  where a.client_id = c.id and a.status = 'completed' and a.on_date >= current_date - 365
) sp on true
left join lateral (
  select sum(sl.qty * sl.unit_price_cents)::bigint as retail_cents_12m
  from sales sl where sl.client_id = c.id and sl.sold_on >= current_date - 365
) rt on true
left join lateral (
  select min(a.on_date) as next_booking_on
  from appointments a where a.client_id = c.id and a.status = 'booked' and a.on_date >= current_date
) nb on true
left join v_patch_tests pt on pt.client_id = c.id;

-- Whether a client may lawfully sit for a patch-test service on a given day:
-- the latest test is clear, done at least the lead window before, and still
-- inside the validity window. One rule, one place; the gate and the views
-- both call it.
create or replace function patch_test_ok(p_client uuid, p_date date) returns boolean
language sql stable as $$
  select exists (
    select 1
    from (select * from patch_tests p where p.client_id = p_client order by p.tested_on desc, p.created_at desc limit 1) t
    where t.outcome = 'clear'
      and t.tested_on <= p_date - (select patch_test_lead_days from v_settings)
      and t.tested_on >= p_date - (select patch_test_valid_days from v_settings)
  )
$$;

-- The book with everything worked out: who, with whom, what services, what
-- it costs, and the state on one line.
create or replace view v_appointments as
select
  a.id as appointment_id,
  a.ref,
  a.on_date,
  a.starts_at,
  a.ends_at,
  c.name as client,
  c.id as client_id,
  c.allergy_note,
  st.name as staff,
  st.id as staff_id,
  sv.services,
  sv.total_cents,
  sv.needs_patch_test,
  a.status,
  a.confirmed_at,
  a.source,
  a.cancel_reason,
  a.note,
  case
    when a.status = 'cancelled' then 'cancelled'
    when a.status = 'no_show' then 'NO SHOW'
    when a.status = 'completed' then 'completed'
    when a.status = 'booked' and a.on_date < current_date then 'NOT CHECKED OUT'
    when a.status = 'booked' and sv.needs_patch_test and not patch_test_ok(a.client_id, a.on_date) then 'NO PATCH TEST'
    when a.status = 'booked' and a.confirmed_at is null
         and a.on_date <= current_date + (select unconfirmed_lead_days from v_settings) then 'UNCONFIRMED'
    when a.status = 'booked' and a.confirmed_at is not null then 'confirmed'
    else 'booked'
  end as state
from appointments a
join clients c on c.id = a.client_id
join staff st on st.id = a.staff_id
left join lateral (
  select string_agg(s.name, ' + ' order by aps.sort, s.name) as services,
         sum(aps.price_cents)::bigint as total_cents,
         bool_or(s.requires_patch_test) as needs_patch_test
  from appointment_services aps join services s on s.id = aps.service_id
  where aps.appointment_id = a.id
) sv on true;

-- Rebooking: of the visits checked out in the last 28 days, how many of
-- those clients walked out holding their next appointment. The number a
-- salon lives or dies on.
create or replace view v_rebooking as
select
  st.id as staff_id,
  st.name as staff,
  count(*) as visits,
  count(*) filter (where rb.rebooked) as rebooked,
  round(100.0 * count(*) filter (where rb.rebooked) / count(*), 0) as rate_pct
from appointments a
join staff st on st.id = a.staff_id
cross join lateral (
  select exists (
    select 1 from appointments n
    where n.client_id = a.client_id and n.status in ('booked', 'completed') and n.on_date > a.on_date
  ) as rebooked
) rb
where a.status = 'completed' and a.on_date >= current_date - 28 and a.on_date <= current_date
group by st.id, st.name;

-- The empty chair: for each working day in the next 7, the window, what is
-- booked into it, and what is still open.
create or replace view v_gaps as
select
  st.id as staff_id,
  st.name as staff,
  d.on_date,
  h.starts_at,
  h.ends_at,
  (extract(epoch from (h.ends_at - h.starts_at)) / 60)::int as window_minutes,
  coalesce(b.booked_minutes, 0)::int as booked_minutes,
  ((extract(epoch from (h.ends_at - h.starts_at)) / 60) - coalesce(b.booked_minutes, 0))::int as free_minutes
from staff st
cross join lateral (
  select (current_date + i) as on_date from generate_series(0, 6) as i
) d
join staff_hours h on h.staff_id = st.id and h.weekday = extract(dow from d.on_date)::int
left join lateral (
  select sum(extract(epoch from (a.ends_at - a.starts_at)) / 60) as booked_minutes
  from appointments a
  where a.staff_id = st.id and a.on_date = d.on_date and a.status in ('booked', 'completed')
) b on true
where st.status = 'active';

-- Takings by day and staff member: services checked out plus retail over
-- the counter.
create or replace view v_takings as
select
  d.on_date,
  d.staff_id,
  st.name as staff,
  sum(d.service_cents)::bigint as service_cents,
  sum(d.retail_cents)::bigint as retail_cents,
  sum(d.visits)::int as visits,
  sum(d.retail_units)::int as retail_units
from (
  select a.on_date, a.staff_id, va.total_cents as service_cents, 0::bigint as retail_cents, 1 as visits, 0 as retail_units
  from appointments a join v_appointments va on va.appointment_id = a.id
  where a.status = 'completed'
  union all
  select sl.sold_on, sl.staff_id, 0, (sl.qty * sl.unit_price_cents)::bigint, 0, sl.qty
  from sales sl
) d
join staff st on st.id = d.staff_id
group by d.on_date, d.staff_id, st.name;

-- Stock at or under its reorder level. A colour week with an empty
-- dispensary is a cancelled appointment.
create or replace view v_stock_low as
select id as product_id, name, kind, price_cents, stock_on_hand, reorder_level
from products
where active and stock_on_hand <= reorder_level;

-- Vouchers with the liability and the clock visible.
create or replace view v_vouchers as
select
  v.id as voucher_id,
  v.ref,
  c.name as client,
  v.recipient,
  v.value_cents,
  v.balance_cents,
  v.sold_on,
  v.expires_on,
  (v.expires_on - current_date) as days_left,
  case
    when v.balance_cents = 0 then 'redeemed'
    when v.expires_on < current_date then 'EXPIRED UNSPENT'
    when v.expires_on <= current_date + (select voucher_warn_days from v_settings) then 'expiring'
    else 'active'
  end as state
from vouchers v
left join clients c on c.id = v.client_id;

-- No-shows, with each client's habit visible.
create or replace view v_no_shows as
select
  a.ref,
  a.on_date,
  c.name as client,
  c.id as client_id,
  c.phone,
  st.name as staff,
  va.services,
  va.total_cents,
  (select count(*) from appointments p
     where p.client_id = a.client_id and p.status = 'no_show' and p.on_date >= current_date - 182) as no_shows_6m
from appointments a
join clients c on c.id = a.client_id
join staff st on st.id = a.staff_id
join v_appointments va on va.appointment_id = a.id
where a.status = 'no_show';

-- Lapsed clients, worth the most first: the recall list.
create or replace view v_lapsed as
select client_id, name, phone, email, marketing_opt_in,
       last_visit_on, days_since_visit, usual_gap_days, spend_cents_12m
from v_clients
where lapsed
order by spend_cents_12m desc;

-- Everything that wants a decision, one union, worst first. A client booked
-- for colour with no valid allergy alert test outranks everything: that one
-- ends with a face swollen shut, not a refund.
create or replace view v_attention as
-- Colour on the book without a valid patch test.
select 1 as rank, 'patch_test' as reason, va.client as label, va.staff as who,
       va.ref || ' ' || to_char(va.on_date, 'Dy YYYY-MM-DD') as place,
       (va.on_date - current_date)::int as days,
       case when pt.state = 'REACTION'
         then va.client || ' is booked for ' || va.services || ' and their last patch test recorded a REACTION' || case when pt.tested_on is not null then ' (' || to_char(pt.tested_on, 'YYYY-MM-DD') || ')' else '' end || ': do not colour. That is a conversation with the client and their doctor, not a booking. Move them to a service without colourant or cancel with the reason on record'
         else va.client || ' is booked for ' || va.services || ' with ' || case when pt.state = 'none' then 'no allergy alert test on record' else 'a patch test last done ' || to_char(pt.tested_on, 'YYYY-MM-DD') || ', outside the validity window' end || ': the colour manufacturer requires the test at least 48 hours before (HSWA 2015 s 36 duty of care). Get them in for a patch test now (`client patch-test`) or the colour does not happen'
       end as detail
from v_appointments va
join v_patch_tests pt on pt.client_id = va.client_id
where va.state = 'NO PATCH TEST'
union all
-- A booking left open past its date: the till does not match the book.
select 2, 'not_checked_out', va.client, va.staff, va.ref || ' ' || to_char(va.on_date, 'Dy YYYY-MM-DD'),
       (current_date - va.on_date)::int,
       va.client || '''s ' || coalesce(va.services, 'appointment') || ' on ' || to_char(va.on_date, 'YYYY-MM-DD') || ' is still open on the book: if they came, check it out (`checkout ' || va.ref || '`); if they did not, mark it (`no-show ' || va.ref || '`). An open booking is takings nobody counted'
from v_appointments va
where va.state = 'NOT CHECKED OUT'
union all
-- Tomorrow-ish appointments nobody has confirmed.
select 3, 'unconfirmed', va.client, va.staff, va.ref || ' ' || to_char(va.on_date, 'Dy YYYY-MM-DD') || ' ' || to_char(va.on_date + va.starts_at, 'HH24:MI'),
       (va.on_date - current_date)::int,
       va.client || ' is booked ' || to_char(va.on_date + va.starts_at, 'HH24:MI') || ' ' || to_char(va.on_date, 'Dy') || ' for ' || coalesce(va.services, 'an appointment') || ' and has not confirmed: an unanswered reminder is how a no-show starts. Run `/draft-reminders`, send it, then `confirm ' || va.ref || '` when they answer'
from v_appointments va
where va.state = 'UNCONFIRMED' and va.on_date >= current_date
union all
-- No-shows this week still waiting for the follow-up call.
select 4, 'no_show', ns.client, ns.staff, ns.ref || ' ' || to_char(ns.on_date, 'Dy YYYY-MM-DD'),
       (current_date - ns.on_date)::int,
       ns.client || ' no-showed ' || coalesce(ns.services, 'an appointment') || ' (' || ns.no_shows_6m || ' no-show(s) in six months): call while it is fresh. Rebook it, and if this is a habit, a deposit next time is fair'
from v_no_shows ns
where ns.on_date >= current_date - 7
union all
-- A colour visit checked out with no formula recorded.
select 5, 'formula_missing', va.client, va.staff, va.ref || ' ' || to_char(va.on_date, 'Dy YYYY-MM-DD'),
       (current_date - va.on_date)::int,
       va.client || '''s ' || va.services || ' was checked out with no formula recorded: in six weeks nobody will remember the mix. Ask ' || va.staff || ' today and record it (`formula add`) while it is still in someone''s head'
from v_appointments va
where va.status = 'completed' and va.needs_patch_test
  and va.on_date >= current_date - 14
  and not exists (select 1 from formulas f where f.client_id = va.client_id and f.recorded_on = va.on_date)
union all
-- The best clients who have quietly stopped coming.
select 6, 'lapsed', l.name, '', 'last in ' || to_char(l.last_visit_on, 'YYYY-MM-DD'),
       l.days_since_visit::int,
       l.name || ' spent ' || (l.spend_cents_12m / 100) || ' dollars this year, usually comes in every ' || coalesce(l.usual_gap_days::text, '?') || ' days, and has been quiet ' || l.days_since_visit || ' days with nothing booked: ' || case when l.marketing_opt_in then 'they are on the recall list (`/draft-recall`)' else 'they never opted in to marketing, so this one is a personal call, not a campaign (Unsolicited Electronic Messages Act 2007)' end
from (select * from v_lapsed limit 5) l
union all
-- Voucher money on the clock.
select 7, 'voucher', v.ref, coalesce(v.client, v.recipient, ''), 'expires ' || to_char(v.expires_on, 'YYYY-MM-DD'),
       v.days_left::int,
       v.ref || ' still holds ' || (v.balance_cents / 100) || ' dollars and expires in ' || v.days_left || ' day(s): that is money you were paid for work not done yet. Remind the holder before it lapses; an expired voucher argued over the counter costs more than the balance'
from v_vouchers v
where v.state = 'expiring'
union all
-- The shelf and the dispensary.
select 8, 'low_stock', p.name, p.kind, p.stock_on_hand || ' on hand, reorder at ' || p.reorder_level,
       null::int,
       p.name || ' is at ' || p.stock_on_hand || ' (reorder level ' || p.reorder_level || '): ' || case when p.kind = 'professional' then 'a colour week with an empty dispensary is a cancelled appointment. Order it today' else 'an empty shelf sells nothing. Add it to the order' end
from v_stock_low p
union all
-- Tomorrow's empty chairs, one line for the day.
select 9, 'gap', 'tomorrow', '', count(*) || ' chair(s)',
       1,
       'tomorrow holds ' || round(sum(g.free_minutes) / 60.0, 1) || ' open hours across ' || count(*) || ' chair(s): the recall list is who to call first (`lapsed`), and the waitlist note in `/log` is who wanted this week'
from v_gaps g
where g.on_date = current_date + 1 and g.free_minutes >= (select gap_alert_minutes from v_settings)
having count(*) > 0
union all
-- Birthdays inside the week.
select 10, 'birthday', c.name, '', to_char(c.birthday, 'DD Mon'),
       null::int,
       c.name || '''s birthday is this week' || case when c.marketing_opt_in then ': a hand-written line beats a campaign, and they said yes to hearing from you' else '' end
from clients c
where c.status = 'active' and c.birthday is not null and c.marketing_opt_in
  and exists (
    select 1 from generate_series(0, 6) i
    where to_char(current_date + i, 'MM-DD') = to_char(c.birthday, 'MM-DD')
  );
