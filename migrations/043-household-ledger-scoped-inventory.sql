-- 043: revert Inventory/Grocery/Store Setup from app-wide (migration 038) to
-- scoped by a specific `template = 'household'` ledger, and give Smart
-- Grocery a private-list option.
--
-- 038 assumed exactly one household would ever use this app instance and
-- gated these tables on "is this person allowed to log in at all"
-- (is_household_member(), the flat `members` allowlist). That stops being
-- true the moment a second, unrelated household group (roommates, friends)
-- starts using the same app: everyone who can log in would see everyone
-- else's pantry and shopping list. The correct scoping unit is a household
-- ledger's own membership (has_ledger_role, migration 009 -- the same
-- mechanism expenses/budgets have always used), because a ledger already
-- carries "who's actually in this group," and a person can belong to more
-- than one such group (their own place, a family member's).
--
-- Smart Grocery additionally gets a private/shared split per list: sharing a
-- household ledger (e.g. splitting rent as roommates) does not imply wanting
-- to share a grocery list, mirroring expenses' own personal/shared split.
-- Inventory Hub does not get this -- it stays one shared list per household
-- ledger, per the household's own decision that a pantry has one owner
-- (the household) but a shopping list might not.

do $$
declare
  v_household_id uuid;
  v_household_count int;
begin
  select count(*) into v_household_count from ledgers where template = 'household';
  if v_household_count <> 1 then
    raise exception 'expected exactly 1 household-template ledger to backfill onto, found %. Resolve manually before rerunning this migration.', v_household_count;
  end if;
  select id into v_household_id from ledgers where template = 'household';

  -- ---- inventory_items: back to per-ledger ----
  alter table inventory_items add column if not exists ledger_id uuid references ledgers(id) on delete cascade;
  update inventory_items set ledger_id = v_household_id where ledger_id is null;
  alter table inventory_items alter column ledger_id set not null;

  -- ---- inventory_labels: back to per-ledger ----
  alter table inventory_labels add column if not exists ledger_id uuid references ledgers(id) on delete cascade;
  update inventory_labels set ledger_id = v_household_id where ledger_id is null;
  alter table inventory_labels alter column ledger_id set not null;

  -- ---- store_policies: back to per-ledger ----
  alter table store_policies add column if not exists ledger_id uuid references ledgers(id) on delete cascade;
  update store_policies set ledger_id = v_household_id where ledger_id is null;
  alter table store_policies alter column ledger_id set not null;

  -- ---- household_settings: singleton -> one row per household ledger ----
  -- Guarded on the singleton `id` column still existing, so pasting this
  -- migration twice after a full success doesn't error trying to select a
  -- column ("id") the first run already renamed away.
  if exists (select 1 from information_schema.columns where table_name = 'household_settings' and column_name = 'id') then
    create table if not exists household_settings_new (
      ledger_id   uuid primary key references ledgers(id) on delete cascade,
      postal_code text
    );
    insert into household_settings_new (ledger_id, postal_code)
      select v_household_id, postal_code from household_settings where id = 1
      on conflict (ledger_id) do nothing;
  end if;

  -- ---- grocery_lists: new table, one shared list seeded for the household ----
  create table if not exists grocery_lists (
    id         uuid primary key default gen_random_uuid(),
    name       text not null default '', -- unused by v1 UI; room for a future rename feature
    owner_id   uuid references auth.users(id) on delete cascade,
    ledger_id  uuid references ledgers(id) on delete cascade,
    created_at timestamptz not null default now(),
    check ((owner_id is not null and ledger_id is null) or (owner_id is null and ledger_id is not null))
  );
  -- "Exactly one shared list per household, one private list per person" is
  -- enforced here, not just assumed client-side -- it also closes a genuine
  -- race between two devices opening Smart Grocery for the same household
  -- for the first time simultaneously. Both indexes are also the entire cost
  -- of lifting that limit later for a real "+ New list" feature.
  create unique index if not exists uq_grocery_lists_one_shared on grocery_lists (ledger_id) where ledger_id is not null;
  create unique index if not exists uq_grocery_lists_one_private on grocery_lists (owner_id) where owner_id is not null;

  insert into grocery_lists (ledger_id) values (v_household_id)
  on conflict (ledger_id) where ledger_id is not null do nothing;

  -- ---- grocery_list: point every existing row at that one shared list ----
  alter table grocery_list add column if not exists list_id uuid references grocery_lists(id) on delete cascade;
  update grocery_list set list_id = (select id from grocery_lists where ledger_id = v_household_id)
    where list_id is null;
  alter table grocery_list alter column list_id set not null;

  -- ---- notifications: inventory-expiry rows regain a real ledger_id ----
  update notifications set ledger_id = v_household_id
    where ledger_id is null and inventory_item_id is not null;
  alter table notifications alter column ledger_id set not null;
end $$;

-- Swap household_settings for its re-keyed replacement. Guarded on
-- household_settings_new actually existing, so a second paste (which finds
-- nothing to create above, since the singleton `id` column is already gone)
-- does not drop the already-correctly-migrated table.
do $$ begin
  if to_regclass('household_settings_new') is not null then
    drop table if exists household_settings cascade;
    alter table household_settings_new rename to household_settings;
  end if;
end $$;

-- ---- unique constraints: back to ledger-scoped ----
alter table inventory_items drop constraint if exists inventory_items_name_key;
alter table inventory_items drop constraint if exists inventory_items_ledger_id_name_key;
alter table inventory_items add constraint inventory_items_ledger_id_name_key unique (ledger_id, name);
create index if not exists idx_inventory_ledger on inventory_items (ledger_id);

alter table inventory_labels drop constraint if exists inventory_labels_kind_name_key;
alter table inventory_labels drop constraint if exists inventory_labels_ledger_id_kind_name_key;
alter table inventory_labels add constraint inventory_labels_ledger_id_kind_name_key unique (ledger_id, kind, name);
create index if not exists idx_inventory_labels_ledger on inventory_labels (ledger_id, kind);

alter table store_policies drop constraint if exists store_policies_merchant_key;
alter table store_policies drop constraint if exists store_policies_ledger_id_merchant_key;
alter table store_policies add constraint store_policies_ledger_id_merchant_key unique (ledger_id, merchant);
create index if not exists idx_store_policies_local on store_policies (ledger_id, is_local);

-- "One local store" reverts from a true app-wide singleton to per-ledger
-- (migration 036's original shape) -- each household ledger gets its own.
drop index if exists uq_store_policies_one_local;
create unique index if not exists uq_store_policies_one_local on store_policies (ledger_id) where is_local;

create index if not exists idx_grocery_list_list on grocery_list (list_id);

-- ---- RLS: is_household_member() -> has_ledger_role() everywhere ----

drop policy if exists rw_inventory_items on inventory_items;
create policy sel_inventory_items on inventory_items for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_inventory_items on inventory_items for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_inventory_items on inventory_items for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_inventory_items on inventory_items for delete using (has_ledger_role(ledger_id,'EDITOR'));

drop policy if exists rw_inventory_labels on inventory_labels;
create policy sel_inventory_labels on inventory_labels for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_inventory_labels on inventory_labels for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_inventory_labels on inventory_labels for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_inventory_labels on inventory_labels for delete using (has_ledger_role(ledger_id,'EDITOR'));

drop policy if exists rw_store_policies on store_policies;
create policy sel_store_policies on store_policies for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_store_policies on store_policies for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_store_policies on store_policies for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_store_policies on store_policies for delete using (has_ledger_role(ledger_id,'EDITOR'));

drop policy if exists sel_household_settings on household_settings;
drop policy if exists ins_household_settings on household_settings;
drop policy if exists upd_household_settings on household_settings;
create policy sel_household_settings on household_settings for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_household_settings on household_settings for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_household_settings on household_settings for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
alter table household_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'household_settings') then
    alter publication supabase_realtime add table household_settings;
  end if;
end $$;

-- Resolves a grocery list's own access rule in one place -- shared lists defer
-- to the household ledger's role, private lists defer to ownership -- so
-- grocery_list's four policies don't each duplicate the branch.
create or replace function grocery_list_role_ok(p_list uuid, min_role ledger_role_kind default 'VIEWER')
returns boolean language sql security definer stable as $$
  select case
    when gl.owner_id is not null then gl.owner_id = auth.uid()
    else has_ledger_role(gl.ledger_id, min_role)
  end
  from grocery_lists gl where gl.id = p_list;
$$;

alter table grocery_lists enable row level security;
drop policy if exists sel_grocery_lists on grocery_lists;
drop policy if exists ins_grocery_lists on grocery_lists;
drop policy if exists upd_grocery_lists on grocery_lists;
drop policy if exists del_grocery_lists on grocery_lists;
create policy sel_grocery_lists on grocery_lists for select using (
  (ledger_id is not null and has_ledger_role(ledger_id,'VIEWER')) or owner_id = auth.uid());
create policy ins_grocery_lists on grocery_lists for insert with check (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR') and owner_id is null)
  or (owner_id = auth.uid() and ledger_id is null));
create policy upd_grocery_lists on grocery_lists for update using (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR')) or owner_id = auth.uid())
  with check ((ledger_id is not null and has_ledger_role(ledger_id,'EDITOR')) or owner_id = auth.uid());
create policy del_grocery_lists on grocery_lists for delete using (
  (ledger_id is not null and has_ledger_role(ledger_id,'EDITOR')) or owner_id = auth.uid());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'grocery_lists') then
    alter publication supabase_realtime add table grocery_lists;
  end if;
end $$;

drop policy if exists rw_grocery_list on grocery_list;
create policy sel_grocery_list on grocery_list for select using (grocery_list_role_ok(list_id,'VIEWER'));
create policy ins_grocery_list on grocery_list for insert with check (grocery_list_role_ok(list_id,'EDITOR'));
create policy upd_grocery_list on grocery_list for update using (grocery_list_role_ok(list_id,'EDITOR')) with check (grocery_list_role_ok(list_id,'EDITOR'));
create policy del_grocery_list on grocery_list for delete using (grocery_list_role_ok(list_id,'EDITOR'));

-- ---- notifications: drop the null-ledger household-wide carve-out ----
drop policy if exists sel_notifications on notifications;
drop policy if exists ins_notifications on notifications;
drop policy if exists upd_notifications on notifications;
drop policy if exists del_notifications on notifications;
create policy sel_notifications on notifications for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_notifications on notifications for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_notifications on notifications for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_notifications on notifications for delete using (has_ledger_role(ledger_id,'EDITOR'));

-- Not touched: members / is_household_member() -- still the login allowlist
-- used by scan-receipt.js/scan-product.js/scan-statement.js, unrelated to
-- this. flyer_items -- region-keyed public cache, correctly ledger-agnostic
-- either way. ledgers.postal_code -- stays dropped (migration 042); postal
-- code lives in household_settings, just re-keyed to ledger_id here instead
-- of being resurrected on ledgers.
