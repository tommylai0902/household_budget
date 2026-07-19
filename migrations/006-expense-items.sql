-- ============================================================
--  Keep the line items a scanned receipt was broken into, so the
--  breakdown survives saving instead of living only in the form.
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run: every step is guarded.
--
--  Purely additive. Expenses entered by hand simply have no rows here.
-- ============================================================

create table if not exists expense_items (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  name       text not null,
  -- The amount actually charged for this line: the printed price with its
  -- share of the tax folded in, so these sum to the expense total.
  amount     numeric(10,2) not null,
  sort_order int not null default 0
);

alter table expense_items enable row level security;
drop policy if exists rw_expense_items on expense_items;
create policy rw_expense_items on expense_items for all using (is_member()) with check (is_member());

create index if not exists idx_expense_items_expense on expense_items (expense_id, sort_order);

alter publication supabase_realtime add table expense_items;
