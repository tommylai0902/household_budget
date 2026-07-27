-- 021: Inventory tracking + grocery list, with a shared Flipp deals cache.
--
-- inventory_items / grocery_list are ledger-scoped, same VIEWER/EDITOR RLS
-- shape as every other ledger table since migration 009. deals_cache is not
-- ledger-scoped -- it's just a cache of public flyer-price lookups keyed by
-- query+postal code, so it stays broadly readable/writable rather than
-- threading auth through the api/scan-deals.js proxy.

create table if not exists inventory_items (
  id          uuid primary key default gen_random_uuid(),
  ledger_id   uuid not null references ledgers(id) on delete cascade,
  name        text not null,
  quantity    numeric not null default 0,
  unit        text,
  min_quantity numeric,
  expiry_date date,
  category    text,
  created_at  timestamptz not null default now(),
  unique (ledger_id, name)
);
create index if not exists idx_inventory_ledger on inventory_items (ledger_id);

create table if not exists grocery_list (
  id                uuid primary key default gen_random_uuid(),
  ledger_id         uuid not null references ledgers(id) on delete cascade,
  item_name         text not null,
  quantity_needed   numeric not null default 1,
  is_completed      boolean not null default false,
  target_supermarket text,
  deal_price        numeric,
  created_at        timestamptz not null default now()
);
create index if not exists idx_grocery_ledger on grocery_list (ledger_id);

create table if not exists deals_cache (
  id          uuid primary key default gen_random_uuid(),
  query       text not null,
  postal_code text not null default '',
  results     jsonb not null,
  fetched_at  timestamptz not null default now(),
  unique (query, postal_code)
);

alter table inventory_items enable row level security;
create policy sel_inventory_items on inventory_items for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_inventory_items on inventory_items for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_inventory_items on inventory_items for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_inventory_items on inventory_items for delete using (has_ledger_role(ledger_id,'EDITOR'));

alter table grocery_list enable row level security;
create policy sel_grocery_list on grocery_list for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_grocery_list on grocery_list for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_grocery_list on grocery_list for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_grocery_list on grocery_list for delete using (has_ledger_role(ledger_id,'EDITOR'));

alter table deals_cache enable row level security;
create policy rw_deals_cache on deals_cache for all using (true) with check (true);

alter publication supabase_realtime add table inventory_items;
alter publication supabase_realtime add table grocery_list;
