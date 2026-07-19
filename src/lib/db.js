import { supabase } from "./supabase";

/* ---- mappers: DB (snake_case) <-> app (camelCase) ---- */
const toAppCategory = (r) => ({
  id: r.id, name: r.name, nameZh: r.name_zh || r.name, color: r.color, budget: r.monthly_budget,
});
const toRowCategory = (c, sortOrder) => ({
  name: c.name,
  name_zh: c.nameZh || null,
  color: c.color,
  monthly_budget: c.budget ?? null,
  ...(sortOrder != null ? { sort_order: sortOrder } : {}),
});
const toAppExpense = (r) => ({
  id: r.id, description: r.description, amount: Number(r.amount), categoryId: r.category_id,
  date: r.transaction_date, note: r.note || "", paidBy: r.paid_by,
  split: r.split_type === "shared_50" ? "shared" : "personal", receiptUrl: r.receipt_url || null,
});
const toRowExpense = (e) => ({
  description: e.description,
  amount: Number(e.amount),
  category_id: e.categoryId,
  transaction_date: e.date,
  note: e.note || null,
  paid_by: e.paidBy,
  split_type: e.split === "shared" ? "shared_50" : "personal",
});
const isUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);

/* ---- reads ---- */
export async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("sort_order");
  if (error) throw error;
  return data.map(toAppCategory);
}
export async function fetchExpenses() {
  const { data, error } = await supabase
    .from("expenses").select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toAppExpense);
}

/* ---- expense writes ---- */
export async function insertExpense(e) {
  const { error } = await supabase.from("expenses").insert(toRowExpense(e));
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

/* ---- category writes ---- */
const DEFAULTS = [
  { name: "Rent+Utilities", nameZh: "租金水電", color: "#475569" },
  { name: "Household", nameZh: "家居用品", color: "#EC4899" },
  { name: "Grocery", nameZh: "買餸", color: "#16A34A" },
  { name: "Ubereats/doordash", nameZh: "外賣", color: "#059669" },
  { name: "Entertainment", nameZh: "娛樂", color: "#7C3AED" },
  { name: "Dine in", nameZh: "堂食", color: "#EA580C" },
  { name: "Mochi", nameZh: "Mochi", color: "#D97706" },
];
export async function seedDefaultCategories() {
  const rows = DEFAULTS.map((c, i) => toRowCategory(c, i));
  const { error } = await supabase.from("categories").insert(rows);
  if (error) throw error;
}

// Diff the edited list against what was loaded: delete removed, insert new
// (client temp ids aren't uuids), update the rest.
export async function persistCategories(newList, oldList) {
  const newIds = new Set(newList.map((c) => c.id));
  const toDelete = oldList.filter((c) => !newIds.has(c.id)).map((c) => c.id);
  if (toDelete.length) {
    const { error } = await supabase.from("categories").delete().in("id", toDelete);
    if (error) throw error;
  }
  const toInsert = newList.filter((c) => !isUuid(c.id)).map((c, i) => toRowCategory(c, i));
  if (toInsert.length) {
    const { error } = await supabase.from("categories").insert(toInsert);
    if (error) throw error;
  }
  for (const c of newList.filter((c) => isUuid(c.id))) {
    const { error } = await supabase.from("categories").update(toRowCategory(c)).eq("id", c.id);
    if (error) throw error;
  }
  return fetchCategories();
}

/* ---- realtime: fire onChange whenever either table changes ---- */
export function subscribeLedger(onChange) {
  const ch = supabase
    .channel("ledger-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
