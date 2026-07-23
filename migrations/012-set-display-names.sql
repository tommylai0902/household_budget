-- ============================================================
--  012 — One-off data fix: set real display names for the two accounts that
--  pre-date the invite feature. Migration 009's backfill set name = email for
--  any account with no signup-time name metadata, which is why the roster and
--  header profile card were showing the email twice.
-- ============================================================

update app_user set name = 'wchan0380' where email = 'wingchan0380@gmail.com';
update app_user set name = 'binzzzzz'  where email = 'tommylai19@gmail.com';
