-- Ledger-level currency. Travel ledgers can be set (via the rename panel) to
-- a foreign ISO code so scanned receipt totals are stored and shown exactly
-- as printed, with no FX conversion. One currency per ledger, not per
-- expense — expenses table is untouched.
alter table ledgers add column if not exists currency text not null default 'CAD';
alter table ledgers drop constraint if exists ledgers_currency_check;
alter table ledgers add constraint ledgers_currency_check check (currency ~ '^[A-Z]{3}$');
