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

-- Partial: the other two producers leave this null, and NULLs don't collide in
-- a plain unique index anyway — but this keeps the intent explicit and the
-- index small.
create unique index if not exists uniq_notifications_inventory_item
  on notifications (inventory_item_id) where inventory_item_id is not null;

-- No new "which date was this built for?" column: cycle_date (020) already
-- means exactly that, and syncExpiryReminders stores the expiry_date it
-- generated against there. Same benefit as for recurring rules — a
-- user-edited remind_at survives until the underlying date actually moves.
