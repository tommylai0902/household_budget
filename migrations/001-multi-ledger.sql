-- ============================================================
--  Multi-ledger: Household / Personal / Travel / …
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run: every step is guarded.
--
--  Existing rows are moved into a ledger named 'Household', so
--  nothing you have already entered is lost or orphaned.
-- ============================================================

create table if not exists ledgers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table ledgers enable row level security;
drop policy if exists rw_ledgers on ledgers;
create policy rw_ledgers on ledgers for all using (is_member()) with check (is_member());

-- Every ledger owns its own categories, expenses and budgets.
alter table categories add column if not exists ledger_id uuid references ledgers(id) on delete cascade;
alter table expenses   add column if not exists ledger_id uuid references ledgers(id) on delete cascade;
alter table budgets    add column if not exists ledger_id uuid references ledgers(id) on delete cascade;

-- ---- migrate what's already there ----
insert into ledgers (name, sort_order)
  select 'Household', 0
  where not exists (select 1 from ledgers);

update categories set ledger_id = (select id from ledgers order by created_at, id limit 1) where ledger_id is null;
update expenses   set ledger_id = (select id from ledgers order by created_at, id limit 1) where ledger_id is null;
update budgets    set ledger_id = (select id from ledgers order by created_at, id limit 1) where ledger_id is null;

-- Only enforce NOT NULL once the backfill above has actually run.
alter table categories alter column ledger_id set not null;
alter table expenses   alter column ledger_id set not null;

-- Category names are unique per ledger now, not globally — Household and
-- Travel may each have their own 'Food'.
alter table categories drop constraint if exists categories_name_key;
alter table categories drop constraint if exists categories_ledger_name_key;
alter table categories add  constraint categories_ledger_name_key unique (ledger_id, name);

create index if not exists idx_categories_ledger on categories (ledger_id);
create index if not exists idx_expenses_ledger   on expenses   (ledger_id, transaction_date desc);

-- (If this last line says "already a member of publication", ignore it.)
alter publication supabase_realtime add table ledgers;
