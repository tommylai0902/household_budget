-- ============================================================
--  Remembered shops, so a place you visit often is typed once.
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run: every step is guarded.
--
--  Purely additive: nothing existing is altered or dropped.
-- ============================================================

create table if not exists merchants (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledgers(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (ledger_id, name)
);

alter table merchants enable row level security;
drop policy if exists rw_merchants on merchants;
create policy rw_merchants on merchants for all using (is_member()) with check (is_member());

create index if not exists idx_merchants_ledger on merchants (ledger_id, name);

-- (If this says "already a member of publication", ignore it.)
alter publication supabase_realtime add table merchants;
