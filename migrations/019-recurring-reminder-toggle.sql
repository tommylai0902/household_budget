-- 019: manual control over the automatic upcoming-charge reminder
-- (migration 018) — an on/off toggle plus an editable lead time, replacing
-- the hardcoded "every non-paused Subscriptions rule, always 2 days".
--
-- Defaults preserve today's behaviour for every existing rule: has_reminder
-- true, reminder_lead_days 2 — nothing changes until someone touches the
-- new controls in the recurring-expense form.
alter table recurring_rules add column if not exists has_reminder boolean not null default true;
alter table recurring_rules add column if not exists reminder_lead_days integer not null default 2 check (reminder_lead_days > 0);
