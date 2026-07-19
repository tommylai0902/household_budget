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
const toAppMember = (r) => ({ id: r.id, name: r.name, color: r.color });
const toRowMember = (m, sortOrder) => ({
  name: m.name,
  color: m.color,
  ...(sortOrder != null ? { sort_order: sortOrder } : {}),
});
const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);

/* ---- ledgers ---- */
export async function fetchLedgers() {
  const { data, error } = await supabase.from("ledgers").select("*").order("sort_order").order("created_at");
  if (error) throw error;
  return data.map((r) => ({ id: r.id, name: r.name }));
}
// Seeds at creation time rather than lazily on first open, so the "blank"
// template stays blank instead of being backfilled with defaults.
export async function createLedger(name, template = "household") {
  const { data, error } = await supabase.from("ledgers").insert({ name }).select().single();
  if (error) throw error;
  await Promise.all([seedCategories(data.id, template), seedMembers(data.id)]);
  return { id: data.id, name: data.name };
}
export async function renameLedger(id, name) {
  const { error } = await supabase.from("ledgers").update({ name }).eq("id", id);
  if (error) throw error;
}
// Categories and expenses cascade with the ledger (see schema), so this is a
// full teardown — the UI confirms before calling it.
export async function deleteLedger(id) {
  const { error } = await supabase.from("ledgers").delete().eq("id", id);
  if (error) throw error;
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
  const { data, error } = await supabase
    .from("expenses").select("*").eq("ledger_id", ledgerId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toAppExpense);
}

/* ---- expense writes ---- */
export async function insertExpense(e, ledgerId) {
  const { error } = await supabase.from("expenses").insert({ ...toRowExpense(e), ledger_id: ledgerId });
  if (error) throw error;
}
export async function updateExpense(id, e) {
  const { error } = await supabase.from("expenses").update(toRowExpense(e)).eq("id", id);
  if (error) throw error;
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

/* ---- realtime ---- */
// Postgres filters can't be applied to DELETEs (the old row isn't sent), so this
// stays unfiltered and the caller refetches its own ledger. Cheap at this scale.
export function subscribeLedger(onChange) {
  const ch = supabase
    .channel("ledger-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "ledger_members" }, onChange)
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
