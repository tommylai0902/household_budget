-- 035: let a reminder be dismissed without losing its cycle_date tracking.
--
-- dismissNotification used to DELETE the row. For the two auto-managed
-- producers (recurring_rule_id, inventory_item_id) that backfires: their sync
-- functions (syncUpcomingChargeReminders, syncExpiryReminders) tell "already
-- built this occurrence" apart from "need a new one" by whether a row with
-- the current cycle_date exists at all. Deleting it erases that memory, so
-- the very next ledger load recreated the "dismissed" reminder unchanged.
--
-- Fix: dismiss now sets this flag and keeps the row (see db.js
-- dismissNotification). The sync functions still see cycle_date and skip
-- re-inserting, so a dismissed reminder stays gone until the underlying
-- thing actually changes (rule advances, item gets a new expiry date) — at
-- which point the upsert writes dismissed = false again, same as a genuinely
-- new occurrence should.
alter table notifications
  add column if not exists dismissed boolean not null default false;
