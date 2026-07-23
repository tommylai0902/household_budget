import { supabase } from "./supabase";

/* ---- mappers: DB (snake_case) <-> app (camelCase) ---- */
const toAppCategory = (r) => ({
  id: r.id, name: r.name, nameZh: r.name_zh || r.name, color: r.color, budget: r.monthly_budget,
});
const toRowCategory = (c, sortOrder) => ({
  name: c.name,
  // Category names are language-neutral, so both columns carry the same value.
  name_zh: c.nameZh || c.name,
  color: c.color,
  monthly_budget: c.budget ?? null,
  ...(sortOrder != null ? { sort_order: sortOrder } : {}),
});
const toAppExpense = (r) => ({
  id: r.id, description: r.description, amount: Number(r.amount), categoryId: r.category_id,
  date: r.transaction_date, note: r.note || "", paidById: r.paid_by_id,
  split: r.split_type === "shared_50" ? "shared" : "personal", receiptUrl: r.receipt_url || null,
  sharedWith: (r.expense_splits || []).map((s) => s.member_id),
  items: (r.expense_items || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({ name: i.name, amount: Number(i.amount) })),
});
const toRowExpense = (e) => ({
  description: e.description,
  amount: Number(e.amount),
  category_id: e.categoryId,
  transaction_date: e.date,
  note: e.note || null,
  paid_by_id: e.paidById,
  split_type: e.split === "shared" ? "shared_50" : "personal",
});
const toAppMember = (r) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon || "user" });
const toRowMember = (m, sortOrder) => ({
  name: m.name,
  color: m.color,
  icon: m.icon || "user",
  ...(sortOrder != null ? { sort_order: sortOrder } : {}),
});
const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);

/* ---- ledgers ---- */
export async function fetchLedgers() {
  const { data, error } = await supabase.from("ledgers").select("*").order("sort_order").order("created_at");
  if (error) throw error;
  return data.map((r) => ({ id: r.id, name: r.name, template: r.template || "household", ownerId: r.owner_id }));
}
// Seeds at creation time rather than lazily on first open, so the "blank"
// template stays blank instead of being backfilled with defaults.
export async function createLedger(name, template = "household") {
  // owner_id is required and RLS pins it to the caller; the creator becomes OWNER
  // (my_role() derives OWNER from owner_id). getSession reads the cached session.
  const { data: { session } } = await supabase.auth.getSession();
  const ownerId = session?.user?.id;
  if (!ownerId) throw new Error("not signed in");
  // Generate the id client-side and DON'T use .select(): the ledgers SELECT policy
  // checks ownership by re-querying ledgers, which can't see this row mid-INSERT, so
  // an INSERT..RETURNING (what .select() does) trips its own RLS and 403s even though
  // the plain insert is allowed. We already know the id, so no round-trip is needed.
  const id = crypto.randomUUID();
  const { error } = await supabase.from("ledgers").insert({ id, name, template, owner_id: ownerId });
  if (error) throw error;
  await Promise.all([seedCategories(id, template), seedMembers(id)]);
  return { id, name, template };
}
// Only touches the ledger row itself — changing the template here swaps the icon,
// it does not re-seed categories on a ledger already in use.
export async function updateLedger(id, fields) {
  const { error } = await supabase.from("ledgers").update(fields).eq("id", id);
  if (error) throw error;
}
// Categories and expenses cascade with the ledger (see schema), so this is a
// full teardown — the UI confirms before calling it.
export async function deleteLedger(id) {
  const { error } = await supabase.from("ledgers").delete().eq("id", id);
  if (error) throw error;
}

/* ---- invites (RBAC) ---- */
// A random secret goes in the link; only its SHA-256 hash is stored, so the DB
// never holds anything that can be replayed. crypto.subtle needs a secure context
// (https or localhost) — both the dev server and prod qualify.
const randomToken = () => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const sha256Hex = async (s) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
};

// Owner-only (RLS `invite_owner` rejects anyone else). The hash we store here must
// match the server's encode(digest(token,'sha256'),'hex') so accept_invite lines up.
export async function createInvite(ledgerId, role, email) {
  const token = randomToken();
  const token_hash = await sha256Hex(token);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("not signed in");
  const expires_at = new Date(Date.now() + 7 * 864e5).toISOString(); // 7 days
  const { error } = await supabase.from("ledger_invite").insert({
    ledger_id: ledgerId, role, email: email || null,
    token_hash, created_by: session.user.id, expires_at,
  });
  if (error) throw error;
  return `${window.location.origin}/?invite=${token}`;
}

