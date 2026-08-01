-- 041: put a ledger away without destroying it.
--
-- A finished trip had only two options before this: sit in the picker
-- forever, or be deleted along with every expense in it. Archiving hides it
-- from every list in the app while keeping all its data intact, and it can be
-- restored from Settings -> Archived ledgers.
--
-- Archived is a property of the ledger, not of the person looking at it: when
-- one household member archives a ledger it goes away for everyone. That's
-- also what the existing RLS allows -- ledger_update (migration 009) is
-- owner_id = auth.uid(), so only the owner can flip this, same as rename and
-- delete. No policy change is needed here.
--
-- fetchLedgers() filters on this, which is what actually hides it everywhere
-- (picker, ledger switcher, notification routing, the cached last-opened
-- ledger). The nightly cron also skips archived ledgers' reminders, so an
-- archived ledger stops buzzing your phone -- see api/send-reminders.js.

alter table ledgers add column if not exists archived boolean not null default false;
