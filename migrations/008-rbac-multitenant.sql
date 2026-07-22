-- ============================================================
--  008 — Multi-tenant ledger RBAC (auth + OWNER/EDITOR/VIEWER + invites)
--  Standalone subsystem. `ledger_role` is the access-control table from the
--  spec's "LedgerMember"; it is intentionally NOT the existing `ledger_members`
--  (that table models bill-split participants, a different concept).
-- ============================================================

create extension if not exists "pgcrypto";

-- ---- User (mirrors auth.users; name/email live here for app queries) ----
create table if not exists app_user (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  name       text,
  created_at timestamptz not null default now()
);

-- ---- Ledger (every ledger has exactly one primary owner) ----
create table if not exists ledger (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_owner on ledger (owner_id);

create type ledger_role_kind as enum ('OWNER', 'EDITOR', 'VIEWER');

-- ---- LedgerMember: which users may access which ledger, and at what role ----
create table if not exists ledger_role (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledger(id) on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  role       ledger_role_kind not null,
  created_at timestamptz not null default now(),
  unique (ledger_id, user_id)          -- one role per user per ledger
);
create index if not exists idx_ledger_role_user on ledger_role (user_id);
create index if not exists idx_ledger_role_ledger on ledger_role (ledger_id);

-- ---- Entry (ledger-scoped financial rows) ----
create table if not exists entry (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references ledger(id) on delete cascade,
  amount     numeric(12,2) not null,
  category   text,
  created_by uuid not null references app_user(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists idx_entry_ledger on entry (ledger_id, created_at desc);

-- ---- Invite: token-based, role-scoped, single-use, expiring ----
create table if not exists ledger_invite (
  id          uuid primary key default gen_random_uuid(),
  ledger_id   uuid not null references ledger(id) on delete cascade,
  role        ledger_role_kind not null check (role in ('EDITOR','VIEWER')), -- never invite as OWNER
  email       text,                       -- null = open link; set = email-locked invite
  token_hash  text not null unique,       -- store only the hash; raw token is shown once
  created_by  uuid not null references app_user(id) on delete cascade,
  expires_at  timestamptz not null,
  accepted_at timestamptz,                -- non-null => consumed, cannot be reused
  accepted_by uuid references app_user(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_invite_ledger on ledger_invite (ledger_id);

-- ============================================================
--  Authorization helpers (SECURITY DEFINER: bypass RLS to read ledger_role
--  without recursive policy evaluation; STABLE for planner caching)
-- ============================================================

-- Numeric rank so a single ">= min" check expresses the role hierarchy.
create or replace function role_rank(r ledger_role_kind) returns int as $$
  select case r when 'OWNER' then 3 when 'EDITOR' then 2 when 'VIEWER' then 1 end;
$$ language sql immutable;

-- Highest role the current user holds on a ledger (owner is implicitly OWNER,
-- even without a ledger_role row). NULL => no access at all.
create or replace function my_role(p_ledger uuid) returns ledger_role_kind as $$
  select case
    when exists (select 1 from ledger l where l.id = p_ledger and l.owner_id = auth.uid())
      then 'OWNER'::ledger_role_kind
    else (select role from ledger_role
          where ledger_id = p_ledger and user_id = auth.uid())
  end;
$$ language sql security definer stable;

-- Core gate: does the caller hold at least `min_role` on this ledger?
create or replace function has_ledger_role(p_ledger uuid, min_role ledger_role_kind)
returns boolean as $$
  select coalesce(role_rank(my_role(p_ledger)) >= role_rank(min_role), false);
$$ language sql security definer stable;

-- ============================================================
--  Row Level Security
-- ============================================================
alter table app_user      enable row level security;
alter table ledger        enable row level security;
alter table ledger_role   enable row level security;
alter table entry         enable row level security;
alter table ledger_invite enable row level security;

-- app_user: a user sees/edits only their own profile row.
drop policy if exists app_user_self on app_user;
create policy app_user_self on app_user
  for all using (id = auth.uid()) with check (id = auth.uid());

-- ledger: visible only if you own it or hold any role (strict isolation by default).
drop policy if exists ledger_select on ledger;
create policy ledger_select on ledger for select
  using (has_ledger_role(id, 'VIEWER'));

-- Only the owner may rename/delete; owner_id is pinned to the creator on insert.
drop policy if exists ledger_insert on ledger;
create policy ledger_insert on ledger for insert
  with check (owner_id = auth.uid());
drop policy if exists ledger_modify on ledger;
create policy ledger_modify on ledger for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ledger_delete on ledger;
create policy ledger_delete on ledger for delete
  using (owner_id = auth.uid());

-- ledger_role: members can see the roster of ledgers they belong to.
drop policy if exists ledger_role_select on ledger_role;
create policy ledger_role_select on ledger_role for select
  using (has_ledger_role(ledger_id, 'VIEWER'));
-- Only an OWNER may grant/revoke/change roles. Accepting an invite bypasses this
-- via the SECURITY DEFINER accept_invite() function below, not via direct insert.
drop policy if exists ledger_role_manage on ledger_role;
create policy ledger_role_manage on ledger_role for all
  using (has_ledger_role(ledger_id, 'OWNER'))
  with check (has_ledger_role(ledger_id, 'OWNER'));

-- entry: VIEWER+ can read; EDITOR+ can write. Writer stamped as the caller.
drop policy if exists entry_select on entry;
create policy entry_select on entry for select
  using (has_ledger_role(ledger_id, 'VIEWER'));
drop policy if exists entry_insert on entry;
create policy entry_insert on entry for insert
  with check (has_ledger_role(ledger_id, 'EDITOR') and created_by = auth.uid());
drop policy if exists entry_update on entry;
create policy entry_update on entry for update
  using (has_ledger_role(ledger_id, 'EDITOR'))
  with check (has_ledger_role(ledger_id, 'EDITOR'));
drop policy if exists entry_delete on entry;
create policy entry_delete on entry for delete
  using (has_ledger_role(ledger_id, 'EDITOR'));

-- ledger_invite: only owners can create/list/revoke invites for their ledger.
-- Rows are never selectable by invitees (they redeem via token, not by reading).
drop policy if exists invite_owner on ledger_invite;
create policy invite_owner on ledger_invite for all
  using (has_ledger_role(ledger_id, 'OWNER'))
  with check (has_ledger_role(ledger_id, 'OWNER') and created_by = auth.uid());

-- ============================================================
--  Accept-invite RPC — the only sanctioned path to gain a role.
--  SECURITY DEFINER so it can insert a ledger_role row the caller could not
--  insert themselves; all validation is inside so it cannot be abused.
-- ============================================================
create or replace function accept_invite(p_token text)
returns uuid as $$
declare
  v_hash   text := encode(digest(p_token, 'sha256'), 'hex');
  v_invite ledger_invite%rowtype;
  v_email  text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Lock the row so two concurrent redemptions can't both consume a single-use invite.
  select * into v_invite from ledger_invite
    where token_hash = v_hash for update;

  if not found then raise exception 'invalid invite'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at < now() then raise exception 'invite expired'; end if;

  -- Email-locked invites may only be redeemed by the matching account.
  if v_invite.email is not null then
    select email into v_email from app_user where id = auth.uid();
    if lower(v_email) <> lower(v_invite.email) then
      raise exception 'invite is for a different email';
    end if;
  end if;

  -- Grant the role (idempotent: re-accepting keeps the higher of the two roles is
  -- out of scope; here we simply do not downgrade an existing higher role).
  insert into ledger_role (ledger_id, user_id, role)
    values (v_invite.ledger_id, auth.uid(), v_invite.role)
    on conflict (ledger_id, user_id) do update
      set role = excluded.role
      where role_rank(excluded.role) > role_rank(ledger_role.role);

  update ledger_invite
    set accepted_at = now(), accepted_by = auth.uid()
    where id = v_invite.id;

  return v_invite.ledger_id;
end;
$$ language plpgsql security definer;

-- Keep app_user in sync when an auth user is created (sign-up).
create or replace function handle_new_user() returns trigger as $$
begin
  insert into app_user (id, email, name)
    values (new.id, new.email, new.raw_user_meta_data->>'name')
    on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;
drop trigger if exists trg_new_user on auth.users;
create trigger trg_new_user after insert on auth.users
  for each row execute function handle_new_user();
