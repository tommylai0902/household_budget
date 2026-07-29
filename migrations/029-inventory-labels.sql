-- 029: managed categories and storage locations for inventory items.
--
-- One table for both, separated by `kind`. They are the same thing structurally
-- -- a per-ledger list of names you tag items with -- so two tables would mean
-- duplicating the schema, the RLS policies and the CRUD for no gain. Add a
-- third kind later by widening the check constraint.
--
-- inventory_items.category was already live, NOT a dead column: ticking "Track
-- this purchase in your inventory" on an expense copies the expense's category
-- NAME into it. Those values are migrated into labels below before the text
-- column is dropped, so nothing is lost.

create table if not exists inventory_labels (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledgers(id) on delete cascade,
  kind       text not null check (kind in ('category', 'location')),
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (ledger_id, kind, name)
);
create index if not exists idx_inventory_labels_ledger on inventory_labels (ledger_id, kind);

-- on delete set null: deleting a label unfiles its items rather than deleting
-- them. Losing the shelf is not losing the milk.
alter table inventory_items add column if not exists category_id uuid references inventory_labels(id) on delete set null;
alter table inventory_items add column if not exists location_id uuid references inventory_labels(id) on delete set null;

-- Carry the existing free-text categories over before dropping the column.
insert into inventory_labels (ledger_id, kind, name)
select distinct ledger_id, 'category', btrim(category)
from inventory_items
where category is not null and btrim(category) <> ''
on conflict (ledger_id, kind, name) do nothing;

update inventory_items i
set category_id = l.id
from inventory_labels l
where l.ledger_id = i.ledger_id and l.kind = 'category' and l.name = btrim(i.category)
  and i.category is not null and btrim(i.category) <> '';

alter table inventory_items drop column if exists category;

alter table inventory_labels enable row level security;
create policy sel_inventory_labels on inventory_labels for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ins_inventory_labels on inventory_labels for insert with check (has_ledger_role(ledger_id,'EDITOR'));
create policy upd_inventory_labels on inventory_labels for update using (has_ledger_role(ledger_id,'EDITOR')) with check (has_ledger_role(ledger_id,'EDITOR'));
create policy del_inventory_labels on inventory_labels for delete using (has_ledger_role(ledger_id,'EDITOR'));

alter publication supabase_realtime add table inventory_labels;
