-- ============================================================
--  Remember which template a ledger was made from, so the picker
--  can show a house / plane / people / book against each one.
--  Run once in the Supabase dashboard → SQL Editor → New query.
--  Safe to re-run: every step is guarded.
--
--  Purely additive. Existing ledgers default to 'household' and can
--  be changed from the picker's rename control.
-- ============================================================

alter table ledgers add column if not exists template text not null default 'household';

alter table ledgers drop constraint if exists ledgers_template_check;
alter table ledgers add  constraint ledgers_template_check
  check (template in ('household', 'travel', 'personal', 'blank'));
