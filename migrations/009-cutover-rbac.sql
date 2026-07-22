-- ============================================================
--  009 — Cut over from the `members` allowlist to per-ledger RBAC.
--  Retrofits owner + roles + invites onto the REAL tables (ledgers, categories,
--  expenses, budgets, merchants, ledger_members, expense_splits, expense_items)
--  and replaces the global is_member() policies. Drops the standalone ledger/
--  entry tables from 008 (the app never used them).
--
--  ⚠️ DESTRUCTIVE: rewrites production RLS. Run inside the transaction below so it
--  applies atomically. Deploy the matching app code (createLedger sets owner_id)
--  right after — old code cannot create ledgers once owner_id is NOT NULL.
--
--  Backfill target: ALL existing ledgers -> Wing as OWNER; every other current
--  `members` user -> EDITOR. Change OWNER_EMAIL below if that is wrong.
-- ============================================================

begin;

create extension if not exists "pgcrypto";

-- 1) Mirror every existing auth user into app_user (008's trigger only covers
--    sign-ups made after it was installed).
insert into app_user (id, email, name)
  select id, email, coalesce(raw_user_meta_data->>'name', email)
  from auth.users
  on conflict (id) do nothing;

-- 2) Remove 008's standalone parallel schema (the app stores data in the real
--    ledgers/expenses tables, not these).
drop table if exists entry cascade;
drop table if exists ledger_invite cascade;
drop table if exists ledger_role cascade;
drop table if exists ledger cascade;

-- 3) Ownership column on the real ledgers table.
alter table ledgers add column if not exists owner_id uuid references auth.users(id) on delete restrict;

-- 4) RBAC roster (the spec's "LedgerMember"), pointed at the real ledgers table.
create table ledger_role (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledgers(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       ledger_role_kind not null,
  created_at timestamptz not null default now(),
  unique (ledger_id, user_id)                    -- one role per user per ledger
);
create index idx_ledger_role_user   on ledger_role (user_id);
create index idx_ledger_role_ledger on ledger_role (ledger_id);

-- 5) Backfill ownership + roles.
do $$
declare
  OWNER_EMAIL constant text := 'wingchan0380@gmail.com';
  v_owner uuid;
begin
  select id into v_owner from auth.users where lower(email) = lower(OWNER_EMAIL);
  if v_owner is null then raise exception 'owner email % not found in auth.users', OWNER_EMAIL; end if;

  update ledgers set owner_id = v_owner where owner_id is null;

  -- Owner row is optional (my_role() implies OWNER from owner_id) but keeps the
  -- roster complete for the invite UI later.
  insert into ledger_role (ledger_id, user_id, role)
    select id, v_owner, 'OWNER' from ledgers
    on conflict (ledger_id, user_id) do nothing;

  -- The old global allowlist becomes per-ledger EDITORs (everyone but the owner).
  insert into ledger_role (ledger_id, user_id, role)
    select l.id, m.user_id, 'EDITOR'
    from ledgers l join members m on m.user_id <> v_owner
    on conflict (ledger_id, user_id) do nothing;
end $$;

alter table ledgers alter column owner_id set not null;

-- 6) Authorization helpers, now reading the real ledgers table.
--    SECURITY DEFINER so policies can call them without recursive RLS on ledger_role.
create or replace function my_role(p_ledger uuid) returns ledger_role_kind as $$
  select case
    when exists (select 1 from ledgers l where l.id = p_ledger and l.owner_id = auth.uid())
      then 'OWNER'::ledger_role_kind
    else (select role from ledger_role where ledger_id = p_ledger and user_id = auth.uid())
  end;
$$ language sql security definer stable;

create or replace function has_ledger_role(p_ledger uuid, min_role ledger_role_kind)
returns boolean as $$
  select coalesce(role_rank(my_role(p_ledger)) >= role_rank(min_role), false);
$$ language sql security definer stable;

-- Resolve the ledger owning an expense, for the split/item child tables.
create or replace function expense_ledger(p_expense uuid) returns uuid as $$
  select ledger_id from expenses where id = p_expense;
$$ language sql security definer stable;

