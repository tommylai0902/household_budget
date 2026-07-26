-- 020: Let users edit the date of an auto-managed "upcoming charge" reminder.
--
-- syncUpcomingChargeReminders used to key "is this the same occurrence I
-- already generated?" off remind_at itself, so any manual edit to remind_at
-- looked like a brand new occurrence and got silently overwritten on the
-- very next refresh. Tracking the underlying recurring-rule occurrence date
-- separately (cycle_date) from the now-editable remind_at fixes that: the
-- row is only regenerated once the rule actually advances to its next cycle.
alter table notifications add column if not exists cycle_date date;
