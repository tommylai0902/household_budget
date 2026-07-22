-- ============================================================
--  010 — preview_invite: read an invite's ledger name + role without consuming it,
--  so the invitee gets a real confirmation screen ("Join <ledger> as <role>?")
--  instead of being auto-joined. Read-only; accept_invite still does the granting.
-- ============================================================

-- SECURITY DEFINER so it can look up the invite + ledger name that RLS otherwise
-- hides from the invitee. It only ever reveals the name of a ledger the caller
-- already holds a valid token for, and never mutates anything.
create or replace function preview_invite(p_token text) returns jsonb as $$
declare
  v_hash   text := encode(digest(p_token, 'sha256'), 'hex');
  v_invite ledger_invite%rowtype;
  v_name   text;
begin
  select * into v_invite from ledger_invite where token_hash = v_hash;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  select name into v_name from ledgers where id = v_invite.ledger_id;

  if v_invite.accepted_at is not null then
    return jsonb_build_object('status', 'used', 'ledgerName', v_name, 'role', v_invite.role);
  end if;
  if v_invite.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'ledgerName', v_name, 'role', v_invite.role);
  end if;
  return jsonb_build_object('status', 'ok', 'ledgerName', v_name, 'role', v_invite.role, 'ledgerId', v_invite.ledger_id);
end;
$$ language plpgsql security definer stable;
