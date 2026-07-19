// Run: node src/lib/settle.test.js
import assert from "node:assert/strict";
import { netBalances, settlements } from "./settle.js";

const M = (...names) => names.map((n) => ({ id: n, name: n }));
const shared = (paidById, amount) => ({ paidById, amount, split: "shared" });
const personal = (paidById, amount) => ({ paidById, amount, split: "personal" });
const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

// --- two members: the classic case the app started with ---
{
  const ms = M("t", "w");
  const net = netBalances([shared("t", 100)], ms);
  assert.equal(net.get("t"), 50, "payer is owed half");
  assert.equal(net.get("w"), -50, "other owes half");

  const s = settlements([shared("t", 100)], ms);
  assert.deepEqual(s, [{ fromId: "w", toId: "t", amount: 50 }]);
}

// --- personal expenses never move money ---
{
  const ms = M("t", "w");
  assert.deepEqual(settlements([personal("t", 80)], ms), []);
  const mixed = settlements([personal("t", 80), shared("t", 100)], ms);
  assert.deepEqual(mixed, [{ fromId: "w", toId: "t", amount: 50 }], "personal ignored");
}

// --- three members: one person fronts the bill ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 90)], ms);
  assert.equal(net.get("a"), 60, "paid 90, owes 30");
  assert.equal(net.get("b"), -30);
  assert.equal(net.get("c"), -30);

  const s = settlements([shared("a", 90)], ms);
  assert.equal(s.length, 2, "two debtors, two transfers");
  assert.ok(s.every((x) => x.toId === "a"));
  assert.equal(sum(s.map((x) => x.amount)), 60);
}

// --- three members who each paid the same: nothing to settle ---
{
  const ms = M("a", "b", "c");
  const s = settlements([shared("a", 30), shared("b", 30), shared("c", 30)], ms);
  assert.deepEqual(s, [], "already square");
}

// --- conservation: what leaves debtors equals what reaches creditors ---
{
  const ms = M("a", "b", "c", "d");
  const exps = [shared("a", 120), shared("b", 40), personal("c", 500), shared("d", 8)];
  const net = netBalances(exps, ms);
  assert.ok(Math.abs(sum([...net.values()])) < 0.02, "net balances cancel out");

  const s = settlements(exps, ms);
  const out = new Map();
  for (const { fromId, toId, amount } of s) {
    out.set(fromId, (out.get(fromId) ?? 0) - amount);
    out.set(toId, (out.get(toId) ?? 0) + amount);
  }
  for (const m of ms) {
    assert.ok(
      Math.abs((out.get(m.id) ?? 0) - net.get(m.id)) < 0.02,
      `${m.id}: transfers must clear its balance`,
    );
  }
}

// --- edge cases that would otherwise crash ---
{
  assert.deepEqual(settlements([], M("a", "b")), [], "no expenses");
  assert.deepEqual(settlements([shared("a", 10)], []), [], "no members");
  assert.deepEqual(
    settlements([shared("ghost", 10)], M("a", "b")),
    [],
    "payer removed from the ledger is skipped, not counted",
  );
}

console.log("settle.js: all checks passed");