// Full access roster (owner + every ledger_role row) with name/email, for the
// "Manage members" panel. A plain client join can't do this — app_user's RLS is
// self-only, so the RPC (SECURITY DEFINER, gated by has_ledger_role) does it server-side.
export async function fetchRoster(ledgerId) {
  const { data, error } = await supabase.rpc("ledger_roster", { p_ledger: ledgerId });
  if (error) throw error;
  return data.map((r) => ({ userId: r.user_id, email: r.email, name: r.name, role: r.role, isOwner: r.is_owner }));
}

// Both already covered by the ledger_role_manage RLS policy (owner-only), so a
// plain table update/delete works — no RPC needed. Never call these on the owner's
// own row: changing owner_id is what actually controls ownership, not this table.
export async function updateMemberRole(ledgerId, userId, role) {
  const { error } = await supabase.from("ledger_role").update({ role }).eq("ledger_id", ledgerId).eq("user_id", userId);
  if (error) throw error;
}
export async function removeMember(ledgerId, userId) {
  const { error } = await supabase.from("ledger_role").delete().eq("ledger_id", ledgerId).eq("user_id", userId);
  if (error) throw error;
}

// Invites nobody has redeemed yet, for the "Pending invite" rows in Manage
// members. The invite_owner RLS policy already scopes this to the ledger's
// owner reading their own ledger's invites — no RPC needed.
export async function fetchPendingInvites(ledgerId) {
  const { data, error } = await supabase
    .from("ledger_invite").select("id, email, role, expires_at")
    .eq("ledger_id", ledgerId).is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
export async function revokeInvite(inviteId) {
  const { error } = await supabase.from("ledger_invite").delete().eq("id", inviteId);
  if (error) throw error;
}

// Reads an invite's ledger name + role without consuming it, for the confirmation
// screen. Returns { status: 'ok'|'invalid'|'expired'|'used', ledgerName?, role? }.
export async function previewInvite(token) {
  const { data, error } = await supabase.rpc("preview_invite", { p_token: token });
  if (error) throw error;
  return data;
}

// Redeems a token via the SECURITY DEFINER RPC, which validates expiry / single-use
// / email-lock and grants the role. Returns the joined ledger id.
export async function acceptInvite(token) {
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) throw error;
  return data;
}

/* ---- ledger members ---- */
// Colours cycle for members added after the first two.
export const MEMBER_COLORS = ["#0E9384", "#EA580C", "#7C3AED", "#EC4899", "#0369A1", "#16A34A", "#D97706", "#64748B"];
const DEFAULT_MEMBERS = [{ name: "Tommy" }, { name: "Wing" }];

export async function fetchMembers(ledgerId) {
  const { data, error } = await supabase
    .from("ledger_members").select("*").eq("ledger_id", ledgerId).order("sort_order").order("created_at");
  if (error) throw error;
  return data.map(toAppMember);
}

