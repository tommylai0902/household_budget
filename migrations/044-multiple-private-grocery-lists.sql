-- 044: allow a user to have more than one private grocery list.
--
-- Migration 043 gave grocery_lists two partial unique indexes: one shared
-- list per household ledger, one private list per user. That matched v1's
-- UI (exactly two lists per user). Smart Grocery is getting a card-based
-- picker where a user can create as many private lists as they want (e.g.
-- separate lists for different kinds of shopping) -- the shared side is
-- unchanged, still exactly one list per household ledger.
--
-- The RLS policies already support multiple rows per owner_id (they check
-- `owner_id = auth.uid()` per-row, with no count limit) -- the unique index
-- was the only thing enforcing "exactly one," so dropping it is the whole
-- change. Nothing to backfill: this only removes a constraint, it doesn't
-- touch existing rows.

drop index if exists uq_grocery_lists_one_private;
