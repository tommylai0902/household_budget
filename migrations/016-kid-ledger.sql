-- 016: Kid Ledger — a gamified template where a kid logs money earned vs
-- money spent, and saves toward a wishlist goal.

-- ledgers.template has its own allow-list (migration 005) separate from
-- TEMPLATE_FEATURES in db.js — widen it or every "kid" ledger insert 400s
-- with a check-constraint violation before it ever reaches the app code.
alter table ledgers drop constraint if exists ledgers_template_check;
alter table ledgers add  constraint ledgers_template_check
  check (template in ('household', 'travel', 'personal', 'kid', 'blank'));

-- Earn/spend rides the existing `expenses` table instead of a parallel one,
-- so it inherits every mapper/RLS/realtime path already built for it. Every
-- other template only ever writes 'spend' (the column's default) — this is a
-- pure addition, nothing already in the app changes behaviour.
alter table expenses add column if not exists kind text not null default 'spend'
  check (kind in ('spend','earn'));

-- One savings target per ledger: a kid ledger shows exactly one goal, and
-- setting a new one overwrites it rather than piling up an unused history.
create table if not exists wishlist_goals (
  id            uuid primary key default gen_random_uuid(),
  ledger_id     uuid not null references ledgers(id) on delete cascade unique,
  name          text not null,
  target_amount numeric(10,2) not null check (target_amount > 0),
  created_at    timestamptz not null default now()
);

alter table wishlist_goals enable row level security;
-- Same VIEWER/EDITOR shape as every other ledger-scoped table (migration 009).
create policy sel_wishlist_goals on wishlist_goals for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_wishlist_goals on wishlist_goals for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_wishlist_goals on wishlist_goals for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_wishlist_goals on wishlist_goals for delete using (has_ledger_role(ledger_id,'EDITOR'));

alter publication supabase_realtime add table wishlist_goals;
