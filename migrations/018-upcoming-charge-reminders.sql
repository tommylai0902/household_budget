-- 018: Automatic "upcoming charge" reminders for recurring Subscriptions rules.
--
-- Distinct from the manual per-expense cancellation reminder (migration 017,
-- expense_id) — this one has no toggle. Any non-paused recurring rule whose
-- category is named "Subscriptions" gets one, tracking whichever occurrence
-- it's about to generate next; unique so advancing to the next cycle
-- overwrites the row instead of piling one up per occurrence.
alter table notifications add column if not exists recurring_rule_id uuid
  references recurring_rules(id) on delete cascade unique;
