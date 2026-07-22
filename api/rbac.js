import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// Core RBAC API. One Vercel function, routed by ?action=. Every privileged
// action runs as the CALLER (anon key + their bearer token) so Postgres RLS —
// not this code — is the source of truth for authorization. The service_role
// key is used ONLY where a row must be read past RLS by token (invite lookup).

const { VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE: SERVICE } = process.env;

// Client acting AS the signed-in caller; RLS applies to every statement.
const asUser = (token) =>
  createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });

// Elevated client. Never exposed to the browser; used only server-side and only
// for the narrow invite-token lookup that RLS deliberately blocks for invitees.
const asService = () => createClient(URL, SERVICE);

async function readBody(req) {
  if (req.body) return req.body;
  let raw = ""; for await (const c of req) raw += c; return JSON.parse(raw || "{}");
}

// Resolve + verify the caller from their bearer token. 401 if not a valid session.
async function requireUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return { error: "not signed in" };
  const supa = asUser(token);
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return { error: "invalid session" };
  return { supa, user, token };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { action } = req.query;
  const body = await readBody(req);

  try {
    // ---- Sign-Up: creates the auth user; app_user is mirrored by the DB trigger.
    if (action === "signup") {
      const { email, password, name } = body;
      if (!email || !password) return res.status(400).json({ error: "email + password required" });
      const supa = createClient(URL, ANON);
      const { data, error } = await supa.auth.signUp({
        email, password, options: { data: { name } },
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ userId: data.user?.id });
    }

    // Every action below requires an authenticated caller.
    const auth = await requireUser(req);
    if (auth.error) return res.status(401).json({ error: auth.error });
    const { supa, user } = auth;

    // ---- Create Ledger: RLS pins owner_id = caller; also seed the OWNER role row.
    if (action === "create-ledger") {
      const { name } = body;
      if (!name?.trim()) return res.status(400).json({ error: "name required" });
      const { data: ledger, error } = await supa
        .from("ledger").insert({ name: name.trim(), owner_id: user.id }).select().single();
      if (error) return res.status(403).json({ error: error.message });
      // Owner is implicitly OWNER via my_role(), but a concrete row keeps the
      // roster listing complete. Insert passes RLS because caller owns the ledger.
      await supa.from("ledger_role").insert({ ledger_id: ledger.id, user_id: user.id, role: "OWNER" });
      return res.status(200).json({ ledger });
    }

    // ---- Invite User: OWNER-only (enforced by RLS on ledger_invite insert).
    // Raw token is returned ONCE; only its SHA-256 hash is persisted.
    if (action === "invite") {
      const { ledgerId, role, email, ttlHours = 168 } = body;
      if (!["EDITOR", "VIEWER"].includes(role)) return res.status(400).json({ error: "role must be EDITOR|VIEWER" });
      const token = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
      const { error } = await supa.from("ledger_invite").insert({
        ledger_id: ledgerId, role, email: email || null,
        token_hash: tokenHash, created_by: user.id, expires_at: expiresAt,
      });
      if (error) return res.status(403).json({ error: error.message }); // RLS rejects non-owners
      const link = `${process.env.APP_ORIGIN || ""}/invite?token=${token}`;
      // Email delivery is out of scope here; return the link for the owner to send.
      return res.status(200).json({ link, token, expiresAt });
    }

    // ---- Accept Invite: delegates all validation to the SECURITY DEFINER RPC.
    // Service client is used solely so the RPC can read the token-matched invite
    // row (invitees have no SELECT on ledger_invite); the RPC re-checks auth.uid().
    if (action === "accept") {
      const { token } = body;
      if (!token) return res.status(400).json({ error: "token required" });
      // Call the RPC as the caller so auth.uid() inside it is the invitee.
      const { data: ledgerId, error } = await supa.rpc("accept_invite", { p_token: token });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ledgerId });
    }

    // ---- Check Permission: does caller hold >= required role on the ledger?
    if (action === "check") {
      const { ledgerId, role = "VIEWER" } = body;
      const { data, error } = await supa.rpc("has_ledger_role", { p_ledger: ledgerId, min_role: role });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ allowed: data === true });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
