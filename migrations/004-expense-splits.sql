-- ============================================================
--  Pick who shares each expense, instead of always splitting
--  between everyone in the ledger.
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run: every step is guarded.
--
--  Existing shared expenses are backfilled with every member of their
--  ledger, so past splits keep the totals they already had.
-- ============================================================

create table if not exists expense_splits (
  expense_id uuid not null references expenses(id)       on delete cascade,
  member_id  uuid not null references ledger_members(id) on delete restrict,
  primary key (expense_id, member_id)
);

alter table expense_splits enable row level security;
drop policy if exists rw_expense_splits on expense_splits;
create policy rw_expense_splits on expense_splits for all using (is_member()) with check (is_member());

create index if not exists idx_expense_splits_member on expense_splits (member_id);

-- ---- backfill: a shared expense used to mean "everyone in the ledger" ----
insert into expense_splits (expense_id, member_id)
select e.id, lm.id
from expenses e
join ledger_members lm on lm.ledger_id = e.ledger_id
where e.split_type = 'shared_50'
on conflict do nothing;

alter publication supabase_realtime add table expense_splits;