-- 7) Invites, repointed at the real ledgers table.
create table ledger_invite (
  id          uuid primary key default gen_random_uuid(),
  ledger_id   uuid not null references ledgers(id) on delete cascade,
  role        ledger_role_kind not null check (role in ('EDITOR','VIEWER')),  -- never invite as OWNER
  email       text,                        -- null = open link; set = email-locked
  token_hash  text not null unique,        -- only the hash is stored; raw token shown once
  created_by  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  accepted_at timestamptz,                 -- non-null => consumed, single-use
  accepted_by uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_invite_ledger on ledger_invite (ledger_id);

-- Only sanctioned path to gain a role. SECURITY DEFINER so it can insert a
-- ledger_role row the caller could not; every check is inside and re-verifies auth.uid().
create or replace function accept_invite(p_token text) returns uuid as $$
declare
  v_hash   text := encode(digest(p_token, 'sha256'), 'hex');
  v_invite ledger_invite%rowtype;
  v_email  text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- Row lock so two concurrent redemptions can't both consume a single-use invite.
  select * into v_invite from ledger_invite where token_hash = v_hash for update;

  if not found then raise exception 'invalid invite'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at < now() then raise exception 'invite expired'; end if;

  -- Email-locked invites redeemable only by the matching account.
  if v_invite.email is not null then
    select email into v_email from auth.users where id = auth.uid();
    if lower(v_email) <> lower(v_invite.email) then raise exception 'invite is for a different email'; end if;
  end if;

  insert into ledger_role (ledger_id, user_id, role)
    values (v_invite.ledger_id, auth.uid(), v_invite.role)
    on conflict (ledger_id, user_id) do update
      set role = excluded.role
      where role_rank(excluded.role) > role_rank(ledger_role.role);   -- never downgrade an existing higher role

  update ledger_invite set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;
  return v_invite.ledger_id;
end;
$$ language plpgsql security definer;

-- 8) RLS: drop the global is_member() policies, install per-ledger role checks.
alter table ledger_role   enable row level security;
alter table ledger_invite enable row level security;

do $$ declare tbl text; begin
  foreach tbl in array array['ledgers','ledger_members','merchants','categories','expenses','expense_splits','expense_items','budgets'] loop
    execute format('drop policy if exists rw_%1$s on %1$s;', tbl);
  end loop;
end $$;

-- ledgers: any role sees it; only the owner may create/rename/delete.
create policy ledger_select on ledgers for select using (has_ledger_role(id,'VIEWER'));
create policy ledger_insert on ledgers for insert with check (owner_id = auth.uid());
create policy ledger_update on ledgers for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ledger_delete on ledgers for delete using (owner_id = auth.uid());

-- roster + invites: owner-managed; members can read the roster of their ledgers.
create policy ledger_role_select on ledger_role for select using (has_ledger_role(ledger_id,'VIEWER'));
create policy ledger_role_manage on ledger_role for all
  using (has_ledger_role(ledger_id,'OWNER')) with check (has_ledger_role(ledger_id,'OWNER'));
create policy invite_owner on ledger_invite for all
  using (has_ledger_role(ledger_id,'OWNER'))
  with check (has_ledger_role(ledger_id,'OWNER') and created_by = auth.uid());

-- Ledger-scoped tables with a direct ledger_id: VIEWER reads, EDITOR writes.
do $$ declare tbl text; begin
  foreach tbl in array array['ledger_members','merchants','categories','expenses','budgets'] loop
    execute format('create policy sel_%1$s on %1$s for select using (has_ledger_role(ledger_id,''VIEWER''));', tbl);
    execute format('create policy ins_%1$s on %1$s for insert with check (has_ledger_role(ledger_id,''EDITOR''));', tbl);
    execute format('create policy upd_%1$s on %1$s for update using (has_ledger_role(ledger_id,''EDITOR'')) with check (has_ledger_role(ledger_id,''EDITOR''));', tbl);
    execute format('create policy del_%1$s on %1$s for delete using (has_ledger_role(ledger_id,''EDITOR''));', tbl);
  end loop;
end $$;

-- Child tables reached only via expense_id: gate through the parent's ledger.
create policy sel_expense_splits on expense_splits for select using (has_ledger_role(expense_ledger(expense_id),'VIEWER'));
create policy ins_expense_splits on expense_splits for insert with check (has_ledger_role(expense_ledger(expense_id),'EDITOR'));
create policy del_expense_splits on expense_splits for delete using (has_ledger_role(expense_ledger(expense_id),'EDITOR'));
create policy sel_expense_items  on expense_items  for select using (has_ledger_role(expense_ledger(expense_id),'VIEWER'));
create policy ins_expense_items  on expense_items  for insert with check (has_ledger_role(expense_ledger(expense_id),'EDITOR'));
create policy del_expense_items  on expense_items  for delete using (has_ledger_role(expense_ledger(expense_id),'EDITOR'));

-- 9) Realtime for the roster so role/access changes propagate to open clients.
alter publication supabase_realtime add table ledger_role;

commit;

-- Note: `members` + is_member() are left in place but unused; drop them in a
-- later cleanup once you've confirmed the cutover holds.
