-- ============================================================
--  013 — Recurring expenses. A rule describes a repeating charge; the client
--  materialises due occurrences into real `expenses` rows on ledger load
--  (catch-up generation — no cron). Generated rows carry recurring_rule_id so
--  the list can badge them and a partial-unique index makes generation safe to
--  run from two clients at once.
-- ============================================================

create table recurring_rules (
  id                  uuid primary key default gen_random_uuid(),
  ledger_id           uuid not null references ledgers(id) on delete cascade,
  description         text not null,
  amount              numeric(12,2) not null,
  category_id         uuid references categories(id) on delete set null,
  paid_by_id          uuid references ledger_members(id) on delete set null,  -- set null on member delete; generation falls back to first member
  split_type          text not null default 'shared_50' check (split_type in ('personal','shared_50')),
  shared_with         uuid[] not null default '{}',                            -- member ids for a shared rule
  frequency           text not null check (frequency in ('weekly','monthly','yearly')),
  start_date          date not null,
  paused              boolean not null default false,
  last_generated_date date,                                                    -- cursor: generated through this occurrence
  created_at          timestamptz not null default now()
);
create index idx_recurring_ledger on recurring_rules (ledger_id);

-- Link generated expenses back to their rule. Null for hand-entered expenses.
alter table expenses add column if not exists recurring_rule_id uuid references recurring_rules(id) on delete set null;
-- One occurrence per rule per date — the guard that makes catch-up idempotent
-- under a race. Partial so ordinary (null-rule) expenses are never constrained.
create unique index if not exists uq_expense_recurring_occurrence
  on expenses (recurring_rule_id, transaction_date) where recurring_rule_id is not null;

-- Same VIEWER-reads / EDITOR-writes gate as the other ledger-scoped tables.
alter table recurring_rules enable row level security;
create policy rr_select on recurring_rules for select using (has_ledger_role(ledger_id, 'VIEWER'));
create policy rr_insert on recurring_rules for insert with check (has_ledger_role(ledger_id, 'EDITOR'));
create policy rr_update on recurring_rules for update using (has_ledger_role(ledger_id, 'EDITOR')) with check (has_ledger_role(ledger_id, 'EDITOR'));
create policy rr_delete on recurring_rules for delete using (has_ledger_role(ledger_id, 'EDITOR'));

alter publication supabase_realtime add table recurring_rules;
