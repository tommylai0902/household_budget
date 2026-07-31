-- 034: web push, so a reminder reaches you without opening the app.
--
-- Reminders were only ever generated when somebody opened a ledger, and only
-- ever shown in the bell — both of which require you to already be looking.
-- api/send-reminders.js closes that: a daily cron generates the rows itself
-- (service role, every ledger) and pushes whatever is due to the phones that
-- asked for it.

-- One row per browser/device per user. The endpoint IS the identity of a
-- push subscription, so it's the natural key: re-subscribing on the same
-- device returns the same endpoint and should update, not duplicate.
--
-- p256dh/auth are the subscription's own public encryption keys, handed over
-- by the browser. They are not credentials for anything else — they only let
-- our server encrypt a payload that this one subscription can open — but they
-- still belong to that user alone, hence the self-only RLS below.
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  -- Which language to write the push in. Language is a per-device setting in
  -- this app (localStorage, not a profile column), and the push is per-device
  -- too, so the subscription is exactly the right place to keep it: Tommy's
  -- phone can be English while Wing's is 繁中 on the same ledger.
  lang       text not null default 'en',
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Self-only, all four verbs. Unlike every other table here this is not
-- ledger-scoped — a subscription belongs to a person, not a book.
drop policy if exists push_subscriptions_self on push_subscriptions;
create policy push_subscriptions_self on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- "Have I already pushed this one?" Distinct from `read`: read means the human
-- dismissed it in the bell, pushed_at means the phone was told. Without this a
-- daily cron would re-push the same expiring milk every morning until the item
-- is deleted.
alter table notifications add column if not exists pushed_at timestamptz;
