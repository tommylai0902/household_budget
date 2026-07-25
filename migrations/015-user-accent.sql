-- 015: remember each user's accent colour on their account, not just in the
-- browser. localStorage alone meant a new device/browser (or a cleared session)
-- reset the app to the default colour.
--
-- No CHECK against the palette: ACCENT_COLORS lives in BudgetApp.jsx and gets
-- edited there, and a stale hex is harmless — the client ignores any value not
-- in the current palette and falls back to the default.
-- Null = never picked; the client's default (ACCENT_COLORS[0], grey) applies.
alter table app_user add column if not exists accent text;

-- No policy work needed: app_user_self (migration 008) is already `for all`
-- using/with check (id = auth.uid()), so a user can update their own row.