export async function seedMembers(ledgerId) {
  const rows = DEFAULT_MEMBERS.map((m, i) => ({
    ...toRowMember({ ...m, color: MEMBER_COLORS[i] }, i),
    ledger_id: ledgerId,
  }));
  const { error } = await supabase
    .from("ledger_members").upsert(rows, { onConflict: "ledger_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

// Same diff-then-write shape as persistCategories. Removing a member who still
// has expenses is blocked by the FK (on delete restrict) — the UI surfaces that.
export async function persistMembers(newList, oldList, ledgerId) {
  const newIds = new Set(newList.map((m) => m.id));
  const toDelete = oldList.filter((m) => !newIds.has(m.id)).map((m) => m.id);
  if (toDelete.length) {
    const { error } = await supabase.from("ledger_members").delete().in("id", toDelete);
    if (error) throw error;
  }
  const toInsert = newList
    .filter((m) => !isUuid(m.id))
    .map((m, i) => ({ ...toRowMember(m, oldList.length + i), ledger_id: ledgerId }));
  if (toInsert.length) {
    const { error } = await supabase.from("ledger_members").insert(toInsert);
    if (error) throw error;
  }
  for (const m of newList.filter((m) => isUuid(m.id))) {
    const { error } = await supabase.from("ledger_members").update(toRowMember(m)).eq("id", m.id);
    if (error) throw error;
  }
  return fetchMembers(ledgerId);
}

/* ---- reads (always scoped to one ledger) ---- */
export async function fetchCategories(ledgerId) {
  const { data, error } = await supabase
    .from("categories").select("*").eq("ledger_id", ledgerId).order("sort_order");
  if (error) throw error;
  return data.map(toAppCategory);
}
export async function fetchExpenses(ledgerId) {
  // Embedded select pulls each expense's sharers in the same round trip.
  const { data, error } = await supabase
    .from("expenses").select("*, expense_splits(member_id), expense_items(name, amount, sort_order)")
    .eq("ledger_id", ledgerId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toAppExpense);
}

/* ---- expense writes ---- */
// Sharers live in their own table, so both writes replace the set wholesale
// rather than trying to diff it — an expense has a handful of them at most.
// Same replace-wholesale approach as splits — a receipt has a handful of lines.
async function writeItems(expenseId, e) {
  const { error: del } = await supabase.from("expense_items").delete().eq("expense_id", expenseId);
  if (del) throw del;
  const rows = (e.items || [])
    .filter((i) => i && i.name)
    .map((i, idx) => ({ expense_id: expenseId, name: i.name, amount: Number(i.amount) || 0, sort_order: idx }));
  if (!rows.length) return;
  const { error } = await supabase.from("expense_items").insert(rows);
  if (error) throw error;
}

async function writeSplits(expenseId, e) {
  const { error: del } = await supabase.from("expense_splits").delete().eq("expense_id", expenseId);
  if (del) throw del;
  const ids = e.split === "shared" ? [...new Set(e.sharedWith || [])] : [];
  if (!ids.length) return;
  const { error } = await supabase
    .from("expense_splits").insert(ids.map((member_id) => ({ expense_id: expenseId, member_id })));
  if (error) throw error;
}

export async function insertExpense(e, ledgerId) {
  const { data, error } = await supabase
    .from("expenses").insert({ ...toRowExpense(e), ledger_id: ledgerId }).select("id").single();
  if (error) throw error;
  await writeSplits(data.id, e);
  await writeItems(data.id, e);
}
// The personal half of a split receipt, landing in whichever ledger was chosen.
// That ledger has its own categories and members, so the category is left unset
// (it shows as Uncategorised, which is visible rather than a wrong guess) and the
// payer is matched by name, falling back to the first member.
export async function insertPersonalExpense(spec, payerName) {
  const members = await fetchMembers(spec.ledgerId);
  const payer = members.find((m) => m.name.toLowerCase() === (payerName || "").toLowerCase()) || members[0];
  if (!payer) throw new Error("that ledger has no members yet");
  const { data, error } = await supabase.from("expenses").insert({
    ledger_id: spec.ledgerId,
    description: spec.description,
    amount: Number(spec.amount),
    transaction_date: spec.date,
    note: spec.note || null,
    paid_by_id: payer.id,
    split_type: "personal",
    category_id: null,
  }).select("id").single();
  if (error) throw error;
  await writeItems(data.id, spec); // it keeps its own share of the breakdown
}

export async function updateExpense(id, e) {
  const { error } = await supabase.from("expenses").update(toRowExpense(e)).eq("id", id);
  if (error) throw error;
  await writeSplits(id, e);
  await writeItems(id, e);
}
export async function setExpenseCategory(id, categoryId) {
  const { error } = await supabase.from("expenses").update({ category_id: categoryId }).eq("id", id);
  if (error) throw error;
}
export async function deleteExpense(id) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

/* ---- category templates ----
   Starting categories for a new ledger. Labels for the picker live in the UI's
   STRINGS table; these are the category names themselves, which are
   language-neutral (see catName). */
export const TEMPLATES = {
  household: [
    { name: "Rent", color: "#475569" },
    { name: "Utilities", color: "#0E9384" },
    { name: "Household", color: "#EC4899" },
    { name: "Grocery", color: "#16A34A" },
    { name: "Food Delivery", color: "#059669" },
    { name: "Dine in", color: "#EA580C" },
    { name: "Entertainment", color: "#7C3AED" },
  ],
  travel: [
    { name: "Flights", color: "#0369A1" },
    { name: "Accommodation", color: "#7C3AED" },
    { name: "Food", color: "#EA580C" },
    { name: "Transport", color: "#0E9384" },
    { name: "Activities", color: "#16A34A" },
    { name: "Shopping", color: "#EC4899" },
    { name: "Other", color: "#64748B" },
  ],
  personal: [
    { name: "Food", color: "#EA580C" },
    { name: "Transport", color: "#0E9384" },
    { name: "Shopping", color: "#EC4899" },
    { name: "Health", color: "#16A34A" },
    { name: "Subscriptions", color: "#7C3AED" },
    { name: "Other", color: "#64748B" },
  ],
  blank: [],
};

export async function seedCategories(ledgerId, template = "household") {
  const rows = (TEMPLATES[template] ?? TEMPLATES.household)
    .map((c, i) => ({ ...toRowCategory(c, i), ledger_id: ledgerId }));
  if (!rows.length) return;
  // upsert on (ledger_id, name) so concurrent first-loads (StrictMode, or Tommy
  // and Wing at once) can't double-seed. Needs that unique constraint — see schema.
  const { error } = await supabase
    .from("categories")
    .upsert(rows, { onConflict: "ledger_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

// Diff the edited list against what was loaded: delete removed, insert new
// (client temp ids aren't uuids), update the rest.
export async function persistCategories(newList, oldList, ledgerId) {
  const newIds = new Set(newList.map((c) => c.id));
  const toDelete = oldList.filter((c) => !newIds.has(c.id)).map((c) => c.id);
  if (toDelete.length) {
    const { error } = await supabase.from("categories").delete().in("id", toDelete);
    if (error) throw error;
  }
  const toInsert = newList
    .filter((c) => !isUuid(c.id))
    .map((c, i) => ({ ...toRowCategory(c, i), ledger_id: ledgerId }));
  if (toInsert.length) {
    const { error } = await supabase.from("categories").insert(toInsert);
    if (error) throw error;
  }
  for (const c of newList.filter((c) => isUuid(c.id))) {
    const { error } = await supabase.from("categories").update(toRowCategory(c)).eq("id", c.id);
    if (error) throw error;
  }
  return fetchCategories(ledgerId);
}

/* ---- remembered shops ---- */
export async function fetchMerchants(ledgerId) {
  const { data, error } = await supabase
    .from("merchants").select("id, name").eq("ledger_id", ledgerId).order("name");
  if (error) throw error;
  return data;
}

// Only ever called from an explicit tick in the form — never inferred from use.
// Ignores duplicates so re-ticking a shop you already kept isn't an error.
export async function rememberMerchant(ledgerId, name) {
  const { error } = await supabase
    .from("merchants")
    .upsert({ ledger_id: ledgerId, name }, { onConflict: "ledger_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

export async function persistMerchants(newList, oldList, ledgerId) {
  const newIds = new Set(newList.map((m) => m.id));
  const toDelete = oldList.filter((m) => !newIds.has(m.id)).map((m) => m.id);
  if (toDelete.length) {
    const { error } = await supabase.from("merchants").delete().in("id", toDelete);
    if (error) throw error;
  }
  const toInsert = newList.filter((m) => !isUuid(m.id)).map((m) => ({ name: m.name, ledger_id: ledgerId }));
  if (toInsert.length) {
    const { error } = await supabase.from("merchants").insert(toInsert);
    if (error) throw error;
  }
  for (const m of newList.filter((m) => isUuid(m.id))) {
    const { error } = await supabase.from("merchants").update({ name: m.name }).eq("id", m.id);
    if (error) throw error;
  }
  return fetchMerchants(ledgerId);
}

/* ---- budgets: one figure per category per month ---- */
// `month` is the app's "YYYY-MM"; the column stores the first of that month.
const monthToDate = (month) => `${month}-01`;
export const budgetKey = (month, categoryId) => `${month}|${categoryId}`;

export async function fetchBudgets(ledgerId) {
  const { data, error } = await supabase
    .from("budgets").select("month, amount, category_id").eq("ledger_id", ledgerId);
  if (error) throw error;
  return new Map(data.map((r) => [budgetKey(String(r.month).slice(0, 7), r.category_id), Number(r.amount)]));
}

// Clearing the field removes the row rather than storing a 0 budget, so
// "no budget set" and "budget of nothing" stay distinguishable.
export async function setBudget(ledgerId, categoryId, month, amount) {
  if (amount == null || amount === "") {
    const { error } = await supabase
      .from("budgets").delete()
      .eq("ledger_id", ledgerId).eq("category_id", categoryId).eq("month", monthToDate(month));
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("budgets").upsert(
    { ledger_id: ledgerId, category_id: categoryId, month: monthToDate(month), amount: Number(amount) },
    { onConflict: "category_id,month" },
  );
  if (error) throw error;
}

/* ---- realtime ---- */
// Postgres filters can't be applied to DELETEs (the old row isn't sent), so this
// stays unfiltered and the caller refetches its own ledger. Cheap at this scale.
export function subscribeLedger(onChange) {
  const ch = supabase
    .channel("ledger-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ledger_members" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "budgets" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "merchants" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
export function subscribeLedgerList(onChange) {
  const ch = supabase
    .channel("ledgers-list")
    .on("postgres_changes", { event: "*", schema: "public", table: "ledgers" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
