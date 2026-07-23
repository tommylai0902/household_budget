-- ============================================================
--  011 — ledger_roster: read the full access list (owner + every ledger_role
--  row) for the combined "Manage members" panel, including each person's
--  name/email. Needed because app_user's RLS is self-only (id = auth.uid()),
--  so the client can't join ledger_role -> app_user for anyone but itself.
--
--  Role changes and removal need no new RPC: ledger_role_manage (008) already
--  lets the owner update/delete rows directly via the normal REST client.
-- ============================================================

-- SECURITY DEFINER to read across app_user rows; gated by has_ledger_role so it
-- only ever discloses people who already share this ledger with the caller.
-- The owner is unioned in from ledgers.owner_id rather than relying on their
-- ledger_role row existing — new ledgers (created after 009) don't get one.
create or replace function ledger_roster(p_ledger uuid)
returns table (user_id uuid, email text, name text, role ledger_role_kind, is_owner boolean) as $$
  -- ORDER BY on a UNION ALL can only see the first branch's column names, so
  -- every expression here (including the literals) needs an explicit alias —
  -- otherwise `true`/the enum cast come out nameless and "is_owner" doesn't exist.
  select u.id as user_id, u.email as email, u.name as name,
    'OWNER'::ledger_role_kind as role, true as is_owner
  from ledgers l join app_user u on u.id = l.owner_id
  where l.id = p_ledger and has_ledger_role(p_ledger, 'VIEWER')
  union all
  select u.id as user_id, u.email as email, u.name as name, r.role as role, false as is_owner
  from ledger_role r
  join ledgers l on l.id = r.ledger_id
  join app_user u on u.id = r.user_id
  where r.ledger_id = p_ledger and r.user_id <> l.owner_id and has_ledger_role(p_ledger, 'VIEWER')
  order by is_owner desc, name nulls last, email;
$$ language sql security definer stable;
