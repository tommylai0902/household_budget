-- 033: notify before an inventory item's expiry date.
--
-- The bell had exactly two producers: per-expense reminders (expense_id,
-- migration 017) and upcoming recurring charges (recurring_rule_id, 019/020).
-- expiry_date has been on inventory_items since 021, but nothing ever turned
-- it into a notification — it only drove the red "Expired"/"Expiring soon"
-- chips computed client-side while the Inventory panel happens to be open.
-- So food quietly went off and the bell stayed empty.
--
-- Same shape as the other two producers: a nullable FK, unique so the sync can
-- upsert on it, cascading so deleting the item takes its reminder with it.
alter table notifications
  add column if not exists inventory_item_id uuid references inventory_items(id) on delete cascade;

-- Plain, NOT partial. This first shipped as `... where inventory_item_id is
-- not null`, which Postgres refuses to use for ON CONFLICT (inventory_item_id):
-- inferring a partial index requires the statement to repeat the predicate, and
-- PostgREST's upsert emits no WHERE, so every sync died with 42P10 "no unique
-- or exclusion constraint matching the ON CONFLICT specification". The
-- partial-ness bought nothing anyway — NULLs never collide in a unique index,
-- so the other two producers' null rows were always free.
-- Dropped first so re-running this migration repairs a database that already
-- got the partial version.
drop index if exists uniq_notifications_inventory_item;
create unique index if not exists uniq_notifications_inventory_item
  on notifications (inventory_item_id);

-- No new "which date was this built for?" column: cycle_date (020) already
-- means exactly that, and syncExpiryReminders stores the expiry_date it
-- generated against there. Same benefit as for recurring rules — a
-- user-edited remind_at survives until the underlying date actually moves.
