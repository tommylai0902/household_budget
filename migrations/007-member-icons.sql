-- ============================================================
--  Let each bill-splitting member choose a small identifying icon.
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run; existing members use the default person icon.
-- ============================================================

alter table ledger_members add column if not exists icon text not null default 'user';

alter table ledger_members drop constraint if exists ledger_members_icon_check;
alter table ledger_members add constraint ledger_members_icon_check
  check (icon in ('user', 'people', 'home', 'plane', 'book', 'tag'));
