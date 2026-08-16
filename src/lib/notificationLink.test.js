// Run: node src/lib/notificationLink.test.js
import assert from "node:assert";
import { notificationUrl, notificationTarget, parseNotificationUrl } from "./notificationLink.js";

const LED = "11111111-1111-1111-1111-111111111111";
const EXP = "22222222-2222-2222-2222-222222222222";

// Inventory is scoped to a household ledger (migration 043) — the link
// carries it like every other source, so the tap opens the right household.
// (A null ledger shouldn't happen any more — the column is NOT NULL as of
// 043 — but notificationTarget still degrades to an unscoped inventory link
// rather than routing nowhere, same as before.)
assert.equal(notificationUrl({ inventory_item_id: 7, ledger_id: LED }), `/?ledger=${LED}&view=inventory`);
assert.equal(notificationUrl({ inventory_item_id: 7, ledger_id: null }), "/?view=inventory");

assert.equal(notificationUrl({ recurring_rule_id: "r1", ledger_id: LED }), `/?ledger=${LED}&view=recurring`);
assert.equal(notificationUrl({ expense_id: EXP, ledger_id: LED }), `/?ledger=${LED}&view=ledger&expense=${EXP}`);

// A ledger-scoped source with no ledger can't be routed — home, not a broken link.
assert.equal(notificationUrl({ expense_id: EXP, ledger_id: null }), "/");
assert.equal(notificationUrl({}), "/");

// A plain visit is not a deep link, so the caller keeps its normal boot path.
assert.equal(parseNotificationUrl(""), null);
assert.equal(parseNotificationUrl("?invite=abc"), null);

// The in-app bell's half, on app-shaped (camelCase) rows.
assert.deepEqual(notificationTarget({ inventoryItemId: 7, ledgerId: LED }), { view: "inventory", ledgerId: LED, expenseId: null });
assert.deepEqual(notificationTarget({ recurringRuleId: "r1", ledgerId: LED }), { view: "recurring", ledgerId: LED, expenseId: null });
assert.deepEqual(notificationTarget({ expenseId: EXP, ledgerId: LED }), { view: "ledger", ledgerId: LED, expenseId: EXP });
// Nothing routable — the bell leaves these as plain, unclickable rows.
assert.equal(notificationTarget({ expenseId: EXP, ledgerId: null }), null);
assert.equal(notificationTarget({ ledgerId: LED }), null);
assert.equal(notificationTarget({}), null);

// Round-trip: what the server builds is what the client reads back.
const roundTrip = (n) => parseNotificationUrl(notificationUrl(n).replace("/", ""));
assert.deepEqual(roundTrip({ inventory_item_id: 7, ledger_id: LED }), { view: "inventory", ledgerId: LED, expenseId: null });
assert.deepEqual(roundTrip({ recurring_rule_id: "r1", ledger_id: LED }), { view: "recurring", ledgerId: LED, expenseId: null });
assert.deepEqual(roundTrip({ expense_id: EXP, ledger_id: LED }), { view: "ledger", ledgerId: LED, expenseId: EXP });

console.log("notificationLink.js: all checks passed");
