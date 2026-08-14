// Where tapping a push notification should land.
//
// Both halves live here so they can't drift apart: api/send-reminders.js
// builds the URL into the push payload, sw.js opens it, and BudgetApp.jsx
// parses it back out on boot to route the app.
//
// A notification row carries exactly one of three source ids (migrations 017 /
// 032 / 033), and each one has its own home in the UI:
//   inventory_item_id  -> Inventory Hub, in the household ledger that owns it
//                         (migration 043 — carries a real ledger_id again)
//   recurring_rule_id  -> that ledger's Recurring panel
//   expense_id         -> that expense's detail panel, in its own ledger

// Takes an app-shaped notification (camelCase, as fetchNotifications returns
// them) and says where it points, or null if it points nowhere routable.
// The in-app bell navigates straight to this; notificationUrl below is the
// same answer encoded for a push payload, so the two can never disagree.
export function notificationTarget(n) {
  if (n.inventoryItemId) return { view: "inventory", ledgerId: n.ledgerId, expenseId: null };
  if (!n.ledgerId) return null;
  if (n.recurringRuleId) return { view: "recurring", ledgerId: n.ledgerId, expenseId: null };
  if (n.expenseId) return { view: "ledger", ledgerId: n.ledgerId, expenseId: n.expenseId };
  return null;
}

// Takes a raw DB row (snake_case — this one is called server-side, straight
// off a Supabase select).
export function notificationUrl(row) {
  const target = notificationTarget({
    inventoryItemId: row.inventory_item_id,
    ledgerId: row.ledger_id,
    recurringRuleId: row.recurring_rule_id,
    expenseId: row.expense_id,
  });
  if (!target) return "/";
  const p = new URLSearchParams();
  if (target.ledgerId) p.set("ledger", target.ledgerId);
  p.set("view", target.view);
  if (target.expenseId) p.set("expense", target.expenseId);
  return `/?${p}`;
}

// Returns null for a normal visit (no `view` param), so the caller can tell
// "opened from a notification" from "opened the app" without a second flag.
export function parseNotificationUrl(search) {
  const p = new URLSearchParams(search || "");
  const view = p.get("view");
  if (!view) return null;
  return { view, ledgerId: p.get("ledger"), expenseId: p.get("expense") };
}
