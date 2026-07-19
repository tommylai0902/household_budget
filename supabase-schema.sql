-- ============================================================
--  Household Budget — Supabase schema (Step 2: shared ledger)
--  Run this in the Supabase dashboard → SQL Editor → New query.
--  Then follow STEP2-SETUP.md to add you + Wing to `members`.
-- ============================================================

create extension if not exists "pgcrypto";

-- Allowlist: only auth users listed here can touch the ledger.
-- (Two rows: you and Wing. Filled in after you create the accounts.)
create table if not exists members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label   text                                    -- 'tommy' | 'wing' (optional)
);

-- One row per ledger: Household, Personal, Travel, …
-- Categories, expenses and budgets all belong to exactly one ledger.
create table if not exists ledgers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id             uuid primary key default gen_random_uuid(),
  ledger_id      uuid not null references ledgers(id) on delete cascade,
  name           text not null,
  name_zh        text,
  color          text not null default '#64748B',
  monthly_budget numeric(10,2),
  sort_order     int  not null default 0,
  created_at     timestamptz not null default now(),
  unique (ledger_id, name)          -- Household and Travel may each have a 'Food'
);

create table if not exists expenses (
  id               uuid primary key default gen_random_uuid(),
  ledger_id        uuid not null references ledgers(id) on delete cascade,
  description      text not null,
  amount           numeric(10,2) not null check (amount >= 0),
  category_id      uuid references categories(id) on delete set null,
  transaction_date date not null default current_date,
  note             text,
  paid_by          text not null check (paid_by in ('tommy','wing')),
  split_type       text not null default 'personal'
                     check (split_type in ('personal','shared_50')),
  receipt_url      text,                            -- Step 4
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_expenses_date     on expenses (transaction_date desc);
create index if not exists idx_expenses_category on expenses (category_id);

create table if not exists budgets (                -- Step 3
  id          uuid primary key default gen_random_uuid(),
  ledger_id   uuid not null references ledgers(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  month       date not null,
  amount      numeric(10,2) not null check (amount >= 0),
  unique (category_id, month)
);

-- keep updated_at honest
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_expenses_touch on expenses;
create trigger trg_expenses_touch before update on expenses
  for each row execute function touch_updated_at();

-- ---------------- Row Level Security ----------------
alter table members    enable row level security;
alter table ledgers    enable row level security;
alter table categories enable row level security;
alter table expenses   enable row level security;
alter table budgets    enable row level security;

-- security definer avoids RLS recursion when checking membership
create or replace function is_member() returns boolean as $$
  select exists (select 1 from members m where m.user_id = auth.uid());
$$ language sql security definer stable;

drop policy if exists members_self on members;
create policy members_self on members for select using (user_id = auth.uid());

-- any household member can read + write the ledger tables
do $$
declare tbl text;
begin
  foreach tbl in array array['ledgers','categories','expenses','budgets'] loop
    execute format('drop policy if exists rw_%1$s on %1$s;', tbl);
    execute format(
      'create policy rw_%1$s on %1$s for all using (is_member()) with check (is_member());', tbl);
  end loop;
end $$;

-- ---------------- Realtime ----------------
-- (If this errors with "already member of publication", it's already on — ignore.)
alter publication supabase_realtime add table expenses, categories, budgets, ledgers;
