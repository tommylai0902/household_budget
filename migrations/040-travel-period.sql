-- 040: a travel ledger can set a fixed trip period instead of running on
-- the monthly cycle every other ledger uses.
--
-- Nullable, opt-in per ledger -- a travel ledger with neither set keeps
-- behaving exactly as it does today (monthly, like household/personal).
-- When both are set, the app stops month-scoping that ledger entirely
-- (transaction list, budget, Report, Settlement, Home banner all become
-- whole-ledger) rather than filtering expenses to the date range -- see
-- BudgetApp.jsx's isPeriodLedger.

alter table ledgers add column if not exists start_date date;
alter table ledgers add column if not exists end_date date;
