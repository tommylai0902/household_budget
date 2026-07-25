-- 017: Notification Centre + subscription cancellation reminders.
--
-- One generic table, one source of rows for now: the Add/Edit Expense
-- panel's "Cancellation Reminder" toggle (category === Subscriptions).
-- expense_id is nullable/unique rather than a required 1:1 column so a
-- future notification source isn't blocked on this table's shape, but
-- "one reminder per expense" is still enforced at the DB level (re-saving
-- overwrites the existing reminder instead of piling up duplicates).
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledgers(id) on delete cascade,
  expense_id uuid references expenses(id) on delete cascade unique,
  title      text not null,
  remind_at  date not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
-- Same VIEWER/EDITOR shape as every other ledger-scoped table (migration 009).
create policy sel_notifications on notifications for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_notifications on notifications for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_notifications on notifications for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_notifications on notifications for delete using (has_ledger_role(ledger_id,'EDITOR'));

alter publication supabase_realtime add table notifications;
