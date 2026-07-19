// Run: node src/lib/settle.test.js
import assert from "node:assert/strict";
import { netBalances, settlements } from "./settle.js";

const M = (...names) => names.map((n) => ({ id: n, name: n }));
// shared(payer, amount, ...whoShares) — the payer is not automatically included.
const shared = (paidById, amount, ...sharedWith) => ({ paidById, amount, split: "shared", sharedWith });
const personal = (paidById, amount) => ({ paidById, amount, split: "personal" });
const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

// --- two members: the classic case the app started with ---
{
  const ms = M("t", "w");
  const net = netBalances([shared("t", 100, "t", "w")], ms);
  assert.equal(net.get("t"), 50, "payer is owed half");
  assert.equal(net.get("w"), -50, "other owes half");

  assert.deepEqual(settlements([shared("t", 100, "t", "w")], ms), [{ fromId: "w", toId: "t", amount: 50 }]);
}

// --- personal expenses never move money ---
{
  const ms = M("t", "w");
  assert.deepEqual(settlements([personal("t", 80)], ms), []);
  const mixed = settlements([personal("t", 80), shared("t", 100, "t", "w")], ms);
  assert.deepEqual(mixed, [{ fromId: "w", toId: "t", amount: 50 }], "personal ignored");
}

// --- three members, everyone in ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 90, "a", "b", "c")], ms);
  assert.equal(net.get("a"), 60, "paid 90, owes 30");
  assert.equal(net.get("b"), -30);
  assert.equal(net.get("c"), -30);

  const s = settlements([shared("a", 90, "a", "b", "c")], ms);
  assert.equal(s.length, 2, "two debtors, two transfers");
  assert.ok(s.every((x) => x.toId === "a"));
  assert.equal(sum(s.map((x) => x.amount)), 60);
}

// --- a subset shares it: c wasn't there ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 90, "a", "b")], ms);
  assert.equal(net.get("a"), 45, "split two ways, not three");
  assert.equal(net.get("b"), -45);
  assert.equal(net.get("c"), 0, "absent member owes nothing");

  assert.deepEqual(settlements([shared("a", 90, "a", "b")], ms), [{ fromId: "b", toId: "a", amount: 45 }]);
}

// --- the payer isn't always one of the sharers ---
{
  const ms = M("a", "b", "c");
  const net = netBalances([shared("a", 60, "b", "c")], ms);
  assert.equal(net.get("a"), 60, "covered it without eating — owed the lot");
  assert.equal(net.get("b"), -30);
  assert.equal(net.get("c"), -30);
}

// --- three members who each paid the same: nothing to settle ---
{
  const ms = M("a", "b", "c");
  const all = ["a", "b", "c"];
  const s = settlements([shared("a", 30, ...all), shared("b", 30, ...all), shared("c", 30, ...all)], ms);
  assert.deepEqual(s, [], "already square");
}

// --- conservation: what leaves debtors equals what reaches creditors ---
{
  const ms = M("a", "b", "c", "d");
  const exps = [
    shared("a", 120, "a", "b", "c", "d"),
    shared("b", 40, "b", "c"),
    personal("c", 500),
    shared("d", 8, "a", "d"),
  ];
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

// --- edge cases that would otherwise crash or quietly mis-split ---
{
  assert.deepEqual(settlements([], M("a", "b")), [], "no expenses");
  assert.deepEqual(settlements([shared("a", 10, "a", "b")], []), [], "no members");
  assert.deepEqual(
    settlements([shared("ghost", 10, "a", "b")], M("a", "b")),
    [],
    "payer removed from the ledger is skipped, not counted",
  );
  assert.deepEqual(
    settlements([shared("a", 10)], M("a", "b")),
    [],
    "shared with nobody is skipped rather than divided by zero",
  );
  assert.deepEqual(
    settlements([shared("a", 10, "a", "ghost")], M("a", "b")),
    [],
    "unknown sharer dropped; a paying only for itself owes nothing",
  );
}

console.log("settle.js: all checks passed");
