-- ============================================================
--  Per-ledger members: split with whoever is actually on the trip,
--  not a hardcoded Tommy / Wing.
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run: every step is guarded.
--
--  Existing expenses keep their payer — the text 'tommy' / 'wing' is
--  matched to seeded members of the same name before the old column goes.
-- ============================================================

create table if not exists ledger_members (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledgers(id) on delete cascade,
  name       text not null,
  color      text not null default '#0E9384',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (ledger_id, name)
);

alter table ledger_members enable row level security;
drop policy if exists rw_ledger_members on ledger_members;
create policy rw_ledger_members on ledger_members for all using (is_member()) with check (is_member());

create index if not exists idx_ledger_members_ledger on ledger_members (ledger_id);

-- ---- seed Tommy & Wing into every ledger that has no members yet ----
insert into ledger_members (ledger_id, name, color, sort_order)
select l.id, m.name, m.color, m.ord
from ledgers l
cross join (values ('Tommy', '#0E9384', 0), ('Wing', '#EA580C', 1)) as m(name, color, ord)
where not exists (select 1 from ledger_members lm where lm.ledger_id = l.id);

-- ---- point expenses at a member instead of a text label ----
alter table expenses add column if not exists paid_by_id uuid references ledger_members(id) on delete restrict;

update expenses e
set paid_by_id = lm.id
from ledger_members lm
where lm.ledger_id = e.ledger_id
  and lower(lm.name) = lower(e.paid_by)
  and e.paid_by_id is null;

-- Deliberately strict: if any row failed to match above, this raises and the
-- whole migration rolls back rather than quietly dropping who paid.
alter table expenses alter column paid_by_id set not null;

alter table expenses drop constraint if exists expenses_paid_by_check;
alter table expenses drop column if exists paid_by;

alter publication supabase_realtime add table ledger_members;
